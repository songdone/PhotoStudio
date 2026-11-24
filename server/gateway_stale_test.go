package main

import (
	"net"
	"os"
	"strings"
	"syscall"
	"testing"
)

// leaveStaleSocket simulates a forced exit: the socket file stays on disk but
// nothing listens on it any more.
func leaveStaleSocket(t *testing.T, path string) {
	t.Helper()
	oldMask := syscall.Umask(0177)
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	syscall.Umask(oldMask)
	if err != nil {
		t.Fatal(err)
	}
	listener.SetUnlinkOnClose(false)
	listener.Close()
	if _, err := os.Lstat(path); err != nil {
		t.Fatalf("stale socket was not left behind: %v", err)
	}
}

func TestGatewayRecoversFromStaleSocket(t *testing.T) {
	socket := testSocket(t)
	leaveStaleSocket(t, socket)
	listener, cleanup, err := listenGateway(socket)
	if err != nil {
		t.Fatalf("start after stale socket: %v", err)
	}
	cleanup()
	if _, err := os.Lstat(socket); !os.IsNotExist(err) {
		t.Fatalf("socket should be removed after normal shutdown, got %v", err)
	}
	_ = listener
	// Stop then start again must keep working.
	_, cleanup, err = listenGateway(socket)
	if err != nil {
		t.Fatalf("restart after normal stop: %v", err)
	}
	cleanup()
}

func TestGatewayRefusesSocketInUse(t *testing.T) {
	socket := testSocket(t)
	_, cleanup, err := listenGateway(socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	if _, second, err := listenGateway(socket); err == nil {
		second()
		t.Fatal("second instance must not take over a live socket")
	} else if !strings.Contains(err.Error(), "still in use") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Lstat(socket); err != nil {
		t.Fatalf("live socket must be left untouched: %v", err)
	}
}

func TestGatewayRefusesUnexpectedFile(t *testing.T) {
	socket := testSocket(t)
	if err := os.WriteFile(socket, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, cleanup, err := listenGateway(socket); err == nil {
		cleanup()
		t.Fatal("regular file at socket path must not be replaced")
	}
	if data, err := os.ReadFile(socket); err != nil || string(data) != "x" {
		t.Fatalf("regular file must be left untouched: %q %v", data, err)
	}
}
