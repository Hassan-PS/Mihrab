/**
 * Quran reader state — QR-10/12/19/21 (docs/quran-reader-plan.md).
 *
 * Feature-local persistent store for everything the reader remembers:
 * last-read position, bookmarks, starred ayahs, khatmah plans, and
 * playback/memorization preferences. Deliberately its OWN AsyncStorage
 * blob (`mihrab.quran.v1`) rather than a new field on the settings
 * context — the reader state changes on every page turn and must not
 * re-render every settings consumer in the app.
 *
 * Pattern: module-level in-memory state + subscriber set, exposed to
 * React via `useSyncExternalStore` (see `useQuranState`). All writes are
 * serialized through a mutex like `prayerStorage.ts` so a page-turn
 * write can't race a bookmark write and drop data.
 *
 * Schema is additive-only (same rule as the settings blob).
 */
// tokens-ok: the five bookmark colours and the khatmah marker are a named, user-facing set the reader keys on
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOTAL_AYAHS, ayahAtIndex, ayahIndexOf } from './ayahIndex';
import {
  findPageForAyah,
  firstAyahOfPage,
  totalPagesForRiwayah,
} from './pages';
import { DEFAULT_RIWAYAH, coerceRiwayahId, type RiwayahId } from './riwayat';
import { islamicDayKey } from '../hijri/islamicDay';
import { daysAway } from './khatmahDayWhen';
import {
  daysToDeadline,
  deadlineDayNumber,
  deadlineTotalDays,
  paceCut,
  type KhatmahPace,
} from './khatmahPace';
import {
  addRange,
  applyMarks,
  compactMarks,
  contiguousFrom,
  firstMissingFrom,
  countWithin,
  highestCovered,
  normalizeRanges,
  rangesCover,
  rangesEqual,
  subtractRange,
  type AyahMark,
  type AyahRange,
} from './khatmahDone';
import {
  claimReadingSession,
  noteReadingMoved,
  noteReadingPlaced,
  readingSessionOwner,
  releaseReadingOwner,
} from './readingSession';

/** The Quran blob's key. Exported so the snapshot layer names it once. */
export const QURAN_STORAGE_KEY = 'mihrab.quran.v1';
const STORAGE_KEY = QURAN_STORAGE_KEY;

export type BookmarkColor = 'emerald' | 'sapphire' | 'amber' | 'rose' | 'violet';

export const BOOKMARK_COLORS: Record<BookmarkColor, string> = {
  emerald: '#12805c',
  sapphire: '#2a5db0',
  amber: '#b07d1a',
  rose: '#b03a5b',
  violet: '#6d4bb0',
};

export type QuranBookmark = {
  id: string;
  surah: number;
  ayah: number;
  page: number;
  color: BookmarkColor;
  createdAt: number;
  /**
   * A bookmark that MOVES: it records the reading done from it, instead
   * of staying where it was dropped (issue #54).
   *
   * Off — and absent, for every bookmark made before this existed — it
   * is what a bookmark has always been: a fixed pin. On, it is a place
   * that keeps itself. Open it and read, and the turns are its; leave
   * and come back a week later, and it is where you stopped. It is how a
   * reader keeps a surah read now and then, or a passage under revision,
   * without the evening's Al-Mulk wiping either — see `readingSession`
   * for which of them a turn belongs to.
   */
  follows?: boolean;
  /**
   * When it last changed — moved, recoloured, or switched to following.
   *
   * A bookmark used to be immutable after creation, and the sync merge
   * leaned on that: first copy wins, by id. A bookmark that can move
   * would then move on one device and never on the other, silently —
   * the merge takes the newer of two copies now, and this is what
   * "newer" means. Absent on bookmarks written before this existed;
   * `createdAt` stands in.
   */
  updatedAt?: number;
};

export type LastRead = {
  surah: number;
  ayah: number;
  page: number;
  mode: 'mushaf' | 'withTranslation';
  updatedAt: number;
  /**
   * Set by hand from an ayah's own panel (#41), as opposed to recorded
   * from a page turn or a scroll. A pinned marker is DRAWN in the reader
   * — the wash and the medallion — because the reader put it there on
   * purpose and wants to find it again; a recorded one is not, because it
   * is wherever the reading is, and a mark that rides at the top of every
   * page as it is turned tells the reader nothing. The next stretch of
   * reading moves the marker on and clears this, as reading moves any
   * place along. Additive: absent on every marker written before it.
   */
  pinned?: boolean;
};

export type KhatmahPlan = {
  id: string;
  /** Epoch ms the plan started. */
  startedAt: number;
  /** Goal length in days (e.g. 30). */
  targetDays: number;
  /** Furthest mushaf page completed (0 = none yet). */
  pagesRead: number;
  /** Set when pagesRead reaches 604. */
  completedAt: number | null;
  /**
   * When the reader abandoned this plan — a TOMBSTONE, not a deletion.
   *
   * Dropping the row is what let a paired device bring the plan back:
   * `mergeKhatmah` unites the two sides by id, and a row that is absent
   * locally and present on the other device is indistinguishable from a
   * row the other device has just created. The delete was purely local,
   * so the next sync round put it back — the same bug `removedPeers.ts`
   * describes for devices and `coerceSunnahLog` describes for a cleared
   * day, and the same answer both give: the removal is a fact with a
   * date on it, and it travels.
   *
   * Everything that looks for "the plan I am on" must go through
   * `isLivePlan`, which is the one place that guarantees an abandoned
   * plan reads as gone.
   */
  abandonedAt?: number;
  /**
   * WHICH ayahs the plan has read, as inclusive `[from, to]` index
   * ranges — the authoritative record of progress (issue #54 follow-on).
   *
   * `ayahsRead` and `pagesRead` are a high-water mark, and a mark can
   * only say how FAR. It could not hold "today's portion read out of
   * order", and it had to count pages nobody read whenever a reader
   * skipped forward — the trade `khatmahTracksPage` spells out. This can
   * hold both: a page read is a page done, and a page skipped stays
   * undone however far past it the reader goes.
   *
   * In ayahs for the same reason `ayahsRead` is: a page belongs to one
   * printed muṣḥaf, an ayah belongs to the book. See `khatmahDone`.
   *
   * Absent on plans written before this existed, and on those the
   * high-water mark is converted into a single range — identical
   * behaviour, nothing lost. Both legacy fields go on being written from
   * the CONTIGUOUS run of this set, so a device still on an older build
   * reads exactly what it always read.
   */
  done?: AyahRange[];
  /**
   * DATED CLAIMS, so an un-mark survives the union (additive).
   *
   * `done` merges by union and a union only grows, so it cannot carry
   * "not read": un-mark a page here and the other device's set puts it
   * back on the next merge — the khatmah-delete bug, one level down. The
   * hand-made claims are logged with the time they were made and
   * replayed over the union, so the last thing the reader said about a
   * page wins wherever they said it. See `AyahMark`.
   *
   * Page turns are not logged; they extend `done`, which the union
   * already carries. Only a hand-made claim, and a reading that crosses
   * one, need a date.
   */
  marks?: AyahMark[];
  /**
   * Ḥafṣ pages already behind the reader when the plan was made — the
   * plan covers what FOLLOWS them, cut into `targetDays` portions.
   *
   * Absent or 0 on a khatmah begun at the first page, which is every plan
   * written before this existed and most written since.
   *
   * A reader who is already halfway through a khatmah nobody was tracking
   * (issue #17) has two things to say, and they are different things: how
   * much is already read, and how long the rest should take. Seeding only
   * the progress would leave the portions cut for a book they are not
   * starting — a thirty-day plan begun at page 143 would hand out its
   * first five days to ground already covered and then ask for the last
   * 461 pages in the twenty-five that remain. So the cut moves with the
   * start: 461 pages over thirty days, twenty or so a day, which is what
   * the reader asked for.
   */
  fromPage?: number;
  // ── Additive fields (v2.7.28) ─────────────────────────────────────
  /** Explicit user-pinned position ("I am here"), shown on the mushaf
   *  in the reserved khatmah color. Overrides the derived page. */
  position?: { surah: number; ayah: number; page: number } | null;
  /**
   * WHEN THE PIN WAS LAST SET **OR TAKEN OFF** — because taking it off is
   * a thing the reader did, and it has to travel (reported 2026-09-20).
   *
   * The pin used to merge by "furthest page wins", which cannot express a
   * removal: a cleared pin is a `null`, `null` has no page, and any pin
   * still sitting on the other device beat it — every round. Two symptoms,
   * one cause. The pin the reader took off came back; and since
   * `khatmahCurrentPage` answers with the pinned page while a pin is set,
   * a plan that had been read well past its pin was dragged back to it, so
   * "Continue khatmah" kept opening a page the reader had finished with.
   * Reading past a pin spends it (`position: null` in `recordKhatmahProgress`),
   * which made the second symptom arrive without anyone touching anything.
   *
   * So the pin is a CLAIM with a date on it, like the khatmah's own
   * tombstone and the un-marks beside it: whichever device spoke last
   * wins, and "no pin" is something a device can say. Absent on plans
   * written before this existed; the merge falls back to the old rule
   * only when NEITHER side carries a stamp.
   */
  positionAt?: number;
  /** `pagesRead` snapshot at the start of the local day (yyyy-mm-dd) —
   *  lets "reset today's reading" rewind only today's progress. */
  dayStartPagesRead?: number;
  dayStartDate?: string;
  // ── Additive fields (riwayat) ─────────────────────────────────────
  /**
   * Ayahs read, out of 6236 — the AUTHORITATIVE measure of progress.
   *
   * `pagesRead` is a page count, and a page is a fact about one printed
   * muṣḥaf: page 300 of a Warsh print is not page 300 of a Hafs one.
   * With a second riwayah on screen that number stops meaning one thing,
   * so progress is counted in ayahs, which every riwayah agrees on.
   *
   * Optional because plans written before this existed do not have it;
   * `khatmahAyahsRead` derives it from `pagesRead` for those. `pagesRead`
   * is still written, in HAFS terms, so that older versions and the sync
   * merge — which takes the max of it — keep working across devices.
   */
  ayahsRead?: number;
  /** `ayahsRead` at the start of the local day, mirroring `dayStartPagesRead`. */
  dayStartAyahsRead?: number;
  // ── Additive fields (the deadline plan, issue #53) ────────────────
  /**
   * THE DATE THIS IS MEANT TO BE FINISHED BY — `YYYY-MM-DD`, civil.
   *
   * Absent on every plan made until now, and that absence is the plan's
   * MODE: without it a khatmah is a duration ("finish in thirty days"),
   * cut once when it was made, and it keeps exactly the meaning it has
   * always had. With it the book is re-cut every day over the days that
   * are left, and the day number becomes the calendar's rather than the
   * reader's — see `khatmahPace.ts` for why that reversal is right for
   * one mode and wrong for the other.
   *
   * A date rather than a number of days because it is the promise the
   * reader actually made: "by the 30th" survives a week of not opening
   * the app, where "thirty days from now" quietly becomes a different
   * date every time you recompute it.
   */
  deadline?: string;
  /**
   * When the deadline was last set, changed or taken off.
   *
   * `targetDays` is set once and never edited, which is why the merge can
   * settle it with a `Math.max`. A deadline is not like that: it is moved
   * when a date has passed, and moving it is the whole answer to a plan
   * that has fallen behind. So it is a claim with a date on it, exactly
   * like `positionAt` — newest wins, and "no deadline" is something a
   * device can say.
   */
  deadlineAt?: number;
  /**
   * TODAY'S CUT, pinned when today opened (deadline plans only).
   *
   * The pace is "what is unread over the days that remain", and that
   * question cannot be asked twice in one day without the day receding as
   * you read it — `khatmahPace.ts` has the arithmetic and the reason.
   * Stored rather than derived from `dayStartAyahsRead` because that one
   * is a fact about one device's morning and deliberately does not sync;
   * two devices would pin different mornings and show different quotas
   * for the same day.
   */
  pace?: KhatmahPace;
};

/** Reserved highlight color for the khatmah position (distinct from the
 *  five bookmark colors — cyan, used nowhere else in the reader). */
export const KHATMAH_COLOR = '#0891b2';

/**
 * Reading done BEYOND the day's portion, on the progress bars.
 *
 * Gold rather than another shade of the accent because it is not more of
 * the same thing: the day's own reading is the plan being kept, and this
 * is the reader going further than they undertook to. It never appears in
 * the muṣḥaf itself, where the khatmah speaks in one colour only, so
 * there is nothing for it to be confused with.
 */
export const KHATMAH_EXTRA_COLOR = '#c9a227';

/**
 * The reading marker's colour — issue #41 — reserved like the khatmah's.
 *
 * Terracotta: warm where the khatmah is cool, and unlike every bookmark
 * colour (the amber is golden, the rose is a magenta), so the two
 * trails can be told apart at a glance on a page that carries both. It
 * is drawn as a wash under the ayah AND as the ink of the ayah's own
 * end-medallion, which is what lets it share an ayah with a khatmah mark
 * or a bookmark: the wash yields to theirs, the medallion stays.
 */
export const READING_COLOR = '#c8552b';

export type RepeatSettings = {
  /** Repeat each ayah N times (1 = play once). */
  eachAyah: number;
  /** Repeat the whole selected range N times (1 = play once). */
  range: number;
  /** Extra silence between repeats, as a multiple of the ayah length (0–2). */
  pauseFactor: number;
};

export type QuranPrefs = {
  reciterId: string;
  playbackRate: number;
  /** Mushaf night mode (a repaint on a near-black ground). */
  mushafNightMode: boolean;
  /**
   * Which of the two LIGHT tones the page takes when night is off —
   * additive, see `mushafTone.ts` for why night keeps its own boolean.
   */
  mushafPaperTone: 'paper' | 'sepia';
  /**
   * Follow the app theme — paper when it is light, night when it is dark
   * — instead of a fixed tone (additive; see `mushafTone.ts`). A blob
   * from before the field keeps the fixed tone it held; a fresh install
   * starts here.
   */
  mushafToneAuto: boolean;
  /**
   * Which reading tradition the muṣḥaf is drawn in (additive).
   *
   * A string rather than a boolean because Warsh is the second of five
   * the app may eventually draw, not the other one — see `riwayat.ts`.
   * Stored ids this build cannot draw resolve back to Hafs on read, so a
   * device that syncs `warsh` to one without the data still opens a
   * muṣḥaf.
   */
  riwayah: RiwayahId;
  /**
   * Has the reader been told that a Unicode muṣḥaf reflows? (additive)
   *
   * A `unicode` riwayah gets its page BOUNDARIES from the print and its
   * LINE breaks from the platform, because no open Warsh dataset carries
   * line assignments (`docs/design/riwayat-plan.md` §2). Someone who has
   * memorised where an ayah sits on the page of a physical muṣḥaf will
   * notice, and finding out by being confused is the worst way to learn
   * it. Said once, on the first switch, and then never again.
   */
  riwayahNoticeSeen: boolean;
  /**
   * WHAT A NEW BOOKMARK DOES — follow the reading, or stay put (additive).
   *
   * Two jobs wear one badge. A star already says "this ayah matters to
   * me", so a bookmark is a PLACE, and a place that keeps itself is what
   * a place is for: `follow` is the default because it is what the object
   * means. `fixed` is the old behaviour, for a reader who wants coloured
   * pins and nothing else, and `ask` shows the choice in the ayah sheet
   * the moment a bookmark is made rather than deciding for them.
   *
   * It sets a new bookmark's STARTING state and nothing more — the switch
   * on the bookmark's own row still overrides it, for that bookmark,
   * forever. A blob from before this field takes `fixed`, so nothing a
   * reader already has changes under them.
   */
  bookmarkFollowDefault: 'follow' | 'fixed' | 'ask';
  /**
   * TILĀWAH's coffee cup, and only it (the name predates the split).
   *
   * It used to be both this and the readers' — one flag under two
   * controls, on the reasoning that it is one question. It is not: the
   * coffee cup is reached with the recitation already playing and gets
   * turned off for a session of listening, and that silently took the
   * muṣḥaf's keep-awake with it. Issue #52 asked for the reading one to
   * be answerable "separate from tilawah", and this is what that means.
   */
  keepAwake: boolean;
  /**
   * READING — the muṣḥaf and the verse-by-verse reader. Settings → Quran
   * is its control. Default on, which is the issue's own ask, and a blob
   * without the field takes the default rather than inheriting whatever
   * the coffee cup happened to be left at.
   */
  readerKeepAwake: boolean;
  /** Memorization masking in translation view. */
  hideMode: 'none' | 'arabic' | 'translation';
  repeat: RepeatSettings;
  /** Second row of the Verse-of-the-day card (v2.7.31, additive).
   *  LEGACY as of v2.7.40 — superseded by `companionMode`, kept only so a
   *  downgrade still finds a sensible value. Writers keep it in sync. */
  votdMode: 'translation' | 'tafsir';
  /**
   * THE app-wide companion-text mode (v2.7.40, additive): what renders
   * beneath each ayah everywhere — the translation reader rows, the verse
   * of the day, the mushaf ayah sheet's expanded section, and the daily
   * ayah notification. Seeded from the legacy `votdMode` on first load so
   * an existing "tafsir" choice carries over. Editions per mode:
   * translation → settings.quranTranslationEdition (useActiveEdition),
   * tafsir → `tafsirEditionId` below.
   */
  companionMode: 'translation' | 'tafsir';
  /**
   * Chosen tafsir edition id (v2.8, additive). Empty string = "use the
   * locale default". Persisted here so the pick sticks across ayah-sheet
   * reopens and stays in sync between the Quran page and Settings — the old
   * behaviour kept it in ephemeral component state, so it reverted to the
   * default every time the sheet remounted. Resolve with `resolveTafsirEdition`
   * (which falls back to the locale default when the stored id isn't offered).
   */
  tafsirEditionId: string;
  /**
   * Is the verse-of-the-day card open? (additive)
   *
   * Closed to begin with. The card is four to six lines of Arabic and
   * tafsir sitting between someone and the surah list they came for, and
   * a screen you have to scroll past the same thing on every day is one
   * you stop reading the top of. Open it once and it stays open — the
   * point is that the reader decides, not that we guess right.
   */
  verseOfDayOpen: boolean;
  /**
   * Does one surah lead to a random next one? (additive)
   *
   * A SURAH shuffle, never an ayah shuffle — see `pickNextSurah`. Off by
   * default: reading order is the order the book has.
   */
  shuffleSurahs: boolean;
  /**
   * Does Tilāwah draw the page the recitation is on? (additive)
   *
   * On by default: it is the difference between listening to a voice and
   * following a text, and someone who does not want it turns it off once.
   * The card removes itself when the page's font cannot be had, so a
   * device with no muṣḥaf and no connection is not left staring at a
   * spinner.
   */
  tilawahShowPage: boolean;
};

