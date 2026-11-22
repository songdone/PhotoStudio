//go:build linux || darwin

package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func writableNASFixture(t *testing.T, existing bool) (*siteHandler, string, string) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("save intentionally refuses root; execute as a package-like non-root user")
	}
	root := t.TempDir()
	file := filepath.Join(root, strings.TrimPrefix(savePath, "/"))
	if existing {
		writeFixture(t, root, savePath, "original")
	} else if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		t.Fatal(err)
	}
	site := testSite(t)
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) {
		return nasACL{Readable: true, Writable: true}, nil
	}}
	return site, root, file
}

func currentExpect(t *testing.T, file string) map[string]string {
	t.Helper()
	info, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	return map[string]string{expectSizeHeader: strconv.FormatInt(info.Size(), 10), expectMtimeHeader: strconv.FormatInt(info.ModTime().UnixNano(), 10), expectRevisionHeader: nasRevision(info)}
}

func assertNoNASTemp(t *testing.T, root string) {
	t.Helper()
	if err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if strings.HasPrefix(entry.Name(), ".photostudio-") {
			t.Errorf("leaked temp %s", entry.Name())
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func assertNASOriginal(t *testing.T, file string) {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil || string(data) != "original" {
		t.Fatalf("original changed: %q %v", data, err)
	}
}

type unreadNASBody struct{ reads int }

func (b *unreadNASBody) Read([]byte) (int, error) {
	b.reads++
	return 0, errors.New("unauthorized body read")
}
func (*unreadNASBody) Close() error { return nil }

func TestNASSaveACLFailClosedBeforeBody(t *testing.T) {
	for _, tc := range []struct {
		name   string
		check  aclChecker
		status int
		code   string
	}{
		{"missing", nil, 503, "authorization_unavailable"},
		{"no bits", func(context.Context, int64, string) (nasACL, error) { return nasACL{}, nil }, 403, "not_writable"},
		{"read only", func(context.Context, int64, string) (nasACL, error) { return nasACL{Readable: true}, nil }, 403, "not_writable"},
		{"target denied", func(_ context.Context, _ int64, p string) (nasACL, error) {
			return nasACL{Readable: true, Writable: p != savePath}, nil
		}, 403, "not_writable"},
		{"error", func(context.Context, int64, string) (nasACL, error) {
			return nasACL{Writable: true}, errors.New("private ACL")
		}, 503, "authorization_unavailable"},
		{"expired checker returns true", func(ctx context.Context, _ int64, _ string) (nasACL, error) {
			<-ctx.Done()
			return nasACL{Writable: true}, nil
		}, 503, "authorization_unavailable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			site, root, file := writableNASFixture(t, true)
			site.nas.checkACL = tc.check
			r := saveRequest(savePath, "ignored", currentExpect(t, file))
			body := &unreadNASBody{}
			r.Body = body
			if strings.HasPrefix(tc.name, "expired") {
				ctx, cancel := context.WithTimeout(r.Context(), 20*time.Millisecond)
				defer cancel()
				r = r.WithContext(ctx)
			}
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			expectProblem(t, w, tc.status, tc.code)
			if body.reads != 0 {
				t.Fatal("read body before authorization")
			}
			assertNASOriginal(t, file)
			assertNoNASTemp(t, root)
		})
	}
}

func TestNASSaveNewUsesOnlyParentACL(t *testing.T) {
	site, root, file := writableNASFixture(t, false)
	var paths []string
	site.nas.checkACL = func(_ context.Context, uid int64, p string) (nasACL, error) {
		if uid != int64(os.Geteuid()) {
			t.Errorf("UID=%d", uid)
		}
		paths = append(paths, p)
		return nasACL{Readable: true, Writable: p == filepath.Dir(savePath)}, nil
	}
	w := httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, saveBytes, nil))
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	for _, p := range paths {
		if p == savePath {
			t.Fatal("asked nonexistent target ACL")
		}
	}
	info, err := os.Stat(file)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("new mode %v %v", info, err)
	}
	assertNoNASTemp(t, root)
}

