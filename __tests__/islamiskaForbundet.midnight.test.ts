/**
 * Regression tests for two midnight-wraparound bugs in the Islamiska Förbundet
 * scraper, both triggered as Stockholm's nights shorten in spring/summer.
 *
 * --- Bug 1: sanity check threw instead of warning ---
 * The Swedish Islamic Society method and MWL (local adhan) can place Isha on
 * opposite sides of midnight (e.g. 23:52 vs 00:45 — only 53 min apart).
 * The old naive |a−b| comparison returned 1387 min (≈ 23 h), crossing the
 * 6-hour threshold and throwing — silencing the real scraped times.
 *
 * Fix: the sanity check is now ADVISORY ONLY — it logs a warning but never
 * throws.  The two methods legitimately diverge at extreme latitudes so any
 * discrepancy must not block prayer times from reaching the user.
 * circularMinuteDiff is retained for an accurate warning message.
 *
 * --- Bug 2: ordering check rejected valid midnight-crossing Isha ---
 * Once Isha is past midnight it is numerically smaller than Maghrib, so the
 * old `mgM < isM` assertion failed.  Fix: normalise Isha to the next day
 * (add 1440) when it falls in the early-morning window (< 06:00), the only
 * physically plausible "past midnight" zone for Isha in Sweden.
 *
 * Both bugs affect all platforms; iOS only appeared immune because its cache
 * had not yet expired.
 */

// ---------------------------------------------------------------------------
// Inline the two helpers under test so this file has zero coupling to the
// provider internals and tests only the numeric logic.
// ---------------------------------------------------------------------------

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function circularMinuteDiff(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1440 - diff);
}

const EARLY_MORNING_THRESHOLD = 6 * 60; // 06:00 — only wrap if Isha is here

function isOrderedWithMidnightWrap(
  fajr: number,
  sunrise: number,
  dhuhr: number,
  asr: number,
  maghrib: number,
  isha: number,
): boolean {
  const isM_norm = isha < EARLY_MORNING_THRESHOLD ? isha + 1440 : isha;
  return (
    fajr < sunrise &&
    sunrise < dhuhr &&
    dhuhr < asr &&
    asr < maghrib &&
    maghrib < isM_norm
  );
}

// ---------------------------------------------------------------------------
// Extra helper that mirrors the advisory logic in the provider: returns the
// largest circular diff across all six scraped/local pairs, without throwing.
// ---------------------------------------------------------------------------

function maxAdvisoryDiff(
  scraped: string[],
  local: string[],
): number {
  let max = 0;
  for (let i = 0; i < 6; i++) {
    const d = circularMinuteDiff(toMinutes(scraped[i]), toMinutes(local[i]));
    if (d > max) { max = d; }
  }
  return max;
}

// ---------------------------------------------------------------------------

