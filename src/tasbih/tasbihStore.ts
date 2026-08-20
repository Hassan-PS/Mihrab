/**
 * The tasbih counter, persisted.
 *
 * `tasbih.ts` says it in its own header: "counter state lives in component
 * state during a session". That was defensible while the only thing that
 * could see a count was the screen holding it. It stops being defensible the
 * moment a home-screen widget shows the same number — a widget that forgets
 * the count on reboot is broken, and a widget that keeps its OWN count is
 * worse, because then the screen and the widget disagree and neither is
 * wrong.
 *
 * So there is one store, and both read it.
 *
 * Shape follows `quranState.ts` — module state, a subscriber set, a write
 * mutex, `useSyncExternalStore` — for the same reason it does: this blob is
 * written on every tap, and putting it in the settings context would
 * re-render every settings consumer in the app once per bead.
 *
 * Two things the day boundary decides, and they decide differently:
 *
 *   • `counts` do NOT reset at midnight. Someone at 27 of 33 at 23:59 is
 *     mid-round; zeroing that because a clock ticked would be the app
 *     throwing away work the user did.
 *   • `today` DOES reset, because it is labelled "today" and a total that
 *     silently spans a week is a false statement, not a generous one.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TASBIH_PRESETS, findPreset, increment } from './tasbih';

/** This feature's own blob, versioned like the Quran one. */
export const TASBIH_STORAGE_KEY = 'mihrab.tasbih.v1';

export type TasbihState = {
  version: 1;
  /** Which dhikr is showing. */
  activeId: string;
  /** preset id → current count. Absent id reads as 0. */
  counts: Record<string, number>;
  /** Local YYYY-MM-DD the `todayTotal` belongs to. */
  todayKey: string;
  /** Increments recorded today, across every preset. */
  todayTotal: number;
  /** Rounds completed today — what `recordDhikrSet` already logs, mirrored
   *  here so the widget can show it without reading the encrypted blob. */
  todayRounds: number;
};

/** Local YYYY-MM-DD. The day the user is in, not UTC's. */
export function tasbihDayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

export const DEFAULT_TASBIH_STATE: TasbihState = {
  version: 1,
  activeId: TASBIH_PRESETS[0].id,
  counts: {},
  todayKey: '',
  todayTotal: 0,
  todayRounds: 0,
};

let state: TasbihState = DEFAULT_TASBIH_STATE;
let hydrated = false;
let hydrating: Promise<void> | null = null;
let writeMutex: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(fn => fn());
}

/**
 * Validate a stored blob field by field.
 *
 * The same rule the Quran store follows, for the same reason: this shape can
 * arrive from a restored backup or another device, and a count of `1e308` or
 * an `activeId` naming a preset that no longer exists would be written
 * straight back to disk and then rendered.
 */
export function coerceTasbihState(raw: unknown): TasbihState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_TASBIH_STATE;
  }
  const r = raw as Partial<TasbihState>;
  const ids = new Set(TASBIH_PRESETS.map(p => p.id));

  const counts: Record<string, number> = {};
  if (r.counts && typeof r.counts === 'object' && !Array.isArray(r.counts)) {
    for (const [id, n] of Object.entries(r.counts)) {
      // A count for a preset the app no longer ships is dropped rather than
      // kept: it can never be displayed, and it would ride along in every
      // backup forever.
      if (!ids.has(id)) continue;
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
      counts[id] = Math.min(Math.floor(n), 1_000_000);
    }
  }

  const activeId =
    typeof r.activeId === 'string' && ids.has(r.activeId)
      ? r.activeId
      : DEFAULT_TASBIH_STATE.activeId;

  const todayKey =
    typeof r.todayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.todayKey)
      ? r.todayKey
      : '';

  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0
      ? Math.min(Math.floor(v), 1_000_000)
      : 0;

  return {
    version: 1,
    activeId,
    counts,
    todayKey,
    todayTotal: todayKey ? num(r.todayTotal) : 0,
    todayRounds: todayKey ? num(r.todayRounds) : 0,
  };
}

