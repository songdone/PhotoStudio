import { expect, test, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { layer, newDocument } from '../../src/model/document';
import { encodePng } from '../../src/features/files/png';
import { photoFile } from '../browser/helpers';

const root = '/app/photostudio';

const sourcePath = '/vol1/1000/照片/Save.png';
const folder = '/vol1/1000/导出';
const originalMtime = '1730000000000000007';
const savedMtime = '1730000001000000009';
const conflictStat = { size: 113, mtime: '1730000000000000099', revision: 'checked-version' };

function png() {
  const data = new Uint8Array(12 * 8 * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([90, 140, 210, 255], offset);
  return Buffer.from(encodePng({ width: 12, height: 8, data, channels: 4 }));
}

async function gateway(page: Page, writable = true) {
  await page.route(`**${root}/api/context`, (route) => route.fulfill({ json: { nasFiles: true, nasWrite: writable } }));
  await page.route(`**${root}/api/nas-file?*`, (route) => route.fulfill({
    contentType: 'application/octet-stream',
    headers: { 'X-PhotoStudio-Mtime': originalMtime, 'X-PhotoStudio-Revision': 'opened-version' },
    body: png(),
  }));
}

async function bridge(page: Page, picked: unknown, delay = 0) {
  await page.addInitScript(({ picked, delay }) => {
    const state = window as unknown as { __folderCalls?: unknown[]; flutter_inappwebview: unknown };
    state.__folderCalls = [];
    state.flutter_inappwebview = {
      _platformReady: true,
      callHandler: async (method: string, params: string) => {
        if (method === 'getAppMessage') return JSON.stringify({ result: JSON.stringify({ appApi: 'v1.0' }) });
        if (method !== 'pickUserFile') return '';
        state.__folderCalls!.push(JSON.parse(params));
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        return picked === undefined ? '' : JSON.stringify({ result: JSON.stringify(picked) });
      },
    };
  }, { picked, delay });
}

async function done(route: Route) {
  const bytes = route.request().postDataBuffer()!;
  await route.fulfill({ json: { saved: true, size: bytes.length, mtime: savedMtime, revision: 'saved-version' } });
}

async function opened(page: Page, path = sourcePath) {
  await page.goto(`./?${new URLSearchParams({ path })}`);
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  await expect(page.locator('#document-name')).toHaveText('Save');
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}

async function change(page: Page) {
  await page.keyboard.press('ControlOrMeta+Alt+Shift+n');
  await expect(page.locator('.document-tab.focused .dirty-dot')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}

async function acceptPngLoss(page: Page) {
  const warning = page.getByRole('dialog', { name: '另存为 PNG', exact: true });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: '另存为 PNG', exact: true }).click();
}

async function localProject(page: Page) {
  await page.goto('./');
  await expect(page.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
  const document = newDocument(80, 50, 'Save');
  document.layers = [layer('solid', 'Background', 80, 50)];
  await page.locator('#file-input').setInputFiles(photoFile(document, [], 'Save.photo'));
  await expect(page.locator('#document-name')).toHaveText('Save');
}

async function saveAs(page: Page, name = 'New Save.photo', copy = false, destination = 'nas') {
  await page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true }).click();
  await page.locator(`.menubar-entry.open [data-command="${copy ? 'file.save-copy' : 'file.save-as'}"]`).click();
  const dialog = page.locator('#dialog[open]');
  await dialog.getByRole('button', { name: 'Photo Studio 项目', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: '保存位置', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: '保存位置', exact: true }).selectOption(destination);
  await dialog.getByRole('textbox', { name: '文件名', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '继续', exact: true }).click();
}

