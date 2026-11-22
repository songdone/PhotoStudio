package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func testSocket(t *testing.T) string {
	t.Helper()
	// Use a short name for the Unix socket length limit on macOS.
	dir, err := os.MkdirTemp("", "ps-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socket, err := filepath.Abs(filepath.Join(dir, "s"))
	if err != nil {
		t.Fatal(err)
	}
	return socket
}

func clientOverUnix(t *testing.T, socket string) *http.Client {
	t.Helper()
	dialer := &net.Dialer{}
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return dialer.DialContext(ctx, "unix", socket)
	}}
	t.Cleanup(transport.CloseIdleConnections)
	return &http.Client{Transport: transport, Timeout: 3 * time.Second}
}

const fixturePath = "/vol1/1000/照片/海报 + 100%.SVG"
const fixtureBytes = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>"

func fixtureTarget(path string) string {
	return gatewayPrefix + "/api/nas-file?" + url.Values{"path": {path}}.Encode()
}

func writeFixture(t *testing.T, root, name string, data string) string {
	t.Helper()
	file := filepath.Join(root, strings.TrimPrefix(name, "/"))
	if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	return file
}

func fixtureRequest(method, target string) *http.Request {
	r := httptest.NewRequest(method, target, nil)
	r.Header.Set("X-PhotoStudio-Request", "1")
	r.Header.Set("X-Trim-Userid", "1000")
	return r.WithContext(context.WithValue(r.Context(), gatewayConnKey{}, true))
}

func expectProblem(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var problem struct{ Code string }
	if w.Code != status || json.Unmarshal(w.Body.Bytes(), &problem) != nil || problem.Code != code {
		t.Fatalf("status=%d body=%q; want %d (%s)", w.Code, w.Body.String(), status, code)
	}
	if strings.Contains(w.Body.String(), "/vol") || strings.Contains(w.Body.String(), fixtureBytes) {
		t.Fatal("private path or bytes in error response")
	}
}

func TestParseNASPath(t *testing.T) {
	for _, value := range []string{fixturePath, "/vol12/图.png", "/vol2/photo%2F.png"} {
		if name, err := parseNASPath(value); err != nil || "/"+name != value {
			t.Errorf("valid path %q: %q, %v", value, name, err)
		}
	}
	for _, value := range []string{"", "/etc/diagram.png", "/vol0/a.png", "/vol01/a.png", "/vol1/a/../b.png", "/vol1/./b.png", "/vol1/.hidden/a.png", "/vol1/a\\b.png", "/vol1//a.png", "/vol1/a.png/", "/vol1/a.mp4", "/vol1/a\x00.png", "/vol1/a\n.png", "/vol1/a\u0085.png", "/vol1/\xff.png", "/vol1/" + strings.Repeat("a", 4096) + ".png"} {
		if _, err := parseNASPath(value); err == nil {
			t.Errorf("accepted invalid path %q", value)
		}
	}
}

func TestNASReadAfterACL(t *testing.T) {
	site := testSite(t)
	root := t.TempDir()
	writeFixture(t, root, fixturePath, fixtureBytes)
	calls := 0
	site.nas = nasService{mountDir: root, checkACL: func(_ context.Context, uid int64, path string) (nasACL, error) {
		calls++
		if uid != 1000 || path != fixturePath {
			t.Errorf("file request changed user or path: %d %q", uid, path)
		}
		return nasACL{Readable: true}, nil
	}}
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		w := httptest.NewRecorder()
		site.ServeHTTP(w, fixtureRequest(method, fixtureTarget(fixturePath)))
		kind, params, err := mime.ParseMediaType(w.Header().Get("Content-Disposition"))
		if w.Code != http.StatusOK || err != nil || kind != "attachment" || params["filename"] != filepath.Base(fixturePath) || w.Header().Get("Content-Type") != "application/octet-stream" || w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Cache-Control") != "private, no-store" || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("%s: status=%d headers=%v", method, w.Code, w.Header())
		}
		want := fixtureBytes
		if method == http.MethodHead {
			want = ""
		}
		if w.Body.String() != want {
			t.Fatalf("%s returned the wrong bytes", method)
		}
	}
	if calls != 2 {
		t.Fatalf("ACL checks=%d, want 2", calls)
	}
}