export type QuranState = {
  version: 1;
  lastRead: LastRead | null;
  bookmarks: QuranBookmark[];
  /** Starred ayah keys, `"surah:ayah"`. */
  starred: string[];
  khatmah: KhatmahPlan[];
  prefs: QuranPrefs;
  /**
   * WHEN THE PREFERENCES LAST CHANGED (additive).
   *
   * They used to ride on `lastRead.updatedAt` — the only timestamp this
   * store kept — so a preference changed on a device that had not read
   * since lost to one that had. Which is the wrong way round for exactly
   * the settings nobody changes while reading: switch New bookmarks on
   * the Mac and the phone's older choice came back on the next sync,
   * silently. A preference is a write, so it gets a write time.
   *
   * Absent on a blob from before the field, which reads as 0 — older
   * than any stamped change, which is the truthful answer: that device
   * has never knowingly chosen.
   */
  prefsUpdatedAt?: number;
  /**
   * BOOKMARKS THE READER TOOK AWAY, with the time they did it.
   *
   * A deleted bookmark used to be an absence, and an absence loses every
   * argument a union has: the other device still had the row, and the
   * merge — which unites by id — could not tell "deleted here" from
   * "made there". So it came back, every round. The same shape as the
   * khatmah plan that resurrected itself (`abandonedAt`), the peer that
   * un-removed itself (`removedPeers.ts`) and the cleared sunnah day, and
   * the same answer: the removal is a fact with a date on it, and it
   * travels.
   *
   * A removal only beats a bookmark OLDER than it, so re-making one —
   * which mints a new id anyway — and editing one on the other device
   * after the delete both survive. Pruned at ninety days by
   * `coerceQuranState`, like every other tombstone here.
   */
  bookmarksRemoved?: Removal[];
  /** Stars the reader took off — same reasoning as `bookmarksRemoved`. */
  starsRemoved?: Removal[];
  /**
   * WHEN EACH STAR WAS PUT ON.
   *
   * `starred` is a bare list of keys merged by union, so it cannot be
   * ordered against a removal on its own: without this, re-starring an
   * ayah after un-starring it on the other device would lose to the
   * older removal for ever. A star made before this field existed reads
   * as 0 — older than any removal, which is the truthful answer for a
   * device that never recorded when it starred anything.
   */
  starsAt?: Record<string, number>;
};

/** Something the reader took away, and when. */
export type Removal = { id: string; at: number };

/** The window a removal has to reach every device — the repo's ninety days. */
export const REMOVAL_TTL_DAYS = 90;
/** At most this many removals travel in the blob, newest kept. */
export const REMOVAL_LIMIT = 256;

/**
 * Both sides' removals, each id once, keeping the LATEST claim for it.
 *
 * Latest rather than earliest: a row removed, re-made and removed again
 * is gone, and the second removal is the one that says so past the
 * re-making. Commutative and idempotent, which is what the merge needs.
 */
export function mergeRemovals(
  a: readonly Removal[] = [],
  b: readonly Removal[] = [],
  now: number = Date.now(),
): Removal[] {
  const byId = new Map<string, number>();
  for (const r of [...a, ...b]) {
    const had = byId.get(r.id);
    if (had === undefined || r.at > had) byId.set(r.id, r.at);
  }
  const cutoff = now - REMOVAL_TTL_DAYS * 24 * 60 * 60 * 1000;
  return [...byId.entries()]
    .filter(([, at]) => at >= cutoff)
    .map(([id, at]) => ({ id, at }))
    .sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1))
    .slice(-REMOVAL_LIMIT);
}

/** A removal newer than the thing it removes wins; anything else loses. */
export function removedAfter(
  removals: readonly Removal[],
  id: string,
  stamp: number,
): boolean {
  const at = removals.find(r => r.id === id)?.at;
  return at !== undefined && at >= stamp;
}

function coerceRemovals(v: unknown): Removal[] {
  if (!Array.isArray(v)) return [];
  const out: Removal[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue;
    out.push({ id: r.id, at: r.at });
  }
  // The same prune the merge does, so a blob on disk cannot grow past
  // what a merge would have kept.
  return mergeRemovals(out, []);
}

export const DEFAULT_QURAN_STATE: QuranState = {
  version: 1,
  lastRead: null,
  bookmarks: [],
  starred: [],
  khatmah: [],
  prefs: {
    reciterId: 'husary',
    playbackRate: 1,
    mushafNightMode: false,
    mushafPaperTone: 'paper',
    mushafToneAuto: true,
    riwayah: DEFAULT_RIWAYAH,
    riwayahNoticeSeen: false,
    bookmarkFollowDefault: 'follow',
    keepAwake: true,
    readerKeepAwake: true,
    hideMode: 'none',
    repeat: { eachAyah: 1, range: 1, pauseFactor: 0 },
    votdMode: 'translation',
    companionMode: 'translation',
    tafsirEditionId: '',
    verseOfDayOpen: false,
    shuffleSurahs: false,
    tilawahShowPage: true,
  },
};

let state: QuranState = DEFAULT_QURAN_STATE;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

// Serialize writes: each setItem awaits the previous one (prayerStorage
// pattern) so concurrent updates can't interleave stale snapshots.
let writeMutex: Promise<void> = Promise.resolve();

function emit(): void {
  for (const l of listeners) l();
}

const VALID_BOOKMARK_COLORS = new Set<string>(Object.keys(BOOKMARK_COLORS));

function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n >= min && n <= max ? n : null;
}

function coerceBookmark(v: unknown): QuranBookmark | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const surah = int(r.surah, 1, 114);
  const ayah = int(r.ayah, 1, 286);
  const page = int(r.page, 1, 604);
  if (surah === null || ayah === null || page === null) return null;
  if (typeof r.id !== 'string' || !r.id) return null;
  const color =
    typeof r.color === 'string' && VALID_BOOKMARK_COLORS.has(r.color)
      ? (r.color as BookmarkColor)
      : 'emerald';
  const createdAt =
    typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
      ? r.createdAt
      : 0;
  const out: QuranBookmark = { id: r.id, surah, ayah, page, color, createdAt };
  // Only when set: a key written onto a bookmark that never had it makes
  // a snapshot merged with itself stop equalling itself.
  if (r.follows === true) out.follows = true;
  if (typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)) {
    out.updatedAt = r.updatedAt;
  }
  return out;
}

function coerceKhatmah(v: unknown): KhatmahPlan | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const startedAt =
    typeof r.startedAt === 'number' && Number.isFinite(r.startedAt)
      ? r.startedAt
      : 0;
  const targetDays = int(r.targetDays, 1, 3650) ?? 30;
  // CLAMPED, not rejected. `pagesRead` is a high-water mark of someone's
  // reading; an out-of-range value is a bad number, but resetting it to 0
  // would throw away the progress it was reporting. 604 is the mushaf.
  const pagesRead =
    typeof r.pagesRead === 'number' && Number.isFinite(r.pagesRead)
      ? Math.min(604, Math.max(0, Math.floor(r.pagesRead)))
      : 0;
  const completedAt =
    typeof r.completedAt === 'number' && Number.isFinite(r.completedAt)
      ? r.completedAt
      : null;
  const abandonedAt =
    typeof r.abandonedAt === 'number' && Number.isFinite(r.abandonedAt)
      ? r.abandonedAt
      : null;
  // Expired tombstones are dropped rather than carried: past the TTL the
  // plan is gone everywhere and the row is pure weight in every sealed
  // file. `coerceSunnahLog` prunes on exactly this reasoning.
  if (
    abandonedAt != null &&
    Date.now() - abandonedAt > KHATMAH_TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  const out: KhatmahPlan = {
    id: r.id,
    startedAt,
    targetDays,
    pagesRead,
    completedAt,
  };
  if (abandonedAt != null) out.abandonedAt = abandonedAt;
  const p = r.position;
  if (p && typeof p === 'object') {
    const surah = int((p as Record<string, unknown>).surah, 1, 114);
    const ayah = int((p as Record<string, unknown>).ayah, 1, 286);
    const page = int((p as Record<string, unknown>).page, 1, 604);
    if (surah !== null && ayah !== null && page !== null) {
      out.position = { surah, ayah, page };
    }
  }
  /**
   * Kept even when the pin itself is gone — that pairing IS the claim
   * "there is no pin, and here is when I said so". A stamp with no
   * position is what a cleared pin looks like on the wire, and dropping
   * it would put the pin back on the next merge. See `positionAt`.
   */
  if (typeof r.positionAt === 'number' && Number.isFinite(r.positionAt)) {
    out.positionAt = r.positionAt;
  }
  // One short of the book: see `planFrom`.
  const fp = int(r.fromPage, 0, 603);
  if (fp !== null && fp > 0) out.fromPage = fp;
  const dsp = int(r.dayStartPagesRead, 0, 604);
  if (dsp !== null) out.dayStartPagesRead = dsp;
  // Clamped to the ayah count for the same reason `pagesRead` is clamped
  // to the page count: a bad number is still someone's reading.
  const ar = int(r.ayahsRead, 0, TOTAL_AYAHS);
  if (ar !== null) out.ayahsRead = ar;
  const dsa = int(r.dayStartAyahsRead, 0, TOTAL_AYAHS);
  if (dsa !== null) out.dayStartAyahsRead = dsa;
  if (Array.isArray(r.done)) {
    const ranges = normalizeRanges(r.done as AyahRange[], TOTAL_AYAHS);
    if (ranges.length > 0) out.done = ranges;
  }
  if (Array.isArray(r.marks)) {
    const cutoff =
      Date.now() - KHATMAH_TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const marks = (r.marks as unknown[])
      .map(m => coerceMark(m))
      .filter((m): m is AyahMark => m !== null)
      // The same ninety days the other tombstones keep. A claim older
      // than that has had every chance to reach every device.
      .filter(m => m[2] >= cutoff)
      .sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    // Resolved as it is read, so a log that arrived from a merge — two
    // devices' claims unioned, overlapping — is stored as the verdicts it
    // amounts to. The cap is a backstop behind that; see `compactMarks`.
    const compacted = compactMarks(marks, TOTAL_AYAHS).slice(-KHATMAH_MARK_LIMIT);
    if (compacted.length > 0) out.marks = compacted;
  }
  if (typeof r.dayStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dayStartDate)) {
    out.dayStartDate = r.dayStartDate;
  }
  /**
   * The deadline and its stamp travel together, and the stamp survives a
   * deadline that has been taken OFF — that pairing is the claim "this
   * plan has no date any more, and here is when I said so", exactly as a
   * cleared pin is a `positionAt` with no position.
   */
  if (typeof r.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline)) {
    out.deadline = r.deadline;
  }
  if (typeof r.deadlineAt === 'number' && Number.isFinite(r.deadlineAt)) {
    out.deadlineAt = r.deadlineAt;
  }
  // The day's cut, and only on a plan that still has a date to pace
  // against — a stale one on a duration plan would be read by nothing and
  // synced by everything.
  if (out.deadline && r.pace && typeof r.pace === 'object') {
    const pc = r.pace as Record<string, unknown>;
    const day = typeof pc.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pc.day)
      ? pc.day
      : null;
    const from = int(pc.from, 1, TOTAL_AYAHS);
    const to = int(pc.to, 1, TOTAL_AYAHS);
    if (day !== null && from !== null && to !== null && to >= from) {
      out.pace = { day, from, to };
    }
  }
  return out;
}

/** At most this many claims travel with a plan — newest kept. */
const KHATMAH_MARK_LIMIT = 128;

function coerceMark(v: unknown): AyahMark | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const [from, to, at, read] = v as unknown[];
  const ok = (n: unknown, lo: number, hi: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
      ? Math.trunc(n)
      : null;
  const f = ok(from, 1, TOTAL_AYAHS);
  const t = ok(to, 1, TOTAL_AYAHS);
  const a = ok(at, 1, Number.MAX_SAFE_INTEGER);
  if (f === null || t === null || a === null || t < f) return null;
  return [f, t, a, read === 1 ? 1 : 0];
}

function coerceLastRead(v: unknown): LastRead | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const surah = int(r.surah, 1, 114);
  const ayah = int(r.ayah, 1, 286);
  const page = int(r.page, 1, 604);
  if (surah === null || ayah === null || page === null) return null;
  return {
    surah,
    ayah,
    page,
    mode: r.mode === 'mushaf' ? 'mushaf' : 'withTranslation',
    updatedAt:
      typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)
        ? r.updatedAt
        : 0,
    ...(r.pinned === true ? { pinned: true } : {}),
  };
}

/**
 * Validate a Quran blob item by item.
 *
 * This used to be a shallow merge that trusted any array it found, which was
 * defensible while the only writer was this app's own store. It is not
 * defensible now that the same shape arrives from an exported file or
 * another device: a bookmark pointing at page 9000, or a khatmah claiming
 * 700 pages read, would be written straight back to disk and then drawn.
 * Every field is range-checked against the mushaf it has to index into, and
 * an item that cannot be repaired is dropped rather than kept as a
 * half-object nothing downstream expects.
 */
export function coerceQuranState(raw: unknown): QuranState {
  return mergeStored(raw);
}

/**
 * A stored `bookmarkFollowDefault`, or `fixed` for a blob without one.
 *
 * The default in `DEFAULT_QURAN_STATE` is `follow`, which is right for a
 * fresh install and wrong to apply retroactively: a reader with twenty
 * coloured pins did not ask for them to start walking.
 */
function coerceFollowDefault(v: unknown): QuranPrefs['bookmarkFollowDefault'] {
  return v === 'follow' || v === 'ask' ? v : 'fixed';
}

