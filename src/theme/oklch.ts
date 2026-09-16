/**
 * OKLCH — a perceptual colour space, dependency-free.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * Mixing colours in RGB does not do what a designer means. Pulling a
 * neutral 55% toward a saturated swatch shifts lightness unpredictably
 * and lands on muddy midtones, which is why the first Verdant needed a
 * hand-tuned table of hexes per accent and still read as a loud slab.
 *
 * OKLCH separates what the eye actually perceives: **L** lightness,
 * **C** chroma (how coloured), **h** hue. "Same lightness as paper, a
 * whisper of the accent's hue" is a single statement in this space —
 * `{ L: 0.975, C: 0.012, h }` — and it means the same thing for every
 * hue, so one formula serves every preset with no table.
 *
 * Björn Ottosson's OKLab (2020), matrices reproduced exactly. Chroma is
 * clamped back into the sRGB gamut by bisection, holding L and h, so a
 * bright tint of a hue that cannot reach that chroma degrades to the
 * nearest displayable colour rather than clipping to something wrong.
 */

export type Oklch = { L: number; C: number; h: number };

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** `#RRGGBB` → OKLCH. Non-hex input yields black. */
export function hexToOklch(hex: string): Oklch {
  const rgb = parseHex(hex);
  if (!rgb) return { L: 0, C: 0, h: 0 };
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.sqrt(a * a + bb * bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/** OKLab (L, a, b) → linear sRGB triple, unclamped. */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(rgb: [number, number, number]): boolean {
  const eps = 1e-4;
  return rgb.every(c => c >= -eps && c <= 1 + eps);
}

/**
 * OKLCH → `#RRGGBB`.
 *
 * If the requested chroma is outside sRGB for this L/h, chroma is reduced
 * by bisection until it fits — the hue and lightness the caller asked for
 * are kept, only the colourfulness gives way. That is the right failure
 * for a surface tint: a paler version of the same colour, never a shifted
 * one.
 */
export function oklchToHex({ L, C, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  const toRgb = (c: number) =>
    oklabToLinear(L, c * Math.cos(rad), c * Math.sin(rad));

  let rgb = toRgb(C);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(toRgb(mid))) lo = mid;
      else hi = mid;
    }
    rgb = toRgb(lo);
  }
  const to255 = (c: number) => Math.round(linearToSrgb(c) * 255);
  const [r, g, b] = rgb.map(to255);
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  );
}

/** The OKLab chroma pair (a, b) for an OKLCH chroma and hue. */
export function lchToAb({ C, h }: { C: number; h: number }): { a: number; b: number } {
  const rad = (h * Math.PI) / 180;
  return { a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

/**
 * `#RRGGBB` from OKLab lightness plus an (a, b) pair — the form to use when
 * a colour is composed from parts (an accent tone plus a paper's warmth),
 * which is a sum in a/b and not expressible as one LCH triple. Goes
 * through `oklchToHex` so the same gamut clamp applies.
 */
export function oklabToHex(L: number, a: number, b: number): string {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return oklchToHex({ L, C, h });
}
