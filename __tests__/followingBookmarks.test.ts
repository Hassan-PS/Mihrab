/**
 * A bookmark that keeps itself — issue #54.
 *
 * A reader can hold several places at once: a khatmah, a surah read now
 * and then, Al-Mulk every evening. The marker was the only one that
 * moved, and there was one of it, so the evening in Al-Mulk replaced the
 * place in the other surah. A following bookmark is a place that moves
 * on its own — and WHICH place a page turn belongs to is decided by what
 * was opened, not by where the page is, because with more than one
 * bookmark proximity has to guess and sometimes guesses wrong.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  __resetQuranStateForTests,
  addBookmark,
  BOOKMARK_COLORS,
  KHATMAH_COLOR,
  READING_COLOR,
  moveSessionToPage,
  coerceQuranState,
  getQuranState,
  recordReading,
  removeBookmark,
  setBookmarkFollows,
  setQuranPrefs,
  startKhatmah,
  type QuranState,
  type QuranBookmark,
} from '../src/quran/quranState';
import { ayahTint } from '../src/quran/ayahMarks';
import {
  _resetReadingSession,
  beginReadingSession,
  claimReadingSession,
  endReadingSession,
  readingSessionOwner,
  readingSessionSnapshot,
} from '../src/quran/readingSession';
import { sessionColorOf } from '../src/quran/SessionDot';
import { mergeKhatmah, mergeQuran } from '../src/sync/merge';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const marker = () => getQuranState().lastRead;
const marks = () => getQuranState().bookmarks;
const only = () => marks()[0];

beforeEach(() => {
  __resetQuranStateForTests();
  _resetReadingSession();
});

/**
 * A bookmark in Al-Baqarah (page 5, ayah 30), following. Returns its id.
 * Found by ayah, not by index — a test that already has a pin of its own
 * would otherwise make THAT one follow.
 */
function followingInBaqarah(): string {
  addBookmark(2, 30, 5, 'emerald');
  const id = marks().find(b => b.surah === 2 && b.ayah === 30)!.id;
  setBookmarkFollows(id, true);
  return id;
}

describe('what was opened owns the turns', () => {
  it('a following bookmark opened from the list takes them, and the marker holds still', () => {
    recordReading({ surah: 67, ayah: 1, page: 562, mode: 'mushaf' }); // last night: Al-Mulk
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    recordReading({ surah: 2, ayah: 50, page: 7, mode: 'mushaf' });
    expect(only().page).toBe(7);
    expect(only().ayah).toBe(50);
    expect(marker()?.page).toBe(562); // Al-Mulk's place is untouched
  });

  it('a fixed bookmark stays put, and the marker does not step in for it', () => {
    // A bookmark IS a kept place. Following decides whether it walks
    // along, not whose visit this is — so a fixed one records nothing
    // and the marker is left exactly where the reader's own reading put
    // it, rather than gaining a duplicate of a place they already have.
    recordReading({ surah: 67, ayah: 1, page: 562, mode: 'mushaf' });
    addBookmark(2, 30, 5, 'emerald', false); // fixed, explicitly
    beginReadingSession({ kind: 'bookmark', id: only().id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(only().page).toBe(5);
    expect(marker()?.page).toBe(562);
  });

  it('coming in through the index, the marker moves and no bookmark does', () => {
    followingInBaqarah();
    beginReadingSession(null);
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(only().page).toBe(5);
    expect(marker()?.page).toBe(6);
  });

  it('two bookmarks on the same page are no problem: you opened one of them', () => {
    addBookmark(2, 30, 5, 'emerald');
    addBookmark(2, 31, 5, 'rose');
    const [a, b] = marks();
    setBookmarkFollows(a.id, true);
    setBookmarkFollows(b.id, true);
    beginReadingSession({ kind: 'bookmark', id: b.id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    const after = new Map(marks().map(m => [m.id, m]));
    expect(after.get(b.id)?.page).toBe(6);
    expect(after.get(a.id)?.page).toBe(5);
  });

  it('nothing owns a visit that has ended', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    endReadingSession();
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(only().page).toBe(5);
    expect(marker()?.page).toBe(6);
  });
});

describe('the index reading’s place survives the other trails', () => {
  // Hassan's rule, stated plainly: the marker is the only record of a
  // reading nobody bookmarked, and resuming something that keeps its own
  // place must never cost the reader that record.
  beforeEach(() => {
    recordReading({ surah: 18, ayah: 1, page: 293, mode: 'mushaf' });
    beginReadingSession(null);
    recordReading({ surah: 18, ayah: 20, page: 294, mode: 'mushaf' });
    endReadingSession();
    expect(marker()?.page).toBe(294);
  });

  it('a following bookmark resumed for a while leaves it alone', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    recordReading({ surah: 2, ayah: 50, page: 7, mode: 'mushaf' });
    expect(only().page).toBe(7);
    expect(marker()?.page).toBe(294);
  });

  it('a fixed bookmark resumed for a while leaves it alone', () => {
    addBookmark(2, 30, 5, 'emerald', false); // fixed, explicitly
    beginReadingSession({ kind: 'bookmark', id: only().id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(only().page).toBe(5);
    expect(marker()?.page).toBe(294);
  });

  it('and the khatmah resumed for a while leaves it alone', () => {
    startKhatmah(30);
    beginReadingSession({ kind: 'khatmah' });
    recordReading({ surah: 2, ayah: 1, page: 2, mode: 'mushaf' });
    expect(marker()?.page).toBe(294);
  });
});

describe('position is the escape hatch, not the rule', () => {
  it('reading the same surah end to end is one reading, however many pages', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 200, page: 31, mode: 'withTranslation' });
    expect(only().page).toBe(31);
  });

  it('the turn that crosses into the next surah is still this reading', () => {
    addBookmark(2, 285, 49, 'emerald');
    setBookmarkFollows(only().id, true);
    beginReadingSession({ kind: 'bookmark', id: only().id });
    recordReading({ surah: 3, ayah: 1, page: 50, mode: 'mushaf' });
    expect(only().surah).toBe(3);
    expect(only().page).toBe(50);
  });

  it('swiping fifty pages to look something up records nothing at all', () => {
    // Reach still stops the bookmark being dragged across the book. What
    // it no longer does is hand the visit to the marker: someone who
    // swiped off to look something up has not started a reading out
    // there, and the marker they DO have is their index reading's place,
    // which this excursion has no business overwriting.
    recordReading({ surah: 67, ayah: 1, page: 562, mode: 'mushaf' });
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 18, ayah: 1, page: 293, mode: 'mushaf' });
    expect(only().page).toBe(5); // stays where it was keeping the place
    expect(marker()?.page).toBe(562); // and last night's place survives
    // The visit is still the bookmark's: it is what was opened, and it
    // is what the reader comes back to when they swipe back.
    expect(readingSessionOwner()).toEqual({ kind: 'bookmark', id });
    recordReading({ surah: 18, ayah: 20, page: 294, mode: 'mushaf' });
    expect(only().page).toBe(5);
    expect(marker()?.page).toBe(562);
  });

  it('and swiping back into reach picks the bookmark up again', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 18, ayah: 1, page: 293, mode: 'mushaf' });
    expect(only().page).toBe(5);
    recordReading({ surah: 2, ayah: 50, page: 7, mode: 'mushaf' });
    expect(only().page).toBe(7);
  });
});