func TestNASSaveBadHeadersAndIdentityDoNotRead(t *testing.T) {
	cases := []struct {
		name   string
		modify func(*http.Request)
		status int
	}{
		{"marker missing", func(r *http.Request) { r.Header.Del("X-PhotoStudio-Request") }, 403},
		{"marker duplicate", func(r *http.Request) { r.Header.Add("X-PhotoStudio-Request", "1") }, 403},
		{"UID missing", func(r *http.Request) { r.Header.Del("X-Trim-Userid") }, 403},
		{"UID zero", func(r *http.Request) { r.Header.Set("X-Trim-Userid", "0") }, 403},
		{"UID duplicate", func(r *http.Request) { r.Header.Add("X-Trim-Userid", "1000") }, 403},
		{"UID overflow", func(r *http.Request) { r.Header.Set("X-Trim-Userid", "4294967295") }, 403},
		{"UID whitespace", func(r *http.Request) { r.Header.Set("X-Trim-Userid", " 1000") }, 403},
		{"cross origin", func(r *http.Request) { r.Header.Set("Origin", "https://else.invalid") }, 403},
		{"duplicate origin", func(r *http.Request) {
			r.Header.Add("Origin", "http://example.com")
			r.Header.Add("Origin", "https://evil.invalid")
		}, 403},
		{"same site", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "same-site") }, 403},
		{"navigation", func(r *http.Request) { r.Header.Set("Sec-Fetch-Mode", "navigate") }, 403},
		{"missing type", func(r *http.Request) { r.Header.Del("Content-Type") }, 400},
		{"wrong type", func(r *http.Request) { r.Header.Set("Content-Type", "image/png") }, 400},
		{"type params", func(r *http.Request) { r.Header.Set("Content-Type", "application/octet-stream; charset=utf-8") }, 400},
		{"type duplicate", func(r *http.Request) { r.Header.Add("Content-Type", "application/octet-stream") }, 400},
		{"encoding gzip", func(r *http.Request) { r.Header.Set("Content-Encoding", "gzip") }, 400},
		{"encoding duplicate", func(r *http.Request) {
			r.Header.Add("Content-Encoding", "identity")
			r.Header.Add("Content-Encoding", "identity")
		}, 400},
		{"size only", func(r *http.Request) { r.Header.Set(expectSizeHeader, "8") }, 400},
		{"mtime only", func(r *http.Request) { r.Header.Set(expectMtimeHeader, "123") }, 400},
		{"revision only", func(r *http.Request) { r.Header.Set(expectRevisionHeader, strings.Repeat("a", 64)) }, 400},
		{"invalid mtime", func(r *http.Request) { r.Header.Set(expectSizeHeader, "8"); r.Header.Set(expectMtimeHeader, "1e18") }, 400},
		{"duplicate size", func(r *http.Request) {
			r.Header.Add(expectSizeHeader, "8")
			r.Header.Add(expectSizeHeader, "8")
			r.Header.Set(expectMtimeHeader, "123")
		}, 400},
		{"blind overwrite", func(r *http.Request) { r.Header.Set(overwriteHeader, "1") }, 400},
		{"illegal overwrite", func(r *http.Request) { r.Header.Set(overwriteHeader, "true") }, 400},
		{"trailers", func(r *http.Request) { r.Trailer = http.Header{expectSizeHeader: nil} }, 400},
		{"content length duplicate", func(r *http.Request) { r.Header.Add("Content-Length", "7"); r.Header.Add("Content-Length", "7") }, 400},
		{"too large declared", func(r *http.Request) { r.ContentLength = maxNASFile + 1 }, 413},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			site, root, _ := writableNASFixture(t, false)
			site.nas.checkACL = func(context.Context, int64, string) (nasACL, error) { t.Error("unexpected ACL"); return nasACL{}, nil }
			r := saveRequest(savePath, "ignored", nil)
			body := &unreadNASBody{}
			r.Body = body
			tc.modify(r)
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			if body.reads != 0 {
				t.Fatal("rejected request body read")
			}
			assertNoNASTemp(t, root)
		})
	}
}

type actionNASReader struct {
	reader io.Reader
	action func()
	once   sync.Once
}

func (b *actionNASReader) Read(p []byte) (int, error) { b.once.Do(b.action); return b.reader.Read(p) }
func (*actionNASReader) Close() error                 { return nil }

type partialNASReader struct{ read bool }

func (b *partialNASReader) Read(p []byte) (int, error) {
	if !b.read {
		b.read = true
		return copy(p, "partial"), nil
	}
	return 0, io.ErrUnexpectedEOF
}
func (*partialNASReader) Close() error { return nil }

type timeoutNASReader struct{}

func (timeoutNASReader) Read([]byte) (int, error) { return 0, os.ErrDeadlineExceeded }
func (timeoutNASReader) Close() error             { return nil }

