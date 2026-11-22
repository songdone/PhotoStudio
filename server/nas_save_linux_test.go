//go:build linux

package main

import (
	"context"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"golang.org/x/sys/unix"
)

func TestLinuxNASSaveDefaultACLAndNamedUserReadable(t *testing.T) {
	site, root, file := writableNASFixture(t, false)
	uid := uint32(os.Geteuid()) + 1000
	acl := encodeNASPOSIXACL([]nasACLEntry{
		{1, 7, ^uint32(0)}, {2, 6, uid}, {4, 0, ^uint32(0)}, {16, 6, ^uint32(0)}, {32, 0, ^uint32(0)},
	})
	if err := unix.Setxattr(filepath.Dir(file), "system.posix_acl_default", acl, 0); err != nil {
		t.Fatal(err)
	}
	r := saveRequest(savePath, saveBytes, nil)
	r.Header.Set("X-Trim-Userid", fmtNASUID(uid))
	w := httptest.NewRecorder()
	site.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("default ACL save: %d %s", w.Code, w.Body.String())
	}
	fd, err := os.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	defer fd.Close()
	attrs, err := readNASXattrs(fd)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := parseNASPOSIXACL(attrs["system.posix_acl_access"])
	if err != nil || !readableNASPOSIXACL(entries, uid, uint32(os.Geteuid())) {
		t.Fatal("gateway user cannot read inherited file")
	}
	// Save back must preserve every ACL byte as well as mode/ownership.
	before := attrs["system.posix_acl_access"]
	w = httptest.NewRecorder()
	site.ServeHTTP(w, saveRequest(savePath, "next", currentExpect(t, file)))
	if w.Code != 200 {
		t.Fatalf("ACL replace: %d %s", w.Code, w.Body.String())
	}
	next, err := os.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	defer next.Close()
	after, err := readNASXattrs(next)
	if err != nil || !sameNASXattrs(map[string][]byte{"acl": before}, map[string][]byte{"acl": after["system.posix_acl_access"]}) {
		t.Fatal("POSIX ACL lost")
	}
	assertNoNASTemp(t, root)
}

func fmtNASUID(uid uint32) string { return strconv.FormatUint(uint64(uid), 10) }

func TestLinuxNASInheritDirectoryOwnerWithoutChown(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("non-root required")
	}
	file, err := os.CreateTemp(t.TempDir(), "inherit")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	meta, err := nasMetadataFD(file)
	if err != nil {
		t.Fatal(err)
	}
	user := meta.uid + 1000
	parent := meta
	parent.uid = user
	parent.mode = unix.S_IFDIR | 0700
	if err := inheritNASPermissions(file, parent, map[string][]byte{}, user); err != nil {
		t.Fatal(err)
	}
	meta, err = nasMetadataFD(file)
	if err != nil || meta.uid != uint32(os.Geteuid()) {
		t.Fatal("owner changed")
	}
	attrs, err := readNASXattrs(file)
	if err != nil {
		t.Fatal(err)
	}
	acl, err := parseNASPOSIXACL(attrs["system.posix_acl_access"])
	if err != nil || !readableNASPOSIXACL(acl, user, meta.uid) {
		t.Fatal("directory owner lost read permission")
	}
	parent.mode = unix.S_IFDIR | 0300
	if err := inheritNASPermissions(file, parent, map[string][]byte{}, user); !errors.Is(err, errNASUnsupportedPermissions) {
		t.Fatal("granted nonexistent directory read bit")
	}
}

func TestLinuxNASUnknownUserCannotCreateUnreadableFile(t *testing.T) {
	site, root, file := writableNASFixture(t, false)
	r := saveRequest(savePath, saveBytes, nil)
	r.Header.Set("X-Trim-Userid", fmtNASUID(uint32(os.Geteuid())+1000))
	w := httptest.NewRecorder()
	site.ServeHTTP(w, r)
	expectProblem(t, w, 422, "unsupported_permissions")
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("created unreadable user file")
	}
	assertNoNASTemp(t, root)
}

func TestLinuxNASReadonlyDefaultACLRejects(t *testing.T) {
	site, root, file := writableNASFixture(t, false)
	uid := uint32(os.Geteuid()) + 1000
	acl := encodeNASPOSIXACL([]nasACLEntry{{1, 7, ^uint32(0)}, {2, 2, uid}, {4, 0, ^uint32(0)}, {16, 2, ^uint32(0)}, {32, 0, ^uint32(0)}})
	if err := unix.Setxattr(filepath.Dir(file), "system.posix_acl_default", acl, 0); err != nil {
		t.Fatal(err)
	}
	r := saveRequest(savePath, saveBytes, nil)
	r.Header.Set("X-Trim-Userid", fmtNASUID(uid))
	w := httptest.NewRecorder()
	site.ServeHTTP(w, r)
	expectProblem(t, w, 422, "unsupported_permissions")
	assertNoNASTemp(t, root)
}

func TestLinuxNASACLTimeoutReturnsNoAuthorization(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	n := nasService{checkACL: func(context.Context, int64, string) (nasACL, error) {
		return nasACL{Readable: true, Writable: true}, nil
	}}
	if acl, err := n.authorizeNASPath(ctx, 1000, savePath); err == nil || acl.Writable {
		t.Fatal("ignored canceled ACL context")
	}
}
