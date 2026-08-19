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

export function startKhatmah(targetDays: number): void {
  const plan: KhatmahPlan = {
    id: `${Date.now()}`,
    startedAt: Date.now(),
    targetDays,
    pagesRead: 0,
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
  return { ...plan, dayStartDate: today, dayStartPagesRead: plan.pagesRead };
}

export function recordKhatmahProgress(page: number): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(k => k.completedAt == null);
    if (!active || page <= active.pagesRead) return prev;
    const done = Math.min(page, KHATMAH_TOTAL_PAGES);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              pagesRead: done,
              completedAt: done >= KHATMAH_TOTAL_PAGES ? Date.now() : null,
            }
          : k,
      ),
    };
  });
}

/** The page the reader should land on to continue the khatmah. */
export function khatmahCurrentPage(plan: KhatmahPlan): number {
  if (plan.position) return plan.position.page;
  return Math.min(KHATMAH_TOTAL_PAGES, plan.pagesRead + 1);
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
    const base =
      active.dayStartDate === today
        ? (active.dayStartPagesRead ?? active.pagesRead)
        : active.pagesRead; // no progress today — nothing to rewind
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              pagesRead: base,
              dayStartDate: today,
              dayStartPagesRead: base,
              position:
                k.position && k.position.page > base + 1 ? null : k.position,
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
              position: null,
              dayStartDate: localYmd(),
              dayStartPagesRead: 0,
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
