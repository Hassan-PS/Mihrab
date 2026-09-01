/**
 * Finishing a day, and stepping back out of one.
 *
 * `khatmahPortions.test.ts` pins the arithmetic; this pins what the two
 * buttons do to a real plan, and above all that they compose — a finish
 * followed by a step back has to leave the reader exactly where they were,
 * because the step back IS the undo for a finish pressed by mistake.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  finishKhatmahPortion,
  getQuranState,
  khatmahAyahsRead,
  khatmahCurrentPortion,
  khatmahDay,
  khatmahPortion,
  setKhatmahPosition,
  startKhatmah,
  stepKhatmahBack,
} from '../src/quran/quranState';
import { TOTAL_AYAHS } from '../src/quran/ayahIndex';

const active = () => activeKhatmah(getQuranState())!;

describe('finishing the portion in hand', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('reads it to its last ayah and no further', () => {
    finishKhatmahPortion();
    const plan = active();
    expect(khatmahAyahsRead(plan)).toBe(khatmahPortion(plan, 1).to);
  });

  it('leaves the next one in hand, so tomorrow is available tonight', () => {
    finishKhatmahPortion();
    expect(khatmahCurrentPortion(active()).day).toBe(2);
  });

  it('still reads as a finished day, with nothing extra yet', () => {
    finishKhatmahPortion();
    const day = khatmahDay(active());
    expect(day.portion.day).toBe(1);
    expect(day.done).toBe(true);
    expect(day.extra).toBe(0);
  });

  it('reads the next one ahead when pressed again the same day', () => {
    finishKhatmahPortion();
    finishKhatmahPortion();
    const plan = active();
    expect(khatmahCurrentPortion(plan).day).toBe(3);
    // The DAY is still the first portion — the second was read ahead.
    const day = khatmahDay(plan);
    expect(day.portion.day).toBe(1);
    expect(day.done).toBe(true);
    expect(day.extra).toBe(khatmahPortion(plan, 2).to - khatmahPortion(plan, 1).to);
  });

  it('drops a pin the reader has now read past', () => {
    setKhatmahPosition(2, 100, 15);
    finishKhatmahPortion();
    expect(active().position).toBeNull();
  });

  it('completes the plan on the last portion', () => {
    __resetQuranStateForTests();
    startKhatmah(1);
    finishKhatmahPortion();
    const done = getQuranState().khatmah[0];
    expect(khatmahAyahsRead(done)).toBe(TOTAL_AYAHS);
    expect(done.completedAt).not.toBeNull();
    expect(activeKhatmah(getQuranState())).toBeUndefined();
  });
});

describe('stepping back a portion', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('undoes a finish exactly', () => {
    const before = khatmahAyahsRead(active());
    finishKhatmahPortion();
    stepKhatmahBack();
    expect(khatmahAyahsRead(active())).toBe(before);
    expect(khatmahCurrentPortion(active()).day).toBe(1);
  });

  it('puts the previous portion back in hand from the middle of one', () => {
    finishKhatmahPortion(); // day 1 done, day 2 in hand
    finishKhatmahPortion(); // day 2 done, day 3 in hand
    stepKhatmahBack();
    const plan = active();
    expect(khatmahCurrentPortion(plan).day).toBe(2);
    expect(khatmahAyahsRead(plan)).toBe(khatmahPortion(plan, 1).to);
  });

  it('walks further back when pressed again', () => {
    finishKhatmahPortion();
    finishKhatmahPortion();
    finishKhatmahPortion();
    stepKhatmahBack();
    stepKhatmahBack();
    expect(khatmahCurrentPortion(active()).day).toBe(2);
  });

  it('stops at the beginning rather than going negative', () => {
    stepKhatmahBack();
    stepKhatmahBack();
    const plan = active();
    expect(khatmahAyahsRead(plan)).toBe(0);
    expect(khatmahCurrentPortion(plan).day).toBe(1);
  });

  it('moves the day with it, so no day is claimed that was stepped out of', () => {
    finishKhatmahPortion();
    expect(khatmahDay(active()).done).toBe(true);
    stepKhatmahBack();
    const day = khatmahDay(active());
    expect(day.portion.day).toBe(1);
    expect(day.done).toBe(false);
    expect(day.read).toBe(0);
    expect(day.extra).toBe(0);
  });

  it('drops a pin left ahead of the rewind', () => {
    finishKhatmahPortion();
    finishKhatmahPortion();
    setKhatmahPosition(3, 1, 50);
    stepKhatmahBack();
    expect(active().position).toBeNull();
  });
});

describe('reading ahead and coming back', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('never loses the reader between a finish and a step back', () => {
    // Ten finishes and ten steps back land exactly where we started, which
    // is the property that matters: the pair is reversible.
    for (let i = 0; i < 10; i++) finishKhatmahPortion();
    expect(khatmahCurrentPortion(active()).day).toBe(11);
    for (let i = 0; i < 10; i++) stepKhatmahBack();
    const plan = active();
    expect(khatmahAyahsRead(plan)).toBe(0);
    expect(khatmahCurrentPortion(plan).day).toBe(1);
  });
});
