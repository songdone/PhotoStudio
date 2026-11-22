import { zhCN } from './zh-CN';
import { dynamicEntries } from './dynamic';
import { platformEntries } from './platform';
import { fileUIEntries } from './file-ui';
import { getLanguage, type UILanguage } from './locale';

export type TranslationValues = Record<string, string | number>;

const parameterized: Record<string, string> = {
  'Close {name}': '关闭 {name}',
  'Save changes to “{name}” before closing?': '关闭前保存对“{name}”的更改吗？',
  'Saved {name} to Puter': '已将 {name} 保存到 Puter',
  'Opened {name}': '已打开 {name}',
  'Downloaded {name}': '已下载 {name}',
  'Hide {name}': '隐藏 {name}',
  'Show {name}': '显示 {name}',
  'Delete {name}': '删除 {name}',
  'Rename {name}': '重命名 {name}',
  'Edit mask for {name}': '编辑 {name} 的蒙版',
  'This file has {count} pages': '此文件共有 {count} 页',
  'This file has {count} frames': '此文件共有 {count} 帧',
  'Save as {format}': '另存为 {format}',
  'This document cannot be saved as {format}.': '此文档无法保存为 {format}。',
  '{format} stores one flattened image.': '{format} 只保存拼合后的一张图像。',
  'A .photo project leaves {name} unchanged.': '另存为 .photo 项目不会改动原文件“{name}”。',
  '{format} flattens {features} into pixels.': '{format} 会将以下内容栅格化：{features}。',
  '{format} leaves out {features}.': '{format} 不会保留以下内容：{features}。',
  '{features} of {name}': '“{name}”中的{features}',
  'Results for “{query}”': '“{query}”的搜索结果',
  'Shortcut: {key}': '快捷键：{key}',
  'Also in this slot: {names}.': '同组其他工具：{names}。',
  'Expand {name}': '展开 {name}',
  'Collapse {name}': '折叠 {name}',
  'Link mask for {name}': '链接 {name} 的蒙版',
  'Unlink mask for {name}': '取消链接 {name} 的蒙版',
  'No image named {names} in the chosen folder.': '所选文件夹中没有名为 {names} 的图像。',
  'Could not read {names}.': '无法读取 {names}。',
  '“{name}” could not be kept for recovery: {error}. Save it to keep its changes.': '无法为“{name}”保留恢复记录：{error}。请保存文档以保留更改。',
  'Contents of {name}': '{name} 的内容',
  'Discard {what}?': '放弃{what}？',
  '{count} Unsaved Documents': '{count} 个未保存的文档',
  'Discard Document': '放弃文档',
  'Discard {count} Documents': '放弃 {count} 个文档',
  '{names} could not be restored; restored {count} other document. They are offered again next time, or choose Discard All.': '无法恢复 {names}；已恢复 {count} 个其他文档。这些文档将在下次启动时再次提供，也可选择“全部放弃”。',
  '{names} could not be restored; restored {count} other documents. They are offered again next time, or choose Discard All.': '无法恢复 {names}；已恢复 {count} 个其他文档。这些文档将在下次启动时再次提供，也可选择“全部放弃”。',
  '{names} could not be restored. They are offered again next time, or choose Discard All.': '无法恢复 {names}。这些文档将在下次启动时再次提供，也可选择“全部放弃”。',
  'Previewing “{name}” ({time}). Restore it from Version History, or press Esc.': '正在预览“{name}”（{time}）。可在版本历史中恢复，或按 Esc。',
};

/** Templates living in the fragment dictionaries ({placeholder} entries) also
 * interpolate at display time and join the parameterized map above. */
for (const line of `${dynamicEntries}\n${platformEntries}\n${fileUIEntries}`.split('\n')) {
  const tab = line.indexOf('\t');
  if (tab <= 0) continue;
  const en = line.slice(0, tab).trim(), zh = line.slice(tab + 1).trim();
  if (en && zh && en.includes('{')) parameterized[en] ??= zh;
}

