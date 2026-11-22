import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '../src/compat/hash';

afterEach(() => vi.unstubAllGlobals());

describe('local HTTP compatibility', () => {
  it('keeps source hashes identical when WebCrypto is unavailable', async () => {
    const text = new TextEncoder().encode('abc');
    const expected = await sha256Bytes(text);
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const actual = await sha256Bytes(text);
    expect(actual).toEqual(expected);
    expect(Array.from(actual, (b) => b.toString(16).padStart(2, '0')).join('')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('uses secure random bytes for HTTP-compatible UUIDs', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    vi.resetModules();
    await import('../src/compat/browser');
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