test.describe('NAS save protection', () => {
  test.use({ userAgent: 'Mozilla/5.0 FNOS/1.2.0903 FNAppType/main FNAppVer/1.0.0' });

  test('a conflict requires confirmation and sends the exact checked version once', async ({ page }) => {
    await gateway(page);
    const headers: Record<string, string>[] = [];
    await page.route(`**${root}/api/nas-save?*`, async (route) => {
      headers.push(route.request().headers());
      expect(route.request().headers()['x-trim-userid']).toBeUndefined();
      if (headers.length === 1) return route.fulfill({ status: 409, json: { code: 'file_changed', current: conflictStat } });
      await done(route);
    });
    await opened(page);
    await page.keyboard.press('ControlOrMeta+s');
    const confirmation = page.getByRole('dialog', { name: '覆盖 NAS 文件？', exact: true });
    await expect(confirmation).toContainText('Save.png');
    expect(headers).toHaveLength(1);
    expect(headers[0]['x-photostudio-expect-mtime']).toBe(originalMtime);
    expect(headers[0]['x-photostudio-overwrite']).toBeUndefined();
    await confirmation.getByRole('button', { name: '覆盖', exact: true }).click();
    await expect(page.locator('#status')).toHaveText('已将 Save.png 保存到 NAS');
    expect(headers).toHaveLength(2);
    expect(headers[1]).toMatchObject({
      'x-photostudio-expect-size': String(conflictStat.size),
      'x-photostudio-expect-mtime': conflictStat.mtime,
      'x-photostudio-expect-revision': conflictStat.revision,
      'x-photostudio-overwrite': '1',
    });
  });

  test('canceling a conflict while closing keeps the dirty document open', async ({ page }) => {
    await gateway(page);
    let writes = 0;
    await page.route(`**${root}/api/nas-save?*`, (route) => {
      writes++;
      return route.fulfill({ status: 409, json: { code: 'file_changed', current: conflictStat } });
    });
    await opened(page);
    await change(page);
    await page.locator('.document-tab.focused .tab-close').click();
    await page.locator('#dialog[open]').getByRole('button', { name: '保存', exact: true }).click();
    await acceptPngLoss(page);
    const confirmation = page.getByRole('dialog', { name: '覆盖 NAS 文件？', exact: true });
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await expect(page.locator('.document-tab.focused')).toContainText('Save');
    await expect(page.locator('.document-tab.focused .dirty-dot')).toBeVisible();
    expect(writes).toBe(1);
  });

  test('a file changed again after confirmation is not blindly overwritten', async ({ page }) => {
    await gateway(page);
    let writes = 0;
    await page.route(`**${root}/api/nas-save?*`, (route) => {
      writes++;
      return route.fulfill({ status: 409, json: { code: 'file_changed', current: { ...conflictStat, mtime: writes === 1 ? conflictStat.mtime : '1730000000000000100' } } });
    });
    await opened(page);
    await change(page);
    await page.keyboard.press('ControlOrMeta+s');
    await acceptPngLoss(page);
    await page.getByRole('dialog', { name: '覆盖 NAS 文件？' }).getByRole('button', { name: '覆盖', exact: true }).click();
    await expect(page.locator('#status')).toContainText('确认后 NAS 文件又被修改');
    await expect(page.locator('.document-tab.focused .dirty-dot')).toBeVisible();
    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
    expect(writes).toBe(2);
    await expect(page.getByRole('dialog', { name: '覆盖 NAS 文件？' })).not.toBeVisible();
  });

  test('a permission rejection during close keeps the document and its edits', async ({ page }) => {
    await gateway(page);
    let writes = 0;
    await page.route(`**${root}/api/nas-save?*`, (route) => {
      writes++;
      return route.fulfill({ status: 403, json: { code: 'not_writable' } });
    });
    await opened(page);
    await change(page);
    await page.locator('.document-tab.focused .tab-close').click();
    await page.locator('#dialog[open]').getByRole('button', { name: '保存', exact: true }).click();
    await acceptPngLoss(page);
    await expect(page.locator('#status')).toContainText('没有写入此 NAS 位置的权限');
    await expect(page.locator('.document-tab.focused .dirty-dot')).toBeVisible();
    await expect(page.locator('#document-name')).toHaveText('Save');
    expect(writes).toBe(1);
  });

  test('a successful Save As sets the next Save target and never duplicates the extension', async ({ page }) => {
    await gateway(page);
    await bridge(page, { code: 0, data: [folder] });
    const paths: string[] = [];
    const requests: Record<string, string>[] = [];
    await page.route(`**${root}/api/nas-save?*`, async (route) => {
      paths.push(new URL(route.request().url()).searchParams.get('path')!);
      requests.push(route.request().headers());
      await done(route);
    });
    await localProject(page);
    await saveAs(page);
    await expect(page.locator('#status')).toHaveText('已将 New Save.photo 保存到 NAS');
    expect(paths).toEqual([`${folder}/New Save.photo`]);
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => paths.length).toBe(2);
    expect(paths[1]).toBe(paths[0]);
    expect(requests[1]['x-photostudio-expect-mtime']).toBe(savedMtime);
    const calls = await page.evaluate(() => (window as unknown as { __folderCalls: unknown[] }).__folderCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ directory: true, multiple: false, creatable: false });
  });

  test('saving a copy leaves the original NAS path and its version lock unchanged', async ({ page }) => {
    await gateway(page);
    await bridge(page, { code: 0, data: [folder] });
    const paths: string[] = [];
    const headers: Record<string, string>[] = [];
    await page.route(`**${root}/api/nas-save?*`, async (route) => {
      paths.push(new URL(route.request().url()).searchParams.get('path')!);
      headers.push(route.request().headers());
      await done(route);
    });
    await opened(page);
    await saveAs(page, 'Backup.photo', true);
    await expect(page.locator('#status')).toContainText('Backup.photo');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => paths.length).toBe(2);
    expect(paths).toEqual([`${folder}/Backup.photo`, sourcePath]);
    expect(headers[1]['x-photostudio-expect-mtime']).toBe(originalMtime);
  });

  test('a canceled folder picker performs no write and preserves the dirty state', async ({ page }) => {
    await gateway(page);
    await bridge(page, undefined);
    let writes = 0;
    await page.route(`**${root}/api/nas-save?*`, (route) => { writes++; return done(route); });
    await localProject(page);
    await change(page);
    await saveAs(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __folderCalls: unknown[] }).__folderCalls.length)).toBe(1);
    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.document-tab.focused .dirty-dot')).toBeVisible();
    expect(writes).toBe(0);
  });

  test('late replies from a canceled host picker never start a write', async ({ page }) => {
    await gateway(page);
    await bridge(page, { code: 0, data: [folder] }, 1800);
    let writes = 0;
    await page.route(`**${root}/api/nas-save?*`, (route) => { writes++; return done(route); });
    await localProject(page);
    await saveAs(page);
    const pending = page.getByRole('dialog', { name: '选择 NAS 文件夹', exact: true });
    await pending.getByRole('button', { name: '取消', exact: true }).click();
    await expect(pending).not.toBeVisible();
    await page.waitForTimeout(2100);
    expect(writes).toBe(0);
    await expect(page.locator('#document-name')).toHaveText('Save');
  });

  test('choosing Download does not set a NAS target for the next Save', async ({ page }) => {
    await gateway(page);
    let writes = 0;
    await page.route(`**${root}/api/nas-save?*`, (route) => { writes++; return done(route); });
    await opened(page);
    const download = page.waitForEvent('download');
    await saveAs(page, 'Local Copy.photo', false, 'download');
    const file = await download;
    expect(file.suggestedFilename()).toBe('Local Copy.photo');
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, 8).toString()).toBe('PHOTO001');
    const next = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    expect((await next).suggestedFilename()).toBe('Local Copy.photo');
    expect(writes).toBe(0);
  });

  test('a nominal success without exact version metadata is not marked saved', async ({ page }) => {
    await gateway(page);
    await page.route(`**${root}/api/nas-save?*`, (route) => route.fulfill({ json: { saved: true, size: 1, mtime: 1730000000000000007 } }));
    await opened(page);
    await change(page);
    await page.keyboard.press('ControlOrMeta+s');
    await acceptPngLoss(page);
    await expect(page.locator('#status')).toContainText('无法确认 NAS 保存结果');
    await expect(page.locator('.document-tab.focused .dirty-dot')).toBeVisible();
  });
});

