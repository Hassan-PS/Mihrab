/**
 * The tone of the page — what the paper is, before anything is drawn on it.
 *
 * Three tones. Paper is the print: white, black ink, the dark-gold
 * ornament. Night is a repaint, not an inversion — near-black ground, a
 * warm off-white ink, a lighter gold — and has been here since 2.7. Sepia
 * sits between them: a warm paper with a dark brown ink, for reading in a
 * lit room where white glares and night is too little.
 *
 * ── WHY THE STORED SHAPE IS TWO FIELDS ───────────────────────────────
 *
 * `mushafNightMode` has been a boolean in every stored blob since the
 * night page shipped, and every surface that reacts to it — the header
 * tint, the content colour, the chevrons, the sidebar — reads that
 * boolean. Sepia is a second, additive field that says which of the two
 * LIGHT tones the page takes when night is off; night keeps its boolean
 * and its meaning. Nothing already stored changes shape, and a downgrade
 * reads the old field exactly as before.
 */
import type { QuranPrefs } from './quranState';

export type MushafTone = 'paper' | 'sepia' | 'night';

/** The tone the preferences resolve to. */
export function mushafTone(
  prefs: Pick<QuranPrefs, 'mushafNightMode' | 'mushafPaperTone'>,
): MushafTone {
  if (prefs.mushafNightMode) return 'night';
  return prefs.mushafPaperTone === 'sepia' ? 'sepia' : 'paper';
}

/** What the page-header pill cycles to on a tap: paper → sepia → night → paper. */
export function nextMushafTone(tone: MushafTone): MushafTone {
  return tone === 'paper' ? 'sepia' : tone === 'sepia' ? 'night' : 'paper';
}

/** The preference writes that put the reader on `tone`. */
export function prefsForTone(
  tone: MushafTone,
): Pick<QuranPrefs, 'mushafNightMode' | 'mushafPaperTone'> {
  return tone === 'night'
    ? { mushafNightMode: true, mushafPaperTone: 'paper' }
    : { mushafNightMode: false, mushafPaperTone: tone };
}

/** The page's ground. */
export const TONE_PAGE_BG: Record<MushafTone, string> = {
  paper: '#ffffff',
  sepia: '#F3EBDB',
  night: '#101010',
};

/** The ornament ink — medallions, the page number, the header labels. */
export const TONE_ORNAMENT: Record<MushafTone, string> = {
  paper: '#7a5e1f',
  sepia: '#7a5e1f',
  night: '#c9b47a',
};

/** True for the tone whose ink is light on a dark ground. */
export function toneIsDark(tone: MushafTone): boolean {
  return tone === 'night';
}