func TestNASSaveEmptyPartialTimeoutCancelCleanup(t *testing.T) {
	for _, kind := range []string{"empty", "partial", "length mismatch", "timeout", "cancel", "blocked deadline"} {
		t.Run(kind, func(t *testing.T) {
			site, root, file := writableNASFixture(t, true)
			r := saveRequest(savePath, "edited", currentExpect(t, file))
			status, code := 400, "invalid_request"
			switch kind {
			case "empty":
				r.Body = io.NopCloser(strings.NewReader(""))
				r.ContentLength = -1
				code = "empty_body"
			case "partial":
				r.Body = &partialNASReader{}
				r.ContentLength = -1
			case "length mismatch":
				r.ContentLength = 100
			case "timeout":
				r.Body = timeoutNASReader{}
				status, code = 408, "upload_timeout"
			case "cancel":
				ctx, cancel := context.WithCancel(r.Context())
				defer cancel()
				r = r.WithContext(ctx)
				r.Body = &actionNASReader{reader: strings.NewReader("edited"), action: cancel}
			case "blocked deadline":
				ctx, cancel := context.WithTimeout(r.Context(), 40*time.Millisecond)
				defer cancel()
				r = r.WithContext(ctx)
				reader, writer := io.Pipe()
				defer writer.Close()
				r.Body = reader
				status, code = 408, "upload_timeout"
			}
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			if kind == "cancel" {
				if w.Body.Len() != 0 {
					t.Fatalf("canceled response %s", w.Body.String())
				}
			} else {
				expectProblem(t, w, status, code)
			}
			assertNASOriginal(t, file)
			assertNoNASTemp(t, root)
		})
	}
}

func TestNASSaveRejectsParentAndTargetReplacement(t *testing.T) {
	for _, kind := range []string{"parent ACL", "target ACL", "parent upload", "target upload", "permission upload", "new appears"} {
		t.Run(kind, func(t *testing.T) {
			existing := kind != "new appears"
			site, root, file := writableNASFixture(t, existing)
			var expected map[string]string
			if existing {
				expected = currentExpect(t, file)
			}
			parent := filepath.Dir(file)
			action := func() {
				switch {
				case strings.HasPrefix(kind, "parent"):
					if err := os.Rename(parent, parent+"-old"); err != nil {
						t.Fatal(err)
					}
					if err := os.Mkdir(parent, 0700); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(file, []byte("replacement"), 0600); err != nil {
						t.Fatal(err)
					}
				case strings.HasPrefix(kind, "target"):
					if err := os.Rename(file, file+".old"); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(file, []byte("replacement"), 0600); err != nil {
						t.Fatal(err)
					}
				case kind == "permission upload":
					if err := os.Chmod(file, 0400); err != nil {
						t.Fatal(err)
					}
				case kind == "new appears":
					if err := os.WriteFile(file, []byte("external"), 0600); err != nil {
						t.Fatal(err)
					}
				}
			}
			if strings.HasSuffix(kind, "ACL") {
				var once sync.Once
				site.nas.checkACL = func(_ context.Context, _ int64, p string) (nasACL, error) {
					if kind == "parent ACL" || p == savePath {
						once.Do(action)
					}
					return nasACL{Readable: true, Writable: true}, nil
				}
			}
			r := saveRequest(savePath, "edit", expected)
			if !strings.HasSuffix(kind, "ACL") {
				r.Body = &actionNASReader{reader: strings.NewReader("edit"), action: action}
			}
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			expectProblem(t, w, 409, "file_changed")
			if kind == "permission upload" {
				assertNASOriginal(t, file)
			} else {
				data, err := os.ReadFile(file)
				if err != nil || string(data) == "edit" {
					t.Fatalf("external replacement clobbered: %q %v", data, err)
				}
			}
			assertNoNASTemp(t, root)
		})
	}
}

func TestNASSaveRejectsLinksFIFOAndDirectories(t *testing.T) {
	for _, kind := range []string{"target symlink", "parent symlink", "FIFO", "hardlink", "directory"} {
		t.Run(kind, func(t *testing.T) {
			site, root, file := writableNASFixture(t, false)
			outside := writeFixture(t, t.TempDir(), savePath, "private")
			switch kind {
			case "target symlink":
				if err := os.Symlink(outside, file); err != nil {
					t.Fatal(err)
				}
			case "parent symlink":
				if err := os.Remove(filepath.Dir(file)); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(filepath.Dir(outside), filepath.Dir(file)); err != nil {
					t.Fatal(err)
				}
			case "FIFO":
				if err := unix.Mkfifo(file, 0600); err != nil {
					t.Fatal(err)
				}
			case "hardlink":
				if err := os.Link(outside, file); err != nil {
					t.Fatal(err)
				}
			case "directory":
				if err := os.Mkdir(file, 0700); err != nil {
					t.Fatal(err)
				}
			}
			r := saveRequest(savePath, "edit", nil)
			body := &unreadNASBody{}
			r.Body = body
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			expectProblem(t, w, 400, "invalid_path")
			if body.reads != 0 {
				t.Fatal("special file upload read")
			}
			assertNoNASTemp(t, root)
			data, err := os.ReadFile(outside)
			if err != nil || string(data) != "private" {
				t.Fatal("link followed")
			}
		})
	}
}