describe('the khatmah keeps deciding for itself, first', () => {
  it('a marker that has left the plan is not dragged back', () => {
    // The rule `recordReading` has always had: a turn onto the plan's
    // pages, while the marker stands elsewhere, is the khatmah's own
    // reading and does not move the marker.
    startKhatmah(30);
    recordReading({ surah: 67, ayah: 1, page: 562, mode: 'mushaf' }); // marker off in Al-Mulk
    beginReadingSession(null);
    recordReading({ surah: 2, ayah: 1, page: 2, mode: 'mushaf' }); // onto the plan's page
    expect(marker()?.page).toBe(562);
  });

  it('but the veto guards the MARKER — it no longer freezes a bookmark', () => {
    // It used to return from the top of the function, so a following
    // bookmark read within two pages of the plan recorded nothing, for a
    // reason that had nothing to do with it. The veto is a rule about
    // the marker, so it is evaluated where the marker is written.
    startKhatmah(30);
    recordReading({ surah: 67, ayah: 1, page: 562, mode: 'mushaf' }); // marker off in Al-Mulk
    addBookmark(1, 1, 1, 'emerald');
    setBookmarkFollows(only().id, true);
    beginReadingSession({ kind: 'bookmark', id: only().id });
    recordReading({ surah: 2, ayah: 1, page: 2, mode: 'mushaf' }); // onto the plan's page
    expect(only().page).toBe(2); // the bookmark took it, as it was opened
    expect(marker()?.page).toBe(562); // and the marker still stands aside
  });

  it('otherwise the opened bookmark takes the turn; the plan is credited on its own path', () => {
    // Khatmah PROGRESS is `recordKhatmahPageTurn`'s, not this function's,
    // so a following bookmark inside the plan's pages moves like any
    // other — the plan's bookkeeping is untouched by it.
    startKhatmah(30);
    addBookmark(1, 1, 1, 'emerald');
    setBookmarkFollows(only().id, true);
    beginReadingSession({ kind: 'bookmark', id: only().id });
    recordReading({ surah: 2, ayah: 1, page: 2, mode: 'mushaf' });
    expect(only().page).toBe(2);
    expect(marker()).toBeNull();
  });
});

