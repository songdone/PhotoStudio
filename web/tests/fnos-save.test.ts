import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/i18n/locale';
import { NAS_MAX_BYTES, type NasFileStat } from '../src/features/files/fnos-path';
import type { Editor } from '../src/editor';

const dialogs = vi.hoisted(() => ({ form: vi.fn() }));
vi.mock('../src/ui/dialog', () => ({ formDialog: dialogs.form }));
import { NasOpenError, saveNasConfirming, saveNasToNas } from '../src/features/files/fnos-launch';

const path = '/vol1/1000/图像/Save.png';
const blob = new Blob(['encoded-file']);
const current: NasFileStat = { size: 57, mtime: '1730000000000000007', revision: 'current-revision' };
const written: NasFileStat = { size: blob.size, mtime: '1730000001000000009', revision: 'saved-revision' };
const success = () => Response.json({ saved: true, ...written });
const conflict = (stat: unknown = current) => Response.json({ code: 'file_changed', current: stat }, { status: 409 });
const editor = {} as Editor;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  dialogs.form.mockReset();
  setLanguage('zh-CN');
});

describe('NAS save request', () => {
  it('sends exact metadata, browser credentials and the gateway marker without a user identity header', async () => {
    const request = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', request);
    expect(await saveNasToNas(path, blob, { expect: current })).toEqual(written);
    const [url, options] = request.mock.calls[0];
    expect(url).toContain('api/nas-save?');
    expect(new URL(url, 'http://localhost').searchParams.get('path')).toBe(path);
    expect(options).toMatchObject({ method: 'POST', mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', redirect: 'error', body: blob });
    expect(options.headers).toMatchObject({
      'X-PhotoStudio-Request': '1',
      'X-PhotoStudio-Expect-Size': '57',
      'X-PhotoStudio-Expect-Mtime': '1730000000000000007',
      'X-PhotoStudio-Expect-Revision': 'current-revision',
      'Content-Type': 'application/octet-stream',
    });
    expect(options.headers['X-Trim-Userid']).toBeUndefined();
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers['X-PhotoStudio-Overwrite']).toBeUndefined();
  });

  it('creates a new file without an overwrite flag or an invented precondition', async () => {
    const request = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', request);
    await saveNasToNas(path, blob);
    const headers = request.mock.calls[0][1].headers;
    expect(headers['X-PhotoStudio-Expect-Mtime']).toBeUndefined();
    expect(headers['X-PhotoStudio-Overwrite']).toBeUndefined();
  });

  it('rejects invalid paths, empty uploads and blind overwrites before networking', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(saveNasToNas('/etc/image.png', blob)).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(saveNasToNas(path, new Blob([]))).rejects.toMatchObject({ code: 'empty_body' });
    await expect(saveNasToNas(path, blob, { confirm: true })).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(saveNasToNas(path, blob, { expect: { size: 1, mtime: 123 } as never })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(request).not.toHaveBeenCalled();
  });

  it('enforces the upload limit without constructing a half-gigabyte buffer', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const large = Object.create(blob) as Blob;
    Object.defineProperty(large, 'size', { value: NAS_MAX_BYTES + 1 });
    await expect(saveNasToNas(path, large)).rejects.toMatchObject({ code: 'file_too_large' });
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps permission errors as bilingual source messages instead of trusting server prose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'not_writable', message: '/vol1/private/internal diagnostic' }, { status: 403 })));
    await expect(saveNasToNas(path, blob)).rejects.toMatchObject({
      code: 'not_writable',
      problem: { source: 'Your account or the Photo Studio app does not have write permission for this NAS location.' },
    });
  });

  it.each([
    { saved: true, size: blob.size, mtime: Number(written.mtime) },
    { saved: false, ...written },
    { saved: true, ...written, size: blob.size + 1 },
    { saved: true, size: blob.size },
    { saved: true, ...written, revision: '../unsafe' },
  ])('does not mark an unverified success as saved (%j)', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(saveNasToNas(path, blob)).rejects.toMatchObject({ code: 'result_unknown' });
  });

  it('does not pretend a network error proves the original file was left untouched', async () => {
    const request = vi.fn().mockRejectedValue(new TypeError('Network error'));
    vi.stubGlobal('fetch', request);
    await expect(saveNasToNas(path, blob)).rejects.toMatchObject({
      code: 'result_unknown',
      problem: { source: 'The NAS save result could not be confirmed. Keep this document open and check the file before trying again.' },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('checked NAS overwrite', () => {
  it('requires confirmation and retries with the exact server version, not the stale opened version', async () => {
    const request = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', request);
    vi.stubGlobal('document', { querySelector: () => null });
    dialogs.form.mockResolvedValue({});
    expect(await saveNasConfirming(editor, path, blob, { expect: { size: 2, mtime: '1' } })).toEqual(written);
    expect(dialogs.form).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].headers).toMatchObject({
      'X-PhotoStudio-Expect-Size': '57',
      'X-PhotoStudio-Expect-Mtime': current.mtime,
      'X-PhotoStudio-Expect-Revision': current.revision,
      'X-PhotoStudio-Overwrite': '1',
    });
  });

  it('does not retry after cancellation or mutate another session', async () => {
    const session = { nasPath: path, nasStat: current };
    const e = { sessions: [session] } as unknown as Editor;
    const request = vi.fn().mockResolvedValue(conflict());
    vi.stubGlobal('fetch', request);
    vi.stubGlobal('document', { querySelector: () => null });
    dialogs.form.mockResolvedValue(null);
    expect(await saveNasConfirming(e, path, blob)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(session.nasStat).toBe(current);
  });

  it('rejects incomplete or inaccessible conflict metadata without offering a blind overwrite', async () => {
    const request = vi.fn().mockResolvedValue(conflict({ size: 57, mtime: Number(current.mtime) }));
    vi.stubGlobal('fetch', request);
    await expect(saveNasConfirming(editor, path, blob)).rejects.toBeInstanceOf(NasOpenError);
    expect(dialogs.form).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stops if the file changed again after the user confirmed', async () => {
    const request = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(conflict({ ...current, mtime: '1730000000000000008' }));
    vi.stubGlobal('fetch', request);
    vi.stubGlobal('document', { querySelector: () => null });
    dialogs.form.mockResolvedValue({});
    await expect(saveNasConfirming(editor, path, blob)).rejects.toMatchObject({
      code: 'file_changed',
      problem: { source: 'The NAS file changed again after confirmation. Nothing was overwritten. Save with a new filename or try again.' },
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(dialogs.form).toHaveBeenCalledTimes(1);
  });
});
