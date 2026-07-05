/**
 * Quran Reader v2 logic tests — docs/quran-reader-plan.md §6.
 *
 * Covers the pure logic layers added by the reader rebuild:
 *   geometry hit-testing, repeat/queue expansion, khatmah portion math,
 *   Arabic search normalization, and the verse-of-the-day pick.
 */
import {
  GEOMETRY_REF_WIDTH,
  hitTestAyah,
  loadGeometry,
  pageAyahLineRects,
  pageWordGlyphs,
  firstAyahOnPage,
} from '../src/quran/geometry';
import {
  applyRepeats,
  expandRange,
  parseTrackId,
  trackId,
} from '../src/quran/audio/playback';
import {
  DEFAULT_QURAN_STATE,
  khatmahToday,
  KHATMAH_TOTAL_PAGES,
  type KhatmahPlan,
} from '../src/quran/quranState';
import { normalizeArabic, verseOfTheDayRef } from '../src/quran/search';
import { findPageForAyah } from '../src/quran/pages';
import { SURAHS } from '../src/quran/quran';

beforeAll(async () => {
  await loadGeometry();
});

describe('geometry (QR-7)', () => {
  it('loads all 604 pages with word glyphs', () => {
    for (const page of [1, 2, 50, 302, 604]) {
      expect(pageWordGlyphs(page).length).toBeGreaterThan(0);
    }
  });

  it('page 1 contains only al-Fatihah', () => {
    const glyphs = pageWordGlyphs(1);
    expect(glyphs.every(g => g.surah === 1)).toBe(true);
  });

  it('agrees with the pages.json page index for every surah start', () => {
    for (const s of SURAHS) {
      const page = findPageForAyah(s.number, 1);
      const glyphs = pageWordGlyphs(page);
      expect(
        glyphs.some(g => g.surah === s.number && g.ayah === 1),
      ).toBe(true);
    }
  });

  it('hit-tests the center of a known glyph to its ayah', () => {
    const glyphs = pageWordGlyphs(50);
    const g = glyphs[Math.floor(glyphs.length / 2)];
    const cx = (g.x0 + g.x1) / 2;
    const cy = (g.y0 + g.y1) / 2;
    // Rendered at reference scale.
    const hit = hitTestAyah(50, cx, cy, GEOMETRY_REF_WIDTH);
    expect(hit).toEqual({ surah: g.surah, ayah: g.ayah });
  });

  it('hit-testing scales with rendered width', () => {
    const glyphs = pageWordGlyphs(50);
    const g = glyphs[0];
    const scale = 390 / GEOMETRY_REF_WIDTH; // phone-sized render
    const hit = hitTestAyah(
      50,
      ((g.x0 + g.x1) / 2) * scale,
      ((g.y0 + g.y1) / 2) * scale,
      390,
    );
    expect(hit).toEqual({ surah: g.surah, ayah: g.ayah });
  });

  it('returns null for taps in the page margin', () => {
    // Far top-left corner (outside any text line band).
    expect(hitTestAyah(50, 1, 1, GEOMETRY_REF_WIDTH)).toBeNull();
  });

  it('merges word glyphs into per-line ayah rects', () => {
    const rects = pageAyahLineRects(50);
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.x1).toBeGreaterThan(r.x0);
      expect(r.y1).toBeGreaterThan(r.y0);
    }
  });

  it('firstAyahOnPage returns the reading-order first ayah', () => {
    expect(firstAyahOnPage(1)).toEqual({ surah: 1, ayah: 1 });
    const p2 = firstAyahOnPage(2);
    expect(p2.surah).toBe(2);
    expect(p2.ayah).toBe(1);
  });
});