describe('handing the visit over mid-way', () => {
  it('switching a bookmark to following while reading claims the turns from here', () => {
    beginReadingSession(null);
    recordReading({ surah: 2, ayah: 20, page: 4, mode: 'mushaf' });
    addBookmark(2, 20, 4, 'emerald'); // mark where I am...
    setBookmarkFollows(only().id, true); // ...and keep tracking
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(only().page).toBe(6);
    expect(marker()?.page).toBe(4);
  });

  it('but flipped from the list with no reader open, it is only a setting', () => {
    const id = followingInBaqarah();
    expect(readingSessionOwner()).toBeNull();
    beginReadingSession(null);
    claimReadingSession({ kind: 'bookmark', id });
    expect(readingSessionOwner()).toEqual({ kind: 'bookmark', id });
  });

  it('tapping one in the reader’s own index hands it the open visit', () => {
    const id = followingInBaqarah();
    beginReadingSession(null);
    claimReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(only().page).toBe(6);
  });

  it('deleting the owner ends its ownership', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    removeBookmark(id);
    expect(readingSessionOwner()).toEqual({ kind: 'reading' });
  });

  it('recolouring a following bookmark keeps it following', () => {
    followingInBaqarah();
    addBookmark(2, 30, 5, 'rose');
    expect(marks()).toHaveLength(1);
    expect(only().color).toBe('rose');
    expect(only().follows).toBe(true);
  });
});

describe('it survives the trip to the other device', () => {
  const at = 1_700_000_000_000;
  const base: QuranBookmark = { id: 'b1', surah: 2, ayah: 30, page: 5, color: 'emerald', createdAt: at };
  const quran = (bookmarks: QuranBookmark[]) =>
    coerceQuranState({ version: 1, lastRead: null, bookmarks, starred: [], khatmah: [], prefs: {} });

  it('the moved copy wins, whichever side it is on', () => {
    const moved = { ...base, page: 9, ayah: 60, follows: true, updatedAt: at + 1000 };
    expect(mergeQuran(quran([base]), quran([moved])).bookmarks[0].page).toBe(9);
    expect(mergeQuran(quran([moved]), quran([base])).bookmarks[0].page).toBe(9);
  });

  it('a bookmark from before any of this existed still merges, and still yields to a newer one', () => {
    // No updatedAt: createdAt stands in, and a later change beats it.
    const later = { ...base, page: 7, updatedAt: at + 5 };
    expect(mergeQuran(quran([base]), quran([later])).bookmarks[0].page).toBe(7);
  });

  it('merging a snapshot with itself returns itself', () => {
    const s = quran([{ ...base, follows: true, updatedAt: at + 1 }]);
    expect(mergeQuran(s, s)).toEqual(s);
    expect(mergeQuran(quran([base]), quran([base]))).toEqual(quran([base]));
  });

  it('coercion writes no key a bookmark never had', () => {
    const b = coerceQuranState({ version: 1, bookmarks: [base] }).bookmarks[0];
    expect('follows' in b).toBe(false);
    expect('updatedAt' in b).toBe(false);
  });
});

describe('a following bookmark is not a mark on an ayah', () => {
  const tintFor = (bookmarks: QuranBookmark[], anchorBookmarkId?: string) =>
    ayahTint({
      selected: null,
      playing: null,
      bookmarks,
      readingPosition: null,
      khatmahPosition: null,
      khatmahTarget: null,
      accentColor: '#123456',
      nightMode: false,
      anchorBookmarkId,
    });

  const following: QuranBookmark = {
    id: 'b', surah: 2, ayah: 1, page: 5, color: 'emerald',
    createdAt: 1, follows: true,
  };

  it('washes nothing once reading has carried it along', () => {
    expect(tintFor([following])(2, 1)).toBeNull();
  });

  it('but IS washed while it is the anchor of the open visit', () => {
    expect(tintFor([following], 'b')(2, 1)).not.toBeNull();
  });

  it('while a fixed pin still does: that one IS an ayah the reader chose', () => {
    const b: QuranBookmark = {
      id: 'b', surah: 2, ayah: 1, page: 5, color: 'emerald', createdAt: 1,
    };
    expect(tintFor([b])(2, 1)).not.toBeNull();
  });
});

describe('bookmarking an ayah mid-session moves the session, not a second mark', () => {
  it('one bookmark, on the ayah that was tapped, still following', () => {
    const id = followingInBaqarah(); // page 5, ayah 30
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    // Reading moved it to the page's first ayah; now the reader taps an
    // ayah and bookmarks it — this is what left two marks in one colour.
    addBookmark(2, 47, 6, 'emerald');
    expect(marks()).toHaveLength(1);
    expect(only().id).toBe(id);
    expect(only().ayah).toBe(47);
    expect(only().follows).toBe(true);
  });

  it('it takes the colour that was tapped', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    addBookmark(2, 47, 5, 'violet');
    expect(marks()).toHaveLength(1);
    expect(only().color).toBe('violet');
  });

  it('and any other pin already on that ayah gives way', () => {
    addBookmark(2, 47, 5, 'rose'); // someone else's pin, on the target ayah
    const id = followingInBaqarah();
    expect(marks()).toHaveLength(2);
    beginReadingSession({ kind: 'bookmark', id });
    addBookmark(2, 47, 5, 'emerald');
    expect(marks()).toHaveLength(1);
    expect(only().id).toBe(id);
    expect(only().ayah).toBe(47);
  });

  it('with no session, bookmarking is what it always was', () => {
    followingInBaqarah();
    addBookmark(18, 1, 293, 'rose');
    expect(marks()).toHaveLength(2);
  });
});

