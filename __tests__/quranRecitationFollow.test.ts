/**
 * The reader turns to the page the ayah is printed on.
 *
 * Issue #12: "when the audio playback reaches the next page, the displayed
 * text does not follow — the application remains stuck on the same page
 * while the audio continues", and "the grey band does not move correctly".
 *
 * Two page indexes, disagreeing. `findPageForAyah()` searched
 * `data/pages.json` (alquran.cloud, Tanzil-derived); the reader draws
 * `data/mushafLayoutV2.json` (QPC v2). Both call themselves the 604-page
 * Madinah mushaf and they disagreed about where 36 of those pages begin.
 *
 * Measured before the fix: 56 ayahs resolved to a page they are not drawn
 * on, 43 of them in juz 30 — the short surahs people play on repeat.
 * Playing Al-'Alaq, the audio reaches 96:13; the index answered 597, the
 * reader was already on 597, so it did not turn the page, while 96:13 is
 * printed on 598. In the same instant page 597 held no glyph tagged 96:13,
 * so the highlight matched nothing and the band vanished. One disagreement,
 * both halves of the report.
 *
 * The old test asked only whether the two agreed about SURAH STARTS
 * (`quranReader.v2.test.ts`, "agrees with the pages.json page index for
 * every surah start"). They did. That is why this shipped.
 *
 * `scripts/mushaf/rebuild_page_ranges.py` regenerates the ranges from the
 * layout; these tests are what make regenerating non-optional.
 */
import { findPageForAyah, MUSHAF_PAGES } from '../src/quran/pages';

// The raw layout, not the decoded one: this asks which ayahs a page
// declares, which is exactly what the renderer tags its glyphs with.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const layout = require('../src/quran/data/mushafLayoutV2.json') as Array<{
  p: number;
  l: Array<{ w?: number[][] }>;
}>;

/** Every page each (surah, ayah) is drawn on — two, where it spans a break. */
const pagesOf = new Map<string, Set<number>>();
/** The first (surah, ayah) each page draws. */
const firstOf = new Map<number, { surah: number; ayah: number }>();
for (const page of layout) {
  for (const line of page.l ?? []) {
    for (const run of line.w ?? []) {
      const key = `${run[0]}:${run[1]}`;
      if (!pagesOf.has(key)) pagesOf.set(key, new Set());
      pagesOf.get(key)!.add(page.p);
      if (!firstOf.has(page.p)) firstOf.set(page.p, { surah: run[0], ayah: run[1] });
    }
  }
}

