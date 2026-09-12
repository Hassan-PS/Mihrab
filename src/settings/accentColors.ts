/**
 * Custom accent colours — the list, and the maths the picker is built on.
 *
 * ── WHY A LIST AND NOT JUST THE ONE HEX ───────────────────────────────
 *
 * `appAccentCustomHex` holds the ACTIVE custom colour and always has.
 * That is enough to use one custom colour and not enough to keep several:
 * choosing a preset and coming back lost whatever was typed, so every
 * return trip meant retyping six hex digits from memory. `savedAccentColors`
 * is the shelf those colours live on — the same shape as `locationPresets`
 * and `dhikrReminders`, for the same reason: a short list of things the
 * user made, travelling in the settings blob, re-validated on load.
 *
 * The active colour is still `appAccentCustomHex`. A saved colour is not
 * a separate kind of accent; it is a colour you can get back to.
 *
 * ── EVERYTHING HERE IS PURE ───────────────────────────────────────────
 *
 * No React, no storage, no palette. The picker draws what these functions
 * return, and the tests hold them still without rendering anything.
 */

/**
 * How many colours one person may keep.
 *
 * Same reasoning as `MAX_LOCATION_PRESETS`: the row wraps, and past a
 * dozen a swatch grid stops being something you scan and becomes
 * something you search. Twelve is three rows beside the six presets and
 * the add button, which is as much as fits before the card needs its own
 * screen.
 */
export const MAX_SAVED_ACCENTS = 12;

/** The fallback the palette itself falls back to (`brandAccents`). */
export const DEFAULT_CUSTOM_HEX = '#22c55e'; // tokens-ok-line: mirrors the palette's own custom fallback

/**
 * `#abc`, `aabbcc`, `#AABBCC ` → `#AABBCC`. Anything else → null.
 *
 * Upper-cased on the way out so the list can be compared and de-duped by
 * string equality; three-digit shorthand is expanded because people type
 * it and a picker that rejects `#f0a` is a picker that looks broken.
 */
export function normaliseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return null;
}

export type Hsv = {
  /** 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  v: number;
};

/** RGB channels 0–255 from a normalised `#RRGGBB`. */
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Hex → hue/saturation/value.
 *
 * HSV rather than HSL because the picker's shape is the standard one: a
 * square where x is saturation and y is value, under a hue strip. In HSL
 * that square is a diamond with unreachable corners, which is why nobody
 * builds it that way.
 *
 * A grey has no hue — the maths gives 0 and the caller must not read that
 * as "red". The picker keeps the last hue the user touched for exactly
 * this reason, so dragging value to zero and back does not silently
 * reset them to red.
 */
export function hexToHsv(hex: string): Hsv {
  const [r255, g255, b255] = channels(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Hue/saturation/value → `#RRGGBB`. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const seg = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[seg];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** The six stops a hue strip is drawn from, at 0°, 60°, … 300°, plus the wrap. */
export const HUE_STOPS: string[] = [0, 60, 120, 180, 240, 300, 360].map(h =>
  hsvToHex({ h, s: 1, v: 1 }),
);

/**
 * WCAG relative luminance, and the contrast between two colours.
 *
 * Duplicated from neither `themeMap.ts` nor `skyModel.ts` — it is
 * re-exported from here so the picker has one import rather than three,
 * and so this module stays pure of the theme. If a fourth copy ever
 * appears, these are the two to collapse into.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whether a colour will read as an accent on the ground it is used on.
 *
 * ── WHY THIS ASKS ABOUT ONE GROUND AND NOT BOTH ───────────────────────
 *
 * The first version of this checked the colour against the light ground
 * AND the dark one and warned unless it cleared 3:1 on both. It was
 * wrong, and the app's own default proves it: the deep emerald #1F5F4A
 * reads 7.03:1 on warm paper and 2.49:1 on the night ground. So the
 * shipped, hand-tuned, default accent would have been flagged — and so
 * would nearly every other sensible colour, because no single hex is a
 * good accent on both a near-white and a near-black.
 *
 * That is exactly why every preset carries TWO values: `ACCENT_SWATCHES`
 * gives green as #1F5F4A light and #46A081 dark. A custom accent is used
 * verbatim in both, which is its real weakness — and the honest thing to
 * tell somebody is whether the colour works in the theme they are
 * looking at, which they can see and act on, rather than a verdict about
 * a theme they may never use.
 *
 * A warning that fires for almost everything teaches people to ignore
 * warnings.
 *
 * 3:1 is the WCAG floor for a UI element, which is what an accent is.
 * This warns; it never blocks. It is the user's app, and somebody who
 * only ever uses one theme is entitled to a colour that only works there.
 */
export const ACCENT_MIN_CONTRAST = 3;

export function accentLegibility(
  hex: string,
  ground: string,
): { ratio: number; ok: boolean } {
  const ratio = contrast(hex, ground);
  return { ratio, ok: ratio >= ACCENT_MIN_CONTRAST };
}

/**
 * Add a colour to the shelf, newest first.
 *
 * Re-saving a colour already on the shelf moves it to the front rather
 * than adding a second copy — the list is a history of choices, and a
 * colour chosen twice is one colour chosen recently. Past the cap the
 * oldest falls off the end, which is the behaviour that needs no UI:
 * nobody is asked to delete something before they can save something.
 */
export function addSavedAccent(list: string[], hex: string): string[] {
  const norm = normaliseHex(hex);
  if (!norm) return list;
  return [norm, ...list.filter(c => c !== norm)].slice(0, MAX_SAVED_ACCENTS);
}

export function removeSavedAccent(list: string[], hex: string): string[] {
  const norm = normaliseHex(hex);
  if (!norm) return list;
  return list.filter(c => c !== norm);
}

/**
 * What survives a load from disk.
 *
 * Anything that is not a valid hex is dropped rather than corrected —
 * there is no honest correction for `"blue"` — duplicates collapse, and
 * the cap is applied last so an oversized blob from a future build
 * loading in an older one does not grow the row past what it can draw.
 */
export function coerceSavedAccents(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const norm = normaliseHex(entry);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out.slice(0, MAX_SAVED_ACCENTS);
}
