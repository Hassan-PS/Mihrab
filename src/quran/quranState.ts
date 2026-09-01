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
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOTAL_AYAHS, ayahAtIndex, ayahIndexOf } from './ayahIndex';
import {
  findPageForAyah,
  firstAyahOfPage,
  totalPagesForRiwayah,
} from './pages';
import { DEFAULT_RIWAYAH, coerceRiwayahId, type RiwayahId } from './riwayat';

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
};

export type LastRead = {
  surah: number;
  ayah: number;
  page: number;
  mode: 'mushaf' | 'withTranslation';
  updatedAt: number;
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
  // ── Additive fields (v2.7.28) ─────────────────────────────────────
  /** Explicit user-pinned position ("I am here"), shown on the mushaf
   *  in the reserved khatmah color. Overrides the derived page. */
  position?: { surah: number; ayah: number; page: number } | null;
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
};

/** Reserved highlight color for the khatmah position (distinct from the
 *  five bookmark colors — cyan, used nowhere else in the reader). */
export const KHATMAH_COLOR = '#0891b2';

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
  /** Mushaf night mode (inverted page). */
  mushafNightMode: boolean;
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
   * How mushaf pages are drawn (v2.8.0, additive).
   *
   * `text` renders each page from its own QPC v2 font — vector-sharp at any
   * zoom, a fraction of the memory, and instant on rotation. `image` is the
   * original 2600 px page PNG, kept for one release as an escape hatch and
   * for anyone who already downloaded the images.
   */
  mushafRenderer: 'text' | 'image';
  keepAwake: boolean;
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
};

export type QuranState = {
  version: 1;
  lastRead: LastRead | null;
  bookmarks: QuranBookmark[];
  /** Starred ayah keys, `"surah:ayah"`. */
  starred: string[];
  khatmah: KhatmahPlan[];
  prefs: QuranPrefs;
};

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
    riwayah: DEFAULT_RIWAYAH,
    riwayahNoticeSeen: false,
    mushafRenderer: 'text',
    keepAwake: true,
    hideMode: 'none',
    repeat: { eachAyah: 1, range: 1, pauseFactor: 0 },
    votdMode: 'translation',
    companionMode: 'translation',
    tafsirEditionId: '',
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
  return { id: r.id, surah, ayah, page, color, createdAt };
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
  const out: KhatmahPlan = {
    id: r.id,
    startedAt,
    targetDays,
    pagesRead,
    completedAt,
  };
  const p = r.position;
  if (p && typeof p === 'object') {
    const surah = int((p as Record<string, unknown>).surah, 1, 114);
    const ayah = int((p as Record<string, unknown>).ayah, 1, 286);
    const page = int((p as Record<string, unknown>).page, 1, 604);
    if (surah !== null && ayah !== null && page !== null) {
      out.position = { surah, ayah, page };
    }
  }
  const dsp = int(r.dayStartPagesRead, 0, 604);
  if (dsp !== null) out.dayStartPagesRead = dsp;
  // Clamped to the ayah count for the same reason `pagesRead` is clamped
  // to the page count: a bad number is still someone's reading.
  const ar = int(r.ayahsRead, 0, TOTAL_AYAHS);
  if (ar !== null) out.ayahsRead = ar;
  const dsa = int(r.dayStartAyahsRead, 0, TOTAL_AYAHS);
  if (dsa !== null) out.dayStartAyahsRead = dsa;
  if (typeof r.dayStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dayStartDate)) {
    out.dayStartDate = r.dayStartDate;
  }
  return out;
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

