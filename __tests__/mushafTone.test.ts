/**
 * Three tones for the page — paper, sepia, night — stored as two fields.
 *
 * `mushafNightMode` has been a boolean in every stored blob since the night
 * page shipped; sepia is an additive second field naming which LIGHT tone
 * the page takes when night is off. Nothing already stored changes shape.
 */
import {
  mushafTone,
  nextMushafTone,
  prefsForTone,
  TONE_PAGE_BG,
  toneIsDark,
} from '../src/quran/mushafTone';
import { coerceQuranState, DEFAULT_QURAN_STATE } from '../src/quran/quranState';

describe('resolving the tone', () => {
  it('night wins whatever the paper tone says', () => {
    expect(mushafTone({ mushafNightMode: true, mushafPaperTone: 'sepia' })).toBe('night');
    expect(mushafTone({ mushafNightMode: true, mushafPaperTone: 'paper' })).toBe('night');
  });

  it('otherwise the paper tone is the tone', () => {
    expect(mushafTone({ mushafNightMode: false, mushafPaperTone: 'sepia' })).toBe('sepia');
    expect(mushafTone({ mushafNightMode: false, mushafPaperTone: 'paper' })).toBe('paper');
  });

  it('only night is dark — sepia keeps the light chrome', () => {
    expect(toneIsDark('night')).toBe(true);
    expect(toneIsDark('sepia')).toBe(false);
    expect(toneIsDark('paper')).toBe(false);
  });
});

describe('the pill cycles paper → sepia → night → paper', () => {
  it('in that order', () => {
    expect(nextMushafTone('paper')).toBe('sepia');
    expect(nextMushafTone('sepia')).toBe('night');
    expect(nextMushafTone('night')).toBe('paper');
  });

  it('and the writes for each tone resolve back to it', () => {
    for (const tone of ['paper', 'sepia', 'night'] as const) {
      expect(mushafTone(prefsForTone(tone))).toBe(tone);
    }
  });

  it('leaving night lands on paper, not on whatever sepia was before', () => {
    // Night stores paper as its light tone so the cycle is the same from
    // any starting point: three taps, three tones, back where you began.
    expect(prefsForTone('night')).toEqual({ mushafNightMode: true, mushafPaperTone: 'paper' });
  });
});

describe('the stored blob', () => {
  it('reads a pre-sepia blob as paper', () => {
    const s = coerceQuranState({
      ...DEFAULT_QURAN_STATE,
      prefs: { ...DEFAULT_QURAN_STATE.prefs, mushafPaperTone: undefined },
    });
    expect(s.prefs.mushafPaperTone).toBe('paper');
  });

  it('keeps sepia and drops anything else', () => {
    const sepia = coerceQuranState({
      ...DEFAULT_QURAN_STATE,
      prefs: { ...DEFAULT_QURAN_STATE.prefs, mushafPaperTone: 'sepia' },
    });
    expect(sepia.prefs.mushafPaperTone).toBe('sepia');
    const junk = coerceQuranState({
      ...DEFAULT_QURAN_STATE,
      prefs: { ...DEFAULT_QURAN_STATE.prefs, mushafPaperTone: 'mauve' },
    });
    expect(junk.prefs.mushafPaperTone).toBe('paper');
  });
});

describe('the grounds', () => {
  it('are three distinct colours, and sepia is a light one', () => {
    expect(new Set(Object.values(TONE_PAGE_BG)).size).toBe(3);
    // A warm paper: more red than blue, and bright.
    const hex = TONE_PAGE_BG.sepia.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect((r + g + b) / 3).toBeGreaterThan(200);
  });
});
