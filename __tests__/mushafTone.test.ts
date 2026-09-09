/**
 * Three tones for the page — paper, sepia, night — stored as two fields.
 *
 * `mushafNightMode` has been a boolean in every stored blob since the night
 * page shipped; sepia is an additive second field naming which LIGHT tone
 * the page takes when night is off. Nothing already stored changes shape.
 */
import {
  mushafTone,
  mushafToneChoice,
  nextMushafTone,
  prefsForTone,
  TONE_PAGE_BG,
  toneIsDark,
} from '../src/quran/mushafTone';
import { coerceQuranState, DEFAULT_QURAN_STATE } from '../src/quran/quranState';
import { toneGlyph } from '../src/quran/mushafReaderCore';

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

describe('the pill cycles paper → sepia → night → auto → paper', () => {
  it('in that order', () => {
    expect(nextMushafTone('paper')).toBe('sepia');
    expect(nextMushafTone('sepia')).toBe('night');
    expect(nextMushafTone('night')).toBe('auto');
    expect(nextMushafTone('auto')).toBe('paper');
  });

  it('auto follows the app theme: paper in a light app, night in a dark one', () => {
    const prefs = prefsForTone('auto');
    expect(mushafToneChoice(prefs)).toBe('auto');
    expect(mushafTone(prefs, false)).toBe('paper');
    expect(mushafTone(prefs, true)).toBe('night');
    // A fixed tone ignores the theme.
    expect(mushafTone(prefsForTone('sepia'), true)).toBe('sepia');
    expect(mushafTone(prefsForTone('paper'), true)).toBe('paper');
  });

  it('a fresh install starts on auto; a blob from before the field keeps its tone', () => {
    expect(DEFAULT_QURAN_STATE.prefs.mushafToneAuto).toBe(true);
    const old = coerceQuranState({
      ...DEFAULT_QURAN_STATE,
      prefs: { ...DEFAULT_QURAN_STATE.prefs, mushafNightMode: true, mushafToneAuto: undefined },
    });
    expect(old.prefs.mushafToneAuto).toBe(false);
    expect(mushafToneChoice(old.prefs)).toBe('night');
  });

  it('and the writes for each tone resolve back to it', () => {
    for (const tone of ['paper', 'sepia', 'night'] as const) {
      expect(mushafTone(prefsForTone(tone))).toBe(tone);
    }
  });

  it('leaving night lands on paper, not on whatever sepia was before', () => {
    // Night stores paper as its light tone so the cycle is the same from
    // any starting point: three taps, three tones, back where you began.
    expect(prefsForTone('night')).toEqual({
      mushafNightMode: true,
      mushafPaperTone: 'paper',
      mushafToneAuto: false,
    });
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

/**
 * The tone control's glyph.
 *
 * In the page bar the button carries the glyph ALONE — no word beside it —
 * so every step of the cycle has to be told apart by its drawing. Auto was
 * `◑︎` against sepia's `◐︎`: the same disc, filled on the other side, a few
 * pixels apart at 17pt. It is a letter now, which is also the honest
 * distinction — the other three are tones, and auto is a rule.
 */
describe('the glyph the tone control shows', () => {
  it('gives auto a letter, and keeps a tone for each tone', () => {
    expect(toneGlyph('auto')).toBe('A');
    expect(toneGlyph('paper')).toBe('☀︎');
    expect(toneGlyph('sepia')).toBe('◐︎');
    expect(toneGlyph('night')).toBe('☾︎');
  });

  it('never repeats a glyph across the cycle', () => {
    const glyphs = ['paper', 'sepia', 'night', 'auto'].map(c =>
      toneGlyph(c as Parameters<typeof toneGlyph>[0]),
    );
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('walks paper → sepia → night → auto → paper, and the glyph follows', () => {
    let choice: Parameters<typeof toneGlyph>[0] = 'paper';
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(toneGlyph(choice));
      choice = nextMushafTone(choice);
    }
    expect(seen).toEqual(['☀︎', '◐︎', '☾︎', 'A']);
    // Back where it started, so the letter is one stop of a ring and not
    // a dead end.
    expect(choice).toBe('paper');
  });
});
