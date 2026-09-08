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
// tokens-ok: the mushaf is a print with its own three tones — paper, sepia, night — independent of the app palette
import type { QuranPrefs } from './quranState';

export type MushafTone = 'paper' | 'sepia' | 'night';

/**
 * What the reader CHOSE — one of the three tones, or "auto": paper when
 * the app is light and night when it is dark, following the theme the
 * way the rest of the app does. Auto is a third additive field
 * (`mushafToneAuto`), so a blob from before it reads as the choice it
 * held; a fresh install starts on auto.
 */
export type MushafToneChoice = MushafTone | 'auto';

type TonePrefs = Pick<QuranPrefs, 'mushafNightMode' | 'mushafPaperTone'> & {
  mushafToneAuto?: boolean;
};

/** The stored choice, auto included. */
export function mushafToneChoice(prefs: TonePrefs): MushafToneChoice {
  if (prefs.mushafToneAuto) return 'auto';
  if (prefs.mushafNightMode) return 'night';
  return prefs.mushafPaperTone === 'sepia' ? 'sepia' : 'paper';
}

/**
 * The tone the page is actually drawn in. `appDark` is the app theme as
 * resolved on the device (light/dark/system, Material You included), and
 * matters only on auto.
 */
export function mushafTone(prefs: TonePrefs, appDark = false): MushafTone {
  const choice = mushafToneChoice(prefs);
  if (choice === 'auto') return appDark ? 'night' : 'paper';
  return choice;
}

/** What the tone control cycles to on a tap: paper → sepia → night → auto → paper. */
export function nextMushafTone(choice: MushafToneChoice): MushafToneChoice {
  return choice === 'paper'
    ? 'sepia'
    : choice === 'sepia'
      ? 'night'
      : choice === 'night'
        ? 'auto'
        : 'paper';
}

/** The preference writes that put the reader on `choice`. */
export function prefsForTone(
  choice: MushafToneChoice,
): Pick<QuranPrefs, 'mushafNightMode' | 'mushafPaperTone' | 'mushafToneAuto'> {
  if (choice === 'auto') {
    return { mushafNightMode: false, mushafPaperTone: 'paper', mushafToneAuto: true };
  }
  return choice === 'night'
    ? { mushafNightMode: true, mushafPaperTone: 'paper', mushafToneAuto: false }
    : { mushafNightMode: false, mushafPaperTone: choice, mushafToneAuto: false };
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

/**
 * The colours of the chrome that sits ON the page — the page bar with its
 * rail, readout, jump and tone buttons (redesign plan §4, "the immersive
 * reader").
 *
 * The bar used to take the APP palette, and the app palette does not know
 * what page it is standing on: a dark app theme reading a paper page put
 * near-black control boxes on white, and a light theme reading a night
 * page put the app's dark green on near-black. The bar is part of the
 * print, so it takes the print's colours — the page ground behind it, the
 * page's ink and a quiet grey for text, a faint tint for the control
 * boxes, and the ornament gold where the app would use its accent. The
 * gold is the page's own (see B.4.4), not a second accent.
 */
export type ToneChrome = {
  ink: string;
  muted: string;
  control: string;
  accent: string;
  card: string;
};

export const TONE_CHROME: Record<MushafTone, ToneChrome> = {
  paper: {
    ink: '#1a1a1a',
    muted: '#6b6b6b',
    control: '#efefef',
    accent: TONE_ORNAMENT.paper,
    card: TONE_PAGE_BG.paper,
  },
  sepia: {
    ink: '#2b2418',
    muted: '#6f6146',
    control: '#e7dcc5',
    accent: TONE_ORNAMENT.sepia,
    card: TONE_PAGE_BG.sepia,
  },
  night: {
    ink: '#f2f2f2',
    muted: '#9a9a9a',
    control: '#1e1e1e',
    accent: TONE_ORNAMENT.night,
    card: '#181818',
  },
};

/** True for the tone whose ink is light on a dark ground. */
export function toneIsDark(tone: MushafTone): boolean {
  return tone === 'night';
}
