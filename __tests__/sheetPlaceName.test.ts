/**
 * The place name on the shared month sheet.
 *
 * It used to print four decimal places of latitude and longitude, which
 * tells a reader nothing they can use and tells a stranger where the
 * sender lives to about ten metres.
 */
import { sheetPlaceName } from '../src/share/sheetPlaceName';

const at = (over: Partial<Parameters<typeof sheetPlaceName>[0]> = {}) =>
  sheetPlaceName({
    manual: false,
    latitude: 59.3293,
    longitude: 18.0686,
    ...over,
  });

describe('naming the place a sheet is for', () => {
  it('uses the reverse-geocoded city in automatic mode', () => {
    expect(at({ autoLabel: 'Stockholm' })).toBe('Stockholm');
  });

  it('takes the locality out of a full postal address', () => {
    expect(
      at({
        autoLabel:
          'Stockholm, Stockholm Municipality, Stockholm County, 111 29, Sweden',
      }),
    ).toBe('Stockholm');
  });

  it('uses the chosen label in manual mode, not the automatic one', () => {
    expect(at({ manual: true, manualLabel: 'Makkah', autoLabel: 'Stockholm' }))
      .toBe('Makkah');
  });

  it('ignores the other mode’s label', () => {
    // A manual location with no label must not borrow the GPS city.
    expect(at({ manual: true, autoLabel: 'Stockholm' })).toBe('59.33°, 18.07°');
  });

  it('falls back to coordinates, but only two decimals of them', () => {
    // ~1 km: enough to say roughly where, not enough to say whose house.
    expect(at()).toBe('59.33°, 18.07°');
    expect(at()).not.toContain('59.3293');
  });

  it('does not print an empty name', () => {
    expect(at({ autoLabel: '   ' })).toBe('59.33°, 18.07°');
    expect(at({ autoLabel: undefined })).toBe('59.33°, 18.07°');
  });
});
