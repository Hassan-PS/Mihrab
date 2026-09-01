/**
 * The second muṣḥaf: its pagination, its page structure, and the fit.
 *
 * ── WHY THIS MOCKS THE DATA ───────────────────────────────────────────
 *
 * The Warsh dataset is NOT in the repository — its licence is unresolved
 * (`docs/design/riwayat-plan.md` §1) and `tools/riwayat/import.ts` builds
 * it locally from a dataset a human obtained. So a test that read the real
 * files would pass on the machine that has them and fail everywhere else,
 * which is the least useful kind of test there is.
 *
 * What is worth pinning has nothing to do with which bytes arrive anyway:
 * that a second pagination covers the Qur'an exactly once, that a page
 * knows which surahs open on it and which of them take a basmalah, and
 * that a page fitted to a box stays inside it. A synthetic muṣḥaf — 604
 * pages that deliberately fall in DIFFERENT places from the Hafs ones —
 * exercises every one of those, and catches the bug this whole change
 * risks: a page number quietly read against the wrong print.
 */
import {
  TOTAL_AYAHS,
  ayahAtIndex,
  ayahIndexOf,
} from '../src/quran/ayahIndex';

jest.mock('../src/quran/riwayahData', () => {
  const {
    TOTAL_AYAHS: total,
    ayahAtIndex: at,
  } = jest.requireActual('../src/quran/ayahIndex');

  // Page 1 is al-Fātiḥah, as in every print; the rest are divided evenly,
  // which no real muṣḥaf does — the point is that they are NOT where Hafs
  // puts them.
  const starts: number[] = [1, 8];
  for (let k = 1; k < 603; k++) {
    starts.push(8 + Math.round((k * (total + 1 - 8)) / 603));
  }
  const pages = starts.map((startIndex, i) => ({
    page: i + 1,
    juz: Math.min(30, Math.floor((i * 30) / starts.length) + 1),
    start: at(startIndex),
    end: i + 1 < starts.length ? at(starts[i + 1]) : null,
  }));

  const surahs = jest
    .requireActual('../src/quran/quran')
    .SURAHS.map((s: { number: number; arabic: string; english: string }) => ({
      number: s.number,
      name: s.arabic,
      englishName: s.english,
    }));

  const text: Record<string, string> = {};
  for (let i = 1; i <= total; i++) {
    const ref = at(i);
    text[`${ref.surah}:${ref.ayah}`] = 'كَلِمَةٌ كَلِمَةٌ كَلِمَةٌ';
  }

  return {
    __esModule: true,
    loadRiwayahPages: (id: string) =>
      id === 'warsh' ? { pages, surahs } : null,
    loadRiwayahText: (id: string) => (id === 'warsh' ? text : null),
    _resetRiwayahDataCacheForTests: () => {},
  };
});

import {
  MUSHAF_PAGES,
  findPageForAyah,
  firstAyahOfPage,
  pagesForRiwayah,
  totalPagesForRiwayah,
} from '../src/quran/pages';
import { availableRiwayat, riwayahChoiceExists } from '../src/quran/riwayat';
import {
  advancingLength,
  fontBounds,
  pageExtent,
  predictFontSize,
  unicodePageBlocks,
} from '../src/quran/MushafUnicodePage';
import { mushafPageColumnHeight } from '../src/quran/MushafTextPageSurface';
import { surahAtPage } from '../src/quran/MushafPageScrubber';

