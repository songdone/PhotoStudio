package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	openAPISocket = "/var/run/trim_open_gateway_apiscope.socket"
	aclTimeout    = 5 * time.Second
	aclBodyLimit  = 64 << 10
	maxNASFile    = int64(512 << 20)
	aclAppName    = "photostudio"
	aclRequest    = "trim.file.checkUserACL"
)

type aclInput struct {
	UID  int64  `json:"uid"`
	Path string `json:"path"`
}

type aclRequestBody struct {
	Req     string   `json:"req"`
	AppName string   `json:"appName"`
	ReqID   string   `json:"reqId"`
	Data    aclInput `json:"data"`
}

type aclResponse struct {
	Code  *int   `json:"code"`
	ReqID string `json:"reqId"`
	Data  []struct {
		Path     string `json:"path"`
		Readable *bool  `json:"readable"`
		Writable *bool  `json:"writable"`
	} `json:"data"`
}

// The access decision for one path. Writable is strict: a protocol answer
// without the field counts as false, never as an unavailable check.
type nasACL struct {
	Readable bool
	Writable bool
}

type aclChecker func(context.Context, int64, string) (nasACL, error)

// Which methods each NAS endpoint accepts. The save endpoint is POST-only.
var nasAPIAllowedMethods = map[string]map[string]bool{
	"/api/nas-file": {"GET": true, "HEAD": true},
	"/api/context":  {"GET": true, "HEAD": true},
	"/api/nas-save": {"POST": true},
}

func nasAPIRoute(path string) bool { _, ok := nasAPIAllowedMethods[path]; return ok }

func allowedMethods(allowed map[string]bool) []string {
	var names []string
	for _, name := range []string{"GET", "HEAD", "POST"} {
		if allowed[name] {
			names = append(names, name)
		}
	}
	return names
}

type nasService struct {
	checkACL aclChecker
	mountDir string // Parent of the volN directories; defaults to /.
}

var (
	errInvalidNASPath = errors.New("invalid NAS file path")
	errNASNotWritable = errors.New("NAS file is not writable for this account")
	errNASFileChanged = errors.New("NAS file changed during authorization")
	errFileTooLarge   = errors.New("NAS file too large")
	errACLUnavailable = errors.New("NAS authorization check unavailable")
)

func (n nasService) serveContext(w http.ResponseWriter, r *http.Request) {
	if !nasSameOrigin(r) {
		writeNASProblem(w, r, http.StatusForbidden, "forbidden", "请求来源无效。")
		return
	}
	if r.URL.RawQuery != "" {
		writeNASProblem(w, r, http.StatusBadRequest, "invalid_request", "文件打开参数无效。")
		return
	}
	_, valid := gatewayUID(r)
	writeNASJSON(w, r, http.StatusOK, map[string]bool{"nasFiles": valid, "nasWrite": valid})
}

func (n nasService) serveFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	if !nasSameOrigin(r) {
		writeNASProblem(w, r, http.StatusForbidden, "forbidden", "请求来源无效。")
		return
	}
	uid, valid := gatewayUID(r)
	if !valid {
		writeNASProblem(w, r, http.StatusForbidden, "gateway_required", "请从飞牛桌面或文件管理器打开 Photo Studio。")
		return
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query) != 1 || len(query["path"]) != 1 {
		writeNASFileError(w, r, errInvalidNASPath)
		return
	}
	absolute := query.Get("path")
	name, err := parseNASPath(absolute)
	if err != nil {
		writeNASFileError(w, r, err)
		return
	}
	if n.checkACL == nil {
		writeNASAuthUnavailable(w, r)
		return
	}

	// Pin only the metadata before asking for a path-based ACL decision. An
	// unapproved request never opens a readable stream or learns file details.
	mountDir := n.mountDir
	if mountDir == "" {
		mountDir = "/"
	}
	entry, before, entryErr := inspectNASFile(mountDir, name)
	if entry != nil {
		defer entry.Close()
	}
	ctx, cancel := context.WithTimeout(r.Context(), aclTimeout)
	acl, aclErr := n.checkACL(ctx, uid, absolute)
	contextErr := ctx.Err()
	cancel()
	if aclErr != nil || contextErr != nil {
		writeNASAuthUnavailable(w, r)
		return
	}
	if !acl.Readable {
		writeNASProblem(w, r, http.StatusForbidden, "access_denied", "当前账号尚不能读取此文件。")
		return
	}
	if entryErr != nil {
		writeNASFileError(w, r, entryErr)
		return
	}
	if before.Size() > maxNASFile {
		writeNASFileError(w, r, errFileTooLarge)
		return
	}

	current, after, err := inspectNASFile(mountDir, name)
	if err != nil {
		writeNASFileError(w, r, err)
		return
	}
	defer current.Close()
	if !sameNASFile(before, after) {
		writeNASFileError(w, r, errNASFileChanged)
		return
	}
	file, err := openReadableNASFile(mountDir, name, entry)
	if err != nil {
		writeNASFileError(w, r, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !sameNASFile(before, info) {
		writeNASFileError(w, r, errNASFileChanged)
		return
	}
	if contextErr := r.Context().Err(); contextErr != nil {
		return
	}

	filename := mime.FormatMediaType("attachment", map[string]string{"filename": path.Base(name)})
	if filename == "" {
		writeNASFileError(w, r, errInvalidNASPath)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Disposition", filename)
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	// The save-back optimistic lock compares the file as it was opened.
	w.Header().Set(mtimeHeader, strconv.FormatInt(info.ModTime().UnixNano(), 10))
	w.Header().Set(revisionHeader, nasRevision(info))
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodGet {
		if _, err := io.CopyN(w, file, info.Size()); err != nil {
			// Do not log the source path or return a partial stream as success.
			panic(http.ErrAbortHandler)
		}
	}
}

func writeNASJSON(w http.ResponseWriter, r *http.Request, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func writeNASProblem(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	writeNASJSON(w, r, status, map[string]string{"code": code, "message": message})
}

func writeNASAuthUnavailable(w http.ResponseWriter, r *http.Request) {
	writeNASProblem(w, r, http.StatusServiceUnavailable, "authorization_unavailable", "飞牛暂时无法检查文件权限，请稍后重试。")
}

func writeNASFileError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, errInvalidNASPath):
		writeNASProblem(w, r, http.StatusBadRequest, "invalid_path", "请选择支持的 NAS 文件，不能打开目录或链接。")
	case errors.Is(err, errFileTooLarge):
		writeNASProblem(w, r, http.StatusRequestEntityTooLarge, "file_too_large", "文件超过 512 MiB，无法打开。")
	case errors.Is(err, errNASFileChanged):
		writeNASProblem(w, r, http.StatusConflict, "file_changed", "文件刚刚发生变化，请重试。")
	case errors.Is(err, os.ErrNotExist):
		writeNASProblem(w, r, http.StatusNotFound, "not_found", "找不到此文件，可能已被移动或删除。")
	case errors.Is(err, os.ErrPermission):
		writeNASProblem(w, r, http.StatusForbidden, "authorization_required", "Photo Studio 还没有读取此文件的权限。")
	default:
		writeNASProblem(w, r, http.StatusInternalServerError, "read_failed", "无法读取此文件，请稍后重试。")
	}
}

