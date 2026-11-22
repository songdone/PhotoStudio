import { TrimApp } from '@trimjs/web-app';
import { AUTH_PENDING_KEY, NAS_APP_NAME, NAS_AUTH_METHOD, validAuthState, validPendingAuth } from './fnos-path';
import { readUILanguage, onLanguageChange, setLanguage } from '../../i18n/locale';
import { t } from '../../i18n/translate';
import { setLocalizedText } from '../../i18n/dom';

const status = document.querySelector<HTMLElement>('#auth-status')!;
const title = document.querySelector<HTMLElement>('#auth-title')!;
const back = document.querySelector<HTMLAnchorElement>('#return-to-editor')!;
const titleSource = 'File authorization';
let backSource = 'Return to Photo Studio';
let statusSource = 'Processing authorization…';
setLanguage(readUILanguage());
const render = () => {
  document.documentElement.lang = readUILanguage();
  document.title = t('Photo Studio — File authorization');
  setLocalizedText(title, titleSource, undefined, 'text');
  setLocalizedText(back, backSource, undefined, 'text');
  setLocalizedText(status, statusSource, undefined, 'message');
};
render();
onLanguageChange(render);

try {
  const params = new URLSearchParams(location.search);
  // Keep callback state and file names out of subsequent navigation referrers.
  history.replaceState(null, '', location.pathname);
  const result = new TrimApp().parseAppAuthCallback(params);
  if (!validAuthState(result.state) || ['state', 'appName', 'method', 'status', 'path'].some((key) => params.getAll(key).length > 1)) {
    throw new Error('Authorization details are invalid. Return to the editor and authorize again.');
  }
  const pending: unknown = JSON.parse(sessionStorage.getItem(AUTH_PENDING_KEY) ?? 'null');
  if (!validPendingAuth(pending) || result.state !== pending.state || result.appName !== NAS_APP_NAME || result.method !== NAS_AUTH_METHOD) {
    throw new Error('Authorization has expired or does not match this file. Return to the editor and authorize again.');
  }
  sessionStorage.removeItem(AUTH_PENDING_KEY);
  if (result.status !== 'success') {
    throw new Error(result.status === 'cancel' ? 'Authorization was canceled. The original file was not changed.' : 'File authorization was not completed. Return to the editor and try again.');
  }
  if (result.path?.length !== 1 || result.path[0] !== pending.path) {
    throw new Error('The authorization result does not match the selected file. Authorize again.');
  }
  const editor = new URL(import.meta.env.BASE_URL, location.origin);
  editor.searchParams.set('path', pending.path);
  back.href = editor.href;
  backSource = 'Open file';
  statusSource = 'Authorization complete.';
  render();
} catch (error) {
  const message = error instanceof DOMException || !(error instanceof Error) || error instanceof SyntaxError
    ? 'Photo Studio could not confirm authorization. Return to the editor and try again.' : error.message;
  statusSource = message;
  render();
}
