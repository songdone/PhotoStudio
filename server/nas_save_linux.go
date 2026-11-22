//go:build linux

package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"os"
	"sort"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

func nasMetadataOpenFlags() int       { return unix.O_PATH | unix.O_NOFOLLOW | unix.O_CLOEXEC }
func nasStatExtra(unix.Stat_t) uint64 { return 0 }

func nasInfoMetadata(info os.FileInfo) nasFileMetadata {
	st := info.Sys().(*syscall.Stat_t)
	return nasFileMetadata{
		dev: uint64(st.Dev), inode: st.Ino, links: uint64(st.Nlink), mode: st.Mode, uid: st.Uid, gid: st.Gid,
		size: st.Size,
	}.withTimes(st.Mtim.Sec, st.Mtim.Nsec, st.Ctim.Sec, st.Ctim.Nsec)
}

func renameNASNoReplace(parent int, from, to string) error {
	err := unix.Renameat2(parent, from, parent, to, unix.RENAME_NOREPLACE)
	if errors.Is(err, unix.ENOSYS) || errors.Is(err, unix.EINVAL) || errors.Is(err, unix.EOPNOTSUPP) {
		// Do not fall back to a clobbering rename on unsupported filesystems.
		return errNASUnsupportedPermissions
	}
	return err
}

func nasPermissionSupport(file *os.File, _ bool) error {
	flags, err := unix.IoctlGetInt(int(file.Fd()), unix.FS_IOC_GETFLAGS)
	if errors.Is(err, unix.ENOTTY) || errors.Is(err, unix.EOPNOTSUPP) {
		return nil // The filesystem has no Linux inode flag facility.
	}
	if err != nil {
		return errNASUnsupportedPermissions
	}
	if flags&(0x10|0x20) != 0 { // FS_IMMUTABLE_FL / FS_APPEND_FL
		return errNASNotWritable
	}
	return nil
}

func nasRejectSecurityXattr(name string) bool {
	return strings.HasPrefix(name, "security.") || strings.HasPrefix(name, "trusted.") || strings.HasPrefix(name, "system.")
}

type nasACLEntry struct {
	tag, perm uint16
	id        uint32
}

func parseNASPOSIXACL(data []byte) ([]nasACLEntry, error) {
	if len(data) < 28 || (len(data)-4)%8 != 0 || binary.LittleEndian.Uint32(data) != 2 {
		return nil, errNASUnsupportedPermissions
	}
	var entries []nasACLEntry
	for offset := 4; offset < len(data); offset += 8 {
		e := nasACLEntry{binary.LittleEndian.Uint16(data[offset:]), binary.LittleEndian.Uint16(data[offset+2:]), binary.LittleEndian.Uint32(data[offset+4:])}
		if e.perm&^uint16(7) != 0 || e.tag != 1 && e.tag != 2 && e.tag != 4 && e.tag != 8 && e.tag != 16 && e.tag != 32 {
			return nil, errNASUnsupportedPermissions
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func encodeNASPOSIXACL(entries []nasACLEntry) []byte {
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].tag != entries[j].tag {
			return entries[i].tag < entries[j].tag
		}
		return entries[i].id < entries[j].id
	})
	data := make([]byte, 4+8*len(entries))
	binary.LittleEndian.PutUint32(data, 2)
	for i, e := range entries {
		offset := 4 + 8*i
		binary.LittleEndian.PutUint16(data[offset:], e.tag)
		binary.LittleEndian.PutUint16(data[offset+2:], e.perm)
		binary.LittleEndian.PutUint32(data[offset+4:], e.id)
	}
	return data
}