describe('a second pagination', () => {
  it('is offered once its data is in the build', () => {
    expect(riwayahChoiceExists()).toBe(true);
    expect(availableRiwayat().map(r => r.id)).toEqual(['hafs', 'warsh']);
  });

  it('is not the Hafs one — which is the whole reason it exists', () => {
    const warsh = pagesForRiwayah('warsh');
    expect(warsh).toHaveLength(MUSHAF_PAGES.length);
    const differing = warsh.filter(
      (p, i) =>
        p.start.surah !== MUSHAF_PAGES[i].start.surah ||
        p.start.ayah !== MUSHAF_PAGES[i].start.ayah,
    );
    expect(differing.length).toBeGreaterThan(400);
  });

  it('covers the Qur’an exactly once, in order', () => {
    // The assertion that matters. A pagination that loses an ayah, repeats
    // one, or runs backwards is not a muṣḥaf, and no amount of correct
    // rendering afterwards would make it one.
    const pages = pagesForRiwayah('warsh');
    let expected = 1;
    for (const page of pages) {
      expect(ayahIndexOf(page.start.surah, page.start.ayah)).toBe(expected);
      const next = page.end
        ? ayahIndexOf(page.end.surah, page.end.ayah)
        : TOTAL_AYAHS + 1;
      expect(next).toBeGreaterThan(expected);
      expected = next;
    }
    expect(expected).toBe(TOTAL_AYAHS + 1);
  });

  it('round-trips page → first ayah → page', () => {
    for (let page = 1; page <= totalPagesForRiwayah('warsh'); page++) {
      const at = firstAyahOfPage(page, 'warsh');
      expect(findPageForAyah(at.surah, at.ayah, 'warsh')).toBe(page);
    }
  });

  it('keeps your place across a switch, by way of the ayah', () => {
    // What the reader actually does when the toggle is pressed: the page
    // becomes its first ayah, and the ayah becomes whatever page holds it
    // in the other muṣḥaf. It must land on a page that CONTAINS that ayah,
    // never merely on the same number.
    for (const page of [1, 2, 50, 300, 604]) {
      const at = firstAyahOfPage(page, 'hafs');
      const there = findPageForAyah(at.surah, at.ayah, 'warsh');
      const meta = pagesForRiwayah('warsh').find(p => p.page === there)!;
      const index = ayahIndexOf(at.surah, at.ayah);
      expect(index).toBeGreaterThanOrEqual(
        ayahIndexOf(meta.start.surah, meta.start.ayah),
      );
      if (meta.end) {
        expect(index).toBeLessThan(ayahIndexOf(meta.end.surah, meta.end.ayah));
      }
      // And back again lands on the page we started from.
      expect(findPageForAyah(at.surah, at.ayah, 'hafs')).toBe(page);
    }
  });

  it('reads the rail against the muṣḥaf it was given', () => {
    const hafs = surahAtPage(300, 'hafs');
    const warsh = surahAtPage(300, 'warsh');
    expect(hafs).toBe(MUSHAF_PAGES[299].start.surah);
    expect(warsh).toBe(pagesForRiwayah('warsh')[299].start.surah);
    // The default is Hafs — every caller that has not been told about
    // riwayat must keep the answer it always had.
    expect(surahAtPage(300)).toBe(hafs);
  });
});

describe('what a page holds', () => {
  const surahsOpeningOn = (page: number) =>
    unicodePageBlocks(page, 'warsh')
      .filter(b => b.kind === 'surah')
      .map(b => (b as { kind: 'surah'; surah: number }).surah);

  it('draws nothing for a riwayah this build does not carry', () => {
    // Hafs has no `text.json` — it is drawn by the glyph pipeline. Asking
    // the Unicode renderer for it must produce an empty page, not a page
    // of blanks.
    expect(unicodePageBlocks(1, 'hafs')).toEqual([]);
  });

  it('opens al-Fātiḥah with a band and no basmalah', () => {
    // Its basmalah IS its first ayah. Drawing one above it would print the
    // phrase twice on the opening page of the muṣḥaf.
    const blocks = unicodePageBlocks(1, 'warsh');
    expect(blocks[0]).toEqual({ kind: 'surah', surah: 1 });
    expect(blocks.some(b => b.kind === 'basmalah')).toBe(false);
  });

  it('opens al-Tawbah with a band and no basmalah', () => {
    const page = findPageForAyah(9, 1, 'warsh');
    const blocks = unicodePageBlocks(page, 'warsh');
    const bandAt = blocks.findIndex(
      b => b.kind === 'surah' && b.surah === 9,
    );
    expect(bandAt).toBeGreaterThanOrEqual(0);
    expect(blocks[bandAt + 1]?.kind).not.toBe('basmalah');
  });

  it('opens every other surah with a band and then a basmalah', () => {
    for (let surah = 2; surah <= 114; surah++) {
      if (surah === 9) continue;
      const page = findPageForAyah(surah, 1, 'warsh');
      const blocks = unicodePageBlocks(page, 'warsh');
      const bandAt = blocks.findIndex(
        b => b.kind === 'surah' && b.surah === surah,
      );
      expect(bandAt).toBeGreaterThanOrEqual(0);
      expect(blocks[bandAt + 1]?.kind).toBe('basmalah');
    }
  });

  it('names every surah that opens on a page, and no others', () => {
    for (let page = 1; page <= totalPagesForRiwayah('warsh'); page++) {
      const meta = pagesForRiwayah('warsh').find(p => p.page === page)!;
      const from = ayahIndexOf(meta.start.surah, meta.start.ayah);
      const to = meta.end
        ? ayahIndexOf(meta.end.surah, meta.end.ayah) - 1
        : TOTAL_AYAHS;
      const expected: number[] = [];
      for (let i = from; i <= to; i++) {
        const ref = ayahAtIndex(i);
        if (ref.ayah === 1) expected.push(ref.surah);
      }
      expect(surahsOpeningOn(page)).toEqual(expected);
    }
  });

  it('lists a page’s ayahs in order, each exactly once', () => {
    const seen: string[] = [];
    for (let page = 1; page <= totalPagesForRiwayah('warsh'); page++) {
      for (const block of unicodePageBlocks(page, 'warsh')) {
        if (block.kind !== 'text') continue;
        for (const ayah of block.ayahs) seen.push(`${ayah.surah}:${ayah.ayah}`);
      }
    }
    expect(seen).toHaveLength(TOTAL_AYAHS);
    expect(new Set(seen).size).toBe(TOTAL_AYAHS);
    expect(seen[0]).toBe('1:1');
    expect(seen[TOTAL_AYAHS - 1]).toBe('114:6');
  });
});

