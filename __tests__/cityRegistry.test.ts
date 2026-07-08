/**
 * City registry — the "be resourceful about location changes" logic.
 *
 * Covers the three behaviours the user asked for:
 *   • moving within a city keeps a stable anchor (→ no re-download);
 *   • a city change is detected and flagged;
 *   • retention: pass-through cities (<1 day) drop after a day, cities you
 *     stayed in (>1 day, "promoted") survive a week, the active city never
 *     drops.
 */
import {
  coarseBucketId,
  cityIdFromLocality,
  nearestCityWithin,
  resolveActiveCity,
  sweepRetention,
  emptyRegistry,
  PROMOTE_AFTER_MS,
  type CityRegistry,
  type CityEntry,
} from '../src/prayer/cityRegistry';
import { distanceKm } from '../src/utils/coords';

const STHLM = { lat: 59.3293, lng: 18.0686 };
const GBG = { lat: 57.7089, lng: 11.9746 }; // Gothenburg, ~400 km away

const loc = (city: string, cc = 'SE') => ({ city, countryCode: cc });

describe('distanceKm', () => {
  it('is ~0 for identical points', () => {
    expect(distanceKm(STHLM.lat, STHLM.lng, STHLM.lat, STHLM.lng)).toBeCloseTo(
      0,
      5,
    );
  });
  it('Stockholm→Gothenburg is a few hundred km', () => {
    const d = distanceKm(STHLM.lat, STHLM.lng, GBG.lat, GBG.lng);
    expect(d).toBeGreaterThan(350);
    expect(d).toBeLessThan(450);
  });
});

describe('id helpers', () => {
  it('coarseBucketId is stable within ~11 km and differs across cities', () => {
    const a = coarseBucketId(STHLM.lat, STHLM.lng);
    const b = coarseBucketId(STHLM.lat + 0.02, STHLM.lng + 0.02); // ~2 km
    expect(a).toBe(b);
    expect(coarseBucketId(GBG.lat, GBG.lng)).not.toBe(a);
  });
  it('cityIdFromLocality normalises name + country', () => {
    expect(cityIdFromLocality(loc('Stockholm')).cityId).toBe('SE:stockholm');
    expect(cityIdFromLocality(loc('Stockholm')).displayName).toBe('Stockholm');
    expect(cityIdFromLocality(loc('New York', 'US')).cityId).toBe(
      'US:new york',
    );
  });
});

describe('resolveActiveCity', () => {
  it('registers a brand-new city and marks it active', () => {
    const r = resolveActiveCity(emptyRegistry(), STHLM.lat, STHLM.lng, loc('Stockholm'));
    expect(r.isNew).toBe(true);
    expect(r.changedCity).toBe(true);
    expect(r.registry.activeCityId).toBe('SE:stockholm');
    expect(r.entry.anchorLat).toBeCloseTo(STHLM.lat, 6);
  });

  it('moving WITHIN a city keeps the same anchor + no city change', () => {
    let reg = resolveActiveCity(
      emptyRegistry(),
      STHLM.lat,
      STHLM.lng,
      loc('Stockholm'),
    ).registry;
    // Walk 3 km across town — reverse geocode still says Stockholm.
    const r2 = resolveActiveCity(
      reg,
      STHLM.lat + 0.03,
      STHLM.lng + 0.03,
      loc('Stockholm'),
    );
    expect(r2.changedCity).toBe(false);
    expect(r2.isNew).toBe(false);
    // Anchor stays the FIRST fix → prayer cache key never moves.
    expect(r2.entry.anchorLat).toBeCloseTo(STHLM.lat, 6);
    expect(r2.entry.anchorLng).toBeCloseTo(STHLM.lng, 6);
  });

  it('detects a city change', () => {
    const reg = resolveActiveCity(
      emptyRegistry(),
      STHLM.lat,
      STHLM.lng,
      loc('Stockholm'),
    ).registry;
    const r2 = resolveActiveCity(reg, GBG.lat, GBG.lng, loc('Göteborg'));
    expect(r2.changedCity).toBe(true);
    expect(r2.registry.activeCityId).toBe('SE:göteborg');
    // Previous city is retained in the registry.
    expect(r2.registry.cities['SE:stockholm']).toBeDefined();
  });

  it('offline (no locality) reuses the nearest known city', () => {
    const reg = resolveActiveCity(
      emptyRegistry(),
      STHLM.lat,
      STHLM.lng,
      loc('Stockholm'),
    ).registry;
    // A later fix 2 km away with geocoding unavailable → same city.
    const r2 = resolveActiveCity(reg, STHLM.lat + 0.02, STHLM.lng, null);
    expect(r2.changedCity).toBe(false);
    expect(r2.entry.cityId).toBe('SE:stockholm');
  });
});

