/**
 * The notification's "Log prayer" button, which for three versions
 * highlighted a row and wrote nothing.
 */
import {
  isLogActionId,
  prayerForPress,
  prayerFromActionId,
  targetDateForPress,
} from '../src/notifications/prayerLogAction';

const NOW = new Date(2026, 7, 10, 9, 0, 0);

describe('prayerFromActionId', () => {
  test('reads the prayer out of an Android action id', () => {
    expect(prayerFromActionId('journal-log-prayer:Maghrib')).toBe('Maghrib');
  });

  test('rejects ids belonging to other buttons', () => {
    expect(prayerFromActionId('adhan-stop')).toBeNull();
    expect(prayerFromActionId('log-day-all')).toBeNull();
    expect(prayerFromActionId(undefined)).toBeNull();
  });

  test('rejects a name that is not one of the five', () => {
    // Sunrise gets a notification but is not a prayer, and must never
    // reach the journal.
    expect(prayerFromActionId('journal-log-prayer:Sunrise')).toBeNull();
    expect(prayerFromActionId('journal-log-prayer:')).toBeNull();
  });
});

describe('isLogActionId', () => {
  test('covers both the Android and the bare iOS form', () => {
    expect(isLogActionId('journal-log-prayer')).toBe(true);
    expect(isLogActionId('journal-log-prayer:Isha')).toBe(true);
    expect(isLogActionId('journal-log-prayerish')).toBe(false);
    expect(isLogActionId('adhan-snooze')).toBe(false);
  });
});

describe('prayerForPress', () => {
  test('takes the prayer from the id when it has one', () => {
    expect(prayerForPress('journal-log-prayer:Asr', { prayer: 'Fajr' })).toBe(
      'Asr',
    );
  });

  test('falls back to the payload, which is how iOS has to work', () => {
    expect(prayerForPress('journal-log-prayer', { prayer: 'Fajr' })).toBe(
      'Fajr',
    );
  });

  test('is null when neither names a real prayer', () => {
    expect(
      prayerForPress('journal-log-prayer', { prayer: 'Sunrise' }),
    ).toBeNull();
    expect(prayerForPress('journal-log-prayer', undefined)).toBeNull();
  });
});

describe('targetDateForPress', () => {
  test('uses the date the alert was scheduled for', () => {
    expect(
      targetDateForPress({ targetDate: '2026-08-09' }, 'pt-123-Isha', NOW),
    ).toBe('2026-08-09');
  });

  test('an Isha answered after midnight still credits the day it was for', () => {
    // Fires 23:45 on the 9th, pressed 00:20 on the 10th. "Today" would
    // credit the 10th and leave the 9th blank — the one failure a record
    // must not have.
    const firedAt = new Date(2026, 7, 9, 23, 45, 0).getTime();
    const pressedAt = new Date(2026, 7, 10, 0, 20, 0);
    expect(targetDateForPress(undefined, `pt-${firedAt}-Isha`, pressedAt)).toBe(
      '2026-08-09',
    );
  });

  test('falls back to the id when the payload was lost to a cold start', () => {
    const firedAt = new Date(2026, 7, 8, 5, 12, 0).getTime();
    expect(targetDateForPress({}, `pt-${firedAt}-Fajr`, NOW)).toBe(
      '2026-08-08',
    );
  });

  test('ignores a malformed date in the payload rather than writing it', () => {
    const firedAt = new Date(2026, 7, 8, 5, 12, 0).getTime();
    expect(
      targetDateForPress({ targetDate: '9 August' }, `pt-${firedAt}-Fajr`, NOW),
    ).toBe('2026-08-08');
  });

  test('only then falls back to the clock', () => {
    expect(targetDateForPress(undefined, undefined, NOW)).toBe('2026-08-10');
    expect(targetDateForPress(undefined, 'eod-log-2026-08-09', NOW)).toBe(
      '2026-08-10',
    );
  });
});