describe('fitting a page to its box', () => {
  const BOX = { width: 360, height: 620 };

  it('measures what advances the pen, not what sits above it', () => {
    // Both spellings are the same four letters; the marks are drawn but
    // take no width, and counting them would size every page too small.
    expect(advancingLength('قلمة')).toBe(4);
    expect(
      advancingLength('قَلَمٌةُ'),
    ).toBe(4);
  });

  it('sets a denser page smaller', () => {
    const light = predictFontSize({ chars: 400, extraRows: 0 }, BOX.width, BOX.height);
    const heavy = predictFontSize({ chars: 1600, extraRows: 0 }, BOX.width, BOX.height);
    expect(heavy).toBeLessThan(light);
  });

  it('charges a surah band for the room it takes', () => {
    const bare = predictFontSize({ chars: 900, extraRows: 0 }, BOX.width, BOX.height);
    const banded = predictFontSize({ chars: 900, extraRows: 4 }, BOX.width, BOX.height);
    expect(banded).toBeLessThan(bare);
  });

  it('grows with the box', () => {
    const small = predictFontSize({ chars: 900, extraRows: 0 }, BOX.width, 400);
    const tall = predictFontSize({ chars: 900, extraRows: 0 }, BOX.width, 900);
    expect(tall).toBeGreaterThan(small);
  });

  it('never leaves its bounds, however absurd the page', () => {
    const { min, max } = fontBounds(BOX.width);
    const empty = predictFontSize({ chars: 1, extraRows: 0 }, BOX.width, BOX.height);
    const impossible = predictFontSize(
      { chars: 500_000, extraRows: 0 },
      BOX.width,
      BOX.height,
    );
    expect(empty).toBeLessThanOrEqual(max);
    expect(impossible).toBeGreaterThanOrEqual(min);
    // The ceiling is a little over the Madinah print's own measure, so a
    // short final page reads larger than its neighbours but not absurdly.
    expect(max).toBeGreaterThan(BOX.width / 15.75);
    expect(max).toBeLessThan(BOX.width / 10);
  });

  it('counts what a real page costs to draw', () => {
    const blocks = unicodePageBlocks(1, 'warsh');
    const extent = pageExtent(blocks);
    expect(extent.chars).toBeGreaterThan(0);
    // Al-Fātiḥah opens with a band and no basmalah — one row of furniture.
    expect(extent.extraRows).toBeGreaterThan(1);
    expect(extent.extraRows).toBeLessThan(2);
  });
});

describe('the box a page is given', () => {
  it('fills the viewport when the column does not scroll', () => {
    expect(
      mushafPageColumnHeight({
        page: 5,
        riwayah: 'warsh',
        textWidth: 340,
        viewportHeight: 700,
        scrolling: false,
        playerReserve: 68,
      }),
    ).toBe(632);
  });

  it('gives a scrolling Unicode column the print’s proportions', () => {
    const height = mushafPageColumnHeight({
      page: 5,
      riwayah: 'warsh',
      textWidth: 500,
      viewportHeight: 300,
      scrolling: true,
    });
    // Taller than the viewport — that is what the column scrolls — and
    // shaped like a muṣḥaf page rather than like the window.
    expect(height).toBeGreaterThan(300);
    expect(height / 500).toBeCloseTo(1.636, 3);
  });

  it('never returns a box a page cannot be drawn in', () => {
    expect(
      mushafPageColumnHeight({
        page: 1,
        riwayah: 'warsh',
        textWidth: 300,
        viewportHeight: 0,
        scrolling: false,
      }),
    ).toBeGreaterThan(0);
  });
});
