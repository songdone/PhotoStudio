package main

import (
	"encoding/json"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
)

const appVersion = "1.0.0"

var buildID = "development"

// Only public release facts belong here; never return environment, paths or tokens.
type metadata struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	BuildID     string `json:"buildId"`
	Maintainer  string `json:"maintainer"`
	Distributor string `json:"distributor"`
}

type siteHandler struct {
	root *os.Root
	meta []byte
	nas  nasService
}

func newSiteHandler(dir string) (*siteHandler, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	// Fail startup if the packaged frontend is absent or escapes through a symlink.
	index, err := root.Open("index.html")
	if err != nil {
		root.Close()
		return nil, err
	}
	info, err := index.Stat()
	index.Close()
	if err != nil || !info.Mode().IsRegular() {
		root.Close()
		if err == nil {
			err = fs.ErrInvalid
		}
		return nil, err
	}
	body, err := json.Marshal(metadata{"Photo Studio", appVersion, buildID, "HeyPuter", "6uos"})
	if err != nil {
		root.Close()
		return nil, err
	}
	return &siteHandler{root: root, meta: append(body, '\n'), nas: nasService{checkACL: newACLChecker(openAPISocket, aclTimeout)}}, nil
}

func (s *siteHandler) Close() error { return s.root.Close() }

func stripGatewayPrefix(r *http.Request) *http.Request {
	if r.URL.Path == gatewayPrefix {
		clone := r.Clone(r.Context())
		urlCopy := *r.URL
		urlCopy.Path = "/"
		urlCopy.RawPath = ""
		clone.URL = &urlCopy
		return clone
	}
	if strings.HasPrefix(r.URL.Path, gatewayPrefix+"/") {
		clone := r.Clone(r.Context())
		urlCopy := *r.URL
		urlCopy.Path = strings.TrimPrefix(urlCopy.Path, gatewayPrefix)
		urlCopy.RawPath = ""
		clone.URL = &urlCopy
		return clone
	}
	return r
}

func (s *siteHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	if !validRequestPath(r.URL) {
		http.NotFound(w, r)
		return
	}
	stripped := stripGatewayPrefix(r)
	if nasAPIRoute(stripped.URL.Path) {
		if stripped == r {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "private, no-store")
		allowed, exists := nasAPIAllowedMethods[stripped.URL.Path]
		if !exists {
			http.NotFound(w, r)
			return
		}
		if !allowed[r.Method] {
			w.Header().Set("Allow", strings.Join(allowedMethods(allowed), ", "))
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		switch stripped.URL.Path {
		case "/api/context":
			s.nas.serveContext(w, stripped)
		case "/api/nas-save":
			s.nas.serveNASSave(w, stripped)
		default:
			s.nas.serveFile(w, stripped)
		}
		return
	}
	prefixed := stripped != r
	r = stripped
	if !sameOrigin(r) && !(prefixed && gatewayAssetSameOrigin(r)) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !validRequestPath(r.URL) {
		http.NotFound(w, r)
		return
	}
	switch r.URL.Path {
	case "/healthz":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodGet {
			w.Write([]byte("{\"status\":\"ok\"}\n"))
		}
		return
	case "/api/meta":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodGet {
			w.Write(s.meta)
		}
		return
	}
	if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/")
	if name == "" {
		name = "index.html"
	}
	if s.serveFile(w, r, name) {
		return
	}
	// Only HTML navigation to an extensionless route can receive the SPA shell.
	// Missing JS/CSS/WASM, reserved asset directories, and API routes remain 404.
	if validSPAPath(r) {
		if s.serveFile(w, r, "index.html") {
			return
		}
	}
	http.NotFound(w, r)
}

func sameOrigin(r *http.Request) bool {
	// The fnOS desktop opens this separate port in a new top-level tab.
	// Permit document navigation while keeping cross-origin fetches blocked.
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) &&
		strings.EqualFold(r.Header.Get("Sec-Fetch-Mode"), "navigate") &&
		strings.EqualFold(r.Header.Get("Sec-Fetch-Dest"), "document") {
		return true
	}
	switch strings.ToLower(r.Header.Get("Sec-Fetch-Site")) {
	case "cross-site", "same-site":
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.User != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	// Forwarded headers are intentionally untrusted for this direct port service.
	return u.Scheme == scheme && strings.EqualFold(u.Host, r.Host)
}

func validRequestPath(u *url.URL) bool {
	p := u.Path
	if p == "" || p[0] != '/' || strings.ContainsAny(p, "\\\x00") || strings.Contains(p, "//") {
		return false
	}
	// Reject encoded separators and repeated encoding rather than normalizing them.
	raw := strings.ToLower(u.EscapedPath())
	for _, bad := range []string{"%2f", "%5c", "%00", "%25"} {
		if strings.Contains(raw, bad) {
			return false
		}
	}
	for _, segment := range strings.Split(p, "/") {
		if strings.HasPrefix(segment, ".") {
			return false
		}
		for _, c := range segment {
			if c < 0x20 || c == 0x7f {
				return false
			}
		}
	}
	return true
}

func validSPAPath(r *http.Request) bool {
	if !strings.Contains(strings.ToLower(r.Header.Get("Accept")), "text/html") {
		return false
	}
	p := strings.Trim(r.URL.Path, "/")
	if p == "" {
		return false
	}
	segments := strings.Split(p, "/")
	switch strings.ToLower(segments[0]) {
	case "api", "assets", "static", "images", "fonts", "wasm", "js", "css", "healthz":
		return false
	}
	for _, segment := range segments {
		if strings.Contains(segment, ".") {
			return false
		}
		for _, c := range segment {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
				return false
			}
		}
	}
	return true
}

func (s *siteHandler) serveFile(w http.ResponseWriter, r *http.Request, name string) bool {
	// Reject every symlink, even one pointing inside the root or to a hidden file.
	// os.Root separately prevents filesystem escapes during path resolution.
	parts := strings.Split(name, "/")
	for i := range parts {
		info, err := s.root.Lstat(strings.Join(parts[:i+1], "/"))
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return false
		}
	}
	f, err := s.root.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	switch strings.ToLower(path.Ext(name)) {
	case ".wasm":
		w.Header().Set("Content-Type", "application/wasm")
	case ".js", ".mjs":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	default:
		if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
	return true
}