describe('queue building (QR-16/19)', () => {
  it('expands a same-surah range inclusively', () => {
    const refs = expandRange({ surah: 1, ayah: 1 }, { surah: 1, ayah: 7 });
    expect(refs).toHaveLength(7);
    expect(refs[0]).toEqual({ surah: 1, ayah: 1 });
    expect(refs[6]).toEqual({ surah: 1, ayah: 7 });
  });

  it('crosses surah boundaries', () => {
    const refs = expandRange({ surah: 1, ayah: 6 }, { surah: 2, ayah: 2 });
    expect(refs).toEqual([
      { surah: 1, ayah: 6 },
      { surah: 1, ayah: 7 },
      { surah: 2, ayah: 1 },
      { surah: 2, ayah: 2 },
    ]);
  });

  it('treats an inverted range as the single starting ayah', () => {
    const refs = expandRange({ surah: 2, ayah: 5 }, { surah: 2, ayah: 3 });
    expect(refs).toEqual([{ surah: 2, ayah: 5 }]);
  });

  it('applies each-ayah repeats before range repeats', () => {
    const refs = expandRange({ surah: 1, ayah: 1 }, { surah: 1, ayah: 2 });
    const out = applyRepeats(refs, 2, 3);
    // (a1 a1 a2 a2) × 3
    expect(out).toHaveLength(12);
    expect(out[0]).toEqual({ surah: 1, ayah: 1 });
    expect(out[1]).toEqual({ surah: 1, ayah: 1 });
    expect(out[2]).toEqual({ surah: 1, ayah: 2 });
  });

  it('caps pathological repeat expansion', () => {
    const refs = expandRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 286 });
    const out = applyRepeats(refs, 10, 10);
    expect(out.length).toBeLessThanOrEqual(700);
  });

  it('round-trips track ids', () => {
    expect(parseTrackId(trackId(2, 255, 7))).toEqual({ surah: 2, ayah: 255 });
    expect(parseTrackId('garbage')).toBeNull();
  });
});

describe('khatmah math (QR-21)', () => {
  const mkPlan = (over: Partial<KhatmahPlan>): KhatmahPlan => ({
    id: 'test',
    startedAt: Date.UTC(2026, 0, 1),
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
    ...over,
  });

  it('spreads all pages over the plan on day one', () => {
    const plan = mkPlan({});
    const { pagesToday, behindBy } = khatmahToday(plan, plan.startedAt);
    expect(pagesToday).toBe(Math.ceil(KHATMAH_TOTAL_PAGES / 30));
    expect(behindBy).toBe(0);
  });

  it('reports catch-up when behind schedule', () => {
    const plan = mkPlan({ pagesRead: 10 });
    const tenDays = plan.startedAt + 10 * 24 * 60 * 60 * 1000;
    const { behindBy, daysLeft } = khatmahToday(plan, tenDays);
    expect(daysLeft).toBe(20);
    expect(behindBy).toBeGreaterThan(0);
  });

  it('never divides by zero after the target date passes', () => {
    const plan = mkPlan({ pagesRead: 500 });
    const late = plan.startedAt + 45 * 24 * 60 * 60 * 1000;
    const { pagesToday, daysLeft } = khatmahToday(plan, late);
    expect(daysLeft).toBe(1);
    expect(pagesToday).toBe(KHATMAH_TOTAL_PAGES - 500);
  });

  it('default state ships a sane prefs shape', () => {
    expect(DEFAULT_QURAN_STATE.prefs.repeat.eachAyah).toBe(1);
    expect(DEFAULT_QURAN_STATE.prefs.reciterId).toBe('husary');
  });
});

describe('search normalization (QR-22)', () => {
  it('strips tashkeel and Quranic marks', () => {
    expect(normalizeArabic('بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')).toBe(
      'بسم الله الرحمن الرحيم',
    );
  });

  it('folds alef and hamza variants', () => {
    expect(normalizeArabic('أإآٱ')).toBe('اااا');
    expect(normalizeArabic('هدى')).toBe('هدي');
    expect(normalizeArabic('رحمة')).toBe('رحمه');
  });

  it('a folded query matches folded corpus text', () => {
    const corpus = normalizeArabic('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ');
    expect(corpus.includes(normalizeArabic('الحمد لله'))).toBe(true);
  });
});

describe('verse of the day (QR-23)', () => {
  it('is deterministic for a given date', () => {
    const d = new Date(2026, 6, 4);
    expect(verseOfTheDayRef(d)).toEqual(verseOfTheDayRef(new Date(2026, 6, 4)));
  });

  it('changes across days and stays in range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const ref = verseOfTheDayRef(new Date(2026, 0, 1 + i));
      const meta = SURAHS.find(s => s.number === ref.surah);
      expect(meta).toBeDefined();
      expect(ref.ayah).toBeGreaterThanOrEqual(1);
      expect(ref.ayah).toBeLessThanOrEqual(meta?.ayahCount ?? 0);
      seen.add(`${ref.surah}:${ref.ayah}`);
    }
    expect(seen.size).toBeGreaterThan(30);
  });
});
