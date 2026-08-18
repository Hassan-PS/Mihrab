/**
 * The rules behind sunnah logging.
 *
 * This is the whole feature's arithmetic — what a tap does, when a day is
 * complete, how far the ring closes, and what breaks a streak. The UI is a
 * thin skin over these, so this is where the guarantees live.
 */
import {
  EMPTY_DAY,
  SUNNAH_RING_STEPS,
  SUNNAH_TOTAL,
  SUNNAH_UNITS,
  coerceSunnahLog,
  computeSunnahStreak,
  cycleSunnah,
  dayAt,
  fieldFor,
  isSunnahComplete,
  qiyamDays,
  setSunnah,
  sunnahCount,
  sunnahFraction,
  sunnahRingStep,
  type SunnahDay,
  type SunnahLog,
} from '../src/journal/sunnah';

const full: SunnahDay = {
  fajr: 1,
  dhuhr: 2,
  maghrib: 1,
  isha: 2,
  witr: true,
  qiyam: 0,
};

describe('the counts', () => {
  it('is 7 units a day: 1 + 2 + 0 + 1 + 2, plus Witr', () => {
    expect(SUNNAH_UNITS).toEqual({
      Fajr: 1,
      Dhuhr: 2,
      Asr: 0,
      Maghrib: 1,
      Isha: 2,
    });
    expect(SUNNAH_TOTAL).toBe(7);
  });

  it('gives Asr no field to write to at all', () => {
    expect(fieldFor('Asr')).toBeNull();
    expect(fieldFor('Fajr')).toBe('fajr');
    expect(fieldFor('Isha')).toBe('isha');
  });
});

