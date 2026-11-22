export const NAS_FILE_EXTENSIONS = ['psd', 'psb', 'photo', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'dib', 'tif', 'tiff', 'svg', 'ico', 'cur', 'tga', 'pnm', 'ppm', 'pgm', 'pbm', 'pam'] as const;
export const NAS_MAX_BYTES = 512 * 1024 * 1024;
export const NAS_APP_NAME = 'photostudio';
export const NAS_AUTH_METHOD = 'authorizeUserFile';
export const AUTH_PENDING_KEY = 'photostudio-file-auth';
export const AUTH_MAX_AGE = 5 * 60 * 1000;

/** Nanosecond timestamps stay decimal strings: JavaScript numbers lose precision. */
export type NasFileStat = { size: number; mtime: string; revision?: string };

export function parseNasFileStat(value: unknown): NasFileStat | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const stat = value as Partial<NasFileStat>;
  if (!Number.isSafeInteger(stat.size) || stat.size! < 0 || stat.size! > NAS_MAX_BYTES || typeof stat.mtime !== 'string' || !/^-?(?:0|[1-9]\d{0,18})$/.test(stat.mtime)) return;
  const mtime = BigInt(stat.mtime);
  if (mtime < -(1n << 63n) || mtime >= 1n << 63n) return;
  if (stat.revision !== undefined && (typeof stat.revision !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(stat.revision))) return;
  return { size: stat.size!, mtime: stat.mtime, ...(stat.revision === undefined ? {} : { revision: stat.revision }) };
}

/** A decoded folder path, never a URL or a value to decode a second time. */
export function validateNasFolder(value: string): boolean {
  if (!/^\/vol[1-9]\d*(?:\/|$)/.test(value) || /[\\\p{Cc}\p{Cs}]/u.test(value) || new TextEncoder().encode(value).length > 4096) return false;
  const parts = value.split('/').slice(1);
  return parts.every((part) => part.length > 0 && !part.startsWith('.'));
}

/** Accept one filename only; the encoding decides which extension is written. */
export function normalizeNasFileName(value: string, ext: string): string | undefined {
  if (/[\p{Cc}\p{Cs}]/u.test(value)) return;
  const name = value.trim();
  if (!(NAS_FILE_EXTENSIONS as readonly string[]).includes(ext) || !name || name.startsWith('.') || /[/\\\p{Cc}\p{Cs}]/u.test(name)) return;
  const dot = name.lastIndexOf('.');
  const suffix = dot < 0 ? undefined : name.slice(dot + 1).toLowerCase();
  const aliases = ext === 'jpg' || ext === 'jpeg' ? ['jpg', 'jpeg'] : ext === 'tif' || ext === 'tiff' ? ['tif', 'tiff'] : [ext];
  if (suffix !== undefined && !aliases.includes(suffix)) return;
  const filename = suffix === undefined ? `${name}.${ext}` : name;
  return new TextEncoder().encode(filename).length <= 255 ? filename : undefined;
}

/** Launch paths are decoded once by URLSearchParams and never treated as URLs. */
export function validNasPath(path: string): boolean {
  if (!/^\/vol[1-9]\d*\//.test(path) || /[\\\p{Cc}\p{Cs}]/u.test(path) || new TextEncoder().encode(path).length > 4096) return false;
  const segments = path.split('/').slice(1);
  if (segments.some((part) => !part || part.startsWith('.'))) return false;
  const file = segments.at(-1)!;
  const dot = file.lastIndexOf('.');
  return dot > 0 && (NAS_FILE_EXTENSIONS as readonly string[]).includes(file.slice(dot + 1).toLowerCase());
}

export function launchNasPath(search: string): string | undefined {
  const params = new URLSearchParams(search);
  const paths = params.getAll('path');
  if (!paths.length) return;
  if (paths.length !== 1 || !validNasPath(paths[0])) throw new Error('The file path or format is invalid. Select a supported file in the FNOS file manager and try again.');
  return paths[0];
}

export type PendingFileAuth = { state: string; path: string; createdAt: number };

export function validAuthState(state: unknown): state is string {
  return typeof state === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(state);
}

export function validPendingAuth(value: unknown, now = Date.now()): value is PendingFileAuth {
  if (!value || typeof value !== 'object') return false;
  const pending = value as Partial<PendingFileAuth>;
  return validAuthState(pending.state) && typeof pending.path === 'string' && validNasPath(pending.path) && typeof pending.createdAt === 'number' && pending.createdAt <= now && now - pending.createdAt < AUTH_MAX_AGE;
}
