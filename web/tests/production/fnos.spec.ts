import { test, expect } from '@playwright/test';
import metadata from '../../package.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';
import { layer, newDocument } from '../../src/model/document';
import { photoFile } from '../browser/helpers';

const { version } = metadata;

test('release version is visible in the status bar and About with a matching source download', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(page.locator('#app-version')).toHaveText(`v${version}`);
  await expect(page.locator('#app-version')).toBeVisible();
  await page.getByRole('menuitem', { name: '帮助', exact: true }).click();
  await page.locator('[data-command="help.about"]').click();
  const about = page.getByRole('dialog', { name: `Photo Studio ${version}`, exact: true });
  await expect(about).toBeVisible();
  await page.screenshot({ path: info.outputPath('about-version.png') });
  await page.keyboard.press('Escape');
  await expect(about).not.toBeVisible();
  await page.getByRole('menuitem', { name: '帮助', exact: true }).click();
  await page.locator('[data-command="help.legal"]').click();
  const source = page.locator(`a[href$="/source/photo-studio-${version}-source.zip"]`);
  await expect(source).toBeVisible();
  const archive = await page.request.get((await source.getAttribute('href'))!);
  expect(archive.ok()).toBe(true);
  expect((await archive.body()).subarray(0, 4).toString('hex')).toBe('504b0304');
});


test('coffee dialog shows original local images and the requested copy', async ({ page }, info) => {
  const external: string[] = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(String(info.project.use.baseURL)).origin) external.push(request.url()); });
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: '请作者喝杯咖啡', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '请作者喝杯咖啡 ☕', exact: true });
  await expect(dialog).toContainText('心意随意，开心创作。');
  await expect(dialog).not.toContainText('扫码时记得');
  await expect(dialog).not.toContainText('飞牛版本');
  await expect(dialog).not.toContainText('开发者');
  await expect(dialog).not.toContainText('HeyPuter');
  const images = dialog.getByRole('img');
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 100)).toBe(true);
  await page.screenshot({ path: info.outputPath('coffee-dialog.png') });
  expect(external).toEqual([]);
  await dialog.getByRole('button', { name: '继续创作', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test('local project opens, saves and exports without a Puter account', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  const doc = newDocument(120, 80, '咖啡测试');
  const red = layer('solid', 'Save', 120, 80);
  red.color = '#ef4444';
  doc.layers = [red];
  await page.locator('#file-input').setInputFiles(photoFile(doc, [], '咖啡测试.photo'));
  await expect(page.locator('#document-name')).toHaveText('咖啡测试');
  await expect(page.locator('#layers .name-text')).toHaveText('Save');
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await page.screenshot({ path: info.outputPath('local-project.png') });
  const savedPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  const saved = await savedPromise;
  expect(saved.suggestedFilename()).toBe('咖啡测试.photo');
  const bytes = await readFile((await saved.path())!);
  expect(bytes.subarray(0, 8).toString()).toBe('PHOTO001');
  const reopened = JSON.parse(bytes.subarray(12, 12 + bytes.readUInt32LE(8)).toString());
  expect(reopened.document.layers[0].name).toBe('Save');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '导出为', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('button[data-act="export"]')).toBeEnabled();
  await page.screenshot({ path: info.outputPath('export-dialog.png') });
  const exportedPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出', exact: true }).click();
  const exported = await exportedPromise;
  expect(exported.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile((await exported.path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(120);
  expect(png.readUInt32BE(20)).toBe(80);
  expect(errors).toEqual([]);
});