describe('cycleSunnah', () => {
  it('logs then clears, for a one-unit prayer', () => {
    expect(cycleSunnah(0, 1)).toBe(1);
    expect(cycleSunnah(1, 1)).toBe(0);
  });

  it('counts one, two, then clears, for a two-unit prayer', () => {
    expect(cycleSunnah(0, 2)).toBe(1);
    expect(cycleSunnah(1, 2)).toBe(2);
    expect(cycleSunnah(2, 2)).toBe(0);
  });

  it('cannot leave zero when the prayer has no sunnah', () => {
    expect(cycleSunnah(0, 0)).toBe(0);
    expect(cycleSunnah(5, 0)).toBe(0);
  });

  it('always returns to zero within max+1 taps, for any max', () => {
    // The property that makes one tile enough: it is always undoable.
    for (let max = 1; max <= 6; max++) {
      let at = 0;
      for (let tap = 0; tap <= max; tap++) at = cycleSunnah(at, max);
      expect(at).toBe(0);
    }
  });

  it('never exceeds the maximum, whatever it is handed', () => {
    for (const bad of [-3, 0.5, 99]) {
      for (let max = 0; max <= 3; max++) {
        const out = cycleSunnah(bad, max);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('counting a day', () => {
  it('an untouched day is zero and incomplete', () => {
    expect(sunnahCount(EMPTY_DAY)).toBe(0);
    expect(sunnahFraction(EMPTY_DAY)).toBe(0);
    expect(isSunnahComplete(EMPTY_DAY)).toBe(false);
  });

  it('a full day is complete', () => {
    expect(sunnahCount(full)).toBe(SUNNAH_TOTAL);
    expect(sunnahFraction(full)).toBe(1);
    expect(isSunnahComplete(full)).toBe(true);
  });

  it('Witr alone is one of the seven', () => {
    expect(sunnahCount({ ...EMPTY_DAY, witr: true })).toBe(1);
  });

  it('is not completed by Qiyam — that would make a full day unreachable', () => {
    const lots = { ...full, witr: false, qiyam: 100 };
    expect(isSunnahComplete(lots)).toBe(false);
    expect(sunnahCount(lots)).toBe(SUNNAH_TOTAL - 1);
  });

  it('ignores a stored count above its prayer maximum', () => {
    // Defence in depth: the writer clamps, the reader clamps, and this
    // clamps again, because a 9 in `fajr` must never make a day 150% done.
    expect(sunnahCount({ ...EMPTY_DAY, fajr: 9 })).toBe(1);
    expect(sunnahFraction({ ...full, dhuhr: 99 })).toBe(1);
  });
});

describe('the ring', () => {
  it('draws nothing on an untouched day', () => {
    expect(sunnahRingStep(EMPTY_DAY)).toBe(0);
  });

  it('closes only on a complete day', () => {
    expect(sunnahRingStep(full)).toBe(SUNNAH_RING_STEPS);
    // One short is visibly not closed.
    expect(sunnahRingStep({ ...full, witr: false })).toBeLessThan(
      SUNNAH_RING_STEPS,
    );
  });

  it('never skips to full, and never sits at zero, in between', () => {
    for (let n = 1; n < SUNNAH_TOTAL; n++) {
      const day: SunnahDay = { ...EMPTY_DAY };
      let left = n;
      const fields: Array<['fajr' | 'dhuhr' | 'maghrib' | 'isha', number]> = [
        ['fajr', 1],
        ['dhuhr', 2],
        ['maghrib', 1],
        ['isha', 2],
      ];
      for (const [field, max] of fields) {
        const take = Math.min(left, max);
        day[field] = take;
        left -= take;
      }
      if (left > 0) day.witr = true;
      const step = sunnahRingStep(day);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThan(SUNNAH_RING_STEPS);
    }
  });

  it('never goes backwards as the day fills up', () => {
    let previous = 0;
    const day: SunnahDay = { ...EMPTY_DAY };
    const order: Array<() => void> = [
      () => { day.fajr = 1; },
      () => { day.dhuhr = 1; },
      () => { day.dhuhr = 2; },
      () => { day.maghrib = 1; },
      () => { day.isha = 1; },
      () => { day.isha = 2; },
      () => { day.witr = true; },
    ];
    for (const step of order) {
      step();
      const now = sunnahRingStep(day);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBe(SUNNAH_RING_STEPS);
  });
});

describe('setSunnah', () => {
  it('merges rather than replaces, so a sibling field survives', () => {
    // The journal's own upsert rebuilds its object and loses the note on it.
    // This must not repeat that.
    const log = setSunnah({}, '2026-08-18', { qiyam: 4 });
    const next = setSunnah(log, '2026-08-18', { fajr: 1 });
    expect(next['2026-08-18']).toEqual({
      ...EMPTY_DAY,
      fajr: 1,
      qiyam: 4,
    });
  });

  it('drops a day that has emptied out, rather than storing zeros forever', () => {
    const log = setSunnah({}, '2026-08-18', { fajr: 1 });
    expect(Object.keys(log)).toEqual(['2026-08-18']);
    const cleared = setSunnah(log, '2026-08-18', { fajr: 0 });
    expect(cleared['2026-08-18']).toBeUndefined();
    expect(Object.keys(cleared)).toEqual([]);
  });

  it('never mutates the log it was given', () => {
    const log = setSunnah({}, '2026-08-18', { fajr: 1 });
    const snapshot = JSON.stringify(log);
    setSunnah(log, '2026-08-18', { witr: true });
    setSunnah(log, '2026-08-19', { isha: 2 });
    expect(JSON.stringify(log)).toBe(snapshot);
  });

  it('leaves other days alone', () => {
    let log: SunnahLog = {};
    log = setSunnah(log, '2026-08-17', { witr: true });
    log = setSunnah(log, '2026-08-18', { fajr: 1 });
    expect(dayAt(log, '2026-08-17').witr).toBe(true);
    expect(dayAt(log, '2026-08-18').fajr).toBe(1);
  });
});

describe('coerceSunnahLog', () => {
  it('survives anything that is not a log', () => {
    for (const junk of [null, undefined, 0, 'x', [], [1, 2]]) {
      expect(coerceSunnahLog(junk)).toEqual({});
    }
  });

  it('clamps a count above its prayer maximum instead of dropping the day', () => {
    const out = coerceSunnahLog({ '2026-08-18': { fajr: 9, dhuhr: 7, isha: -2 } });
    expect(out['2026-08-18']).toEqual({
      ...EMPTY_DAY,
      fajr: 1,
      dhuhr: 2,
      isha: 0,
    });
  });

  it('keeps Qiyam uncapped — twenty rak’ah is not an error', () => {
    const out = coerceSunnahLog({ '2026-08-18': { qiyam: 20 } });
    expect(out['2026-08-18'].qiyam).toBe(20);
  });

  it('drops keys that are not dates, and days holding nothing', () => {
    const out = coerceSunnahLog({
      'not-a-date': { fajr: 1 },
      '2026-8-1': { fajr: 1 },
      '2026-08-18': { fajr: 0, witr: false, qiyam: 0 },
      '2026-08-19': { witr: true },
    });
    expect(Object.keys(out)).toEqual(['2026-08-19']);
  });

  it('round-trips a real log through JSON unchanged', () => {
    let log: SunnahLog = {};
    log = setSunnah(log, '2026-08-18', { ...full, qiyam: 3 });
    log = setSunnah(log, '2026-08-17', { dhuhr: 1 });
    expect(coerceSunnahLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
  });

  it('never produces a day that reads as more than complete', () => {
    // 200 random blobs, including impossible ones — the fraction must stay
    // inside 0…1 for every one of them, because it drives a drawn ring.
    let seed = 20260818;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 200; i++) {
      const blob = {
        '2026-08-18': {
          fajr: rand(9) - 2,
          dhuhr: rand(9) - 2,
          maghrib: rand(9) - 2,
          isha: rand(9) - 2,
          witr: rand(2) === 1,
          qiyam: rand(40) - 5,
        },
      };
      const day = dayAt(coerceSunnahLog(blob), '2026-08-18');
      const f = sunnahFraction(day);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(sunnahRingStep(day)).toBeLessThanOrEqual(SUNNAH_RING_STEPS);
      expect(sunnahRingStep(day)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the sunnah streak', () => {
  const NOW = new Date(2026, 7, 18, 9, 0, 0); // 18 Aug 2026, morning
  const complete = (log: SunnahLog, date: string) => setSunnah(log, date, full);

  it('is zero with nothing logged', () => {
    expect(computeSunnahStreak({}, NOW)).toBe(0);
  });

  it('counts consecutive complete days ending today', () => {
    let log: SunnahLog = {};
    for (const d of ['2026-08-16', '2026-08-17', '2026-08-18']) log = complete(log, d);
    expect(computeSunnahStreak(log, NOW)).toBe(3);
  });

  it('does NOT reset to zero just because today is unfinished', () => {
    // The whole reason this streak does not copy the prayer streak next door:
    // that one counts back from today and so reads "0 days" every morning.
    let log: SunnahLog = {};
    for (const d of ['2026-08-15', '2026-08-16', '2026-08-17']) log = complete(log, d);
    expect(computeSunnahStreak(log, NOW)).toBe(3);
    // Half of today changes nothing yet.
    log = setSunnah(log, '2026-08-18', { fajr: 1, dhuhr: 2 });
    expect(computeSunnahStreak(log, NOW)).toBe(3);
    // Finishing today extends it.
    log = complete(log, '2026-08-18');
    expect(computeSunnahStreak(log, NOW)).toBe(4);
  });

  it('breaks on a gap, and counts only the run nearest today', () => {
    let log: SunnahLog = {};
    for (const d of ['2026-08-10', '2026-08-11', '2026-08-12']) log = complete(log, d);
    for (const d of ['2026-08-16', '2026-08-17']) log = complete(log, d);
    expect(computeSunnahStreak(log, NOW)).toBe(2);
  });

  it('breaks on a day that is one short of complete', () => {
    let log: SunnahLog = {};
    log = complete(log, '2026-08-15');
    log = setSunnah(log, '2026-08-16', { ...full, witr: false });
    log = complete(log, '2026-08-17');
    expect(computeSunnahStreak(log, NOW)).toBe(1);
  });

  it('is not extended by Qiyam alone', () => {
    let log: SunnahLog = {};
    log = complete(log, '2026-08-17');
    log = setSunnah(log, '2026-08-16', { qiyam: 12 });
    expect(computeSunnahStreak(log, NOW)).toBe(1);
  });

  it('survives a month boundary', () => {
    const sept = new Date(2026, 8, 1, 9, 0, 0);
    let log: SunnahLog = {};
    for (const d of ['2026-08-30', '2026-08-31']) log = complete(log, d);
    expect(computeSunnahStreak(log, sept)).toBe(2);
  });

  it('is bounded — a clock that says 1970 cannot hang it', () => {
    let log: SunnahLog = {};
    for (let i = 0; i < 400; i++) {
      const d = new Date(2026, 7, 18);
      d.setDate(d.getDate() - i);
      log = complete(
        log,
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`,
      );
    }
    expect(computeSunnahStreak(log, NOW)).toBeLessThanOrEqual(366);
  });
});

describe('qiyamDays', () => {
  it('names only the days that hold any', () => {
    let log: SunnahLog = {};
    log = setSunnah(log, '2026-08-17', { qiyam: 1 });
    log = setSunnah(log, '2026-08-18', { fajr: 1 });
    expect(qiyamDays(log)).toEqual(new Set(['2026-08-17']));
  });
});
