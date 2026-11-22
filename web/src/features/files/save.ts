// Saving to Puter (a native project, or the PSD or single image file a
// document came from), opening from Puter, and Open Recent.
import type { Editor } from '../../editor';
import type { DocumentSession } from '../../app/session';
import type { PhotoDocument } from '../../model/document';
import type { Assets } from '../../model/assets';
import { projectExtras, serialize } from '../../model/serialization';
import { flatLosses, psdLosses, type PsdLoss } from '../../model/psd-losses';
import { describeFileLosses } from '../../i18n/file-messages';
import { sourceText } from '../../i18n/translate';
import { download } from '../../persistence/puter';
import { NasOpenError } from './fnos-launch';
import { normalizeNasFileName, type NasFileStat } from './fnos-path';
import { detach } from '../embedded/owners';
import { cloudRead, cloudSaveAs, cloudWrite, pickCloudFiles, puterError, puterMissing, runAfterPicker, type CloudItem } from './cloud';
import { openFile } from './open';
import { leftOutOfFile } from './left-out';
import { noteRecent, removeRecent, setRecentOpener, storedBlob, type RecentSource } from './recent';
import { emitAppEvent, openedFiles } from '../../app/app-events';
import { formDialog } from '../../ui/dialog';
import { flatSaveFormat, formatInfo, type FlatSaveFormat } from './formats';
import { askChoice } from '../preferences/warnings';

export type SaveFormat = 'photo' | 'psd' | FlatSaveFormat;
// What was encoded for a save. `project` is set when the bytes are a native project.
type Written = { blob: Blob; ext: string; format: SaveFormat; doc: PhotoDocument; extrasRevision: number; project?: Blob };

const errorText = (error: unknown) => puterError(error).message;
const projectName = (name: string) => (/\.photo$/i.test(name) ? name : `${name}.photo`);
const isPsdName = (name?: string) => /\.ps[db]$/i.test(name ?? '');
const extension = (path: string) => /\.([^./]+)$/.exec(path)?.[1].toLowerCase();
const stem = (s: DocumentSession, doc: PhotoDocument) => s.fileName?.replace(/\.[^.]+$/, '') || doc.name;
const isFlat = (format: SaveFormat): format is FlatSaveFormat => format !== 'photo' && format !== 'psd';
const isSaveFormat = (format: unknown): format is SaveFormat => format === 'photo' || format === 'psd' || (typeof format === 'string' && flatSaveFormat(`x.${format}`) === format);
/** What a file name saves as: a PSD, a single image file Save can write, or a project. */
const nameFormat = (name?: string): SaveFormat => (isPsdName(name) ? 'psd' : (flatSaveFormat(name) ?? 'photo'));
const formatLabel = (format: SaveFormat) => (format === 'photo' ? '.photo' : format === 'psd' ? 'PSD' : formatInfo[format].label);
/** The extension a single image file is written with: the one it was opened with, when that is this format. */
const flatExtension = (s: DocumentSession, format: FlatSaveFormat) => (flatSaveFormat(s.fileName) === format ? extension(s.fileName!)! : formatInfo[format].ext);

/** The format Save writes: a document opened from a PSD or a single image
 * file Save can write (PNG, JPEG, WebP, ...), or last saved as one, goes back
 * to that format; everything else is a native project. */
export const saveFormat = (s: DocumentSession): SaveFormat => nameFormat(s.fileName);

// What a format would not keep, and the losses already agreed to for a
// document (Save asks about each kind once per format, not on every save).
// `inPlace`: Save, which writes over the file the document came from when it can.
function lossesOf(s: DocumentSession, format: SaveFormat, inPlace = false): PsdLoss[] {
  const comments = !!projectExtras.get(s.assets)?.(s.doc).comments;
  if (format === 'psd') return psdLosses(s.doc, { comments });
  if (!isFlat(format)) return [];
  const losses = flatLosses(s.doc, { comments, text: formatInfo[format].text, deep: formatInfo[format].deep });
  // What of the Puter file it came from was not opened (other pages or
  // frames, metadata): an image file written over it would hold only what was.
  const source = leftOutOfFile.get(s);
  if (inPlace && source?.path && (source.path === s.storage.path || source.path === s.nasPath))
    for (const [i, what] of source.what.entries())
      losses.push({ id: `source-${i}`, label: sourceText(`${what} of {name}`, { name: source.name }), kind: 'omitted' });
  return losses;
}
const acceptedLosses = new WeakMap<DocumentSession, Set<string>>();
const lossKey = (format: SaveFormat, loss: PsdLoss) => `${format}:${loss.id}`;
const acceptLosses = (s: DocumentSession, format: SaveFormat, losses: PsdLoss[]) =>
  acceptedLosses.set(s, new Set([...(acceptedLosses.get(s) ?? []), ...losses.map((l) => lossKey(format, l))]));
