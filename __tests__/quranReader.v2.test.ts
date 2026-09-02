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
  khatmahBehindBy,
  khatmahDay,
  khatmahDaysLeft,
  khatmahPages,
  khatmahPortion,
  KHATMAH_TOTAL_AYAHS,
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

  it('asks the same of every day of the plan', () => {
    // The fault this pins: cut into equal AYAH counts, a thirty-day plan
    // asked for 36 pages on day two and 8 on day twenty-eight. Cut by
    // page it is a twentieth of the book every day, which is what a
    // khatmah means.
    const plan = mkPlan({});
    const seen: number[] = [];
    for (let day = 1; day <= 30; day++) {
      const at = mkPlan({ ayahsRead: khatmahPortion(plan, day).from - 1 });
      seen.push(khatmahPages(at, 'hafs', at.startedAt).today);
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(19);
    expect(Math.max(...seen)).toBeLessThanOrEqual(22);

    const first = khatmahPages(plan, 'hafs', plan.startedAt);
    expect(first.doneToday).toBe(0);
    expect(first.leftToday).toBe(first.today);
    expect(first.remaining).toBe(KHATMAH_TOTAL_PAGES);
    expect(khatmahBehindBy(plan, plan.startedAt)).toBe(0);
  });

  it('counts the days left off the portion, not the calendar', () => {
    // The fault this pins: a plan begun today and read three portions
    // into said "day 4 of 30" and "30 days left" in the same breath.
    const plan = mkPlan({});
    const read = mkPlan({ ayahsRead: khatmahPortion(plan, 3).to });
    expect(khatmahDay(read, read.startedAt).portion.day).toBe(4);
    expect(khatmahDaysLeft(read, read.startedAt)).toBe(27);

    // And a reader who has not opened it for ten days is still on day one.
    const idle = mkPlan({});
    const tenDays = idle.startedAt + 10 * 24 * 60 * 60 * 1000;
    expect(khatmahDaysLeft(idle, tenDays)).toBe(30);
    expect(khatmahBehindBy(idle, tenDays)).toBeGreaterThan(0);
  });

  it('answers for the book, not for the portion the day is pinned to', () => {
    // The other half of the same fault. `khatmahDay` holds the day at the
    // portion it STARTED in, so someone who sat down on day five and read
    // to page 551 is still shown "day 5" until tomorrow — deliberately.
    // What is LEFT is a different question, and the answer is where they
    // actually are: three days, not twenty-five.
    const plan = mkPlan({});
    const far = mkPlan({
      ayahsRead: khatmahPortion(plan, 27).to,
      dayStartDate: new Date(plan.startedAt).toISOString().slice(0, 10),
      dayStartAyahsRead: khatmahPortion(plan, 4).to,
    });
    expect(khatmahDaysLeft(far, plan.startedAt)).toBe(3);
  });

  it('has nothing left to say when the book is finished', () => {
    const done = mkPlan({ ayahsRead: KHATMAH_TOTAL_AYAHS });
    expect(khatmahDaysLeft(done, done.startedAt)).toBe(0);
    expect(khatmahPages(done, 'hafs', done.startedAt).remaining).toBe(0);
  });

  it('counts the pages of the muṣḥaf the reader is in', () => {
    // Without an installed riwayah every id falls back to the Ḥafṣ
    // pagination, so this pins the fallback rather than the difference —
    // what matters is that the riwayah is ASKED, and that the answer is
    // a page count of a real muṣḥaf.
    const plan = mkPlan({ ayahsRead: 1000 });
    for (const riwayah of ['hafs', 'warsh', 'shubah'] as const) {
      const pages = khatmahPages(plan, riwayah, plan.startedAt);
      expect(pages.total).toBeGreaterThan(600);
      expect(pages.remaining).toBeGreaterThan(0);
      expect(pages.remaining).toBeLessThanOrEqual(pages.total);
    }
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