describe('bookmarking an ayah asks reach for itself', () => {
  it('near the session bookmark it is the same place, said precisely', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    addBookmark(2, 47, 6, 'emerald');
    expect(marks()).toHaveLength(1);
    expect(only().ayah).toBe(47);
  });

  it('fifty pages away it is a NEW place', () => {
    // This used to lean on reach having released the session, which no
    // longer happens: a bookmark owns its visit until the visit ends.
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    addBookmark(18, 1, 293, 'amber');
    expect(marks()).toHaveLength(2);
    expect(marks().find(b => b.id === id)?.page).toBe(5);
  });
});

describe('the anchor is drawn when placed, not when carried', () => {
  const anchor = () => readingSessionSnapshot().anchorVisible;

  it('drawn when the visit opens on it', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    expect(anchor()).toBe(true);
  });

  it('gone the moment reading moves it', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(anchor()).toBe(false);
    // ...and stays gone across further pages: it must not reappear under
    // the first line of each one.
    recordReading({ surah: 2, ayah: 50, page: 7, mode: 'mushaf' });
    expect(anchor()).toBe(false);
  });

  it('back when the reader bookmarks an ayah', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(anchor()).toBe(false);
    addBookmark(2, 47, 6, 'emerald');
    expect(anchor()).toBe(true);
  });

  it('back when the bookmark is closed and re-entered', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    endReadingSession();
    expect(anchor()).toBe(false);
    beginReadingSession({ kind: 'bookmark', id });
    expect(anchor()).toBe(true);
  });

  it('never claimed by a visit nothing owns', () => {
    beginReadingSession(null);
    expect(anchor()).toBe(false);
    // Unclaimed is the MARKER's, which is what it always was — the name
    // is new, the behaviour is not. Nothing is drawn: a trail has no ayah.
    expect(readingSessionSnapshot().owner).toEqual({ kind: 'reading' });
  });
});

describe('scrubbing to a page saves progress', () => {
  it('the session bookmark goes to the page, but is NOT drawn there', () => {
    // The reader chose a PAGE. The ayah this lands on is only whichever
    // one the page starts with, and washing it claims they marked a line
    // they never picked — the same noise the wash was taken off page
    // turns to avoid.
    const id = followingInBaqarah(); // page 5
    beginReadingSession({ kind: 'bookmark', id });
    expect(readingSessionSnapshot().anchorVisible).toBe(true);
    moveSessionToPage(100);
    expect(only().page).toBe(100);
    expect(readingSessionSnapshot().anchorVisible).toBe(false);
  });

  it('and a marked ayah put out by a scrub stays out', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    addBookmark(2, 47, 5, 'emerald'); // chosen by hand — drawn
    expect(readingSessionSnapshot().anchorVisible).toBe(true);
    moveSessionToPage(100); // scrubbed away from it
    expect(readingSessionSnapshot().anchorVisible).toBe(false);
  });

  it('and reading on from there keeps being tracked', () => {
    // This is the whole bug: the first turn after a scrub used to fall
    // outside reach, so the session was released and the bookmark froze.
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    moveSessionToPage(100);
    const surahAt100 = only().surah;
    recordReading({ surah: surahAt100, ayah: 1, page: 101, mode: 'mushaf' });
    expect(only().page).toBe(101);
    expect(readingSessionOwner()).toEqual({ kind: 'bookmark', id });
  });

  it('a turn that did not change the page keeps the marked ayah', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    addBookmark(2, 47, 6, 'emerald'); // the reader marks an ayah
    expect(only().ayah).toBe(47);
    // Something re-settles on the SAME page and records the page's first
    // ayah. That used to replace 2:47 with 2:1 and put the wash out.
    recordReading({ surah: 2, ayah: 1, page: 6, mode: 'mushaf' });
    expect(only().ayah).toBe(47);
    expect(readingSessionSnapshot().anchorVisible).toBe(true);
  });

  it('but a real page change still carries it along', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    addBookmark(2, 47, 5, 'emerald');
    recordReading({ surah: 2, ayah: 55, page: 7, mode: 'mushaf' });
    expect(only().page).toBe(7);
    expect(readingSessionSnapshot().anchorVisible).toBe(false);
  });

  it('a fixed pin is not dragged along by a scrub', () => {
    addBookmark(2, 30, 5, 'emerald', false); // fixed, explicitly
    const id = marks()[0].id;
    beginReadingSession({ kind: 'bookmark', id });
    moveSessionToPage(100);
    expect(only().page).toBe(5);
  });

  it('and with nothing owning the visit, a jump still records nothing', () => {
    beginReadingSession(null);
    moveSessionToPage(100);
    expect(marker()).toBeNull();
    expect(marks()).toHaveLength(0);
  });
});