const KEEPS_ALL = 'A .photo project keeps everything.';
// What of the source file was never opened, a project cannot keep either; it leaves the file alone.
const keepsAll = (s: DocumentSession, losses: PsdLoss[]) =>
  losses.some((l) => l.id.startsWith('source-'))
    ? ['A .photo project keeps everything opened here, but cannot recover pages, frames or metadata that were not imported.', sourceText('A .photo project leaves {name} unchanged.', { name: s.fileName ?? s.doc.name })].join('\n')
    : KEEPS_ALL;

/** Ask before writing a format that would lose something not agreed to yet;
 * the answer may be a project instead. Undefined when cancelled. `copy`: the
 * answer is for this copy only, not for later saves of the document. */
async function confirmLosses(
  s: DocumentSession,
  format: SaveFormat,
  { inPlace = false, copy = false } = {},
  attempt?: SaveAttempt,
): Promise<SaveFormat | undefined> {
  const losses = lossesOf(s, format, inPlace);
  const seen = acceptedLosses.get(s);
  if (!losses.some((l) => !seen?.has(lossKey(format, l)))) return format;
  const name = formatLabel(format);
  const about = `${describeFileLosses(losses, name)}\n${keepsAll(s, losses)}`;
  const choice = await askChoice<SaveFormat>(sourceText('Save as {format}', { format: name }), about, [
    ['photo', sourceText('Save as {format}', { format: '.photo' })],
    [format, sourceText('Save as {format}', { format: name })],
  ]);
  if (!choice) return undefined;
  if (choice === format && !copy) {
    if (attempt) attempt.accept(format, losses);
    else acceptLosses(s, format, losses);
  }
  return choice;
}

/** A single image file of the document: its composite at full size, in the
 * document's color profile where the format stores one, with the Export As
 * quality and metadata, and provenance as Preferences → Export asks. */
async function encodeFlat(e: Editor, s: DocumentSession, doc: PhotoDocument, assets: Assets, format: FlatSaveFormat, name: string): Promise<Blob> {
  const info = formatInfo[format];
  const { bytesBlob, encodeDocument, loadSettings } = await import('./pipeline');
  if (format === 'avif' && !(await (await import('./encode')).canEncodeAvif())) throw new Error('This browser cannot write AVIF files.');
  const deep = info.deep && (doc.bitsPerChannel ?? 8) > 8;
  const settings = { ...loadSettings(), format, sizeMode: 'percent' as const, scale: 100, canvasWidth: 0, canvasHeight: 0, transparency: true, depth: deep ? (16 as const) : (8 as const), metadata: 'all' as const, embedIcc: true, convertSrgb: !info.icc };
  const out = await encodeDocument(e, settings, doc, undefined, assets);
  const { withProvenance } = await import('../provenance/export');
  const bytes = await withProvenance(s, out.bytes, name, e.preferences.provenanceAttach, { prompts: e.preferences.provenancePrompts, width: out.width, height: out.height });
  return bytesBlob(bytes, out.mime);
}

/** Notify a close waiting on this save, even when one listener removes itself. */
export const cancelSave = (e: Editor, s: DocumentSession): undefined => {
  for (const hook of [...e.saveCancelHooks]) {
    try { hook(s); } catch (error) { console.error(error); }
  }
  return undefined;
};

/** NAS errors carry an English source and opaque parameter values. */
export function reportSaveError(e: Editor, error: unknown) {
  if (error instanceof NasOpenError && error.problem) e.message(error.problem.source, error.problem.values);
  else e.message(errorText(error));
}

