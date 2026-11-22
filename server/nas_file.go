package main

import (
	"errors"
	"os"
	"syscall"
)

func invalidNASComponent(err error) bool {
	return errors.Is(err, syscall.ELOOP) || errors.Is(err, syscall.ENOTDIR)
}

func statNASFile(file *os.File) (*os.File, os.FileInfo, error) {
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		file.Close()
		return nil, nil, errInvalidNASPath
	}
	return file, info, nil
}

func sameNASFile(a, b os.FileInfo) bool {
	return b.Mode().IsRegular() && os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime())
}