test('standalone Save As never navigates away or pretends to save via an unavailable picker', async ({ page }) => {
  await gateway(page);
  let writes = 0;
  await page.route(`**${root}/api/nas-save?*`, (route) => { writes++; return done(route); });
  await localProject(page);
  await saveAs(page);
  await expect(page.locator('#status')).toContainText('选择器仅在飞牛桌面或客户端内可用');
  await expect(page.locator('#document-name')).toHaveText('Save');
  expect(writes).toBe(0);
});

for (const advertiseCapabilities of [true, false]) {
  test(`desktop iframe saves through the native parent bridge (${advertiseCapabilities ? 'declared' : 'legacy'} host)`, async ({ page }, info) => {
    await gateway(page);
    const frames: string[] = [];
    const writes: string[] = [];
    await page.route(`**${root}/api/nas-save?*`, async (route) => {
      writes.push(new URL(route.request().url()).searchParams.get('path')!);
      await done(route);
    });
    const app = new URL('./', String(info.project.use.baseURL)).href;
    const origin = new URL(app).origin;
    await page.route(`**${root}/desktop-test-host`, (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
        const origin = ${JSON.stringify(origin)};
        const frame = document.createElement('iframe');
        frame.title = 'Photo Studio';
        frame.style.cssText = 'width:1280px;height:850px;border:0';
        window.__hostCalls = [];
        addEventListener('message', async event => {
          if (event.source !== frame.contentWindow || event.origin !== origin) return;
          const message = event.data;
          const send = value => frame.contentWindow.postMessage(value, origin);
          if (message?.penpal === 'syn') {
            send({ penpal:'synAck', id:'desktop-test-instance', appName:'photostudio',
              methodNames:['pickUserFile','authorizeUserFile','getSessionCredentials'],
              config:${advertiseCapabilities ? "{host:{runtime:'desktop',sessionCredentials:1}}" : '{}'} });
            return;
          }
          if (message?.penpal !== 'call' || !Number.isInteger(message.id) || !Array.isArray(message.args)) return;
          window.__hostCalls.push({ method:message.methodName, args:message.args });
          if (message.methodName === 'pickUserFile') {
            send({ penpal:'reply', id:message.id, resolution:'fulfilled', returnValue:{code:0,msg:'',data:[${JSON.stringify(folder)}]} });
          } else if (message.methodName === 'getSessionCredentials') {
            send({ penpal:'reply', id:message.id, resolution:'fulfilled', returnValue:{code:1,msg:'FORBIDDEN',data:null} });
          } else {
            send({ penpal:'reply', id:message.id, resolution:'fulfilled', returnValue:{code:0,msg:'',data:true} });
          }
        });
        frame.src = ${JSON.stringify(app)};
        document.body.append(frame);
      </script></body></html>`,
    }));
    await page.goto('./desktop-test-host');
    const editor = page.frameLocator('iframe[title="Photo Studio"]');
    await expect(editor.locator('#engine-status')).toHaveText(/WebGPU|WebGL2/);
    const doc = newDocument(80, 50, '桌面');
    doc.layers = [layer('solid', 'Background', 80, 50)];
    await editor.locator('#file-input').setInputFiles(photoFile(doc, [], '桌面.photo'));
    await expect(editor.locator('#document-name')).toHaveText('桌面');
    await editor.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true }).click();
    await editor.locator('.menubar-entry.open [data-command="file.save-as"]').click();
    await editor.locator('#dialog[open]').getByRole('button', { name: 'Photo Studio 项目', exact: true }).click();
    const destination = editor.locator('#dialog[open]');
    await destination.getByRole('combobox', { name: '保存位置' }).selectOption('nas');
    await destination.getByRole('textbox', { name: '文件名', exact: true }).fill('桌面原生.photo');
    await destination.getByRole('button', { name: '继续', exact: true }).click();
    await expect(editor.locator('#status')).toHaveText('已将 桌面原生.photo 保存到 NAS');
    const calls = await page.evaluate(() => (window as unknown as { __hostCalls: { method: string; args: unknown[] }[] }).__hostCalls);
    const pick = calls.find((call) => call.method === 'pickUserFile');
    expect(pick?.args[0]).toMatchObject({ directory: true, multiple: false, creatable: false });
    expect(writes).toEqual([`${folder}/桌面原生.photo`]);
    const child = page.frames().find((frame) => frame.url() === app)!;
    expect(await child.evaluate(() => /FNAppVer/.test(navigator.userAgent))).toBe(false);
    frames.push(child.url());
    expect(frames).toEqual([app]);
    if (advertiseCapabilities) await page.screenshot({ path: info.outputPath('desktop-nas-save.png') });
  });
}