func TestNASReadDeniesWithoutACLApproval(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, fixturePath, fixtureBytes)
	site := testSite(t)
	for _, tc := range []struct {
		name string
		acl  aclChecker
		want int
		code string
	}{
		{"no checker", nil, 503, "authorization_unavailable"},
		{"denied", func(context.Context, int64, string) (nasACL, error) { return nasACL{Readable: false}, nil }, 403, "access_denied"},
		{"ACL unavailable", func(context.Context, int64, string) (nasACL, error) {
			return nasACL{}, errors.New("synthetic private diagnostic")
		}, 503, "authorization_unavailable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			site.nas = nasService{mountDir: root, checkACL: tc.acl}
			for _, name := range []string{fixturePath, "/vol1/1000/missing.png"} {
				w := httptest.NewRecorder()
				site.ServeHTTP(w, fixtureRequest("GET", fixtureTarget(name)))
				expectProblem(t, w, tc.want, tc.code)
				if strings.Contains(w.Body.String(), "synthetic") || w.Header().Get("Content-Disposition") != "" {
					t.Fatal("response disclosed a filesystem or ACL detail")
				}
			}
		})
	}
}

func TestNASReadRequiresPackagePermissionAndRegularFile(t *testing.T) {
	root := t.TempDir()
	file := writeFixture(t, root, fixturePath, fixtureBytes)
	big := writeFixture(t, root, "/vol1/large.png", "")
	if err := os.Truncate(big, maxNASFile+1); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(file, filepath.Join(root, "vol1", "link.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Dir(file), filepath.Join(root, "vol1", "linked")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "vol1"), filepath.Join(root, "vol2")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "vol1", "directory.png"), 0700); err != nil {
		t.Fatal(err)
	}
	unreadable := writeFixture(t, root, "/vol1/locked.png", fixtureBytes)
	if err := os.Chmod(unreadable, 0); err != nil {
		t.Fatal(err)
	}
	site := testSite(t)
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) { return nasACL{Readable: true}, nil }}
	for _, tc := range []struct {
		path string
		want int
		code string
	}{
		{"/vol1/link.png", 400, "invalid_path"},
		{"/vol1/linked/" + filepath.Base(fixturePath), 400, "invalid_path"},
		{"/vol2/large.png", 400, "invalid_path"},
		{"/vol1/directory.png", 400, "invalid_path"},
		{"/vol1/missing.png", 404, "not_found"},
		{"/vol1/large.png", 413, "file_too_large"},
		{"/vol1/locked.png", 403, "authorization_required"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			if tc.code == "authorization_required" && os.Geteuid() == 0 {
				t.Skip("a root test process ignores file read mode")
			}
			w := httptest.NewRecorder()
			site.ServeHTTP(w, fixtureRequest("GET", fixtureTarget(tc.path)))
			expectProblem(t, w, tc.want, tc.code)
		})
	}
}

func TestNASReadRejectsChangedEntry(t *testing.T) {
	root := t.TempDir()
	file := writeFixture(t, root, fixturePath, fixtureBytes)
	site := testSite(t)
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) {
		if err := os.Rename(file, file+".old"); err != nil {
			t.Fatal(err)
		}
		writeFixture(t, root, fixturePath, "new file")
		return nasACL{Readable: true}, nil
	}}
	w := httptest.NewRecorder()
	site.ServeHTTP(w, fixtureRequest("GET", fixtureTarget(fixturePath)))
	expectProblem(t, w, 409, "file_changed")
}

