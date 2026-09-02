/**
 * The optional night times reach the widget as rows AND as the countdown.
 *
 * They used to be rows only: the payload carried Islamic Midnight so the card
 * could list it, and then refused to name it as `nextKey`, so a user who had
 * turned it on watched the widget count down to Fajr through the hour the
 * Last Third was arriving. A toggle means one thing on every surface.
 *
 * The interesting hour is still the one between Isha and Fajr — it is where
 * the surfaces used to disagree, and where an over-eager fix leaves the widget
 * with no next event at all.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';

const NIGHT = {
  Fajr: '02:37',
  Sunrise: '05:18',
  Dhuhr: '12:51',
  Asr: '16:51',
  Maghrib: '20:23',
  Isha: '22:55',
  Midnight: '23:30',
  Lastthird: '00:32',
};

const PLAIN = {
  Fajr: '02:37',
  Sunrise: '05:18',
  Dhuhr: '12:51',
  Asr: '16:51',
  Maghrib: '20:23',
  Isha: '22:55',
};

const at = (hhmm: string) => new Date(`2026-08-20T${hhmm}:00`);

describe('night times on the widget', () => {
  it('sends the rows', () => {
    const p = buildWidgetPayload(NIGHT, NIGHT, at('12:00'), 'Stockholm', undefined, undefined, [NIGHT, NIGHT]);
    expect(p.extraRows?.map(r => r.key)).toEqual(['Midnight', 'Lastthird']);
    expect(p.days?.[0]?.extraRows?.map(r => r.key)).toEqual([
      'Midnight',
      'Lastthird',
    ]);
  });

  it('counts down to one when it is what comes next', () => {
    const p = buildWidgetPayload(NIGHT, NIGHT, at('23:00'));
    expect(p.nextKey).toBe('Midnight');
    expect(p.nextPrayerTime).toBeTruthy();
  });

  it('still has something to count down to when they are off', () => {
    // The bug this guards: with the night times gone, the stretch between
    // Isha and Fajr must still name tomorrow's Fajr rather than nothing.
    const p = buildWidgetPayload(PLAIN, PLAIN, at('23:00'));
    expect(p.nextKey).toBe('Fajr');
    expect(p.nextPrayerTime).toBeTruthy();
  });

  it('omits extraRows entirely when the toggles are off', () => {
    const p = buildWidgetPayload(PLAIN, PLAIN, at('12:00'), undefined, undefined, undefined, [PLAIN, PLAIN]);
    expect(p.extraRows).toBeUndefined();
    expect(p.days?.[0]?.extraRows).toBeUndefined();
  });

  it('carries the full name, not just the abbreviation', () => {
    // The large widget draws a full-width row and "Qiyam" alone does not say
    // what it is the time of.
    const p = buildWidgetPayload(NIGHT, NIGHT, at('12:00'));
    const names = p.extraRows?.map(r => r.name);
    expect(names?.[0]).toBeTruthy();
    expect(names?.[0]).not.toBe(p.extraRows?.[0]?.abbr);
  });
});
