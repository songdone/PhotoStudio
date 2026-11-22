package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
)

const gatewayPrefix = "/app/photostudio"

type gatewayConnKey struct{}

func gatewayConnectionContext(ctx context.Context, conn net.Conn) context.Context {
	if _, ok := conn.(*net.UnixConn); ok {
		return context.WithValue(ctx, gatewayConnKey{}, true)
	}
	return ctx
}

func onGateway(r *http.Request) bool {
	return r.Context().Value(gatewayConnKey{}) == true
}

func gatewayUID(r *http.Request) (int64, bool) {
	if !onGateway(r) {
		return 0, false
	}
	values := r.Header.Values("X-Trim-Userid")
	if len(values) != 1 {
		return 0, false
	}
	for _, c := range values[0] {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	uid, err := strconv.ParseUint(values[0], 10, 32)
	return int64(uid), err == nil && uid > 0 && uid < 1<<32-1 && strconv.FormatUint(uid, 10) == values[0]
}

func listenLoopback(address string) (net.Listener, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, errors.New("--listen must be a loopback host and port")
	}
	if host == "localhost" {
		host = "127.0.0.1"
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return nil, errors.New("--listen must be a loopback address")
	}
	return net.Listen("tcp", net.JoinHostPort(host, port))
}

func listenGateway(path string) (*net.UnixListener, func(), error) {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path || path == "/" {
		return nil, nil, errors.New("--socket requires a clean absolute path")
	}
	if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		if err == nil {
			return nil, nil, errors.New("gateway socket path already exists")
		}
		return nil, nil, fmt.Errorf("inspect gateway socket: %w", err)
	}
	// This runs during startup. Set the mode at bind time so the listener is
	// never connectable by other users between bind and chmod.
	oldMask := syscall.Umask(0177)
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	syscall.Umask(oldMask)
	if err != nil {
		return nil, nil, fmt.Errorf("bind gateway socket: %w", err)
	}
	// net.UnixListener's default unlink cannot distinguish a replacement.
	listener.SetUnlinkOnClose(false)
	bound, err := os.Lstat(path)
	if err != nil || bound.Mode() != os.ModeSocket|0600 {
		listener.Close()
		return nil, nil, errors.New("could not verify private gateway socket")
	}
	cleanup := func() {
		listener.Close()
		if info, err := os.Lstat(path); err == nil && os.SameFile(bound, info) {
			os.Remove(path)
		}
	}
	return listener, cleanup, nil
}