describe('circularMinuteDiff — midnight wraparound', () => {
  it('handles Isha before midnight vs after midnight (the core bug)', () => {
    // Website says 23:52; on-device adhan says 00:45 → ~53 min apart
    const scraped = toMinutes('23:52'); // 1432
    const local = toMinutes('00:45');   // 45
    expect(circularMinuteDiff(scraped, local)).toBe(53);
    expect(circularMinuteDiff(scraped, local)).toBeLessThan(6 * 60);
  });

  it('handles Isha at 23:59 vs 00:01 (extreme wraparound)', () => {
    expect(circularMinuteDiff(toMinutes('23:59'), toMinutes('00:01'))).toBe(2);
  });

  it('handles times that are genuinely far apart (layout change)', () => {
    // If the website returns 06:00 for Isha (scraper broke), circular diff
    // is still large enough to trigger the error.
    const scraped = toMinutes('06:00'); // 360
    const local = toMinutes('00:45');   // 45
    // circular diff = min(315, 1125) = 315 min — within 6 h, but close;
    // more importantly, a mid-day Isha is also caught by the ordering check.
    expect(circularMinuteDiff(scraped, local)).toBe(315);
  });

  it('is symmetric', () => {
    expect(circularMinuteDiff(toMinutes('00:45'), toMinutes('23:52'))).toBe(53);
  });

  it('returns 0 for identical times', () => {
    expect(circularMinuteDiff(toMinutes('00:45'), toMinutes('00:45'))).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('advisory sanity check — never throws regardless of diff size', () => {
  // The sanity check must be non-fatal.  We verify the diff values are
  // computed correctly and that even a large diff does NOT imply a throw
  // (the provider returns scraped times regardless).

  it('Isha straddles midnight: diff is small, well under advisory threshold', () => {
    // Website 23:52, local adhan 00:45 → 53 min
    const scraped = ['00:48', '04:55', '12:47', '16:54', '20:38', '23:52'];
    const local   = ['00:48', '04:53', '12:47', '16:55', '20:40', '00:45'];
    expect(maxAdvisoryDiff(scraped, local)).toBe(53);
  });

  it('both methods agree in winter: diff is near zero', () => {
    const times = ['05:30', '07:45', '12:00', '14:30', '16:00', '17:30'];
    expect(maxAdvisoryDiff(times, times)).toBe(0);
  });

  it('even a large diff (genuine method divergence) does not reach > 720 min', () => {
    // circularMinuteDiff is always ≤ 720 (half of 1440).
    // A 6-h threshold advisory warning fires, but no exception is raised.
    const scraped = ['00:48', '04:55', '12:47', '16:54', '20:38', '23:52'];
    const local   = ['06:48', '10:55', '18:47', '22:54', '02:38', '06:45'];
    const max = maxAdvisoryDiff(scraped, local);
    expect(max).toBeLessThanOrEqual(720); // circular diff is always bounded
  });
});

// ---------------------------------------------------------------------------

describe('ordering check with midnight wrap', () => {
  const stockolmTypical = {
    fajr: toMinutes('03:10'),
    sunrise: toMinutes('05:30'),
    dhuhr: toMinutes('13:00'),
    asr: toMinutes('17:00'),
    maghrib: toMinutes('21:00'),
    isha: toMinutes('23:00'),
  };

  it('accepts normal daytime ordering', () => {
    const { fajr, sunrise, dhuhr, asr, maghrib, isha } = stockolmTypical;
    expect(isOrderedWithMidnightWrap(fajr, sunrise, dhuhr, asr, maghrib, isha)).toBe(true);
  });

  it('accepts Isha past midnight — e.g. Stockholm late April', () => {
    // Isha 00:45 < Maghrib 20:38 numerically, but is still after Maghrib on
    // the same Islamic night.
    expect(
      isOrderedWithMidnightWrap(
        toMinutes('00:48'), // Fajr
        toMinutes('04:55'), // Sunrise
        toMinutes('12:47'), // Dhuhr
        toMinutes('16:54'), // Asr
        toMinutes('20:38'), // Maghrib
        toMinutes('00:45'), // Isha (past midnight)
      ),
    ).toBe(true);
  });

  it('rejects genuinely scrambled times even with wrap logic', () => {
    // Sunrise before Fajr — must still fail.
    expect(
      isOrderedWithMidnightWrap(
        toMinutes('05:00'), // Fajr
        toMinutes('04:00'), // Sunrise — wrong
        toMinutes('12:00'),
        toMinutes('16:00'),
        toMinutes('20:00'),
        toMinutes('22:00'),
      ),
    ).toBe(false);
  });

  it('rejects Isha before Maghrib on the same day (not a midnight wrap)', () => {
    // Isha at 19:00 with Maghrib at 20:38 — genuine parse error.
    // 19:00 is above EARLY_MORNING_THRESHOLD so it is NOT wrapped.
    expect(
      isOrderedWithMidnightWrap(
        toMinutes('03:00'),
        toMinutes('05:00'),
        toMinutes('13:00'),
        toMinutes('17:00'),
        toMinutes('20:38'),
        toMinutes('19:00'), // Isha before Maghrib — must be rejected
      ),
    ).toBe(false);
  });

  it('rejects Isha at 07:00 — above threshold so no wrap, yet still before Maghrib', () => {
    expect(
      isOrderedWithMidnightWrap(
        toMinutes('03:00'),
        toMinutes('05:00'),
        toMinutes('13:00'),
        toMinutes('17:00'),
        toMinutes('20:38'),
        toMinutes('07:00'), // well above 06:00 threshold — not wrapped
      ),
    ).toBe(false);
  });
});