/** Merge a possibly-older stored blob over the defaults (additive schema). */
function mergeStored(raw: unknown): QuranState {
  if (!raw || typeof raw !== 'object') return DEFAULT_QURAN_STATE;
  const r = raw as Partial<QuranState>;
  const removedBookmarks = coerceRemovals(r.bookmarksRemoved);
  const removedStars = coerceRemovals(r.starsRemoved);
  const starsAt: Record<string, number> = {};
  if (r.starsAt && typeof r.starsAt === 'object') {
    for (const [k, v] of Object.entries(r.starsAt as Record<string, unknown>)) {
      if (!/^\d{1,3}:\d{1,3}$/.test(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) starsAt[k] = v;
    }
  }
  const keptStars = Array.isArray(r.starred)
    ? new Set(
        [
          ...new Set(
            r.starred.filter(
              (k): k is string =>
                typeof k === 'string' && /^\d{1,3}:\d{1,3}$/.test(k),
            ),
          ),
        ].filter(k => !removedAfter(removedStars, k, starsAt[k] ?? 0)),
      )
    : new Set<string>();
  const liveStarsAt: Record<string, number> = {};
  for (const [k, at] of Object.entries(starsAt)) {
    if (keptStars.has(k)) liveStarsAt[k] = at;
  }
  return {
    version: 1,
    lastRead: coerceLastRead(r.lastRead),
    bookmarks: Array.isArray(r.bookmarks)
      ? r.bookmarks
          .map(coerceBookmark)
          .filter((b): b is QuranBookmark => b !== null)
          // A bookmark a tombstone has already buried never comes back
          // out of the blob, whichever order the two were written in.
          .filter(b => !removedAfter(removedBookmarks, b.id, b.updatedAt ?? b.createdAt))
      : [],
    starred: Array.isArray(r.starred)
      ? [
          ...new Set(
            r.starred.filter(
              (s): s is string =>
                typeof s === 'string' && /^\d{1,3}:\d{1,3}$/.test(s),
            ),
          ),
        ].filter(k => keptStars.has(k))
      : [],
    khatmah: Array.isArray(r.khatmah)
      ? r.khatmah.map(coerceKhatmah).filter((k): k is KhatmahPlan => k !== null)
      : [],
    prefs: {
      ...DEFAULT_QURAN_STATE.prefs,
      ...(r.prefs ?? {}),
      // Coerced, NOT resolved. An unknown id becomes Hafs, but a known
      // one is kept whether or not this device currently has its data —
      // the muṣḥaf is read from disk asynchronously and may not have
      // arrived yet, and resolving here would quietly overwrite the
      // reader's choice with Hafs on the next preference write. See
      // `coerceRiwayahId`.
      riwayah: coerceRiwayahId(
        (r.prefs as Record<string, unknown> | undefined)?.riwayah as
          | string
          | undefined,
      ),
      repeat: {
        ...DEFAULT_QURAN_STATE.prefs.repeat,
        ...(r.prefs?.repeat ?? {}),
      },
      // Migration (v2.7.40): blobs written before `companionMode` existed
      // seed it from the legacy votd-only toggle so a "tafsir" choice on
      // the verse-of-the-day card carries over to the app-wide mode.
      companionMode:
        r.prefs?.companionMode ??
        r.prefs?.votdMode ??
        DEFAULT_QURAN_STATE.prefs.companionMode,
      // Anything but the one other light tone is paper — a blob from
      // before the field existed, or a value no build has written.
      mushafPaperTone:
        (r.prefs as { mushafPaperTone?: unknown } | undefined)
          ?.mushafPaperTone === 'sepia'
          ? 'sepia'
          : 'paper',
      // Only an explicit true is auto: a blob written before the field
      // existed chose a tone, and keeps it.
      mushafToneAuto:
        (r.prefs as { mushafToneAuto?: unknown } | undefined)?.mushafToneAuto === true,
      // A blob from before the field keeps the behaviour it had: fixed
      // pins. Only a fresh install gets the default above.
      bookmarkFollowDefault: coerceFollowDefault(
        (r.prefs as { bookmarkFollowDefault?: unknown } | undefined)
          ?.bookmarkFollowDefault,
      ),
      // On unless it was explicitly turned off, and the old shared flag
      // is NOT consulted: a coffee cup switched off during Tilāwah was
      // never a decision about the muṣḥaf.
      readerKeepAwake:
        (r.prefs as { readerKeepAwake?: unknown } | undefined)
          ?.readerKeepAwake !== false,
    },
    // Kept if it is there and sane, and LEFT OUT otherwise rather than
    // written as 0: an export of a blob that never had it must round-trip
    // to itself, key for key.
    ...(typeof r.prefsUpdatedAt === 'number' && r.prefsUpdatedAt > 0
      ? { prefsUpdatedAt: r.prefsUpdatedAt }
      : {}),
    // Same rule for the tombstones: present when there are any, absent
    // when there are none, so a blob that never removed anything stays
    // exactly the blob it was.
    ...(removedBookmarks.length > 0 ? { bookmarksRemoved: removedBookmarks } : {}),
    ...(removedStars.length > 0 ? { starsRemoved: removedStars } : {}),
    // A stamp for a star that is not there says nothing, and a blob that
    // holds one does not survive a merge unchanged — the merge prunes it,
    // so the store has to as well or `merge(a, a) === a` fails on a state
    // only the disk can hold. Caught by the fuzz in
    // `syncMergeProperties.test.ts`.
    ...(Object.keys(liveStarsAt).length > 0 ? { starsAt: liveStarsAt } : {}),
  };
}

/** Load the blob once. Safe to call repeatedly. */
export function hydrateQuranState(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) state = mergeStored(JSON.parse(raw));
    } catch (e) {
      console.warn('quranState: hydrate failed, using defaults', e);
    } finally {
      hydrated = true;
      emit();
    }
  })();
  return hydrating;
}

/**
 * Adopt a blob the caller has just written to disk itself.
 *
 * Backup restore writes `mihrab.quran.v1` straight to AsyncStorage, because
 * it is merging whole categories rather than making one edit. That left this
 * module holding the pre-restore state with `hydrated` already true — so
 * `hydrateQuranState()` no-opped, every reader kept the old value, and the
 * widget's reading block described a position the user had just replaced.
 * It corrected itself on the next process start, which is not a thing a
 * restore should require.
 *
 * Deliberately does NOT persist: the caller wrote it, and writing it back
 * would race their write with ours over the same key.
 */
export function primeQuranState(raw: unknown): void {
  state = mergeStored(raw);
  hydrated = true;
  emit();
}

/**
 * Set while a write is queued for the end of the current tick, so a burst of
 * updates lands on disk as ONE write of the state they left behind.
 *
 * A page turn is two updates — the last-read position, then the khatmah's
 * progress — and each used to serialise the whole store and hand it to
 * AsyncStorage on its own. The second write carried everything the first
 * had, a tick later. Deferring to a microtask keeps every update visible to
 * readers immediately (`emit` is synchronous, above) and coalesces the
 * writes; anything `await`ed, which is everything that reads the store back,
 * runs after the flush.
 */
let persistQueued = false;

function persist(): void {
  if (persistQueued) return;
  persistQueued = true;
  void Promise.resolve().then(() => {
    persistQueued = false;
    const snapshot = state;
    writeMutex = writeMutex
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)))
      .catch(e => {
        console.warn('quranState: persist failed', e);
      });
  });
}

export function getQuranState(): QuranState {
  return state;
}

export function updateQuranState(
  updater: (prev: QuranState) => QuranState,
): void {
  state = updater(state);
  emit();
  persist();
}

export function subscribeQuranState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — subscribes narrowly via useSyncExternalStore. */
export function useQuranState(): QuranState {
  return useSyncExternalStore(subscribeQuranState, getQuranState, getQuranState);
}

/**
 * Whether the stored blob has been read yet.
 *
 * Until it has, every reader of this store is being served DEFAULTS, and the
 * one that shows is `mushafNightMode: false` — so a reader opened before the
 * read completes paints its page pure white and then flips to #101010 once the
 * real preference lands. On a phone that is a frame nobody sees; on a 5K Mac
 * window it is a full-screen white flash, which is what this exists to let the
 * reader avoid. Anything whose colour depends on a stored preference should
 * wait for this rather than render a default it is about to contradict.
 */
export function isQuranHydrated(): boolean {
  return hydrated;
}

export function useQuranHydrated(): boolean {
  return useSyncExternalStore(
    subscribeQuranState,
    isQuranHydrated,
    isQuranHydrated,
  );
}

// ── Convenience mutations ────────────────────────────────────────────

export function setLastRead(pos: Omit<LastRead, 'updatedAt'>): void {
  updateQuranState(prev => ({
    ...prev,
    lastRead: { ...pos, updatedAt: Date.now() },
  }));
}

/**
 * How near a page has to be to the khatmah's own page to be its reading.
 *
 * Two, not one: a spread turns two pages at a time, and a turn that lands
 * two ahead of the plan's page is the plan being read on an iPad, not a
 * reader who went somewhere else.
 */
const KHATMAH_PAGE_REACH = 2;

/**
 * Is this page where the khatmah is being read — the plan's own next
 * page, or the one beside it?
 *
 * Narrower than `khatmahTracksPage`, and on purpose: that answers "does
 * reading here count towards the plan", and it says yes to every page
 * behind the frontier because re-reading is still the khatmah's ground.
 * This answers "is the reader on the khatmah's page RIGHT NOW", which is
 * what decides whether the reading marker (below) should follow them.
 * A page well behind the frontier is not the khatmah's reading; it is
 * someone reading Al-Baqarah on a Tuesday while their plan sits in juz
 * twenty, and that is exactly the reading the marker is for.
 */
export function isKhatmahPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  s: QuranState = getQuranState(),
): boolean {
  const plan = activeKhatmah(s);
  if (!plan) return false;
  return Math.abs(page - khatmahCurrentPage(plan, riwayah)) <= KHATMAH_PAGE_REACH;
}

/**
 * Record where the reader is — issue #41.
 *
 * ── TWO TRAILS THROUGH ONE BOOK ───────────────────────────────────────
 *
 * `lastRead` is the reading marker: the place "Continue reading" hands
 * back. A khatmah is a second trail with its own marker (the plan's next
 * page, `khatmahContinueTarget`), and a reader can walk both — the plan
 * in the morning, Al-Kahf on a Friday — which is a thing this store used
 * to make impossible: every page turn wrote `lastRead`, so an evening in
 * the khatmah erased the afternoon's place in Al-Kahf, and the marker
 * was never more than "the last page looked at".
 *
 * There are three trails now, not two — a khatmah, any number of
 * bookmarks, and the marker — and the marker is the one that takes what
 * the others did not claim. Each of the two rules that hold it back is
 * written at the point it applies, below: a bookmark visit records no
 * marker at all, and the khatmah vetoes a marker that was not already
 * riding with the plan.
 */
export function recordReading(
  pos: Omit<LastRead, 'updatedAt' | 'pinned'>,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  const prev = getQuranState();
  const owner = readingSessionOwner();

  /**
   * ── A BOOKMARK VISIT IS NOT THE MARKER'S TO RECORD ────────────────
   *
   * Whatever was opened owns the turns — see `readingSession` for why
   * proximity cannot be the rule once there is more than one bookmark.
   * What follows from that, and is the whole of this branch: while a
   * bookmark owns the visit the marker does not move AT ALL.
   *
   * A bookmark IS a kept place, so a second marker trailing the same
   * reading is a duplicate of a thing the reader already has — and
   * worse, it is a duplicate that destroys something: the marker it
   * overwrites is where that reader was when they were reading from the
   * index, which is the one place nothing else remembers. Resuming a
   * bookmark for ten minutes must not cost them that.
   *
   * So neither following mode matters here. A following bookmark walks
   * with the reading; a fixed one stays where it was pinned; and in both
   * cases the marker is left alone, because in both cases the place is
   * already kept by the thing that was opened.
   *
   * Reading away from it records NOTHING, which is the honest answer:
   * someone who swipes off to look something up has not started a
   * reading anywhere, and the bookmark is not dragged after them
   * (`withinBookmarkReach`). To keep a place out there, open it from the
   * index — that visit is the marker's — or bookmark it.
   */
  if (owner?.kind === 'bookmark') {
    const b = prev.bookmarks.find(x => x.id === owner.id);
    if (b) {
      /**
       * A TURN THAT DID NOT CHANGE THE PAGE MOVES NOTHING.
       *
       * `recordReading` is given the page's FIRST ayah, so a recorded
       * turn that lands on the page the bookmark is already on would
       * rewrite a deliberately marked ayah — the reader picks 2:47,
       * something re-settles on the same page, and the bookmark says
       * 2:1 instead. There is no reading to record in that case, and
       * the precise ayah is worth more than the page start it would be
       * replaced with. It also keeps the anchor drawn, which a rewrite
       * would have quietly put out.
       */
      if (b.follows && withinBookmarkReach(b, pos) && pos.page !== b.page) {
        moveBookmark(b.id, pos);
        // Carried along by reading, so it stops being drawn: the wash
        // would otherwise reappear under the first line of every page
        // turned to, which is not a place anybody marked.
        noteReadingMoved();
      }
      return;
    }
    // Deleted mid-visit: there is no kept place any more, so the turns
    // fall to the marker like any other reading.
  }

  /**
   * ── THE KHATMAH'S VETO, WHICH GUARDS THE MARKER AND NOTHING ELSE ──
   *
   * A muṣḥaf page within reach of the plan's page leaves the marker
   * where it is, UNLESS the marker was already riding with the plan, in
   * which case it comes along. That second clause is what keeps a reader
   * with one trail exactly where they were: every marker written before
   * this existed sits on the plan's page, and a marker that stopped
   * following would have looked like a lost place. The moment such a
   * reader reads somewhere else, the marker detaches and becomes theirs;
   * the moment it is theirs, the khatmah cannot take it back.
   *
   * It is evaluated HERE, after the bookmark branch, because it is a
   * rule about the marker. It used to return from the top of the
   * function, which also froze a following bookmark that happened to be
   * read within two pages of the plan — a bookmark session silently
   * recording nothing, for a reason that had nothing to do with it.
   *
   * Translation mode always writes. Khatmah progress is credited from
   * muṣḥaf page turns and nowhere else, so a plan read in translation
   * never advances on its own — and a marker that refused to follow that
   * reading would be a place lost with nothing to point at it instead.
   */
  const marker = prev.lastRead;
  if (
    pos.mode === 'mushaf' &&
    marker &&
    isKhatmahPage(pos.page, riwayah, prev) &&
    !isKhatmahPage(marker.page, riwayah, prev)
  ) {
    return;
  }
  // Reading moves the place along, pinned or not; a pin is a correction
  // of where the marker stands, never a bookmark (those exist).
  setLastRead(pos);
}

/**
 * Pin the reading marker to an ayah by hand — the counterpart of
 * `setKhatmahPosition` for the other trail. From an ayah's own panel,
 * so a reader can say "I am here" about a place the page turns did not
 * record: a translation row scrolled past, or a muṣḥaf page whose first
 * ayah is not where they stopped.
 */
export function setReadingPosition(
  surah: number,
  ayah: number,
  page: number,
  mode: LastRead['mode'],
): void {
  setLastRead({ surah, ayah, page, mode, pinned: true });
}

/**
 * The marker as something to DRAW, or null.
 *
 * Only a pinned marker is drawn — see `LastRead.pinned`. The readers
 * ask this rather than reading `lastRead` themselves so that the rule
 * lives in one place and a mark never appears for a reader who did
 * nothing but turn the page.
 */
export function drawnReadingPosition(
  s: QuranState,
): { surah: number; ayah: number } | null {
  const m = s.lastRead;
  return m?.pinned ? { surah: m.surah, ayah: m.ayah } : null;
}

/** Whether the reading marker sits on this ayah, pinned or recorded. */
export function isReadingHere(s: QuranState, surah: number, ayah: number): boolean {
  return s.lastRead?.surah === surah && s.lastRead?.ayah === ayah;
}

/**
 * Where "Continue reading" leads, or null when there is no such place —
 * because nothing has been read, or because the marker is riding with
 * the khatmah and the khatmah's own offer already leads there. Two rows
 * to one page is one row too many; the plan's is the stronger claim.
 */
export function readingContinueTarget(
  s: QuranState,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): LastRead | null {
  const marker = s.lastRead;
  if (!marker) return null;
  // The same reach `recordReading` uses, so the two agree about what
  // "riding with the plan" means; a marker the khatmah would carry along
  // is a marker the khatmah's own row already speaks for.
  if (isKhatmahPage(marker.page, riwayah, s)) return null;
  return marker;
}

export function ayahKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function toggleStar(surah: number, ayah: number): void {
  const key = ayahKey(surah, ayah);
  updateQuranState(prev => {
    const on = prev.starred.includes(key);
    /**
     * BOTH HALVES OF THE TOGGLE ARE DATED (see `starsRemoved`).
     *
     * The list of stars merges by union, and a union cannot say "not
     * starred": take a star off here and the other device's list put it
     * straight back. The removal is a dated fact now — and so is the
     * star itself, or re-starring an ayah would lose to the removal it
     * came after, for ever.
     *
     * One clock for the pair, nudged past whichever of the two is newer,
     * so a star and the un-star of it cannot land on the same
     * millisecond and be replayed in the wrong order elsewhere.
     */
    const at = Math.max(
      Date.now(),
      (prev.starsAt?.[key] ?? 0) + 1,
      (prev.starsRemoved?.find(r => r.id === key)?.at ?? 0) + 1,
    );
    const starsAt = { ...(prev.starsAt ?? {}) };
    if (on) delete starsAt[key];
    else starsAt[key] = at;
    return {
      ...prev,
      starred: on ? prev.starred.filter(k => k !== key) : [...prev.starred, key],
      ...(Object.keys(starsAt).length > 0 ? { starsAt } : {}),
      ...(on
        ? { starsRemoved: mergeRemovals(prev.starsRemoved, [{ id: key, at }]) }
        : prev.starsRemoved
          ? { starsRemoved: prev.starsRemoved.filter(r => r.id !== key) }
          : {}),
    };
  });
}