func TestNASRejectsInvalidRequestsBeforeACL(t *testing.T) {
	site := testSite(t)
	site.nas.checkACL = func(context.Context, int64, string) (nasACL, error) {
		t.Error("unexpected ACL call")
		return nasACL{}, nil
	}
	for _, tc := range []struct {
		name   string
		method string
		target string
		modify func(*http.Request)
		want   int
	}{
		{"missing marker", "GET", fixtureTarget(fixturePath), func(r *http.Request) { r.Header.Del("X-PhotoStudio-Request") }, 403},
		{"no identity", "GET", fixtureTarget(fixturePath), func(r *http.Request) { r.Header.Del("X-Trim-Userid") }, 403},
		{"duplicate UID", "GET", fixtureTarget(fixturePath), func(r *http.Request) { r.Header.Add("X-Trim-Userid", "1001") }, 403},
		{"cross origin", "GET", fixtureTarget(fixturePath), func(r *http.Request) { r.Header.Set("Origin", "https://example.invalid") }, 403},
		{"cross site", "GET", fixtureTarget(fixturePath), func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }, 403},
		{"navigation", "GET", fixtureTarget(fixturePath), func(r *http.Request) { r.Header.Set("Sec-Fetch-Mode", "navigate") }, 403},
		{"post", "POST", fixtureTarget(fixturePath), nil, 405},
		{"outside prefix", "GET", strings.TrimPrefix(fixtureTarget(fixturePath), gatewayPrefix), nil, 404},
		{"duplicate path", "GET", fixtureTarget(fixturePath) + "&path=/vol1/a.png", nil, 400},
		{"invalid path", "GET", fixtureTarget("/vol1/../a.png"), nil, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := fixtureRequest(tc.method, tc.target)
			if tc.modify != nil {
				tc.modify(r)
			}
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status %d, want %d: %q", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestNASOnRealTCPAndUnixListeners(t *testing.T) {
	site := testSite(t)
	root := t.TempDir()
	writeFixture(t, root, fixturePath, fixtureBytes)
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) { return nasACL{Readable: true}, nil }}
	socket := testSocket(t)
	unix, cleanup, err := listenGateway(socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	if info, err := os.Lstat(socket); err != nil || info.Mode() != os.ModeSocket|0600 {
		t.Fatalf("socket not private: %v, %v", info, err)
	}
	tcp, err := listenLoopback("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name     string
		listener net.Listener
		client   *http.Client
		origin   string
		unix     bool
	}{
		{"tcp", tcp, &http.Client{Timeout: 3 * time.Second}, "http://" + tcp.Addr().String(), false},
		{"unix", unix, clientOverUnix(t, socket), "http://localhost", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := newHTTPServer(site)
			go server.Serve(tc.listener)
			defer server.Close()
			request := func(target string, uid string) (int, string) {
				r, err := http.NewRequest("GET", tc.origin+target, nil)
				if err != nil {
					t.Fatal(err)
				}
				r.Header.Set("X-PhotoStudio-Request", "1")
				if uid != "" {
					r.Header.Set("X-Trim-Userid", uid)
				}
				response, err := tc.client.Do(r)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				body, err := io.ReadAll(response.Body)
				if err != nil {
					t.Fatal(err)
				}
				return response.StatusCode, string(body)
			}
			for _, uid := range []string{"", "0", "1e2", "1000"} {
				status, body := request(gatewayPrefix+"/api/context", uid)
				var contextResult map[string]bool
				if status != 200 || json.Unmarshal([]byte(body), &contextResult) != nil || len(contextResult) != 2 || contextResult["nasFiles"] != (tc.unix && uid == "1000") || contextResult["nasWrite"] != (tc.unix && uid == "1000") {
					t.Fatalf("unexpected capability response: %d %q", status, body)
				}
			}
			status, body := request(fixtureTarget(fixturePath), "1000")
			if tc.unix && (status != 200 || body != fixtureBytes) || !tc.unix && (status != 403 || !strings.Contains(body, "gateway_required") || strings.Contains(body, fixtureBytes)) {
				t.Fatalf("unexpected file response: %d %q", status, body)
			}
		})
	}
	cleanup()
	if _, err := os.Lstat(socket); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("gateway did not remove its own socket")
	}
}

func TestACLCheckerProtocol(t *testing.T) {
	socket := testSocket(t)
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	responses := make(chan func(http.ResponseWriter, *http.Request, aclRequestBody), 1)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input aclRequestBody
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/trimapp" || r.Header.Get("Authorization") != "Bearer fixture-token" || r.Header.Get("Content-Type") != "application/json" || json.NewDecoder(r.Body).Decode(&input) != nil || input.Req != aclRequest || input.AppName != aclAppName || input.ReqID == "" || input.Data.UID != 1000 || input.Data.Path != fixturePath {
			t.Error("ACL request did not match the official protocol")
			w.WriteHeader(400)
			return
		}
		select {
		case send := <-responses:
			send(w, r, input)
		default:
			t.Error("unexpected authorization request")
			w.WriteHeader(500)
		}
	})}
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })
	checker := newACLChecker(socket, time.Second)
	t.Setenv("TRIM_API_TOKEN", "")
	if ok, err := checker(context.Background(), 1000, fixturePath); ok.Readable || !errors.Is(err, errACLUnavailable) {
		t.Fatal("missing token did not fail closed")
	}
	t.Setenv("TRIM_API_TOKEN", "fixture-token")
	for _, readable := range []bool{true, false} {
		responses <- func(w http.ResponseWriter, _ *http.Request, input aclRequestBody) {
			json.NewEncoder(w).Encode(map[string]any{"code": 0, "reqId": input.ReqID, "data": []any{map[string]any{"path": input.Data.Path, "readable": readable}}})
		}
		if ok, err := checker(context.Background(), 1000, fixturePath); ok.Readable != readable || err != nil {
			t.Fatalf("readable %t: allow=%t, err=%v", readable, ok, err)
		}
	}
	for _, body := range []string{`{"data":[]}`, `{"code":0,"data":[]}`, `{"code":1,"data":[]}`, `{"code":0,"data":[{"path":"/vol1/other.png","readable":true}]}`, `{"code":0,"data":[{"path":"/vol1/other.png"}]}`, `{"code":`, strings.Repeat("x", aclBodyLimit+1)} {
		responses <- func(w http.ResponseWriter, _ *http.Request, _ aclRequestBody) { io.WriteString(w, body) }
		if ok, err := checker(context.Background(), 1000, fixturePath); ok.Readable || !errors.Is(err, errACLUnavailable) {
			t.Fatal("malformed or mismatched ACL did not fail closed")
		}
	}
	responses <- func(w http.ResponseWriter, _ *http.Request, _ aclRequestBody) {
		w.Header().Set("Location", "/unexpected")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}
	if ok, err := checker(context.Background(), 1000, fixturePath); ok.Readable || !errors.Is(err, errACLUnavailable) {
		t.Fatal("unexpected redirect did not fail closed")
	}
	responses <- func(_ http.ResponseWriter, r *http.Request, _ aclRequestBody) { <-r.Context().Done() }
	if ok, err := newACLChecker(socket, 100*time.Millisecond)(context.Background(), 1000, fixturePath); ok.Readable || !errors.Is(err, errACLUnavailable) {
		t.Fatal("unresponsive gateway did not fail closed")
	}
}

