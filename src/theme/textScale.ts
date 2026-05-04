/**
 * Font-scale policy helpers — task #15.
 *
 * iOS "Larger Accessibility Sizes" and Android system font scaling can push
 * text up to 3× baseline. For free-flowing prose this is exactly what users
 * want. For tabular layouts (prayer-time grid, signal-strength readout) and
 * fixed-position labels (compass cardinals, carousel chevrons), unbounded
 * scaling overflows containers and breaks alignment.
 *
 * This module is the single source of truth for those clamps, so every
 * "no, this Text really shouldn't grow past 1.3×" decision has a recorded
 * justification.
 *
 * CLAUDE.md principle: "Tabular precision for sacred data — prayer times
 * are unambiguous; tabular numerals, no font shifts on tick."
 */

/**
 * Style fragment that renders monospaced figures so a "1" and a "4" occupy
 * the same width. Apply to every clock numeral so prayer-time columns don't
 * reflow as time ticks past digit boundaries (e.g., 14:59 → 15:00).
 *
 * Typed loose (not `as const`) because React Native's `TextStyle.fontVariant`
 * is a mutable array; a `readonly` literal can't be spread into it.
 */
export const tabularNumeralStyle: { fontVariant: ['tabular-nums'] } = {
  fontVariant: ['tabular-nums'],
};

/**
 * Maximum font scale for tabular layouts (prayer rows, countdown card,
 * signal-strength readout). Beyond ~1.3× the prayer-time column starts to
 * push the prayer name off small screens. Text is still ~30 % larger than
 * baseline at this clamp — the increased size IS visible, just bounded.
 */
export const TABULAR_MAX_FONT_SCALE = 1.3;

/**
 * Maximum font scale for fixed-position labels: compass cardinals (N/S/E/W),
 * carousel chevrons, widget-color swatch abbreviations. These overlap their
 * containers above ~1.4× — they're positioned at a known offset, not laid
 * out by flexbox.
 */
export const FIXED_LABEL_MAX_FONT_SCALE = 1.4;

/**
 * Maximum font scale for "title-band" text inside fixed-height cards
 * (day-card date sub-header, signal-strength % readout). 1.5× lets these
 * grow but stops them from forcing card-height changes that would break
 * carousel paging.
 */
export const TITLE_BAND_MAX_FONT_SCALE = 1.5;