describe('what a new bookmark starts as', () => {
  const setDefault = (v: 'follow' | 'fixed' | 'ask') => setQuranPrefs({ bookmarkFollowDefault: v });

  it('follows on a fresh install, because a bookmark is a place', () => {
    // A star already says "this ayah matters"; a bookmark is where you
    // are, and a place that keeps itself is what a place is for.
    expect(getQuranState().prefs.bookmarkFollowDefault).toBe('follow');
    addBookmark(2, 30, 5, 'emerald');
    expect(only().follows).toBe(true);
  });

  it('but a reader who already had bookmarks keeps fixed pins', () => {
    // Retroactively setting twenty coloured pins walking is not an
    // upgrade. Only a blob with no such field at all takes `fixed`.
    const coerced = coerceQuranState({ version: 1, bookmarks: [] });
    expect(coerced.prefs.bookmarkFollowDefault).toBe('fixed');
  });

  it('stays put when that is the default', () => {
    setDefault('fixed');
    addBookmark(2, 30, 5, 'emerald');
    expect(only().follows).toBeUndefined();
  });

  it('and ask means not yet — a place must never start moving unasked', () => {
    setDefault('ask');
    addBookmark(2, 30, 5, 'emerald');
    expect(only().follows).toBeUndefined();
  });

  it('an explicit choice beats the default, either way', () => {
    setDefault('fixed');
    addBookmark(2, 30, 5, 'emerald', true);
    expect(only().follows).toBe(true);
    setDefault('follow');
    addBookmark(3, 30, 50, 'rose', false);
    expect(marks().find(b => b.surah === 3)?.follows).toBeUndefined();
  });

  it('and recolouring a following bookmark never un-follows it', () => {
    setDefault('fixed');
    addBookmark(2, 30, 5, 'emerald', true);
    addBookmark(2, 30, 5, 'rose');
    expect(only().follows).toBe(true);
    expect(only().color).toBe('rose');
  });

  it('the sheet shows the choice where the bookmark is made', () => {
    // Not a dialog on the way to a bookmark: that taxes the common case
    // to serve the rare one. A line under the colours, one tap, and it
    // changes THIS bookmark rather than the default.
    const sheet = src('src/quran/mushaf/AyahActionSheet.tsx');
    expect(sheet).toMatch(/setBookmarkFollows\(bookmark\.id, !bookmark\.follows\)/);
    expect(sheet).toMatch(/accessibilityRole="switch"/);
    // Emphasised while the reader has asked to be asked.
    expect(sheet).toMatch(/bookmarkFollowDefault === 'ask'/);
  });

  it('and the setting is one segmented control, not three screens', () => {
    const card = src('src/screens/settings/QuranCard.tsx');
    for (const key of ['follow', 'fixed', 'ask']) {
      expect(card).toContain(`key: '${key}'`);
    }
    expect(card).toMatch(/setQuranPrefs\(\{ bookmarkFollowDefault \}\)/);
  });
});

