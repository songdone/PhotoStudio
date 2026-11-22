import { describe, expect, it } from 'vitest';
import type { PsdLoss } from '../src/model/psd-losses';
import { describeFileLosses } from '../src/i18n/file-messages';
import { t, translateMessage } from '../src/i18n/translate';

describe('file workflow Chinese', () => {
  it('translates standalone PSD import notices and explanations', () => {
    const notices: [string, string][] = [
      [
        'This PSD uses unsupported masks, effects or compositing. Its saved composite was opened as one raster layer.',
        '此 PSD 包含暂不支持的蒙版、效果或合成方式，已将文件中保存的合成图像作为单个像素图层打开。',
      ],
      ['Opened the PSD composite as one raster layer.', '已将 PSD 中保存的合成图像作为单个像素图层打开。'],
      ['Text, shapes and embedded objects were opened as raster layers.', '文字、形状和嵌入对象已作为像素图层打开。'],
      [
        'The complete original file is retained in .photo projects. Download PSD preserves its original layers when the preview is unchanged. After preview edits, save a .photo project or export PNG; File → Download original PSD retrieves the original without those edits.',
        '保存为 .photo 项目可保留完整原文件。未修改预览时，导出 PSD 会保留原始图层。修改预览后，请保存为 .photo 项目或导出为 PNG 以保留更改。选择“文件 → 导出 → 下载原始 PSD”可获取不含预览更改的原文件。',
      ],
      [
        'This preview has been edited, but its original PSD layers cannot yet be updated. Save a .photo project or export PNG to keep these edits. File → Download original PSD retrieves the original without preview edits.',
        '此预览已编辑，但暂时无法将更改写回原始 PSD 的图层。请保存为 .photo 项目或导出为 PNG，以保留这些更改。选择“文件 → 导出 → 下载原始 PSD”可获取原文件，其中不包含对预览的更改。',
      ],
      [
        'This PSD needs a saved composite image. Re-save the file with a composite image included.',
        '此 PSD 缺少已保存的合成图像。请在原编辑软件中启用合成图像或最大化兼容性后重新保存。',
      ],
      [
        'PSD layer pixels are missing. Re-save the file with its layer pixel data and a composite image included.',
        '此 PSD 缺少图层像素数据。请在原编辑软件中保留图层像素数据和合成图像后重新保存。',
      ],
      ['PSD exceeds 512 MB.', 'PSD 文件超过 512 MB。'],
      ['PSD exceeds the 512 MB decoded pixel budget.', 'PSD 解码后的像素数据超过 512 MB 内存限制。'],
      ['Too many nested PSD groups.', 'PSD 的图层组嵌套过深。'],
      ['PSD auxiliary layer channels are not yet supported.', '暂不支持 PSD 图层的辅助通道。'],
      ['Missing embedded pattern metadata.', '缺少嵌入图案的元数据。'],
    ];

    for (const [source, translated] of notices) {
      expect(translateMessage(source), source).toBe(translated);
    }
  });

  it('translates PSD export guidance and error details', () => {
    expect(translateMessage('PSD downloaded with pixel layers, layer masks, clipping and blend modes. Text and adjustments are rasterized; save a .photo project to keep every control.')).toBe(
      '已下载 PSD，保留了像素图层、图层蒙版、剪贴关系和混合模式。文字和调整已栅格化；如需保留全部可编辑设置，请保存为 .photo 项目。',
    );
    expect(translateMessage('Multichannel documents are written as their RGB composite; the ink channels stay in the .photo project.')).toBe(
      '多通道文档会导出为拼合后的 RGB 图像，油墨通道保留在 .photo 项目中。',
    );
    expect(translateMessage('Clarity & Dehaze and Grain layers have no PSD equivalent: they are written as empty layers and only the merged image shows their effect.')).toBe(
      'PSD 不支持“清晰度与去朦胧”和“颗粒”图层。这些图层会导出为空图层，效果仅在合成图像中可见。',
    );
    expect(translateMessage('Could not export Save.psd')).toBe('无法导出 Save.psd');
    expect(translateMessage('PSD exceeds 2048 layers.')).toBe('PSD 超过 2048 个图层。');
  });

  it('keeps captured font names and ICC errors unchanged', () => {
    for (const font of ['Save', 'Background']) {
      expect(translateMessage(`Text set in ${font} shows its saved appearance until edited (the font is not available here).`)).toBe(
        `本机缺少字体 ${font}，相关文字在编辑前会保持文件中保存的外观。`,
      );
    }

    const error = 'TypeError: Save (Background)';
    expect(translateMessage(`The embedded ICC profile cannot be used for display (${error}). Its bytes are retained; colors are shown as sRGB.`)).toBe(
      `嵌入的 ICC 色彩配置无法用于显示（${error}）。原始配置数据已保留，颜色暂按 sRGB 显示。`,
    );
  });

  it('preserves template filenames and special characters verbatim', () => {
    const filename = 'Save $& <Background> [draft].photo';
    expect(t('A .photo project leaves {name} unchanged.', { name: filename })).toBe(`另存为 .photo 项目不会改动原文件“${filename}”。`);
    expect(translateMessage(`Downloaded ${filename}`)).toBe(`已下载 ${filename}`);
  });
});

describe('PSD loss descriptions', () => {
  it('separates flattened and omitted losses in canonical English, translated for display', () => {
    const losses: PsdLoss[] = [
      { id: 'styles', kind: 'flattened', label: 'layer styles' },
      { id: 'fills', kind: 'flattened', label: 'fill layers' },
      { id: 'slices', kind: 'omitted', label: 'slices' },
      { id: 'comments', kind: 'omitted', label: 'review comments' },
    ];
    const english = describeFileLosses(losses);
    expect(english).toBe('PSD flattens layer styles; fill layers into pixels.\nPSD leaves out slices; review comments.');
    expect(translateMessage(english)).toBe('PSD 会将以下内容栅格化：图层样式、填充图层。\nPSD 不会保留以下内容：切片、审阅评论。');
    expect(translateMessage(describeFileLosses(losses.filter((loss) => loss.kind === 'flattened')))).toBe('PSD 会将以下内容栅格化：图层样式、填充图层。');
    expect(translateMessage(describeFileLosses(losses.filter((loss) => loss.kind === 'omitted')))).toBe('PSD 不会保留以下内容：切片、审阅评论。');
  });

  it('translates unsupported adjustment names and formats without re-translating them', () => {
    expect(translateMessage(describeFileLosses([{ id: 'adjustments', kind: 'omitted', label: 'Clarity & Dehaze and Grain adjustments' }]))).toBe(
      'PSD 不会保留以下内容：清晰度与去朦胧、颗粒调整。',
    );
    expect(translateMessage(describeFileLosses([
      { id: 'mode', kind: 'omitted', label: 'the CMYK color mode (written as RGB)' },
      { id: 'depth', kind: 'omitted', label: '32-bit color (written as 16-bit)' },
    ]))).toBe('PSD 不会保留以下内容：CMYK 色彩模式（导出为 RGB）、32 位颜色（导出为 16 位）。');
  });

  it('leaves source loss names opaque instead of translating their contents again', () => {
    const name = '“Save Background.psd”中的 Save';
    expect(describeFileLosses([{ id: 'source-0', kind: 'omitted', label: name }])).toBe(`PSD leaves out ${name}.`);
    expect(translateMessage(describeFileLosses([{ id: 'source-0', kind: 'omitted', label: name }]))).toBe(`PSD 不会保留以下内容：${name}。`);
  });
});
