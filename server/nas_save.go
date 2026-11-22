package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

const (
	expectSizeHeader     = "X-PhotoStudio-Expect-Size"
	expectMtimeHeader    = "X-PhotoStudio-Expect-Mtime"
	expectRevisionHeader = "X-PhotoStudio-Expect-Revision"
	overwriteHeader      = "X-PhotoStudio-Overwrite"
	mtimeHeader          = "X-PhotoStudio-Mtime"
	revisionHeader       = "X-PhotoStudio-Revision"
	nasUploadTimeout     = 120 * time.Second
	nasResponseTimeout   = 15 * time.Second
)

// Mtime stays decimal text on the wire: nanoseconds cannot fit in a JS number.
type expectedNASStat struct {
	size     int64
	mtime    string
	revision string
}

type nasSavedStat struct {
	Size     int64  `json:"size"`
	Mtime    string `json:"mtime"`
	Revision string `json:"revision"`
}

var (
	errNASEmptyBody              = errors.New("empty NAS upload")
	errNASInvalidBody            = errors.New("incomplete NAS upload")
	errNASUnsupportedPermissions = errors.New("cannot preserve NAS permissions")
	errNASResultUnknown          = errors.New("NAS commit result unknown")
)

func (n nasService) serveNASSave(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
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
		writeNASFileErrorForSave(w, r, errInvalidNASPath)
		return
	}
	absolute := query.Get("path")
	name, err := parseNASPath(absolute)
	if err != nil {
		writeNASFileErrorForSave(w, r, err)
		return
	}
	expect, _, err := validateNASSaveHeaders(r)
	if err != nil {
		writeNASProblem(w, r, http.StatusBadRequest, "invalid_request", "保存请求头或预条件无效。")
		return
	}
	if r.ContentLength > maxNASFile {
		writeNASFileErrorForSave(w, r, errFileTooLarge)
		return
	}
	if n.checkACL == nil {
		writeNASAuthUnavailable(w, r)
		return
	}
	// Extend only the upload route, with bounded and consistent read/write
	// deadlines. The ordinary server deadlines remain in force elsewhere.
	ctx, finish := nasUploadContext(w, r)
	defer finish()
	r = r.WithContext(ctx)
	unlock, err := nasSaveLocks.acquire(ctx, normalizedNASMount(n.mountDir)+"/"+name)
	if err != nil {
		writeNASFileErrorForSave(w, r, err)
		return
	}
	defer unlock()

	// Pin metadata before path-based authorization, but disclose no stat or
	// filesystem error and create no temp file until ACL approval.
	target, pinErr := pinNASSave(n.mountDir, name)
	if target != nil {
		defer target.close()
	}
	parentACL, err := n.authorizeNASPath(ctx, uid, path.Dir(absolute))
	if err != nil {
		writeNASAuthUnavailable(w, r)
		return
	}
	if !parentACL.Writable {
		writeNASFileErrorForSave(w, r, errNASNotWritable)
		return
	}
	if target == nil {
		// A failed path walk still must not disclose existence to a caller
		// without an approved target ACL.
		acl, err := n.authorizeNASPath(ctx, uid, absolute)
		if err != nil {
			writeNASAuthUnavailable(w, r)
			return
		}
		if !acl.Writable {
			writeNASFileErrorForSave(w, r, errNASNotWritable)
			return
		}
		writeNASFileErrorForSave(w, r, pinErr)
		return
	}
	if err := target.verifyParent(false); err != nil {
		writeNASFileErrorForSave(w, r, err)
		return
	}
	if target.exists || pinErr != nil {
		acl, err := n.authorizeNASPath(ctx, uid, absolute)
		if err != nil {
			writeNASAuthUnavailable(w, r)
			return
		}
		if !acl.Writable {
			writeNASFileErrorForSave(w, r, errNASNotWritable)
			return
		}
	}
	if pinErr != nil {
		writeNASFileErrorForSave(w, r, pinErr)
		return
	}
	if err := target.verify(false); err != nil {
		n.writeNASSaveFailure(w, r, uid, absolute, target, err)
		return
	}
	// Overwrite is only a declaration of UI confirmation. It never relaxes
	// the current stat comparison, including a second confirmation attempt.
	if err := target.checkExpectation(expect); err != nil {
		n.writeNASSaveFailure(w, r, uid, absolute, target, err)
		return
	}
	if os.Geteuid() == 0 {
		writeNASFileErrorForSave(w, r, errNASNotWritable)
		return
	}
	target.userUID = uint32(uid)
	if r.Body == nil || r.ContentLength == 0 {
		writeNASFileErrorForSave(w, r, errNASEmptyBody)
		return
	}
	if err := target.prepare(); err != nil {
		n.writeNASSaveFailure(w, r, uid, absolute, target, err)
		return
	}
	body := http.MaxBytesReader(w, r.Body, maxNASFile)
	size, err := streamNASBody(ctx, target.tempFile, body, r.ContentLength)
	if err != nil {
		n.writeNASSaveFailure(w, r, uid, absolute, target, err)
		return
	}
	// Recheck ACL after a long upload. These checks are tied again to the
	// pinned directory and target before any rename.
	parentACL, err = n.authorizeNASPath(ctx, uid, path.Dir(absolute))
	if err != nil {
		writeNASAuthUnavailable(w, r)
		return
	}
	if !parentACL.Writable {
		writeNASFileErrorForSave(w, r, errNASNotWritable)
		return
	}
	if target.exists {
		acl, err := n.authorizeNASPath(ctx, uid, absolute)
		if err != nil {
			writeNASAuthUnavailable(w, r)
			return
		}
		if !acl.Writable {
			writeNASFileErrorForSave(w, r, errNASNotWritable)
			return
		}
	}
	stat, err := target.commit(ctx, size)
	if err != nil {
		n.writeNASSaveFailure(w, r, uid, absolute, target, err)
		return
	}
	// This metadata is from the submitted inode's still-open FD, never from
	// re-opening the path (which another process may already have changed).
	writeNASJSON(w, r, http.StatusOK, struct {
		Saved bool `json:"saved"`
		nasSavedStat
	}{true, stat})
}