func TestNASSavePackageModesAndMetadataPreserved(t *testing.T) {
	for _, kind := range []string{"target no write", "parent no write", "parent no read", "success"} {
		t.Run(kind, func(t *testing.T) {
			site, root, file := writableNASFixture(t, true)
			if err := os.Chmod(file, 0640); err != nil {
				t.Fatal(err)
			}
			if err := unix.Setxattr(file, "user.photostudio-test", []byte("metadata"), 0); err != nil {
				t.Fatal(err)
			}
			if err := unix.Setxattr(file, "user.photostudio-empty", []byte{}, 0); err != nil {
				t.Fatal(err)
			}
			expected := currentExpect(t, file)
			before, err := os.Stat(file)
			if err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "target no write":
				os.Chmod(file, 0440)
				expected = currentExpect(t, file)
			case "parent no write":
				os.Chmod(filepath.Dir(file), 0500)
				defer os.Chmod(filepath.Dir(file), 0700)
			case "parent no read":
				os.Chmod(filepath.Dir(file), 0300)
				defer os.Chmod(filepath.Dir(file), 0700)
			}
			w := httptest.NewRecorder()
			site.ServeHTTP(w, saveRequest(savePath, "edit", expected))
			if kind != "success" {
				expectProblem(t, w, 403, "not_writable")
				assertNASOriginal(t, file)
			} else {
				if w.Code != 200 {
					t.Fatalf("%d %s", w.Code, w.Body.String())
				}
				after, err := os.Stat(file)
				if err != nil {
					t.Fatal(err)
				}
				a, b := nasInfoMetadata(before), nasInfoMetadata(after)
				if a.uid != b.uid || a.gid != b.gid || a.mode != b.mode {
					t.Fatalf("permissions changed %#v %#v", a, b)
				}
				buf := make([]byte, 32)
				n, err := unix.Getxattr(file, "user.photostudio-test", buf)
				if err != nil || string(buf[:n]) != "metadata" {
					t.Fatal("xattr lost")
				}
			}
			if kind == "parent no read" {
				os.Chmod(filepath.Dir(file), 0700)
			}
			assertNoNASTemp(t, root)
		})
	}
}

func TestNASSavePrecisionConfirmationAndNextExpect(t *testing.T) {
	site, root, file := writableNASFixture(t, true)
	exact := time.Unix(1_790_000_000, 123456789)
	if err := os.Chtimes(file, exact, exact); err != nil {
		t.Fatal(err)
	}
	head := httptest.NewRecorder()
	site.ServeHTTP(head, fixtureRequest("HEAD", fixtureTarget(savePath)))
	if head.Code != 200 || head.Header().Get(mtimeHeader) != strconv.FormatInt(exact.UnixNano(), 10) || !validNASRevision(head.Header().Get(revisionHeader)) {
		t.Fatalf("precision %d %v", head.Code, head.Header())
	}
	old := currentExpect(t, file)
	if err := os.WriteFile(file, []byte("different"), 0600); err != nil {
		t.Fatal(err)
	} // original is 8 bytes, use same-size below.
	if err := os.WriteFile(file, []byte("modified"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(file, exact.Add(time.Nanosecond), exact.Add(time.Nanosecond)); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "edit", old))
	expectProblem(t, w, 409, "file_changed")
	var conflict struct {
		Current *nasSavedStat `json:"current"`
	}
	if json.Unmarshal(w.Body.Bytes(), &conflict) != nil || conflict.Current == nil {
		t.Fatal("no authorized conflict metadata")
	}
	confirmed := map[string]string{expectSizeHeader: strconv.FormatInt(conflict.Current.Size, 10), expectMtimeHeader: conflict.Current.Mtime, expectRevisionHeader: conflict.Current.Revision, overwriteHeader: "1"}
	if err := os.WriteFile(file, []byte("again!!!"), 0600); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "edit", confirmed))
	expectProblem(t, w, 409, "file_changed")
	fresh := currentExpect(t, file)
	fresh[overwriteHeader] = "1"
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "saved", fresh))
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	var result struct {
		Saved bool `json:"saved"`
		nasSavedStat
	}
	if json.Unmarshal(w.Body.Bytes(), &result) != nil || !result.Saved || result.Mtime == "" {
		t.Fatal("non-string successful stat")
	}
	next := map[string]string{expectSizeHeader: strconv.FormatInt(result.Size, 10), expectMtimeHeader: result.Mtime, expectRevisionHeader: result.Revision}
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "next", next))
	if w.Code != 200 {
		t.Fatalf("next expect unusable %d %s", w.Code, w.Body.String())
	}
	assertNoNASTemp(t, root)
}

