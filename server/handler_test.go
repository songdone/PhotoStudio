package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testSite(t *testing.T) *siteHandler {
	t.Helper()
	dir := t.TempDir()
	for name, content := range map[string]string{
		"index.html":    "<!doctype html><title>Photo Studio</title>",
		"assets/app.js": "console.log('ok')", "assets/engine.wasm": "\x00asm\x01\x00\x00\x00",
		".env": "SECRET=do-not-serve", "assets/.private/key": "private",
	} {
		full := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(full), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("outside-root-secret"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "leak.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(".env", filepath.Join(dir, "public.txt")); err != nil {
		t.Fatal(err)
	}
	site, err := newSiteHandler(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { site.Close() })
	return site
}

func TestStaticAndSPARouting(t *testing.T) {
	site := testSite(t)
	for _, tc := range []struct {
		path, accept string
		status       int
		contains     string
	}{
		{"/", "", 200, "Photo Studio"},
		{"/assets/app.js", "*/*", 200, "console.log"},
		{"/editor/project_1", "text/html", 200, "Photo Studio"},
		{"/editor/project_1", "application/json", 404, ""},
		{"/assets/missing.js", "text/html", 404, ""},
		{"/missing.css", "text/html", 404, ""},
		{"/missing.wasm", "text/html", 404, ""},
		{"/assets/missing", "text/html", 404, ""},
		{"/images/missing", "text/html", 404, ""},
		{"/api/missing", "text/html", 404, ""},
		{"/api", "text/html", 404, ""},
		{"/assets/", "text/html", 404, ""},
		{"/.env", "text/html", 404, ""},
		{"/assets/.private/key", "text/html", 404, ""},
		{"/%2e%2e/secret", "text/html", 404, ""},
		{"/a/../index.html", "text/html", 404, ""},
		{"/a%2fb", "text/html", 404, ""},
		{"/a%5cb", "text/html", 404, ""},
		{"/%252e%252e/secret", "text/html", 404, ""},
		{"//index.html", "text/html", 404, ""},
		{"/leak.txt", "text/html", 404, ""},
		{"/public.txt", "text/html", 404, ""},
	} {
		t.Run(tc.path+"/"+tc.accept, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, tc.path, nil)
			r.Header.Set("Accept", tc.accept)
			w := httptest.NewRecorder()
			site.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status = %d, want %d; %s", w.Code, tc.status, w.Body.String())
			}
			if tc.contains != "" && !strings.Contains(w.Body.String(), tc.contains) {
				t.Fatalf("missing expected content: %s", w.Body.String())
			}
			if strings.Contains(w.Body.String(), "SECRET=") || strings.Contains(w.Body.String(), "outside-root-secret") {
				t.Fatal("file disclosure")
			}
			if tc.status == 404 && strings.Contains(w.Body.String(), "<!doctype") {
				t.Fatal("missing resource returned SPA HTML")
			}
		})
	}
}

func TestHTTPMethodsMIMEAndRange(t *testing.T) {
	site := testSite(t)
	for _, path := range []string{"/", "/healthz", "/api/meta", "/assets/engine.wasm"} {
		r := httptest.NewRequest(http.MethodHead, path, nil)
		w := httptest.NewRecorder()
		site.ServeHTTP(w, r)
		if w.Code != 200 || w.Body.Len() != 0 {
			t.Fatalf("HEAD %s: %d %q", path, w.Code, w.Body.String())
		}
	}
	r := httptest.NewRequest(http.MethodGet, "/assets/engine.wasm", nil)
	r.Header.Set("Range", "bytes=0-3")
	w := httptest.NewRecorder()
	site.ServeHTTP(w, r)
	if w.Code != 206 || w.Header().Get("Content-Type") != "application/wasm" || w.Body.String() != "\x00asm" {
		t.Fatalf("WASM range: %d %v %q", w.Code, w.Header(), w.Body.String())
	}
	for _, method := range []string{"POST", "PUT", "DELETE", "OPTIONS", "PATCH"} {
		w = httptest.NewRecorder()
		site.ServeHTTP(w, httptest.NewRequest(method, "/api/meta", nil))
		if w.Code != 405 || w.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("%s: %d", method, w.Code)
		}
	}
}

func TestCrossOriginAndMetadata(t *testing.T) {
	site := testSite(t)
	for _, tc := range []struct {
		origin, fetch string
		status        int
	}{
		{"", "", 200}, {"http://example.com", "same-origin", 200},
		{"https://evil.example", "", 403}, {"null", "", 403},
		{"", "cross-site", 403}, {"", "same-site", 403},
		{"https://example.com", "", 403},
		{"http://example.com:9999", "", 403},
	} {
		r := httptest.NewRequest(http.MethodGet, "http://example.com/api/meta", nil)
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Sec-Fetch-Site", tc.fetch)
		w := httptest.NewRecorder()
		site.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("origin=%q fetch=%q: %d", tc.origin, tc.fetch, w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("unexpected CORS grant")
		}
		if w.Header().Get("Cross-Origin-Resource-Policy") != "same-origin" {
			t.Fatal("missing cross-origin resource policy")
		}
		if tc.status == 200 {
			var meta map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &meta); err != nil {
				t.Fatal(err)
			}
			if len(meta) != 5 || meta["maintainer"] != "HeyPuter" || meta["distributor"] != "6uos" || meta["version"] != "1.0.0" {
				t.Fatalf("incorrect public metadata: %v", meta)
			}
		}
	}
}

