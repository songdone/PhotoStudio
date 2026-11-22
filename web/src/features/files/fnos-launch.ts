import type { Editor } from '../../editor';
import { launchNasPath, validNasPath, validateNasFolder, normalizeNasFileName, parseNasFileStat, NAS_FILE_EXTENSIONS, AUTH_PENDING_KEY, NAS_APP_NAME, NAS_AUTH_METHOD, NAS_MAX_BYTES, type NasFileStat } from './fnos-path';
import { t } from '../../i18n/translate';
import { formDialog } from '../../ui/dialog';
import { localizedHTML, setLocalizedText } from '../../i18n/dom';
import type { TranslationKind } from '../../i18n/dom';

type NasProblem = { source: string; values?: Record<string, string | number>; kind?: TranslationKind };
export class NasOpenError extends Error {
  constructor(message: string, readonly code: string, readonly problem?: NasProblem, readonly current?: NasFileStat) { super(message); }
}

const localized = (source: string, values?: Record<string, string | number>, kind: TranslationKind = 'message'): NasProblem => ({ source, values, kind });
const showProblem = (el: Element, problem: NasProblem) => setLocalizedText(el, problem.source, problem.values, problem.kind);

const fetchOptions = { mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', redirect: 'error' } as const;
const requestHeader = { 'X-PhotoStudio-Request': '1' };

type NasRead = { blob: Blob; stat?: NasFileStat };

async function readNasFile(path: string): Promise<NasRead> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/nas-file?${new URLSearchParams({ path })}`, {
    ...fetchOptions, headers: { ...requestHeader, Accept: 'application/octet-stream' },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined) as { code?: unknown; message?: unknown } | undefined;
    const errorSource: Record<string, string> = {
      authorization_required: 'Photo Studio is not authorized to read this file yet.',
      access_denied: 'Your current account does not have access to read this file.',
      gateway_required: 'Open Photo Studio from the FNOS desktop or file manager, then try again.',
      invalid_path: 'The file path or format is invalid. Select a supported file in the FNOS file manager and try again.',
      file_too_large: 'This file is larger than 512 MiB and cannot be opened.',
      read_failed: 'Unable to read this file. Try again later.',
    };
    const source = typeof error?.code === 'string' && Object.hasOwn(errorSource, error.code) ? errorSource[error.code] : undefined;
    const problem = source ? localized(source) : undefined;
    const rawMessage = typeof error?.message === 'string' ? error.message : undefined;
    const code = typeof error?.code === 'string' && Object.hasOwn(errorSource, error.code) ? error.code : 'read_failed';
    throw new NasOpenError(problem ? t(problem.source, problem.values) : rawMessage ?? t('Unable to read this NAS file. Check that the file exists and that you have access.'), code, problem ?? (rawMessage ? undefined : localized('Unable to read this NAS file. Check that the file exists and that you have access.')));
  }
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/octet-stream') {
    await response.body?.cancel();
    throw new NasOpenError(t('File read failed. Reopen the file from the FNOS file manager.'), 'read_failed', localized('File read failed. Reopen the file from the FNOS file manager.'));
  }
  const tooLarge = () => new NasOpenError(t('This file is larger than 512 MiB and cannot be opened.'), 'file_too_large', localized('This file is larger than 512 MiB and cannot be opened.'));
  if (Number(response.headers.get('content-length')) > NAS_MAX_BYTES) {
    await response.body?.cancel();
    throw tooLarge();
  }
  const blob = await response.blob();
  if (blob.size > NAS_MAX_BYTES) throw tooLarge();
  const mtime = response.headers.get('X-PhotoStudio-Mtime');
  const revision = response.headers.get('X-PhotoStudio-Revision');
  return { blob, stat: parseNasFileStat({ size: blob.size, mtime, ...(revision === null ? {} : { revision }) }) };
}

/** A connected FNOS host SDK, or undefined outside the host / on a timeout. */
async function nasSdk(): Promise<import('@trimjs/web-app').TrimApp | undefined> {
  const { TrimApp } = await import('@trimjs/web-app');
  const sdk = new TrimApp();
  let timer: number | undefined;
  try {
    await Promise.race([sdk.ready(), new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(t('FNOS authorization timed out.'))), 10_000);
    })]);
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timer);
  }
  return sdk;
}

async function authorize(path: string, active: () => boolean): Promise<'retry' | 'redirect' | 'cancel'> {
  if (!active()) return 'cancel';
  const sdk = await nasSdk();
  if (!sdk || !active()) return 'cancel';
  if (!sdk.isStandaloneWeb) {
    // SDK 0.6 types a boolean; the platform docs also describe a path list.
    const result = await sdk.authorizeUserFile(path) as { code: number; data: unknown } | undefined;
    if (!result) return 'cancel';
    if (result.code !== 0) throw new Error(t('FNOS did not confirm file authorization.'));
    return result.data === true || (Array.isArray(result.data) && result.data.includes(path)) ? 'retry' : 'cancel';
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem(AUTH_PENDING_KEY, JSON.stringify({ state, path, createdAt: Date.now() }));
  try {
    await sdk.openAppAuth(NAS_AUTH_METHOD, {
      appName: NAS_APP_NAME, path, state,
      redirectUri: `${import.meta.env.BASE_URL}callback.html`,
    }, { target: '_self' });
    return 'redirect';
  } catch (error) {
    sessionStorage.removeItem(AUTH_PENDING_KEY);
    throw error;
  }
}

function openProblem(e: Editor, path: string, error: unknown) {
  const d = document.createElement('dialog');
  d.className = 'fnos-dialog';
  d.setAttribute('aria-labelledby', 'nas-open-title');
  const form = document.createElement('form');
  form.method = 'dialog';
  const title = document.createElement('h2');
  title.id = 'nas-open-title';
  title.innerHTML = localizedHTML('Open NAS file');
  const name = document.createElement('p');
  name.style.overflowWrap = 'anywhere';
  name.textContent = path.split('/').pop()!;
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  const problem = error instanceof NasOpenError && error.problem ? error.problem : localized('Unable to read the NAS file. Check your FNOS connection and try again.');
  showProblem(message, problem);
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const close = document.createElement('button');
  close.type = 'submit';
  close.innerHTML = localizedHTML('Cancel');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.innerHTML = localizedHTML('Retry opening');
  const grant = document.createElement('button');
  grant.type = 'button';
  grant.className = 'primary';
  grant.innerHTML = localizedHTML('Authorize and open');
  const permission = error instanceof NasOpenError && ['authorization_required', 'access_denied'].includes(error.code);
  actions.append(close, retry);
  if (permission) actions.append(grant);
  form.append(title, name, message, actions);
  d.append(form);
  e.root.append(d);
  d.addEventListener('close', () => d.remove(), { once: true });
  retry.addEventListener('click', () => { d.close(); void openNasFile(e, path); });
  grant.addEventListener('click', () => {
    grant.disabled = retry.disabled = true;
    showProblem(message, localized('Confirm authorization for this file in the FNOS window.'));
    void authorize(path, () => d.open).then((result) => {
      if (!d.open) return;
      if (result === 'retry') { d.close(); return openNasFile(e, path); }
      if (result === 'cancel') showProblem(message, localized('File access was not granted. You can continue editing other files.'));
    }).catch(() => {
      if (d.open) showProblem(message, localized('Authorization was not completed. Check the file permissions in FNOS app settings and try again.'));
    }).finally(() => { grant.disabled = retry.disabled = false; });
  });
  d.showModal();
}

/** The authenticated endpoint reads paths; the editor receives an unlinked Blob.
 * Resolves true when the document opened, false when it failed or was canceled. */
export async function openNasFile(e: Editor, path: string): Promise<boolean> {
  if (!validNasPath(path)) {
    e.message('The file path or format is invalid. Select a supported file in the FNOS file manager and try again.');
    return false;
  }
  try {
    const context = await fetch(`${import.meta.env.BASE_URL}api/context`, {
      ...fetchOptions, headers: { ...requestHeader, Accept: 'application/json' },
    });
    const access = context.ok ? await context.json() as { nasFiles?: unknown } : undefined;
    if (access?.nasFiles !== true) {
      const problem = localized('Open Photo Studio from the FNOS desktop or file manager, then try again.');
      throw new NasOpenError(t(problem.source), 'gateway_required', problem);
    }
    const filename = path.split('/').pop()!;
    e.message('Opening {name}…', { name: filename });
    const { blob, stat } = await readNasFile(path);
    while (e.busy) await e.idle;
    let opened = false;
    await e.run(async () => {
      const { openFile } = await import('./open');
      opened = await openFile(e, blob, filename, false, { source: { kind: 'nas', path }, nasStat: stat });
      if (!opened) e.message('Opening the file was canceled.');
    });
    return opened;
  } catch (error) { openProblem(e, path, error); return false; }
}

const nasSaveErrorSource: Record<string, string> = {
  not_writable: 'Your account or the Photo Studio app does not have write permission for this NAS location.',
  not_found: 'The NAS folder no longer exists. Choose another folder.',
  invalid_path: 'The NAS save path is invalid. Folders, links and special files cannot be overwritten.',
  file_too_large: 'The file is larger than 512 MiB and cannot be saved to the NAS.',
  save_failed: 'Saving to NAS failed. Your unsaved changes are still in Photo Studio.',
  forbidden: 'This NAS save request was blocked because its origin is invalid.',
  gateway_required: 'Open Photo Studio from the FNOS desktop to save to the NAS.',
  authorization_unavailable: 'FNOS could not verify write permission. Try again later.',
  invalid_request: 'The NAS save request was invalid. The original file was not changed.',
  empty_body: 'The NAS save contained no data. The original file was not changed.',
  upload_timeout: 'The NAS upload timed out. The original file was not changed.',
  unsupported_permissions: 'Photo Studio cannot safely preserve the permissions of this file. Save with a new filename instead.',
  file_changed: 'The NAS file already exists or changed since it was opened.',
  result_unknown: 'The NAS save result could not be confirmed. Keep this document open and check the file before trying again.',
};

const saveError = (code: string, current?: NasFileStat) => {
  const source = nasSaveErrorSource[code] ?? nasSaveErrorSource.save_failed;
  return new NasOpenError(source, code, localized(source), current);
};
const unknownSaveResult = () => {
  const source = 'The NAS save result could not be confirmed. Keep this document open and check the file before trying again.';
  return new NasOpenError(source, 'result_unknown', localized(source));
};

/** Returns the file version actually committed; never changes a document's save target. */
export async function saveNasToNas(path: string, blob: Blob, options: { expect?: NasFileStat; confirm?: boolean } = {}): Promise<NasFileStat> {
  if (!validNasPath(path)) throw saveError('invalid_path');
  if (!blob.size) throw saveError('empty_body');
  if (blob.size > NAS_MAX_BYTES) throw saveError('file_too_large');
  const headers: Record<string, string> = {
    ...requestHeader,
    'Content-Type': 'application/octet-stream',
    Accept: 'application/json',
  };
  if (options.expect) {
    const expect = parseNasFileStat(options.expect);
    if (!expect) throw saveError('invalid_request');
    headers[expectSizeHeader] = String(expect.size);
    headers[expectMtimeHeader] = expect.mtime;
    if (expect.revision) headers[expectRevisionHeader] = expect.revision;
  }
  if (options.confirm) {
    if (!options.expect) throw saveError('invalid_request');
    headers[overwriteHeader] = '1';
  }
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.BASE_URL}api/nas-save?${new URLSearchParams({ path })}`, {
      method: 'POST', ...fetchOptions, headers, body: blob,
    });
  } catch {
    throw unknownSaveResult();
  }
  if (response.ok) {
    if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw unknownSaveResult();
    const body = await response.json().catch(() => undefined) as { saved?: unknown; size?: unknown; mtime?: unknown; revision?: unknown } | undefined;
    const stat = parseNasFileStat(body);
    if (body?.saved !== true || !stat || stat.size !== blob.size) throw unknownSaveResult();
    return stat;
  }
  const body = await response.json().catch(() => undefined) as { code?: unknown; current?: unknown } | undefined;
  const code = typeof body?.code === 'string' && Object.hasOwn(nasSaveErrorSource, body.code) ? body.code : 'save_failed';
  throw saveError(code, code === 'file_changed' ? parseNasFileStat(body?.current) : undefined);
}