function savedState(e: Editor, s: DocumentSession, w: Written) {
  // The saved snapshot, not the state after a picker or network request, is clean.
  s.saved = w.doc;
  s.savedExtrasRevision = w.extrasRevision;
  for (const hook of [...e.saveHooks]) {
    try { hook(s, w.project); } catch (error) { console.error(error); }
  }
  e.update();
  void emitAppEvent('after-save', s);
}

function markSavedNas(e: Editor, s: DocumentSession, w: Written, path: string, name: string, stat: NasFileStat) {
  s.storage.reset();
  s.downloadTarget = false;
  s.nasPath = path;
  s.nasStat = stat;
  s.fileName = name;
  detach(s);
  noteRecent(e, name, { kind: 'nas', path });
  openedFiles.set(s, { blob: w.blob, name, source: { kind: 'nas', path } });
  savedState(e, s, w);
}

function markSaved(e: Editor, s: DocumentSession, w: Written, item: { name: string; path: string }) {
  s.storage.path = item.path;
  s.downloadTarget = false;
  s.nasPath = undefined;
  s.nasStat = undefined;
  s.fileName = item.name;
  detach(s);
  noteRecent(e, item.name, { kind: 'puter', path: item.path });
  openedFiles.set(s, { blob: w.blob, name: item.name, path: item.path, source: { kind: 'puter', path: item.path } });
  savedState(e, s, w);
}

function markDownloaded(e: Editor, s: DocumentSession, w: Written, name: string) {
  s.storage.reset();
  s.downloadTarget = true;
  s.nasPath = undefined;
  s.nasStat = undefined;
  s.fileName = name;
  detach(s);
  noteRecent(e, name, { kind: 'local', blob: w.blob });
  openedFiles.set(s, { blob: w.blob, name, source: { kind: 'local' } });
  savedState(e, s, w);
}

/** One save attempt owns its cancellation/success hooks, including late pickers. */
function saveAttempt(e: Editor, s: DocumentSession) {
  let settled = false;
  let releaseSnapshot = () => {};
  const losses = new Map<SaveFormat, PsdLoss[]>();
  return {
    accept(format: SaveFormat, approved: PsdLoss[]) {
      losses.set(format, [...(losses.get(format) ?? []), ...approved]);
    },
    hold(w: Written) {
      releaseSnapshot();
      const retained = () => [w.doc];
      s.retained.push(retained);
      releaseSnapshot = () => {
        const i = s.retained.indexOf(retained);
        if (i >= 0) s.retained.splice(i, 1);
      };
    },
    cancel() {
      if (settled) return;
      settled = true;
      releaseSnapshot();
      cancelSave(e, s);
    },
    finish(write: () => void, format?: SaveFormat) {
      if (settled) return;
      settled = true;
      if (format && losses.has(format)) acceptLosses(s, format, losses.get(format)!);
      try { write(); } finally { releaseSnapshot(); }
    },
  };
}
type SaveAttempt = ReturnType<typeof saveAttempt>;

/** The document's bytes in a format, or undefined when cancelled. A document
 * that cannot be written as a PSD or an image file offers a project instead. */
async function encode(e: Editor, s: DocumentSession, format: SaveFormat, name?: string): Promise<Written | undefined> {
  const assets = s.assets;
  if (format !== 'photo') {
    try {
      if (isFlat(format)) {
        const doc = s.doc;
        const extrasRevision = s.extrasRevision;
        const ext = flatExtension(s, format);
        const retained = () => [doc];
        s.retained.push(retained);
        try {
          const blob = await encodeFlat(e, s, doc, assets, format, fileNameWithExtension(name ?? stem(s, doc), ext));
          return { blob, ext, format, doc, extrasRevision };
        } finally {
          const i = s.retained.indexOf(retained);
          if (i >= 0) s.retained.splice(i, 1);
        }
      }
      const out = await (await import('./psd-export')).buildPsd(e, s);
      // Undefined: the Maximize Compatibility question was cancelled.
      if (!out) return undefined;
      return { blob: out.blob, ext: out.extension, format, doc: out.live, extrasRevision: out.extrasRevision };
    } catch (error) {
      // Messages for the user are plain Errors; anything else is a bug.
      if (!(error instanceof Error) || error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError) throw error;
      const about = `${sourceText('This document cannot be saved as {format}.', { format: formatLabel(format) })}\n${error.message}`;
      const choice = await askChoice(sourceText('Save as {format}', { format: formatLabel(format) }), about, [
        ['photo', sourceText('Save as {format}', { format: '.photo' })],
      ]);
      if (!choice) return undefined;
    }
  }
  const doc = s.doc;
  const extrasRevision = s.extrasRevision;
  const retained = () => [doc];
  s.retained.push(retained);
  try {
    const blob = await serialize(doc, assets);
    return { blob, ext: 'photo', format: 'photo', doc, extrasRevision, project: blob };
  } finally {
    const i = s.retained.indexOf(retained);
    if (i >= 0) s.retained.splice(i, 1);
  }
}

