// File → Export → PSD with editable pixel layers: destructive tiles export as
// their own layer rasters and painted masks as PSD user masks.
import type { Editor } from '../../editor';
import type { DocumentSession } from '../../app/session';
import type { Assets } from '../../model/assets';
import { allLayers, type Layer, type PhotoDocument } from '../../model/document';
import { isSpatialKind } from '../../imaging/adjust/model';
import { gridDocBounds, intersectRect, parseKey, readMask, readRGBA, TILE, unionRect } from '../../model/tiles';
import type { IRect } from '../../imaging/types';
import { PsdPreviewEditError, saveOriginalPsd } from '../../model/psd-original';
import { createOffscreenRenderer } from '../offscreen-renderer';
import { download } from '../../persistence/puter';
import { informationText } from '../../ui/dialog';
import { askChoice } from '../preferences/warnings';
import type { ReadPsdMaskGrid } from '../../model/psd';
import { presentTimeline } from '../../model/video-timeline';

/** Document-space mask plane of a painted mask, limited to its stored tiles
 * on the canvas; everything else takes the grid's fill value. */
export function maskGridPlane(e: Editor, l: Layer, doc: PhotoDocument = e.doc, assets: Assets = e.assets): ReturnType<ReadPsdMaskGrid> {
  const grid = l.maskGrid;
  if (!grid) return;
  const fill = grid.fill ?? 0;
  const canvas: IRect = { x: 0, y: 0, width: doc.width, height: doc.height };
  let area: IRect | null = null;
  for (const key of Object.keys(grid.tiles)) {
    const [tx, ty] = parseKey(key);
    area = unionRect(area, { x: tx * TILE + grid.x, y: ty * TILE + grid.y, width: TILE, height: TILE });
  }
  // PSD default colors are 0 or 255; any other fill is written explicitly.
  if (fill !== 0 && fill !== 255) area = canvas;
  const bounds = area ? intersectRect(area, canvas) : null;
  const defaultColor = fill >= 128 ? 255 : 0;
  if (!bounds) return { bounds: { x: 0, y: 0, width: 0, height: 0 }, data: new Uint8Array(), defaultColor };
  return { bounds, data: readMask(assets.tiles, grid, bounds).data, defaultColor };
}

/** Alpha channels (and spot channels, except the inks of a Multichannel
 * document, whose composite is written instead) as 8-bit planes. */
function psdChannels(doc: PhotoDocument, assets: Assets) {
  const area = { x: 0, y: 0, width: doc.width, height: doc.height };
  return (doc.channels ?? [])
    .filter((c) => !(c.spot && doc.mode === 'multichannel'))
    .map((c) => ({ name: c.name, data: readMask(assets.tiles, c.grid, area).data, color: c.color, opacity: c.opacity, spot: c.spot }));
}

/** The document as PSD bytes. A document that opened as a preview of a PSD
 * gives back that file while it is unedited and fails with PsdPreviewEditError
 * once it is not. Resolves undefined when the compatibility question is
 * cancelled. `live` is the document state that was written. */
export async function buildPsd(e: Editor, session: DocumentSession = e.session): Promise<{ blob: Blob; extension: 'psd' | 'psb'; original: boolean; live: PhotoDocument; extrasRevision: number } | undefined> {
  // Pending renders (embedded object frames) finish before the copy is taken.
  const assets = session.assets;
  await e.renderer.beforeReadback?.();
  const live = session.doc;
  const extrasRevision = session.extrasRevision;
  // Keep this state's tiles if the user edits while compatibility/encoding waits.
  const retained = () => [live];
  session.retained.push(retained);
  try {
    return await writePsd(e, live, assets, extrasRevision);
  } finally {
    const i = session.retained.indexOf(retained);
    if (i >= 0) session.retained.splice(i, 1);
  }
}

async function writePsd(e: Editor, live: PhotoDocument, assets: Assets, extrasRevision: number) {
  // A video timeline exports the current time as drawn (clips and fades applied).
  const doc = structuredClone(presentTimeline(live));
  if (doc.psdOriginal) return { ...(await saveOriginalPsd(doc, (id) => assets.blob(id))), original: true, live, extrasRevision };
  // Preferences → File Handling → Maximize PSD compatibility.
  let composite = e.preferences.psdCompatibility !== 'never';
  if (e.preferences.psdCompatibility === 'ask') {
    const choice = await askChoice('Maximize Compatibility', 'Include a flattened composite image? Other apps and older readers show the file with it; leaving it out makes the file smaller.', [
      ['no', 'Leave Out'],
      ['yes', 'Include Composite'],
    ]);
    if (!choice) return;
    composite = choice === 'yes';
  }
  // Relight layers have no PSD record: they are written as their pixels.
  await (await import('../relight/raster')).rasterizeRelightLayers(e, doc, assets);
  const { savePsd } = await import('../../model/psd');
  const renderer = await createOffscreenRenderer(e.engine);
  const depth = doc.bitsPerChannel ?? 8;
  try {
    const blob = await savePsd(
      doc,
      async (snapshot) => {
        await renderer.render(snapshot, assets);
        return renderer.rawPixels();
      },
      async (l) => {
        if (l.kind !== 'pixel' || !l.pixels) return renderer.rawSourcePixels(l, assets);
        const b = gridDocBounds(l.pixels)!;
        const bytes = readRGBA(assets.tiles, l.pixels, b).data;
        // Tiles are 8-bit; high-depth documents take widened samples.
        const data =
          depth === 16
            ? Uint16Array.from(bytes, (v) => v * 257)
            : depth === 32
              ? Float32Array.from(bytes, (v) => v / 255)
              : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
        return { width: b.width, height: b.height, data };
      },
      (id) => assets.blob(id),
      (l) => maskGridPlane(e, l, doc, assets),
      { composite, channels: psdChannels(doc, assets) },
    );
    return { blob, extension: 'psd' as const, original: false, live, extrasRevision };
  } finally {
    renderer.dispose();
  }
}

export async function exportPsd(e: Editor) {
  let out: Awaited<ReturnType<typeof buildPsd>>;
  try {
    out = await buildPsd(e);
  } catch (error) {
    if (!(error instanceof PsdPreviewEditError)) throw error;
    informationText('PSD export', error.message);
    return;
  }
  if (!out) return;
  const doc = out.live;
  download(out.blob, `${doc.name}.${out.extension}`);
  if (out.original) return e.message('Original PSD downloaded with its layers retained.');
  const notices = ['PSD downloaded with pixel layers, layer masks, clipping and blend modes. Text and adjustments are rasterized; save a .photo project to keep every control.'];
  if (doc.mode === 'multichannel') notices.push('Multichannel documents are written as their RGB composite; the ink channels stay in the .photo project.');
  if (allLayers(doc.layers).some((l) => l.adjustment && l.adjustment.kind !== 'relight' && isSpatialKind(l.adjustment.kind))) notices.push('Clarity & Dehaze and Grain layers have no PSD equivalent: they are written as empty layers and only the merged image shows their effect.');
  e.message(notices.join('\n'));
}