func TestDesktopNavigation(t *testing.T) {
	site := testSite(t)
	for _, tc := range []struct {
		method, fetch, mode, dest string
		status                    int
	}{
		{"GET", "same-site", "navigate", "document", 200},
		{"HEAD", "cross-site", "navigate", "document", 200},
		{"GET", "cross-site", "navigate", "document", 200},
		{"GET", "same-site", "cors", "empty", 403},
		{"GET", "cross-site", "navigate", "iframe", 403},
		{"POST", "same-site", "navigate", "document", 403},
	} {
		r := httptest.NewRequest(tc.method, "http://example.com/", nil)
		r.Header.Set("Sec-Fetch-Site", tc.fetch)
		r.Header.Set("Sec-Fetch-Mode", tc.mode)
		r.Header.Set("Sec-Fetch-Dest", tc.dest)
		w := httptest.NewRecorder()
		site.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%s %s %s %s: %d, want %d", tc.method, tc.fetch, tc.mode, tc.dest, w.Code, tc.status)
		}
	}
}

func TestGatewayAssetsWithPortStrippedFromHost(t *testing.T) {
	site := testSite(t)
	socket := testSocket(t)
	listener, cleanup, err := listenGateway(socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(cleanup)
	server := newHTTPServer(site)
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })
	client := clientOverUnix(t, socket)

	const host = "nas.test"
	const httpOrigin = "http://nas.test:5666"
	const script = gatewayPrefix + "/assets/app.js"
	for _, tc := range []struct {
		name, method, target, origin, fetchSite string
		want                                    int
	}{
		{"LAN HTTP without Fetch Metadata", "GET", script, httpOrigin, "", 200},
		{"LAN HTTP same-origin module", "GET", script, httpOrigin, "same-origin", 200},
		{"TLS terminated at gateway", "HEAD", script, "https://nas.test:5667", "same-origin", 200},
		{"WASM", "GET", gatewayPrefix + "/assets/engine.wasm", httpOrigin, "same-origin", 200},
		{"cross-site", "GET", script, httpOrigin, "cross-site", 403},
		{"same-site other origin", "GET", script, httpOrigin, "same-site", 403},
		{"different hostname", "GET", script, "http://other.test:5666", "same-origin", 403},
		{"opaque origin", "GET", script, "null", "same-origin", 403},
		{"invalid port", "GET", script, "http://nas.test:65536", "same-origin", 403},
		{"Origin is not an authority", "GET", script, httpOrigin + "/", "same-origin", 403},
		{"unprefixed", "GET", "/assets/app.js", httpOrigin, "same-origin", 403},
		{"not a read", "POST", script, httpOrigin, "same-origin", 403},
		{"missing script", "GET", gatewayPrefix + "/assets/missing.js", httpOrigin, "same-origin", 404},
		{"metadata", "GET", gatewayPrefix + "/api/meta", httpOrigin, "same-origin", 403},
		{"file read keeps strict origin validation", "GET", fixtureTarget(fixturePath), httpOrigin, "same-origin", 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r, err := http.NewRequest(tc.method, "http://"+host+tc.target, nil)
			if err != nil {
				t.Fatal(err)
			}
			r.Header.Set("Origin", tc.origin)
			if tc.fetchSite != "" {
				r.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			}
			r.Header.Set("X-PhotoStudio-Request", "1")
			r.Header.Set("X-Trim-Userid", "1000")
			res, err := client.Do(r)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != tc.want {
				t.Fatalf("status = %d, want %d", res.StatusCode, tc.want)
			}
			if res.Header.Get("Access-Control-Allow-Origin") != "" || res.Header.Get("Cross-Origin-Resource-Policy") != "same-origin" {
				t.Fatal("unexpected cross-origin policy")
			}
		})
	}

	// A direct request, even if it claims a gateway identity, must not use the exception.
	r := httptest.NewRequest(http.MethodGet, "http://"+host+script, nil)
	r.Header.Set("Origin", httpOrigin)
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.Header.Set("X-Trim-Userid", "1000")
	w := httptest.NewRecorder()
	site.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("direct request got %d, want 403", w.Code)
	}
}

func TestMissingFrontendFailsStartup(t *testing.T) {
	if site, err := newSiteHandler(t.TempDir()); err == nil {
		site.Close()
		t.Fatal("missing frontend accepted")
	}
}