describe('one dot, three trails', () => {
  const owner = () => readingSessionOwner();
  const colour = () => sessionColorOf(owner(), getQuranState().bookmarks);

  it('says nothing with no reader open', () => {
    expect(colour()).toBeNull();
  });

  it('the bookmark’s own colour while it owns the visit', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    expect(colour()).toBe(BOOKMARK_COLORS.emerald);
  });

  it('and nothing once that bookmark stops following mid-visit', () => {
    // Switching it off releases the visit, and the visit does not end —
    // it becomes the marker's, which is what records the turns from
    // here. The dot follows the ownership rather than going out.
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    setBookmarkFollows(id, false);
    // The bookmark keeps the visit — handing it to the marker is what
    // would put a duplicate place on the reader. It just stops walking,
    // so nothing is recording and there is nothing to pulse about.
    expect(owner()).toEqual({ kind: 'bookmark', id });
    expect(colour()).toBeNull();
  });

  it('and nothing for a bookmark owner that is not following at all', () => {
    // Defence for a state the switch above is supposed to prevent: an
    // owner naming a bookmark that no longer follows keeps no reading,
    // so it must not colour a dot claiming that it does.
    const id = followingInBaqarah();
    setBookmarkFollows(id, false);
    expect(sessionColorOf({ kind: 'bookmark', id }, marks())).toBeNull();
    expect(sessionColorOf({ kind: 'bookmark', id: 'gone' }, marks())).toBeNull();
  });

  it('the khatmah’s colour when the plan’s door was the way in', () => {
    beginReadingSession({ kind: 'khatmah' });
    expect(colour()).toBe(KHATMAH_COLOR);
  });

  it('the marker’s colour for every other door', () => {
    // The trail that used to be the only silent one — it takes the turns
    // nobody else claimed, and now it says so while it is doing it.
    beginReadingSession(null);
    expect(colour()).toBe(READING_COLOR);
  });

  it('and keeps the bookmark’s colour when the reading wanders off it', () => {
    // The dot is the visit's OWNER, and reading away from a bookmark no
    // longer changes who owns the visit — it is still what you opened
    // and still where you come back to.
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    expect(colour()).toBe(BOOKMARK_COLORS.emerald);
    recordReading({ surah: 18, ayah: 1, page: 293, mode: 'mushaf' });
    expect(owner()).toEqual({ kind: 'bookmark', id });
    expect(colour()).toBe(BOOKMARK_COLORS.emerald);
  });

  it('the marker’s colour once its owner is deleted mid-visit', () => {
    // The one release left: a bookmark that no longer exists cannot keep
    // a place, so the reading falls to the marker like any other.
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    removeBookmark(id);
    expect(owner()).toEqual({ kind: 'reading' });
    expect(colour()).toBe(READING_COLOR);
  });

  it('and says nothing again once the reader closes', () => {
    beginReadingSession({ kind: 'khatmah' });
    endReadingSession();
    expect(colour()).toBeNull();
  });
});

describe('a recolour keeps the bookmark', () => {
  // It used to make a new one and drop the old — so the visit it owned
  // named a dead id and the marker quietly took over, and the other
  // device still had the old id, so a sync left two bookmarks on one ayah.
  it('same id, same creation, new colour', () => {
    addBookmark(2, 30, 5, 'emerald', false);
    const { id, createdAt } = only();
    addBookmark(2, 30, 5, 'rose');
    expect(only().id).toBe(id);
    expect(only().createdAt).toBe(createdAt);
    expect(only().color).toBe('rose');
    expect(only().updatedAt).toBeGreaterThanOrEqual(createdAt);
  });

  it('so the visit it owns is still its own afterwards', () => {
    addBookmark(2, 30, 5, 'emerald', false);
    const id = only().id;
    beginReadingSession({ kind: 'bookmark', id });
    addBookmark(2, 30, 5, 'rose', false);
    expect(readingSessionOwner()).toEqual({ kind: 'bookmark', id });
    recordReading({ surah: 2, ayah: 40, page: 6, mode: 'mushaf' });
    expect(marker()).toBeNull(); // the marker did not take it
  });

  it('and the other device sees one bookmark, changed, not two', () => {
    addBookmark(2, 30, 5, 'emerald', false);
    const before = getQuranState();
    addBookmark(2, 30, 5, 'rose');
    const after = getQuranState();
    const merged = mergeQuran(before, after);
    expect(merged.bookmarks).toHaveLength(1);
    expect(merged.bookmarks[0].color).toBe('rose');
  });
});

describe('a bookmark made mid-reading takes the visit', () => {
  // Flipping the switch on an existing bookmark already did this; making
  // one already flipped meant the same thing and did not, so the marker
  // kept recording while the new bookmark sat where it was made — two
  // places kept for one reading.
  it('when it follows and the marker had the visit', () => {
    setQuranPrefs({ bookmarkFollowDefault: 'follow' });
    beginReadingSession(null);
    expect(readingSessionOwner()).toEqual({ kind: 'reading' });
    addBookmark(2, 47, 6, 'emerald');
    const id = only().id;
    expect(only().follows).toBe(true);
    expect(readingSessionOwner()).toEqual({ kind: 'bookmark', id });
    // ...and from here the bookmark takes the turns, not the marker.
    recordReading({ surah: 2, ayah: 60, page: 7, mode: 'mushaf' });
    expect(only().page).toBe(7);
    expect(marker()).toBeNull();
  });

  it('but a fixed one leaves the visit alone', () => {
    beginReadingSession(null);
    addBookmark(2, 47, 6, 'emerald', false);
    expect(readingSessionOwner()).toEqual({ kind: 'reading' });
  });

  it('and a khatmah reading is not taken over by a note in it', () => {
    // That reading belongs to the plan; marking an ayah inside it is a
    // note, not a change of what is being read.
    setQuranPrefs({ bookmarkFollowDefault: 'follow' });
    beginReadingSession({ kind: 'khatmah' });
    addBookmark(2, 47, 6, 'emerald');
    expect(only().follows).toBe(true);
    expect(readingSessionOwner()).toEqual({ kind: 'khatmah' });
  });

  it('and one made with no reader open changes no visit', () => {
    setQuranPrefs({ bookmarkFollowDefault: 'follow' });
    addBookmark(2, 47, 6, 'emerald');
    expect(readingSessionOwner()).toBeNull();
  });
});

