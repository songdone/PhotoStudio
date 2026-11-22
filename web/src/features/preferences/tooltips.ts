// Interface → Show tooltips and Rich tooltips. Tooltips are the elements'
// native `title` text: turning them off moves the text aside while the
// pointer is over an element; rich tooltips extend the text of commands and
// tools with their shortcut and a description.
import type { Editor } from '../../editor';
import { findCommand, panels, tools } from '../../app/registry';
import { formatShortcut } from '../../app/shortcuts';
import { groupTools } from '../../app/toolbar';
import { t } from '../../i18n/translate';
import { onLanguageChange } from '../../i18n/locale';

// The element's own title, kept while the shown text differs from it.
const ORIGINAL = 'data-ps-title';

/** Extra lines for command buttons and toolbar tools, or ''. */
export function richTooltipText(el: HTMLElement, title: string): string {
  const toolId = el.dataset.tool;
  if (toolId && el.classList.contains('tool-slot')) {
    const tool = tools.get(toolId);
    if (!tool) return '';
    const others = groupTools(tool.group).filter((x) => x.id !== tool.id);
    return others.length ? t('Also in this slot: {names}.', { names: others.map((x) => t(x.label.replace(/ Tool$/, ''))).join(', ') }) : '';
  }
  const panelId = el.dataset.stripPanel;
  if (panelId) {
    const panel = panels.get(panelId);
    const key = formatShortcut(panel?.shortcut);
    return [key ? t('Shortcut: {key}', { key }) : '', t('Opens beside the dock; drag to rearrange.')].filter(Boolean).join('\n');
  }
  const id = el.dataset.command;
  const command = id ? findCommand(id) : undefined;
  if (!command) return '';
  const lines: string[] = [];
  const key = formatShortcut(command.shortcut);
  if (key && !title.includes(key)) lines.push(t('Shortcut: {key}', { key }));
  if (command.description && !title.includes(command.description) && !title.includes(t(command.description))) lines.push(t(command.description));
  return lines.join('\n');
}

function sync(e: Editor, el: HTMLElement) {
  // Buttons whose tooltip names their command's key follow the Keyboard
  // Shortcuts editor (and drop the key when it was removed).
  const template = el.dataset.keyTitle;
  if (template !== undefined) {
    const key = formatShortcut(findCommand(el.dataset.command ?? '')?.shortcut);
    el.setAttribute('title', template.replace('{key}', key ? ` (${key})` : ''));
    el.removeAttribute(ORIGINAL);
  }
  // The cached original always wins once present; only a title its owner set
  // again since (no longer starting with it) replaces the source.
  const title = el.getAttribute('title');
  let original = el.getAttribute(ORIGINAL);
  if (original === null) {
    if (title === null) return;
    original = title;
  } else if (title !== null && !title.startsWith(original)) {
    original = title;
    el.removeAttribute(ORIGINAL);
  }
  const p = e.preferences;
  let shown: string | null = original;
  if (!p.showTooltips) shown = null;
  else if (p.richTooltips) {
    const extra = richTooltipText(el, original);
    if (extra) shown = `${original}\n${extra}`;
  }
  if (shown === original) {
    el.setAttribute('title', original);
    el.removeAttribute(ORIGINAL);
    return;
  }
  el.setAttribute(ORIGINAL, original);
  if (shown === null) el.removeAttribute('title');
  else el.setAttribute('title', shown);
}

export function installTooltips(e: Editor) {
  document.addEventListener(
    'pointerover',
    (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>(`[title],[${ORIGINAL}]`);
      if (el) sync(e, el);
    },
    true,
  );
  // Rich tooltips are composed at hover time; re-derive them for a new
  // language (plain titles are handled by the DOM translation tracker).
  onLanguageChange(() => {
    for (const el of document.querySelectorAll<HTMLElement>(`[title],[${ORIGINAL}]`)) sync(e, el);
  });
}