/** Interpolate an English source without localizing opaque parameter values. */
export function sourceText(source: string, values?: TranslationValues): string {
  return values ? source.replace(/\{([\w]+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match) : source;
}

/** UI text only. Values supplied as parameters are inserted verbatim. */
export function t(source: string, values?: TranslationValues, language: UILanguage = getLanguage()): string {
  const translated = language === 'en' ? source : parameterized[source] ?? translateText(source, language);
  return sourceText(translated, values);
}

/** Exact strings plus deliberately bounded UI grammar. Never translates words
 * inside arbitrary prose, names, paths, script source or document text. */
export function translateText(source: string, language: UILanguage = getLanguage()): string {
  return language === 'en' ? source : translateChineseText(source);
}

function translateChineseText(source: string): string {
  const whitespace = /^(\s*)([\s\S]*?)(\s*)$/.exec(source)!;
  const core = whitespace[2];
  const exact = zhCN.get(core);
  if (exact !== undefined) return whitespace[1] + exact + whitespace[3];
  const punctuated = /^(.*?)(…|\.\.\.|:)$/.exec(core);
  if (punctuated && zhCN.has(punctuated[1])) return whitespace[1] + zhCN.get(punctuated[1]) + (punctuated[2] === ':' ? '：' : '…') + whitespace[3];
  // Keyboard suffixes are presentation only and must keep their original keys.
  const keys = /^(.*?) (\((?:[⌘⇧⌥⌃A-Za-z0-9+→←↑↓ ,/=-]|Ctrl|Shift|Alt|Tab|Enter|Escape)+\))$/.exec(core);
  if (keys) {
    const label = translateChineseText(keys[1]);
    if (label !== keys[1]) return whitespace[1] + label + ' ' + keys[2] + whitespace[3];
  }
  const phrases = /^(.*?)(?:: | — )(.*)$/.exec(core);
  if (phrases) {
    const label = translateChineseText(phrases[1]);
    const detail = zhCN.get(phrases[2]);
    if (label !== phrases[1] && detail) return whitespace[1] + label + '：' + detail + whitespace[3];
  }
  // Toolbar help is assembled from an exact tool label and fixed help lines.
  if (core.includes('\n')) {
    const lines = core.split('\n');
    const translated = lines.map((line) => translateChineseText(line));
    if (translated.some((line, i) => line !== lines[i])) return whitespace[1] + translated.join('\n') + whitespace[3];
  }
  for (const [pattern, format] of uiPatterns) {
    const match = pattern.exec(core);
    if (match) return whitespace[1] + format(match) + whitespace[3];
  }
  return source;
}

const uiPatterns: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^About (\d+) min$/, (m) => `约 ${m[1]} 分钟`],
  [/^([0-9.,]+\s?[KMGT]?B?) flattened \/ ([0-9.,]+\s?[KMGT]?B?) in layers$/, (m) => `${m[1]}（合并后）/ ${m[2]}（图层）`],
  [/^Close (.+)$/, (m) => zhCN.has(m[1]) ? `关闭${translateChineseText(m[1])}` : m[0]],
  [/^([0-9.,]+ [KMGT]?B) in ([0-9,]+) tiles \(with history\)$/, (m) => `${m[1]}，${m[2]} 个像素块（含历史记录）`],
  [/^Create (.+)$/, (m) => zhCN.has(m[1]) ? `创建${translateChineseText(m[1])}` : m[0]],
  [/^Note (\d+) of (\d+)$/, (m) => `注释 ${m[1]}/${m[2]}`],
  [/^Tutorial: (.+)$/, (m) => `教程：${translateChineseText(m[1])}`],
  [/^(.+) · Step (\d+) of (\d+)$/, (m) => `${translateChineseText(m[1])} · 第 ${m[2]}/${m[3]} 步`],
  [/^Stroke width \((px|pt|mm|cm|in|percent)\)$/, (m) => `描边宽度（${m[1]}）`],
  [/^(.*) Theme$/, (m) => zhCN.has(m[1]) ? `${translateChineseText(m[1])}主题` : m[0]],
  [/^View all (\d+)$/, (m) => `查看全部 ${m[1]} 项`],
  [/^Color stop (\d+)( position \(%\)| midpoint \(%\))?$/, (m) => `颜色色标 ${m[1]}${m[2]?.startsWith(' position') ? ' 位置（%）' : m[2] ? ' 中点（%）' : ''}`],
  [/^Opacity stop (\d+) (opacity|position|midpoint) \(%\)$/, (m) => `不透明度色标 ${m[1]} ${({ opacity: '不透明度', position: '位置', midpoint: '中点' } as Record<string, string>)[m[2]]}（%）`],
  [/^Remove (color|opacity) stop (\d+)$/, (m) => `移除${m[1] === 'color' ? '颜色' : '不透明度'}色标 ${m[2]}`],
  [/^(.*) panel menu$/, (m) => `${translateChineseText(m[1])}面板菜单`],
  [/^Shortcut for (.*)$/, (m) => `${translateChineseText(m[1])}的快捷键`],
  [/^(\d+) layers?$/, (m) => `${m[1]} 个图层`],
  [/^(\d+) layers selected$/, (m) => `已选择 ${m[1]} 个图层`],
  [/^(\d+) × (\d+) pixels · ([0-9.,]+ [KMGT]?B)$/, (m) => `${m[1]} × ${m[2]} 像素 · ${m[3]}`],
  [/^(\d+) selected$/, (m) => `已选择 ${m[1]} 项`],
  [/^(\d+) pins?$/, (m) => `${m[1]} 个图钉`],
  [/^(\d+) paths?$/, (m) => `${m[1]} 条路径`],
  [/^(\d+) frames?$/, (m) => `${m[1]} 帧`],
  [/^(\d+) bits\/channel$/, (m) => `${m[1]} 位/通道`],
  [/^Shift\+([A-Z]) or right-click for the other tools in this slot$/, (m) => `按 Shift+${m[1]} 或右键查看此组的其他工具`],
  [/^Right-click for the other tools in this slot$/, () => '右键查看此组的其他工具'],
  [/^Right-click, hold or press → for the list$/, () => '右键、长按或按 → 查看列表'],
  [/^Double-click or Alt-click for options$/, () => '双击或按住 Alt 点击可设置选项'],
  [/^Click for these tools and Edit Toolbar$/, () => '点击查看工具或编辑工具栏'],
  [/^Choose which tools show and in what order$/, () => '选择显示的工具及其顺序'],
  [/^Search commands (\(.*\))$/, (m) => `搜索命令 ${m[1]}`],
  [/^Extra tools(?:: | — )(.*)$/, (m) => `额外工具：${translateChineseText(m[1])}`],
  [/^([\d.,]+) MB used of ([\d.,]+) GB available$/, (m) => `已使用 ${m[1]} MB，可用 ${m[2]} GB`],
  [/^([\d.,]+) MB used$/, (m) => `已使用 ${m[1]} MB`],
  [/^just now$/, () => '刚刚'],
  [/^(\d+) min ago$/, (m) => `${m[1]} 分钟前`],
  [/^(\d+) hr ago$/, (m) => `${m[1]} 小时前`],
  [/^(\d+) days? ago$/, (m) => `${m[1]} 天前`],
];