export function isStarred(s: QuranState, surah: number, ayah: number): boolean {
  return s.starred.includes(ayahKey(surah, ayah));
}

/**
 * A change stamp later than the bookmark's last one.
 *
 * The merge keeps whichever copy is NEWER, by strict comparison, and the
 * wall clock is too coarse to order two changes made here in the same
 * millisecond — create and recolour, or two switch flips — so the later
 * could lose to the earlier on the other device. One past the last stamp
 * is later than it and still a time the other device can compare.
 */
function stampAfter(b: QuranBookmark): number {
  return Math.max(Date.now(), (b.updatedAt ?? b.createdAt) + 1);
}

export function addBookmark(
  surah: number,
  ayah: number,
  page: number,
  color: BookmarkColor,
  /**
   * Whether the new bookmark follows the reading. Omitted means "what the
   * reader's default says" — `ask` counts as not following until they say
   * otherwise, because a place that moves without being asked for is
   * worse than one that does not move.
   */
  follows?: boolean,
): void {
  /**
   * BOOKMARKING AN AYAH DURING A FOLLOWING SESSION MOVES THAT BOOKMARK,
   * rather than leaving a second one behind (issue #54).
   *
   * Reported from the device: open a following bookmark, read on a few
   * pages, tap an ayah and bookmark it — and you left the muṣḥaf with TWO
   * bookmarks in the same colour, one on the ayah you chose and one where
   * the following bookmark had got to. Two marks for one place, and no way
   * to tell which was which.
   *
   * The gesture means "my place is here", which is what a following
   * bookmark is for; it is the same reading, said precisely. The bookmark
   * takes the ayah and the colour that was tapped, keeps `createdAt` so it
   * stays where it was in the list, and any other pin already on that ayah
   * gives way — one bookmark per ayah, as before.
   *
   * It asks reach for itself. It used to lean on `recordReading` having
   * released the session once the reading went far enough, which is no
   * longer something that happens — a bookmark owns its visit until the
   * visit ends. Bookmarking an ayah fifty pages away is a NEW place, not
   * this one said precisely, so the reach that decides whether reading
   * moves the bookmark decides this too.
   */
  const owner = readingSessionOwner();
  if (owner?.kind === 'bookmark') {
    const session = getQuranState().bookmarks.find(b => b.id === owner.id);
    if (session?.follows && withinBookmarkReach(session, { surah, page })) {
      const at = stampAfter(session);
      updateQuranState(prev => {
        // A pin that gave way is a pin the reader no longer has, and on
        // the other device it is still there — one bookmark per ayah has
        // to be true after the sync too, not just here. See
        // `bookmarksRemoved`.
        const gaveWay = prev.bookmarks.filter(
          b => b.id !== session.id && b.surah === surah && b.ayah === ayah,
        );
        return {
          ...prev,
          bookmarks: [
            ...prev.bookmarks.filter(
              b => b.id !== session.id && !(b.surah === surah && b.ayah === ayah),
            ),
            { ...session, surah, ayah, page, color, updatedAt: at },
          ],
          ...(gaveWay.length > 0
            ? {
                bookmarksRemoved: mergeRemovals(
                  prev.bookmarksRemoved,
                  gaveWay.map(b => ({ id: b.id, at: stampAfter(b) })),
                ),
              }
            : {}),
        };
      });
      // Put here on purpose, so it is drawn again.
      noteReadingPlaced();
      return;
    }
  }
  const now = Date.now();
  updateQuranState(prev => {
    /**
     * One bookmark per ayah: re-bookmarking is a RECOLOUR, and a recolour
     * keeps the bookmark's identity. It used to make a new one and drop
     * the old, which was two bugs: the visit it owned now named a dead
     * id, so the marker quietly took over — and on the other device the
     * old id was still there, so the sync produced two bookmarks on one
     * ayah. A following bookmark recoloured is still following; a new
     * colour is not a reason to lose a place that keeps itself.
     */
    const replaced = prev.bookmarks.find(b => b.surah === surah && b.ayah === ayah);
    const wants =
      follows ?? prev.prefs.bookmarkFollowDefault === 'follow';
    const base: QuranBookmark = replaced
      ? { ...replaced, page, color, updatedAt: stampAfter(replaced) }
      : {
          id: `${now}-${Math.floor(Math.random() * 1e6)}`,
          surah,
          ayah,
          page,
          color,
          createdAt: now,
        };
    const next: QuranBookmark =
      replaced?.follows || wants
        ? { ...base, follows: true, updatedAt: base.updatedAt ?? now }
        : base;
    // Same rule as above: anything else that was sitting on this ayah has
    // given way, and the other device has to be told rather than left to
    // hand it back.
    const gaveWay = prev.bookmarks.filter(
      b => b.id !== next.id && b.surah === surah && b.ayah === ayah,
    );
    return {
      ...prev,
      bookmarks: [
        ...prev.bookmarks.filter(b => !(b.surah === surah && b.ayah === ayah)),
        next,
      ],
      ...(gaveWay.length > 0
        ? {
            bookmarksRemoved: mergeRemovals(
              prev.bookmarksRemoved,
              gaveWay.map(b => ({ id: b.id, at: stampAfter(b) })),
            ),
          }
        : {}),
    };
  });
  /**
   * A BOOKMARK THAT FOLLOWS, MADE MID-READING, TAKES THE VISIT.
   *
   * Flipping the switch on an existing bookmark already does this
   * (`setBookmarkFollows`), and making one already flipped meant the same
   * thing and did not: the marker went on recording while the new
   * bookmark sat where it was made until the next visit — two places
   * kept for one reading, which is the duplicate this whole model exists
   * to avoid.
   *
   * Not from a khatmah visit. That reading belongs to the plan, and
   * marking an ayah inside it is a note, not a change of what is being
   * read.
   */
  const after = readingSessionOwner();
  const made = getQuranState().bookmarks.find(
    b => b.surah === surah && b.ayah === ayah,
  );
  if (made?.follows && (after == null || after.kind === 'reading')) {
    claimReadingSession({ kind: 'bookmark', id: made.id });
  }
}

export function removeBookmark(id: string): void {
  // An owner that no longer exists cannot own the visit.
  const owner = readingSessionOwner();
  if (owner?.kind === 'bookmark' && owner.id === id) releaseReadingOwner();
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.filter(b => b.id !== id),
    /**
     * The row goes; the REMOVAL stays, dated. Dropping the bookmark and
     * saying nothing else is what let the other device hand it back on
     * the next round — see `bookmarksRemoved`. Stamped past the copy it
     * buries, so a bookmark edited in the same millisecond somewhere else
     * does not survive on a tie.
     */
    bookmarksRemoved: mergeRemovals(prev.bookmarksRemoved, [
      {
        id,
        at: Math.max(
          Date.now(),
          (prev.bookmarks.find(b => b.id === id)?.updatedAt ?? 0) + 1,
        ),
      },
    ]),
  }));
}

/**
 * Switch a bookmark between a fixed pin and a place that keeps itself.
 *
 * Turning it ON while the reader is open hands the open visit to it —
 * "mark where I am, and keep tracking from here" is what that gesture
 * means. From the Qur'an tab's list, with no reader open, it is only a
 * setting, and `claimReadingSession` says so by doing nothing.
 */
export function setBookmarkFollows(id: string, follows: boolean): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b => {
      if (b.id !== id) return b;
      const next: QuranBookmark = { ...b, updatedAt: stampAfter(b) };
      if (follows) next.follows = true;
      else delete next.follows;
      return next;
    }),
  }));
  // Switching it ON hands this bookmark the open visit. Switching it OFF
  // does NOT hand the visit to anyone: the bookmark still owns it, it
  // just stops walking with the reading. Releasing it used to let the
  // marker take the turns, which is the duplicate place `recordReading`
  // exists to avoid.
  if (follows) claimReadingSession({ kind: 'bookmark', id });
}

/**
 * How far a following bookmark can be read from before the visit is no
 * longer its reading. Anywhere in the SAME SURAH counts — Al-Baqarah is
 * forty-eight pages and reading it end to end is one reading — and a
 * few pages past its end, for the turn that crosses into the next one.
 * Beyond that the reader has gone to look something up, and dragging the
 * bookmark after them would lose the place it was keeping.
 */
export const BOOKMARK_PAGE_REACH = 3;

/**
 * A SCRUB IS THE READER SAYING "MY READING IS HERE NOW" — so a following
 * bookmark goes with it.
 *
 * Reported from the device: scrub to a page, read on from there, and
 * nothing was saved. Two reasons, and both were right on their own. The
 * jump records no reading by design — "a turn is reading; a jump is not"
 * (#41), which is what stops a glance at the index stealing your place.
 * And the first real turn after the jump was then far outside the
 * bookmark's reach, so the session was released and the marker took it:
 * correct for someone who swiped off to look something up, wrong for
 * someone who deliberately went to where they meant to read.
 *
 * Scrubbing is not browsing. It is a destination chosen on purpose, and
 * inside a following session it moves that bookmark rather than losing
 * it — which also puts reach back around the new page, so the reading
 * that follows keeps being tracked.
 *
 * IT IS NOT DRAWN THERE, THOUGH. What the reader chose was a PAGE, and
 * the ayah this lands on is only whichever one that page happens to
 * start with — washing it says "you marked this line" about a line
 * nobody picked, which is the same noise the wash was taken off page
 * turns to avoid. So the position is recorded and the anchor goes out,
 * exactly as it does when reading carries the bookmark along. The wash
 * is for an ayah that was actually chosen: the one the visit opened on,
 * or one the reader bookmarked by hand.
 *
 * Only the session's bookmark. With nothing owning the visit a jump still
 * records nothing at all, exactly as before: `lastRead` waits for a turn.
 */
export function moveSessionToPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  const owner = readingSessionOwner();
  if (owner?.kind !== 'bookmark') return;
  const b = getQuranState().bookmarks.find(x => x.id === owner.id);
  if (!b?.follows) return;
  const first = firstAyahOfPage(page, riwayah);
  moveBookmark(b.id, { surah: first.surah, ayah: first.ayah, page });
  noteReadingMoved();
}

function withinBookmarkReach(
  b: QuranBookmark,
  pos: { surah: number; page: number },
): boolean {
  return pos.surah === b.surah || Math.abs(pos.page - b.page) <= BOOKMARK_PAGE_REACH;
}

function moveBookmark(
  id: string,
  pos: { surah: number; ayah: number; page: number },
): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.map(b =>
      b.id === id
        ? { ...b, surah: pos.surah, ayah: pos.ayah, page: pos.page, updatedAt: stampAfter(b) }
        : b,
    ),
  }));
}

export function findBookmark(
  s: QuranState,
  surah: number,
  ayah: number,
): QuranBookmark | undefined {
  return s.bookmarks.find(b => b.surah === surah && b.ayah === ayah);
}

export function setQuranPrefs(partial: Partial<QuranPrefs>): void {
  updateQuranState(prev => ({
    ...prev,
    prefs: {
      ...prev.prefs,
      ...partial,
      repeat: { ...prev.prefs.repeat, ...(partial.repeat ?? {}) },
    },
    // Every path into the preferences goes through here, which is what
    // makes one stamp enough — see `prefsUpdatedAt`.
    prefsUpdatedAt: Date.now(),
  }));
}

// ── Khatmah ──────────────────────────────────────────────────────────

export const KHATMAH_TOTAL_PAGES = 604;

/**
 * Progress is ayahs now; this is what a plan is measured against.
 *
 * `KHATMAH_TOTAL_PAGES` stays for the page-shaped UI (the scrubber, the
 * "page N of 604" line) and for the `pagesRead` mirror, but completion is
 * decided here.
 */
export const KHATMAH_TOTAL_AYAHS = TOTAL_AYAHS;

/**
 * The ayahs a plan has read, however old the plan is.
 *
 * A plan from before the ayah switch has only `pagesRead`, a Hafs page
 * count. Converting it through Hafs pagination is exact for the only
 * riwayah those plans could ever have been reading.
 */
/**
 * The first ayah the plan is responsible for — one past whatever was
 * already behind the reader when it was made (`fromPage`).
 */
export function khatmahStartAyah(plan: KhatmahPlan): number {
  const from = Math.trunc(plan.fromPage ?? 0);
  if (!Number.isFinite(from) || from <= 0) return 1;
  return ayahsThroughPage(Math.min(KHATMAH_TOTAL_PAGES - 1, from), DEFAULT_RIWAYAH) + 1;
}

/**
 * What the plan has read, as a set — the one place old plans are brought
 * forward. Without a stored set, the high-water mark IS the set: one run
 * from the plan's start to wherever it had got to.
 */
/**
 * The resolved set, once per plan object.
 *
 * Replaying the claims builds a new array, and this is called for every
 * page of the gap scan and again by everything that asks whether a page
 * is read — so without this, a plan with one claim on it re-resolved
 * itself several hundred times per render. A plan is replaced wholesale
 * on every write (`updateQuranState` maps to new objects), so the object
 * itself is the key: same plan, same answer, and nothing to invalidate.
 */
const doneCache = new WeakMap<KhatmahPlan, AyahRange[]>();

export function khatmahDone(plan: KhatmahPlan): AyahRange[] {
  const hit = doneCache.get(plan);
  if (hit) return hit;
  const base = (() => {
    if (plan.done && plan.done.length > 0) return plan.done;
    const read = khatmahAyahsRead(plan);
    const start = khatmahStartAyah(plan);
    return read < start ? [] : [[start, read] as AyahRange];
  })();
  // Replaying claims the local set already reflects is a no-op — both
  // range operations are idempotent — so this needs no special case for
  // "already resolved". What it catches is a `done` that came from a
  // legacy high-water mark, or from a merge, with claims outstanding.
  const resolved =
    !plan.marks || plan.marks.length === 0
      ? base
      : applyMarks(base, plan.marks, TOTAL_AYAHS);
  doneCache.set(plan, resolved);
  return resolved;
}

/** Is this page of this muṣḥaf read — every ayah of it? */
/**
 * Does the plan reach this page at all?
 *
 * A khatmah begun at page 143 owns what FOLLOWS page 143; the pages
 * behind it are not its to mark, and offering to mark them would be
 * offering something `toggleKhatmahPageDone` then declines to do.
 */
export function khatmahCoversPage(
  plan: KhatmahPlan,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): boolean {
  return ayahsThroughPage(page, riwayah) >= khatmahStartAyah(plan);
}

export function isKhatmahPageDone(
  plan: KhatmahPlan,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): boolean {
  const first = firstAyahOfPage(page, riwayah);
  const from = ayahIndexOf(first.surah, first.ayah);
  const to = ayahsThroughPage(page, riwayah);
  if (to < from) return false;
  return rangesCover(khatmahDone(plan), from, to);
}

export function khatmahAyahsRead(plan: KhatmahPlan): number {
  if (typeof plan.ayahsRead === 'number') {
    return Math.min(TOTAL_AYAHS, Math.max(0, Math.trunc(plan.ayahsRead)));
  }
  return ayahsThroughPage(plan.pagesRead, DEFAULT_RIWAYAH);
}

/**
 * Ayahs completed once `page` has been finished, in a given riwayah.
 *
 * "Finished page N" means "read up to the last ayah on page N", which is
 * the ayah before the first ayah of page N+1. Page 0 is nothing read.
 */
export function ayahsThroughPage(page: number, riwayah: RiwayahId): number {
  const p = Math.trunc(page);
  if (p <= 0) return 0;
  const total = totalPagesForRiwayah(riwayah);
  if (p >= total) return TOTAL_AYAHS;
  const next = firstAyahOfPage(p + 1, riwayah);
  return Math.max(0, ayahIndexOf(next.surah, next.ayah) - 1);
}

/**
 * Ḥafṣ pages FULLY read by that many ayahs — for the `pagesRead` mirror.
 *
 * Fully, not reached: a run ending mid-page has not read that page, and
 * the mirror is a count of finished pages. It made no difference while
 * every caller passed a page's last ayah; it does now that a pin or a
 * rewind can leave the run ending anywhere.
 */