func parseNASPath(value string) (string, error) {
	// URL query parsing has decoded the path once. A remaining % is a literal
	// filename character, not an invitation to decode it again.
	if len(value) > 4096 || !utf8.ValidString(value) || !strings.HasPrefix(value, "/vol") || strings.ContainsRune(value, '\\') {
		return "", errInvalidNASPath
	}
	name := value[1:]
	volume, rest, hasFile := strings.Cut(name, "/")
	if !hasFile || len(volume) < 4 || volume[3] < '1' || volume[3] > '9' {
		return "", errInvalidNASPath
	}
	for _, c := range volume[4:] {
		if c < '0' || c > '9' {
			return "", errInvalidNASPath
		}
	}
	for part := range strings.SplitSeq(rest, "/") {
		if part == "" || strings.HasPrefix(part, ".") || strings.ContainsFunc(part, unicode.IsControl) {
			return "", errInvalidNASPath
		}
	}
	if !supportedImageExt[strings.ToLower(path.Ext(path.Base(name)))] {
		return "", errInvalidNASPath
	}
	return name, nil
}

var supportedImageExt = map[string]bool{
	".psd": true, ".psb": true, ".photo": true, ".png": true, ".jpg": true, ".jpeg": true,
	".webp": true, ".avif": true, ".gif": true, ".bmp": true, ".dib": true, ".tif": true,
	".tiff": true, ".svg": true, ".ico": true, ".cur": true, ".tga": true, ".pnm": true,
	".ppm": true, ".pgm": true, ".pbm": true, ".pam": true,
}

func newACLChecker(socket string, timeout time.Duration) aclChecker {
	dialer := &net.Dialer{Timeout: timeout}
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return dialer.DialContext(ctx, "unix", socket)
			},
			DisableKeepAlives:      true,
			MaxResponseHeaderBytes: 16 << 10,
		},
		Timeout:       timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return func(ctx context.Context, uid int64, filePath string) (nasACL, error) {
		token := os.Getenv("TRIM_API_TOKEN")
		if token == "" {
			return nasACL{}, errACLUnavailable
		}
		input := aclRequestBody{Req: aclRequest, AppName: aclAppName, ReqID: rand.Text(), Data: aclInput{UID: uid, Path: filePath}}
		body, err := json.Marshal(input)
		if err != nil {
			return nasACL{}, errACLUnavailable
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://localhost/api/v1/trimapp", bytes.NewReader(body))
		if err != nil {
			return nasACL{}, errACLUnavailable
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return nasACL{}, errACLUnavailable
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nasACL{}, errACLUnavailable
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, aclBodyLimit+1))
		var result aclResponse
		if err != nil || len(data) > aclBodyLimit || json.Unmarshal(data, &result) != nil || result.Code == nil || *result.Code != 0 || (result.ReqID != "" && result.ReqID != input.ReqID) || len(result.Data) != 1 || result.Data[0].Path != filePath || result.Data[0].Readable == nil {
			return nasACL{}, errACLUnavailable
		}
		// A missing writable field means this protocol answer says nothing about
		// writing: treat it as false so a save never assumes permission.
		return nasACL{Readable: *result.Data[0].Readable, Writable: result.Data[0].Writable != nil && *result.Data[0].Writable}, nil
	}
}