describe('nearestCityWithin', () => {
  it('finds a city within range and rejects far ones', () => {
    const cities: Record<string, CityEntry> = {
      a: {
        cityId: 'a',
        displayName: 'Stockholm',
        anchorLat: STHLM.lat,
        anchorLng: STHLM.lng,
        firstSeenAt: '',
        lastActiveAt: '',
        promoted: false,
      },
    };
    expect(nearestCityWithin(cities, STHLM.lat + 0.02, STHLM.lng)?.cityId).toBe(
      'a',
    );
    expect(nearestCityWithin(cities, GBG.lat, GBG.lng)).toBeNull();
  });
});

describe('sweepRetention', () => {
  const mk = (over: Partial<CityEntry>): CityEntry => ({
    cityId: 'x',
    displayName: 'X',
    anchorLat: 1,
    anchorLng: 1,
    firstSeenAt: '2020-01-01T00:00:00.000Z',
    lastActiveAt: '2020-01-01T00:00:00.000Z',
    promoted: false,
    ...over,
  });

  const now = new Date('2020-01-10T00:00:00.000Z');

  it('never evicts the active city', () => {
    const reg: CityRegistry = {
      activeCityId: 'active',
      cities: {
        active: mk({ cityId: 'active', lastActiveAt: '2019-01-01T00:00:00.000Z' }),
      },
    };
    const { registry, evicted } = sweepRetention(reg, now);
    expect(evicted).toHaveLength(0);
    expect(registry.cities.active).toBeDefined();
  });

  it('drops a pass-through (un-promoted) city a day after leaving', () => {
    const reg: CityRegistry = {
      activeCityId: 'here',
      cities: {
        here: mk({ cityId: 'here', lastActiveAt: now.toISOString() }),
        // idle 2 days, never promoted → evicted.
        passed: mk({
          cityId: 'passed',
          promoted: false,
          lastActiveAt: '2020-01-08T00:00:00.000Z',
        }),
      },
    };
    const { registry, evicted } = sweepRetention(reg, now);
    expect(evicted.map(e => e.cityId)).toEqual(['passed']);
    expect(registry.cities.passed).toBeUndefined();
  });

  it('keeps a promoted city for a week, then drops it', () => {
    const base = (lastActiveAt: string): CityRegistry => ({
      activeCityId: 'here',
      cities: {
        here: mk({ cityId: 'here', lastActiveAt: now.toISOString() }),
        home: mk({ cityId: 'home', promoted: true, lastActiveAt }),
      },
    });
    // 3 days idle → kept.
    expect(
      sweepRetention(base('2020-01-07T00:00:00.000Z'), now).evicted,
    ).toHaveLength(0);
    // 8 days idle → dropped.
    expect(
      sweepRetention(base('2020-01-02T00:00:00.000Z'), now).evicted.map(
        e => e.cityId,
      ),
    ).toEqual(['home']);
  });

  it('promotes a city once active across a >24h span', () => {
    const first = new Date('2020-01-01T00:00:00.000Z');
    let reg = resolveActiveCity(emptyRegistry(), STHLM.lat, STHLM.lng, loc('Stockholm'), first).registry;
    const later = new Date(first.getTime() + PROMOTE_AFTER_MS + 1000);
    const r2 = resolveActiveCity(reg, STHLM.lat, STHLM.lng, loc('Stockholm'), later);
    expect(r2.entry.promoted).toBe(true);
  });
});