func readableNASPOSIXACL(entries []nasACLEntry, uid, owner uint32) bool {
	mask := uint16(7)
	for _, e := range entries {
		if e.tag == 16 {
			mask = e.perm
		}
	}
	for _, e := range entries {
		if uid == owner && e.tag == 1 {
			return e.perm&4 != 0
		}
		if uid != owner && e.tag == 2 && e.id == uid {
			return e.perm&mask&4 != 0
		}
	}
	// Unknown user groups cannot be guessed. A conservative other fallback
	// is safe only when every group class also allows reading.
	otherReadable := false
	for _, e := range entries {
		if (e.tag == 4 || e.tag == 8) && e.perm&mask&4 == 0 {
			return false
		}
		if e.tag == 32 {
			otherReadable = e.perm&4 != 0
		}
	}
	return otherReadable
}

func inheritNASPermissions(file *os.File, parent nasFileMetadata, parentAttrs map[string][]byte, uid uint32) error {
	meta, err := nasMetadataFD(file)
	if err != nil || meta.uid != uint32(os.Geteuid()) {
		return errNASUnsupportedPermissions
	}
	if meta.gid != parent.gid {
		if err := unix.Fchown(int(file.Fd()), -1, int(parent.gid)); err != nil {
			return errNASUnsupportedPermissions
		}
	}
	if _, hasAccessACL := parentAttrs["system.posix_acl_access"]; hasAccessACL {
		if _, hasDefaultACL := parentAttrs["system.posix_acl_default"]; !hasDefaultACL {
			// Mode bits expose only the ACL mask, not the underlying groups.
			// Without a default ACL there is no reliable inheritance policy.
			return errNASUnsupportedPermissions
		}
	}
	mode := parent.mode & 0666
	attrs, err := readNASXattrs(file)
	if err != nil {
		return errNASUnsupportedPermissions
	}
	delete(attrs, "system.posix_acl_access")
	var entries []nasACLEntry
	if defaultACL, ok := parentAttrs["system.posix_acl_default"]; ok {
		entries, err = parseNASPOSIXACL(defaultACL)
		if err != nil {
			return err
		}
		for i := range entries {
			entries[i].perm &= 6 // A regular data file inherits no execute bit.
		}
		if !readableNASPOSIXACL(entries, uid, meta.uid) {
			return errNASUnsupportedPermissions
		}
		attrs["system.posix_acl_access"] = encodeNASPOSIXACL(entries)
		mode = 0666
	} else if uid == parent.uid && uid != meta.uid {
		// Carry the directory owner's existing access into a named user ACL,
		// not ownership. Do not grant any bit the directory owner lacks.
		ownerPerm := uint16(parent.mode>>6) & 6
		if ownerPerm&4 == 0 {
			return errNASUnsupportedPermissions
		}
		groupPerm := uint16(parent.mode>>3) & 6
		entries = []nasACLEntry{
			{1, ownerPerm, ^uint32(0)}, {2, ownerPerm, uid},
			{4, groupPerm, ^uint32(0)}, {16, groupPerm | ownerPerm, ^uint32(0)},
			{32, uint16(parent.mode) & 6, ^uint32(0)},
		}
		attrs["system.posix_acl_access"] = encodeNASPOSIXACL(entries)
		mode = 0666
	} else if uid == meta.uid {
		if mode&0400 == 0 {
			return errNASUnsupportedPermissions
		}
	} else if mode&0044 != 0044 {
		return errNASUnsupportedPermissions
	}
	if err := unix.Fchmod(int(file.Fd()), mode); err != nil {
		return errNASUnsupportedPermissions
	}
	if err := setNASXattrs(file, attrs); err != nil {
		return err
	}
	meta, err = nasMetadataFD(file)
	if err != nil || meta.uid != uint32(os.Geteuid()) || meta.gid != parent.gid {
		return errNASUnsupportedPermissions
	}
	if len(entries) == 0 && meta.mode&07777 != mode {
		return errNASUnsupportedPermissions
	}
	if len(entries) > 0 {
		actual, err := readNASXattrs(file)
		if err != nil || !bytes.Equal(actual["system.posix_acl_access"], attrs["system.posix_acl_access"]) {
			return errNASUnsupportedPermissions
		}
	}
	return nil
}
