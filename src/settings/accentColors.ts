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
 * ── FROM A WARNING TO A RANGE ─────────────────────────────────────────
 *
 * This started life as `accentLegibility`: the picker called it, and
 * under a colour it let you save anyway it printed "Hard to read on this
 * background (2.1:1, needs 3:1)". The warning was the wrong shape. It
 * arrives after the choice rather than during it; it quotes a ratio
 * nobody has an intuition for; it turns finding a workable colour into
 * trial and error; and in red it reads as a mistake the person made
 * rather than a limit of the background they chose.
 *
 * A picker that cannot hand back an unusable colour needs no warning at
 * all. What follows is the same contrast maths turned inside out — not
 * "is this colour legible" but "which colours are" — so the answer can
 * be drawn on the square instead of printed under it.
 *
 * ── WHY IT IS A BAND OF `v` AND NOT A SET OF COLOURS ──────────────────
 *
 * Relative luminance rises monotonically with HSV's `v` at a fixed hue
 * and saturation. So at any point across the square there is exactly one
 * crossing: on a light ground every value below it clears the floor and
 * every value above it fails, and on a dark ground the other way round.
 * One crossing per saturation is a curve across the square, which is
 * both the thing to draw and the thing to clamp a drag against.
 *
 * Hue is never touched by any of this. Moving somebody's hue to make
 * their colour legible would be answering a question they did not ask.
 *
 * ── WHY IT ASKS ABOUT ONE GROUND AND NOT BOTH ─────────────────────────
 *
 * An earlier version checked the light ground AND the dark one. It was
 * wrong, and the app's own default proves it: the deep emerald #1F5F4A
 * reads 7.03:1 on warm paper and 2.49:1 on the night ground. The
 * shipped, hand-tuned default accent would have been rejected, and so
 * would nearly every other sensible colour, because no single hex is a
 * good accent on both a near-white and a near-black.
 *
 * That is exactly why every preset carries TWO values — `ACCENT_SWATCHES`
 * gives green as #1F5F4A light and #46A081 dark — and it is the real
 * weakness of a custom accent, which is used verbatim in both. Given
 * that, the honest range to offer is the one that works in the theme the
 * person is looking at, which they can see. Constraining to both would
 * leave a sliver of muddy mid-tones and call it a choice.
 *
 * 3:1 is the WCAG floor for a UI element, which is what an accent is.
 */
export const ACCENT_MIN_CONTRAST = 3;

/** Anything the picker can return clears the floor. Mostly for tests. */
export function isLegibleAccent(hex: string, ground: string): boolean {
  return contrast(hex, ground) >= ACCENT_MIN_CONTRAST;
}

/**
 * Which way the constraint runs: does the accent have to go darker than
 * the ground, or lighter?
 *
 * By where the room actually is, not by a luminance threshold. If black
 * contrasts better against this ground than white does, the usable
 * colours are the dark ones. That answers correctly for a mid-grey
 * ground too, where a threshold would have to pick a side arbitrarily.
 */
export function accentMustBeDarker(ground: string): boolean {
  return contrast('#000000', ground) >= contrast('#FFFFFF', ground);
}

/**
 * Bisection steps for the crossing. Twenty takes the interval below one
 * part in a million, which is far finer than the 1/255 the result is
 * quantised to on the way back out to a hex.
 */
const EDGE_STEPS = 20;

/**
 * The `v` at which this hue and saturation meets the contrast floor, or
 * null when no value of `v` does.
 *
 * Null is not an edge case to tidy away: on a dark ground a fully
 * saturated blue has no legible value at all. #0000FF is the brightest
 * blue there is and it still reads 2.15:1 on the night ground, so that
 * whole column of the square is unavailable and the picker has to say
 * so.
 *
 * The returned value is always on the legible side of the crossing,
 * never the failing side — bisection keeps the endpoint it has proved,
 * so a colour clamped to this edge clears the floor rather than landing
 * a rounding error under it.
 */
export function legibleValueEdge(
  h: number,
  s: number,
  ground: string,
): number | null {
  const at = (v: number) => contrast(hsvToHex({ h, s, v }), ground);
  const darker = accentMustBeDarker(ground);
  // The far end of the legible direction: black if the accent must be
  // darker than its ground, white if it must be lighter. If even that
  // fails, nothing at this saturation can work.
  if (at(darker ? 0 : 1) < ACCENT_MIN_CONTRAST) return null;

  let pass = darker ? 0 : 1;
  let fail = darker ? 1 : 0;
  for (let i = 0; i < EDGE_STEPS; i += 1) {
    const mid = (pass + fail) / 2;
    if (at(mid) >= ACCENT_MIN_CONTRAST) pass = mid;
    else fail = mid;
  }
  return pass;
}

/**
 * The crossing sampled across saturation, left edge to right, for
 * drawing it. `null` marks a saturation with nothing legible in it.
 */
export function legibleBoundary(
  h: number,
  ground: string,
  samples: number,
): Array<number | null> {
  const n = Math.max(2, Math.floor(samples));
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    out.push(legibleValueEdge(h, i / (n - 1), ground));
  }
  return out;
}

/**
 * The nearest legible colour to this one, at the same hue.
 *
 * Value is clamped to the legible side of the crossing. Saturation is
 * only touched when it has to be — when the column the finger is in has
 * no legible value at all — and then it comes down to the most saturated
 * column that does, which is the closest thing to what was asked for.
 * Saturation zero is always legible on either ground (it is white at one
 * end and black at the other), so the search always terminates somewhere.
 */
export function constrainToLegible(hsv: Hsv, ground: string): Hsv {
  const darker = accentMustBeDarker(ground);
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const h = hsv.h;
  let s = clamp01(hsv.s);
  let edge = legibleValueEdge(h, s, ground);

  if (edge === null) {
    // Desaturating moves towards white or black, and one of those is the
    // legible end, so the crossing exists again somewhere below here.
    let ok = 0;
    let none = s;
    for (let i = 0; i < EDGE_STEPS; i += 1) {
      const mid = (ok + none) / 2;
      if (legibleValueEdge(h, mid, ground) === null) none = mid;
      else ok = mid;
    }
    s = ok;
    edge = legibleValueEdge(h, s, ground);
  }
  // Only reachable if the floor were set above what white or black can
  // do against this ground, which 3:1 is not.
  if (edge === null) return { h, s: 0, v: darker ? 0 : 1 };

  return {
    h,
    s,
    v: darker ? Math.min(hsv.v, edge) : Math.max(hsv.v, edge),
  };
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
