/**
 * "Has anything actually changed since the last time we did this?" — v2.10.2.
 *
 * Every foreground used to cost the same as a cold start: a GPS fix, a
 * network fetch, a teardown and rewrite of ~48 OS alarms, a full decrypt of
 * the journal, two widget payload writes and a Live Activity restart. And
 * `'active'` does not mean "the user came back" — it fires when a share sheet
 * closes, when a permission dialog dismisses, when the screen unlocks.
 * `autoSync.ts` has said so in a comment for months ("several times a minute
 * in normal use") and was the only path that throttled on it.
 *
 * ── WHY A FINGERPRINT AND NOT JUST A TIMER ───────────────────────────────
 *
 * A pure time gate is the obvious fix and it is the wrong one. The whole
 * reason to resync on foreground is that the answer may have changed: a day
 * rolled over, a plane landed in another timezone, the user changed their
 * calculation method. Suppress those for N seconds and the app shows the
 * wrong prayer times, which is the one thing it may never do.
 *
 * So a change always wins. The timer only decides how often to re-do work
 * whose inputs are IDENTICAL — which is the only case where skipping is free.
 *
 * The gap is deliberately short. It exists to swallow the burst of `'active'`
 * events that one user action produces, not to defer real refreshes: anyone
 * who has been away long enough for the world to move has been away for
 * longer than this.
 */

/** Long enough to swallow a burst, short enough never to defer a real return. */
export const RESYNC_MIN_GAP_MS = 60_000;

type Gate = { fingerprint: string; at: number };

const gates = new Map<string, Gate>();

/**
 * Whether `key` should do its work now.
 *
 * True when the inputs changed, when it has never run, or when the minimum
 * gap has passed. Deliberately separate from `markResynced` so that work
 * which THREW does not count as done — a failed location fix must not
 * suppress the next attempt.
 */
export function shouldResync(
  key: string,
  fingerprint: string,
  now: number = Date.now(),
  minGapMs: number = RESYNC_MIN_GAP_MS,
): boolean {
  const prev = gates.get(key);
  if (!prev) return true;
  if (prev.fingerprint !== fingerprint) return true;
  // A clock that went backwards (manual set, NTP correction) reads as a
  // negative gap. Treat it as "long ago" rather than locking the gate shut
  // until the clock catches up again.
  const gap = now - prev.at;
  return gap < 0 || gap >= minGapMs;
}

/** Record that `key` completed with these inputs. Call it on success only. */
export function markResynced(
  key: string,
  fingerprint: string,
  now: number = Date.now(),
): void {
  gates.set(key, { fingerprint, at: now });
}

/** Tests, and anything that deliberately wants the next run to be unconditional. */
export function forgetResyncGates(): void {
  gates.clear();
}

/**
 * The inputs that decide whether prayer times can still be the same answer:
 * which day it is, which timezone the device is in, and anything else the
 * caller knows about (coordinates, a settings version).
 *
 * The day key is the DEVICE's day, not UTC's — a day rollover is what makes
 * yesterday's schedule wrong, and that happens at local midnight.
 */
export function dayTzFingerprint(now: Date, ...extra: (string | number)[]): string {
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return [day, now.getTimezoneOffset(), ...extra].join('|');
}
