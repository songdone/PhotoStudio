package main

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

// O_PATH is the Linux metadata-only open flag on both packaged architectures.
const nasPathFlag = 0x200000

func inspectNASFile(mountDir, name string) (*os.File, os.FileInfo, error) {
	fd, err := syscall.Open(normalizedNASMount(mountDir), nasPathFlag|syscall.O_DIRECTORY|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, nil, err
	}
	parts := strings.Split(name, "/")
	for i, part := range parts {
		flags := nasPathFlag | syscall.O_NOFOLLOW | syscall.O_CLOEXEC
		if i < len(parts)-1 {
			flags |= syscall.O_DIRECTORY
		}
		next, err := syscall.Openat(fd, part, flags, 0)
		syscall.Close(fd)
		if err != nil {
			if invalidNASComponent(err) {
				err = errInvalidNASPath
			}
			return nil, nil, err
		}
		fd = next
	}
	// An O_PATH descriptor for a symlink or special file is not a readable FD.
	return statNASFile(os.NewFile(uintptr(fd), "NAS file"))
}

func openReadableNASFile(_, _ string, pinned *os.File) (*os.File, error) {
	// Open the pinned inode, not a fresh name. The kernel still checks this
	// package user's read permission, and no special file can be substituted.
	file, err := os.Open("/proc/self/fd/" + strconv.FormatUint(uint64(pinned.Fd()), 10))
	runtime.KeepAlive(pinned)
	return file, err
}
