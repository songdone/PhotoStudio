export type UILanguage = 'zh-CN' | 'en';

let language: UILanguage = 'zh-CN';
const listeners = new Set<(language: UILanguage) => void>();

export const getLanguage = (): UILanguage => language;

export function setLanguage(value: UILanguage): void {
  const next = value === 'en' ? 'en' : 'zh-CN';
  if (next === language) return;
  language = next;
  for (const listener of [...listeners]) listener(next);
}

export function onLanguageChange(listener: (language: UILanguage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shared with the independent startup screen; no browser language guessing. */
export function readUILanguage(): UILanguage {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('photo-studio-preferences') ?? '{}');
    if (stored && typeof stored === 'object' && 'uiLanguage' in stored && stored.uiLanguage === 'en' && !('resetOnLaunch' in stored && stored.resetOnLaunch === true)) return 'en';
  } catch {
    // Unavailable or invalid preferences use the application default.
  }
  return 'zh-CN';
}