func saveTarget(path string) string {
	return gatewayPrefix + "/api/nas-save?" + url.Values{"path": {path}}.Encode()
}

const savePath = "/vol1/1000/照片/另存.png"
const saveBytes = "saved-bytes-0123456789"

func saveRequest(path, body string, headers map[string]string) *http.Request {
	r := fixtureRequest(http.MethodPost, saveTarget(path))
	r.Header.Set("X-Trim-Userid", strconv.Itoa(os.Geteuid()))
	r.Header.Set("Content-Type", "application/octet-stream")
	for name, value := range headers {
		r.Header.Set(name, value)
	}
	r.Body = io.NopCloser(strings.NewReader(body))
	r.ContentLength = int64(len(body))
	return r
}

func TestNASSaveCreatesReplacesAndGuards(t *testing.T) {
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, strings.TrimPrefix(filepath.Dir(savePath), "/")), 0700)
	site := testSite(t)
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) {
		return nasACL{Readable: true, Writable: true}, nil
	}}

	// A new file is created exactly once, with the posted bytes.
	w := httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, saveBytes, nil))
	if w.Code != 200 {
		t.Fatalf("create status=%d body=%q", w.Code, w.Body.String())
	}
	data, err := os.ReadFile(filepath.Join(root, strings.TrimPrefix(savePath, "/")))
	if err != nil || string(data) != saveBytes {
		t.Fatalf("created file wrong: %v %q", err, data)
	}
	for _, name := range mustNames(t, filepath.Dir(filepath.Join(root, strings.TrimPrefix(savePath, "/")))) {
		if strings.HasPrefix(name, ".photostudio-") {
			t.Fatalf("temporary file leaked: %s", name)
		}
	}

	// Saving over it without the overwrite flag refuses and keeps the target.
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "second", nil))
	expectProblem(t, w, http.StatusConflict, "file_changed")
	data, _ = os.ReadFile(filepath.Join(root, strings.TrimPrefix(savePath, "/")))
	if string(data) != saveBytes {
		t.Fatal("target was modified without confirmation")
	}

	// Confirmation must carry the version the user just confirmed.
	info, err := os.Stat(filepath.Join(root, strings.TrimPrefix(savePath, "/")))
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "second", map[string]string{
		overwriteHeader: "1", expectSizeHeader: strconv.FormatInt(info.Size(), 10),
		expectMtimeHeader: strconv.FormatInt(info.ModTime().UnixNano(), 10),
	}))
	if w.Code != 200 {
		t.Fatalf("overwrite status=%d body=%q", w.Code, w.Body.String())
	}
	data, _ = os.ReadFile(filepath.Join(root, strings.TrimPrefix(savePath, "/")))
	if string(data) != "second" {
		t.Fatal("overwrite did not replace the content")
	}
}

func mustNames(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	return names
}