/** One `; `-separated loss label from a save/export warning: known feature
 * labels translate, captured names and unknown text stay as written. */
function translateLossLabel(label: string): string {
  const exact = translateChineseText(label);
  if (exact !== label) return exact;
  const adjustments = /^(.+) adjustments$/.exec(label);
  if (adjustments) return `${adjustments[1].split(/, | and /).map((n) => translateChineseText(n)).join('、')}调整`;
  const mode = /^the (Grayscale|CMYK|Lab|Indexed|Bitmap|Duotone|Multichannel) color mode \(written as RGB\)$/.exec(label);
  if (mode) return `${({ Grayscale: '灰度', Bitmap: '位图', Duotone: '双色调', Multichannel: '多通道' } as Record<string, string>)[mode[1]] ?? mode[1]} 色彩模式（导出为 RGB）`;
  const bits = /^(\d+)-bit color \(written as (\d+)-bit\)$/.exec(label);
  if (bits) return `${bits[1]} 位颜色（导出为 ${bits[2]} 位）`;
  const named = /^(the (?:other (?:\d+ )?(?:frames?|pages?)|(?:frames|pages) after the first \d+|layers another editor stored in it|CMYK colors|(?:EXIF|XMP|EXIF and XMP|XMP and EXIF) metadata)) of ([\s\S]+)$/.exec(label);
  if (named) return `“${named[2]}”中的${translateMessage(named[1])}`;
  return label;
}