func TestNASSaveConflictStatRequiresReadable(t *testing.T) {
	site, root, file := writableNASFixture(t, true)
	site.nas.checkACL = func(context.Context, int64, string) (nasACL, error) { return nasACL{Writable: true}, nil }
	w := httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "edit", nil))
	expectProblem(t, w, 409, "file_changed")
	if strings.Contains(w.Body.String(), "current") || strings.Contains(w.Body.String(), "size") {
		t.Fatal("unreadable conflict stat leaked")
	}
	assertNASOriginal(t, file)
	assertNoNASTemp(t, root)
}

func TestNASSaveNoClobberPrimitiveAndConcurrentCreate(t *testing.T) {
	dir := t.TempDir()
	if os.Geteuid() == 0 {
		t.Skip("non-root")
	}
	parent, err := os.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer parent.Close()
	os.WriteFile(filepath.Join(dir, "temp"), []byte("new"), 0600)
	os.WriteFile(filepath.Join(dir, "target"), []byte("external"), 0600)
	if err := renameNASNoReplace(int(parent.Fd()), "temp", "target"); !errors.Is(err, unix.EEXIST) {
		t.Fatalf("no-clobber %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "target"))
	if string(data) != "external" {
		t.Fatal("no-clobber replaced existing")
	}
	site, root, file := writableNASFixture(t, false)
	var wg sync.WaitGroup
	statuses := make(chan int, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := httptest.NewRecorder()
			site.ServeHTTP(w, saveRequest(savePath, saveBytes, nil))
			statuses <- w.Code
		}()
	}
	wg.Wait()
	close(statuses)
	success := 0
	for status := range statuses {
		if status == 200 {
			success++
		} else if status != 409 {
			t.Errorf("concurrent status %d", status)
		}
	}
	if success != 1 {
		t.Fatalf("created %d times", success)
	}
	data, _ = os.ReadFile(file)
	if string(data) != saveBytes {
		t.Fatal("bad concurrent target")
	}
	assertNoNASTemp(t, root)
}

type infiniteNASReader struct{ remaining int64 }

func (b *infiniteNASReader) Read(p []byte) (int, error) {
	if b.remaining == 0 {
		return 0, io.EOF
	}
	n := int64(len(p))
	if n > b.remaining {
		n = b.remaining
	}
	b.remaining -= n
	return int(n), nil
}

type shortNASWriter struct{}

func (shortNASWriter) Write(p []byte) (int, error) { return len(p) - 1, nil }

func TestNASStreamLimitAndShortWrite(t *testing.T) {
	size, err := streamNASBody(context.Background(), io.Discard, &infiniteNASReader{maxNASFile + 1}, -1)
	if !errors.Is(err, errFileTooLarge) || size > maxNASFile {
		t.Fatalf("limit %d %v", size, err)
	}
	_, err = streamNASBody(context.Background(), shortNASWriter{}, strings.NewReader("some bytes"), -1)
	if !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("short write %v", err)
	}
	site, root, file := writableNASFixture(t, true)
	r := saveRequest(savePath, "unused", currentExpect(t, file))
	r.ContentLength = -1
	r.Body = io.NopCloser(&infiniteNASReader{maxNASFile + 1})
	w := httptest.NewRecorder()
	site.ServeHTTP(w, r)
	expectProblem(t, w, 413, "file_too_large")
	assertNASOriginal(t, file)
	assertNoNASTemp(t, root)
}

