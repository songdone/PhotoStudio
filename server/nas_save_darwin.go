//go:build darwin

package main

import (
	"encoding/binary"
	"errors"
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/unix"
)

func nasMetadataOpenFlags() int {
	return unix.O_EVTONLY | unix.O_NOFOLLOW | unix.O_NONBLOCK | unix.O_CLOEXEC
}
func nasStatExtra(st unix.Stat_t) uint64 { return uint64(st.Flags)<<32 | uint64(st.Gen) }

func nasInfoMetadata(info os.FileInfo) nasFileMetadata {
	st := info.Sys().(*syscall.Stat_t)
	return nasFileMetadata{
		dev: uint64(st.Dev), inode: st.Ino, links: uint64(st.Nlink), mode: uint32(st.Mode), uid: st.Uid, gid: st.Gid,
		size: st.Size, extra: uint64(st.Flags)<<32 | uint64(st.Gen),
	}.withTimes(st.Mtimespec.Sec, st.Mtimespec.Nsec, st.Ctimespec.Sec, st.Ctimespec.Nsec)
}

func renameNASNoReplace(parent int, from, to string) error {
	err := unix.RenameatxNp(parent, from, parent, to, unix.RENAME_EXCL)
	if errors.Is(err, unix.ENOTSUP) || errors.Is(err, unix.EINVAL) {
		return errNASUnsupportedPermissions
	}
	return err
}

func nasPermissionSupport(file *os.File, _ bool) error {
	meta, err := nasMetadataFD(file)
	if err != nil {
		return errNASUnsupportedPermissions
	}
	// Darwin native ACLs are not POSIX ACL xattrs. We deliberately reject
	// them rather than silently dropping an ACL in the local test host.
	list := unix.Attrlist{Bitmapcount: 5, Commonattr: unix.ATTR_CMN_EXTENDED_SECURITY}
	buffer := make([]byte, 4096)
	_, _, errno := syscall.Syscall6(unix.SYS_FGETATTRLIST, file.Fd(), uintptr(unsafe.Pointer(&list)), uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)), 0, 0)
	if errno != 0 {
		return errNASUnsupportedPermissions
	}
	length := int(binary.LittleEndian.Uint32(buffer))
	if length < 12 || length > len(buffer) {
		return errNASUnsupportedPermissions
	}
	offset := int(int32(binary.LittleEndian.Uint32(buffer[4:]))) + 4
	securityLength := int(binary.LittleEndian.Uint32(buffer[8:]))
	if securityLength > 0 {
		if offset < 12 || offset+securityLength > length || securityLength < 44 {
			return errNASUnsupportedPermissions
		}
		security := buffer[offset : offset+securityLength]
		if binary.LittleEndian.Uint32(security) != 0x012cc16d || binary.LittleEndian.Uint32(security[36:]) != ^uint32(0) {
			return errNASUnsupportedPermissions
		}
	}
	if meta.extra>>32 != 0 {
		return errNASUnsupportedPermissions // File flags cannot be preserved here.
	}
	return nil
}

func nasRejectSecurityXattr(string) bool { return false }

func inheritNASPermissions(file *os.File, parent nasFileMetadata, _ map[string][]byte, uid uint32) error {
	// Darwin's inherited native ACL was rejected before creating a temp.
	meta, err := nasMetadataFD(file)
	if err != nil || meta.uid != uint32(os.Geteuid()) {
		return errNASUnsupportedPermissions
	}
	if meta.gid != parent.gid {
		if err := unix.Fchown(int(file.Fd()), -1, int(parent.gid)); err != nil {
			return errNASUnsupportedPermissions
		}
	}
	mode := parent.mode & 0666
	if uid == meta.uid {
		if mode&0400 == 0 {
			return errNASUnsupportedPermissions
		}
	} else if uid == parent.uid || mode&0044 != 0044 {
		// No native ACL synthesis on the test host; do not create a file the
		// directory owner or an unknown group membership could not read.
		return errNASUnsupportedPermissions
	}
	if err := unix.Fchmod(int(file.Fd()), mode); err != nil {
		return errNASUnsupportedPermissions
	}
	meta, err = nasMetadataFD(file)
	if err != nil || meta.mode&07777 != mode {
		return errNASUnsupportedPermissions
	}
	return nil
}