function translateLossList(list: string): string {
  return list.split('; ').map(translateLossLabel).join('、');
}

/** Only call at a known status/dialog boundary. Captured filenames and document
 * names remain opaque; unlike translateText this accepts dynamic messages. */
export function translateMessage(source: string, values?: TranslationValues): string {
  if (getLanguage() === 'en') return sourceText(source, values);
  if (values) return t(source, values);
  const exact = translateChineseText(source);
  if (exact !== source) return exact;
  for (const [pattern, format] of messagePatterns) {
    const match = pattern.exec(source);
    if (match) return format(match);
  }
  // Canonical multipart messages join their parts with newlines: translate
  // each part independently so filenames never blur into surrounding text.
  if (source.includes('\n')) {
    const lines = source.split('\n');
    const translated = lines.map((line) => translateMessage(line));
    if (translated.some((line, i) => line !== lines[i])) return translated.join('\n');
  }
  return source;
}

const messagePatterns: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Text set in (.+) shows its saved appearance until edited \(the font is not available here\)\.$/, (m) => `本机缺少字体 ${m[1]}，相关文字在编辑前会保持文件中保存的外观。`],
  [/^The embedded ICC profile cannot be used for display \(([\s\S]+)\)\. Its bytes are retained; colors are shown as sRGB\.$/, (m) => `嵌入的 ICC 色彩配置无法用于显示（${m[1]}）。原始配置数据已保留，颜色暂按 sRGB 显示。`],
  [/^PSD exceeds (\d+) layers\.$/, (m) => `PSD 超过 ${m[1]} 个图层。`],
  [/^The embedded (Gray|CMYK|Lab|color) profile does not describe the opened RGB pixels and was not applied\.$/, (m) => `嵌入的 ${m[1] === 'color' ? '色彩' : m[1]} 配置文件与打开后的 RGB 像素不匹配，因此未应用。`],
  [/^Pages (\d+) and later were not opened: they need more memory than one file may use\.$/, (m) => `第 ${m[1]} 页及后续页面超出单个文件的内存限制，未打开。`],
  [/^Page (\d+): (.+)$/, (m) => `第 ${m[1]} 页：${translateMessage(m[2])}`],
  [/^the (EXIF|XMP|EXIF and XMP|XMP and EXIF) metadata$/, (m) => `${m[1].replace(' and ', ' 和 ')} 元数据`],
  [/^Save as (PSD|PNG|JPEG|WebP|AVIF|GIF|TIFF|BMP|TGA|\.photo)$/, (m) => `另存为 ${m[1]}`],
  [/^Animated (GIF|PNG) with (\d+) frames; the first was opened\.$/, (m) => `此 ${m[1]} 动画共有 ${m[2]} 帧，已打开第一帧。`],
  [/^The file has (\d+) pages; the first was opened\.$/, (m) => `此文件共有 ${m[1]} 页，已打开第一页。`],
  [/^Opened the (\d+)×(\d+) image of (\d+)\.$/, (m) => `已打开 ${m[3]} 张图像中的 ${m[1]}×${m[2]} 图像。`],
  [/^Only the first (\d+) frames were opened: the rest need more memory than one file may use\.$/, (m) => `仅打开前 ${m[1]} 帧，其余帧超出单个文件的内存限制。`],
  [/^Only the first (\d+) of (\d+) (frames|pages) were opened: a (frame animation|document) holds up to (\d+) (frames|layers)\.$/, (m) => `共 ${m[2]} ${m[3] === 'pages' ? '页' : '帧'}，仅打开前 ${m[1]} ${m[3] === 'pages' ? '页' : '帧'}；${m[4] === 'document' ? '文档' : '帧动画'}最多包含 ${m[5]} ${m[6] === 'frames' ? '帧' : '个图层'}。`],
  [/^the other (\d+) (frames?|pages?)$/, (m) => `其余 ${m[1]} ${m[2].startsWith('page') ? '页' : '帧'}`],
  [/^the (frames|pages) after the first (\d+)$/, (m) => `第 ${m[2]} ${m[1] === 'pages' ? '页' : '帧'}之后的内容`],
  [/^(.+) cancelled\.$/, (m) => `${translateChineseText(m[1])}已取消。`],
  [/^(.+) works on pixel layers\.$/, (m) => `${translateChineseText(m[1])}适用于像素图层。`],
  [/^(\d+) warnings? will be shown again\.$/, (m) => `将重新显示 ${m[1]} 个警告。`],
  [/^Preferences imported; (\d+) unknown or invalid entr(?:y was|ies were) skipped\.$/, (m) => `已导入首选项，跳过 ${m[1]} 个未知或无效条目。`],
  [/^Rasterize type and shape layers to flip them \(skipped: (.+)\)\.$/, (m) => `请先栅格化文字和形状图层再翻转（已跳过：${m[1]}）。`],
  [/^Skipped type and shape layers: (.+)\.$/, (m) => `已跳过文字和形状图层：${m[1]}。`],
  [/^Outlines used the default font for: (.+)\.$/, (m) => `以下文字轮廓使用了默认字体：${m[1]}。`],
  [/^([^\n]+) exported \(([^\n]+)\)$/, (m) => `已导出 ${m[1]}（${m[2]}）`],
  [/^([^\n]+) exported to (.+) \(([^\n]+)\)$/, (m) => `已将 ${m[1]} 导出到 ${m[2]}（${m[3]}）`],
  [/^Exporting layer (\d+) of (\d+)…$/, (m) => `正在导出图层 ${m[1]}/${m[2]}…`],
  [/^Exported (\d+) layers \((.+)\)$/, (m) => `已导出 ${m[1]} 个图层（${m[2]}）`],
  [/^Exported (\d+) paths? as SVG\.$/, (m) => `已将 ${m[1]} 条路径导出为 SVG。`],
  [/^Encoding (\d+) GIF frames?…$/, (m) => `正在编码 ${m[1]} 帧 GIF…`],
  [/^GIF exported: (\d+) frames?, (.+)$/, (m) => `已导出 GIF：${m[1]} 帧，${m[2]}`],
  [/^Reading (.+)…$/, (m) => `正在读取 ${m[1]}…`],
  [/^(.+) has no layers\.$/, (m) => `${m[1]} 没有图层。`],
  [/^Exported (.+) \(([^\n]+)\)( with provenance)?$/, (m) => `已导出 ${m[1]}（${m[2]}）${m[3] ? '，包含来源记录' : ''}`],
  [/^Saved (.+) to Puter$/, (m) => `已将 ${m[1]} 保存到 Puter`],
  [/^Saved a copy as (.+)$/, (m) => `已将副本保存为 ${m[1]}`],
  [/^Downloaded a copy as (.+)\. Save to update the embedded object\.$/, (m) => `已下载副本 ${m[1]}。请保存以更新嵌入对象。`],
  [/^Downloaded (.+)$/, (m) => `已下载 ${m[1]}`],
  [/^Opened (.+) as a (\d+)-frame animation$/, (m) => `已将 ${m[1]} 打开为 ${m[2]} 帧动画`],
  [/^Opened (.+)$/, (m) => `已打开 ${m[1]}`],
  [/^(.+) is already open\.$/, (m) => `${m[1]} 已打开。`],
  [/^“(.+)” is shown when the current task finishes\.$/, (m) => `当前任务完成后将显示“${m[1]}”。`],
  [/^“(.+)” can be closed when the current task finishes\.$/, (m) => `当前任务完成后可以关闭“${m[1]}”。`],
  [/^(.+) opens? when the current task finishes\.$/, (m) => `当前任务完成后将打开 ${m[1]}。`],
  [/^Unknown command: (.+)$/, (m) => `未知命令：${m[1]}`],
  [/^Save changes to “(.+)”\?$/, (m) => `保存对“${m[1]}”的更改吗？`],
  [/^Saving updates the embedded object in (.+)\.$/, (m) => `保存后将更新 ${m[1]} 中的嵌入对象。`],
  [/^Save changes to “(.+)” before closing\?$/, (m) => `关闭前保存对“${m[1]}”的更改吗？`],
  [/^Save changes to (.+) before closing\?$/, (m) => `关闭前保存对 ${m[1]} 的更改吗？`],
  [/^(.+) reset to its default options\.$/, (m) => `${translateChineseText(m[1])}已恢复默认选项。`],
  [/^Reading (\d+) of (\d+): (.+)$/, (m) => `正在读取第 ${m[1]}/${m[2]} 项：${m[3]}`],
  [/^Processing (\d+) of (\d+): (.+)$/, (m) => `正在处理第 ${m[1]}/${m[2]} 项：${m[3]}`],
  [/^Could not load (.+): (.+)$/, (m) => `无法载入 ${m[1]}：${m[2]}`],
  [/^Could not (open|save|export|import) (.+)$/, (m) => `无法${({ open: '打开', save: '保存', export: '导出', import: '导入' } as Record<string, string>)[m[1]]} ${m[2]}`],
  [/^(PSD|PSB|PNG|JPEG|WebP|AVIF|GIF|TIFF|BMP|TGA|\.photo) flattens ([\s\S]+) into pixels\.$/, (m) => `${m[1]} 会将以下内容栅格化：${translateLossList(m[2])}。`],
  [/^(PSD|PSB|PNG|JPEG|WebP|AVIF|GIF|TIFF|BMP|TGA|\.photo) leaves out ([\s\S]+)\.$/, (m) => `${m[1]} 不会保留以下内容：${translateLossList(m[2])}。`],
  [/^(PSD|PSB|PNG|JPEG|WebP|AVIF|GIF|TIFF|BMP|TGA|\.photo) stores one flattened image\.$/, (m) => `${m[1]} 只保存拼合后的一张图像。`],
  [/^This document cannot be saved as (PSD|PSB|PNG|JPEG|WebP|AVIF|GIF|TIFF|BMP|TGA|\.photo)\.$/, (m) => `此文档无法保存为 ${m[1]}。`],
  [/^A \.photo project leaves ([\s\S]+) unchanged\.$/, (m) => `另存为 .photo 项目不会改动原文件“${m[1]}”。`],
  [/^(.+) could not be opened: ([\s\S]+)$/, (m) => `无法打开“${m[1]}”：${translateMessage(m[2])}`],
  [/^(.+) is no longer at (.+) and was removed from Open Recent\.$/, (m) => `“${m[1]}”已不在 ${m[2]}，已从最近打开列表中移除。`],
  [/^(.+) is no longer stored in this browser and was removed from Open Recent\. Open it again from its location\.$/, (m) => `此浏览器不再保存“${m[1]}”，已从最近打开列表中移除。请从文件的原位置重新打开。`],
  [/^Restored (\d+) documents?\. Save to keep (?:it|them)\.$/, (m) => `已恢复 ${m[1]} 个文档。请保存以保留更改。`],
];

/** Menu commands whose labels come directly from users, not the UI catalog. */
export function isUserCommand(id: string): boolean {
  return /^(?:file\.recent\.(?!clear$)|window\.document-|window\.workspace-user-|script\.run\.)/.test(id);
}
