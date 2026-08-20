/**
 * Islamic Midnight and the Last Third reach the widget as rows, and only the
 * Live Activity is allowed to count down to one.
 *
 * The interesting hour is the one between Isha and Islamic Midnight: that is
 * where the two surfaces disagree, and it is also where an over-eager fix
 * would leave the widget with no next event at all.
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
    const p = buildWidgetPayload(NIGHT, NIGHT, at('12:00'), 'Stockholm', undefined, undefined, [NIGHT, NIGHT], undefined, {
      nightCanBeNext: false,
    });
    expect(p.extraRows?.map(r => r.key)).toEqual(['Midnight', 'Lastthird']);
    expect(p.days?.[0]?.extraRows?.map(r => r.key)).toEqual([
      'Midnight',
      'Lastthird',
    ]);
  });

  it('never makes one of them the headline', () => {
    const p = buildWidgetPayload(NIGHT, NIGHT, at('23:00'), undefined, undefined, undefined, undefined, undefined, {
      nightCanBeNext: false,
    });
    expect(p.nextKey).not.toBe('Midnight');
    expect(p.nextKey).not.toBe('Lastthird');
  });

  it('still has something to count down to in that same hour', () => {
    // The bug this guards: filtering the ANSWER instead of the input leaves
    // nextKey null between Isha and Fajr — a blank headline all night.
    const p = buildWidgetPayload(NIGHT, NIGHT, at('23:00'), undefined, undefined, undefined, undefined, undefined, {
      nightCanBeNext: false,
    });
    expect(p.nextKey).toBe('Fajr');
    expect(p.nextPrayerTime).toBeTruthy();
  });

  it('leaves the Live Activity counting down to Islamic Midnight', () => {
    // Default (no opts) is the Live Activity's behaviour, unchanged.
    const p = buildWidgetPayload(NIGHT, NIGHT, at('23:00'));
    expect(p.nextKey).toBe('Midnight');
  });

  it('omits extraRows entirely when both toggles are off', () => {
    const p = buildWidgetPayload(PLAIN, PLAIN, at('12:00'), undefined, undefined, undefined, [PLAIN, PLAIN], undefined, {
      nightCanBeNext: false,
    });
    expect(p.extraRows).toBeUndefined();
    expect(p.days?.[0]?.extraRows).toBeUndefined();
  });

  it('carries the full name, not just the abbreviation', () => {
    // The large widget draws a full-width row and "Qiyam" alone does not say
    // what it is the time of.
    const p = buildWidgetPayload(NIGHT, NIGHT, at('12:00'), undefined, undefined, undefined, undefined, undefined, {
      nightCanBeNext: false,
    });
    const names = p.extraRows?.map(r => r.name);
    expect(names?.[0]).toBeTruthy();
    expect(names?.[0]).not.toBe(p.extraRows?.[0]?.abbr);
  });
});
