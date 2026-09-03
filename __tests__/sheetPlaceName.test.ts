/**
 * The place name on the shared month sheet.
 *
 * It used to print four decimal places of latitude and longitude, which
 * tells a reader nothing they can use and tells a stranger where the
 * sender lives to about ten metres. Then it printed two decimals of them,
 * which is kinder and still not a place — because the coordinate was
 * reaching it disguised as the city's name, from a registry that writes
 * one whenever the geocoder fails.
 */
import { sheetPlaceName } from '../src/share/sheetPlaceName';

const at = (over: Partial<Parameters<typeof sheetPlaceName>[0]> = {}) =>
  sheetPlaceName({
    manual: false,
    latitude: 59.3293,
    longitude: 18.0686,
    ...over,
  });

/** The middle of the North Atlantic — no listed city within 75 km of it. */
const nowhere = { latitude: 40, longitude: -40 };

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
    // A manual location with no label must not borrow the GPS city — but it
    // may still be named by where it IS.
    expect(at({ manual: true, autoLabel: 'Stockholm' })).toBe('Stockholm');
    expect(at({ ...nowhere, manual: true, autoLabel: 'Stockholm' })).toBe(
      '40.00°, -40.00°',
    );
  });

  it('names the nearest listed city when no label has arrived', () => {
    // The whole complaint: a sheet that says 59.33°, 18.07° where the city
    // belongs. The app ships coordinates for a couple of hundred cities and
    // can answer this without a network.
    expect(at()).toBe('Stockholm');
    expect(at({ autoLabel: undefined })).toBe('Stockholm');
    expect(at({ autoLabel: '   ' })).toBe('Stockholm');
  });

  it('sees through a coordinate stored as the city name', () => {
    // What the registry writes when it cannot geocode a fix. It is not a
    // name, and it must not pre-empt one.
    expect(at({ autoLabel: '59.33°, 18.07°' })).toBe('Stockholm');
    expect(at({ manual: true, manualLabel: '59.33°, 18.07°' })).toBe(
      'Stockholm',
    );
  });

  it('falls back to coordinates only where nothing is near, and to two decimals', () => {
    // ~1 km: enough to say roughly where, not enough to say whose house.
    expect(at(nowhere)).toBe('40.00°, -40.00°');
    expect(at(nowhere)).not.toContain('40.0000');
  });
});
