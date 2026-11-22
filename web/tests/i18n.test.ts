import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t, translateText, translateMessage, isUserCommand } from '../src/i18n/translate';
import { zhCN } from '../src/i18n/zh-CN';

describe('Simplified Chinese UI', () => {
  it('translates exact UI terms, punctuation, shortcuts and complete tooltip lines', () => {
    expect(t('  File  ')).toBe('  文件  ');
    expect(t('Export As…')).toBe('导出为…');
    expect(t('Width:')).toBe('宽度：');
    expect(t('Gaussian Blur...')).toBe('高斯模糊…');
    expect(t('Move Tool (V)\nMove and transform layers and selections')).toBe('移动工具 (V)\n移动和变换图层及选区');
    expect(t('Shift+B or right-click for the other tools in this slot')).toBe('按 Shift+B 或右键查看此组的其他工具');
  });

  it('preserves unknown text, filenames, selectors, command IDs and interpolation values', () => {
    for (const text of ['my Save.psd', 'Background.png', 'layer.new', '#dialog', '.layer-name', 'Please Save my original', '<script>Save</script>']) expect(t(text)).toBe(text);
    expect(t('Save changes to “{name}” before closing?', { name: 'Save.psd' })).toBe('关闭前保存对“Save.psd”的更改吗？');
    expect(t('Close {name}', { name: 'Save @ 50% (RGB/8)' })).toBe('关闭 Save @ 50% (RGB/8)');
    expect(t('Close {name}', { name: 'Untitled <&>' })).toBe('关闭 Untitled <&>');
    expect(t('Untitled')).toBe('未命名');
    expect(t('Layer {name}', { name: '$& <b>Background</b>' })).toBe('Layer $& <b>Background</b>');
  });

  it('keeps captured filenames and layer names opaque in dynamic messages', () => {
    expect(translateMessage('Saved Save.psd to Puter')).toBe('已将 Save.psd 保存到 Puter');
    expect(translateMessage('Opened Background.png as a 12-frame animation')).toBe('已将 Background.png 打开为 12 帧动画');
    expect(translateMessage('Downloaded File')).toBe('已下载 File');
    expect(translateMessage('Save changes to “Save” before closing?')).toBe('关闭前保存对“Save”的更改吗？');
    expect(translateMessage('Exported 4 layers (2 MB)')).toBe('已导出 4 个图层（2 MB）');
    expect(translateMessage('Exported Save.png (24 KB) with provenance')).toBe('已导出 Save.png（24 KB），包含来源记录');
    expect(translateMessage('Save crashed in external service')).toBe('Save crashed in external service');
  });

  it('never repeatedly translates Chinese output', () => {
    for (const [source, target] of zhCN) {
      expect(target, source).not.toBe('');
      expect(translateText(target), source).toBe(target);
    }
    for (const source of ['Export As…', 'Move Tool (V)', 'Saved Save to Puter', 'Save changes to “Background” before closing?']) {
      const translated = translateMessage(source);
      expect(translateMessage(translated)).toBe(translated);
    }
  });

  it('recognizes only user-supplied command labels for exclusion', () => {
    for (const id of ['file.recent.0', 'window.document-123', 'window.workspace-user-1', 'script.run.abc']) expect(isUserCommand(id)).toBe(true);
    for (const id of ['file.recent.clear', 'file.save', 'window.workspace-essentials', 'scripts.new', 'tool.move']) expect(isUserCommand(id)).toBe(false);
  });

  it('covers registered menu labels and standard tool tooltip text', () => {
    const sourceRoot = dirname(fileURLToPath(new URL('../src/main.ts', import.meta.url)));
    const sources: string[] = [];
    const walk = (directory: string) => {
      for (const file of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, file.name);
        if (file.isDirectory() && file.name !== 'i18n') walk(path);
        else if (file.isFile() && file.name.endsWith('.ts')) sources.push(readFileSync(path, 'utf8'));
      }
    };
    walk(join(sourceRoot, 'app'));
    walk(join(sourceRoot, 'features'));
    const untranslated = new Set<string>();
    for (const source of sources) {
      for (const match of source.matchAll(/\blabel:\s*(['"])([A-Z][A-Za-z0-9 /&()?,.:’—-]+(?:…)?)\1/g)) {
        const text = match[2];
        if (/^(?:Photo Studio|Claude |PNG$|JPEG$|WebP$|AVIF$|GIF$|TIFF$|BMP$|TGA$|ICO$|SVG$|ID$|VP[89]$|HSB\/HSL$|Lanczos$|OpenType$)/.test(text)) continue;
        if (t(text) === text) untranslated.add(text);
      }
    }
    expect([...untranslated].sort()).toEqual([]);
  });
});