/** Do not append an extension already present, including JPEG/TIFF aliases. */
const fileNameWithExtension = (name: string, ext: string) => {
  const suffix = extension(name);
  const same = suffix === ext || (suffix && flatSaveFormat(`x.${suffix}`) && flatSaveFormat(`x.${suffix}`) === flatSaveFormat(`x.${ext}`));
  return same ? name : `${name}.${ext}`;
};

type Destination = 'nas' | 'puter' | 'download';
type SaveLocation = { destination: Destination; name: string };

/** Only the gateway capability changes this UI; choosing NAS grants no permission. */
async function chooseSaveLocation(s: DocumentSession, copy: boolean, name: string): Promise<SaveLocation | undefined> {
  if (!(await (await import('./fnos-launch')).nasWriteAvailable()))
    return { destination: window.puter || (!s.nasPath && s.storage.path) ? 'puter' : 'download', name };
  const answer = await formDialog(copy ? 'Save a Copy' : 'Save As', [
    {
      name: 'destination', label: 'Destination', type: 'select', value: 'nas',
      options: [['nas', 'NAS folder'], ['puter', 'Puter'], ['download', 'Download to this device']],
    },
    { name: 'name', label: 'File name', type: 'text', value: name },
  ], 'Continue', 'NAS folder: choose an authorized folder on your NAS.\n\nPuter: save to Puter cloud storage, not to the NAS. A Puter connection is required.\n\nDownload to this device: your browser downloads a file; it does not write to the NAS or Puter.');
  if (!answer) return undefined;
  const destination = answer.destination;
  if (destination !== 'nas' && destination !== 'puter' && destination !== 'download') throw new Error('Choose a save destination.');
  if (!answer.name.trim()) throw new Error('Enter a file name.');
  return { destination, name: answer.name.trim() };
}

function locationName(location: SaveLocation, w: Written, selected: SaveFormat = w.format) {
  // An explicitly accepted .photo fallback gets a .photo name, never a PSD target.
  const raw = w.format !== selected && extension(location.name) && nameFormat(location.name) === selected
    ? location.name.replace(/\.[^.]+$/, '') : location.name;
  if (location.destination !== 'nas') return fileNameWithExtension(raw, w.ext);
  const name = normalizeNasFileName(raw, w.ext);
  if (!name) throw new NasOpenError('Use one file name without folders, leading dots or control characters, and match the file format.', 'invalid_path', { source: 'Use one file name without folders, leading dots or control characters, and match the file format.' });
  return name;
}

