/**
 * The Tasbih widget's queue. These rules are copied into Swift and Kotlin,
 * so this file is the one that decides what they are.
 */
import {
  appendTasbihAction,
  coerceTasbihQueue,
  drainWidgetTasbihQueue,
  partitionTasbihQueue,
  projectTasbih,
  MAX_TASBIH_QUEUE_AGE_MS,
  type WidgetTasbihEntry,
} from '../src/widget/widgetTasbihQueue';

const NOW = 1_700_000_000_000;

const base = (over: Partial<Parameters<typeof projectTasbih>[0]> = {}) => ({
  index: 0,
  total: 6,
  counts: [0, 0, 0, 0, 0, 0],
  target: 33,
  unbounded: false,
  todayTotal: 0,
  ...over,
});

describe('coerceTasbihQueue', () => {
  it('keeps well-formed entries', () => {
    expect(
      coerceTasbihQueue([
        { a: 'inc', t: NOW },
        { a: 'next', t: NOW + 1 },
      ]),
    ).toEqual([
      { a: 'inc', t: NOW },
      { a: 'next', t: NOW + 1 },
    ]);
  });

  it('drops an action it does not know', () => {
    // Not "treat it as inc": this ends up in someone's dhikr count.
    expect(coerceTasbihQueue([{ a: 'decrement', t: NOW }])).toEqual([]);
  });

  it('drops junk shapes without throwing', () => {
    expect(coerceTasbihQueue(null)).toEqual([]);
    expect(coerceTasbihQueue('[]')).toEqual([]);
    expect(coerceTasbihQueue([null, 3, { a: 'inc' }, { t: NOW }])).toEqual([]);
    expect(coerceTasbihQueue([{ a: 'inc', t: -1 }])).toEqual([]);
  });
});

describe('appendTasbihAction', () => {
  it('does not de-duplicate — two taps are two beads', () => {
    let q: WidgetTasbihEntry[] = [];
    q = appendTasbihAction(q, 'inc', NOW);
    q = appendTasbihAction(q, 'inc', NOW);
    expect(q).toHaveLength(2);
  });
});

describe('projectTasbih', () => {
  it('counts up', () => {
    const out = projectTasbih(base(), [
      { a: 'inc', t: NOW },
      { a: 'inc', t: NOW },
    ]);
    expect(out.counts[0]).toBe(2);
    expect(out.todayTotal).toBe(2);
  });

  it('stops a bounded preset at its target', () => {
    const out = projectTasbih(base({ counts: [32, 0, 0, 0, 0, 0], todayTotal: 32 }), [
      { a: 'inc', t: NOW },
      { a: 'inc', t: NOW },
      { a: 'inc', t: NOW },
    ]);
    expect(out.counts[0]).toBe(33);
    expect(out.todayTotal).toBe(33);
  });

  it('lets an unbounded preset carry on past it', () => {
    const out = projectTasbih(
      base({ counts: [33, 0, 0, 0, 0, 0], unbounded: true, todayTotal: 33 }),
      [{ a: 'inc', t: NOW }],
    );
    expect(out.counts[0]).toBe(34);
  });

  it('treats target 0 as no target', () => {
    const out = projectTasbih(base({ target: 0, counts: [99, 0, 0, 0, 0, 0] }), [
      { a: 'inc', t: NOW },
    ]);
    expect(out.counts[0]).toBe(100);
  });

  it('reset clears the active set only', () => {
    const out = projectTasbih(base({ counts: [10, 7, 0, 0, 0, 0] }), [
      { a: 'reset', t: NOW },
    ]);
    expect(out.counts[0]).toBe(0);
    expect(out.counts[1]).toBe(7);
  });

  it('reset does not take the day back down', () => {
    // The day's total is a record of beads counted, not of beads showing.
    const out = projectTasbih(base({ counts: [10, 0, 0, 0, 0, 0], todayTotal: 10 }), [
      { a: 'reset', t: NOW },
    ]);
    expect(out.todayTotal).toBe(10);
  });

  it('next wraps and keeps every count', () => {
    const out = projectTasbih(base({ index: 5, counts: [4, 0, 0, 0, 0, 9] }), [
      { a: 'next', t: NOW },
    ]);
    expect(out.index).toBe(0);
    expect(out.counts[5]).toBe(9);
  });

  it('replays in order, because order is the answer', () => {
    // +1 +1 next +1 → two on the first dhikr and one on the second. Any
    // other order is a different result.
    const out = projectTasbih(base(), [
      { a: 'inc', t: NOW },
      { a: 'inc', t: NOW },
      { a: 'next', t: NOW },
      { a: 'inc', t: NOW },
    ]);
    expect(out.counts[0]).toBe(2);
    expect(out.counts[1]).toBe(1);
    expect(out.index).toBe(1);
    expect(out.todayTotal).toBe(3);
  });
});

describe('partitionTasbihQueue', () => {
  it('drops taps older than a fortnight', () => {
    const { apply, stale } = partitionTasbihQueue(
      [
        { a: 'inc', t: NOW - MAX_TASBIH_QUEUE_AGE_MS - 1 },
        { a: 'inc', t: NOW - 1000 },
      ],
      NOW,
    );
    expect(apply).toHaveLength(1);
    expect(stale).toHaveLength(1);
  });
});

describe('drainWidgetTasbihQueue', () => {
  it('replays each action into the store, in order', async () => {
    const calls: string[] = [];
    const result = await drainWidgetTasbihQueue({
      take: async () => [
        { a: 'inc', t: NOW },
        { a: 'next', t: NOW },
        { a: 'reset', t: NOW },
      ],
      increment: () => calls.push('inc'),
      reset: () => calls.push('reset'),
      next: () => calls.push('next'),
      now: NOW,
    });
    expect(calls).toEqual(['inc', 'next', 'reset']);
    expect(result).toEqual({ applied: 3, dropped: 0, failed: 0 });
  });

  it('counts a failing write instead of throwing', async () => {
    const result = await drainWidgetTasbihQueue({
      take: async () => [{ a: 'inc', t: NOW }],
      increment: () => {
        throw new Error('storage full');
      },
      reset: () => {},
      next: () => {},
      now: NOW,
    });
    expect(result.failed).toBe(1);
    expect(result.applied).toBe(0);
  });

  it('survives a take that returns nonsense', async () => {
    const result = await drainWidgetTasbihQueue({
      take: async () => 'not a queue',
      increment: () => {},
      reset: () => {},
      next: () => {},
      now: NOW,
    });
    expect(result).toEqual({ applied: 0, dropped: 0, failed: 0 });
  });
});
