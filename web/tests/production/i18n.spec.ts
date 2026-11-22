import { test, expect } from '@playwright/test';
import { layer, newDocument } from '../../src/model/document';
import { photoFile } from '../browser/helpers';

test('new documents use a Chinese default name and close label', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: '新建文档', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建文档', exact: true });
  await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('未命名');
  await dialog.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.locator('#document-name')).toHaveText('未命名');
  await expect(page.locator('.document-tab.focused .tab-close')).toHaveAttribute('aria-label', /^关闭 未命名 @/);
  const properties = page.getByRole('tabpanel', { name: '属性', exact: true });
  await expect(properties).toContainText('像素图层');
  await expect(properties.getByRole('textbox', { name: '图层名称', exact: true })).toHaveValue('Layer 1');
  await expect(properties.getByRole('heading', { name: '对齐与分布', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('new-document-zh.png') });
});

test('Chinese UI keeps user layer names that match dictionary terms unchanged', async ({ page }) => {
  await page.route('https://js.puter.com/**', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.puter={env:"app",auth:{isSignedIn:()=>true}};' }));
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  const doc = newDocument(120, 80, 'Save');
  doc.layers = [layer('solid', 'Save', 40, 30), layer('solid', 'Background', 40, 30)];
  const file = photoFile(doc, [], 'Background.photo');
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.locator('.document-tab.focused')).toContainText('Save');
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#layers')).toBeVisible();

  const layerList = page.locator('#layers');
  await expect(layerList.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(layerList.getByRole('button', { name: 'Background', exact: true })).toBeVisible();
  await expect(layerList.locator('.name-text').filter({ hasText: /^Save$/ })).toBeVisible();
  await expect(layerList.locator('.name-text').filter({ hasText: /^Background$/ })).toBeVisible();
  await expect(page.locator('#document-name')).toHaveText('Save');
  await expect(page.locator('.document-tab.focused .tab-close')).toHaveAttribute('aria-label', /^关闭 Save @/);
  await expect(page.locator('.document-tab.focused .tab-close')).toHaveAttribute('title', '关闭');
});