/** Merge a possibly-older stored blob over the defaults (additive schema). */
function mergeStored(raw: unknown): QuranState {
  if (!raw || typeof raw !== 'object') return DEFAULT_QURAN_STATE;
  const r = raw as Partial<QuranState>;
  return {
    version: 1,
    lastRead: coerceLastRead(r.lastRead),
    bookmarks: Array.isArray(r.bookmarks)
      ? r.bookmarks
          .map(coerceBookmark)
          .filter((b): b is QuranBookmark => b !== null)
      : [],
    starred: Array.isArray(r.starred)
      ? [
          ...new Set(
            r.starred.filter(
              (s): s is string =>
                typeof s === 'string' && /^\d{1,3}:\d{1,3}$/.test(s),
            ),
          ),
        ]
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
    },
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

function persist(): void {
  const snapshot = state;
  writeMutex = writeMutex
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)))
    .catch(e => {
      console.warn('quranState: persist failed', e);
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

export function ayahKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function toggleStar(surah: number, ayah: number): void {
  const key = ayahKey(surah, ayah);
  updateQuranState(prev => ({
    ...prev,
    starred: prev.starred.includes(key)
      ? prev.starred.filter(k => k !== key)
      : [...prev.starred, key],
  }));
}

export function isStarred(s: QuranState, surah: number, ayah: number): boolean {
  return s.starred.includes(ayahKey(surah, ayah));
}

export function addBookmark(
  surah: number,
  ayah: number,
  page: number,
  color: BookmarkColor,
): void {
  const bookmark: QuranBookmark = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    surah,
    ayah,
    page,
    color,
    createdAt: Date.now(),
  };
  updateQuranState(prev => ({
    ...prev,
    // One bookmark per ayah: re-bookmarking replaces (color change).
    bookmarks: [
      ...prev.bookmarks.filter(b => !(b.surah === surah && b.ayah === ayah)),
      bookmark,
    ],
  }));
}

export function removeBookmark(id: string): void {
  updateQuranState(prev => ({
    ...prev,
    bookmarks: prev.bookmarks.filter(b => b.id !== id),
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

/** The Hafs page that many ayahs reach — for the `pagesRead` mirror. */
function pagesThroughAyahs(ayahs: number): number {
  if (ayahs <= 0) return 0;
  if (ayahs >= TOTAL_AYAHS) return KHATMAH_TOTAL_PAGES;
  const at = ayahAtIndex(ayahs);
  return findPageForAyah(at.surah, at.ayah, DEFAULT_RIWAYAH);
}

export function startKhatmah(targetDays: number): void {
  const plan: KhatmahPlan = {
    id: `${Date.now()}`,
    startedAt: Date.now(),
    targetDays,
    pagesRead: 0,
    ayahsRead: 0,
    completedAt: null,
  };
  updateQuranState(prev => ({
    ...prev,
    // One active plan at a time; completed plans stay for history.
    khatmah: [...prev.khatmah.filter(k => k.completedAt != null), plan],
  }));
}

export function activeKhatmah(s: QuranState): KhatmahPlan | undefined {
  return s.khatmah.find(k => k.completedAt == null);
}

function localYmd(now: number = Date.now()): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Snapshot pagesRead at the first progress of each local day. */
function withDaySnapshot(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const today = localYmd(now);
  if (plan.dayStartDate === today) return plan;
  return {
    ...plan,
    dayStartDate: today,
    dayStartPagesRead: plan.pagesRead,
    dayStartAyahsRead: khatmahAyahsRead(plan),
  };
}

export function recordKhatmahProgress(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(k => k.completedAt == null);
    if (!active) return prev;
    // The page is converted to ayahs FIRST, then compared. Comparing pages
    // would be comparing two different muṣḥafs the moment the reader
    // switched riwayah, and the high-water mark would jump or stall.
    const reached = ayahsThroughPage(page, riwayah);
    const have = khatmahAyahsRead(active);
    if (reached <= have) return prev;
    const done = Math.min(reached, TOTAL_AYAHS);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ayahsRead: done,
              // Mirrored in Hafs pages so older versions and the sync
              // merge, which takes the max of this field, still mean
              // something.
              pagesRead: pagesThroughAyahs(done),
              completedAt: done >= TOTAL_AYAHS ? Date.now() : null,
            }
          : k,
      ),
    };
  });
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
  const read = khatmahAyahsRead(plan);
  if (read >= TOTAL_AYAHS) return totalPagesForRiwayah(riwayah);
  const next = ayahAtIndex(read + 1);
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
    const active = prev.khatmah.find(k => k.completedAt == null);
    if (!active) return prev;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              position: { surah, ayah, page },
              // Pages before the pinned AYAH count as read. Derived from
              // the ayah, not the page, so pinning in one riwayah and
              // reading in the other agree.
              // Ayahs before the pinned one count as read — the same
              // "everything before here" rule the page form has always
              // had, expressed in the coordinate that survives a riwayah
              // switch.
              ayahsRead: Math.max(0, ayahIndexOf(surah, ayah) - 1),
              pagesRead: Math.max(0, Math.min(KHATMAH_TOTAL_PAGES, page - 1)),
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
      k.completedAt == null ? { ...k, position: null } : k,
    ),
  }));
}

/** Rewind only today's progress (to the day-start snapshot). */
export function resetKhatmahToday(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(k => k.completedAt == null);
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
              ayahsRead: baseAyahs,
              pagesRead: basePages,
              dayStartDate: today,
              dayStartPagesRead: basePages,
              dayStartAyahsRead: baseAyahs,
              // Drop a pin that now sits ahead of where the rewind left
              // us — compared as ayahs, since the pin's page may belong
              // to the other muṣḥaf.
              position:
                k.position &&
                ayahIndexOf(k.position.surah, k.position.ayah) > baseAyahs + 1
                  ? null
                  : k.position,
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
    const active = prev.khatmah.find(k => k.completedAt == null);
    if (!active) return prev;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              startedAt: Date.now(),
              pagesRead: 0,
              ayahsRead: 0,
              position: null,
              dayStartDate: localYmd(),
              dayStartPagesRead: 0,
              dayStartAyahsRead: 0,
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

export function abandonKhatmah(id: string): void {
  updateQuranState(prev => ({
    ...prev,
    khatmah: prev.khatmah.filter(k => k.id !== id),
  }));
}

/**
 * Today's suggested portion for a plan: remaining pages spread over the
 * remaining days (minimum 1 day). Returns pages-to-read-today plus
 * schedule state so the UI can nudge gently, never guilt-trip.
 */
export function khatmahToday(
  plan: KhatmahPlan,
  now: number = Date.now(),
): { pagesToday: number; behindBy: number; daysLeft: number } {
  const dayMs = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.floor((now - plan.startedAt) / dayMs);
  const daysLeft = Math.max(1, plan.targetDays - daysElapsed);
  const remaining = Math.max(0, KHATMAH_TOTAL_PAGES - plan.pagesRead);
  const pagesToday = Math.ceil(remaining / daysLeft);
  const expected = Math.min(
    KHATMAH_TOTAL_PAGES,
    Math.round((KHATMAH_TOTAL_PAGES / plan.targetDays) * daysElapsed),
  );
  return {
    pagesToday,
    behindBy: Math.max(0, expected - plan.pagesRead),
    daysLeft,
  };
}

/** Test-only: reset module state. */
export function __resetQuranStateForTests(): void {
  state = DEFAULT_QURAN_STATE;
  hydrated = false;
  hydrating = null;
  listeners.clear();
  writeMutex = Promise.resolve();
}