/** Save in place only in the file's actual format; all other writes choose a destination. */
async function store(e: Editor, s: DocumentSession, w: Written, attempt: SaveAttempt, to: { pick?: boolean; copy?: boolean; location?: SaveLocation; selected?: SaveFormat } = {}) {
  const path = s.storage.path;
  const nasPath = s.nasPath;
  const nasFormatMatches = w.format === 'photo' ? extension(nasPath ?? '') === 'photo'
    : w.format === 'psd' ? extension(nasPath ?? '') === w.ext : flatSaveFormat(nasPath) === w.format;
  if (!to.pick && !to.copy && nasPath && nasFormatMatches && nameFormat(s.fileName) === w.format) {
    const name = s.fileName ?? nasPath.split('/').pop()!;
    const { saveNasConfirming } = await import('./fnos-launch');
    const stat = await saveNasConfirming(e, nasPath, w.blob, { expect: s.nasStat });
    if (!stat) return attempt.cancel();
    attempt.finish(() => markSavedNas(e, s, w, nasPath, name, stat), w.format);
    e.message('Saved {name} to the NAS', { name });
    return;
  }
  if (!nasPath && !to.pick && !to.copy && path && nameFormat(path) === w.format && (w.format !== 'psd' || extension(path) === w.ext)) {
    const item = await cloudWrite(path, w.blob);
    attempt.finish(() => markSaved(e, s, w, item), w.format);
    e.message('Saved {name} to Puter', { name: item.name });
    return;
  }
  const location = to.location ?? (!to.pick && !to.copy && !nasPath && !path && s.downloadTarget
    ? { destination: 'download' as const, name: stem(s, w.doc) }
    : await chooseSaveLocation(s, !!to.copy, stem(s, w.doc)));
  if (!location) return attempt.cancel();
  const name = locationName(location, w, to.selected);
  if (location.destination === 'nas') {
    const { saveNasAs } = await import('./fnos-launch');
    const item = await saveNasAs(e, w.blob, name);
    if (!item) return attempt.cancel();
    attempt.finish(() => {
      if (to.copy) noteRecent(e, item.name, { kind: 'nas', path: item.path });
      else markSavedNas(e, s, w, item.path, item.name, item.stat);
    }, to.copy ? undefined : w.format);
    e.message(to.copy ? 'Saved a copy as {name}' : 'Saved {name} to the NAS', { name: item.name });
    if (to.copy) void emitAppEvent('export', s);
    return;
  }
  if (location.destination === 'download') {
    download(w.blob, name);
    attempt.finish(() => {
      if (to.copy) noteRecent(e, name, { kind: 'local', blob: w.blob });
      else markDownloaded(e, s, w, name);
    }, to.copy ? undefined : w.format);
    e.message(to.copy ? 'Downloaded a copy as {name}' : 'Downloaded {name}', { name });
    if (to.copy) void emitAppEvent('export', s);
    return;
  }
  // An explicit Puter choice never falls through to a download. A missing
  // connection throws Puter's existing account-button explanation.
  const pending = cloudSaveAs(w.blob, name);
  // The Puter picker never settles when dismissed: do not hold the editor busy.
  e.release();
  void pending.then((item) => {
    attempt.finish(() => {
      if (to.copy) noteRecent(e, item.name, { kind: 'puter', path: item.path });
      else markSaved(e, s, w, item);
    }, to.copy ? undefined : w.format);
    e.message(to.copy ? 'Saved a copy as {name}' : 'Saved {name} to Puter', { name: item.name });
    if (to.copy) void emitAppEvent('export', s);
  }).catch((error) => {
    attempt.cancel();
    reportSaveError(e, error);
  });
}

/** Save writes the original tab, even if a before-save script changes tabs. */
export async function save(e: Editor) {
  const s = e.session;
  if (s.saveHandler) return s.saveHandler();
  const attempt = saveAttempt(e, s);
  try {
    await emitAppEvent('before-save', s);
    const format = await confirmLosses(s, saveFormat(s), { inPlace: true }, attempt);
    if (!format) return attempt.cancel();
    const w = await encode(e, s, format);
    if (!w) return attempt.cancel();
    attempt.hold(w);
    await store(e, s, w, attempt);
  } catch (error) {
    attempt.cancel();
    reportSaveError(e, error);
  }
}

/** Save As changes the document's destination; a copy leaves its target and saved state alone. */
export async function saveAs(e: Editor, copy = false, format?: unknown) {
  const s = e.session;
  const attempt = saveAttempt(e, s);
  try {
    await emitAppEvent('before-save', s);
    const losses = lossesOf(s, 'psd');
    const lost = describeFileLosses(losses);
    const source = flatSaveFormat(s.fileName);
    const choices: [SaveFormat, string][] = [['photo', 'Photo Studio Project'], ['psd', 'PSD']];
    if (source) choices.push([source, formatInfo[source].label]);
    const about = source
      ? [lost || 'A PSD keeps layers and opens in other apps.', sourceText('{format} stores one flattened image.', { format: formatInfo[source].label }), KEEPS_ALL].join('\n')
      : lost ? `${lost}\n${KEEPS_ALL}` : 'A PSD opens in other apps. A .photo project is Photo Studio’s own format and also keeps the provenance record.';
    let chosen: SaveFormat | null | undefined = isSaveFormat(format) ? format : await askChoice<SaveFormat>(copy ? 'Save a Copy' : 'Save As', about, choices);
    if (!chosen) return attempt.cancel();
    // Only the interactive format question already showed these PSD losses.
    if (chosen === 'psd' && !isSaveFormat(format) && !copy) attempt.accept('psd', losses);
    const chosenFormat = chosen;
    if (isFlat(chosen) || (chosen === 'psd' && isSaveFormat(format))) chosen = await confirmLosses(s, chosen, { copy }, attempt);
    if (!chosen) return attempt.cancel();
    const location = await chooseSaveLocation(s, copy, stem(s, s.doc));
    if (!location) return attempt.cancel();
    const encodingName = chosen !== chosenFormat && extension(location.name) && nameFormat(location.name) === chosenFormat
      ? location.name.replace(/\.[^.]+$/, '') : location.name;
    const w = await encode(e, s, chosen, encodingName);
    if (!w) return attempt.cancel();
    attempt.hold(w);
    await store(e, s, w, attempt, { pick: true, copy, location, selected: chosenFormat });
  } catch (error) {
    attempt.cancel();
    reportSaveError(e, error);
  }
}

