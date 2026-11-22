import './compat/browser';
import './style.css';
import { Editor, type StartupStage } from './editor';
import { emitAppEvent } from './app/app-events';
import { installLaunchOpen } from './features/files/launch';
import { installUI } from './i18n/dom';
import { readUILanguage, onLanguageChange, setLanguage } from './i18n/locale';
import { t } from './i18n/translate';

const root = document.querySelector<HTMLElement>('#app')!;
const startup = document.querySelector<HTMLElement>('#startup')!;
const status = document.querySelector<HTMLElement>('#startup-status')!;
setLanguage(readUILanguage());
startup.dataset.state = 'starting';

const loading: Record<StartupStage, string> = {
  editor: 'Preparing the editor…',
  graphics: 'Starting the graphics engine…',
  image: 'Starting the image engine…',
};
const failed: Record<StartupStage, string> = {
  editor: 'The editor could not be started. Reload the page or try a newer browser.',
  graphics: 'The graphics engine is unavailable. Enable hardware acceleration or use a browser that supports WebGL2.',
  image: 'The image engine could not be started. Reload the page or try a newer browser.',
};

async function start() {
  let editor: Editor | undefined;
  let ui: ReturnType<typeof installUI> | undefined;
  let stage: StartupStage = 'editor';
  let startupMessage = loading[stage];
  const updateStartup = () => { status.textContent = t(startupMessage); };
  const unsubscribeStartup = onLanguageChange(updateStartup);
  updateStartup();
  try {
    editor = new Editor(root);
    ui = installUI(root);
    await editor.start((next) => {
      stage = next;
      startupMessage = loading[next];
      updateStartup();
    });
  } catch (error) {
    startup.dataset.state = 'failed';
    startupMessage = failed[stage];
    updateStartup();
    console.error(error);
    unsubscribeStartup();
    ui?.disconnect();
    editor?.engine?.dispose();
    editor?.renderer?.dispose();
    return;
  }

  unsubscribeStartup();
  const installedUI = ui!;
  import.meta.hot?.dispose(() => installedUI.disconnect());
  if (import.meta.env.DEV) (window as unknown as { photoStudio: Editor }).photoStudio = editor;
  startup.dataset.state = 'ready';
  startup.hidden = true;
  root.inert = false;
  void emitAppEvent('start');
  installLaunchOpen(editor!);
}

void start();