export function pagesThroughAyahs(ayahs: number): number {
  if (ayahs <= 0) return 0;
  if (ayahs >= TOTAL_AYAHS) return KHATMAH_TOTAL_PAGES;
  const at = ayahAtIndex(ayahs);
  const page = findPageForAyah(at.surah, at.ayah, DEFAULT_RIWAYAH);
  return ayahsThroughPage(page, DEFAULT_RIWAYAH) <= ayahs ? page : page - 1;
}

/**
 * Where a reader who is ON `page` of `riwayah` stands, for a new plan.
 *
 * Two numbers, and they are answers to different questions.
 *
 * `ayahs` is progress, and it is the reader's own: everything before
 * their page, counted in their muṣḥaf. Nothing rounds it, so "continue"
 * puts them back at the top of the page they named rather than a page to
 * either side of it.
 *
 * `from` is where the plan's DAYS are cut, and the cut is in Ḥafṣ pages
 * (see `portionEnd`) — so it is the last Ḥafṣ page that ends at or before
 * them. Their page boundary is not Ḥafṣ's, so this can sit a fraction of
 * a page behind their position; that is the right side to be on. It makes
 * the first portion open a line or two before the reader rather than past
 * them, and it never hands out a page they have not read.
 */
function planStart(at: { page: number; riwayah?: RiwayahId }): {
  from: number;
  ayahs: number;
} {
  const page = Math.trunc(at.page);
  if (!Number.isFinite(page) || page <= 1) return { from: 0, ayahs: 0 };
  const riwayah = at.riwayah ?? DEFAULT_RIWAYAH;
  const ayahs = ayahsThroughPage(page - 1, riwayah);
  if (ayahs <= 0) return { from: 0, ayahs: 0 };
  let from = 0;
  for (let p = 1; p < KHATMAH_TOTAL_PAGES; p++) {
    if (ayahsThroughHafsPage(p) > ayahs) break;
    from = p;
  }
  return { from, ayahs };
}

/**
 * Begin a plan.
 *
 * `startingAt` is for a khatmah already under way: the page the reader is
 * ON, in the muṣḥaf they are reading it in. Everything before that page
 * counts as read, and the plan's days cover what is left.
 *
 * The page is the reader's own — Warsh page 143 is not Ḥafṣ page 143 —
 * so it is converted through ayahs, which every riwayah agrees on. See
 * `planStart` for why progress keeps that exact figure while the day cut
 * takes the Ḥafṣ page below it.
 */
export function startKhatmah(
  targetDays: number,
  startingAt?: { page: number; riwayah?: RiwayahId },
  /**
   * A date to finish by — the plan is then paced by the calendar rather
   * than by `targetDays`, which is still stored so that taking the date
   * off later lands on a plan of a sensible length rather than on one.
   */
  deadline?: string,
): void {
  const { from, ayahs } = startingAt
    ? planStart(startingAt)
    : { from: 0, ayahs: 0 };
  const now = Date.now();
  const plan: KhatmahPlan = {
    id: `${now}`,
    startedAt: now,
    targetDays,
    fromPage: from,
    pagesRead: pagesThroughAyahs(ayahs),
    ayahsRead: ayahs,
    completedAt: null,
    ...(deadline ? { deadline, deadlineAt: now } : {}),
  };
  const paced = deadline ? withPaceOfDay(plan, now) : plan;
  updateQuranState(prev => ({
    ...prev,
    // One active plan at a time; completed plans stay for history.
    khatmah: [...prev.khatmah.filter(k => !isLivePlan(k)), paced],
  }));
}

/**
 * How long an abandoned plan is remembered as abandoned — the same ninety
 * days, for the same reason, as the sunnah tombstones and the peer
 * removals: long enough for a tablet that has been in a drawer to learn
 * about it, short enough that the blob does not grow for ever.
 */
export const KHATMAH_TOMBSTONE_TTL_DAYS = 90;

/**
 * A plan the reader is actually on: not finished, and not abandoned.
 *
 * The single place that guarantees an abandoned plan reads as gone, the
 * way `indexByDate` is for cleared prayers.
 */
export function isLivePlan(k: KhatmahPlan): boolean {
  return k.completedAt == null && k.abandonedAt == null;
}

export function activeKhatmah(s: QuranState): KhatmahPlan | undefined {
  return s.khatmah.find(isLivePlan);
}

/**
 * WHICH DAY THE KHATMAH IS ON — the Islamic one, which begins at maghrib.
 *
 * A khatmah read in Ramadan is counted in Islamic days: tarawih at 21:00
 * belongs to the day that has just begun, not the one that is ending. It
 * also stops a sitting being split down the middle — 21:00 to 01:00 used
 * to be two days, the card reporting "today's reading done" at 23:59 and
 * offering a fresh empty portion at 00:01 while the reader had not moved.
 *
 * Read from `hijri/islamicDay`, which falls back to the civil date when
 * maghrib is unknown — so this store keeps its own purity: no location, no
 * prayer times, no network, and the same answer it always gave until the
 * moment something publishes tonight's maghrib.
 */
function localYmd(now: number = Date.now()): string {
  return islamicDayKey(new Date(now));
}

/** Snapshot pagesRead at the first progress of each local day. */
function withDaySnapshot(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const today = localYmd(now);
  const paced = withPaceOfDay(plan, now);
  if (paced.dayStartDate === today) return paced;
  return {
    ...paced,
    dayStartDate: today,
    dayStartPagesRead: plan.pagesRead,
    // The REACH, like everything else that answers "where is the reader"
    // — a snapshot taken from the contiguous run would put the day back
    // at a hole every morning.
    dayStartAyahsRead: khatmahReachAyah(plan),
  };
}

/**
 * PIN TODAY'S CUT, once a day, for a deadline plan.
 *
 * Every writer that touches a plan goes through `withDaySnapshot`, and
 * this rides with it for the same reason: the first thing the reader does
 * today is when "today" has to be decided. Before that the cut is
 * computed on the fly and is the same answer — it is only once reading
 * starts that holding it still matters (`khatmahPace.ts`).
 *
 * A duration plan never gets one, and a plan that loses its deadline
 * loses the pace with it, so nothing stale is left to be read by a mode
 * that does not use it.
 */
function withPaceOfDay(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const by = khatmahDeadline(plan);
  if (!by) {
    if (plan.pace === undefined) return plan;
    const rest = { ...plan };
    delete rest.pace;
    return rest;
  }
  const today = localYmd(now);
  if (plan.pace?.day === today) return plan;
  const pace = khatmahPaceToday(plan, now ?? Date.now());
  return pace ? { ...plan, pace } : plan;
}

/**
 * Give a plan a date to be finished by — or take the date off.
 *
 * The same action does both jobs the issue asks for: it is how a plan is
 * created with a deadline, and it is the re-pace for a plan whose date
 * has gone by. Moving the date re-cuts today as well, because the old
 * cut was made against a number of days that no longer applies — which
 * is the one moment the pace is allowed to change mid-day.
 */
export function setKhatmahDeadline(deadline: string | null): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const at = Math.max(Date.now(), (active.deadlineAt ?? 0) + 1);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k => {
        if (k.id !== active.id) return k;
        if (!deadline) {
          const rest = { ...k, deadlineAt: at };
          delete rest.deadline;
          delete rest.pace;
          return rest;
        }
        const next = { ...k, deadline, deadlineAt: at };
        delete next.pace;
        const pace = khatmahPaceToday(next);
        return pace ? { ...next, pace } : next;
      }),
    };
  });
}

export function recordKhatmahProgress(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  /**
   * The first page of the stretch actually turned past.
   *
   * It is what the reading credits and what it may claim. A turn knows
   * it (`recordKhatmahPageTurn` passes it) and crediting only the pages
   * crossed is the honest reading of one.
   *
   * ABSENT MEANS "I HAVE READ UP TO HERE" — a catch-up rather than a
   * turn, credited from the plan's start, which is what a caller naming
   * a page and nothing else can only mean. Nothing in the app takes that
   * path today; it is the shape of the function's own contract.
   */
  fromPage?: number,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    // The page is converted to ayahs FIRST, then compared. Comparing pages
    // would be comparing two different muṣḥafs the moment the reader
    // switched riwayah, and the high-water mark would jump or stall.
    const reached = ayahsThroughPage(page, riwayah);
    /**
     * THE SET FIRST; the high-water fields are written FROM it.
     *
     * Everything read up to `page` that falls inside the plan's credit
     * window is marked done. The window is what stops a future day being
     * banked (`khatmahCreditWindow`); within it, a page read is a page
     * done however the reader got there.
     */
    const window = khatmahCreditWindow(active);
    const start = khatmahStartAyah(active);
    const credited = Math.min(reached, window[1]);
    const floor = Math.max(start, window[0]);
    const turnedFrom =
      fromPage === undefined
        ? floor
        : (() => {
            const at = firstAyahOfPage(
              Math.max(1, Math.min(fromPage, page)),
              riwayah,
            );
            return Math.max(floor, ayahIndexOf(at.surah, at.ayah));
          })();
    /**
     * ── WHAT A TURN CREDITS IS WHAT IT TURNED PAST ────────────────────
     *
     * It used to credit everything from the plan's start to the page
     * reached, on the reasoning that a page read is a page done however
     * the reader got there. That was a deliberate trade with a stated
     * bound: a ten-page slack, the most a plan
     * could ever be wrong by, because a turn starting further ahead than
     * that was refused outright.
     *
     * Replacing the slack with the portion window took the bound away
     * and nothing said so. A portion is a twentieth of the book on a
     * thirty-day plan and an eighth of it on a seven-day one, so an
     * arrival mid-portion plus one page turn could bank eighty pages
     * nobody had read — silently, and reported as progress.
     *
     * The pages turned past are known (`recordKhatmahPageTurn` passes
     * them) and they are the honest answer. A fling still credits every
     * page it crossed, which is what issue #44 asked for; an arrival
     * followed by reading on credits what was read and leaves the pages
     * behind it unread — which is exactly what the card's own row now
     * offers to send the reader back for.
     */
    const filled =
      credited >= turnedFrom
        ? addRange(khatmahDone(active), turnedFrom, credited, TOTAL_AYAHS)
        : khatmahDone(active);
    /**
     * READING IS A DATED CLAIM TOO — AND ONLY ABOUT THE PAGES IT CROSSED.
     *
     * It used to log one only when the reading crossed something this
     * device had denied, on the reasoning that the union carries the
     * rest. The union does carry it, and carries it UNDATED, which is
     * where the "khatmah dragged back to its old point" report came from:
     * a stretch un-marked on the phone on Monday and read on the Mac on
     * Tuesday merged as Monday's denial replayed over Tuesday's reading,
     * every round, because nothing said Tuesday was later. The reading
     * this device just did is a fact with a time on it, exactly like the
     * un-mark it has to out-rank, so it is logged like one.
     *
     * The width matters more than it looks. Crediting runs from the
     * plan's start, so a claim over the credited span would say "all of
     * this is read" and erase every skipped page behind the reader — one
     * page turn after an un-mark and the hole closed itself. The pages
     * turned past are what the reader can honestly claim.
     *
     * The log does not grow a claim per turn: `compactMarks` resolves the
     * run of turns back into the stretch they amount to.
     */
    const marks =
      credited >= turnedFrom
        ? withMark(active, turnedFrom, credited, 1)
        : active.marks;
    const next = settled(active, filled, marks);
    // By CONTENT, not identity: every range operation builds a new array,
    // and a turn that re-reads credited ground must not persist, re-render
    // two screens and throw away two memos for a set that did not change.
    if (
      marks === active.marks &&
      rangesEqual(next.done, khatmahDone(active)) &&
      next.ayahsRead <= khatmahAyahsRead(active)
    ) {
      return prev;
    }
    const done = next.ayahsRead;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...next,
              // A PIN IS A STARTING POINT, NOT AN ANCHOR.
              //
              // `khatmahCurrentPage` answers with the pinned page while a
              // pin is set, whatever has been read since. That was already
              // odd — "Continue" kept offering a page the reader had gone
              // past — and it became a stall once reading was gated on the
              // plan's own frontier: pin at page 300, read one page, and
              // the next turn is judged against a frontier still sitting
              // at 300 and refused. The plan froze a page after the pin.
              //
              // So the pin is spent when the reading reaches it, exactly as
              // `finishKhatmahPortion` spends one inside the portion it
              // finishes. Tracking goes back to being derived from what has
              // been read, which is where it can move.
              ...pinned(
                k,
                k.position &&
                  ayahIndexOf(k.position.surah, k.position.ayah) <= done
                  ? null
                  : k.position,
              ),
              completedAt: done >= TOTAL_AYAHS ? Date.now() : null,
            }
          : k,
      ),
    };
  });
}

/**
 * Is the reading in front of the reader the khatmah's own reading?
 *
 * A khatmah is a promise about ONE trail through the muṣḥaf, and the
 * reader has every other reason to be somewhere else in it: a bookmark,
 * a juz they wanted to hear, Al-Kahf on a Friday, the surah a search
 * landed on. Progress used to be credited from wherever the pages were
 * turning, so an evening in juz 30 could carry a plan sitting at page 50
 * to page 590 — six hundred pages the reader never read, and no way back
 * to the real place except by hand.
 *
 * The test is the trail, not the button that opened the reader. A page at
 * or behind the plan's own next page IS the khatmah — that is what
 * "Continue" hands you, and what a bookmark on the same page means too.
 * A page ahead of it is not, however the reader got there, and reading
 * there leaves the plan exactly where it was.
 *
 * Which leaves two ways to take the plan somewhere else on purpose, both
 * of them explicit and neither of them gated by this: pinning a position
 * from an ayah's own panel (`setKhatmahPosition` — the frontier becomes
 * the pinned page, so reading from there counts immediately), and marking
 * the portion read (`finishKhatmahPortion` — the frontier moves to the
 * start of the next one). Reading is what has to prove it belongs; saying
 * so out loud does not.
 *
 * ── AND A FEW PAGES AHEAD IS STILL THE SAME TRAIL — #44, second round ─
 *
 * The test above was `page <= frontier` exactly, and that is a hair
 * trigger: the plan's frontier sits ON the page the reader is turning
 * from, every single turn, so there is no slack in it anywhere. Get one
 * page ahead — by ANY means, and the ordinary ones are enough: open the
 * reader at a page, follow a link, let a fast flick settle somewhere the
 * pager corrected — and this said no to that turn, and then to every turn
 * after it, because each one starts from a page further ahead than the
 * last. The plan stopped moving for the rest of the session while the
 * pages kept turning, with nothing on screen to say why. That is the
 * second half of #44: the crossing was fixed and the hair trigger was
 * not, and it was reported back as "works for about six swipes, then it
 * blocks again".
 *
 * So the trail has a width. A page within ten pages of
 * the frontier is the plan's own reading and the turn from it counts —
 * which credits the pages in between, because a high-water mark is the
 * only shape progress has here. That is the trade: skip five pages on
 * purpose and read on, and the plan will count those five. A hizb is the
 * most it can ever be wrong by, it is wrong in the direction the reader
 * can see and correct, and it cannot be wrong silently for ever.
 *
 * Beyond that width nothing changes: juz 30 on a Friday is four hundred
 * pages from a plan sitting at page 50, a bookmark across the muṣḥaf is
 * hundreds, and both are still refused.
 */
/**
 * WHAT READING CAN COUNT RIGHT NOW — the plan's own rule, in ayahs.
 *
 * A page read inside today's portion counts, however the reader arrived:
 * another session, the index, a surah opened for its own sake. Reading
 * that belongs to a FUTURE day does not — it has not been earned, and
 * counting it would let a plan be finished out of order without ever
 * having read what lies between.
 *
 * With one exception, which is the same principle rather than a hole in
 * it: once today's portion is finished, reading on into the next one
 * counts too. Reading ahead is still reading, and a reader who has done
 * their day and carries on should not be told it did not happen.
 *
 * This replaces the ten-page slack, which approximated the same
 * idea with distance — ten pages either side of the frontier, chosen
 * because a high-water mark had to count everything in between and ten
 * was the most it could be wrong by. A set of pages read has no such
 * cost, so the window can be what it always should have been: the
 * portion.
 */
/**
 * Mark one page of the plan read, or unread — by hand, from the mark
 * beside the surah name.
 *
 * NOT GATED BY THE CREDIT WINDOW, and deliberately: the window is what
 * READING has to satisfy, because reading is ambiguous — the app is
 * inferring intent from page turns and must not bank a future day off a
 * glance. A tap is not an inference. It is the reader saying which pages
 * they have read, which is the same standing `finishKhatmahPortion` and
 * `setKhatmahPosition` already have: "reading is what has to prove it
 * belongs; saying so out loud does not".
 *
 * So this is also the way out of a wrong count in either direction —
 * pages the plan credited that you had not read, and pages you read
 * somewhere it could not see.
 *
 * Unmarking is what the old shape could never do. A high-water mark can
 * only be wound back to a point, taking everything after it along; a set
 * can lose one page out of the middle and keep the rest.
 */