describe('the verse-by-verse reader gets the dot too', () => {
  const owner = () => readingSessionOwner();
  // It is the reader people use WITH the recitation playing, so it is the
  // one where nothing is touched for twenty minutes and "is this being
  // recorded" is least answerable from the screen.
  it('draws it from the same hook, told which reader it is', () => {
    const screen = src('src/screens/quran/TranslationSurahScreen.tsx');
    expect(screen).toContain("useSessionColor('translation')");
    expect(screen).toMatch(/<SessionDot color=\{sessionColor\}/);
    // Re-issued when the session changes, or a bookmark switched to
    // following mid-reading would not show until the next re-render.
    expect(screen).toMatch(/\}, \[[\s\S]{0,200}sessionColor,/);
  });

  it('a bookmark and the marker are drawn in both readers', () => {
    const id = followingInBaqarah();
    beginReadingSession({ kind: 'bookmark', id });
    expect(sessionColorOf(owner(), marks(), 'translation')).toBe(
      BOOKMARK_COLORS.emerald,
    );
    beginReadingSession(null);
    expect(sessionColorOf(owner(), marks(), 'translation')).toBe(READING_COLOR);
  });

  it('but the khatmah is not, because it is not credited there', () => {
    // Khatmah progress comes from muṣḥaf page turns and nowhere else, by
    // design. A cyan dot in this reader would be the one thing the dot
    // must never be: a claim that the visit is being recorded.
    beginReadingSession({ kind: 'khatmah' });
    expect(sessionColorOf(owner(), marks(), 'mushaf')).toBe(KHATMAH_COLOR);
    expect(sessionColorOf(owner(), marks(), 'translation')).toBeNull();
  });
});