func TestNASSaveOptimisticLock(t *testing.T) {
	root := t.TempDir()
	file := writeFixture(t, root, savePath, "original")
	info, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	site := testSite(t)
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) {
		return nasACL{Readable: true, Writable: true}, nil
	}}
	lock := map[string]string{
		expectSizeHeader:  strconv.FormatInt(info.Size(), 10),
		expectMtimeHeader: strconv.FormatInt(info.ModTime().UnixNano(), 10),
	}
	// Matching lock: the save proceeds without a confirmation.
	w := httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "saved-under-lock", lock))
	if w.Code != 200 {
		t.Fatalf("locked save status=%d body=%q", w.Code, w.Body.String())
	}
	if data, _ := os.ReadFile(file); string(data) != "saved-under-lock" {
		t.Fatal("locked save did not write")
	}
	// A change since the open refuses the unconfirmed save and keeps the target.
	os.WriteFile(file, []byte("changed-by-someone-else"), 0600)
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "second-edit", lock))
	expectProblem(t, w, http.StatusConflict, "file_changed")
	if data, _ := os.ReadFile(file); string(data) != "changed-by-someone-else" {
		t.Fatal("unconfirmed save overwrote a changed file")
	}
	// A flag without fresh paired preconditions is not an overwrite grant.
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "confirmed-edit", map[string]string{overwriteHeader: "1"}))
	expectProblem(t, w, http.StatusBadRequest, "invalid_request")
	info, err = os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "confirmed-edit", map[string]string{
		overwriteHeader: "1", expectSizeHeader: strconv.FormatInt(info.Size(), 10),
		expectMtimeHeader: strconv.FormatInt(info.ModTime().UnixNano(), 10),
	}))
	if w.Code != 200 {
		t.Fatalf("confirmed save status=%d", w.Code)
	}
	if data, _ := os.ReadFile(file); string(data) != "confirmed-edit" {
		t.Fatal("confirmed save did not write")
	}
}

func TestNASSaveGuards(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, fixturePath, fixtureBytes)
	site := testSite(t)

	// An account without the write bit never reaches the filesystem.
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) {
		return nasACL{Readable: true, Writable: false}, nil
	}}
	w := httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, saveBytes, nil))
	expectProblem(t, w, http.StatusForbidden, "not_writable")
	if _, err := os.Stat(filepath.Join(root, strings.TrimPrefix(savePath, "/"))); !os.IsNotExist(err) {
		t.Fatal("unwritable account created a file")
	}

	// A symlinked target is an invalid path, not a follow-and-overwrite.
	site.nas = nasService{mountDir: root, checkACL: func(context.Context, int64, string) (nasACL, error) {
		return nasACL{Readable: true, Writable: true}, nil
	}}
	linked := "/vol1/1000/照片/链接.png"
	if err := os.Symlink(filepath.Join(root, strings.TrimPrefix(fixturePath, "/")), filepath.Join(root, strings.TrimPrefix(linked, "/"))); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(linked, saveBytes, nil))
	expectProblem(t, w, http.StatusBadRequest, "invalid_path")

	// A body beyond the limit refuses before touching the disk.
	w = httptest.NewRecorder()
	requestTooLarge := saveRequest(savePath, "not buffered", nil)
	requestTooLarge.ContentLength = maxNASFile + 1
	site.ServeHTTP(w, requestTooLarge)
	expectProblem(t, w, http.StatusRequestEntityTooLarge, "file_too_large")

	// A directory in place of the target refuses.
	os.MkdirAll(filepath.Join(root, "vol1/1000/照片/目录.png"), 0700)
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest("/vol1/1000/照片/目录.png", saveBytes, nil))
	expectProblem(t, w, http.StatusBadRequest, "invalid_path")

	// Without the gateway headers the endpoint refuses like the read side.
	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodPost, saveTarget(savePath), strings.NewReader(saveBytes)),
		func() *http.Request {
			r := fixtureRequest(http.MethodPost, saveTarget(savePath))
			r.Header.Del("X-Trim-Userid")
			r.Body = io.NopCloser(strings.NewReader(saveBytes))
			return r
		}(),
	} {
		w = httptest.NewRecorder()
		site.ServeHTTP(w, request)
		if w.Code == 200 || w.Code == 409 {
			t.Fatalf("unauthenticated save accepted: %d %q", w.Code, w.Body.String())
		}
	}

	// A get on the save endpoint is a method error.
	w = httptest.NewRecorder()
	site.ServeHTTP(w, fixtureRequest(http.MethodGet, saveTarget(savePath)))
	if w.Code != http.StatusMethodNotAllowed || w.Header().Get("Allow") != "POST" {
		t.Fatalf("GET on save endpoint: %d %q", w.Code, w.Header().Get("Allow"))
	}
}
