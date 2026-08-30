/**
 * The city table the Moroccan dataset is matched on.
 *
 * Every coordinate here has been checked against the ministry's own Dhuhr,
 * which fixes longitude exactly. That check is not decoration: geocoding
 * placed 32 of 185 cities more than 25 km from where the ministry's times
 * say they are, several by hundreds of kilometres, and all of them still
 * inside Morocco where no bounding box would catch it. Marrakech came back
 * 232 km out, Ceuta in Casablanca, Melilla in Rabat.
 *
 * A wrong coordinate here does not fail loudly. It silently matches someone
 * to a different city and serves them its prayer times, which is the exact
 * harm the dataset exists to prevent — so a city whose position could not be
 * confirmed carries null rather than a guess, and cannot be matched at all.
 */
import cities from '../src/providers/data/moroccoCities.json';
import { nearestMoroccoCity } from '../src/providers/moroccoNearest';
import { isCoordinateInMorocco } from '../src/utils/moroccoRegion';

type City = { id: number; name: string; lat: number | null; lng: number | null; source?: string };
const all = cities as City[];
const located = all.filter(c => c.lat !== null && c.lng !== null);

describe('the table itself', () => {
  it('holds the ministry’s whole list', () => {
    expect(all).toHaveLength(191);
  });

  it('has unique ids, though not unique names', () => {
    // تاهلة appears twice, at 94 and 303. Keying anything by name loses one.
    const ids = all.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = all.map(c => c.name);
    expect(new Set(names).size).toBeLessThan(names.length);
  });

  it('keeps the ministry’s non-contiguous ids', () => {
    expect(all.some(c => c.id === 1)).toBe(true);
    expect(all.some(c => c.id === 169)).toBe(true);
    expect(all.some(c => c.id === 301)).toBe(true);
    expect(all.some(c => c.id === 322)).toBe(true);
    expect(all.some(c => c.id > 169 && c.id < 301)).toBe(false);
  });

  it('leaves a city unplaced rather than guessing', () => {
    // Both fields together or neither — a half-placed city would be matched
    // on whatever the other field happened to be.
    for (const c of all) {
      expect(`${c.name}: ${c.lat === null}/${c.lng === null}`).toBe(
        `${c.name}: ${c.lng === null}/${c.lng === null}`,
      );
    }
  });

  it('places most of them', () => {
    expect(located.length).toBeGreaterThanOrEqual(150);
  });
});

describe('every placed city is actually in Morocco', () => {
  it.each(located.map(c => [c.name, c] as const))('%s', (_name, city) => {
    expect(isCoordinateInMorocco(city.lat as number, city.lng as number)).toBe(true);
  });
});

describe('the cities people actually live in are right', () => {
  // Within 25 km of the published position of each. These are the ones a
  // wrong match would hurt most, and three of them were wrong before the
  // ministry's own times were used to check.
  const KNOWN: Array<[string, number, number]> = [
    ['الرباط', 34.0209, -6.8416],
    ['الدار البيضاء', 33.5731, -7.5898],
    ['مراكش', 31.6295, -7.9811],
    ['فاس', 34.0181, -5.0078],
    ['طنجة', 35.7595, -5.834],
    ['مكناس', 33.8935, -5.5473],
    ['أكادير', 30.4278, -9.5981],
    ['وجدة', 34.6867, -1.9114],
    ['تطوان', 35.5711, -5.3724],
    ['سبتة', 35.8894, -5.3213],
    ['مليلية', 35.2923, -2.9381],
  ];

  function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  it.each(KNOWN)('%s', (name, lat, lng) => {
    const city = all.find(c => c.name === name);
    expect(city).toBeDefined();
    expect(`${name} placed`).toBe(city!.lat === null ? `${name} MISSING` : `${name} placed`);
    expect(km(lat, lng, city!.lat as number, city!.lng as number)).toBeLessThan(25);
  });

  it.each(KNOWN)('matching a phone in %s picks it', (name, lat, lng) => {
    const nearest = nearestMoroccoCity(lat, lng);
    expect(nearest).not.toBeNull();
    expect(`${name} → ${nearest!.name}`).toBe(`${name} → ${name}`);
  });
});

describe('matching outside coverage', () => {
  it('reports how far away the nearest city is, so the caller can refuse', () => {
    // Paris. The provider's distance cap is what turns this into a miss.
    const nearest = nearestMoroccoCity(48.8566, 2.3522);
    expect(nearest).not.toBeNull();
    expect(nearest!.distanceKm).toBeGreaterThan(1000);
  });
});
