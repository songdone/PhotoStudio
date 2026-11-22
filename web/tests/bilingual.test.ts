import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, onLanguageChange, readUILanguage, setLanguage } from '../src/i18n/locale';
import { sourceText, t, translateMessage, translateText } from '../src/i18n/translate';
import { localizedAttribute, localizedHTML } from '../src/i18n/dom';
import {
  coerceSetting,
  defaultPreferences,
  exportPreferences,
  importPreferences,
  searchSettings,
  settingFor,
} from '../src/model/preferences';

afterEach(() => setLanguage('zh-CN'));

describe('language state', () => {
  it('defaults to Simplified Chinese and only accepts the two choices', () => {
    expect(getLanguage()).toBe('zh-CN');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    setLanguage('ja' as never);
    expect(getLanguage()).toBe('zh-CN');
  });

  it('notifies listeners on changes and stops after unsubscribing', () => {
    const seen: string[] = [];
    const off = onLanguageChange((language) => seen.push(language));
    setLanguage('en');
    off();
    setLanguage('zh-CN');
    expect(seen).toEqual(['en']);
  });

  it('reads the saved language for the independent startup screen', () => {
    const original = globalThis.localStorage;
    const withStorage = (value: string) => {
      (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => value };
    };
    try {
      (globalThis as { localStorage?: unknown }).localStorage = undefined;
      expect(readUILanguage()).toBe('zh-CN');
      withStorage('not json');
      expect(readUILanguage()).toBe('zh-CN');
      withStorage(JSON.stringify({ version: 2, uiLanguage: 'en' }));
      expect(readUILanguage()).toBe('en');
      withStorage(JSON.stringify({ version: 2, uiLanguage: 'en', resetOnLaunch: true }));
      expect(readUILanguage()).toBe('zh-CN');
      withStorage(JSON.stringify({ version: 2, uiLanguage: 'zh-CN' }));
      expect(readUILanguage()).toBe('zh-CN');
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});

describe('reversible translation', () => {
  it('returns the English source in English mode and the catalog entry in Chinese', () => {
    expect(t('Close')).toBe('关闭');
    setLanguage('en');
    expect(t('Close')).toBe('Close');
    expect(t('Close {name}', { name: 'Save' })).toBe('Close Save');
    setLanguage('zh-CN');
    expect(t('Close {name}', { name: 'Save' })).toBe('关闭 Save');
  });

  it('keeps interpolation values opaque, including replacement patterns', () => {
    const name = 'Save $& ${name} {name} Background';
    expect(t('A .photo project leaves {name} unchanged.', { name })).toBe(`另存为 .photo 项目不会改动原文件“${name}”。`);
    setLanguage('en');
    expect(t('A .photo project leaves {name} unchanged.', { name })).toBe(`A .photo project leaves ${name} unchanged.`);
    setLanguage('zh-CN');
    expect(sourceText('Opened {name}', { name })).toBe('Opened Save $& ${name} {name} Background');
  });

  it('resolves templates from the fragment dictionaries', () => {
    expect(t('Duplicate “{name}” as', { name: '图层 1' })).toBe('将“图层 1”复制为');
    expect(t('{count} files', { count: 3 })).toBe('3 个文件');
    expect(t('This file has {count} pages', { count: 4 })).toBe('此文件共有 4 页');
    expect(t('Results for “{query}”', { query: '语言' })).toBe('“语言”的搜索结果');
    setLanguage('en');
    expect(t('Duplicate “{name}” as', { name: '图层 1' })).toBe('Duplicate “图层 1” as');
    setLanguage('zh-CN');
  });

  it('never translates registered user labels in either language', () => {
    expect(translateText('My Own Document')).toBe('My Own Document');
    setLanguage('en');
    expect(translateText('背景')).toBe('背景');
    setLanguage('zh-CN');
  });

  it('searches settings in either language', () => {
    expect(searchSettings('语言').some((s) => s.key === 'uiLanguage')).toBe(true);
    expect(searchSettings('language').some((s) => s.key === 'uiLanguage')).toBe(true);
    expect(searchSettings('界面语言').some((s) => s.key === 'uiLanguage')).toBe(true);
  });

  it('binds display strings to their English sources', () => {
    const attr = localizedAttribute('aria-label', 'Close {name}', { name: 'Save' });
    expect(attr).toContain('aria-label="关闭 Save"');
    expect(attr).toContain('data-i18n-attr-aria-label="Close {name}"');
    setLanguage('en');
    expect(localizedAttribute('aria-label', 'Close {name}', { name: 'Save' })).toContain('aria-label="Close Save"');
    setLanguage('zh-CN');
    expect(localizedHTML('Status bar shows')).toContain('状态栏显示');
    expect(localizedHTML('Status bar shows')).toContain('data-i18n-source="Status bar shows"');
  });
});

describe('file warning grammar', () => {
  it('translates multipart open errors line by line, keeping names opaque', () => {
    const message = 'One.png could not be opened: missing data.\nTwo.png could not be opened: corrupt header';
    expect(translateMessage(message)).toBe('无法打开“One.png”：missing data.\n无法打开“Two.png”：corrupt header');
  });

  it('translates loss sentences with names, features and formats separated', () => {
    expect(
      translateMessage('PSD leaves out the EXIF metadata of 备份.photo; the CMYK colors of 测试.photo.'),
    ).toBe('PSD 不会保留以下内容：“备份.photo”中的EXIF 元数据、“测试.photo”中的CMYK 颜色。');
    expect(translateMessage('.photo stores one flattened image.')).toBe('.photo 只保存拼合后的一张图像。');
    expect(translateMessage('This document cannot be saved as GIF.')).toBe('此文档无法保存为 GIF。');
    expect(translateMessage('JPEG flattens the Grayscale color mode (written as RGB); 8-bit adjustments into pixels.')).toBe(
      'JPEG 会将以下内容栅格化：灰度 色彩模式（导出为 RGB）、8-bit调整。',
    );
  });

  it('keeps the English source for removed recent files', () => {
    setLanguage('en');
    expect(translateMessage('a.png is no longer at /vol1/a.png and was removed from Open Recent.')).toBe(
      'a.png is no longer at /vol1/a.png and was removed from Open Recent.',
    );
    setLanguage('zh-CN');
    expect(translateMessage('a.png is no longer at /vol1/a.png and was removed from Open Recent.')).toBe(
      '“a.png”已不在 /vol1/a.png，已从最近打开列表中移除。',
    );
  });
});

describe('language preference persistence', () => {
  it('coerces the language choice and rejects unknown values', () => {
    const def = settingFor('uiLanguage')!;
    expect(def.default).toBe('zh-CN');
    expect(coerceSetting(def, 'en')).toBe('en');
    expect(coerceSetting(def, 'zh-CN')).toBe('zh-CN');
    expect(coerceSetting(def, 'fr')).toBeUndefined();
  });

  it('survives export and import, and old files keep the current language', () => {
    const prefs = defaultPreferences();
    prefs.uiLanguage = 'en';
    const exported = JSON.parse(exportPreferences(prefs));
    expect(exported.preferences.uiLanguage).toBe('en');

    const current = defaultPreferences();
    current.uiLanguage = 'zh-CN';
    const { preferences } = importPreferences(exportPreferences(prefs), current);
    expect(preferences.uiLanguage).toBe('en');

    const old = JSON.parse(exportPreferences(defaultPreferences()));
    delete old.preferences.uiLanguage;
    const merged = importPreferences(JSON.stringify(old), current);
    expect(merged.preferences.uiLanguage).toBe('zh-CN');
    expect(merged.ignored).toEqual([]);
  });

  it('reports validation problems for invalid language values', () => {
    const broken = JSON.parse(exportPreferences(defaultPreferences()));
    broken.preferences.uiLanguage = 'fr';
    const merged = importPreferences(JSON.stringify(broken), defaultPreferences());
    expect(merged.preferences.uiLanguage).toBe('zh-CN');
    expect(merged.ignored).toContain('uiLanguage');
  });
});
