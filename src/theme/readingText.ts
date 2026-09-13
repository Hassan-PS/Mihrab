/**
 * How big the reader's own text is — the translation, the tafsir and the
 * transliteration.
 *
 * ── WHY A SETTING AND NOT THE SYSTEM FONT SIZE ────────────────────────
 *
 * The OS already has a font scale, and the app already honours it. But it
 * is one number for everything: raising it to read a tafsir comfortably
 * also grows the tab bar, the prayer table and the countdown, which are
 * not what needed to be bigger. The ask was for the long-form text, and
 * only that.
 *
 * So this scale MULTIPLIES on top of the system's rather than replacing
 * it. Someone who has already set their phone larger keeps that and gets
 * this as well, which is the right answer for the person most likely to
 * want it.
 *
 * ── WHAT IT DOES NOT TOUCH ────────────────────────────────────────────
 *
 * The Arabic. An āyah is typeset, not styled: `arabicTextStyle` hand-pairs
 * every size with a line height that keeps a fatḥa or a kasra cluster
 * unclipped, and the muṣḥaf page is a drawing with its own zoom. Neither
 * follows from a multiplier, so neither is offered one.
 *
 * Nor the compact surfaces — the verse of the day, a search result — which
 * are glanced at inside fixed boxes with line clamps, nor the shared ayah
 * image, which is deliberately identical on every phone it is made on.
 *
 * ── THE LADDER ────────────────────────────────────────────────────────
 *
 * Seven rungs, one below the default and five above, so a tap always
 * changes something visible and the whole range is five taps wide. The
 * stored value is the MULTIPLIER, not an index into this array: a number
 * in a settings blob should still mean what it said if the ladder is ever
 * re-spaced, and 1.3 is legible in a backup file where `3` is not.
 */

import { TYPE } from './typography';

/** The rungs, ascending. `1` is the size the app has always drawn. */
export const READING_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

export const DEFAULT_READING_SCALE = 1;
export const MIN_READING_SCALE = READING_SCALES[0];
export const MAX_READING_SCALE = READING_SCALES[READING_SCALES.length - 1];

/**
 * The nearest rung to whatever was stored.
 *
 * Snapping rather than clamping, because a value between rungs — an older
 * ladder, a hand-edited blob, a restored backup — would otherwise leave
 * the stepper unable to say which rung it is on, and `+` would jump to
 * somewhere unrelated. Anything unreadable is the default.
 */
export function clampReadingScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_READING_SCALE;
  }
  let nearest: number = READING_SCALES[0];
  for (const rung of READING_SCALES) {
    if (Math.abs(rung - value) < Math.abs(nearest - value)) nearest = rung;
  }
  return nearest;
}

/** The rung one step up (`+1`) or down (`-1`), or the same one at an end. */
export function stepReadingScale(current: number, by: 1 | -1): number {
  const at = READING_SCALES.indexOf(
    clampReadingScale(current) as (typeof READING_SCALES)[number],
  );
  const next = at + by;
  if (next < 0 || next >= READING_SCALES.length) {
    return READING_SCALES[at];
  }
  return READING_SCALES[next];
}

export function canGrowReading(scale: number): boolean {
  return clampReadingScale(scale) < MAX_READING_SCALE;
}

export function canShrinkReading(scale: number): boolean {
  return clampReadingScale(scale) > MIN_READING_SCALE;
}

export type ReadingTextStyle = { fontSize: number; lineHeight?: number };

/**
 * What the long-form text is set at before the reader touches anything:
 * the app's callout size with the leading the redesign chose for it.
 *
 * One constant for the four surfaces that share it — the sūrah reader's
 * translation and tafsir, the āyah sheet's, and a dua's meaning — so they
 * cannot drift apart at one rung and agree at another.
 */
export const READING_BASE: ReadingTextStyle = {
  fontSize: TYPE.callout.fontSize,
  lineHeight: 22,
};

/**
 * A dua's transliteration, which is set WITHOUT a line height.
 *
 * Deliberately not given one here. It is tighter than the meaning under
 * it today, and a control whose job is size should not quietly re-space a
 * paragraph at the size the reader already had.
 */
export const READING_BASE_UNLEADED: ReadingTextStyle = {
  fontSize: TYPE.callout.fontSize,
};

/**
 * A base text style at the reader's chosen size.
 *
 * Whole points on both, because a fractional font size renders soft on
 * Android — and the line height is derived from the ROUNDED font size so
 * the ratio the designer chose (22 over 15, say) survives every rung
 * instead of drifting as the two round apart.
 *
 * A base with no line height keeps none: the dua's transliteration is set
 * without one, and inventing one here would change how it sits today at
 * the default scale, which is not what a size control is for.
 */
export function readingTextStyle(
  base: ReadingTextStyle,
  scale: number,
): ReadingTextStyle {
  const snapped = clampReadingScale(scale);
  const fontSize = Math.round(base.fontSize * snapped);
  if (base.lineHeight === undefined) return { fontSize };
  return {
    fontSize,
    lineHeight: Math.round(fontSize * (base.lineHeight / base.fontSize)),
  };
}
