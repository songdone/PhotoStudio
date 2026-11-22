import { expect, test, type Page } from '@playwright/test';

const wasm = '**/app/photostudio/photo-engine.wasm';

async function expectFailure(page: Page, message: string) {
  const panel = page.locator('#startup');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-state', 'failed');
  await expect(panel.getByRole('status')).toContainText(message);
  await expect(panel.getByRole('link', { name: '重新加载' })).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
}

test('the packaged editor becomes ready in a same-origin iframe', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/app/photostudio/startup-test-host', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Editor frame fixture</title><iframe title="Photo Studio" src="./" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>',
  }));
  const response = page.waitForResponse((item) => item.url().endsWith('/app/photostudio/') && item.request().resourceType() === 'document');
  await page.goto('./startup-test-host');
  expect((await response).status()).toBe(200);
  const iframe = page.frameLocator('iframe[title="Photo Studio"]');
  await expect(iframe.locator('#startup')).toHaveAttribute('data-state', 'ready');
  await expect(iframe.locator('#startup')).toBeHidden();
  await expect(iframe.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(iframe.getByRole('button', { name: '打开图像', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('editor-in-frame.png') });
});

test('a missing entry script leaves a readable startup screen', async ({ page }, info) => {
  await page.route('**/app/photostudio/assets/app-*.js', (route) => route.abort());
  await page.goto('./');
  await expect(page).toHaveTitle('Photo Studio');
  await expectFailure(page, '编辑器未能加载');
  await page.screenshot({ path: info.outputPath('script-load-error.png') });
});

test('unavailable graphics produces a graphics-specific message', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined });
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, options?: unknown) {
        return type === 'webgl2' ? null : Reflect.apply(getContext, this, [type, options]);
      },
    });
  });
  await page.goto('./');
  await expectFailure(page, '图形引擎不可用');
  await page.screenshot({ path: info.outputPath('graphics-unavailable.png') });
});

test('a failed WASM download produces an image-engine message', async ({ page, context }, info) => {
  await context.route(wasm, (route) => route.fulfill({ status: 503, body: 'Temporarily unavailable' }));
  await page.goto('./');
  await expectFailure(page, '图像处理引擎未能启动');
  await page.screenshot({ path: info.outputPath('image-engine-error.png') });
});

test('valid WASM served as binary data still starts the editor', async ({ page, context }, info) => {
  let attempts = 0;
  await context.route(wasm, async (route) => {
    attempts++;
    const response = await route.fetch();
    await route.fulfill({ response, contentType: 'application/octet-stream' });
  });
  await page.goto('./');
  await expect(page.locator('#startup')).toHaveAttribute('data-state', 'ready');
  expect(attempts).toBe(1);
  await page.screenshot({ path: info.outputPath('binary-wasm-editor.png') });
});