/** Load the blob once. Safe to call repeatedly. */
export function hydrateTasbihState(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(TASBIH_STORAGE_KEY);
      if (raw) state = rollDay(coerceTasbihState(JSON.parse(raw)));
    } catch (e) {
      console.warn('tasbihStore: hydrate failed, using defaults', e);
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
    .then(() =>
      AsyncStorage.setItem(TASBIH_STORAGE_KEY, JSON.stringify(snapshot)),
    )
    .catch(e => {
      console.warn('tasbihStore: persist failed', e);
    });
}

/**
 * Zero the day-scoped totals when the calendar day has turned over.
 *
 * Applied on read as well as on write, because the interesting case is a
 * phone that was asleep: nothing wrote overnight, so a rollover that only
 * happened on write would show yesterday's total under today's label until
 * the next tap.
 */
function rollDay(s: TasbihState, now: Date = new Date()): TasbihState {
  const key = tasbihDayKey(now);
  if (s.todayKey === key) return s;
  return { ...s, todayKey: key, todayTotal: 0, todayRounds: 0 };
}

export function getTasbihState(): TasbihState {
  return state;
}

export function isTasbihHydrated(): boolean {
  return hydrated;
}

export function subscribeTasbihState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTasbihState(): TasbihState {
  return useSyncExternalStore(
    subscribeTasbihState,
    getTasbihState,
    getTasbihState,
  );
}

function update(updater: (prev: TasbihState) => TasbihState): void {
  state = updater(rollDay(state));
  emit();
  persist();
}

// ── Mutations ────────────────────────────────────────────────────────

/** Read one preset's count. */
export function countFor(s: TasbihState, id: string): number {
  return s.counts[id] ?? 0;
}

/**
 * Add one bead to the active dhikr.
 *
 * Returns whether this increment landed exactly ON the preset's target, so
 * the caller can fire the celebration haptic and record the completed set —
 * the same contract `increment()` in `tasbih.ts` already has, kept identical
 * so the screen's logic did not have to change shape to move in here.
 */
export function incrementTasbih(): { count: number; reachedTarget: boolean } {
  const preset = findPreset(state.activeId);
  // Delegates to the pure rule rather than restating it: "did this cross the
  // target" is the kind of thing that gets fixed in one place and stays
  // broken in the other.
  const { count: next, reachedTarget } = increment(
    countFor(rollDay(state), state.activeId),
    preset.defaultTarget,
  );
  update(prev => ({
    ...prev,
    counts: { ...prev.counts, [prev.activeId]: next },
    todayTotal: prev.todayTotal + 1,
    todayRounds: prev.todayRounds + (reachedTarget ? 1 : 0),
  }));
  return { count: next, reachedTarget };
}

/**
 * Move to another dhikr, KEEPING every count.
 *
 * This is the behaviour the screen already had and the one the widget's
 * "Next" button has to match: stepping away from a part-finished dhikr and
 * back must find it where you left it. Nothing here clears a count — only
 * `resetTasbih` does, and it is a separate, deliberate control.
 */
export function setActiveTasbih(id: string): void {
  const preset = findPreset(id);
  update(prev => ({ ...prev, activeId: preset.id }));
}

/** Clear the active dhikr's count. Leaves today's total alone — the beads
 *  were still counted, and a reset is not a claim that they were not. */
export function resetTasbih(): void {
  update(prev => ({
    ...prev,
    counts: { ...prev.counts, [prev.activeId]: 0 },
  }));
}

/** Clear every count. */
export function resetAllTasbih(): void {
  update(prev => ({ ...prev, counts: {} }));
}

/**
 * Test-only: put the module in a given state without going through disk.
 *
 * Exists because the interesting rollover case is a blob written yesterday,
 * and there is no honest way to reach it from the public API — every
 * mutation stamps today's key on the way past.
 */
export function __seedTasbihStateForTests(patch: Partial<TasbihState>): void {
  state = { ...state, ...patch };
  hydrated = true;
  emit();
}

/** Test-only: reset module state. */
export function __resetTasbihStoreForTests(): void {
  state = DEFAULT_TASBIH_STATE;
  hydrated = false;
  hydrating = null;
  listeners.clear();
  writeMutex = Promise.resolve();
}
