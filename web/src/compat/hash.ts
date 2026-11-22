/** Metadata checksums work on local HTTP too; signing stays on WebCrypto. */
export async function sha256Bytes(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (globalThis.crypto?.subtle) return new Uint8Array(await crypto.subtle.digest('SHA-256', input as Uint8Array<ArrayBuffer>));
  const { sha256 } = await import('@noble/hashes/sha2.js');
  return sha256(input);
}