func TestNASSaveTCPAndMethodRefusal(t *testing.T) {
	site, root, file := writableNASFixture(t, true)
	site.nas.checkACL = func(context.Context, int64, string) (nasACL, error) {
		t.Error("TCP or method reached ACL")
		return nasACL{}, nil
	}
	for _, method := range []string{"GET", "HEAD", "PUT", "OPTIONS"} {
		w := httptest.NewRecorder()
		site.ServeHTTP(w, fixtureRequest(method, saveTarget(savePath)))
		if w.Code != 405 || w.Header().Get("Allow") != "POST" {
			t.Fatalf("%s %d", method, w.Code)
		}
	}
	server := httptest.NewServer(site)
	defer server.Close()
	r, _ := http.NewRequest("POST", server.URL+saveTarget(savePath), strings.NewReader("edit"))
	r.Header.Set("X-PhotoStudio-Request", "1")
	r.Header.Set("X-Trim-Userid", "1000")
	r.Header.Set("Content-Type", "application/octet-stream")
	res, err := server.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatalf("TCP %d", res.StatusCode)
	}
	assertNASOriginal(t, file)
	assertNoNASTemp(t, root)
}

func TestNASSaveDisconnectKeepsOriginal(t *testing.T) {
	site, root, file := writableNASFixture(t, true)
	socket := testSocket(t)
	listener, cleanup, err := listenGateway(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanup()
	completed := make(chan struct{})
	server := newHTTPServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(completed)
		site.ServeHTTP(w, r)
	}))
	defer server.Close()
	go server.Serve(listener)
	conn, err := net.Dial("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	expect := currentExpect(t, file)
	request := "POST " + saveTarget(savePath) + " HTTP/1.1\r\nHost: localhost\r\nX-PhotoStudio-Request: 1\r\nX-Trim-Userid: " + strconv.Itoa(os.Geteuid()) + "\r\nContent-Type: application/octet-stream\r\nContent-Length: 100\r\n" + expectSizeHeader + ": " + expect[expectSizeHeader] + "\r\n" + expectMtimeHeader + ": " + expect[expectMtimeHeader] + "\r\n\r\npartial"
	io.WriteString(conn, request)
	conn.Close()
	select {
	case <-completed:
	case <-time.After(3 * time.Second):
		t.Fatal("disconnected upload handler did not finish")
	}
	server.Close()
	assertNASOriginal(t, file)
	assertNoNASTemp(t, root)
}

func TestNASPermissionOwnerMismatchRefuses(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "permissions")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	before, err := nasMetadataFD(file)
	if err != nil {
		t.Fatal(err)
	}
	before.uid++
	if err := preserveNASPermissions(file, before, map[string][]byte{}); !errors.Is(err, errNASUnsupportedPermissions) {
		t.Fatalf("owner mismatch %v", err)
	}
}

func TestNASDefaultMountAndFDLeak(t *testing.T) {
	if normalizedNASMount("") != "/" {
		t.Fatal("default mount")
	}
	root, err := openNASParentDir("", nil)
	if err != nil {
		t.Fatal(err)
	}
	root.Close()
	base := t.TempDir()
	writeFixture(t, base, savePath, "original")
	countFD := func() int {
		path := "/dev/fd"
		if _, err := os.Stat("/proc/self/fd"); err == nil {
			path = "/proc/self/fd"
		}
		entries, err := os.ReadDir(path)
		if err != nil {
			t.Fatal(err)
		}
		return len(entries)
	}
	before := countFD()
	for i := 0; i < 100; i++ {
		p, err := pinNASSave(base, strings.TrimPrefix(savePath, "/"))
		if err != nil {
			t.Fatal(err)
		}
		p.close()
	}
	after := countFD()
	if after > before+2 {
		t.Fatalf("FD leak before=%d after=%d", before, after)
	}
}

func TestNASRevisionDetectsSameSizeMtimeReplacement(t *testing.T) {
	_, _, file := writableNASFixture(t, true)
	before, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	old := nasRevision(before)
	os.Rename(file, file+".old")
	os.WriteFile(file, []byte("original"), 0600)
	os.Chtimes(file, before.ModTime(), before.ModTime())
	after, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	if before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) || old == nasRevision(after) {
		t.Fatal("revision missed identity change")
	}
}

func TestNASUploadDeadlinesBounded(t *testing.T) {
	if nasUploadTimeout <= 0 || nasUploadTimeout > 120*time.Second || nasResponseTimeout <= 0 || nasResponseTimeout > 60*time.Second {
		t.Fatal("unbounded upload")
	}
	server := newHTTPServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	if server.ReadTimeout <= 0 || server.WriteTimeout <= 0 {
		t.Fatal("global deadlines disabled")
	}
}
