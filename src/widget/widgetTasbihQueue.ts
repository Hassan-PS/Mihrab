/**
 * Taps on the Tasbih widget, waiting for the app to apply them.
 *
 * Same shape as `widgetLogQueue.ts` and for the same reason — the counter
 * lives in the app's own storage, which a widget process cannot reach — but
 * with one difference that changes everything about the rules: a journal
 * entry is a SET and a dhikr count is a SEQUENCE. Tapping Fajr twice means
 * Fajr; tapping +1 twice means two. So this is an ordered log that is
 * replayed, not a set that is merged, and "already queued" is not a case.
 *
 * That makes ordering load-bearing. `+1 +1 next +1` leaves two beads on one
 * dhikr and one on the next; any other order is a different result, and a
 * queue that reordered would silently mis-record someone's dhikr.
 *
 * THE RULES HERE ARE THE ONES THE SWIFT AND KOTLIN MIRRORS COPY. The tests
 * in `__tests__/widgetTasbihQueue.test.ts` are what say what they are.
 */

/** The three things the widget's buttons can ask for. */
export const TASBIH_ACTIONS = ['inc', 'reset', 'next'] as const;

export type WidgetTasbihAction = (typeof TASBIH_ACTIONS)[number];

export type WidgetTasbihEntry = {
  /** The action. */
  a: WidgetTasbihAction;
  /** Epoch ms, for ageing the queue out — not for ordering, which is
   *  array order: two taps in the same millisecond are still two taps in
   *  the order they arrived. */
  t: number;
};

/**
 * Anything older than this is dropped rather than applied.
 *
 * Same fortnight the log queue uses. A count from two weeks ago arriving as
 * a surprise is worse than a count quietly lost — the user has long since
 * stopped believing the widget was going to do anything.
 */
export const MAX_TASBIH_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * A queue read back from another process, with anything that could not have
 * come from a real tap removed. Unknown actions are dropped rather than
 * treated as one of the known ones: this ends up in someone's dhikr count.
 */
export function coerceTasbihQueue(input: unknown): WidgetTasbihEntry[] {
  if (!Array.isArray(input)) return [];
  const out: WidgetTasbihEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const { a, t } = raw as { a?: unknown; t?: unknown };
    if (typeof a !== 'string') continue;
    if (!(TASBIH_ACTIONS as readonly string[]).includes(a)) continue;
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
    out.push({ a: a as WidgetTasbihAction, t });
  }
  return out;
}

/** Append one action. There is no de-duplication: see the header. */
export function appendTasbihAction(
  queue: WidgetTasbihEntry[],
  action: WidgetTasbihAction,
  now: number,
): WidgetTasbihEntry[] {
  return [...queue, { a: action, t: now }];
}

/** Split a queue into what to replay and what has gone stale. */
export function partitionTasbihQueue(
  queue: WidgetTasbihEntry[],
  now: number,
  maxAgeMs: number = MAX_TASBIH_QUEUE_AGE_MS,
): { apply: WidgetTasbihEntry[]; stale: WidgetTasbihEntry[] } {
  const apply: WidgetTasbihEntry[] = [];
  const stale: WidgetTasbihEntry[] = [];
  for (const e of queue) {
    if (now - e.t > maxAgeMs) stale.push(e);
    else apply.push(e);
  }
  return { apply, stale };
}

/**
 * What the widget should DRAW, given the counter the app last published and
 * the taps this device has queued since.
 *
 * A projection, not a write. The widget has to answer "what is the number"
 * on the same frame as the tap, and the real store is in another process —
 * so both the widget and this function replay the queue over the payload,
 * and the app replays it over the store. Same input, same rules, so the two
 * cannot show different numbers.
 *
 * `unbounded` is the preset's own `unboundedAfterTarget`, which the widget
 * must honour rather than inventing a rule: some dhikr stop at their target
 * and some carry on, and the screen already knows which.
 */
export function projectTasbih(
  base: {
    /** Index of the active preset in TASBIH_PRESETS. */
    index: number;
    /** How many presets there are, for wrapping. */
    total: number;
    /** Per-preset counts, indexed as `counts[index]`. */
    counts: number[];
    /**
     * Every preset's target and unbounded flag, in the same order.
     *
     * Per-preset rather than "the active one", because Next moves the index
     * inside this very function — after one press the rules that apply are
     * the NEW preset's, and using the old one's target would let a bounded
     * dhikr count past its own or stop short of it.
     */
    targets: number[];
    unboundedFlags: boolean[];
    todayTotal: number;
  },
  queue: WidgetTasbihEntry[],
): { index: number; counts: number[]; todayTotal: number } {
  let index = base.index;
  const counts = [...base.counts];
  let todayTotal = base.todayTotal;

  for (const e of queue) {
    switch (e.a) {
      case 'inc': {
        const current = counts[index] ?? 0;
        const target = base.targets[index] ?? 0;
        const unbounded = base.unboundedFlags[index] === true;
        // A bounded preset stops at its target. Counting past it on the
        // widget and not in the app is the one way these two can disagree
        // about a number the user is watching.
        if (!unbounded && target > 0 && current >= target) break;
        counts[index] = current + 1;
        todayTotal += 1;
        break;
      }
      case 'reset':
        // Only the active set, matching the screen's "Reset set". The
        // day's total is a record of beads counted, not of beads still
        // showing, so it does not come back down.
        counts[index] = 0;
        break;
      case 'next':
        // Wraps, and keeps every count. Moving on from a part-finished
        // dhikr must not discard it — that is what the screen does, and a
        // widget that quietly threw it away would be the worse surprise.
        index = base.total > 0 ? (index + 1) % base.total : index;
        break;
    }
  }

  return { index, counts, todayTotal };
}

export type TasbihDrainDeps = {
  /** Take the queue from the widget side and clear it, in one step. */
  take: () => Promise<unknown>;
  /** Add one bead to the active preset. */
  increment: () => void;
  /** Clear the active preset's count. */
  reset: () => void;
  /** Move to the next preset, keeping counts. */
  next: () => void;
  now?: number;
  maxAgeMs?: number;
};

export type TasbihDrainResult = {
  applied: number;
  dropped: number;
  failed: number;
};

/**
 * Replay the queue into the real store.
 *
 * Never throws: the queue is already gone by the time anything in here can
 * fail, so there is nothing to retry and nothing to put back. A tasbih count
 * is not worth an unhandled rejection on app start.
 */
export async function drainWidgetTasbihQueue(
  deps: TasbihDrainDeps,
): Promise<TasbihDrainResult> {
  const now = deps.now ?? Date.now();
  const queue = coerceTasbihQueue(await deps.take());
  const { apply, stale } = partitionTasbihQueue(queue, now, deps.maxAgeMs);

  let applied = 0;
  let failed = 0;
  for (const e of apply) {
    try {
      if (e.a === 'inc') deps.increment();
      else if (e.a === 'reset') deps.reset();
      else deps.next();
      applied += 1;
    } catch {
      failed += 1;
    }
  }
  return { applied, dropped: stale.length, failed };
}
