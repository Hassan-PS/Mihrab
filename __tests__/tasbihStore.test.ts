/**
 * The tasbih counter store — the thing that did not exist, which is why the
 * widget could not exist either.
 */
import {
  __resetTasbihStoreForTests,
  coerceTasbihState,
  countFor,
  DEFAULT_TASBIH_STATE,
  getTasbihState,
  incrementTasbih,
  resetAllTasbih,
  resetTasbih,
  setActiveTasbih,
  tasbihDayKey,
  __seedTasbihStateForTests,
} from '../src/tasbih/tasbihStore';
import { TASBIH_PRESETS } from '../src/tasbih/tasbih';

const FIRST = TASBIH_PRESETS[0].id;
const SECOND = TASBIH_PRESETS[1].id;

beforeEach(() => {
  __resetTasbihStoreForTests();
});

describe('counting', () => {
  it('increments the active dhikr and today total together', () => {
    incrementTasbih();
    incrementTasbih();
    const s = getTasbihState();
    expect(countFor(s, FIRST)).toBe(2);
    expect(s.todayTotal).toBe(2);
    expect(s.todayRounds).toBe(0);
  });

  it('reports reaching the target exactly once, and counts the round', () => {
    const target = TASBIH_PRESETS[0].defaultTarget;
    const hits: boolean[] = [];
    for (let i = 0; i < target + 2; i++) {
      hits.push(incrementTasbih().reachedTarget);
    }
    expect(hits.filter(Boolean)).toHaveLength(1);
    expect(hits[target - 1]).toBe(true);
    expect(getTasbihState().todayRounds).toBe(1);
  });
});

describe('moving between dhikr', () => {
  it('KEEPS a part-finished count when the active preset changes', () => {
    incrementTasbih();
    incrementTasbih();
    incrementTasbih();
    setActiveTasbih(SECOND);
    incrementTasbih();
    setActiveTasbih(FIRST);
    // This is the whole contract the widget's "Next" button depends on.
    expect(countFor(getTasbihState(), FIRST)).toBe(3);
    expect(countFor(getTasbihState(), SECOND)).toBe(1);
  });

  it('ignores an unknown preset id rather than storing it', () => {
    setActiveTasbih('not-a-dhikr');
    expect(getTasbihState().activeId).toBe(FIRST);
  });
});

describe('resetting', () => {
  it('clears only the active count, and does not un-count the day', () => {
    incrementTasbih();
    incrementTasbih();
    setActiveTasbih(SECOND);
    incrementTasbih();
    setActiveTasbih(FIRST);
    resetTasbih();
    const s = getTasbihState();
    expect(countFor(s, FIRST)).toBe(0);
    expect(countFor(s, SECOND)).toBe(1);
    // Three beads were counted. A reset is not a claim they were not.
    expect(s.todayTotal).toBe(3);
  });

  it('resetAll clears every count', () => {
    incrementTasbih();
    setActiveTasbih(SECOND);
    incrementTasbih();
    resetAllTasbih();
    expect(getTasbihState().counts).toEqual({});
  });
});

describe('the day boundary', () => {
  it('keeps a mid-round count across midnight but zeroes the day total', () => {
    // A blob as it would have been left last night: 27 of 33 done, 200 beads
    // counted, and a day key that is no longer today.
    __seedTasbihStateForTests({
      activeId: FIRST,
      counts: { [FIRST]: 27 },
      todayKey: '2000-01-01',
      todayTotal: 200,
      todayRounds: 6,
    });

    incrementTasbih();
    const s = getTasbihState();
    // The round survives — the user is mid-dhikr, not starting over.
    expect(countFor(s, FIRST)).toBe(28);
    // "Today" means today. Yesterday's 200 are not part of it.
    expect(s.todayKey).toBe(tasbihDayKey());
    expect(s.todayTotal).toBe(1);
    expect(s.todayRounds).toBe(0);
  });
});

describe('reading a stored blob back', () => {
  it('drops counts for presets the app no longer ships', () => {
    const s = coerceTasbihState({
      version: 1,
      activeId: FIRST,
      counts: { [FIRST]: 5, 'retired-dhikr': 99 },
      todayKey: tasbihDayKey(),
      todayTotal: 5,
      todayRounds: 0,
    });
    expect(s.counts).toEqual({ [FIRST]: 5 });
  });

  it('refuses impossible numbers instead of writing them back', () => {
    const s = coerceTasbihState({
      counts: { [FIRST]: Number.POSITIVE_INFINITY, [SECOND]: -3 },
      todayTotal: Number.NaN,
    });
    expect(s.counts).toEqual({});
    expect(s.todayTotal).toBe(0);
  });

  it('falls back to defaults for junk', () => {
    expect(coerceTasbihState(null)).toEqual(DEFAULT_TASBIH_STATE);
    expect(coerceTasbihState([1, 2, 3])).toEqual(DEFAULT_TASBIH_STATE);
  });

  it('drops a day total whose day key is missing — it cannot be "today"', () => {
    const s = coerceTasbihState({ todayTotal: 40, todayRounds: 1 });
    expect(s.todayTotal).toBe(0);
    expect(s.todayRounds).toBe(0);
  });
});
