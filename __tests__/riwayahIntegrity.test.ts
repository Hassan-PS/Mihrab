/**
 * The gate a muṣḥaf has to pass to become one.
 *
 * This used to read the files committed under `src/quran/data/<riwayah>/`
 * and insist they were empty or whole. There are no such files any more:
 * the app ships no riwayah text, and the copy that becomes scripture on
 * someone's phone is one THEIR device fetched, which no maintainer will
 * ever look at (`src/quran/riwayahStore.ts`).
 *
 * So what has to be right is the CHECK, and it is now the same code in
 * both places — `tools/riwayat/import.ts` on a laptop and
 * `riwayahDownload.ts` on a phone both call `verifyRiwayahDataset`. Every
 * refusal below is a way a real dataset goes wrong: truncated in transit,
 * stitched together out of order, exported from a source that numbers its
 * ayahs differently. Each one would render beautifully and be wrong.
 */
import { TOTAL_AYAHS, ayahAtIndex } from '../src/quran/ayahIndex';
import { MUSHAF_SURAHS, findPageForAyah } from '../src/quran/pages';
import { verifyRiwayahDataset } from '../src/quran/riwayahImport';
import { RIWAYAT } from '../src/quran/riwayat';

type Verse = {
  verse_key: string;
  text: string;
  page_number: number;
  juz_number: number;
};

/** A well-formed dataset in the shape QUL publishes: 6236 ayahs, 604 pages. */
function wholeQuran(): Verse[] {
  const out: Verse[] = [];
  for (let i = 1; i <= TOTAL_AYAHS; i++) {
    const ref = ayahAtIndex(i);
    // Page 1 is al-Fātiḥah; the rest divide evenly. Not a real muṣḥaf's
    // pagination — the point is only that it is A pagination.
    const page = i <= 7 ? 1 : 2 + Math.floor(((i - 8) * 603) / (TOTAL_AYAHS - 7));
    out.push({
      verse_key: `${ref.surah}:${ref.ayah}`,
      text: 'كَلِمَةٌ كَلِمَةٌ',
      page_number: page,
      juz_number: Math.min(30, Math.floor((page - 1) / 21) + 1),
    });
  }
  return out;
}

const accept = (verses: unknown) => verifyRiwayahDataset(verses, MUSHAF_SURAHS);

describe('verifying a dataset', () => {
  it('accepts the whole Qur’an and paginates it', () => {
    const result = accept(wholeQuran());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalPages).toBe(604);
    expect(result.dataset.pages).toHaveLength(604);
    expect(Object.keys(result.dataset.text)).toHaveLength(TOTAL_AYAHS);
    expect(result.dataset.surahs).toHaveLength(114);
    // Contiguous, in order, ending open — the contract `findPageForAyah`
    // reads it under.
    expect(result.dataset.pages[0].start).toEqual({ surah: 1, ayah: 1 });
    expect(result.dataset.pages[603].end).toBeNull();
  });

  it('accepts the same data wrapped in an object', () => {
    // Published exports come both ways; neither is the caller's fault.
    expect(accept({ verses: wholeQuran() }).ok).toBe(true);
  });

  it('produces a pagination the reader can search', () => {
    const result = accept(wholeQuran());
    if (!result.ok) throw new Error('fixture should verify');
    // Feed it back through the app's own lookup: every page's first ayah
    // must resolve to that page. A pagination that fails this renders,
    // and sends the reader to the wrong place forever after.
    const pages = result.dataset.pages;
    const findIn = (surah: number, ayah: number) => {
      const hit = pages.find(
        p =>
          (p.start.surah < surah ||
            (p.start.surah === surah && p.start.ayah <= ayah)) &&
          (!p.end ||
            p.end.surah > surah ||
            (p.end.surah === surah && p.end.ayah > ayah)),
      );
      return hit?.page ?? 0;
    };
    for (const page of pages) {
      expect(findIn(page.start.surah, page.start.ayah)).toBe(page.page);
    }
  });

  const refusals: Array<[string, () => unknown, RegExp]> = [
    [
      'a Qur’an with an ayah missing',
      () => wholeQuran().slice(0, TOTAL_AYAHS - 1),
      /expected 6236 ayahs, found 6235/,
    ],
    [
      'a Qur’an with an ayah too many',
      () => {
        const v = wholeQuran();
        return [...v, v[v.length - 1]];
      },
      /expected 6236 ayahs, found 6237/,
    ],
    [
      'the same ayah twice',
      () => {
        const v = wholeQuran();
        v[10] = { ...v[9] };
        return v;
      },
      /appears twice/,
    ],
    [
      'an ayah with no text',
      () => {
        const v = wholeQuran();
        v[100] = { ...v[100], text: '   ' };
        return v;
      },
      /has no text/,
    ],
    [
      'an ayah with no page',
      () => {
        const v = wholeQuran();
        v[200] = { ...v[200], page_number: undefined as unknown as number };
        return v;
      },
      /has no page_number/,
    ],
    [
      'pages that go backwards',
      () => {
        const v = wholeQuran();
        v[5000] = { ...v[5000], page_number: 3 };
        return v;
      },
      /page numbers go backwards/,
    ],
    [
      'a page nobody is on',
      () => wholeQuran().map(v => ({ ...v, page_number: v.page_number + 1 })),
      /page 1 has no ayahs on it/,
    ],
    [
      'a verse key that is not surah:ayah',
      () => {
        const v = wholeQuran();
        v[3] = { ...v[3], verse_key: 'al-baqarah 2' };
        return v;
      },
      /is not in surah:ayah form/,
    ],
    ['nothing at all', () => [], /no verses found/],
    ['a file that is not a list of verses', () => ({ data: 'nope' }), /no verses found/],
  ];

  it.each(refusals)('refuses %s', (_name, build, expected) => {
    const result = accept(build());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(expected);
  });

  it('counts a surah’s ayahs against the app’s own table', () => {
    // The subtle one: the right TOTAL, in the right order, but a surah
    // boundary in the wrong place. A dataset from a source that numbers
    // the basmalah differently looks exactly like this.
    const verses = wholeQuran();
    verses[6] = { ...verses[6], verse_key: '2:0' };
    const result = accept(verses);
    expect(result.ok).toBe(false);
  });
});

describe('the riwayah table', () => {
  it('declares a source for everything it cannot draw from the bundle', () => {
    for (const riwayah of RIWAYAT) {
      if (riwayah.render === 'glyph') continue;
      // A riwayah the app offers to draw but cannot tell the reader where
      // to get is a dead end with a nice name on it.
      expect(riwayah.source?.publisher).toBeTruthy();
      expect(riwayah.source?.page).toMatch(/^https:\/\//);
      expect(riwayah.source?.credits).toBeTruthy();
    }
  });

  it('always offers Hafs, whatever the device has', () => {
    const hafs = RIWAYAT.find(r => r.id === 'hafs');
    expect(hafs).toBeDefined();
    expect(hafs?.render).toBe('glyph');
    // And the Hafs pagination is in the build, unconditionally.
    expect(findPageForAyah(1, 1)).toBe(1);
    expect(findPageForAyah(114, 6)).toBe(604);
  });
});
