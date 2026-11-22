import { describe, expect, it } from 'vitest';
import { launchNasPath, validNasPath, validPendingAuth, AUTH_MAX_AGE } from '../src/features/files/fnos-path';

describe('fnOS launch paths', () => {
  it('preserves encoded Chinese, spaces, plus and literal percent signs', () => {
    const path = '/vol1/1000/照片/海报 + 100%.PSD';
    expect(launchNasPath(`?${new URLSearchParams({ path })}`)).toBe(path);
    expect(launchNasPath('?other=value')).toBeUndefined();
    expect(validNasPath('/vol2/1001/image.jpeg')).toBe(true);
  });

  it('rejects ambiguous paths, directories, traversal and unsupported files', () => {
    for (const path of ['/etc/passwd', '/vol1/a/../photo.psd', '/vol1/.secret.png', '/vol1/a//b.png', '/vol1/a.png/', '/vol1/a.exe', 'https://host/a.psd', '/vol1/a\\b.png', '/vol1/a\u0000.png', '/vol1/a\n.png']) expect(validNasPath(path), path).toBe(false);
    expect(() => launchNasPath('?path=/vol1/a.psd&path=/vol1/b.psd')).toThrow();
    expect(() => launchNasPath('?path=%2Fetc%2Fshadow')).toThrow();
  });

  it('accepts only recent pending authorization for an actual supported file', () => {
    const now = 1000000;
    const pending = { state: 'e7f2c82d-1c7f-4bd7-9fb4-7a67da6c3345', path: '/vol1/1000/file.psd', createdAt: now - 1 };
    expect(validPendingAuth(pending, now)).toBe(true);
    for (const value of [null, {}, { ...pending, state: 'not-issued' }, { ...pending, path: '/elsewhere/file.png' }, { ...pending, createdAt: now + 1 }, { ...pending, createdAt: now - AUTH_MAX_AGE }]) expect(validPendingAuth(value, now)).toBe(false);
  });
});
