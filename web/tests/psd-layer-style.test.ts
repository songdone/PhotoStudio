import { describe, expect, it } from 'vitest';
import { importPsdLayerStyle } from '../src/model/psd-layer-style';

describe('PSD layer style import', () => {
  it('treats missing, disabled and switched-off styles as drawing nothing', () => {
    expect(importPsdLayerStyle(undefined)).toEqual({});
    expect(importPsdLayerStyle({ disabled: true, dropShadow: [{ enabled: true }] } as never)).toEqual({});
    expect(importPsdLayerStyle({ bevel: { enabled: false }, satin: { enabled: false }, dropShadow: [{ enabled: false }] } as never)).toEqual({});
  });
  it('converts color overlay, gradient overlay, stroke and a straight drop shadow', () => {
    const r = importPsdLayerStyle({
      solidFill: [{ enabled: true, blendMode: 'normal', opacity: 1, color: { r: 255, g: 255, b: 255 } }],
      gradientOverlay: [{ enabled: true, blendMode: 'normal', opacity: 1, type: 'linear', angle: 102, scale: 1.33, align: true, interpolationMethod: 'smooth',
        gradient: { type: 'solid', name: 'g', smoothness: 1, colorStops: [{ color: { r: 237, g: 189, b: 97 }, location: 0, midpoint: 0.5 }, { color: { r: 243, g: 238, b: 170 }, location: 1, midpoint: 0.5 }], opacityStops: [] } }],
      stroke: [{ enabled: true, blendMode: 'normal', opacity: 1, size: { value: 4, units: 'Pixels' }, position: 'outside', fillType: 'color', color: { r: 227, g: 202, b: 165 } }],
      dropShadow: [{ enabled: true, blendMode: 'multiply', opacity: 0.5, color: { r: 0, g: 0, b: 0 }, angle: 90, distance: { value: 3, units: 'Pixels' }, size: { value: 5, units: 'Pixels' }, choke: { value: 20, units: 'Pixels' } }],
    } as never, 30);
    const s = r!.style!;
    expect(s.globalAngle).toBe(30);
    expect(s.colorOverlay).toEqual([{ enabled: true, blendMode: 'normal', opacity: 1, color: [255, 255, 255] }]);
    expect(s.gradientOverlay![0]).toMatchObject({ style: 'linear', angle: 102, scale: 1.33, alignWithLayer: true, method: 'classic' });
    expect(s.gradientOverlay![0].gradient).toMatchObject({ kind: 'solid', smoothness: 100 });
    expect(s.stroke).toEqual([{ enabled: true, blendMode: 'normal', opacity: 1, size: 4, position: 'outside', fill: { type: 'color', color: [227, 202, 165] } }]);
    expect(s.dropShadow![0]).toMatchObject({ blendMode: 'multiply', opacity: 0.5, distance: 3, size: 5, spread: 0.2 });
  });
  it('refuses effects it cannot reproduce so the file keeps its saved composite', () => {
    expect(importPsdLayerStyle({ bevel: { enabled: true } } as never)).toBeUndefined();
    expect(importPsdLayerStyle({ stroke: [{ enabled: true, fillType: 'gradient', size: { value: 2, units: 'Pixels' } }] } as never)).toBeUndefined();
    expect(importPsdLayerStyle({ stroke: [{ enabled: true, color: { r: 0, g: 0, b: 0 }, size: { value: 2, units: 'Points' } }] } as never)).toBeUndefined();
    expect(importPsdLayerStyle({ gradientOverlay: [{ enabled: true, gradient: { type: 'noise', name: 'n', min: [], max: [] } }] } as never)).toBeUndefined();
    expect(importPsdLayerStyle({ dropShadow: [{ enabled: true, color: { r: 0, g: 0, b: 0 }, contour: { name: 'c', curve: [{ x: 0, y: 0 }, { x: 128, y: 255 }, { x: 255, y: 0 }] } }] } as never)).toBeUndefined();
  });
});
