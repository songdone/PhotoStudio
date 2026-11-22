import { escapeXML } from '../model/assets';
import { isUserCommand, t, translateText, translateMessage, type TranslationValues } from './translate';
import { getLanguage, onLanguageChange } from './locale';

const floating = 'dialog, .popover, .menu-pop, .context-menu, .tool-flyout, .tour-card';
const excluded = [
  '[translate="no"]', '[data-i18n="off"]', '[contenteditable]:not([contenteditable="false"])',
  'canvas', 'svg', 'script', 'style', 'pre', 'code', 'kbd', 'puter-user-menu',
  '#stage', '#overlay', '#screen-overlay', '.view-preview',
  '.layer-row [data-visibility]', '.group-disclosure', '.mask-link', '.mask-thumbnail',
  '.history-row', '.history-source', '.history-snapshot', '.snapshot-row',
  '.tab-name', '.tab-meta', '.name-text', '.layer-name', '.layer-name-input',
  '.layer-select > span:not(.layer-thumbnail)',
  '.pf-docname', '.fill-properties > h3', '.prov-title', '.prov-note', '.prov-timeline', '.prov-checks',
  '.action-name', '.action-set-name', '.history-snapshot',
  '.path-name', '.channel-name', '.comp-name', '.comp-apply',
  '.tool-preset-name', '.pm-name', '.ts-name', '.relight-name',
  '.lib-name', '.lib-extra', '[data-show-library]',
  '.vt-name', '.vt-clip-label', '.vt-ap-name',
  '.gen-meta > q', '.ast-step-detail', '.ast-step-note', '.gen-reference',
  '.start-preset[data-preset^="saved-"] .start-preset-name', '.newdoc-card[data-preset^="saved-"] > strong',
  '#sp-word', '.type-font-button > span', '.type-font-list [data-family]',
  '.version-meta > strong', '.recovery-meta > strong',
  '.comment-text', '.comment-author', '.comment-mention', '.collab-person-text', '.collab-avatar',
  '.review-title > strong', '.ast-text', '.ast-summary', '.ast-plan-title',
  '.script-text', '.script-title', '.script-output', '.scripts-log-lines', '.script-log', '.script-run', '.script-dialog',
  '.script-row', '.pr-preset-list', '.dv-preset-row', '.pr-ref option', '.pr-style-ref option', '.pr-note > strong',
  '.picker-grid [title]', '.style-grid [data-style^="user-"]', '.sh-grid [data-shape^="user-"]',
  '.ds-table td', '.notes-meta', '.processor-list > li',
].join(',');