/** An overwrite confirmation is tied to the version the server just checked.
 * Another change after confirmation stops the save, never a blind retry. */
export async function saveNasConfirming(_e: Editor, path: string, blob: Blob, options: { expect?: NasFileStat } = {}): Promise<NasFileStat | undefined> {
  try {
    return await saveNasToNas(path, blob, options);
  } catch (error) {
    if (!(error instanceof NasOpenError) || error.code !== 'file_changed') throw error;
    if (!error.current) {
      const source = 'The NAS file changed, but FNOS could not provide a safe overwrite check. Choose a new filename.';
      throw new NasOpenError(source, 'file_changed', localized(source));
    }
    const current = error.current;
    const name = path.split('/').pop()!;
    const question = 'The file “{name}” already exists or has changed. Overwrite this checked version? This cannot be undone.';
    const pending = formDialog('Overwrite NAS file?', [], 'Overwrite', question);
    const message = document.querySelector('#dialog form p');
    if (message) setLocalizedText(message, question, { name }, 'message');
    if (!(await pending)) return;
    try {
      return await saveNasToNas(path, blob, { expect: current, confirm: true });
    } catch (retryError) {
      if (!(retryError instanceof NasOpenError) || retryError.code !== 'file_changed') throw retryError;
      const source = 'The NAS file changed again after confirmation. Nothing was overwritten. Save with a new filename or try again.';
      throw new NasOpenError(source, 'file_changed', localized(source));
    }
  }
}

