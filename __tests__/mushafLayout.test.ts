/**
 * The layout data behind the font-rendered mushaf (v2.8.0).
 *
 * These assertions are about the DATA, not the rendering: if a page loses a
 * line, a surah plate lands on the wrong page, or a line's words stop matching
 * its ayah segments, the reader would draw a subtly wrong Quran page — the
 * worst class of bug this app can ship. The generator
 * (`scripts/mushaf/build_qcf_assets.py`) checks the same invariants; this is
 * the gate that keeps a bad regeneration from reaching a build.
 */
import {
  MUSHAF_LINES_PER_PAGE,
  ayahsOnPage,
  getPageLayout,
  isFramedPage,
  surahHeadersOnPage,
} from '../src/quran/mushafLayout';

const TOTAL_PAGES = 604;

describe('mushaf layout data', () => {
  it('covers every page of the Madinah mushaf', () => {
    expect(getPageLayout(1)).not.toBeNull();
    expect(getPageLayout(TOTAL_PAGES)).not.toBeNull();
    expect(getPageLayout(0)).toBeNull();
    expect(getPageLayout(TOTAL_PAGES + 1)).toBeNull();
  });

  it('gives every regular page exactly 15 printed lines', () => {
    for (let page = 3; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page);
      expect(layout).not.toBeNull();
      expect(layout!.lines.length).toBe(MUSHAF_LINES_PER_PAGE);
    }
  });

  it('keeps the ornamental opening pages to their own shape', () => {
    for (const page of [1, 2]) {
      expect(isFramedPage(page)).toBe(true);
      const layout = getPageLayout(page)!;
      expect(layout.lines.length).toBeGreaterThan(0);
      expect(layout.lines.length).toBeLessThan(MUSHAF_LINES_PER_PAGE);
      // Every line of the plate is centred — nothing is stretched.
      for (const line of layout.lines) {
        if (line.kind === 'ayah') expect(line.centered).toBe(true);
      }
    }
  });

  it('gives every page a measure wider than any of its lines', () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = getPageLayout(page)!;
      expect(layout.measure).toBeGreaterThan(0);
      for (const line of layout.lines) {
        if (line.kind !== 'ayah') continue;
        // The measure drives fontSize; a line wider than it would overflow.
        expect(line.natural).toBeLessThanOrEqual(layout.measure + 1e-6);
      }
    }
  });

  it('prints all 114 surah plates exactly once', () => {
    const seen = new Map<number, number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const surah of surahHeadersOnPage(page)) {
        seen.set(surah, (seen.get(surah) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(114);
    for (let s = 1; s <= 114; s++) expect(seen.get(s)).toBe(1);
  });

  it('gives every surah a basmalah line except Al-Fatihah and At-Tawbah', () => {
    const basmalah = new Set<number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind === 'basmalah') basmalah.add(line.surah);
      }
    }
    expect(basmalah.has(1)).toBe(false); // its basmalah is ayah 1
    expect(basmalah.has(9)).toBe(false); // At-Tawbah has none
    expect(basmalah.size).toBe(112);
  });

  it('runs the ayahs in order, without gaps, across the whole mushaf', () => {
    let surah = 1;
    let ayah = 0;
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const ref of ayahsOnPage(page)) {
        if (ref.surah === surah && ref.ayah === ayah) continue; // continued
        if (ref.surah === surah && ref.ayah === ayah + 1) {
          ayah = ref.ayah;
          continue;
        }
        // New surah must be the next one, starting at ayah 1.
        expect([ref.surah, ref.ayah]).toEqual([surah + 1, 1]);
        surah = ref.surah;
        ayah = 1;
      }
    }
    expect(surah).toBe(114);
    expect(ayah).toBe(6); // An-Nas ends the mushaf at 114:6
  });

  it('numbers words consecutively within each ayah', () => {
    const lastPosition = new Map<string, number>();
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind !== 'ayah') continue;
        for (const word of line.words) {
          const key = `${word.surah}:${word.ayah}`;
          const previous = lastPosition.get(key);
          if (previous == null) {
            expect(word.position).toBe(1);
          } else {
            expect(word.position).toBe(previous + 1);
          }
          lastPosition.set(key, word.position);
          expect(word.text.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ends each ayah with exactly one medallion', () => {
    let medallions = 0;
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      for (const line of getPageLayout(page)!.lines) {
        if (line.kind !== 'ayah') continue;
        for (const word of line.words) if (word.isEnd) medallions += 1;
      }
    }
    // 6236 ayahs in the Hafs reading, each closed by its number glyph.
    expect(medallions).toBe(6236);
  });

  it('centres the line that closes a surah, and stretches the rest', () => {
    // Page 604 holds three complete surahs, so it shows both behaviours.
    const layout = getPageLayout(604)!;
    const ayahLines = layout.lines.filter(l => l.kind === 'ayah');
    const centered = ayahLines.filter(l => l.kind === 'ayah' && l.centered);
    expect(centered.length).toBe(3); // Al-Ikhlas, Al-Falaq, An-Nas
    expect(centered.length).toBeLessThan(ayahLines.length);
  });
});