func (n nasService) authorizeNASPath(ctx context.Context, uid int64, absolute string) (nasACL, error) {
	aclCtx, cancel := context.WithTimeout(ctx, aclTimeout)
	defer cancel()
	acl, err := n.checkACL(aclCtx, uid, absolute)
	if err != nil || aclCtx.Err() != nil {
		return nasACL{}, errACLUnavailable
	}
	return acl, nil
}

func nasUploadContext(w http.ResponseWriter, r *http.Request) (context.Context, func()) {
	deadline := time.Now().Add(nasUploadTimeout)
	if existing, ok := r.Context().Deadline(); ok && existing.Before(deadline) {
		deadline = existing
	}
	controller := http.NewResponseController(w)
	_ = controller.SetReadDeadline(deadline)
	_ = controller.SetWriteDeadline(deadline.Add(nasResponseTimeout))
	ctx, cancel := context.WithDeadline(r.Context(), deadline)
	closed := make(chan struct{})
	stopClose := context.AfterFunc(ctx, func() {
		// First unblock net/http's body-read mutex with the socket deadline.
		// Close also unblocks closable test streams on cancellation.
		_ = controller.SetReadDeadline(time.Now())
		if r.Body != nil {
			_ = r.Body.Close()
		}
		close(closed)
	})
	return ctx, func() {
		if !stopClose() {
			<-closed
		}
		cancel()
		// The HTTP server also sets deadlines on the next request. Reset here
		// so a keepalive static/read request cannot inherit upload privileges.
		_ = controller.SetReadDeadline(time.Now().Add(15 * time.Second))
		_ = controller.SetWriteDeadline(time.Now().Add(60 * time.Second))
	}
}

func singleNASHeader(r *http.Request, name string) (string, bool, error) {
	values := r.Header.Values(name)
	if len(values) == 0 {
		return "", false, nil
	}
	if len(values) != 1 || values[0] == "" || strings.TrimSpace(values[0]) != values[0] || strings.ContainsAny(values[0], "\r\n\x00,") {
		return "", true, errNASInvalidBody
	}
	return values[0], true, nil
}