/** Capability visibility is not permission; every save still checks its ACL. */
let nasWriteCheck: Promise<boolean> | undefined;
export function nasWriteAvailable(): Promise<boolean> {
  return nasWriteCheck ??= (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/context`, {
        ...fetchOptions, headers: { ...requestHeader, Accept: 'application/json' },
      });
      const access = response.status === 200 ? await response.json() as { nasFiles?: unknown; nasWrite?: unknown } : undefined;
      return access?.nasFiles === true && access.nasWrite === true;
    } catch {
      return false;
    }
  })();
}

/** The FNOS file picker's extension list: the same names the gateway accepts. */
const NAS_PICK_ACCEPT = NAS_FILE_EXTENSIONS.map((ext) => `.${ext}`);
const expectSizeHeader = 'X-PhotoStudio-Expect-Size';
const expectMtimeHeader = 'X-PhotoStudio-Expect-Mtime';
const expectRevisionHeader = 'X-PhotoStudio-Expect-Revision';
const overwriteHeader = 'X-PhotoStudio-Overwrite';
const NAS_PICK_GROUPS = ['myFiles', 'external'] as const;

/** The native picker can wait for user input; cancellation prevents late replies
 * from turning into a save after the user has returned to the document. */
function waitForNasPicker<T>(open: () => Promise<T>): Promise<T | undefined> {
  const dialog = document.createElement('dialog');
  dialog.className = 'fnos-dialog';
  const heading = `nas-picker-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', heading);
  dialog.innerHTML = `<h2 id="${heading}">${localizedHTML('Choose NAS folder')}</h2><p>${localizedHTML('Choose and authorize a folder in the FNOS window. Cancel returns to your unsaved document.')}</p><div class="dialog-actions"><button type="button">${localizedHTML('Cancel')}</button></div>`;
  document.body.append(dialog);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      const source = 'The FNOS folder picker timed out. No file was saved; your document is still open.';
      finish(undefined, new NasOpenError(source, 'picker_timeout', localized(source)));
    }, 120_000);
    const finish = (result?: T, error?: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      dialog.close();
      dialog.remove();
      if (error) reject(error);
      else resolve(result);
    };
    dialog.querySelector('button')!.addEventListener('click', () => finish());
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(); });
    dialog.showModal();
    void Promise.resolve().then(open).then((result) => finish(result), (error) => finish(undefined, error));
  });
}

