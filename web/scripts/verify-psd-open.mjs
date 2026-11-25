// Local check: open PSD files with the real importer and renderer, report the
// layer tree that was produced, and compare the render with the file's saved
// composite. Usage: node scripts/verify-psd-open.mjs <out-dir> <file.psd>...
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

const [outDir, ...files] = process.argv.slice(2);
if (!outDir || !files.length) throw new Error("Usage: node scripts/verify-psd-open.mjs <out-dir> <file.psd>...");
await mkdir(outDir, { recursive: true });
// Large files are streamed by the dev server; fulfilling a 100+ MB route
// response through the browser automation channel kills the page.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
  plugins: [{
    name: "verify-psd-files",
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        const m = /^\/__psd\/(\d+)$/.exec(req.url ?? "");
        if (!m || !files[+m[1]]) return next();
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", String(statSync(files[+m[1]]).size));
        createReadStream(files[+m[1]]).pipe(res);
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.error("[page]", m.type(), m.text()));
  page.on("crash", () => console.error("[page] crashed (renderer process died, likely out of memory)"));
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.route("https://js.puter.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: "window.puter={};" }));
  const base = server.resolvedUrls.local[0];
  await page.goto(base);
  for (let i = 0; i < files.length; i++) {
    const name = path.basename(files[i]);
    const started = Date.now();
    const report = await page.evaluate(async ({ url, name, root }) => {
      const { openPsd } = await import(`${root}src/model/psd.ts`);
      const { readPsd } = await import(`${root}tests/browser/psd-codec.ts`);
      const { Renderer } = await import(`${root}src/renderer/renderer.ts`);
      const { ImageEngine } = await import(`${root}src/engine/engine.ts`);
      console.log("stage: start"); const blob = await (await fetch(url)).blob(); console.log("stage: fetched", blob.size);
      const engine = new ImageEngine();
      let loaded, renderer;
      try {
        loaded = await openPsd(blob, name); console.log("stage: opened", loaded.document.layers.length);
        const doc = loaded.document;
        const kinds = {}, styled = [], pixelLayers = [], fill = [];
        let count = 0;
        const walk = (layers, depth) => {
          for (const l of layers) {
            count++;
            kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
            if (l.style) styled.push({ name: l.name, effects: Object.keys(l.style).filter((k) => Array.isArray(l.style[k]) || (l.style[k] && typeof l.style[k] === "object")) });
            if (l.kind === "pixel") pixelLayers.push({ name: l.name, width: l.sourceWidth, height: l.sourceHeight });
            if (l.fillOpacity !== undefined && l.fillOpacity !== 1) fill.push({ name: l.name, fillOpacity: l.fillOpacity });
            walk(l.children ?? [], depth + 1);
          }
        };
        walk(doc.layers, 0);
        const single = doc.layers.length === 1 && doc.layers[0].name === "PSD composite";
        renderer = await Renderer.create(document.createElement("canvas"), engine); console.log("stage: renderer", renderer.name);
        await renderer.render(doc, loaded.assets); console.log("stage: rendered");
        const pixels = await renderer.rawPixels(); console.log("stage: pixels", pixels.length);
        const psd = readPsd(await blob.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true, useImageData: true });
        const composite = psd.imageData?.data;
        const W = doc.width, H = doc.height;
        let maximum = 0, total = 0, over8 = 0, over32 = 0, compared = 0;
        const heat = new Uint8ClampedArray(W * H * 4);
        if (composite) {
          for (let p = 0; p < W * H; p++) {
            let d = 0;
            const a = pixels[p * 4 + 3] / 255, b = composite[p * 4 + 3] / 255;
            for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(pixels[p * 4 + c] * a - composite[p * 4 + c] * b));
            d = Math.max(d, Math.abs(pixels[p * 4 + 3] - composite[p * 4 + 3]));
            compared++;
            maximum = Math.max(maximum, d);
            total += d;
            if (d > 8) over8++;
            if (d > 32) over32++;
            const v = Math.min(255, d * 4);
            heat.set([v, v > 0 ? 0 : 40, v > 0 ? 0 : 40, 255], p * 4);
          }
        }
        const png = async (data) => {
          const c = new OffscreenCanvas(W, H);
          c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, W * H * 4), W, H), 0, 0);
          const b = await c.convertToBlob({ type: "image/png" });
          return Array.from(new Uint8Array(await b.arrayBuffer()));
        };
        return {
          name, width: W, height: H, singleComposite: single, layerCount: count, kinds, styled, pixelLayers, fill,
          notice: loaded.notice,
          difference: composite ? { maximum, mean: +(total / compared).toFixed(3), pixelsOver8: over8, pixelsOver32: over32, share8: +(over8 / compared * 100).toFixed(3) + "%" } : "no saved composite",
          renderPng: await png(pixels),
          heatPng: composite ? await png(heat) : undefined,
        };
      } catch (error) {
        return { name, error: String(error?.stack ?? error) };
      } finally {
        renderer?.dispose();
        engine.dispose();
        loaded?.assets.clear();
      }
    }, { url: `/__psd/${i}`, name, root: new URL(base).pathname });
    if (report.renderPng) await writeFile(path.join(outDir, `${name}.render.png`), Buffer.from(report.renderPng));
    if (report.heatPng) await writeFile(path.join(outDir, `${name}.diff.png`), Buffer.from(report.heatPng));
    delete report.renderPng;
    delete report.heatPng;
    report.seconds = (Date.now() - started) / 1000;
    console.log(JSON.stringify(report, null, 1));
    await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(report, null, 2));
  }
} finally {
  await browser.close();
  await server.close();
}
