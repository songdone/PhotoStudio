import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const unsupportedMaskPsd = new URL('../fixtures/psd-masks/8.psd', import.meta.url);
const importNotice =
  '此 PSD 包含暂不支持的蒙版、效果或合成方式，已将文件中保存的合成图像作为单个像素图层打开。';
const retainedOriginalNotice =
  '保存为 .photo 项目可保留完整原文件。未修改预览时，导出 PSD 会保留原始图层。修改预览后，请保存为 .photo 项目或导出为 PNG 以保留更改。选择“文件 → 导出 → 下载原始 PSD”可获取不含预览更改的原文件。';
const editedPreviewNotice =
  '此预览已编辑，但暂时无法将更改写回原始 PSD 的图层。请保存为 .photo 项目或导出为 PNG，以保留这些更改。选择“文件 → 导出 → 下载原始 PSD”可获取原文件，其中不包含对预览的更改。';

function menuItem(scope: Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return scope
    .locator(':scope > .menu-item')
    .filter({ has: scope.page().locator(':scope > .menu-label', { hasText: new RegExp(`^${escaped}$`) }) });
}

async function clickFileExport(page: Page, label: string) {
  await page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true }).click();
  const fileMenu = page.locator('.menubar-entry.open > .menu-pop');
  const exportMenu = menuItem(fileMenu, '导出');
  await expect(exportMenu).toHaveCount(1);
  await exportMenu.hover();
  const exportSubmenu = exportMenu.locator(':scope > .submenu');
  const command = menuItem(exportSubmenu, label);
  await expect(command).toHaveCount(1);
  await command.click();
}

test('mask fallback PSD import is Chinese and edited previews cannot export as PSD', async ({ page }, info) => {
  const fixture = await readFile(unsupportedMaskPsd);
  await page.route('https://js.puter.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.puter={};' }),
  );
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);

  await page.locator('#file-input').setInputFiles({
    name: '8.psd',
    mimeType: 'application/octet-stream',
    buffer: fixture,
  });

  const dialog = page.locator('#dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-label', 'PSD 导入');
  const paragraphs = dialog.locator('p');
  await expect(paragraphs).toHaveText([importNotice, retainedOriginalNotice]);
  await expect(dialog).not.toContainText(
    /\b(?:This|Its|The|After|Download|File|Save|Export|Preview|Original)\b/i,
  );
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('psd-import-zh.png') });
  await dialog.getByRole('button', { name: '完成', exact: true }).click();
  await expect(dialog).toBeHidden();

  let downloads = 0;
  page.on('download', () => downloads++);
  const [originalDownload] = await Promise.all([
    page.waitForEvent('download'),
    clickFileExport(page, '下载原始 PSD'),
  ]);
  expect(await readFile((await originalDownload.path())!)).toEqual(fixture);
  await expect(page.locator('#toast')).toContainText('已下载原始 PSD');
  expect(downloads).toBe(1);

  const opacity = page.locator('#opacity');
  await opacity.fill('50');
  await opacity.dispatchEvent('change');
  await clickFileExport(page, '导出 PSD');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-label', 'PSD 导出');
  await expect(dialog.locator('p')).toHaveText(editedPreviewNotice);
  await expect(dialog.locator('p')).not.toContainText(
    /\b(?:This|Its|The|After|Download|File|Save|Export|Preview|Original)\b/i,
  );
  await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeVisible();
  expect(downloads).toBe(1);
  await page.screenshot({ path: info.outputPath('psd-edited-export-zh.png') });
});