const opaqueAttributes = '.document-tab, .view-float, .view-preview, .start-recent-item, .layer-select, .layer-name, .pm-row, .tool-preset-row, .lib-item, .vt-clip, .vt-name, .version-thumb, .version-actions button, .brush-preset, .sh-grid [data-shape], [data-preset-id]';
const userSelects = [
  'select[name="document"]', 'select[name="layer"]', 'select[name="channel"]',
  'select[name="source"]', 'select[name="target"]', 'select[name="action"]',
  'select[name="set"]', 'select[name="script"]', 'select[name="preset"]',
  '[data-review="comp"]', '[data-review="artboard"]', '.font-family', '[data-property="font"]',
  '[data-pf="font"]', '[data-gl="family"]', '[data-gl="style"]', '[data-char="font"]',
  '#cs-protect', '[data-k="pattern"]', '.lib-select', 'select[name="owner"]',
  'select[name="dest"]', 'select[name="id"]', 'select[name="which"]', 'select[name="naming"]',
  '#count-group', '#type-style', '.ast-model', '.script-events select[name="target"]', '.preset-list',
].join(',');
const attributes = ['title', 'data-ps-title', 'aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'alt', 'label'];
/** Explicit app-authored bindings, honoured even inside excluded branches. */
const hasBinding = (el: Element) => attributes.some((a) => el.hasAttribute(`data-i18n-attr-${a}`));
export type TranslationKind = 'text' | 'message';
type Rendered = { source: string; shown: string };
const textSources = new WeakMap<Node, Rendered>();
const attributeSources = new WeakMap<Element, Map<string, Rendered>>();

const display = (source: string, values?: TranslationValues, kind: TranslationKind = 'text') =>
  kind === 'message' ? translateMessage(source, values) : t(source, values);

/** Source bindings survive innerHTML caching and keep parameters opaque. */
export function localizedHTML(source: string, values?: TranslationValues, kind: TranslationKind = 'text'): string {
  return `<span data-i18n-source="${escapeXML(source)}" data-i18n-kind="${kind}"${values ? ` data-i18n-values="${escapeXML(JSON.stringify(values))}"` : ''}>${escapeXML(display(source, values, kind))}</span>`;
}

export function localizedAttribute(attribute: string, source: string, values?: TranslationValues, kind: TranslationKind = 'text'): string {
  if (!attributes.includes(attribute)) throw new Error('Unsupported localized attribute');
  return `${attribute}="${escapeXML(display(source, values, kind))}" data-i18n-attr-${attribute}="${escapeXML(source)}"${values ? ` data-i18n-values-${attribute}="${escapeXML(JSON.stringify(values))}"` : ''} data-i18n-kind-${attribute}="${kind}"`;
}

export function setLocalizedText(el: Element, source: string, values?: TranslationValues, kind: TranslationKind = 'message'): void {
  el.setAttribute('data-i18n-source', source);
  el.setAttribute('data-i18n-kind', kind);
  if (values) el.setAttribute('data-i18n-values', JSON.stringify(values));
  else el.removeAttribute('data-i18n-values');
  const next = display(source, values, kind);
  if (el.textContent !== next) el.textContent = next;
}

function valuesOf(el: Element, name: string): TranslationValues | undefined {
  const text = el.getAttribute(name);
  if (!text) return;
  try {
    const values: unknown = JSON.parse(text);
    if (values && typeof values === 'object' && !Array.isArray(values) && Object.values(values).every((v) => typeof v === 'string' || typeof v === 'number')) return values as TranslationValues;
  } catch {
    // A malformed optional binding never changes user data.
  }
}

function localizeAttributes(el: Element, opaque: boolean): void {
  let saved = attributeSources.get(el);
  if (!saved) attributeSources.set(el, saved = new Map());
  for (const attribute of attributes) {
    const bound = el.getAttribute(`data-i18n-attr-${attribute}`);
    const current = el.getAttribute(attribute);
    if (bound !== null) {
      const next = display(bound, valuesOf(el, `data-i18n-values-${attribute}`), el.getAttribute(`data-i18n-kind-${attribute}`) === 'message' ? 'message' : 'text');
      if (current !== next) el.setAttribute(attribute, next);
    } else if (!opaque && current !== null) {
      const previous = saved.get(attribute);
      const source = previous && current === previous.shown ? previous.source : current;
      const next = translateText(source);
      saved.set(attribute, { source, shown: next });
      if (current !== next) el.setAttribute(attribute, next);
    } else if (current === null) saved.delete(attribute);
  }
}

/** Update presentation only: never replace controls, submitted values or names. */
export function localizeUI(root: Element): void {
  if (root.closest('[translate="no"], [data-i18n="off"]')) return;
  if (root.closest(excluded) && !root.hasAttribute('data-i18n-source') && !hasBinding(root)) return;
  visit(root);
  function visit(el: Element): void {
    if (el.matches('[translate="no"], [data-i18n="off"]') || el.getAttribute('data-i18n-off') === 'yes') return;
    const source = el.getAttribute('data-i18n-source');
    if (source !== null) {
      const next = display(source, valuesOf(el, 'data-i18n-values'), el.getAttribute('data-i18n-kind') === 'message' ? 'message' : 'text');
      if (el.textContent !== next) el.textContent = next;
      localizeAttributes(el, el.matches(opaqueAttributes));
      return;
    }
    if (el.matches(excluded)) {
      // Explicit app-authored attribute bindings still refresh inside excluded
      // branches (canvas hints, layer-row buttons); content and every other
      // attribute stay untouched.
      if (hasBinding(el)) localizeAttributes(el, true);
      return;
    }
    if (el.closest(userSelects) && !(el instanceof HTMLSelectElement) && !el.hasAttribute('data-i18n-source')) return;
    const command = el.getAttribute('data-command');
    if (command && isUserCommand(command)) return;
    if (el instanceof HTMLOptionElement && !el.hasAttribute('data-i18n-source') && (el.closest(userSelects) || /^(?:user:|doc:|layer:|channel:|snapshot:|user-)/.test(el.value))) return;
    localizeAttributes(el, el.matches(opaqueAttributes));
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.matches('[data-i18n-opaque-label]')) return;
    if (el instanceof HTMLOptionElement && !el.hasAttribute('value')) el.setAttribute('value', el.value);
    for (const child of [...el.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element);
      else if (child.nodeType === Node.TEXT_NODE) {
        const current = child.nodeValue ?? '';
        const previous = textSources.get(child);
        const source = previous && current === previous.shown ? previous.source : current;
        const next = el.matches('#status, #toast') ? translateMessage(source) : translateText(source);
        textSources.set(child, { source, shown: next });
        if (current !== next) child.nodeValue = next;
      }
    }
  }
  for (const dialog of [root, ...root.querySelectorAll('dialog')]) {
    if (!(dialog instanceof HTMLDialogElement) || dialog.getAttribute('data-auto-label') !== 'yes') continue;
    const heading = dialog.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.replace(/\s+/g, ' ').trim();
    if (heading && dialog.getAttribute('aria-label') !== heading) dialog.setAttribute('aria-label', heading);
  }
}

