package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:18762", "loopback-only TCP debugging address; NAS APIs are disabled")
	socket := flag.String("socket", "", "absolute path for a private gateway Unix socket; exclusive with --listen")
	webRoot := flag.String("web-root", "web/dist", "read-only frontend directory containing index.html")
	version := flag.Bool("version", false, "print public release metadata and exit")
	flag.Parse()
	if *version {
		fmt.Printf("Photo Studio %s (%s); maintainer HeyPuter; distributor 6uos\n", appVersion, buildID)
		return
	}
	if flag.NArg() != 0 {
		log.Fatal("unexpected positional arguments; use --help")
	}
	if *socket != "" {
		flag.Visit(func(f *flag.Flag) {
			if f.Name == "listen" {
				log.Fatal("--socket and --listen are mutually exclusive")
			}
		})
	}
	if err := runConfigured(*listen, *socket, *webRoot); err != nil {
		log.Fatal(err)
	}
}

// Retain the original loopback debugging entry point.
func run(address, webRoot string) error { return runConfigured(address, "", webRoot) }

func runConfigured(address, socketPath, webRoot string) error {
	if os.Geteuid() == 0 {
		return errors.New("refusing to serve as root; run as the package user")
	}
	site, err := newSiteHandler(webRoot)
	if err != nil {
		return fmt.Errorf("frontend unavailable: %w", err)
	}
	defer site.Close()
	var listener net.Listener
	if socketPath != "" {
		var cleanup func()
		listener, cleanup, err = listenGateway(socketPath)
		if err == nil {
			defer cleanup()
		}
	} else {
		listener, err = listenLoopback(address)
	}
	if err != nil {
		return err
	}
	defer listener.Close()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return serve(ctx, listener, site)
}

func newHTTPServer(handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ConnContext:       gatewayConnectionContext,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second, // Only the authenticated save route extends its bounded deadlines.
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
}

func serve(ctx context.Context, listener net.Listener, handler http.Handler) error {
	server := newHTTPServer(handler)
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	log.Printf("Photo Studio %s build=%s transport=%s", appVersion, buildID, listener.Addr().Network())
	select {
	case err := <-done:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		server.Close()
		return errors.New("graceful shutdown failed")
	}
	if err := <-done; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	log.Print("Photo Studio stopped")
	return nil
}
