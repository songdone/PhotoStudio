package main

import (
	"os"
	"path/filepath"
	"syscall"
)

// Darwin's O_NOFOLLOW_ANY rejects symbolic links in all path components.
const nofollowAny = 0x20000000

func openNASPath(mountDir, name string, flags int, perm os.FileMode) (*os.File, error) {
	root, err := filepath.EvalSymlinks(normalizedNASMount(mountDir)) // Only the trusted fixture root may be aliased.
	if err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(root, name), flags|nofollowAny|syscall.O_NONBLOCK, perm)
	if invalidNASComponent(err) {
		return nil, errInvalidNASPath
	}
	return file, err
}

func inspectNASFile(mountDir, name string) (*os.File, os.FileInfo, error) {
	file, err := openNASPath(mountDir, name, syscall.O_EVTONLY, 0)
	if err != nil {
		return nil, nil, err
	}
	return statNASFile(file)
}

func openReadableNASFile(mountDir, name string, _ *os.File) (*os.File, error) {
	return openNASPath(mountDir, name, os.O_RDONLY, 0)
}