func validateNASSaveHeaders(r *http.Request) (*expectedNASStat, bool, error) {
	contentType, present, err := singleNASHeader(r, "Content-Type")
	if err != nil || !present || !strings.EqualFold(contentType, "application/octet-stream") {
		return nil, false, errNASInvalidBody
	}
	encoding, present, err := singleNASHeader(r, "Content-Encoding")
	if err != nil || present && !strings.EqualFold(encoding, "identity") {
		return nil, false, errNASInvalidBody
	}
	// HTTP framing is normally validated by net/http. Keep synthetic requests
	// and trailers from smuggling a second version or a content transform.
	if len(r.Trailer) != 0 || len(r.Header.Values("Trailer")) != 0 || r.ContentLength < -1 || len(r.TransferEncoding) > 1 || len(r.TransferEncoding) == 1 && r.TransferEncoding[0] != "chunked" {
		return nil, false, errNASInvalidBody
	}
	if length, hasLength, err := singleNASHeader(r, "Content-Length"); err != nil {
		return nil, false, err
	} else if hasLength {
		n, err := strconv.ParseInt(length, 10, 64)
		if err != nil || n < 0 || strconv.FormatInt(n, 10) != length || n != r.ContentLength || len(r.TransferEncoding) != 0 {
			return nil, false, errNASInvalidBody
		}
	}
	if value, present, err := singleNASHeader(r, "Expect"); err != nil || present && !strings.EqualFold(value, "100-continue") {
		return nil, false, errNASInvalidBody
	}
	expect, err := expectedStatFromHeaders(r)
	if err != nil {
		return nil, false, err
	}
	overwrite, present, err := singleNASHeader(r, overwriteHeader)
	if err != nil || present && overwrite != "1" || present && expect == nil {
		return nil, false, errNASInvalidBody
	}
	return expect, present, nil
}

func expectedStatFromHeaders(r *http.Request) (*expectedNASStat, error) {
	sizeText, hasSize, sizeErr := singleNASHeader(r, expectSizeHeader)
	mtimeText, hasMtime, mtimeErr := singleNASHeader(r, expectMtimeHeader)
	revision, hasRevision, revisionErr := singleNASHeader(r, expectRevisionHeader)
	if sizeErr != nil || mtimeErr != nil || revisionErr != nil || hasSize != hasMtime || hasRevision && !hasSize {
		return nil, errNASInvalidBody
	}
	if !hasSize {
		return nil, nil
	}
	size, err := strconv.ParseInt(sizeText, 10, 64)
	if err != nil || size < 0 || strconv.FormatInt(size, 10) != sizeText {
		return nil, errNASInvalidBody
	}
	mtime, err := strconv.ParseInt(mtimeText, 10, 64)
	if err != nil || strconv.FormatInt(mtime, 10) != mtimeText || hasRevision && !validNASRevision(revision) {
		return nil, errNASInvalidBody
	}
	return &expectedNASStat{size: size, mtime: mtimeText, revision: revision}, nil
}

func validNASRevision(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, c := range value {
		if c < '0' || c > '9' && c < 'a' || c > 'f' {
			return false
		}
	}
	return true
}

func streamNASBody(ctx context.Context, dst io.Writer, src io.Reader, contentLength int64) (int64, error) {
	buffer := make([]byte, 64<<10)
	var size int64
	for emptyReads := 0; ; {
		if err := ctx.Err(); err != nil {
			return size, err
		}
		n, readErr := src.Read(buffer)
		if err := ctx.Err(); err != nil {
			return size, err
		}
		if n < 0 || n > len(buffer) {
			return size, errNASInvalidBody
		}
		if size+int64(n) > maxNASFile {
			return size, errFileTooLarge
		}
		if n > 0 {
			emptyReads = 0
			written, err := dst.Write(buffer[:n])
			size += int64(written)
			if err != nil {
				return size, err
			}
			if written != n {
				return size, io.ErrShortWrite
			}
		} else {
			emptyReads++
		}
		if readErr != nil {
			if readErr != io.EOF {
				return size, errors.Join(errNASInvalidBody, readErr)
			}
			if size == 0 {
				return size, errNASEmptyBody
			}
			if contentLength >= 0 && size != contentLength {
				return size, errNASInvalidBody
			}
			return size, nil
		}
		if emptyReads >= 100 {
			return size, io.ErrNoProgress
		}
	}
}

