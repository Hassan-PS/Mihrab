/**
 * Naming a place from the city lists the app already carries.
 *
 * Reverse geocoding is a network call, and when it fails the registry has
 * been writing coordinates into the name field ever since. It never needed
 * to: the prepared datasets ship coordinates for 108 Swedish and 164
 * Moroccan cities so they can decide whose times to serve, and the nearest
 * of those is a real answer that costs a couple of hundred haversines.
 */
import {
  NAMEABLE_CITY_KM,
  nearestKnownCityName,
} from '../src/prayer/nearestKnownCity';
import { isCoordinateLabel } from '../src/widget/shortPlaceLabel';

describe('nearestKnownCityName', () => {
  it('names a Swedish city from its own coordinates', () => {
    expect(nearestKnownCityName(59.3293, 18.0686)).toBe('Stockholm');
    expect(nearestKnownCityName(57.7089, 11.9746)).toBe('Göteborg');
  });

  it('names a Moroccan city too — both lists are consulted', () => {
    // Casablanca. The ministry's names are Arabic, which is the right label
    // for the reader who is there.
    const name = nearestKnownCityName(33.5731, -7.5898);
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/^[A-Za-z]/);
  });

  it('takes the nearer of the two lists, not the first one asked', () => {
    // Tangier is much closer to Morocco's list than to Sweden's.
    expect(nearestKnownCityName(35.7595, -5.834)).not.toBe('Stockholm');
  });

  it('names a suburb by the city it is near', () => {
    // Södertälje-ish: not in the list itself, well inside the radius.
    expect(nearestKnownCityName(59.2, 17.6)).toBeTruthy();
  });

  it('refuses to name somewhere nothing is near', () => {
    // The middle of the North Atlantic. A name here would be a lie, and the
    // dataset providers' 200–250 km is a rule about whose TIMES are close
    // enough, not about what a place is called.
    expect(nearestKnownCityName(40, -40)).toBeNull();
    expect(nearestKnownCityName(-33.87, 151.21)).toBeNull(); // Sydney
  });

  it('is bounded by a radius a person would recognise', () => {
    expect(NAMEABLE_CITY_KM).toBeLessThanOrEqual(100);
  });

  it('says nothing about a coordinate that is not one', () => {
    expect(nearestKnownCityName(NaN, 18)).toBeNull();
    expect(nearestKnownCityName(59, Infinity)).toBeNull();
  });
});

describe('isCoordinateLabel', () => {
  it('recognises what the registry writes when it cannot geocode', () => {
    expect(isCoordinateLabel('59.33°, 18.07°')).toBe(true);
    expect(isCoordinateLabel('-33.87°, 151.21°')).toBe(true);
    expect(isCoordinateLabel('  59.33°, 18.07°  ')).toBe(true);
  });

  it('leaves real places alone', () => {
    expect(isCoordinateLabel('Stockholm')).toBe(false);
    expect(isCoordinateLabel('Malmö, Skåne')).toBe(false);
    // A place whose name contains digits is still a place.
    expect(isCoordinateLabel('20 de Noviembre')).toBe(false);
    expect(isCoordinateLabel(undefined)).toBe(false);
    expect(isCoordinateLabel('')).toBe(false);
  });
});
