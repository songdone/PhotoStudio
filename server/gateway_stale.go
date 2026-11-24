package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"syscall"
	"time"
)

// removeStaleGatewaySocket clears a socket left behind by a crash, reboot or
// forced kill so that a later start is not blocked forever. It only removes a
// private socket owned by this process's user that nothing is listening on.
func removeStaleGatewaySocket(path string, existing os.FileInfo) error {
	if existing.Mode() != os.ModeSocket|0600 {
		return errors.New("gateway socket path is occupied by an unexpected file")
	}
	stat, ok := existing.Sys().(*syscall.Stat_t)
	if !ok || int(stat.Uid) != os.Getuid() {
		return errors.New("gateway socket path is owned by another user")
	}
	conn, err := net.DialTimeout("unix", path, 2*time.Second)
	if err == nil {
		conn.Close()
		return errors.New("gateway socket is still in use by another instance")
	}
	if !errors.Is(err, syscall.ECONNREFUSED) {
		return fmt.Errorf("cannot confirm gateway socket is stale: %w", err)
	}
	current, err := os.Lstat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("inspect gateway socket: %w", err)
	}
	if !os.SameFile(existing, current) {
		return errors.New("gateway socket changed during stale cleanup")
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove stale gateway socket: %w", err)
	}
	return nil
}