/** The host grants directory access; the backend still checks write permission. */
export async function pickNasFolder(title: string): Promise<string | undefined> {
  const sdk = await nasSdk();
  if (!sdk || sdk.isStandaloneWeb) {
    const source = 'The NAS folder picker is available inside the FNOS desktop or app. Open Photo Studio there; your document has not been saved.';
    throw new NasOpenError(source, 'picker_unavailable', localized(source));
  }
  let result: { code: number; data: unknown } | undefined;
  try {
    result = await waitForNasPicker(() => sdk.pickUserFile({
      multiple: false,
      directory: true,
      creatable: false,
      sidebarGroup: [...NAS_PICK_GROUPS],
      title: t(title),
      okText: t('Choose folder'),
    }));
  } catch (error) {
    if (error instanceof NasOpenError) throw error;
    const source = 'FNOS could not open the folder picker. Your document is still open and unsaved.';
    throw new NasOpenError(source, 'picker_unavailable', localized(source));
  }
  if (!result || result.code === 0 && Array.isArray(result.data) && !result.data.length) return;
  if (result.code !== 0) {
    const source = 'FNOS did not authorize the selected folder. Choose a folder your account can access.';
    throw new NasOpenError(source, 'authorization_required', localized(source));
  }
  if (!Array.isArray(result.data) || result.data.length !== 1 || typeof result.data[0] !== 'string' || !validateNasFolder(result.data[0])) throw saveError('invalid_path');
  return result.data[0];
}

