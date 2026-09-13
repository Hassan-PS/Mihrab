/**
 * "The first real frame is on screen" — as a latch anything can wait on.
 *
 * ── WHY ──────────────────────────────────────────────────────────────
 *
 * The moment the Today card first has its times, the same effect flush
 * that draws them also rebuilds the whole prayer-alert schedule, the
 * end-of-day and adhkār reminders, the home-screen widget's payload (a
 * storage read, a build, a native write) and the Live Activity's, and
 * `AppNavigationRoot` is draining the widget's tap queue and republishing
 * on top. None of it is on screen. All of it ran on the JS thread in the
 * same breath as the first paint, and a cold start measured 87 ms
 * between the ready render's commit and the next animation frame — the
 * frame the reader was waiting for, queued behind bookkeeping.
 *
 * So that work waits for this. It is not cancelled and not made rarer;
 * it starts one frame later than it did, after the card is drawn.
 *
 * ── WHO MARKS IT ──────────────────────────────────────────────────────
 *
 * `HomeScreen`, once its first `ready` render has been committed and a
 * frame has gone by. Not every launch reaches that — onboarding, a
 * location error, the Mac with no location yet — so a timer marks it
 * anyway a few seconds in, and the side work runs as it always did.
 * Marking is idempotent; the promise resolves once and stays resolved.
 */
import { useEffect, useState } from 'react';

let done = false;
let markDone: () => void = () => {};
let gate: Promise<void> = new Promise<void>(resolve => {
  markDone = resolve;
});

/**
 * How long a launch may go without a first paint before the side work
 * stops waiting. Long enough that a real first paint always wins; short
 * enough that a launch straight into onboarding still schedules its
 * alerts before the person has finished reading the greeting.
 */
export const FIRST_PAINT_FALLBACK_MS = 4000;
let fallback: ReturnType<typeof setTimeout> | null = null;

/**
 * The timer starts when somebody first WAITS, not when the module loads:
 * a launch that never asks (a headless task, a test) never owns a timer.
 */
function armFallback(): void {
  if (done || fallback) return;
  fallback = setTimeout(() => markFirstPaint(), FIRST_PAINT_FALLBACK_MS);
}

/** The first real frame has been handed to the screen. Idempotent. */
export function markFirstPaint(): void {
  if (done) return;
  done = true;
  if (fallback) {
    clearTimeout(fallback);
    fallback = null;
  }
  markDone();
}

/** Resolves after the first paint; already resolved if it has happened. */
export function afterFirstPaint(): Promise<void> {
  armFallback();
  return gate;
}

export function firstPaintDone(): boolean {
  return done;
}

/**
 * `true` once the first paint has happened. A component that renders
 * before it re-renders once when it does; one that mounts after it gets
 * `true` immediately and never re-renders on its account.
 */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(done);
  useEffect(() => {
    if (ready) return undefined;
    let live = true;
    void afterFirstPaint().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

/** Test seam: back to "not yet painted", with a fresh gate and timer. */
export function _resetFirstPaintForTests(): void {
  done = false;
  if (fallback) clearTimeout(fallback);
  fallback = null;
  gate = new Promise<void>(resolve => {
    markDone = resolve;
  });
}
