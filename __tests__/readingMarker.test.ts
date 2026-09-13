/**
 * Two trails through one book — issue #41.
 *
 * "Continue reading" opened the surah and not the ayah, and the place it
 * kept was never more than the last page looked at: an evening in the
 * khatmah erased the afternoon's place in Al-Kahf, and a glance at a
 * bookmark erased both. What these pin is the reading marker as a trail
 * of its own — moved by reading, left alone by the khatmah's reading and
 * by jumps, pinned by hand from an ayah's panel, drawn only when pinned —
 * and the one place the two trails are told apart on a page.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  __resetQuranStateForTests,
  activeKhatmah,
  coerceQuranState,
  drawnReadingPosition,
  getQuranState,
  isKhatmahPage,
  khatmahCurrentPage,
  readingContinueTarget,
  recordReading,
  setKhatmahPosition,
  setReadingPosition,
  startKhatmah,
  type QuranState,
} from '../src/quran/quranState';
import { ayahEndInk, ayahTint } from '../src/quran/ayahMarks';
import { lineMarks } from '../src/quran/MushafTextPage';
import type { MushafLine, MushafWord } from '../src/quran/mushafLayout';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const marker = () => getQuranState().lastRead;
const plan = () => activeKhatmah(getQuranState())!;

beforeEach(() => {
  __resetQuranStateForTests();
});

describe('the marker follows reading', () => {
  it('moves with every turn when there is no plan', () => {
    recordReading({ surah: 2, ayah: 1, page: 2, mode: 'mushaf' });
    recordReading({ surah: 2, ayah: 6, page: 3, mode: 'mushaf' });
    expect(marker()?.page).toBe(3);
  });

  it('is read back with its pin, and without one', () => {
    setReadingPosition(18, 40, 297, 'withTranslation');
    expect(marker()).toMatchObject({ surah: 18, ayah: 40, page: 297, pinned: true });
    recordReading({ surah: 18, ayah: 45, page: 298, mode: 'withTranslation' });
    expect(marker()?.pinned).toBeUndefined();
  });
});

describe('the khatmah reads on its own trail', () => {
  beforeEach(() => {
    startKhatmah(30);
    // The plan stands at page 42; the reader's own place is in Al-Kahf.
    setKhatmahPosition(2, 255, 42);
    setReadingPosition(18, 40, 297, 'mushaf');
  });

  it('knows its own page, and the one beside it on a spread', () => {
    expect(khatmahCurrentPage(plan())).toBe(42);
    expect(isKhatmahPage(42)).toBe(true);
    expect(isKhatmahPage(43)).toBe(true);
    expect(isKhatmahPage(44)).toBe(true);
    expect(isKhatmahPage(45)).toBe(false);
    // Behind the plan is re-reading, not the plan: that is the whole
    // difference from `khatmahTracksPage`, which says yes to page 5.
    expect(isKhatmahPage(5)).toBe(false);
  });

  it('leaves a marker that is somewhere else where it is', () => {
    recordReading({ surah: 2, ayah: 260, page: 43, mode: 'mushaf' });
    expect(marker()).toMatchObject({ surah: 18, ayah: 40, page: 297 });
  });

  it('carries a marker that was riding with it', () => {
    // Every marker written before the two trails existed sits on the
    // plan's page. Stopping it there would have looked like a lost place.
    setReadingPosition(2, 255, 42, 'mushaf');
    recordReading({ surah: 2, ayah: 260, page: 43, mode: 'mushaf' });
    expect(marker()?.page).toBe(43);
  });

  it('lets the marker detach the moment the reader reads elsewhere', () => {
    setReadingPosition(2, 255, 42, 'mushaf');
    recordReading({ surah: 36, ayah: 1, page: 440, mode: 'mushaf' });
    expect(marker()?.page).toBe(440);
    // …and the khatmah cannot take it back.
    recordReading({ surah: 2, ayah: 260, page: 43, mode: 'mushaf' });
    expect(marker()?.page).toBe(440);
  });

  it('always follows the translation reader', () => {
    // Khatmah progress is credited from muṣḥaf turns and nowhere else, so
    // a plan read in translation never advances — a marker that refused
    // to follow would be a place lost with nothing to point at it.
    recordReading({ surah: 2, ayah: 258, page: 42, mode: 'withTranslation' });
    expect(marker()?.ayah).toBe(258);
  });
});

describe('where "Continue reading" leads', () => {
  it('nowhere, when nothing has been read', () => {
    expect(readingContinueTarget(getQuranState())).toBeNull();
  });

  it('to the marker, with no plan', () => {
    recordReading({ surah: 2, ayah: 19, page: 4, mode: 'withTranslation' });
    expect(readingContinueTarget(getQuranState())?.ayah).toBe(19);
  });

  it('not to the plan’s own page — one door is enough for one page', () => {
    startKhatmah(30);
    setKhatmahPosition(2, 255, 42);
    setReadingPosition(2, 255, 42, 'mushaf');
    expect(readingContinueTarget(getQuranState())).toBeNull();
    setReadingPosition(2, 270, 43, 'mushaf');
    expect(readingContinueTarget(getQuranState())).toBeNull();
    setReadingPosition(18, 40, 297, 'mushaf');
    expect(readingContinueTarget(getQuranState())?.page).toBe(297);
  });
});

describe('what is drawn', () => {
  it('draws a pinned marker and not a recorded one', () => {
    recordReading({ surah: 2, ayah: 19, page: 4, mode: 'withTranslation' });
    expect(drawnReadingPosition(getQuranState())).toBeNull();
    setReadingPosition(2, 19, 4, 'withTranslation');
    expect(drawnReadingPosition(getQuranState())).toEqual({ surah: 2, ayah: 19 });
  });

  const light = { accentColor: '#0f5132', nightMode: false };
  const at = (s: number, a: number) => ({ surah: s, ayah: a });

  it('washes the ayah in its own colour when it has the ayah to itself', () => {
    const tint = ayahTint({ ...light, readingPosition: at(18, 40) });
    expect(tint(18, 40)).toMatch(/^rgba\(200,85,43,/);
    expect(tint(18, 41)).toBeNull();
  });

  it('yields the wash to a bookmark or the khatmah, and keeps the medallion', () => {
    const bookmark = {
      id: 'b',
      surah: 18,
      ayah: 40,
      page: 297,
      color: 'sapphire' as const,
      createdAt: 0,
    };
    const shared = ayahTint({
      ...light,
      readingPosition: at(18, 40),
      bookmarks: [bookmark],
    });
    // The bookmark IS its colour; it would be lost under another.
    expect(shared(18, 40)).toMatch(/^rgba\(42,93,176,/);
    const withPlan = ayahTint({
      ...light,
      readingPosition: at(18, 40),
      khatmahPosition: at(18, 40),
    });
    expect(withPlan(18, 40)).toMatch(/^rgba\(8,145,178,/);
    // Either way the reading marker still speaks, on the medallion.
    const ink = ayahEndInk(at(18, 40));
    expect(ink(18, 40)).toBe('#c8552b');
    expect(ink(18, 41)).toBeNull();
    expect(ayahEndInk(null)(18, 40)).toBeNull();
  });

  it('carries both channels through a line’s marks string', () => {
    const word = (ayah: number, position: number, isEnd = false): MushafWord => ({
      text: 'x',
      surah: 18,
      ayah,
      position,
      isEnd,
      advance: 1,
    });
    const line: MushafLine = {
      kind: 'ayah',
      natural: 4,
      centered: false,
      words: [word(40, 1), word(40, 2, true), word(41, 1)],
    };
    const wash = (w: MushafWord) => (w.ayah === 40 ? 'rgba(1,1,1,0.1)' : null);
    const ink = (w: MushafWord) => (w.isEnd && w.ayah === 40 ? '#c8552b' : null);
    expect(lineMarks(line, wash, ink)).toBe('rgba(1,1,1,0.1)|rgba(1,1,1,0.1)~#c8552b|');
    // Nothing changes for a page with no marker on it.
    expect(lineMarks(line, wash)).toBe('rgba(1,1,1,0.1)|rgba(1,1,1,0.1)|');
    // And an ink alone, on an otherwise unmarked line, is still a mark.
    expect(lineMarks(line, () => null, ink)).toBe('|~#c8552b|');
  });
});

describe('the readers', () => {
  it('record a turn and not a jump — the muṣḥaf', () => {
    const core = src('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/const step = Math\.abs\(newPage - prevPage\);\s*if \(step >= 1 && step <= 2\)/);
    expect(core).toContain('recordReading(');
    expect(core).not.toContain('setLastRead(');
    // The jump still says "not a sequential turn", and now means it.
    expect(core).toContain('commitPageTurn(clamped, clamped)');
  });

  it('land on the ayah asked for, and record only what the reader scrolls to — translation', () => {
    const t = src('src/screens/quran/TranslationSurahScreen.tsx');
    // The landing is not a scroll. The list is handed a WINDOW of the
    // surah that begins at the ayah, so it opens there with nothing
    // measured, scrolled or retried (#41, and the walk that fix left).
    expect(t).toContain('const windowStart =');
    expect(t).toMatch(/landingIndex == null \? 0 : Math\.max\(0, landingIndex - leadRows\)/);
    expect(t).toMatch(/windowStart > 0 \? rows\.slice\(windowStart\) : rows/);
    expect(t).toContain('data={windowed ?? rows}');

    // It cannot go back to being a scroll to an index. `initialScrollIndex`
    // is the obvious-looking way to open a list partway down and it is a
    // trap here: without `getItemLayout` the rows above are never mounted
    // and have no height, so the reader lands on the ayah and then cannot
    // scroll back to the one before it. Measured, not guessed.
    expect(t).not.toContain('initialScrollIndex=');
    // And no retry loop: a failed scroll goes as far as the list measured
    // and stops. The loop that used to live here is what made opening a
    // surah deep in cost three seconds of walking.
    expect(t).not.toContain('setTimeout(tryLand');
    expect(t).toMatch(/onScrollToIndexFailed=\{info => \{[\s\S]*?highestMeasuredFrameIndex[\s\S]*?\n\s*\}\}/);

    // What a window costs is that everything above it has to be reachable
    // and has to arrive without shoving the page down.
    expect(t).toContain('onStartReached={readEarlier}');
    expect(t).toContain('maintainVisibleContentPosition={{ minIndexForVisible: 1 }}');
    // The surah header belongs at the surah's start, not above ayah 250.
    expect(t).toContain('ListHeaderComponent={windowStart === 0 ? header : null}');
    // Recitation scrolls by the list's index, which is not the ayah's when
    // the list holds a window — off by `windowStart` is off by 249.
    expect(t).toMatch(/const row = idx - windowStart;[\s\S]*?scrollToIndex\(\{\s*index: row,/);

    // Nothing is written until the READER scrolls: the mount, the landing
    // and the settling all move rows into view, and none of them is reading.
    expect(t).toMatch(/if \(!landed\.current\) \{[\s\S]*?landed\.current = true;[\s\S]*?return;/);
    expect(t).toMatch(/if \(!readerScrolled\.current\) return;[\s\S]*?recordReading\(\{/);
    expect(t).toContain('onScrollBeginDrag={takeOver}');
    // A wheel on a Mac begins no drag: any scroll after the settle window is the reader's.
    expect(t).toMatch(/const onScroll = useCallback\(\(\) => \{[\s\S]*?Date\.now\(\) > landingUntil\.current\) takeOver\(\);/);
    expect(t).not.toContain('setLastRead(');
  });

  it('do not mount the list until it knows where it opens — translation', () => {
    const t = src('src/screens/quran/TranslationSurahScreen.tsx');
    // A list mounted against an empty array has already decided it opens
    // at the top. The rows arrive asynchronously, so the list waits for
    // them and the loading card stands in — which is what the empty state
    // drew anyway, so this costs the reader nothing to look at.
    expect(t).toMatch(/\{rows == null \? \([\s\S]*?quran\.loading[\s\S]*?\) : \(\s*<FlatList/);
  });

  it('offer the pin beside the khatmah’s, in the other colour', () => {
    const sheet = src('src/quran/mushaf/AyahActionSheet.tsx');
    expect(sheet).toContain("t('quran.readingPin', 'Continue reading from here')");
    expect(sheet).toContain('setReadingPosition(');
    expect(sheet).toContain('borderColor: READING_COLOR');
  });
});

describe('the marker survives the wire', () => {
  it('keeps its pin through coercion and drops what is not a pin', () => {
    // The store is validated item by item on the way in (`coerceQuranState`)
    // — a pin written by another device has to arrive as one.
    const blob = (lastRead: Record<string, unknown>): QuranState =>
      coerceQuranState({ ...getQuranState(), lastRead });
    const base = { surah: 18, ayah: 40, page: 297, mode: 'mushaf', updatedAt: 1 };
    expect(blob({ ...base, pinned: true }).lastRead?.pinned).toBe(true);
    expect(blob({ ...base, pinned: 'yes' }).lastRead?.pinned).toBeUndefined();
    expect(blob(base).lastRead?.pinned).toBeUndefined();
  });
});
