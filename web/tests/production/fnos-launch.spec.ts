import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { encodePng } from '../../src/features/files/png';
import { AUTH_MAX_AGE } from '../../src/features/files/fnos-path';

const gateway = '/app/photostudio';
const fileAPI = `**${gateway}/api/nas-file?*`;
const authRoute = '**/app-auth/authorize-user-file?*';
const launch = (path: string) => `./?${new URLSearchParams({ path })}`;
const photoPath = '/vol1/1000/图片/咖啡.png';

function png() {
  const data = new Uint8Array(20 * 10 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set([239, 68, 71, 255], i);
  }
  return Buffer.from(encodePng({ width: 20, height: 10, data, channels: 4 }));
}

async function allowGateway(page: Page) {
  await page.route(`**${gateway}/api/context`, async (route) => {
    expect(route.request().headers()['x-photostudio-request']).toBe('1');
    await route.fulfill({ json: { nasFiles: true, nasWrite: true } });
  });
}

for (const sample of [
  { filename: '海报 + 100%.psd', fixture: 'layer-order.psd', layers: 5 },
  { filename: '分层样本.psb', fixture: 'psd-masks/16.psb' },
]) {
  test(`file-manager launch opens ${sample.filename} with its layers`, async ({ page }, info) => {
    const path = `/vol1/1000/照片/${sample.filename}`;
    const bytes = await readFile(`tests/fixtures/${sample.fixture}`);
    let reads = 0;
    await allowGateway(page);
    await page.route(fileAPI, async (route) => {
      reads++;
      expect(new URL(route.request().url()).searchParams.get('path')).toBe(path);
      expect(route.request().headers()['x-photostudio-request']).toBe('1');
      expect(route.request().headers()['x-trim-userid']).toBeUndefined();
      await route.fulfill({ contentType: 'application/octet-stream', body: bytes });
    });

    await page.goto(launch(path));
    await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
    await expect(page.locator('.document-tab.focused')).toContainText(sample.filename.replace(/\.ps[db]$/, ''));
    const layers = page.locator('#layers .name-text');
    if (sample.layers) {
      await expect(layers).toHaveCount(sample.layers);
      await page.screenshot({ path: info.outputPath('nas-layered-file.png') });
    } else await expect(layers.first()).toBeVisible();
    expect(reads).toBe(1);
  });
}

test('file-manager launch opens a PNG and saves an unlinked project', async ({ page }) => {
  await allowGateway(page);
  await page.route(fileAPI, async (route) => {
    expect(new URL(route.request().url()).searchParams.get('path')).toBe(photoPath);
    await route.fulfill({ contentType: 'application/octet-stream', body: png() });
  });
  await page.goto(launch(photoPath));
  await expect(page.locator('#document-name')).toHaveText('咖啡');
  await expect(page.locator('#layers .name-text')).toHaveText('Background');
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  const pendingSave = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  const saved = await pendingSave;
  expect(saved.suggestedFilename()).toBe('咖啡.photo');
  expect((await readFile((await saved.path())!)).subarray(0, 8).toString()).toBe('PHOTO001');
});

test('localhost TCP uses the actual backend and does not request NAS file bytes', { tag: '@native-fnos' }, async ({ page }) => {
  let reads = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === `${gateway}/api/nas-file`) reads++; });
  const capability = page.waitForResponse((response) => new URL(response.url()).pathname === `${gateway}/api/context`);
  await page.goto(launch(photoPath));
  expect(await (await capability).json()).toEqual({ nasFiles: false, nasWrite: false });
  const dialog = page.getByRole('dialog', { name: '打开 NAS 文件' });
  await expect(dialog).toContainText('请从飞牛桌面或文件管理器打开');
  await expect(dialog.getByRole('button', { name: '授权并打开' })).toHaveCount(0);
  expect(reads).toBe(0);
});

test('an ACL denial offers authorization, and cancel does not reread', async ({ page }, info) => {
  let reads = 0;
  await allowGateway(page);
  await page.route(fileAPI, (route) => {
    reads++;
    return route.fulfill({ status: 403, json: { code: 'access_denied', message: '当前账号尚不能读取此文件。' } });
  });
  await page.goto(launch(photoPath));
  const dialog = page.getByRole('dialog', { name: '打开 NAS 文件' });
  await expect(dialog.getByRole('button', { name: '授权并打开' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '重试打开' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('nas-authorization-dialog.png') });
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).not.toBeVisible();
  expect(reads).toBe(1);
});