export async function downloadProject(e: Editor) {
  const s = e.session;
  const attempt = saveAttempt(e, s);
  try {
    await emitAppEvent('before-save', s);
    const w = await encode(e, s, 'photo');
    if (!w) return attempt.cancel();
    attempt.hold(w);
    const name = projectName(stem(s, w.doc));
    download(w.blob, name);
    // A download is a copy for an embedded tab; only Save updates its parent.
    if (s.saveHandler) {
      attempt.finish(() => {});
      e.message('Downloaded a copy as {name}. Save to update the embedded object.', { name });
      return;
    }
    // Preserve this command's existing target behavior. Save As is the action
    // that deliberately moves a document to a downloaded file.
    attempt.finish(() => savedState(e, s, w));
    e.message('Downloaded {name}', { name });
  } catch (error) {
    attempt.cancel();
    reportSaveError(e, error);
  }
}

/** Open files that live on Puter where they are: a .photo project or a PSD saves back to its path. */
export async function openCloudItems(e: Editor, items: CloudItem[]) {
  // One file that cannot be read or opened does not stop the others.
  const failed: string[] = [];
  for (const item of items)
    try {
      const blob = typeof item.read === 'function' ? await item.read().catch((thrown) => Promise.reject(puterError(thrown))) : await cloudRead(item.path);
      await openFile(e, blob, item.name, false, { source: { kind: 'puter', path: item.path } });
    } catch (error) {
      if (items.length === 1) throw error;
      failed.push(sourceText('{name} could not be opened: {error}', { name: item.name, error: errorText(error) }));
    }
  if (failed.length) throw new Error(failed.join('\n'));
}
export function openFromCloud(e: Editor) {
  e.release();
  void pickCloudFiles(true)
    .then((items) => runAfterPicker(e, () => openCloudItems(e, items)))
    .catch((error) => e.message(errorText(error)));
}

/** Open a file from the recent list. */
export async function openRecentEntry(e: Editor, entry: { name: string; source: RecentSource }) {
  const src = entry.source;
  // NAS entries re-run the read-only pipeline (path check, ACL, gateway read);
  // its dialogs already cover missing or unauthorized files.
  if (src.kind === 'nas') return void (await import('./fnos-launch')).openNasFile(e, src.path);
  let blob: Blob | undefined;
  try {
    blob = src.kind === 'puter' ? await cloudRead(src.path) : src.kind === 'stored' ? await storedBlob(src.key) : src.blob;
  } catch (error) {
    // Moved or deleted on Puter: the entry would fail every time.
    if (src.kind !== 'puter' || !puterMissing(error)) throw error;
    removeRecent(e, entry);
    throw new Error(sourceText('{name} is no longer at {path} and was removed from Open Recent.', { name: entry.name, path: src.path }));
  }
  if (!blob) {
    // Browser data was cleared: the entry would fail every time.
    removeRecent(e, entry);
    throw new Error(sourceText('{name} is no longer stored in this browser and was removed from Open Recent. Open it again from its location.', { name: entry.name }));
  }
  await openFile(e, blob, entry.name, false, { source: src });
}
export function installRecentOpener() {
  setRecentOpener(openRecentEntry);
}
