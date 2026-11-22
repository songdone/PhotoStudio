//go:build linux || darwin

package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/sys/unix"
)

type nasFileMetadata struct {
	dev, inode, links uint64
	mode, uid, gid    uint32
	size              int64
	mtime, ctime      string
	extra             uint64
}

func nasMetadata(st unix.Stat_t) nasFileMetadata {
	return nasFileMetadata{
		dev: uint64(st.Dev), inode: st.Ino, links: uint64(st.Nlink),
		mode: uint32(st.Mode), uid: st.Uid, gid: st.Gid, size: st.Size,
		mtime: strconv.FormatInt(st.Mtim.Sec*1_000_000_000+st.Mtim.Nsec, 10),
		ctime: strconv.FormatInt(st.Ctim.Sec*1_000_000_000+st.Ctim.Nsec, 10),
		extra: nasStatExtra(st),
	}
}

func nasMetadataFD(file *os.File) (nasFileMetadata, error) {
	var st unix.Stat_t
	if err := unix.Fstat(int(file.Fd()), &st); err != nil {
		return nasFileMetadata{}, err
	}
	return nasMetadata(st), nil
}

func (m nasFileMetadata) withTimes(ms, mn, cs, cn int64) nasFileMetadata {
	m.mtime = strconv.FormatInt(ms*1_000_000_000+mn, 10)
	m.ctime = strconv.FormatInt(cs*1_000_000_000+cn, 10)
	return m
}

func (m nasFileMetadata) savedStat() nasSavedStat {
	hash := sha256.Sum256([]byte(fmt.Sprintf("%d/%d/%d/%s/%s/%d/%d/%d/%d/%d", m.dev, m.inode, m.size, m.mtime, m.ctime, m.mode, m.uid, m.gid, m.links, m.extra)))
	return nasSavedStat{Size: m.size, Mtime: m.mtime, Revision: hex.EncodeToString(hash[:])}
}

func nasRevision(info os.FileInfo) string {
	// os.FileInfo uses syscall.Stat_t rather than x/sys's distinct type.
	return nasInfoMetadata(info).savedStat().Revision
}

func normalizedNASMount(root string) string {
	if root == "" {
		return "/"
	}
	return filepath.Clean(root)
}

type nasPathLock struct {
	token chan struct{}
	refs  int
}

type nasPathLocks struct {
	mu    sync.Mutex
	locks map[string]*nasPathLock
}

var nasSaveLocks nasPathLocks

func (locks *nasPathLocks) acquire(ctx context.Context, key string) (func(), error) {
	locks.mu.Lock()
	if locks.locks == nil {
		locks.locks = make(map[string]*nasPathLock)
	}
	entry := locks.locks[key]
	if entry == nil {
		entry = &nasPathLock{token: make(chan struct{}, 1)}
		entry.token <- struct{}{}
		locks.locks[key] = entry
	}
	entry.refs++
	locks.mu.Unlock()
	releaseRef := func() {
		locks.mu.Lock()
		entry.refs--
		if entry.refs == 0 {
			delete(locks.locks, key)
		}
		locks.mu.Unlock()
	}
	select {
	case <-ctx.Done():
		releaseRef()
		return nil, ctx.Err()
	case <-entry.token:
		return func() { entry.token <- struct{}{}; releaseRef() }, nil
	}
}

type nasSaveTarget struct {
	root, name, base string
	parent           *os.File
	parentBefore     nasFileMetadata
	entry            *os.File
	before           nasFileMetadata
	exists           bool
	userUID          uint32
	permissions      map[string][]byte
	parentAttrs      map[string][]byte
	tempName         string
	tempFile         *os.File
	committed        bool
}