export function toggleKhatmahPageDone(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const first = firstAyahOfPage(page, riwayah);
    const from = Math.max(khatmahStartAyah(active), ayahIndexOf(first.surah, first.ayah));
    const to = ayahsThroughPage(page, riwayah);
    // A page entirely behind the plan's own start is not its to mark.
    if (to < from) return prev;
    // Nor is one beyond what the plan may credit today. A tap is a claim
    // about a page, not a licence to skip the portions in between — see
    // `khatmahPageInWindow`. The mark is not offered out there either;
    // this is the same rule, held where it cannot be got around.
    if (!khatmahPageInWindow(active, page, riwayah)) return prev;
    const current = khatmahDone(active);
    const wasDone = rangesCover(current, from, to);
    const changed = wasDone
      ? subtractRange(current, from, to, TOTAL_AYAHS)
      : addRange(current, from, to, TOTAL_AYAHS);
    // A TAP IS THE READER SPEAKING, so it is dated and travels. Without
    // this the other device's set would put an un-marked page straight
    // back on the next merge — see `AyahMark`.
    const next = settled(active, changed, withMark(active, from, to, wasDone ? 0 : 1));
    const start = khatmahStartAyah(active);
    const everything = rangesCover(next.done, start, TOTAL_AYAHS);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...next,
              // Unmarking a page of a finished khatmah re-opens it; the
              // plan is only complete while everything really is read.
              completedAt: everything ? (k.completedAt ?? Date.now()) : null,
            }
          : k,
      ),
    };
  });
}

/**
 * What the plan may be told about RIGHT NOW — from its start through the
 * end of the portion the reader is standing in.
 *
 * ── A GAP MUST NOT FREEZE THE FRONTIER ────────────────────────────────
 *
 * The obvious reading of "where is the reader" is `khatmahCurrentPortion`
 * — the portion holding the first UNREAD ayah. It is the right answer for
 * the day pill and the page marker, and it was the wrong one here,
 * because it is measured from the contiguous run and so a hole stops it
 * dead. Read pages 1–10, scrub to 15 and read 15–20, and the frontier is
 * still page 10: the window still ends where day one ends, and tomorrow's
 * pages are refused for four pages nobody remembers skipping. The plan
 * looks stuck, silently — the same stall as issue #44, by another route.
 *
 * So the window takes the FURTHEST ayah read (`highestCovered`) as the
 * reader's position and ends at the end of the portion that follows it.
 * Reading on is credited while the hole stays open; the hole is reported
 * separately and can be gone to (`khatmahGap`), rather than quietly
 * taxing every day after it.
 *
 * It still refuses al-Kahf to a plan in Aal-Imran, which is the whole
 * point of having a window: reach is where the reader has BEEN, and a
 * page fifty portions ahead of that is not a page they have read.
 *
 * The lower bound stays the gap's own portion, so going back to fill it
 * is always credited.
 */
export function khatmahCreditWindow(plan: KhatmahPlan): AyahRange {
  // From the plan's own start, so going back for a hole is credited, to
  // the end of the portion the reader is standing in.
  return [khatmahStartAyah(plan), khatmahCurrentPortion(plan).to];
}

/**
 * EVERY PAGE LEFT UNREAD BEHIND THE READER, and the first one to go to.
 *
 * Holes come in sets. Skip five pages, read one, miss another, read on —
 * that is two stretches, and reporting only the first would leave the
 * reader closing a gap they were told about, being told about the next
 * one, and never knowing how much was actually outstanding. So the count
 * is all of it and the destination is the nearest of it.
 *
 * Counted in PAGES by asking each page, rather than by measuring the
 * ayah holes: a hole can sit inside one page, two holes can share a
 * page, and a page is what the reader is being asked to go and read.
 *
 * Only holes with reading PAST them count. The first unread ayah at the
 * frontier is not a hole, it is where they stopped.
 */
export type KhatmahGapReport = {
  page: number;
  pages: number;
  day: number;
  oneDay: boolean;
};

/**
 * One entry, keyed on the set's identity.
 *
 * The scan asks every page from the first hole to the reach, which is up
 * to six hundred page lookups and range scans, and `selectQuranCardState`
 * calls it on every render of the home card and the Qur'an tab — and the
 * tab stays mounted under the reader, so that is every page turn. The
 * ranges are replaced wholesale on each write, so their identity is a
 * sound key: same array, same answer.
 */
let gapMemo: {
  done: readonly AyahRange[];
  riwayah: RiwayahId;
  start: number;
  report: KhatmahGapReport | null;
} | null = null;

export function khatmahGap(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): KhatmahGapReport | null {
  const done = khatmahDone(plan);
  const memoStart = khatmahStartAyah(plan);
  if (
    gapMemo &&
    gapMemo.done === done &&
    gapMemo.riwayah === riwayah &&
    gapMemo.start === memoStart
  ) {
    return gapMemo.report;
  }
  const report = computeKhatmahGap(plan, riwayah, done);
  gapMemo = { done, riwayah, start: memoStart, report };
  return report;
}

function computeKhatmahGap(
  plan: KhatmahPlan,
  riwayah: RiwayahId,
  done: readonly AyahRange[],
): KhatmahGapReport | null {
  const start = khatmahStartAyah(plan);
  const reach = highestCovered(done);
  if (reach < start) return null;
  /**
   * WALK THE HOLES, NOT THE PAGES.
   *
   * A page is unread exactly when some ayah of it is missing — so the
   * unread pages are the pages the holes touch, and the holes are the
   * gaps between the ranges of a set that is already sorted and disjoint.
   * Asking all six hundred pages instead cost two ayah-to-page
   * conversions each and answered the same question; holes are almost
   * always one or two.
   *
   * Nothing past the reach is a hole. That is the frontier — where the
   * reader stopped — and it is not something they skipped.
   */
  let pages = 0;
  let firstUnread = 0;
  let lastUnread = 0;
  let firstMissing = 0;
  let at = start;
  for (const [f, t] of done) {
    if (at > reach) break;
    if (f > at) {
      const holeTo = Math.min(f - 1, reach);
      if (firstMissing === 0) firstMissing = at;
      const from = pageOfAyahIndex(at, riwayah);
      const to = pageOfAyahIndex(holeTo, riwayah);
      // A page can be touched by two holes — a read stretch inside one
      // page — and it is still one page to go and read.
      const countFrom = Math.max(from, lastUnread + 1);
      if (to >= countFrom) pages += to - countFrom + 1;
      if (firstUnread === 0) firstUnread = from;
      lastUnread = Math.max(lastUnread, to);
    }
    at = Math.max(at, t + 1);
  }
  if (pages === 0) return null;
  const day = khatmahPortionOf(plan, firstMissing);
  const lastDay = khatmahPortionOf(
    plan,
    ayahsThroughPage(lastUnread, riwayah),
  );
  // Naming one day is only honest while they all belong to it.
  return { page: firstUnread, pages, day, oneDay: day === lastDay };
}

/**
 * Is this page one the plan may act on RIGHT NOW?
 *
 * The portion, not a distance — see `khatmahCreditWindow`. A page counts
 * when any of it lies in the window: the reader read that page, and a
 * page straddling the portion's end is still this reading.
 *
 * This is the one gate. Reading credit passes through it, and so does
 * every hand-made claim about the plan — marking a page read, moving the
 * khatmah's position. A plan sitting in Aal-Imran has no business being
 * told that a page of al-Kahf is done, or that its position is there:
 * whichever way that claim arrived, it is about a portion the plan has
 * not reached, and the plan would have to invent the fifty portions in
 * between to make sense of it.
 */
export function khatmahPageInWindow(
  plan: KhatmahPlan,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): boolean {
  const window = khatmahCreditWindow(plan);
  const first = firstAyahOfPage(page, riwayah);
  const from = ayahIndexOf(first.surah, first.ayah);
  const to = ayahsThroughPage(page, riwayah);
  return to >= window[0] && from <= window[1];
}

export function khatmahTracksPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  s: QuranState = getQuranState(),
): boolean {
  const plan = activeKhatmah(s);
  if (!plan) return false;
  return khatmahPageInWindow(plan, page, riwayah);
}

/**
 * Credit a page turn to the khatmah, if the turn belongs to it.
 *
 * The pager's step is the muṣḥaf's, not the plan's: a phone turns one
 * page and a spread turns two, and in both cases what was completed is
 * the page (or pages) left behind. `recordKhatmahProgress` is a
 * high-water mark, so naming the last completed page covers the pair.
 *
 * ── A FLING CROSSES MORE THAN TWO — issue #44 ─────────────────────────
 *
 * This used to credit a step of exactly one or two and nothing else, on
 * the reasoning that one is a phone and two is a spread. But the pager
 * reports where a scroll came to REST, and a hard fling on Android
 * crosses several pages before it settles: the reader sees every one of
 * them go past and the plan is told about none of it.
 *
 * That alone would be a page or two lost. What made it a stall is the
 * gate above: the next turn starts from a page now AHEAD of the plan's
 * frontier, `khatmahTracksPage` says no, and every turn after it says no
 * too. One fling and the plan is frozen for the rest of the session,
 * silently — reported as a khatmah card stuck at page 254 while the
 * reader was at 264, with "Continue reading" tracking correctly the
 * whole time, because the marker has no such gate.
 *
 * So: any FORWARD settle credits the page left behind, however many that
 * crossing covered. What it does not do is credit a jump — those do not
 * come through here as a step at all. `jumpToPage` reports the same page
 * as both arguments (see mushafReaderCore), so the rail, go-to-page, a
 * bookmark and a search result all land with nothing completed, which is
 * the distinction this function actually cares about.
 */
export function recordKhatmahPageTurn(
  prevPage: number,
  newPage: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  if (!khatmahTracksPage(prevPage, riwayah)) return;
  if (newPage <= prevPage) return;
  // The pages left behind are `prevPage … newPage - 1` — every one of
  // them, because a fling settles several pages on (#44) and the reader
  // saw all of them. That span is also what the reading may CLAIM about
  // pages it was told were skipped; see `recordKhatmahProgress`.
  recordKhatmahProgress(newPage - 1, riwayah, prevPage);
}

/**
 * The page the reader should land on to continue the khatmah.
 *
 * Derived through the ayah rather than stored, which is what makes a
 * riwayah switch keep your place: the next unread AYAH is the same in
 * both muṣḥafs, and each one is asked which of its pages holds it.
 */
export function khatmahCurrentPage(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  if (plan.position) {
    // A pinned position is authoritative, but its `page` belongs to the
    // muṣḥaf it was pinned in; re-resolve it through the ayah.
    return findPageForAyah(plan.position.surah, plan.position.ayah, riwayah);
  }
  // Where they are, not where the contiguous run stopped — see
  // `khatmahReachAyah`. One un-marked page used to send "Continue
  // khatmah" back to it, every time, from every door.
  const reach = khatmahReachAyah(plan);
  if (reach >= TOTAL_AYAHS) {
    /**
     * NOTHING AHEAD. Continuing means going back for what was left.
     *
     * A hole keeps a plan from completing (`khatmahIsComplete`), so a
     * reader who has reached the last page with pages still unread has a
     * live plan and no forward page to offer. This used to hand back the
     * last page, over and over, while the only reading left was behind
     * them — the plan's own door pointing at the one place it was
     * finished with.
     */
    const missing = firstMissingFrom(
      khatmahDone(plan),
      khatmahStartAyah(plan),
      TOTAL_AYAHS,
    );
    if (missing <= TOTAL_AYAHS) return pageOfAyahIndex(missing, riwayah);
    return totalPagesForRiwayah(riwayah);
  }
  const next = ayahAtIndex(reach + 1);
  return findPageForAyah(next.surah, next.ayah, riwayah);
}

/**
 * Pin an explicit "I am here" position (v2.7.28). Also aligns
 * `pagesRead` to the pinned page (pages before it count as read) —
 * moving backward is allowed: an explicit pin is authoritative.
 */