export interface LocalizedUI {
  refresh(root?: Element): void;
  disconnect(): void;
}
export type ChineseUI = LocalizedUI;

/** Watches only application-owned branches; source bindings make refresh reversible. */
export function installUI(root: HTMLElement): LocalizedUI {
  const doc = root.ownerDocument;
  const roots = new Set<Element>([root]);
  let stopped = false;
  const observe = () => {
    for (const el of roots) observer.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes, ...attributes.map((a) => `data-i18n-attr-${a}`), 'data-i18n-source', 'data-i18n-values'] });
  };
  const process = (elements: Iterable<Element>) => {
    observer.disconnect();
    doc.documentElement.lang = getLanguage();
    for (const el of elements) if (el.isConnected || el === root) localizeUI(el);
    for (const el of roots) if (el !== root && !el.isConnected) roots.delete(el);
    if (!stopped) observe();
  };
  const observer = new MutationObserver((records) => {
    const changed = new Set<Element>();
    for (const record of records) {
      const el = record.target.nodeType === Node.ELEMENT_NODE ? record.target as Element : record.target.parentElement;
      if (!el || (el.closest(excluded) && !el.hasAttribute('data-i18n-source') && !hasBinding(el))) continue;
      if (record.type === 'childList') {
        for (const added of record.addedNodes) {
          const branch = added.nodeType === Node.ELEMENT_NODE ? added as Element : added.parentElement;
          if (branch) changed.add(branch);
        }
      } else changed.add(el);
    }
    process(changed);
  });
  const discover = (el: Element) => {
    if (root.contains(el) || [...roots].some((r) => r.contains(el))) return;
    roots.add(el);
    process([el]);
  };
  const bodyObserver = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      if (el.matches(floating)) discover(el);
      else for (const child of el.querySelectorAll(floating)) discover(child);
    }
  });
  process([root]);
  for (const el of doc.body.querySelectorAll(floating)) discover(el);
  bodyObserver.observe(doc.body, { childList: true });
  const unsubscribe = onLanguageChange(() => process(roots));
  return {
    refresh: (el) => { if (!stopped) process(el ? [el] : roots); },
    disconnect: () => { stopped = true; unsubscribe(); observer.disconnect(); bodyObserver.disconnect(); roots.clear(); },
  };
}

export const installChineseUI = installUI;