describe('the wiring', () => {
  it('the reader owns the session for exactly its lifetime', () => {
    const screen = src('src/screens/QuranSurahScreen.tsx');
    expect(screen).toMatch(/beginReadingSession\(\s*sessionBookmarkId/);
    expect(screen).toMatch(/return \(\) => endReadingSession\(\)/);
  });

  it('every bookmark door sends its id along, following or not', () => {
    const tab = src('src/screens/QuranScreen.tsx');
    expect(tab).toMatch(/openSurah\(b\.surah, b\.ayah, b\.page, b\.id\)/);
    // The reader's own index claims it unconditionally too — no
    // `if (item.follows)` deciding whose visit it is.
    const sidebar = src('src/quran/MushafIndexSidebar.tsx');
    expect(sidebar).toMatch(/^\s*claimReadingSession\(\{ kind: 'bookmark', id: item\.id \}\);$/m);
  });

  it('both lists carry the switch, over the one preference', () => {
    for (const f of ['src/screens/QuranScreen.tsx', 'src/quran/MushafIndexSidebar.tsx']) {
      const s = src(f);
      expect(s).toMatch(/setBookmarkFollows\((b|item)\.id, next\)/);
    }
  });

  it('the switch says what it is, and the row says which way it is set', () => {
    // A bare track beside a row does not say WHICH of the row's
    // properties it holds, and the off state used to say nothing at all:
    // "following" appeared when on and the line was silent when off.
    for (const f of ['src/screens/QuranScreen.tsx', 'src/quran/MushafIndexSidebar.tsx']) {
      const s = src(f);
      expect(s).toMatch(/t\('quran\.followToggle', 'Follow'\)/);
      expect(s).toMatch(/t\('quran\.followingOn'/);
      expect(s).toMatch(/t\('quran\.followingOff'/);
      // Both arms unconditionally — no `follows ? … : ''`.
      expect(s).not.toMatch(/follows \? ` · \$\{t\('quran\.following'/);
    }
    for (const locale of 'en sv ar bn de es fr hi id ru tr ur zh'.split(' ')) {
      const strings = JSON.parse(
        src(`src/i18n/locales/${locale}.json`),
      ).quran;
      for (const key of ['followToggle', 'followingOn', 'followingOff']) {
        expect(typeof strings[key]).toBe('string');
      }
    }
  });

  it('both headers carry the dot, and only while a session is live', () => {
    const core = src('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/isFullscreen && sessionColor \? \(\s*<SessionDot/);
    const screen = src('src/screens/quran/MushafSurahScreen.tsx');
    expect(screen).toMatch(/\.\.\.\(sessionColor/);
    expect(screen).toMatch(/<SessionDot color=\{sessionColor\}/);
    // Re-issued when the session changes, or a bookmark switched to
    // following mid-reading would not show until the next resize.
    expect(screen).toMatch(/readerTitle,[\s\S]{0,400}sessionColor,/);
  });

  it('the dot pulses on the native driver', () => {
    const dot = src('src/quran/SessionDot.tsx');
    expect(dot).toMatch(/Animated\.loop/);
    expect(dot).not.toMatch(/useNativeDriver: false/);
  });

  it('the anchor reaches the tint AT THE CALL SITE, not just the core', () => {
    // The bug this exists for: the core built `marks` with the anchor in
    // it, and the surface then called `ayahTint` with an explicit field
    // list that left it out — so it was always undefined where it
    // actually mattered, every following bookmark was skipped, and a
    // freshly marked ayah was never washed. Checking the core alone did
    // not catch that; this checks the call site and its dep array.
    const surface = src('src/quran/MushafTextPageSurface.tsx');
    const calls = surface.match(/ayahTint\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/anchorBookmarkId,/);
    // Memoised, so it must also be a dependency or a placed anchor would
    // not redraw until something else changed.
    const deps = surface.match(/\[\s*selected,[\s\S]*?\]/g) ?? [];
    expect(deps.length).toBeGreaterThan(0);
    for (const d of deps) expect(d).toMatch(/anchorBookmarkId,/);
    // And it has to be declared, or the spread from the core drops it.
    expect(surface).toMatch(/anchorBookmarkId\?: string \| null;/);
  });

  it('the scrub anchors the session, and the page marks take the anchor', () => {
    const core = src('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/moveSessionToPage\(clamped, riwayah\)/);
    expect(core).toMatch(/anchorBookmarkId,/);
    // `jumpToPage` still commits a step-0 turn: a jump is not reading.
    expect(core).toMatch(/commitPageTurn\(clamped, clamped\)/);
  });

  it('the session is never persisted', () => {
    expect(src('src/quran/readingSession.ts')).not.toMatch(/AsyncStorage|durable/);
    expect(src('src/sync/snapshot.ts')).not.toMatch(/readingSession/);
  });
});

// Keep the khatmah merge honest alongside: nothing here changed it.
describe('a preference syncs on its own merit', () => {
  // They used to ride on `lastRead.updatedAt`, the only timestamp this
  // store kept: change a setting on the Mac, read on the phone, and the
  // Mac's choice was dropped on the next sync without a word — which is
  // backwards for exactly the settings nobody changes while reading.
  const state = (prefs: Partial<QuranState['prefs']>, at: number, read?: number) => ({
    ...coerceQuranState({ version: 1 }),
    prefs: { ...coerceQuranState({ version: 1 }).prefs, ...prefs },
    ...(at > 0 ? { prefsUpdatedAt: at } : {}),
    ...(read
      ? { lastRead: { surah: 2, ayah: 1, page: 2, mode: 'mushaf' as const, updatedAt: read } }
      : {}),
  });

  it('the newer choice wins, however long ago that device read', () => {
    const mac = state({ reciterId: 'minshawi' }, 2000);
    const phone = state({ reciterId: 'husary' }, 1000, 9999);
    expect(mergeQuran(phone, mac).prefs.reciterId).toBe('minshawi');
    expect(mergeQuran(mac, phone).prefs.reciterId).toBe('minshawi');
  });

  it('and the stamp travels with it', () => {
    const mac = state({ reciterId: 'minshawi' }, 2000);
    const phone = state({ reciterId: 'husary' }, 1000);
    expect(mergeQuran(phone, mac).prefsUpdatedAt).toBe(2000);
    expect(mergeQuran(mac, phone).prefsUpdatedAt).toBe(2000);
  });

  it('writing one stamps it', () => {
    __resetQuranStateForTests();
    expect(getQuranState().prefsUpdatedAt).toBeUndefined();
    setQuranPrefs({ reciterId: 'minshawi' });
    expect(getQuranState().prefsUpdatedAt).toBeGreaterThan(0);
  });

  it('a snapshot with no stamp is judged the old way, so an import still lands', () => {
    // An export from an older build carries no preference time. Reading
    // it as 0 would make importing bring nothing: both sides at 0, the
    // tie keeps local, and the imported choices vanish.
    const imported = state({ reciterId: 'minshawi' }, 0, 5000);
    const fresh = state({}, 0);
    expect(mergeQuran(fresh, imported).prefs.reciterId).toBe('minshawi');
  });

  it('and two unstamped snapshots merge to one that still has no stamp', () => {
    const a = state({ reciterId: 'husary' }, 0);
    expect(mergeQuran(a, a)).toEqual(a);
    expect(mergeQuran(a, a).prefsUpdatedAt).toBeUndefined();
  });

  it('merging a stamped snapshot with itself returns it', () => {
    const a = state({ reciterId: 'minshawi' }, 2000);
    expect(mergeQuran(a, a)).toEqual(a);
  });
});

describe('nothing here touched the khatmah merge', () => {
  it('still unites by id', () => {
    const p = { id: 'k', startedAt: 1, targetDays: 30, pagesRead: 1, completedAt: null };
    expect(mergeKhatmah([p], [])).toHaveLength(1);
  });
});