export function setKhatmahPosition(
  surah: number,
  ayah: number,
  page: number,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...pinned(k, { surah, ayah, page }),
              // Pages before the pinned AYAH count as read. Derived from
              // the ayah, not the page, so pinning in one riwayah and
              // reading in the other agree.
              // Ayahs before the pinned one count as read — the same
              // "everything before here" rule the page form has always
              // had, expressed in the coordinate that survives a riwayah
              // switch.
              // A pin is the reader saying where they are, and it is
              // authoritative in both directions — what is behind it is
              // read, what is ahead is not — which is what the mirror has
              // always said of a pin. Two claims, one act, in that order;
              // the second is the one the union would otherwise undo.
              ...settled(
                k,
                normalizeRanges(
                  ayahIndexOf(surah, ayah) - 1 >= khatmahStartAyah(k)
                    ? [[khatmahStartAyah(k), ayahIndexOf(surah, ayah) - 1]]
                    : [],
                  TOTAL_AYAHS,
                ),
                withMarks(k, [
                  [khatmahStartAyah(k), ayahIndexOf(surah, ayah) - 1, 1],
                  [ayahIndexOf(surah, ayah), TOTAL_AYAHS, 0],
                ]),
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Clear the pinned position (falls back to automatic page tracking). */
export function clearKhatmahPosition(): void {
  updateQuranState(prev => ({
    ...prev,
    khatmah: prev.khatmah.map(k =>
      k.completedAt == null ? { ...k, ...pinned(k, null) } : k,
    ),
  }));
}

/** Rewind only today's progress (to the day-start snapshot). */
export function resetKhatmahToday(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const today = localYmd();
    const baseAyahs =
      active.dayStartDate === today
        ? (active.dayStartAyahsRead ??
          ayahsThroughPage(
            active.dayStartPagesRead ?? active.pagesRead,
            DEFAULT_RIWAYAH,
          ))
        : khatmahAyahsRead(active); // no progress today — nothing to rewind
    const basePages = pagesThroughAyahs(baseAyahs);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...settled(
                k,
                doneRewound(k, baseAyahs),
                withMark(k, baseAyahs + 1, TOTAL_AYAHS, 0),
              ),
              dayStartDate: today,
              dayStartPagesRead: basePages,
              dayStartAyahsRead: baseAyahs,
              // Drop a pin that now sits ahead of where the rewind left
              // us — compared as ayahs, since the pin's page may belong
              // to the other muṣḥaf.
              ...pinned(
                k,
                k.position &&
                  ayahIndexOf(k.position.surah, k.position.ayah) > baseAyahs + 1
                  ? null
                  : k.position,
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Restart the active plan from page 0 with a fresh clock. */
export function resetKhatmahAll(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    // Back to where the PLAN began, which is page 0 for most plans and
    // the reader's own start for one begun partway (issue #17). Rewinding
    // such a plan to the opening would hand it back a hundred pages the
    // reader never asked it to cover.
    const from = planFrom(active);
    const ayahs = ayahsThroughHafsPage(from);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              startedAt: Date.now(),
              ...settled(
                k,
                doneRewound(k, ayahs),
                withMark(k, ayahs + 1, TOTAL_AYAHS, 0),
              ),
              ...pinned(k, null),
              dayStartDate: localYmd(),
              dayStartPagesRead: from,
              dayStartAyahsRead: ayahs,
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

export function abandonKhatmah(id: string): void {
  const at = Date.now();
  updateQuranState(prev => ({
    ...prev,
    // A WRITE, not a deletion — see `abandonedAt`. The row stays so the
    // abandonment can reach the other devices; `coerceKhatmah` drops it
    // once it is older than any peer could still argue about.
    khatmah: prev.khatmah.map(k =>
      k.id === id && k.abandonedAt == null ? { ...k, abandonedAt: at } : k,
    ),
  }));
}

// ── Khatmah portions ─────────────────────────────────────────────────
//
// A plan cuts the book into `targetDays` portions of equal length and the
// reader walks them in order. Which one is CURRENT is a fact about
// progress, not about the calendar: it is the portion holding the next
// ayah not yet read.
//
// That single rule is the whole of the behaviour:
//
//   • finish the portion you are on and the next one is current from that
//     moment, so tomorrow's reading is there tonight;
//   • stop halfway into a later portion and THAT portion is current,
//     however far ahead of the calendar it is;
//   • finish a portion you were reading ahead in and the one after it
//     becomes current.
//
// Nothing is reconciled at midnight and no day is ever "missed" into a
// different state, so there is no moment at which the reader can be shown
// a place other than the one they actually stopped at. The calendar is
// used for one thing only — deciding which portion was the day's, so the
// card can say today is done and count anything past it as extra.

/** One portion of the plan: a slice of the book, read in one sitting. */
export type KhatmahPortion = {
  /** 1-based. Portion n of `targetDays`. */
  day: number;
  /** Index of its first ayah, 1-based and inclusive. */
  from: number;
  /** Index of its last ayah, inclusive. */
  to: number;
};

/** Where the reader stands in the portion the day's reading belongs to. */
export type KhatmahDayState = {
  portion: KhatmahPortion;
  /** Its length, in ayahs. */
  length: number;
  /** How many of them are read. */
  read: number;
  /** True once the whole portion is behind the reader. */
  done: boolean;
  /** Ayahs read PAST it — reading ahead, counted apart from the day. */
  extra: number;
};

/**
 * THE MODE, asked once and answered everywhere else by branching on it.
 *
 * A plan with a `deadline` is paced by the calendar; one without is paced
 * by its duration, exactly as every plan made before 2.25 was. The field
 * being absent IS the answer, so nothing has to be migrated.
 */
export function khatmahDeadline(plan: KhatmahPlan): string | null {
  return typeof plan.deadline === 'string' && plan.deadline ? plan.deadline : null;
}

/**
 * The plan's length in days — `targetDays` for a duration plan, and the
 * span from its first day to its deadline for a dated one. Exported
 * because "day 9 of 30" has to say the same 30 the plan is paced by.
 */
export function planDays(plan: KhatmahPlan): number {
  const by = khatmahDeadline(plan);
  // The whole length of a deadline plan is the calendar's: the day it
  // began to the day it is due. `targetDays` is still carried — a plan
  // that was a duration before it was given a date keeps the number it
  // was made with — but it is not what the plan means any more.
  if (by) return deadlineTotalDays(plan.startedAt, by);
  return Math.max(1, Math.trunc(plan.targetDays) || 1);
}

/**
 * Ayahs of this plan still unread — INCLUDING pages skipped behind.
 *
 * The quota is "what is left over the days that are left", and what is
 * left is not "the book minus how far I got": a reader who skipped four
 * pages on Tuesday still owes them. `khatmahDone` is the set of what was
 * actually read, so the arithmetic is the plan's span less that set, and
 * the holes pay for themselves in the pace rather than being discovered
 * at the end. Where they ARE is `khatmahGap`'s job, and it offers to take
 * the reader back to them.
 */
export function khatmahUnreadAyahs(plan: KhatmahPlan): number {
  const start = khatmahStartAyah(plan);
  const span = Math.max(0, TOTAL_AYAHS - start + 1);
  return Math.max(0, span - countWithin(khatmahDone(plan), start, TOTAL_AYAHS));
}

/**
 * TODAY'S CUT for a deadline plan — the pinned one if today pinned it.
 *
 * Pure: a read of a day nobody has written to yet still answers, with the
 * cut that the first write of the day will pin. That matters for the card
 * on a morning where nothing has been read: it shows the quota it is
 * about to commit to, not yesterday's.
 */
export function khatmahPaceToday(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPace | null {
  const by = khatmahDeadline(plan);
  if (!by) return null;
  const day = localYmd(now);
  if (plan.pace && plan.pace.day === day) return plan.pace;
  const cut = paceCut({
    reach: khatmahReachAyah(plan),
    reachPage: pagesThroughAyahs(khatmahReachAyah(plan)),
    unreadPages: khatmahUnreadPages(plan),
    totalPages: KHATMAH_TOTAL_PAGES,
    total: TOTAL_AYAHS,
    daysLeft: daysToDeadline(by, now),
    ayahsThroughPage: ayahsThroughHafsPage,
  });
  return { day, from: cut.from, to: cut.to };
}

/**
 * PAGES STILL OWED — ahead of the reader, and behind them.
 *
 * The pace is what finishes the book, so a page skipped on Tuesday is
 * still work: the count is what lies ahead plus the holes that were left
 * behind (`khatmahGap` already walks and memoizes those). In Ḥafṣ pages,
 * because that is the unit every cut in this app is made in.
 */
export function khatmahUnreadPages(plan: KhatmahPlan): number {
  const ahead = Math.max(
    0,
    KHATMAH_TOTAL_PAGES - pagesThroughAyahs(khatmahReachAyah(plan)),
  );
  return ahead + (khatmahGap(plan, DEFAULT_RIWAYAH)?.pages ?? 0);
}

/** The pace a deadline plan needs from today on, in Ḥafṣ pages a day. */
export function khatmahPerDayPages(
  plan: KhatmahPlan,
  now: number = Date.now(),
): number {
  const by = khatmahDeadline(plan);
  if (!by) return 0;
  const left = khatmahUnreadPages(plan);
  if (left <= 0) return 0;
  return Math.max(1, Math.ceil(left / Math.max(1, daysToDeadline(by, now))));
}

/**
 * The Ḥafṣ page the plan starts after. 0 for a khatmah from the opening.
 *
 * Clamped one short of the book: a plan that began at the last page has
 * nothing to cut, and one portion of nothing is not a plan.
 */
function planFrom(plan: KhatmahPlan): number {
  const from = Math.trunc(plan.fromPage ?? 0);
  if (!Number.isFinite(from) || from <= 0) return 0;
  return Math.min(KHATMAH_TOTAL_PAGES - 1, from);
}

/**
 * Where each Ḥafṣ page ends, in ayahs. Built once, walked often.
 *
 * `portionEnd` is called inside a search, per render, so the 604 lookups
 * it needs are done a single time rather than every time.
 */
let pageEnds: number[] | null = null;
function ayahsThroughHafsPage(page: number): number {
  if (!pageEnds) {
    pageEnds = [0];
    for (let p = 1; p <= KHATMAH_TOTAL_PAGES; p++) {
      pageEnds.push(ayahsThroughPage(p, DEFAULT_RIWAYAH));
    }
  }
  return pageEnds[Math.max(0, Math.min(KHATMAH_TOTAL_PAGES, page))];
}

/**
 * Ayahs completed once portion `day` is finished. Day 0 is nothing.
 *
 * ── WHY THE BOOK IS CUT BY PAGES AND NOT BY AYAHS ─────────────────────
 *
 * Because ayahs are not spread evenly across the pages, and a plan cut
 * into equal ayah counts is not a plan anyone would recognise. Al-Baqarah
 * runs at a handful of long ayahs to the page and juzʾ ʿamma at forty
 * short ones, so an even thirtieth of the 6,236 ayahs asked for 36 pages
 * on day two of a thirty-day khatmah and 8 on day twenty-eight — four and
 * a half times the reading, on a plan whose whole promise is that every
 * day is the same. Cut by page it is 20 or 21 every day, which is the
 * number every khatmah in the world is quoted in.
 *
 * Ḥafṣ's pages, whichever muṣḥaf is being read. The division belongs to
 * the PLAN, not to the muṣḥaf in hand — a boundary that moved when the
 * reader changed riwayah would move their day under them, which is the
 * one thing this model exists to prevent. All four muṣḥafs run to 604
 * pages, so the portion is the same reading either way; only the page
 * NUMBERS shown alongside it are the reader's own (`khatmahPages`).
 *
 * The boundary is still an ayah, so progress needs no conversion and the
 * marker still falls on something the page can point at.
 */
function portionEnd(days: number, day: number, from: number = 0): number {
  const base = ayahsThroughHafsPage(from);
  if (day <= 0) return base;
  if (day >= days) return TOTAL_AYAHS;
  const span = KHATMAH_TOTAL_PAGES - from;
  // A plan longer than the pages it covers cannot have a page a day, so
  // it falls back to the even ayah cut rather than handing out empty days.
  if (days > span) {
    return base + Math.round(((TOTAL_AYAHS - base) * day) / days);
  }
  return ayahsThroughHafsPage(from + Math.round((span * day) / days));
}

/**
 * Which portion an ayah falls in, by its index.
 *
 * On a deadline plan this is asked ABOUT TODAY'S CUT, for the same reason
 * `khatmahPortion` answers from it: the days before today were cut by a
 * pace that no longer applies, and the days after today have not been cut
 * yet. Anything at or before today's portion is today's day number, and
 * anything past it is however many of today's lengths beyond it lands.
 */
export function khatmahPortionOf(
  plan: KhatmahPlan,
  index: number,
  now: number = Date.now(),
): number {
  const pace = khatmahPaceToday(plan, now);
  if (pace) {
    const today = deadlineDayNumber(plan.startedAt, plan.deadline!, now);
    const at = Math.min(TOTAL_AYAHS, Math.max(1, Math.trunc(index)));
    if (at <= pace.to) return today;
    const len = Math.max(1, pace.to - pace.from + 1);
    return Math.min(
      planDays(plan),
      today + Math.ceil((at - pace.to) / len),
    );
  }
  return durationPortionOf(plan, index);
}

function durationPortionOf(plan: KhatmahPlan, index: number): number {
  const days = planDays(plan);
  const from = planFrom(plan);
  const base = ayahsThroughHafsPage(from);
  const at = Math.min(TOTAL_AYAHS, Math.max(1, Math.trunc(index)));
  const span = Math.max(1, TOTAL_AYAHS - base);
  // The boundaries are rounded, so the proportional guess can land either
  // side of one. Walk it onto the right side rather than trusting it.
  let day = Math.min(
    days,
    Math.max(1, Math.ceil(((at - base) * days) / span)),
  );
  while (day > 1 && portionEnd(days, day - 1, from) >= at) day -= 1;
  while (day < days && portionEnd(days, day, from) < at) day += 1;
  return day;
}

export function khatmahPortion(
  plan: KhatmahPlan,
  day: number,
  now: number = Date.now(),
): KhatmahPortion {
  const days = planDays(plan);
  const d = Math.min(days, Math.max(1, Math.trunc(day)));
  /**
   * A DEADLINE PLAN IS CUT FROM TODAY OUTWARDS, not from page one.
   *
   * There is no standing cut of the book to ask for day nine of: the cut
   * is made each morning out of what is left (`khatmahPaceToday`). Today
   * is that cut; a later day is the same length again, laid end to end
   * after it, which is what the plan intends to do tomorrow if today is
   * kept; and an earlier day is behind the reader, where the portions are
   * no longer a promise about anything. Only today and the day after it
   * are ever asked for — the card's "finish day N too" is the one caller
   * that looks forward.
   */
  const pace = khatmahPaceToday(plan, now);
  if (pace) {
    const today = deadlineDayNumber(plan.startedAt, plan.deadline!, now);
    const len = Math.max(1, pace.to - pace.from + 1);
    const step = d - today;
    if (step <= 0) return { day: d, from: pace.from, to: pace.to };
    const from = Math.min(TOTAL_AYAHS, pace.to + (step - 1) * len + 1);
    return { day: d, from, to: Math.min(TOTAL_AYAHS, from + len - 1) };
  }
  const from = planFrom(plan);
  return {
    day: d,
    from: portionEnd(days, d - 1, from) + 1,
    to: portionEnd(days, d, from),
  };
}

/**
 * HOW FAR THE READER HAS GOT — the furthest ayah read, holes and all.
 *
 * `khatmahAyahsRead` is the contiguous run from the plan's start, and it
 * has to stay that: it is the legacy mirror, and a device still reading
 * it must never be told about progress past a hole. But it is the wrong
 * answer to "where is the reader", because one un-marked page behind them
 * winds it back to that page — and then the plan's next page, its day
 * number and its portion all point at somewhere they left long ago.
 *
 * The hole is not forgotten; it is reported and offered on its own
 * (`khatmahGap`), which is what lets everything else look forward.
 */
export function khatmahReachAyah(plan: KhatmahPlan): number {
  return Math.max(
    khatmahStartAyah(plan) - 1,
    highestCovered(khatmahDone(plan)),
    khatmahAyahsRead(plan),
  );
}

/** Which page of a given muṣḥaf holds an ayah index. */
function pageOfAyahIndex(index: number, riwayah: RiwayahId): number {
  const at = ayahAtIndex(Math.max(1, Math.min(TOTAL_AYAHS, Math.trunc(index))));
  return findPageForAyah(at.surah, at.ayah, riwayah);
}

/** The reach, in pages of the muṣḥaf in hand. */
export function khatmahReachPage(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const reach = khatmahReachAyah(plan);
  return reach < khatmahStartAyah(plan) ? 0 : pageOfAyahIndex(reach, riwayah);
}

/**
 * The plan has run out of pages AHEAD, and only holes are left behind.
 *
 * The end state of a khatmah read out of order: nothing forward to
 * continue to, and a live plan, because holes keep it from completing.
 * What "continue" means then is going back, which is what
 * `khatmahCurrentPage` answers — this is so the card can say so rather
 * than reporting a day as done and a plan as running.
 */
export function khatmahOnlyGapsLeft(plan: KhatmahPlan): boolean {
  return (
    khatmahReachAyah(plan) >= TOTAL_AYAHS && !khatmahIsComplete(plan)
  );
}

/** Every ayah from the plan's start is read — the only thing that finishes one. */
export function khatmahIsComplete(plan: KhatmahPlan): boolean {
  const start = khatmahStartAyah(plan);
  return rangesCover(khatmahDone(plan), start, TOTAL_AYAHS);
}

/**
 * THE SET HAS TO MOVE WITH EVERY REWIND AND EVERY CLAIM.
 *
 * Progress used to be one number, so rewinding it was one assignment.
 * With a set of read ranges, an assignment to `ayahsRead` alone leaves
 * the ranges claiming pages the reader has just taken back: "reset
 * today" would leave every check green, and — since the reach is read
 * from the set — leave the plan's next page where it was. These two put
 * the set where the number says it is.
 */
/**
 * Log a claim, newest last and bounded.
 *
 * Only hand-made claims and readings that cross one come through here —
 * see `AyahMark`. A page turn that touches nothing the reader has denied
 * needs no date, because the union already carries it.
 */
function withMarks(
  plan: KhatmahPlan,
  claims: ReadonlyArray<readonly [from: number, to: number, read: 0 | 1]>,
): AyahMark[] | undefined {
  const usable = claims.filter(([from, to]) => to >= from);
  if (usable.length === 0) return plan.marks;
  const have = plan.marks ?? [];
  /**
   * MONOTONIC, because replay order IS the rule.
   *
   * The wall clock is what lets two devices' claims be ordered against
   * each other, and it is too coarse to order two claims made here: a
   * reader who un-marks a page and reads it again in the same
   * millisecond — or a test, or a pin, which is two claims in one act —
   * would have them replayed in whatever order the array sort happened
   * to pick, and the later claim could lose to the earlier one. One past
   * the newest claim we already hold is both later than it and still a
   * wall-clock time the other device can compare against.
   */
  let at = Math.max(Date.now(), (have[have.length - 1]?.[2] ?? 0) + 1);
  const next: AyahMark[] = [...have];
  for (const [from, to, read] of usable) {
    next.push([from, to, at, read]);
    at += 1;
  }
  /**
   * Resolved on the way in, not trimmed on the way out. Page turns are
   * claims now (see `AyahMark`), so an unresolved log would grow by one
   * per turn and a blind `slice` would drop the oldest — which is where
   * the un-marks live. `compactMarks` keeps every verdict and only the
   * claims still deciding one; the cap below is a backstop it should
   * never reach.
   */
  const compacted = compactMarks(next, TOTAL_AYAHS).slice(-KHATMAH_MARK_LIMIT);
  /**
   * THE SAME LOG IS THE SAME OBJECT.
   *
   * Re-reading ground this device already claimed compacts back to the
   * claim it already held — the new turn is absorbed into it, at the
   * earlier time. Handing back a fresh array for that would make every
   * turn over credited pages a state write, and `recordKhatmahProgress`
   * ends on an identity check precisely so that a turn which changes
   * nothing re-renders nothing.
   */
  return sameMarks(compacted, have) ? plan.marks : compacted;
}

function withMark(
  plan: KhatmahPlan,
  from: number,
  to: number,
  read: 0 | 1,
): AyahMark[] | undefined {
  return withMarks(plan, [[from, to, read]]);
}

function sameMarks(a: readonly AyahMark[], b: readonly AyahMark[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => m[0] === b[i][0] && m[1] === b[i][1] && m[2] === b[i][2] && m[3] === b[i][3])
  );
}

type Pin = KhatmahPlan['position'];

function samePin(a: Pin, b: Pin): boolean {
  if (!a || !b) return !a && !b;
  return a.surah === b.surah && a.ayah === b.ayah;
}

/**
 * THE PIN AND THE DATE ON IT, written together or not at all.
 *
 * Every writer that moves the pin — a reader pinning one, reading past
 * one, clearing one, rewinding over one — goes through here, because a
 * pin whose stamp was forgotten is exactly the pin that comes back from
 * the other device (see `positionAt`). Unchanged pins keep their stamp:
 * re-stamping a value nobody touched would let a device that merely
 * opened the reader talk over a removal made elsewhere.
 *
 * The clock is nudged past the pin's own stamp for the same reason
 * `withMarks` nudges a claim past the last one: two acts in the same
 * millisecond — a pin and the clear that a page turn makes of it — must
 * still be orderable, here and on the device that receives them.
 */
function pinned(plan: KhatmahPlan, next: Pin): Pick<KhatmahPlan, 'position' | 'positionAt'> {
  if (samePin(plan.position ?? null, next ?? null)) {
    return {
      position: plan.position ?? null,
      ...(plan.positionAt != null ? { positionAt: plan.positionAt } : {}),
    };
  }
  return {
    position: next ?? null,
    positionAt: Math.max(Date.now(), (plan.positionAt ?? 0) + 1),
  };
}

/**
 * WHAT EVERY WRITER STORES: the resolved set and the mirror derived from it.
 *
 * Three fields say one thing and they have to agree. The set is stored
 * with the claims already replayed, so a merge that replays them again
 * gets the same set back (idempotence, which the P2P cycle rests on).
 * The legacy mirror is the CONTIGUOUS run of that set — never a number
 * a writer chose, because a chosen number can point past a hole and tell
 * an older device about pages nobody read.
 */
function settled(
  plan: KhatmahPlan,
  done: readonly AyahRange[],
  marks: AyahMark[] | undefined,
): { done: AyahRange[]; ayahsRead: number; pagesRead: number; marks?: AyahMark[] } {
  const resolved = marks?.length ? applyMarks(done, marks, TOTAL_AYAHS) : [...done];
  const contiguous = Math.max(
    0,
    contiguousFrom(resolved, khatmahStartAyah(plan), TOTAL_AYAHS),
  );
  return {
    done: resolved,
    ayahsRead: contiguous,
    pagesRead: pagesThroughAyahs(contiguous),
    ...(marks === undefined ? {} : { marks }),
  };
}

function doneRewound(plan: KhatmahPlan, to: number): AyahRange[] {
  return subtractRange(khatmahDone(plan), to + 1, TOTAL_AYAHS, TOTAL_AYAHS);
}

function doneFilled(plan: KhatmahPlan, to: number): AyahRange[] {
  const start = khatmahStartAyah(plan);
  return to >= start
    ? addRange(khatmahDone(plan), start, to, TOTAL_AYAHS)
    : khatmahDone(plan);
}

/** The portion the reader is in — the one holding the page they are on. */
export function khatmahCurrentPortion(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPortion {
  const reach = khatmahReachAyah(plan);
  // A deadline plan's portion in hand is TODAY'S, whether or not the
  // reader has got to it: the calendar decides which day it is, so
  // reading ahead does not move them into tomorrow's reading the way it
  // does on a duration plan (it shows as `extra`, which is what the
  // overflow marker from 2.24.0 already reports).
  const pace = khatmahPaceToday(plan, now);
  if (pace) {
    return {
      day: deadlineDayNumber(plan.startedAt, plan.deadline!, now),
      from: pace.from,
      to: pace.to,
    };
  }
  if (reach >= TOTAL_AYAHS) return khatmahPortion(plan, planDays(plan), now);
  return khatmahPortion(plan, khatmahPortionOf(plan, reach + 1, now), now);
}

/**
 * The ayah that closes the portion in hand — the one the page marks, and
 * the one whose pill finishes the day. Null once the book is finished.
 */
export function khatmahMarkerAyah(
  plan: KhatmahPlan,
): { surah: number; ayah: number } | null {
  if (khatmahAyahsRead(plan) >= TOTAL_AYAHS) return null;
  return ayahAtIndex(khatmahCurrentPortion(plan).to);
}

/**
 * The day's portion and how much of it is read.
 *
 * The portion is the one that was current when the day's reading STARTED,
 * not the one current now: finishing it and reading on must leave the day
 * showing as done, with the rest counted as extra, rather than silently
 * becoming a new unfinished day. On a day with no reading yet the two are
 * the same thing.
 */
export function khatmahDay(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahDayState {
  // Where the reader is, not where the contiguous run stopped. One
  // un-marked page behind them used to make a finished day report itself
  // unfinished and nag for pages they had read — see `khatmahReachAyah`.
  const read = khatmahReachAyah(plan);
  /**
   * A DEADLINE PLAN'S DAY IS TODAY'S CUT, full stop.
   *
   * The dance below — hold the day at the portion the reading STARTED in,
   * so finishing it and reading on leaves the day done rather than
   * dragging the reader into tomorrow — is what a duration plan needs,
   * because its day number comes from where the reading is. A deadline
   * plan's day number comes from the date, and its portion was pinned
   * when the day opened, so the same behaviour falls out of asking for it
   * directly: today's cut, what has been read of it, and the rest as
   * `extra`.
   */
  const pace = khatmahPaceToday(plan, now);
  const portion = pace
    ? khatmahCurrentPortion(plan, now)
    : (() => {
        const opened =
          plan.dayStartDate === localYmd(now)
            ? Math.min(read, Math.max(0, plan.dayStartAyahsRead ?? read))
            : read;
        const day =
          read >= TOTAL_AYAHS && opened >= TOTAL_AYAHS
            ? planDays(plan)
            : khatmahPortionOf(plan, Math.min(TOTAL_AYAHS, opened + 1), now);
        return khatmahPortion(plan, day, now);
      })();
  const length = portion.to - portion.from + 1;
  return {
    portion,
    length,
    read: Math.max(0, Math.min(length, read - portion.from + 1)),
    done: read >= portion.to,
    extra: Math.max(0, read - portion.to),
  };
}

/**
 * Mark the portion in hand as read, in full.
 *
 * The button behind the "I missed the marker" case and the page pill both
 * land here. It always finishes the CURRENT portion, so pressing it after
 * today's is already done reads the next one ahead — which is the same
 * thing reading ahead by hand would do, and leaves the reader in exactly
 * the place the rule above says they are.
 */
/**
 * THE PORTION THE FINISH BUTTON WOULD ACT ON.
 *
 * On a duration plan this is always the portion in hand: the day number
 * is derived from the reading, so finishing today's moves the reader into
 * the next one and the button follows them there.
 *
 * A deadline plan's portion is TODAY'S and stays today's however much is
 * read — that is what makes reading ahead show as `extra` rather than as
 * time travel. Which would leave the card's "✓ finish day 10 too" button
 * pointing at a portion already covered, and `finishKhatmahPortion`
 * declining to do anything at all. So once today's cut is read, the
 * button means the next day's, and this is the one place that decides
 * that — the label and the action must not disagree about which day they
 * are talking about.
 */
export function khatmahFinishTarget(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPortion {
  const portion = khatmahCurrentPortion(plan, now);
  if (!khatmahDeadline(plan)) return portion;
  if (!rangesCover(khatmahDone(plan), portion.from, portion.to)) return portion;
  if (portion.to >= TOTAL_AYAHS) return portion;
  return khatmahPortion(plan, portion.day + 1, now);
}

export function finishKhatmahPortion(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const portion = khatmahFinishTarget(active);
    const to = portion.to;
    // Already covered — by the set, not the mirror, which a hole behind
    // the reader would hold back even with the portion fully read.
    if (rangesCover(khatmahDone(active), portion.from, to)) return prev;
    /**
     * The claim is THE PORTION, not everything from the plan's start.
     * "Finish today's reading" says nothing about a page the reader
     * un-marked last week, and a claim from the start would be newer than
     * that denial and erase it. The fill still runs from the start, as
     * reading credit does; the replay puts the older holes back.
     */
    const next = settled(
      active,
      doneFilled(active, to),
      withMark(active, portion.from, to, 1),
    );
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...next,
              // A pin inside the portion just read is spent; leaving it
              // would send "continue" backwards into finished ground.
              ...pinned(
                k,
                k.position && ayahIndexOf(k.position.surah, k.position.ayah) <= to
                  ? null
                  : k.position,
              ),
              completedAt: rangesCover(next.done, khatmahStartAyah(k), TOTAL_AYAHS)
                ? (k.completedAt ?? Date.now())
                : null,
            }
          : k,
      ),
    };
  });
}

/**
 * Step back one portion, so the one before the current becomes current.
 *
 * The undo for a "done" pressed by mistake, and the way back into
 * yesterday's reading. Progress is rewound to the end of the portion
 * before last, which is what makes the previous one current again; the
 * day snapshot moves with it so the card does not go on claiming a day
 * the reader has just stepped out of.
 */
export function stepKhatmahBack(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const days = planDays(active);
    const current = khatmahCurrentPortion(active).day;
    const to = portionEnd(days, current - 2, planFrom(active));
    if (to >= khatmahAyahsRead(active)) return prev;
    const today = localYmd();
    const pages = pagesThroughAyahs(to);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...settled(k, doneRewound(k, to), withMark(k, to + 1, TOTAL_AYAHS, 0)),
              dayStartDate: today,
              dayStartAyahsRead: to,
              dayStartPagesRead: pages,
              ...pinned(
                k,
                k.position && ayahIndexOf(k.position.surah, k.position.ayah) > to + 1
                  ? null
                  : k.position,
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/**
 * The days of reading still in front of the reader.
 *
 * ── WHY THIS IS NOT THE CALENDAR ──────────────────────────────────────
 *
 * It was, and it contradicted the line beside it. The day NUMBER comes
 * from the portion the reader has reached — that is the whole point of
 * the portion model, so that reading ahead or falling behind moves the
 * reader and not the schedule — while the days left came from midnights
 * elapsed since the plan started. On a plan begun today and read four
 * portions into, the card said "day 4 of 30" and "30 days left" in the
 * same breath.
 *
 * ── AND WHY IT IS NOT THE DAY'S PORTION EITHER ────────────────────────
 *
 * Because that is pinned, on purpose. `khatmahDay` reports the portion
 * the day STARTED in, so that finishing it and reading on leaves the day
 * showing as done rather than silently becoming a new unfinished one —
 * and a reader who sat down at page 90 and read to page 551 is still on
 * "day 5" until tomorrow, which is what was asked for.
 *
 * What is left of the BOOK is a different question, and its answer is
 * where the reader actually is. Saying "25 days to go" to someone with
 * fifty pages in front of them is the same fault in another place.
 */
export function khatmahDaysLeft(
  plan: KhatmahPlan,
  now: number = Date.now(),
): number {
  // Complete means every ayah, so a plan with a hole still has a day in
  // it however far the reader has reached.
  if (khatmahIsComplete(plan)) return 0;
  /**
   * ON A DEADLINE PLAN THIS IS THE CALENDAR'S ANSWER, and that is the
   * whole point of the mode — it is the number issue #53 was reported
   * about. A target of 30 September seen on 16 September is fourteen
   * days, whatever the reader has or has not read; portions remaining
   * would say eighteen and be describing a different plan.
   *
   * Zero once the date has passed. The card says so and offers another
   * date; nothing counts the days that went by.
   */
  const by = khatmahDeadline(plan);
  if (by) return daysToDeadline(by, now);
  return Math.max(
    0,
    plan.targetDays - khatmahCurrentPortion(plan, now).day + 1,
  );
}

/**
 * How far behind the calendar the reading is, in pages.
 *
 * The one number here that IS the calendar's, and rightly: being behind
 * is a statement about the schedule, not about where the reader is.
 */
export function khatmahBehindBy(
  plan: KhatmahPlan,
  now: number = Date.now(),
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  /**
   * A DEADLINE PLAN IS NEVER BEHIND — its pace is.
   *
   * "You are 40 pages behind" is a statement about a schedule that does
   * not move. A deadline plan's schedule moves every morning: what was
   * missed is already inside today's quota, and saying it twice would be
   * charging the reader for it twice. What the card shows instead is the
   * pace itself — `khatmahPerDayPages` — which goes up when days are
   * missed and is the same fact said forwards.
   */
  if (khatmahDeadline(plan)) return 0;
  /**
   * DAYS, COUNTED THE WAY THE READER'S DAYS ROLL.
   *
   * This used to be `floor((now - startedAt) / 86_400_000)` — a rolling
   * twenty-four hours from the moment the plan was made, which is a
   * boundary the app does not use anywhere else. A khatmah begun at 23:00
   * gained a day at 23:00 every night, an hour before the day pill did
   * and hours after maghrib for a reader whose day starts there, so the
   * card could say "one page behind" beside a day number that disagreed.
   *
   * `daysAway` counts whole days from the store's own today (see
   * `khatmahDayWhen`), which is the same today the portion, the snapshot
   * and the pill are keyed on. Day one is the day it began: elapsed is
   * how many days have PASSED since then, so the plan is not behind on
   * the morning it was made.
   */
  const daysElapsed = Math.max(0, -daysAway(plan.startedAt, now));
  // Against the plan's own span, not the whole book: a khatmah begun at
  // page 143 is not five days behind on the morning it was made.
  const from = planFrom(plan);
  const span = KHATMAH_TOTAL_PAGES - from;
  const expected = Math.min(
    KHATMAH_TOTAL_PAGES,
    from + Math.round((span / planDays(plan)) * daysElapsed),
  );
  // Against the reach, not the contiguous mirror: pages behind a hole are
  // already reported as unread (`khatmahGap`), and counting them here as
  // well would tell the reader they are sixty pages behind schedule over
  // two pages they skipped.
  return Math.max(0, expected - khatmahReachPage(plan, riwayah));
}

/** What a khatmah has left, counted in pages of the muṣḥaf in hand. */
export type KhatmahPages = {
  /** Pages the day's portion covers, first to last. */
  today: number;
  /** How many of those the reader has finished. */
  doneToday: number;
  /** What is left of today — `today` less `doneToday`. */
  leftToday: number;
  /** Pages read past the day's portion. */
  extraToday: number;
  /** Pages from where the reader is to the end of the muṣḥaf. */
  remaining: number;
  /** Pages in this riwayah's muṣḥaf. */
  total: number;
};

/**
 * The plan's progress in PAGES, for the muṣḥaf the reader is actually in.
 *
 * ── WHY THE RIWAYAH IS AN ARGUMENT ────────────────────────────────────
 *
 * Because a page is not a fixed quantity of Qur'an. Progress is kept in
 * ayahs, which every riwayah agrees on, and pages are the reader's own
 * unit — "four pages left today" is a thing anyone can picture where
 * "sixty-one ayahs" is not. But the four pages are four pages OF SOMETHING,
 * and Warsh, Qālūn and Shuʿbah each break the text across their fifteen
 * lines differently. Answering out of the Ḥafṣ pagination for a reader in
 * Shuʿbah is quietly wrong by a page here and there all the way down the
 * book.
 *
 * So the ayahs are converted through the pagination of the muṣḥaf in
 * hand. `pagesForRiwayah` falls back to Ḥafṣ for a riwayah this build
 * cannot draw, which is the right way to be wrong: that reader is in
 * Ḥafṣ anyway.
 */
export function khatmahPages(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  now: number = Date.now(),
): KhatmahPages {
  const pageOf = (index: number) => {
    const at = ayahAtIndex(
      Math.max(1, Math.min(TOTAL_AYAHS, Math.trunc(index))),
    );
    return findPageForAyah(at.surah, at.ayah, riwayah);
  };
  const total = totalPagesForRiwayah(riwayah);
  const day = khatmahDay(plan, now);
  const read = khatmahReachAyah(plan);
  const first = pageOf(day.portion.from);
  const last = pageOf(day.portion.to);
  const today = Math.max(1, last - first + 1);
  // Full when the portion is finished, however the reader got there — a
  // page count taken from the last ayah read can land one short of the
  // portion's own last page, and "1 page left" on a day that is done is
  // exactly the nag this is meant to avoid.
  const doneToday = day.done
    ? today
    : Math.max(
        0,
        Math.min(
          today,
          read >= day.portion.from ? pageOf(read) - first + 1 : 0,
        ),
      );
  return {
    today,
    doneToday,
    leftToday: Math.max(0, today - doneToday),
    extraToday: read > day.portion.to ? Math.max(0, pageOf(read) - last) : 0,
    remaining: read >= TOTAL_AYAHS ? 0 : total - pageOf(read + 1) + 1,
    total,
  };
}

/** Test-only: reset module state. */
export function __resetQuranStateForTests(): void {
  state = DEFAULT_QURAN_STATE;
  gapMemo = null;
  hydrated = false;
  hydrating = null;
  listeners.clear();
  writeMutex = Promise.resolve();
  persistQueued = false;
}
