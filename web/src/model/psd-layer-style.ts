import type {
  BlendMode as PsdBlendMode,
  Color,
  EffectContour,
  EffectNoiseGradient,
  EffectSolidGradient,
  LayerEffectGradientOverlay,
  LayerEffectShadow,
  LayerEffectSolidFill,
  LayerEffectStroke,
  LayerEffectsInfo,
  UnitsValue,
} from 'ag-psd';
import type { BlendMode } from '../imaging/blend/modes';
import type { SolidGradient } from '../imaging/gradient/gradient';
import type {
  ColorOverlayFx,
  GradientOverlayFx,
  LayerStyle,
  RGB,
  ShadowFx,
  StrokeFx,
} from '../imaging/effects/types';
import { blends } from './document';

// PSD layer styles the editor reproduces as editable effects: Drop
// Shadow (linear contour), Color Overlay, Gradient Overlay (solid gradients)
// and color Strokes measured in pixels. Effects that are switched off are
// dropped, since they draw nothing. Any other enabled effect returns
// `undefined`, and the caller keeps opening the file through its saved
// composite as before.

type Toggle = { enabled?: boolean };
const enabled = (fx: Toggle | undefined) => !!fx && fx.enabled !== false;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fraction = (v: number | undefined, fallback: number) => (finite(v) ? clamp(v, 0, 1) : fallback);

const SUPPORTED = new Set(['dropShadow', 'solidFill', 'gradientOverlay', 'stroke']);
// The PSD "Smooth" interpolation method eases through every stop, which is the
// classic method at full smoothness.
const METHODS: Record<string, GradientOverlayFx['method'] | 'smooth'> = {
  classic: 'classic',
  perceptual: 'perceptual',
  linear: 'linear',
  smooth: 'smooth',
};

function rgb(c: Color | undefined): RGB | undefined {
  if (!c) return undefined;
  const to8 = (v: number) => Math.round(clamp(v, 0, 255));
  if ('r' in c && finite(c.r) && finite(c.g) && finite(c.b)) return [to8(c.r), to8(c.g), to8(c.b)];
  if ('fr' in c && finite(c.fr) && finite(c.fg) && finite(c.fb)) return [to8(c.fr * 255), to8(c.fg * 255), to8(c.fb * 255)];
  return undefined;
}

function blend(mode: PsdBlendMode | string | undefined): BlendMode | undefined {
  const m = mode ?? 'normal';
  return (blends as string[]).includes(m) ? (m.replace(/ /g, '-') as BlendMode) : undefined;
}

function pixels(v: UnitsValue | undefined, fallback: number | undefined): number | undefined {
  if (!v) return fallback;
  if (v.units !== 'Pixels' || !finite(v.value) || v.value < 0) return undefined;
  return v.value;
}

// Only the default straight contour; shaped contours keep the composite path.
function linearContour(c: EffectContour | undefined) {
  if (!c?.curve?.length) return true;
  const pts = c.curve;
  return pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255;
}

function solidGradient(g: EffectSolidGradient | EffectNoiseGradient | undefined): SolidGradient | undefined {
  if (!g || g.type !== 'solid' || !g.colorStops?.length) return undefined;
  const midpoint = (v: number | undefined) => (finite(v) ? clamp(v * 100, 5, 95) : 50);
  const colorStops: SolidGradient['colorStops'] = [];
  for (const s of g.colorStops) {
    const color = rgb(s.color);
    if (!color || !finite(s.location)) return undefined;
    colorStops.push({ location: clamp(s.location, 0, 1), color, midpoint: midpoint(s.midpoint) });
  }
  const opacityStops: SolidGradient['opacityStops'] = [];
  const opacities = g.opacityStops?.length
    ? g.opacityStops
    : [{ location: 0, opacity: 1, midpoint: 0.5 }, { location: 1, opacity: 1, midpoint: 0.5 }];
  for (const s of opacities) {
    if (!finite(s.location)) return undefined;
    opacityStops.push({ location: clamp(s.location, 0, 1), opacity: fraction(s.opacity, 1), midpoint: midpoint(s.midpoint) });
  }
  return {
    kind: 'solid',
    ...(g.name ? { name: g.name } : {}),
    colorStops,
    opacityStops,
    smoothness: finite(g.smoothness) ? clamp(g.smoothness * 100, 0, 100) : 100,
  };
}

