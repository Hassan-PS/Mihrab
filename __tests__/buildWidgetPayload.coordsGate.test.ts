/**
 * Verifies the (0, 0) coordinate gate in buildWidgetPayload — task #4.
 *
 * The "lat ?? 0" footgun has shipped Ghana-coast prayer times in past versions.
 * CLAUDE.md flags it as a known footgun; this gate is the runtime tripwire that
 * prevents bad coords from reaching the widget regardless of upstream bugs.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';

const today = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

describe('buildWidgetPayload coordinate gate', () => {
  const now = new Date(2026, 3, 9, 14, 0, 0);

  it('throws when coords are exactly (0, 0)', () => {
    expect(() =>
      buildWidgetPayload(today, undefined, now, undefined, { lat: 0, lng: 0 }),
    ).toThrow(/0, 0/);
  });

  it('does not throw for valid coords', () => {
    expect(() =>
      buildWidgetPayload(today, undefined, now, undefined, {
        lat: 59.3293,
        lng: 18.0686,
      }),
    ).not.toThrow();
  });

  it('does not throw when coords are omitted (legacy callers)', () => {
    expect(() => buildWidgetPayload(today, undefined, now)).not.toThrow();
  });

  it('does not throw for a single zero (e.g. equator longitude or prime meridian latitude)', () => {
    // Lat=0 alone is the equator; lng=0 alone is the prime meridian.
    // Only the EXACT (0, 0) combination is the canonical bug surface.
    expect(() =>
      buildWidgetPayload(today, undefined, now, undefined, { lat: 0, lng: 18 }),
    ).not.toThrow();
    expect(() =>
      buildWidgetPayload(today, undefined, now, undefined, { lat: 59, lng: 0 }),
    ).not.toThrow();
  });

  it('throws even when the rest of the input is otherwise valid', () => {
    // The gate fires before any other logic, so even with a complete and
    // sensible payload the (0, 0) path is rejected.
    expect(() =>
      buildWidgetPayload(
        today,
        today, // tomorrow available
        now,
        'Stockholm',
        { lat: 0, lng: 0 },
      ),
    ).toThrow();
  });
});