/** Save a new file or a copy after choosing an authorized NAS directory. */
export async function saveNasAs(e: Editor, blob: Blob, suggestedName: string): Promise<{ path: string; name: string; stat: NasFileStat } | undefined> {
  const ext = suggestedName.slice(suggestedName.lastIndexOf('.') + 1).toLowerCase();
  const name = normalizeNasFileName(suggestedName, ext);
  if (!name) throw saveError('invalid_path');
  const folder = await pickNasFolder('Choose the NAS folder to save into');
  if (!folder) return;
  const path = `${folder}/${name}`;
  if (!validNasPath(path)) throw saveError('invalid_path');
  const stat = await saveNasConfirming(e, path, blob);
  return stat ? { path, name, stat } : undefined;
}

/** Open NAS files from inside the app: the host's own picker authorizes what
 * the user chooses, and each path then goes through the read-only pipeline. */
export async function openFromNas(e: Editor) {
  const sdk = await nasSdk();
  if (!sdk) return;
  let picked: string[] | undefined;
  try {
    // The bridge answers {code, data: string[]}; undefined means the host or
    // the user canceled. SDK 0.6 types are imprecise, like authorizeUserFile.
    const result = await sdk.pickUserFile({
      multiple: true,
      directory: false,
      accept: NAS_PICK_ACCEPT,
      sidebarGroup: [...NAS_PICK_GROUPS],
      title: 'Open NAS files',
    }) as { code: number; data: unknown } | undefined;
    picked = result && result.code === 0 && Array.isArray(result.data) ? result.data.filter((x): x is string => typeof x === 'string') : undefined;
  } catch {
    return; // The host refused the picker (or lacks it): nothing to open.
  }
  if (!picked?.length) return;
  const valid = picked.filter(validNasPath);
  const skipped = picked.length - valid.length;
  let opened = 0;
  const failures: string[] = [];
  for (const path of valid) {
    if (await openNasFile(e, path)) opened++;
    else failures.push(path.split('/').pop() ?? path);
  }
  // Summaries come last: each open announces itself in the status line.
  if (skipped) e.message('{count} of the selected paths are not supported NAS files and were skipped.', { count: skipped });
  if (valid.length > 1 && opened < valid.length)
    e.message('Opened {opened} of {total} NAS files; the failed ones are listed in their dialogs.', { opened, total: valid.length });
}

export function installNasLaunch(e: Editor) {
  try {
    const path = launchNasPath(location.search);
    if (path) void openNasFile(e, path);
  } catch (error) { e.message(error instanceof Error ? error.message : 'The file open request is invalid.'); }
}