function dropShadow(fx: LayerEffectShadow): ShadowFx | undefined {
  const color = rgb(fx.color), mode = blend(fx.blendMode);
  const size = pixels(fx.size, 0), distance = pixels(fx.distance, 0), spread = pixels(fx.choke, 0);
  if (!color || !mode || size === undefined || distance === undefined || spread === undefined) return undefined;
  if (!linearContour(fx.contour)) return undefined;
  return {
    enabled: true,
    blendMode: mode,
    opacity: fraction(fx.opacity, 0.75),
    color,
    angle: finite(fx.angle) ? fx.angle : 120,
    useGlobalLight: !!fx.useGlobalLight,
    distance: clamp(distance, 0, 1000),
    // PSD files store spread as a percentage of the size.
    spread: clamp(spread / 100, 0, 1),
    size: clamp(size, 0, 250),
    antiAliased: !!fx.antialiased,
    noise: 0,
    knockout: fx.layerConceals !== false,
  };
}

function colorOverlay(fx: LayerEffectSolidFill): ColorOverlayFx | undefined {
  const color = rgb(fx.color), mode = blend(fx.blendMode);
  if (!color || !mode) return undefined;
  return { enabled: true, blendMode: mode, opacity: fraction(fx.opacity, 1), color };
}

function gradientOverlay(fx: LayerEffectGradientOverlay): GradientOverlayFx | undefined {
  const gradient = solidGradient(fx.gradient), mode = blend(fx.blendMode);
  if (!gradient || !mode) return undefined;
  const method = fx.interpolationMethod ? METHODS[fx.interpolationMethod] : undefined;
  if (fx.interpolationMethod && !method) return undefined;
  if (method === 'smooth') gradient.smoothness = 100;
  return {
    enabled: true,
    blendMode: mode,
    opacity: fraction(fx.opacity, 1),
    style: fx.type ?? 'linear',
    angle: finite(fx.angle) ? fx.angle : 90,
    scale: finite(fx.scale) && fx.scale > 0 ? clamp(fx.scale, 0.1, 1.5) : 1,
    reverse: !!fx.reverse,
    dither: !!fx.dither,
    alignWithLayer: fx.align !== false,
    ...(fx.offset && finite(fx.offset.x) && finite(fx.offset.y) && (fx.offset.x || fx.offset.y)
      ? { offset: { x: fx.offset.x, y: fx.offset.y } }
      : {}),
    ...(method ? { method: method === 'smooth' ? 'classic' : method } : {}),
    gradient,
  };
}

function stroke(fx: LayerEffectStroke): StrokeFx | undefined {
  const mode = blend(fx.blendMode), color = rgb(fx.color), size = pixels(fx.size, undefined);
  if (!mode || !color || size === undefined || (fx.fillType ?? 'color') !== 'color') return undefined;
  return {
    enabled: true,
    blendMode: mode,
    opacity: fraction(fx.opacity, 1),
    size: clamp(size, 0, 250),
    position: fx.position ?? 'outside',
    fill: { type: 'color', color },
  };
}

/**
 * `undefined`: the layer uses an effect the editor cannot reproduce.
 * `{}`: nothing is drawn (the style or every effect is switched off).
 * `{ style }`: the equivalent editable style.
 */
export function importPsdLayerStyle(
  effects: LayerEffectsInfo | undefined,
  globalAngle?: number,
): { style?: LayerStyle } | undefined {
  if (!effects || effects.disabled) return {};
  const lists = effects as unknown as Record<string, Toggle | Toggle[] | undefined>;
  const active = (key: string) => {
    const v = lists[key];
    return (Array.isArray(v) ? v : v ? [v] : []).filter(enabled);
  };
  for (const key of Object.keys(effects)) {
    if (key === 'disabled' || key === 'scale' || SUPPORTED.has(key)) continue;
    if (active(key).length) return undefined;
  }
  const shadows = active('dropShadow').map((fx) => dropShadow(fx as LayerEffectShadow));
  const fills = active('solidFill').map((fx) => colorOverlay(fx as LayerEffectSolidFill));
  const gradients = active('gradientOverlay').map((fx) => gradientOverlay(fx as LayerEffectGradientOverlay));
  const strokes = active('stroke').map((fx) => stroke(fx as LayerEffectStroke));
  const all = [...shadows, ...fills, ...gradients, ...strokes];
  if (all.some((fx) => !fx)) return undefined;
  if (!all.length) return {};
  const style: LayerStyle = { enabled: true };
  if (finite(effects.scale) && effects.scale > 0) style.scale = clamp(effects.scale, 0.01, 10);
  if (finite(globalAngle)) style.globalAngle = globalAngle;
  if (shadows.length) style.dropShadow = shadows as ShadowFx[];
  if (fills.length) style.colorOverlay = fills as ColorOverlayFx[];
  if (gradients.length) style.gradientOverlay = gradients as GradientOverlayFx[];
  if (strokes.length) style.stroke = strokes as StrokeFx[];
  return { style };
}
