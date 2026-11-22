import { afterEach, describe, expect, it } from 'vitest';
import { NAS_MAX_BYTES, normalizeNasFileName, parseNasFileStat, validateNasFolder, validNasPath } from '../src/features/files/fnos-path';
import { setLanguage } from '../src/i18n/locale';
import { t } from '../src/i18n/translate';

afterEach(() => setLanguage('zh-CN'));

describe('NAS save paths', () => {
  it('keeps decoded filenames and literal percent characters without decoding twice', () => {
    expect(normalizeNasFileName('Save $& 100% 原稿', 'photo')).toBe('Save $& 100% 原稿.photo');
    expect(normalizeNasFileName('Save%2FBackground.PNG', 'png')).toBe('Save%2FBackground.PNG');
    expect(normalizeNasFileName(' image.png ', 'png')).toBe('image.png');
    expect(normalizeNasFileName('image.jpeg', 'jpg')).toBe('image.jpeg');
    expect(normalizeNasFileName('image.tiff', 'tif')).toBe('image.tiff');
    expect(normalizeNasFileName('image.psb', 'psd')).toBeUndefined();
    expect(normalizeNasFileName('image.jpg', 'png')).toBeUndefined();
  });

  it('rejects path segments, hidden names and unsupported encodings before selecting a folder', () => {
    for (const name of ['', '..', '.hidden', '../image', '/image', 'folder/image', 'folder\\image', 'image\nname', 'image\x00', 'image\ud800', 'image.']) {
      expect(normalizeNasFileName(name, 'photo'), name).toBeUndefined();
    }
    expect(normalizeNasFileName('image', 'exe')).toBeUndefined();
    expect(normalizeNasFileName('图'.repeat(84), 'photo')).toBeUndefined();
    expect(normalizeNasFileName('图'.repeat(80), 'photo')).toBeDefined();
  });

  it('accepts directories only beneath the supported volume namespace', () => {
    for (const folder of ['/vol1', '/vol12/1000/我的照片', '/vol2/原图 100%']) {
      expect(validateNasFolder(folder), folder).toBe(true);
      expect(validNasPath(`${folder}/new.photo`)).toBe(true);
    }
    for (const folder of ['/', '/etc', '/vol0/a', '/vol01/a', '/vol1/a/../b', '/vol1/.hidden', '/vol1/a\\b', '/vol1/a\n', '/vol1//a', '/vol1/a/', '/vol1/\ud800']) {
      expect(validateNasFolder(folder), folder).toBe(false);
    }
  });
});

describe('NAS file version', () => {
  it('round-trips nanosecond strings that are not exactly representable as numbers', () => {
    const stat = { size: 123, mtime: '1730000000000000007', revision: 'metadata:123-ab' };
    expect(parseNasFileStat(stat)).toEqual(stat);
    expect(parseNasFileStat({ size: 0, mtime: '0' })).toEqual({ size: 0, mtime: '0' });
    expect(parseNasFileStat({ size: NAS_MAX_BYTES, mtime: '-9223372036854775808' })).toBeDefined();
    expect(parseNasFileStat({ size: 1, mtime: '9223372036854775807' })).toBeDefined();
  });

  it('rejects rounded timestamps, incomplete locks and unsafe revision values', () => {
    for (const value of [
      null, [], {}, { size: 123 }, { mtime: '1' },
      { size: 123, mtime: 1730000000000000007 },
      { size: -1, mtime: '1' }, { size: NAS_MAX_BYTES + 1, mtime: '1' },
      { size: 0.5, mtime: '1' }, { size: '123', mtime: '1' },
      { size: 123, mtime: '1e9' }, { size: 123, mtime: '1.2' },
      { size: 123, mtime: '01' }, { size: 123, mtime: ' 1' },
      { size: 123, mtime: '9223372036854775808' },
      { size: 123, mtime: '-9223372036854775809' },
      { size: 123, mtime: '1', revision: '../filename' },
      { size: 123, mtime: '1', revision: 'x\r\nHeader: forged' },
    ]) expect(parseNasFileStat(value), JSON.stringify(value)).toBeUndefined();
  });
});

describe('NAS save bilingual messages', () => {
  it('keeps filename parameters intact and restores the English source', () => {
    const name = 'Save $& Background.png';
    expect(t('Saved {name} to the NAS', { name })).toBe(`已将 ${name} 保存到 NAS`);
    setLanguage('en');
    expect(t('Saved {name} to the NAS', { name })).toBe(`Saved ${name} to the NAS`);
  });
});
