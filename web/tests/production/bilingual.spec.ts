// Bilingual UI: the language preference switches the whole interface in place,
// persists across reloads, and never renames user documents or layers.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { layer, newDocument } from '../../src/model/document';
import { photoFile } from '../browser/helpers';

function menuItem(scope: Locator, label: string | RegExp) {
  const source = label instanceof RegExp ? label.source : label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return scope
    .locator(':scope > .menu-item')
    .filter({ has: scope.page().locator(':scope > .menu-label', { hasText: new RegExp(`^${source}$`) }) });
}

async function openPreferences(page: Page) {
  await page.getByRole('menubar').getByRole('menuitem', { name: /编辑|Edit/ }).click();
  const editMenu = page.locator('.menubar-entry.open > .menu-pop');
  await menuItem(editMenu, /首选项…|Preferences…/).click();
  const prefs = page.locator('dialog.prefs-window');
  await expect(prefs).toBeVisible();
  return prefs;
}

const userNamesDoc = () => {
  const doc = newDocument(160, 120, 'Save');
  doc.layers = [layer('solid', 'Background', 80, 60), layer('solid', 'Save', 40, 30)];
  return doc;
};

test('switching to English relabels the interface in place and keeps user names', async ({ page }, info) => {
  await page.route('https://js.puter.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.puter={};' }),
  );
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.locator('#file-input').setInputFiles(photoFile(userNamesDoc(), [], 'Save.photo'));
  await expect(page.locator('.document-tab.focused')).toContainText('Save');
  await expect(page.locator('#document-name')).toHaveText('Save');

  const prefs = await openPreferences(page);
  await prefs.getByRole('button', { name: '界面', exact: true }).click();
  const language = prefs.getByLabel('界面语言', { exact: true });
  await expect(language).toHaveValue('zh-CN');
  await expect(language.locator('option')).toHaveText(['简体中文', 'English']);

  await language.selectOption('en');
  // The whole workspace relabels without a reload.
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: 'File', exact: true })).toBeVisible();
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: 'Layer', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(prefs.getByRole('button', { name: 'Interface', exact: true })).toBeVisible();
  await expect(prefs.getByLabel('UI language', { exact: true })).toHaveValue('en');
  // The language choices keep their own names in both languages.
  await expect(prefs.getByLabel('UI language', { exact: true }).locator('option')).toHaveText(['简体中文', 'English']);

  // User data keeps its names; presentation-only labels follow the language.
  await expect(page.locator('#document-name')).toHaveText('Save');
  const layers = page.locator('#layers');
  await expect(layers.locator('.name-text').filter({ hasText: /^Save$/ })).toBeVisible();
  await expect(layers.locator('.name-text').filter({ hasText: /^Background$/ })).toBeVisible();
  await expect(page.locator('.document-tab.focused .tab-close')).toHaveAttribute('aria-label', /^Close Save @/);
  await expect(page.locator('.document-tab.focused .tab-close')).toHaveAttribute('title', 'Close');
  await expect(page.locator('.eye:visible').first()).toHaveAttribute('aria-label', /^Hide (Save|Background)$/);
  await expect(page.locator('#doc-info')).toHaveAttribute('aria-label', /^Document Sizes/);

  // Keep the language, then open new UI: it is English, including creation defaults.
  await prefs.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(prefs).toHaveCount(0);
  await page.getByRole('menubar').getByRole('menuitem', { name: 'File', exact: true }).click();
  const fileMenu = page.locator('.menubar-entry.open > .menu-pop');
  await menuItem(fileMenu, 'New…').click();
  const dialog = page.getByRole('dialog', { name: 'New Document', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Untitled');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('english-ui.png') });

  // Back to Chinese in the same session: the interface flips again and the
  // unsaved document with its user names stays exactly as it was.
  const prefsAgain = await openPreferences(page);
  await prefsAgain.getByLabel('UI language', { exact: true }).selectOption('zh-CN');
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.document-tab.focused .tab-close')).toHaveAttribute('aria-label', /^关闭 Save @/);
  await expect(page.locator('#document-name')).toHaveText('Save');
  await expect(page.locator('#layers .name-text').filter({ hasText: /^Background$/ })).toBeVisible();
  await prefsAgain.getByRole('button', { name: '完成', exact: true }).click();
  await page.screenshot({ path: info.outputPath('back-to-chinese.png') });

  // The saved choice survives a reload (the unsaved document does not).
  await page.reload();
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('cancelling the preferences window restores the previous language at once', async ({ page }) => {
  await page.route('https://js.puter.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.puter={};' }),
  );
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true })).toBeVisible();

  const prefs = await openPreferences(page);
  await prefs.getByRole('button', { name: '界面', exact: true }).click();
  await prefs.getByLabel('界面语言', { exact: true }).selectOption('en');
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: 'File', exact: true })).toBeVisible();
  await prefs.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

  // Nothing was saved: a fresh start is Chinese again.
  await page.reload();
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true })).toBeVisible();
});
