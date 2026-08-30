/**
 * Which source covers where, as a table rather than a chain of ifs.
 *
 * `getEffectiveDataProvider` used to hardcode Sweden twice — once in the
 * automatic branch and once in the manual-pin guard — which was fine while
 * Sweden was the only country-specific source and would have needed editing
 * in step for every one added after. These tests pin the behaviour that
 * matters so the table can grow without the logic being rewritten.
 */
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import {
  REGIONAL_PROVIDER_REGIONS,
  isRegionalProvider,
  regionalProviderCovers,
  regionalProviderForCoords,
} from '../src/settings/regionalProviders';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };
const LONDON = { latitude: 51.5072, longitude: -0.1276 };

describe('the table', () => {
  it('covers both countries that have a published source', () => {
    expect(REGIONAL_PROVIDER_REGIONS.map(r => r.id).sort()).toEqual([
      'habous',
      'islamiska_forbundet',
    ]);
  });

  it('names the source for a coordinate, or nothing', () => {
    expect(regionalProviderForCoords(STOCKHOLM)).toBe('islamiska_forbundet');
    expect(regionalProviderForCoords(CASABLANCA)).toBe('habous');
    expect(regionalProviderForCoords(LONDON)).toBeNull();
    expect(regionalProviderForCoords(null)).toBeNull();
  });

  it('knows which providers are country-specific', () => {
    expect(isRegionalProvider('habous')).toBe(true);
    expect(isRegionalProvider('islamiska_forbundet')).toBe(true);
    expect(isRegionalProvider('aladhan')).toBe(false);
    expect(isRegionalProvider('local_adhan')).toBe(false);
  });

  it('treats a global source as covering everywhere', () => {
    expect(regionalProviderCovers('aladhan', CASABLANCA)).toBe(true);
    expect(regionalProviderCovers('local_adhan', STOCKHOLM)).toBe(true);
  });

  it('leaves a pick alone when the location is unknown', () => {
    // No coordinate yet is not evidence of being out of region, and
    // redirecting on it would change the user's source on every cold start.
    expect(regionalProviderCovers('habous', null)).toBe(true);
    expect(regionalProviderCovers('islamiska_forbundet', null)).toBe(true);
  });
});

describe('automatic mode follows the user', () => {
  it.each([
    ['Sweden', STOCKHOLM, 'islamiska_forbundet'],
    ['Morocco', CASABLANCA, 'habous'],
    ['anywhere else', LONDON, 'aladhan'],
  ])('in %s', (_where, coords, expected) => {
    expect(getEffectiveDataProvider(true, 'aladhan', coords)).toBe(expected);
  });

  it('falls back to the global source with no location', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', null)).toBe('aladhan');
  });
});

describe('a manual pick is honoured, with one guard', () => {
  it('keeps a regional pick inside its own country', () => {
    expect(getEffectiveDataProvider(false, 'habous', CASABLANCA)).toBe('habous');
    expect(getEffectiveDataProvider(false, 'islamiska_forbundet', STOCKHOLM)).toBe(
      'islamiska_forbundet',
    );
  });

  it('redirects a regional pick once the user has left', () => {
    // The source only holds its own country's cities and maps anything else
    // to its nearest listed one, so a Moroccan table would otherwise be
    // presented as a Swedish user's own.
    expect(getEffectiveDataProvider(false, 'habous', STOCKHOLM)).toBe('aladhan');
    expect(getEffectiveDataProvider(false, 'islamiska_forbundet', CASABLANCA)).toBe(
      'aladhan',
    );
    expect(getEffectiveDataProvider(false, 'habous', LONDON)).toBe('aladhan');
  });

  it('does not force a regional source on someone who chose otherwise', () => {
    // Being in Morocco does not overrule a deliberate pick of something
    // else. That direction is automatic mode's job.
    expect(getEffectiveDataProvider(false, 'aladhan', CASABLANCA)).toBe('aladhan');
    expect(getEffectiveDataProvider(false, 'local_adhan', CASABLANCA)).toBe('local_adhan');
  });

  it('leaves the pick untouched until a location is known', () => {
    expect(getEffectiveDataProvider(false, 'habous', null)).toBe('habous');
  });
});
