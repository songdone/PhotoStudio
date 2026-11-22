package main

import (
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
)

// fnOS proxies the browser authority as a bare Host and terminates TLS before
// the Unix hop. Permit that mismatch only for packaged, read-only resources.
// These responses still have no CORS grant and use same-origin CORP.
func gatewayAssetSameOrigin(r *http.Request) bool {
	if !onGateway(r) || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
		return false
	}
	switch strings.ToLower(path.Ext(r.URL.Path)) {
	case ".js", ".mjs", ".css", ".wasm", ".json", ".ico", ".png", ".jpg", ".woff", ".woff2", ".gz", ".zip", ".txt":
	default:
		return false
	}
	// Plain HTTP on a LAN can omit Fetch Metadata. When present, it must
	// describe a same-origin request, not merely a same-site request.
	site := r.Header.Values("Sec-Fetch-Site")
	if len(site) != 0 && (len(site) != 1 || site[0] != "same-origin") {
		return false
	}
	origins := r.Header.Values("Origin")
	if len(origins) != 1 || strings.ContainsAny(origins[0], "?#") {
		return false
	}
	u, err := url.Parse(origins[0])
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Path != "" || u.Hostname() == "" {
		return false
	}
	host := u.Hostname()
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port := u.Port(); port != "" {
		if n, err := strconv.ParseUint(port, 10, 16); err != nil || n == 0 {
			return false
		}
	} else if u.Host != host {
		return false
	}
	return strings.EqualFold(host, r.Host)
}

func nasSameOrigin(r *http.Request) bool {
	// These browser/security headers are single-valued. Header.Get alone
	// would silently trust the first of contradictory duplicate values.
	for _, name := range []string{"Origin", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-Dest"} {
		values := r.Header.Values(name)
		if len(values) > 1 || len(values) == 1 && (values[0] == "" || strings.TrimSpace(values[0]) != values[0] || strings.ContainsAny(values[0], ",\r\n\x00")) {
			return false
		}
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		return false
	}
	if mode := r.Header.Get("Sec-Fetch-Mode"); mode != "" && mode != "cors" && mode != "same-origin" {
		return false
	}
	// Not a credential: this marker requires a same-origin fetch or CORS
	// preflight, and excludes navigation in browsers without Fetch Metadata.
	markers := r.Header.Values("X-PhotoStudio-Request")
	if len(markers) != 1 || markers[0] != "1" || strings.EqualFold(r.Header.Get("Sec-Fetch-Mode"), "navigate") {
		return false
	}
	if dest := r.Header.Get("Sec-Fetch-Dest"); dest != "" && !strings.EqualFold(dest, "empty") {
		return false
	}
	return sameOrigin(r)
}
