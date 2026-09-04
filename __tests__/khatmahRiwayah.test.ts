/**
 * A khatmah is a khatmah in either muṣḥaf.
 *
 * The reason this file exists is stated in `ayahIndex.ts`: progress used to
 * be a page count out of 604, and page 300 of a Warsh muṣḥaf is not page
 * 300 of a Hafs one. Switching riwayah mid-khatmah would have made the same
 * stored number mean two different amounts of Qur'an, silently, and the
 * only visible symptom would have been a tracker that jumped.
 *
 * So these are the properties the switch has to have, and they are worth
 * asserting against a pagination that is deliberately NOT the Hafs one —
 * a fixture that agreed with Hafs would pass every test here without
 * proving anything.
 */
import { TOTAL_AYAHS, ayahIndexOf } from '../src/quran/ayahIndex';

jest.mock('../src/quran/riwayahData', () => {
  const { TOTAL_AYAHS: total, ayahAtIndex: at } =
    jest.requireActual('../src/quran/ayahIndex');
  // 604 pages, divided evenly — a real muṣḥaf does nothing of the kind,
  // which is the point: no page boundary here coincides with Hafs.
  const starts = [1, 8];
  for (let k = 1; k < 603; k++) {
    starts.push(8 + Math.round((k * (total + 1 - 8)) / 603));
  }
  const pages = starts.map((startIndex, i) => ({
    page: i + 1,
    juz: Math.min(30, Math.floor((i * 30) / starts.length) + 1),
    start: at(startIndex),
    end: i + 1 < starts.length ? at(starts[i + 1]) : null,
  }));
  const text: Record<string, string> = {};
  for (let i = 1; i <= total; i++) {
    const ref = at(i);
    text[`${ref.surah}:${ref.ayah}`] = 'كَلِمَةٌ';
  }
  return {
    __esModule: true,
    loadRiwayahPages: (id: string) =>
      id === 'warsh' ? { pages, surahs: [] } : null,
    loadRiwayahText: (id: string) => (id === 'warsh' ? text : null),
    riwayahProvenance: () => null,
    hydrateRiwayahData: async () => {},
    useRiwayahAvailability: () => 0,
    _resetRiwayahDataCacheForTests: () => {},
  };
});

import { findPageForAyah, firstAyahOfPage } from '../src/quran/pages';
import {
  KHATMAH_TOTAL_AYAHS,
  ayahsThroughPage,
  khatmahAyahsRead,
  khatmahCurrentPage,
  type KhatmahPlan,
  type QuranState,
} from '../src/quran/quranState';
import { mergeQuran } from '../src/sync/merge';

function plan(over: Partial<KhatmahPlan> = {}): KhatmahPlan {
  return {
    id: 'k1',
    startedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
    ...over,
  } as KhatmahPlan;
}

describe('reading a page, in either muṣḥaf', () => {
  it('counts the ayahs that page actually ends on', () => {
    for (const riwayah of ['hafs', 'warsh'] as const) {
      for (const page of [1, 2, 50, 300, 603]) {
        const next = firstAyahOfPage(page + 1, riwayah);
        expect(ayahsThroughPage(page, riwayah)).toBe(
          ayahIndexOf(next.surah, next.ayah) - 1,
        );
      }
      expect(ayahsThroughPage(0, riwayah)).toBe(0);
      expect(ayahsThroughPage(604, riwayah)).toBe(TOTAL_AYAHS);
      expect(ayahsThroughPage(9999, riwayah)).toBe(TOTAL_AYAHS);
    }
  });

  it('gives the two muṣḥafs different answers for the same page', () => {
    // If this ever passes trivially the fixture has stopped being a second
    // pagination and every other test here is measuring nothing.
    expect(ayahsThroughPage(300, 'warsh')).not.toBe(
      ayahsThroughPage(300, 'hafs'),
    );
  });
});

