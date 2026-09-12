/**
 * The times first launch shows while the user is still deciding.
 *
 * Two things are worth holding still here.
 *
 * The first is the sentinel. `manualLatitude` and `manualLongitude`
 * default to 0, and (0, 0) is a real point in the Gulf of Guinea that
 * computes perfectly valid nonsense. A preview screen that believed it
 * would confidently show a stranger somebody else's afternoon, which is
 * worse than showing nothing — so "no coordinates" must be a null the
 * screens render as a dash.
 *
 * The second is the whole argument for the school screen existing: that
 * the choice visibly moves ʿaṣr. If Ḥanafī and Shāfiʿī ever computed the
 * same time, the screen would be asking a question with no consequence.
 */
import {
  previewAsrByMadhab,
  previewCoords,
  previewDay,
  previewNightMarks,
} from '../src/onboarding/previewTimes';

/** Stockholm, where the app's author lives and the difference is large. */
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
/** A fixed spring day, so the assertions do not drift with the seasons. */
const DAY = new Date(2026, 3, 15);

const base = {
  locationMode: 'manual',
  manualLatitude: 0,
  manualLongitude: 0,
  calculationMethod: 'auto' as const,
};

const minutes = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};

describe('where the preview thinks the user is', () => {
  it('refuses the (0,0) sentinel', () => {
    expect(previewCoords(base)).toBeNull();
  });

  it('refuses coordinates that are not numbers', () => {
    expect(
      previewCoords({ ...base, manualLatitude: NaN, manualLongitude: 5 }),
    ).toBeNull();
    expect(
      previewCoords({
        ...base,
        manualLatitude: undefined as unknown as number,
        manualLongitude: 5,
      }),
    ).toBeNull();
  });

  it('reads the manual pair in manual mode', () => {
    expect(
      previewCoords({
        ...base,
        manualLatitude: 59.3,
        manualLongitude: 18.1,
        lastFetchedLatitude: 1,
        lastFetchedLongitude: 1,
      }),
    ).toEqual({ latitude: 59.3, longitude: 18.1 });
  });

  it('reads the last GPS fix in automatic mode', () => {
    // In automatic mode the manual pair is stale or unset; the fix is
    // what `usePrayerDay` persisted.
    expect(
      previewCoords({
        ...base,
        locationMode: 'automatic',
        manualLatitude: 59.3,
        manualLongitude: 18.1,
        lastFetchedLatitude: 41.9,
        lastFetchedLongitude: 12.5,
      }),
    ).toEqual({ latitude: 41.9, longitude: 12.5 });
  });

  it('refuses automatic mode with no fix yet', () => {
    expect(
      previewCoords({ ...base, locationMode: 'automatic' }),
    ).toBeNull();
  });
});

describe('asr, by school', () => {
  const asr = previewAsrByMadhab(STOCKHOLM, {
    date: DAY,
    calculationMethod: 'auto',
  });

  it('puts the Hanafi asr meaningfully later', () => {
    // The entire reason the school screen shows a time rather than
    // describing a shadow ratio. Three quarters of an hour at this
    // latitude and season; the assertion is deliberately loose about how
    // much, and strict about the direction.
    expect(minutes(asr.hanafi)).toBeGreaterThan(minutes(asr.shafii) + 30);
  });

  it('gives the other three the same answer', () => {
    // Four names, two computed answers — `asrSchoolFor` encodes exactly
    // that, and anything else here would mean it had been bypassed.
    expect(asr.maliki).toBe(asr.shafii);
    expect(asr.hanbali).toBe(asr.shafii);
  });

  it('agrees with the day it computes', () => {
    const day = previewDay(STOCKHOLM, {
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    expect(day.Asr).toBe(asr.shafii);
  });
});

describe('the night marks on the shelf', () => {
  it('are clock times', () => {
    const marks = previewNightMarks(STOCKHOLM, {
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    expect(marks.Midnight).toMatch(/^\d{2}:\d{2}$/);
    expect(marks.Lastthird).toMatch(/^\d{2}:\d{2}$/);
  });

  it('put the last third after Islamic midnight, wrap included', () => {
    // Both belong to the same night, in that order — but the night runs
    // from Maghrib to Fajr and either mark can land on the far side of
    // 00:00. In Stockholm in April Islamic midnight is before midnight
    // and the last third is after it, so a naive clock comparison reads
    // 01:00 as "earlier" than 23:15. `fromMinutes` wraps into [0, 1440)
    // on purpose: these are clock times on their own calendar day.
    const marks = previewNightMarks(STOCKHOLM, {
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const midnight = minutes(marks.Midnight);
    let lastThird = minutes(marks.Lastthird);
    if (lastThird < midnight) lastThird += 1440;
    expect(lastThird).toBeGreaterThan(midnight);
    // And within one night of it, not a day away.
    expect(lastThird - midnight).toBeLessThan(6 * 60);
  });
});