for (const outcome of ['success', 'cancel', 'wrong file', 'expired'] as const) {
  test(`standalone fnOS authorization callback: ${outcome}`, async ({ page }) => {
    let reads = 0;
    let approved = false;
    let callbackURL: string | undefined;
    await allowGateway(page);
    await page.route(fileAPI, async (route) => {
      reads++;
      expect(new URL(route.request().url()).searchParams.get('path')).toBe(photoPath);
      if (!approved) {
        await route.fulfill({ status: 403, json: { code: 'authorization_required', message: 'Photo Studio 还没有读取此文件的权限。' } });
        return;
      }
      await route.fulfill({ contentType: 'application/octet-stream', body: png() });
    });
    // Mock the platform's browser authorization page, not the app or SDK.
    await page.route(authRoute, async (route) => {
      const req = new URL(route.request().url());
      const state = req.searchParams.get('state');
      expect(req.searchParams.get('appName')).toBe('photostudio');
      expect(req.searchParams.get('path')).toBe(photoPath);
      expect(req.searchParams.get('redirectUri')).toBe(`${gateway}/callback.html`);
      expect(state).toMatch(/^[a-f0-9-]{36}$/);
      approved = outcome === 'success';
      const callback = new URL(req.searchParams.get('redirectUri')!, req.origin);
      callback.search = new URLSearchParams({
        state: state!, appName: 'photostudio', method: 'authorizeUserFile',
        status: outcome === 'cancel' ? 'cancel' : 'success',
        path: JSON.stringify([outcome === 'wrong file' ? '/vol1/1000/other.png' : photoPath]),
      }).toString();
      callbackURL = callback.href;
      if (outcome === 'expired') {
        const href = callbackURL.replaceAll('&', '&amp;');
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<a href="${href}">确认授权</a>` });
      } else await route.fulfill({ status: 302, headers: { location: callbackURL } });
    });

    await page.goto(launch(photoPath));
    await page.getByRole('button', { name: '授权并打开' }).click();
    if (outcome === 'expired') {
      // Advance the clock on the loaded mock page, not in a pending navigation.
      const confirm = page.getByRole('link', { name: '确认授权' });
      await expect(confirm).toBeVisible();
      await page.clock.setFixedTime(Date.now() + AUTH_MAX_AGE + 30_000);
      await confirm.click();
    }
    const status = page.locator('#auth-status');
    const message = {
      success: '已完成授权', cancel: '已取消授权', 'wrong file': '授权结果与选中的文件不一致', expired: '授权已过期或与本次文件不匹配',
    }[outcome];
    await expect(status).toContainText(message);
    expect(reads).toBe(1);
    if (outcome !== 'success') {
      await expect(page.getByRole('link', { name: '打开文件' })).toHaveCount(0);
      return;
    }
    await page.getByRole('link', { name: '打开文件' }).click();
    await expect(page.locator('#document-name')).toHaveText('咖啡');
    expect(reads).toBe(2);
    await page.goto(callbackURL!);
    await expect(status).toContainText('授权已过期或与本次文件不匹配');
    await expect(page.getByRole('link', { name: '打开文件' })).toHaveCount(0);
    expect(reads).toBe(2);
  });
}

test('invalid or duplicate launch paths stop before gateway requests', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => { if (request.url().includes(`${gateway}/api/`)) requests++; });
  const params = new URLSearchParams();
  params.append('path', '/vol1/1000/photo.png');
  params.append('path', '/vol1/1000/other.png');
  await page.goto(`./?${params}`);
  await expect(page.locator('#status')).toContainText('文件路径或格式无效');
  expect(requests).toBe(0);
});

// The in-app NAS picker: the host SDK's pickUserFile authorizes what the user
// chooses. The production bundle ships the SDK inside its chunks, so the fake
// sits one layer down, at the transport the SDK actually calls: the Flutter
// bridge's double-encoded JSON (`callHandler` returns "{result: \"<json>\"}").
async function fakeBridge(page: Page, pickResponse: unknown) {
  await page.addInitScript((response) => {
    (window as unknown as { flutter_inappwebview: unknown }).flutter_inappwebview = {
      _platformReady: true,
      callHandler: (name: string, ...args: string[]) => {
        if (name === 'getAppMessage')
          return Promise.resolve(JSON.stringify({ result: JSON.stringify({ appApi: 'v1.0' }) }));
        if (name === 'pickUserFile') {
          const w = window as unknown as { __pickParams?: unknown; __pickCalls?: number };
          w.__pickParams = JSON.parse(args[0]);
          w.__pickCalls = (w.__pickCalls ?? 0) + 1;
          const pending = (window as unknown as { __pickResponse?: unknown }).__pickResponse;
          return Promise.resolve(pending === undefined ? '' : JSON.stringify({ result: JSON.stringify(pending) }));
        }
        return Promise.resolve('');
      },
    };
    (window as unknown as { __pickResponse?: unknown }).__pickResponse = response;
  }, pickResponse);
}

test.describe('in-app NAS picker', () => {
  // The SDK takes its mobile bridge only with the fnOS app's user-agent marker.
  test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) FNOS/1.2.0903 FNAppType/main FNAppVer/1.0.0' });

  test('the start-screen NAS button opens every picked file through the read pipeline', async ({ page }) => {
  const paths = ['/vol1/1000/照片/甲.png', '/vol1/1000/照片/乙.png'];
  const reads: string[] = [];
  await allowGateway(page);
  await page.route(fileAPI, async (route) => {
    const path = new URL(route.request().url()).searchParams.get('path')!;
    reads.push(path);
    await route.fulfill({ contentType: 'application/octet-stream', body: png() });
  });
  await fakeBridge(page, { code: 0, data: paths });
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: /从 NAS 打开|Open from NAS/ }).click();
  await expect(page.locator('.document-tab.focused')).toContainText('乙');
  // The first file reuses the editor's initial empty session; the second adds one.
  const tabs = page.locator('.document-tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.filter({ hasText: '甲' })).toBeVisible();
  // The picker got the full whitelist and multi-select; reads happened in order.
  const params = await page.evaluate(() => (window as unknown as { __pickParams?: Record<string, unknown> }).__pickParams);
  expect(params).toMatchObject({ multiple: true, directory: false, sidebarGroup: ['myFiles', 'external'] });
  expect(params?.accept).toEqual(expect.arrayContaining(['.psd', '.png', '.photo']));
  expect(reads).toEqual(paths);
});

test('a canceled picker makes no file requests', async ({ page }) => {
  let reads = 0;
  await allowGateway(page);
  await page.route(fileAPI, async (route) => {
    reads++;
    await route.fulfill({ contentType: 'application/octet-stream', body: png() });
  });
  await fakeBridge(page, undefined);
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: /从 NAS 打开|Open from NAS/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pickCalls?: number }).__pickCalls ?? 0)).toBeGreaterThan(0);
  expect(reads).toBe(0);
  // The editor keeps only its initial Untitled tab: nothing was opened.
  await expect(page.locator('#document-name')).toHaveText('未命名');
});

test('paths outside the supported NAS locations are skipped with a notice', async ({ page }) => {
  await allowGateway(page);
  const reads: string[] = [];
  await page.route(fileAPI, async (route) => {
    reads.push(new URL(route.request().url()).searchParams.get('path')!);
    await route.fulfill({ contentType: 'application/octet-stream', body: png() });
  });
  await fakeBridge(page, { code: 0, data: ['/etc/photo.png', '/vol1/1000/notes.txt', '/vol1/1000/照片/丙.png'] });
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: /从 NAS 打开|Open from NAS/ }).click();
  await expect(page.locator('#status')).toContainText('已跳过 2 个所选路径');
  await expect(page.locator('.document-tab.focused')).toContainText('丙');
  expect(reads).toEqual(['/vol1/1000/照片/丙.png']);
});

test('picked NAS files join the recent list and reopen from it', async ({ page }) => {
  await allowGateway(page);
  const reads: string[] = [];
  await page.route(fileAPI, async (route) => {
    reads.push(new URL(route.request().url()).searchParams.get('path')!);
    await route.fulfill({ contentType: 'application/octet-stream', body: png() });
  });
  await fakeBridge(page, { code: 0, data: ['/vol1/1000/照片/咖啡.png'] });
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: /从 NAS 打开|Open from NAS/ }).click();
  await expect(page.locator('.document-tab.focused')).toContainText('咖啡');
  expect(reads).toEqual(['/vol1/1000/照片/咖啡.png']);
  // The start screen lists the NAS entry with its folder; it survives a reload.
  await expect(page.locator('#start-recent, .start-recent-item').first()).toContainText('咖啡', { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await page.getByRole('button', { name: /最近文件|Recent/ }).click();
  const entry = page.locator('.start-recent-item').filter({ hasText: '咖啡' });
  await expect(entry).toContainText('/vol1/1000/照片');
  await entry.click();
  await expect(page.locator('.document-tab.focused')).toContainText('咖啡');
  expect(reads).toEqual(['/vol1/1000/照片/咖啡.png', '/vol1/1000/照片/咖啡.png']);
});
});

// Saving back to the NAS: the gateway's POST endpoint is guarded by the
// account's writable ACL bit, confirmed overwrites, and the optimistic lock.
test.describe('save to NAS', () => {
  test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) FNOS/1.2.0903 FNAppType/main FNAppVer/1.0.0' });

  test('Save As offers the NAS folder and writes through the gateway', async ({ page }) => {
    const folder = '/vol1/1000/导出';
    const writes: { path: string; overwrite?: string; buffer: Buffer }[] = [];
    await fakeBridge(page, { code: 0, data: [folder] });
    await allowGateway(page);
    await page.route(`**${gateway}/api/nas-save?*`, async (route) => {
      const request = route.request();
      const body = request.postDataBuffer() ?? Buffer.alloc(0);
      writes.push({
        path: new URL(request.url()).searchParams.get('path')!,
        overwrite: request.headers()['x-photostudio-overwrite'],
        buffer: Buffer.from(body),
      });
      await route.fulfill({ json: { saved: true, size: body.length, mtime: '1730000000000000007' } });
    });
    await page.route(fileAPI, async (route) => {
      await route.fulfill({ contentType: 'application/octet-stream', body: png() });
    });
    await page.goto('./');
    await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
    // A document must be open before Save As is enabled.
    await page.locator('#file-input').setInputFiles({ name: '本地.png', mimeType: 'image/png', buffer: png() });
    await expect(page.locator('.document-tab.focused')).toContainText('本地');
    // No English seed here: this suite runs with the app's Chinese default.
    await page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true }).click();
    const fileMenu = page.locator('.menubar-entry.open > .menu-pop');
    const item = fileMenu.locator(':scope > .menu-item').filter({ has: page.locator(':scope > .menu-label', { hasText: /^另存为…$/ }) });
    await expect(item).toHaveCount(1);
    await item.click();
    // The format question comes first; PNG keeps a single flattened image.
    const formatDialog = page.getByRole('dialog', { name: '另存为', exact: true });
    await expect(formatDialog).toBeVisible();
    await formatDialog.getByRole('button', { name: 'PNG', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '另存为', exact: true });
    await expect(dialog.locator('select[name="destination"]')).toHaveValue('nas');
    await dialog.getByRole('button', { name: '继续', exact: true }).click();
    // The folder picker's fake bridge resolves immediately; the write follows.
    await expect(page.locator('#status')).toContainText('已将 本地.png 保存到 NAS', { timeout: 15_000 });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(`${folder}/本地.png`);
    expect(writes[0].overwrite).toBeUndefined();
    expect(writes[0].buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });

  test('saving a NAS-opened PNG writes back to its own path', async ({ page }) => {
    const source = '/vol1/1000/照片/写回.png';
    await allowGateway(page);
    const reads: string[] = [];
    await page.route(fileAPI, async (route) => {
      reads.push(new URL(route.request().url()).searchParams.get('path')!);
      await route.fulfill({
        contentType: 'application/octet-stream',
        headers: { 'X-PhotoStudio-Mtime': '1730000000000000007' },
        body: png(),
      });
    });
    const writes: string[] = [];
    await page.route(`**${gateway}/api/nas-save?*`, async (route) => {
      const request = route.request();
      writes.push(`${new URL(request.url()).searchParams.get('path')}|${request.headers()['x-photostudio-expect-size']}|${request.headers()['x-photostudio-expect-mtime']}`);
      await route.fulfill({ json: { saved: true, size: request.postDataBuffer()?.length ?? 0, mtime: '1730000001000000009' } });
    });
    await page.goto(launch(source));
    await expect(page.locator('.document-tab.focused')).toContainText('写回');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('#status')).toContainText('已将 写回.png 保存到 NAS', { timeout: 15_000 });
    expect(reads).toEqual([source]);
    expect(writes).toHaveLength(1);
    const [path, expectSize, expectMtime] = writes[0].split('|');
    expect(path).toBe(source);
    expect(Number(expectSize)).toBeGreaterThan(0);
    expect(expectMtime).toBe('1730000000000000007');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].split('|')[2]).toBe('1730000001000000009');
  });

  test('an account without the writable bit is told so instead of marking the save successful', async ({ page }) => {
    await allowGateway(page);
    await page.route(fileAPI, async (route) => {
      await route.fulfill({ contentType: 'application/octet-stream', body: png() });
    });
    await page.route(`**${gateway}/api/nas-save?*`, async (route) => {
      await route.fulfill({ status: 403, json: { code: 'not_writable', message: '当前账号的授权不包含写入此文件的权限。' } });
    });
    await page.goto(launch('/vol1/1000/照片/只读.png'));
    await expect(page.locator('.document-tab.focused')).toContainText('只读');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('#status')).toContainText('没有写入此 NAS 位置的权限', { timeout: 15_000 });
  });
});