describe('the page index describes the pages that are drawn', () => {
  it('sends every ayah to a page it is actually printed on', () => {
    // THE test. Before the fix this listed 56 ayahs; 96:13-19, 94:3-8,
    // 92:10-14, 100:6-9 and the rest of juz 30 among them.
    const stranded: string[] = [];
    for (const [key, drawnOn] of pagesOf) {
      const [surah, ayah] = key.split(':').map(Number);
      const page = findPageForAyah(surah, ayah);
      if (!drawnOn.has(page)) {
        stranded.push(`${key} → page ${page}, but drawn on ${[...drawnOn].join(',')}`);
      }
    }
    expect(stranded).toEqual([]);
  });

  it('starts each page where the page starts', () => {
    const wrong: string[] = [];
    for (const meta of MUSHAF_PAGES) {
      const first = firstOf.get(meta.page);
      if (!first) continue; // a page drawing no ayah runs at all
      if (meta.start.surah !== first.surah || meta.start.ayah !== first.ayah) {
        wrong.push(
          `page ${meta.page}: index says ${meta.start.surah}:${meta.start.ayah}, draws ${first.surah}:${first.ayah}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it('leaves no gap between one page and the next', () => {
    // `end` is exclusive and must be the next page's start, or the binary
    // search has ranges it can fall between and answers page 1.
    for (let i = 0; i < MUSHAF_PAGES.length - 1; i++) {
      const here = MUSHAF_PAGES[i];
      const next = MUSHAF_PAGES[i + 1];
      expect(here.end).toEqual(next.start);
    }
    expect(MUSHAF_PAGES[MUSHAF_PAGES.length - 1].end).toBeNull();
  });

  it('still covers the whole mushaf', () => {
    // A guard on the guards: if the layout were ever swapped for one with a
    // different corpus, every assertion above would pass vacuously against
    // it. 6236 is the Hafs ayah count, asserted the same way in
    // mushafLayout.test.ts.
    expect(pagesOf.size).toBe(6236);
    expect(MUSHAF_PAGES).toHaveLength(604);
    expect(findPageForAyah(1, 1)).toBe(1);
    expect(findPageForAyah(114, 6)).toBe(604);
  });

  it('turns forward, never backward, as the recitation advances', () => {
    // What the follow effect does with the index, in reading order: an
    // ayah later in the mushaf must never resolve to an earlier page.
    let previous = 0;
    for (const meta of MUSHAF_PAGES) {
      const page = findPageForAyah(meta.start.surah, meta.start.ayah);
      expect(page).toBeGreaterThanOrEqual(previous);
      previous = page;
    }
  });
});

describe('following the recitation is not switched off by starting it', () => {
  // Structural assertions on the source, in the manner of the release-gate
  // tests: the behaviour needs a mounted reader with a live player to
  // exercise, and what regresses here is the wiring, not the arithmetic.
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8') as string;
  const core = read('src/quran/mushafReaderCore.tsx');

  it('re-evaluates when the suspension lifts', () => {
    // It was `const followRef = useRef(true)`. A ref cannot wake the
    // effect, so after the thirty-second timer expired the reader stayed
    // where it was until the NEXT ayah boundary — up to a whole ayah of
    // recitation against the wrong page.
    expect(core).not.toMatch(/const followRef = useRef\(true\)/);
    expect(core).toContain('const [followSuspended, setFollowSuspended] = useState(false)');
    const effect = core.slice(core.indexOf('if (!playback.active || !playback.playing'));
    expect(effect.slice(0, effect.indexOf('])')))
      .toContain('followSuspended');
  });

  it('clears the suspension when playback starts', () => {
    // The reported case. A long-press on the page opens the ayah sheet
    // that "play from here" lives in, and any finger travel past the touch
    // slop drags the pager — arming a thirty-second suspension at the very
    // moment playback begins.
    expect(core).toContain('const resumeFollow = useCallback(');
    const arm = core.slice(core.indexOf('const wasPlaying = useRef(false)'));
    expect(arm.slice(0, 400)).toMatch(/if \(nowPlaying && !wasPlaying\.current\) resumeFollow\(\)/);
  });

  it('clears it when a drag lands back where it started', () => {
    // The branch that finds the list back where it started must lift the
    // suspension rather than leave follow off for thirty seconds. The
    // phone reader settles inline; the spread reader hands the pager
    // `core.resumeFollow` as what to do when a gesture navigates nowhere,
    // and spreadPager.test.ts runs that path for real.
    const phone = read('src/quran/MushafPhoneReader.tsx');
    const from = phone.indexOf('const onMomentumEnd = useCallback(');
    expect(from).toBeGreaterThanOrEqual(0);
    const settle = phone.slice(from);
    expect(settle.slice(0, settle.indexOf('}, ['))).toContain(
      'core.resumeFollow()',
    );

    const spread = read('src/quran/MushafSpreadReader.tsx');
    expect(spread).toMatch(/onSettleNoop: core\.resumeFollow,/);
    expect(spread).toMatch(/onTurnStart: core\.suspendFollow,/);
  });
});

describe('what the reporter suspected about memory', () => {
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8') as string;

  it('bounds the parsed word timings', () => {
    // One entry is a whole quran-align file — ~6,200 keys of number[][],
    // megabytes parsed. The Map was unbounded, so every reciter tried in a
    // session stayed resident for the life of the process.
    const timing = read('src/quran/audio/useWordTiming.ts');
    expect(timing).toMatch(/const MAX_CACHED_RECITERS = \d+/);
    expect(timing).toContain('while (cache.size > MAX_CACHED_RECITERS)');
  });

  it('has no image-reader geometry left to load at all', () => {
    // `data/ayahGeometry.json` was 2.6 MB of pixel boxes for the retired
    // image reader, parsed and kept for the life of the process. First it
    // was guarded off the text path; now the reader, the file and the
    // parser are gone, and the guard has nothing to guard.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    expect(
      fs.existsSync(path.join(__dirname, '..', 'src', 'quran', 'data', 'ayahGeometry.json')),
    ).toBe(false);
    expect(read('src/quran/MushafReader.tsx')).not.toContain('loadGeometry');
  });
});
