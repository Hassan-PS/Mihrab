/**
 * How each prayer announces itself — the rule, not the button.
 *
 * This used to be one decision for all five: pick an adhan and every
 * prayer plays it. Fajr at 04:30 and Maghrib are not the same decision,
 * so anyone who wanted the adhan for one and not the other turned it off
 * for all of them. The mode belongs to the prayer now.
 *
 * Two things must hold. The call to prayer is the five's alone — Sunrise
 * cannot reach it, whatever is on disk. And an install that upgrades
 * into this must sound exactly as it did until somebody touches a row.
 */
import {
  alertModeFor,
  coerceAlertModes,
  modesFor,
  nextAlertMode,
  SALAH_KEYS,
} from '../src/settings/alertModes';

describe('what a row may be set to', () => {
  it('offers the five all three', () => {
    for (const key of SALAH_KEYS) {
      expect(modesFor(key)).toEqual(['adhan', 'notification', 'silent']);
    }
  });

  /**
   * Sunrise and the night marks are times, not prayers. The call to
   * prayer is not theirs to make — the same rule `isNonPrayerEvent` has
   * enforced for the scheduler since the night marks shipped.
   */
  it('offers the times two, never the adhan', () => {
    for (const key of ['Sunrise', 'Midnight', 'Lastthird', 'Firstthird']) {
      expect(modesFor(key)).toEqual(['notification', 'silent']);
    }
  });

  it('cycles through them and comes back round', () => {
    expect(nextAlertMode('Fajr', 'adhan')).toBe('notification');
    expect(nextAlertMode('Fajr', 'notification')).toBe('silent');
    expect(nextAlertMode('Fajr', 'silent')).toBe('adhan');
    // Two-state rows just flip.
    expect(nextAlertMode('Sunrise', 'notification')).toBe('silent');
    expect(nextAlertMode('Sunrise', 'silent')).toBe('notification');
  });
});

describe('an install that has never touched a row', () => {
  /**
   * The map is sparse, and absent means "what the app did before". With
   * an adhan chosen that was the adhan on all five; with 'default' it
   * was the plain tone. Anything else would change what a user hears
   * because they installed an update.
   */
  it('sounds exactly as it did, adhan chosen', () => {
    for (const key of SALAH_KEYS) {
      expect(alertModeFor(key, {}, true)).toBe('adhan');
    }
  });

  it('sounds exactly as it did, no adhan chosen', () => {
    for (const key of SALAH_KEYS) {
      expect(alertModeFor(key, {}, false)).toBe('notification');
    }
  });

  it('leaves the times on the plain tone either way', () => {
    expect(alertModeFor('Sunrise', {}, true)).toBe('notification');
    expect(alertModeFor('Lastthird', {}, true)).toBe('notification');
  });
});

describe('a row that has been set', () => {
  it('keeps its own answer, whatever the global sound says', () => {
    expect(alertModeFor('Fajr', { Fajr: 'silent' }, true)).toBe('silent');
    expect(alertModeFor('Maghrib', { Maghrib: 'adhan' }, false)).toBe('adhan');
  });

  it('does not answer for its neighbours', () => {
    const modes = { Fajr: 'silent' as const };
    expect(alertModeFor('Fajr', modes, true)).toBe('silent');
    expect(alertModeFor('Dhuhr', modes, true)).toBe('adhan');
  });

  /** Even from a hand-edited blob, Sunrise cannot be given the adhan. */
  it('refuses an adhan stored against a time', () => {
    expect(alertModeFor('Sunrise', { Sunrise: 'adhan' }, true)).toBe(
      'notification',
    );
  });
});

describe('the stored map', () => {
  it('keeps what is valid and drops what is not', () => {
    expect(
      coerceAlertModes({
        Fajr: 'silent',
        Sunrise: 'adhan',
        Dhuhr: 'shout',
        Asr: 7,
      }),
    ).toEqual({ Fajr: 'silent' });
  });

  it('survives anything that is not a map', () => {
    expect(coerceAlertModes(undefined)).toEqual({});
    expect(coerceAlertModes(null)).toEqual({});
    expect(coerceAlertModes(['Fajr'])).toEqual({});
    expect(coerceAlertModes('Fajr')).toEqual({});
  });
});