describe('switching riwayah mid-khatmah', () => {
  const read = ayahsThroughPage(300, 'hafs');
  const halfway = plan({ ayahsRead: read, pagesRead: 300 });

  it('does not change how much has been read', () => {
    // The number that IS the progress is a count of ayahs, and nothing
    // about which muṣḥaf is open can move it.
    expect(khatmahAyahsRead(halfway)).toBe(read);
  });

  it('lands on the page of the other muṣḥaf that holds the next ayah', () => {
    const hafsPage = khatmahCurrentPage(halfway, 'hafs');
    const warshPage = khatmahCurrentPage(halfway, 'warsh');
    expect(hafsPage).toBe(301);
    // Not the same NUMBER — that is the whole hazard — but the same place.
    const nextAyahIndex = read + 1;
    for (const [page, riwayah] of [
      [hafsPage, 'hafs'],
      [warshPage, 'warsh'],
    ] as const) {
      const start = firstAyahOfPage(page, riwayah);
      expect(ayahIndexOf(start.surah, start.ayah)).toBeLessThanOrEqual(
        nextAyahIndex,
      );
    }
  });

  it('comes back to the same page when you switch back', () => {
    const there = khatmahCurrentPage(halfway, 'warsh');
    const back = khatmahCurrentPage(halfway, 'hafs');
    expect(back).toBe(khatmahCurrentPage(halfway, 'hafs'));
    expect(there).toBe(khatmahCurrentPage(halfway, 'warsh'));
  });

  it('re-resolves a pinned position through the ayah, not the page', () => {
    const pinned = plan({
      ayahsRead: 0,
      position: { surah: 18, ayah: 1, page: findPageForAyah(18, 1, 'hafs') },
    });
    expect(khatmahCurrentPage(pinned, 'hafs')).toBe(findPageForAyah(18, 1, 'hafs'));
    expect(khatmahCurrentPage(pinned, 'warsh')).toBe(
      findPageForAyah(18, 1, 'warsh'),
    );
  });

  it('ends at the last page of whichever muṣḥaf is open', () => {
    const done = plan({ ayahsRead: TOTAL_AYAHS, pagesRead: 604 });
    expect(khatmahCurrentPage(done, 'hafs')).toBe(604);
    expect(khatmahCurrentPage(done, 'warsh')).toBe(604);
  });
});

describe('a plan from before any of this', () => {
  it('reads its old page count through the Hafs pagination', () => {
    // The only muṣḥaf those plans could have been reading.
    const old = plan({ pagesRead: 120 });
    expect(khatmahAyahsRead(old)).toBe(ayahsThroughPage(120, 'hafs'));
  });

  it('is clamped rather than trusted', () => {
    expect(khatmahAyahsRead(plan({ ayahsRead: -5 }))).toBe(0);
    expect(khatmahAyahsRead(plan({ ayahsRead: 99_999 }))).toBe(TOTAL_AYAHS);
    expect(KHATMAH_TOTAL_AYAHS).toBe(TOTAL_AYAHS);
  });
});

describe('two devices reading the same khatmah in different muṣḥafs', () => {
  const base = {
    version: 1 as const,
    lastRead: null,
    bookmarks: [],
    starred: [],
  };
  const prefs: QuranState['prefs'] = {
    reciterId: 'husary',
    playbackRate: 1,
    mushafNightMode: false,
    mushafPaperTone: 'paper',
    riwayah: 'hafs',
    riwayahNoticeSeen: false,
    keepAwake: true,
    hideMode: 'none',
    repeat: { eachAyah: 1, range: 1, pauseFactor: 0 },
    votdMode: 'translation',
    companionMode: 'translation',
    tafsirEditionId: '',
    verseOfDayOpen: false,
    shuffleSurahs: false,
  };
  const state = (ayahsRead: number, pagesRead: number): QuranState => ({
    ...base,
    khatmah: [plan({ ayahsRead, pagesRead })],
    prefs,
  });

  it('keeps the furthest anyone has read, in ayahs', () => {
    const phone = state(ayahsThroughPage(300, 'warsh'), 300);
    const mac = state(ayahsThroughPage(310, 'hafs'), 310);
    const merged = mergeQuran(phone, mac);
    const furthest = Math.max(
      ayahsThroughPage(300, 'warsh'),
      ayahsThroughPage(310, 'hafs'),
    );
    expect(khatmahAyahsRead(merged.khatmah[0])).toBe(furthest);
    // And the other way round, because neither device is the primary.
    expect(khatmahAyahsRead(mergeQuran(mac, phone).khatmah[0])).toBe(furthest);
  });

  it('is idempotent, so a sync cycle cannot drift', () => {
    const a = state(1000, 100);
    const once = mergeQuran(a, a);
    expect(once).toEqual(mergeQuran(once, once));
  });
});
