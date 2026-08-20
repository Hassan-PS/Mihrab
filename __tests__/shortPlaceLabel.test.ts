import { shortPlaceLabel } from '../src/widget/shortPlaceLabel';
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';

describe('shortPlaceLabel', () => {
  it('keeps the locality out of a full postal address', () => {
    expect(
      shortPlaceLabel(
        'Stockholm, Stockholm Municipality, Stockholm County, 111 29, Sweden',
      ),
    ).toBe('Stockholm');
  });

  it('leaves a label that is already a city alone', () => {
    expect(shortPlaceLabel('Makkah')).toBe('Makkah');
  });

  it('does not halve the offline coordinate label', () => {
    // "59.33°" alone is not a place; the pair is.
    expect(shortPlaceLabel('59.33°, 18.07°')).toBe('59.33°, 18.07°');
    expect(shortPlaceLabel('-33.87°, 151.21°')).toBe('-33.87°, 151.21°');
  });

  it('keeps the four-decimal fallback the widget used to show', () => {
    expect(shortPlaceLabel('59.3293°, 18.0686°')).toBe('59.3293°, 18.0686°');
  });

  it('passes undefined and blank through as nothing', () => {
    expect(shortPlaceLabel(undefined)).toBeUndefined();
    expect(shortPlaceLabel('   ')).toBeUndefined();
  });

  it('trims, and falls back to the whole label when the first part is empty', () => {
    expect(shortPlaceLabel('  Kraków  ')).toBe('Kraków');
    expect(shortPlaceLabel(', Sweden')).toBe(', Sweden');
  });
});

describe('buildWidgetPayload · locationName', () => {
  const timings = {
    Fajr: '05:10',
    Sunrise: '06:28',
    Dhuhr: '13:12',
    Asr: '16:57',
    Maghrib: '19:56',
    Isha: '21:13',
  };

  it('shortens the label before it reaches the widget', () => {
    const p = buildWidgetPayload(
      timings,
      timings,
      new Date('2026-08-19T12:00:00'),
      'Stockholm, Stockholm Municipality, Stockholm County, 111 29, Sweden',
    );
    expect(p.locationName).toBe('Stockholm');
  });

  it('leaves a coordinate label whole', () => {
    const p = buildWidgetPayload(
      timings,
      timings,
      new Date('2026-08-19T12:00:00'),
      '59.3293°, 18.0686°',
    );
    expect(p.locationName).toBe('59.3293°, 18.0686°');
  });
});