func openNASParentDir(root string, dirs []string) (*os.File, error) {
	// Only the configured fixture/mount root is trusted to have aliases.
	root, err := filepath.EvalSymlinks(normalizedNASMount(root))
	if err != nil {
		return nil, err
	}
	fd, err := unix.Open(root, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	for _, part := range dirs {
		next, openErr := unix.Openat(fd, part, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		unix.Close(fd)
		if openErr != nil {
			if invalidNASComponent(openErr) {
				openErr = errInvalidNASPath
			}
			return nil, openErr
		}
		fd = next
	}
	return os.NewFile(uintptr(fd), "NAS directory"), nil
}

func pinNASSave(root, name string) (*nasSaveTarget, error) {
	parts := strings.Split(name, "/")
	parent, err := openNASParentDir(root, parts[:len(parts)-1])
	if err != nil {
		return nil, err
	}
	target := &nasSaveTarget{root: normalizedNASMount(root), name: name, base: parts[len(parts)-1], parent: parent}
	target.parentBefore, err = nasMetadataFD(parent)
	if err != nil {
		target.close()
		return nil, err
	}
	var st unix.Stat_t
	if err := unix.Fstatat(int(parent.Fd()), target.base, &st, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		if errors.Is(err, unix.ENOENT) {
			return target, nil
		}
		return target, err
	}
	target.exists = true
	target.before = nasMetadata(st)
	if uint32(st.Mode)&unix.S_IFMT != unix.S_IFREG || st.Nlink != 1 {
		return target, errInvalidNASPath
	}
	fd, err := unix.Openat(int(parent.Fd()), target.base, nasMetadataOpenFlags(), 0)
	if err != nil {
		if invalidNASComponent(err) {
			err = errInvalidNASPath
		}
		return target, err
	}
	target.entry = os.NewFile(uintptr(fd), "NAS save target")
	pinned, err := nasMetadataFD(target.entry)
	if err != nil || pinned != target.before {
		return target, errNASFileChanged
	}
	return target, nil
}

func (t *nasSaveTarget) close() {
	if t.tempFile != nil {
		if !t.committed {
			// Never delete a foreign replacement, or a name whose O_EXCL open
			// failed. Compare to our still-open inode before unlinking.
			meta, err := nasMetadataFD(t.tempFile)
			var named unix.Stat_t
			if err == nil && unix.Fstatat(int(t.parent.Fd()), t.tempName, &named, unix.AT_SYMLINK_NOFOLLOW) == nil && uint64(named.Dev) == meta.dev && named.Ino == meta.inode {
				_ = unix.Unlinkat(int(t.parent.Fd()), t.tempName, 0)
			}
		}
		t.tempFile.Close()
	}
	if t.entry != nil {
		t.entry.Close()
	}
	if t.parent != nil {
		t.parent.Close()
	}
}

func (t *nasSaveTarget) verifyParent(_ bool) error {
	parts := strings.Split(t.name, "/")
	current, err := openNASParentDir(t.root, parts[:len(parts)-1])
	if err != nil {
		return errNASFileChanged
	}
	defer current.Close()
	a, err := nasMetadataFD(current)
	if err != nil {
		return errNASFileChanged
	}
	b, err := nasMetadataFD(t.parent)
	if err != nil || a != b || !sameNASDirectory(t.parentBefore, b) {
		return errNASFileChanged
	}
	return nil
}

func sameNASDirectory(a, b nasFileMetadata) bool {
	// Size/link counts vary when our temp is created; the expected ctime is
	// explicitly refreshed only for that operation, not for external changes.
	return a.dev == b.dev && a.inode == b.inode && a.mode == b.mode && a.uid == b.uid && a.gid == b.gid && a.ctime == b.ctime && a.extra == b.extra
}

func (t *nasSaveTarget) verify(ownTemp bool) error {
	if err := t.verifyParent(ownTemp); err != nil {
		return err
	}
	if ownTemp && t.tempFile != nil {
		meta, err := nasMetadataFD(t.tempFile)
		var named unix.Stat_t
		if err != nil || meta.links != 1 || unix.Fstatat(int(t.parent.Fd()), t.tempName, &named, unix.AT_SYMLINK_NOFOLLOW) != nil || uint64(named.Dev) != meta.dev || named.Ino != meta.inode || uint32(named.Mode)&unix.S_IFMT != unix.S_IFREG {
			return errNASFileChanged
		}
	}
	var st unix.Stat_t
	err := unix.Fstatat(int(t.parent.Fd()), t.base, &st, unix.AT_SYMLINK_NOFOLLOW)
	if !t.exists {
		if errors.Is(err, unix.ENOENT) {
			return nil
		}
		return errNASFileChanged
	}
	if err != nil || nasMetadata(st) != t.before {
		return errNASFileChanged
	}
	current, err := nasMetadataFD(t.entry)
	if err != nil || current != t.before {
		return errNASFileChanged
	}
	return nil
}

func (t *nasSaveTarget) readableStat() (nasSavedStat, error) {
	if err := t.verify(false); err != nil {
		return nasSavedStat{}, err
	}
	fd, err := unix.Openat(int(t.parent.Fd()), t.base, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK|unix.O_CLOEXEC, 0)
	if err != nil {
		return nasSavedStat{}, err
	}
	file := os.NewFile(uintptr(fd), "NAS conflict metadata")
	defer file.Close()
	meta, err := nasMetadataFD(file)
	if err != nil || meta != t.before {
		return nasSavedStat{}, errNASFileChanged
	}
	if err := t.verify(false); err != nil {
		return nasSavedStat{}, err
	}
	return meta.savedStat(), nil
}

func (t *nasSaveTarget) checkExpectation(expect *expectedNASStat) error {
	if !t.exists {
		if expect != nil {
			return errNASFileChanged
		}
		return nil
	}
	if expect == nil || expect.size != t.before.size || expect.mtime != t.before.mtime || expect.revision != "" && expect.revision != t.before.savedStat().Revision {
		return errNASFileChanged
	}
	return nil
}

func (t *nasSaveTarget) prepare() error {
	if os.Geteuid() == 0 {
		return errNASNotWritable
	}
	if err := t.verify(false); err != nil {
		return err
	}
	if err := nasPermissionSupport(t.parent, true); err != nil {
		return err
	}
	attrs, err := readNASXattrs(t.parent)
	if err != nil {
		return errNASUnsupportedPermissions
	}
	t.parentAttrs = attrs
	if t.exists {
		// Reopen relative to the pinned parent only after authorization. Both
		// read (metadata) and write access are checked as the non-root process.
		readFD, err := unix.Openat(int(t.parent.Fd()), t.base, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK|unix.O_CLOEXEC, 0)
		if err != nil {
			return err
		}
		readable := os.NewFile(uintptr(readFD), "NAS permissions")
		defer readable.Close()
		meta, err := nasMetadataFD(readable)
		if err != nil || meta != t.before {
			return errNASFileChanged
		}
		writeFD, err := unix.Openat(int(t.parent.Fd()), t.base, unix.O_WRONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK|unix.O_CLOEXEC, 0)
		if err != nil {
			return err
		}
		writable := os.NewFile(uintptr(writeFD), "NAS write permission check")
		meta, statErr := nasMetadataFD(writable)
		writable.Close()
		if statErr != nil || meta != t.before {
			return errNASFileChanged
		}
		if t.before.uid != uint32(os.Geteuid()) {
			return errNASUnsupportedPermissions
		}
		if err := nasPermissionSupport(readable, false); err != nil {
			return err
		}
		t.permissions, err = readNASXattrs(readable)
		if err != nil {
			return errNASUnsupportedPermissions
		}
		if err := t.verify(false); err != nil {
			return err
		}
	}
	if err := t.verify(false); err != nil {
		return err
	}
	t.tempName = ".photostudio-" + rand.Text()
	fd, err := unix.Openat(int(t.parent.Fd()), t.tempName, unix.O_RDWR|unix.O_CREAT|unix.O_EXCL|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0600)
	if err != nil {
		return err
	}
	t.tempFile = os.NewFile(uintptr(fd), "NAS save temporary file")
	current, err := nasMetadataFD(t.parent)
	if err != nil || current.dev != t.parentBefore.dev || current.inode != t.parentBefore.inode || current.mode != t.parentBefore.mode || current.uid != t.parentBefore.uid || current.gid != t.parentBefore.gid {
		return errNASFileChanged
	}
	t.parentBefore = current
	return nil
}

func (t *nasSaveTarget) commit(ctx context.Context, size int64) (nasSavedStat, error) {
	if err := ctx.Err(); err != nil {
		return nasSavedStat{}, err
	}
	if err := t.verify(true); err != nil {
		return nasSavedStat{}, err
	}
	attrs, err := readNASXattrs(t.parent)
	if err != nil || !sameNASXattrs(attrs, t.parentAttrs) {
		return nasSavedStat{}, errNASFileChanged
	}
	if t.exists {
		// Metadata changed during the upload must not be restored over a user's
		// new permissions. Verify the source xattrs as well as ctime/stat.
		fd, err := unix.Openat(int(t.parent.Fd()), t.base, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_NONBLOCK|unix.O_CLOEXEC, 0)
		if err != nil {
			return nasSavedStat{}, errNASFileChanged
		}
		source := os.NewFile(uintptr(fd), "NAS final permissions")
		current, readErr := readNASXattrs(source)
		meta, statErr := nasMetadataFD(source)
		source.Close()
		if readErr != nil || statErr != nil || meta != t.before || !sameNASXattrs(current, t.permissions) {
			return nasSavedStat{}, errNASFileChanged
		}
		if err := preserveNASPermissions(t.tempFile, t.before, t.permissions); err != nil {
			return nasSavedStat{}, err
		}
	} else if err := inheritNASPermissions(t.tempFile, t.parentBefore, t.parentAttrs, t.userUID); err != nil {
		return nasSavedStat{}, err
	}
	if err := t.tempFile.Sync(); err != nil {
		return nasSavedStat{}, err
	}
	if err := ctx.Err(); err != nil {
		return nasSavedStat{}, err
	}
	if err := t.verify(true); err != nil {
		return nasSavedStat{}, err
	}
	submitted, err := nasMetadataFD(t.tempFile)
	if err != nil || submitted.size != size || submitted.links != 1 {
		return nasSavedStat{}, errNASFileChanged
	}
	// Application requests are serialized. External processes can still act
	// between this final identity/stat check and rename: this is not absolute
	// filesystem CAS. New files use kernel no-clobber regardless of that gap.
	if t.exists {
		err = unix.Renameat(int(t.parent.Fd()), t.tempName, int(t.parent.Fd()), t.base)
	} else {
		err = renameNASNoReplace(int(t.parent.Fd()), t.tempName, t.base)
	}
	if err != nil {
		if errors.Is(err, unix.EEXIST) {
			err = errNASFileChanged
		}
		return nasSavedStat{}, err
	}
	t.committed = true
	meta, err := nasMetadataFD(t.tempFile)
	if err != nil || meta.size != size || meta.dev != submitted.dev || meta.inode != submitted.inode || meta.mtime != submitted.mtime || meta.mode != submitted.mode || meta.uid != submitted.uid || meta.gid != submitted.gid || meta.links != 1 {
		// Commit has happened; a client must treat a failed response as unknown.
		return nasSavedStat{}, errNASResultUnknown
	}
	if err := unix.Fsync(int(t.parent.Fd())); err != nil {
		return nasSavedStat{}, errNASResultUnknown
	}
	return meta.savedStat(), nil
}

const nasXattrLimit = 1 << 20

func readNASXattrs(file *os.File) (map[string][]byte, error) {
	fd := int(file.Fd())
	n, err := unix.Flistxattr(fd, nil)
	if errors.Is(err, unix.ENOTSUP) {
		return map[string][]byte{}, nil
	}
	if err != nil || n < 0 || n > nasXattrLimit {
		return nil, errNASUnsupportedPermissions
	}
	if n == 0 {
		return map[string][]byte{}, nil
	}
	list := make([]byte, n)
	n, err = unix.Flistxattr(fd, list)
	if err != nil {
		return nil, errNASUnsupportedPermissions
	}
	result := make(map[string][]byte)
	total := n
	for _, name := range strings.Split(string(list[:n]), "\x00") {
		if name == "" {
			continue
		}
		size, err := unix.Fgetxattr(fd, name, nil)
		if err != nil || size < 0 || size > nasXattrLimit-total {
			return nil, errNASUnsupportedPermissions
		}
		value := make([]byte, size)
		if size > 0 {
			n, err := unix.Fgetxattr(fd, name, value)
			if err != nil || n != size {
				return nil, errNASUnsupportedPermissions
			}
		}
		total += size
		result[name] = value
	}
	return result, nil
}

func sameNASXattrs(a, b map[string][]byte) bool {
	if len(a) != len(b) {
		return false
	}
	for name, value := range a {
		other, ok := b[name]
		if !ok || !bytes.Equal(value, other) {
			return false
		}
	}
	return true
}

func setNASXattrs(file *os.File, expected map[string][]byte) error {
	current, err := readNASXattrs(file)
	if err != nil {
		return errNASUnsupportedPermissions
	}
	// Only the newly created temp inode can have redundant inherited attrs
	// removed. The authorized original inode's ACL is never modified.
	for name := range current {
		if _, wanted := expected[name]; !wanted {
			if err := unix.Fremovexattr(int(file.Fd()), name); err != nil {
				return errNASUnsupportedPermissions
			}
		}
	}
	for name, value := range expected {
		if old, ok := current[name]; ok && bytes.Equal(old, value) {
			continue
		}
		if nasRejectSecurityXattr(name) && name != "system.posix_acl_access" {
			return errNASUnsupportedPermissions
		}
		if err := unix.Fsetxattr(int(file.Fd()), name, value, 0); err != nil {
			return errNASUnsupportedPermissions
		}
	}
	current, err = readNASXattrs(file)
	if err != nil || !sameNASXattrs(current, expected) {
		return errNASUnsupportedPermissions
	}
	return nil
}

func preserveNASPermissions(file *os.File, before nasFileMetadata, attrs map[string][]byte) error {
	meta, err := nasMetadataFD(file)
	if err != nil || meta.uid != before.uid || meta.uid != uint32(os.Geteuid()) {
		return errNASUnsupportedPermissions
	}
	if meta.gid != before.gid {
		// Non-root may only select an already allowed group; never change UID.
		if err := unix.Fchown(int(file.Fd()), -1, int(before.gid)); err != nil {
			return errNASUnsupportedPermissions
		}
	}
	if err := unix.Fchmod(int(file.Fd()), before.mode&07777); err != nil {
		return errNASUnsupportedPermissions
	}
	if err := setNASXattrs(file, attrs); err != nil {
		return err
	}
	meta, err = nasMetadataFD(file)
	if err != nil || meta.uid != before.uid || meta.gid != before.gid || meta.mode != before.mode {
		return errNASUnsupportedPermissions
	}
	return nil
}