func (n nasService) writeNASSaveFailure(w http.ResponseWriter, r *http.Request, uid int64, absolute string, target *nasSaveTarget, err error) {
	if errors.Is(err, errNASFileChanged) {
		var current *nasSavedStat
		// Conflict metadata is separately readable-authorized and re-pinned;
		// the earlier writable decision is not a license to reveal a new file.
		if candidate, pinErr := pinNASSave(n.mountDir, target.name); pinErr == nil {
			defer candidate.close()
			if candidate.exists {
				if acl, aclErr := n.authorizeNASPath(r.Context(), uid, absolute); aclErr == nil && acl.Readable {
					if stat, err := candidate.readableStat(); err == nil {
						current = &stat
					}
				}
			}
		} else if candidate != nil {
			candidate.close()
		}
		writeNASJSON(w, r, http.StatusConflict, struct {
			Code    string        `json:"code"`
			Message string        `json:"message"`
			Current *nasSavedStat `json:"current,omitempty"`
		}{"file_changed", "目标文件已存在或发生变化，请重新确认当前版本。", current})
		return
	}
	writeNASFileErrorForSave(w, r, err)
}

func writeNASFileErrorForSave(w http.ResponseWriter, r *http.Request, err error) {
	var tooLarge *http.MaxBytesError
	var netErr net.Error
	switch {
	case errors.Is(err, errNASResultUnknown):
		writeNASProblem(w, r, http.StatusInternalServerError, "result_unknown", "保存可能已提交，但无法确认结果，请从 NAS 重新打开检查，勿自动覆盖。")
	case errors.Is(err, context.Canceled):
		return
	case errors.Is(err, context.DeadlineExceeded) || errors.As(err, &netErr) && netErr.Timeout():
		writeNASProblem(w, r, http.StatusRequestTimeout, "upload_timeout", "保存上传超时，请重试。")
	case errors.Is(err, errInvalidNASPath):
		writeNASProblem(w, r, http.StatusBadRequest, "invalid_path", "保存路径无效，不能写入目录、链接或多重硬链接。")
	case errors.Is(err, errFileTooLarge) || errors.As(err, &tooLarge):
		writeNASProblem(w, r, http.StatusRequestEntityTooLarge, "file_too_large", "保存内容超过 512 MiB，无法保存。")
	case errors.Is(err, errNASEmptyBody):
		writeNASProblem(w, r, http.StatusBadRequest, "empty_body", "保存内容不能为空。")
	case errors.Is(err, errNASInvalidBody) || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.ErrNoProgress):
		writeNASProblem(w, r, http.StatusBadRequest, "invalid_request", "保存内容未完整上传。")
	case errors.Is(err, errNASFileChanged):
		writeNASProblem(w, r, http.StatusConflict, "file_changed", "目标文件已存在或发生变化，请重新确认当前版本。")
	case errors.Is(err, errNASUnsupportedPermissions):
		writeNASProblem(w, r, http.StatusUnprocessableEntity, "unsupported_permissions", "目标文件系统无法安全提交或完整保留文件所有者、权限及 ACL，未替换原文件。")
	case errors.Is(err, errNASNotWritable) || errors.Is(err, os.ErrPermission):
		writeNASProblem(w, r, http.StatusForbidden, "not_writable", "当前账号或 Photo Studio 包用户没有所需的文件及目录写权限。")
	case errors.Is(err, os.ErrNotExist):
		writeNASProblem(w, r, http.StatusNotFound, "not_found", "目标文件夹不存在，可能已被移动或删除。")
	default:
		writeNASProblem(w, r, http.StatusInternalServerError, "save_failed", "保存到 NAS 失败，请稍后重试。")
	}
}
