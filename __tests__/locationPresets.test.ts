/**
 * locationPresets helpers — task #18.
 *
 * Pure CRUD over the saved-locations array: add, update (rename / re-label),
 * delete, find. Plus the input coercion that runs during settings load.
 */

import {
  addPreset,
  coerceLocationPresets,
  deletePreset,
  findPreset,
  MAX_LOCATION_PRESETS,
  newPresetId,
  updatePreset,
} from '../src/settings/locationPresets';
import type { LocationPreset } from '../src/settings/types';

const HOME: LocationPreset = {
  id: 'a',
  name: 'Home',
  latitude: 59.33,
  longitude: 18.07,
  label: 'Stockholm, Sweden',
};
const WORK: LocationPreset = {
  id: 'b',
  name: 'Work',
  latitude: 59.35,
  longitude: 18.05,
};

describe('newPresetId', () => {
  test('generates collision-resistant ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(newPresetId());
    expect(ids.size).toBe(200);
  });

  test('all ids start with the loc_ prefix', () => {
    for (let i = 0; i < 20; i++) {
      expect(newPresetId().startsWith('loc_')).toBe(true);
    }
  });
});

describe('addPreset', () => {
  test('appends a new preset with a fresh id', () => {
    const result = addPreset([HOME], {
      name: 'Mosque',
      latitude: 59.34,
      longitude: 18.06,
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(HOME);
    expect(result[1].name).toBe('Mosque');
    expect(result[1].id).not.toBe(HOME.id);
  });

  test('trims whitespace from the name', () => {
    const result = addPreset([], {
      name: '  Home  ',
      latitude: 59.33,
      longitude: 18.07,
    });
    expect(result[0].name).toBe('Home');
  });

  test('rejects empty name (returns input unchanged)', () => {
    const result = addPreset([HOME], {
      name: '   ',
      latitude: 0,
      longitude: 0,
    });
    expect(result).toEqual([HOME]);
  });

  test('truncates name beyond 60 chars', () => {
    const long = 'A'.repeat(120);
    const result = addPreset([], { name: long, latitude: 1, longitude: 2 });
    expect(result[0].name.length).toBe(60);
  });

  test('enforces MAX_LOCATION_PRESETS cap', () => {
    let presets: LocationPreset[] = [];
    for (let i = 0; i < MAX_LOCATION_PRESETS; i++) {
      presets = addPreset(presets, {
        name: `P${i}`,
        latitude: i,
        longitude: i,
      });
    }
    expect(presets).toHaveLength(MAX_LOCATION_PRESETS);
    const overflow = addPreset(presets, {
      name: 'Extra',
      latitude: 0,
      longitude: 0,
    });
    expect(overflow).toBe(presets); // unchanged when at cap
  });

  test('does not mutate the input array', () => {
    const input = [HOME];
    addPreset(input, { name: 'New', latitude: 0, longitude: 0 });
    expect(input).toEqual([HOME]);
  });
});

describe('updatePreset', () => {
  test('renames the targeted preset only', () => {
    const result = updatePreset([HOME, WORK], 'a', { name: 'Casa' });
    expect(result[0].name).toBe('Casa');
    expect(result[1]).toBe(WORK);
  });

  test('ignores empty rename (preserves existing name)', () => {
    const result = updatePreset([HOME], 'a', { name: '   ' });
    expect(result[0].name).toBe('Home');
  });

  test('updates the label without touching the name', () => {
    const result = updatePreset([HOME], 'a', { label: 'New Label' });
    expect(result[0].name).toBe('Home');
    expect(result[0].label).toBe('New Label');
  });

  test('targeting a non-existent id is a no-op', () => {
    const result = updatePreset([HOME, WORK], 'zzz', { name: 'X' });
    expect(result).toEqual([HOME, WORK]);
  });

  test('does not mutate the input array', () => {
    const input = [HOME, WORK];
    updatePreset(input, 'a', { name: 'Casa' });
    expect(input[0].name).toBe('Home');
  });
});

describe('deletePreset', () => {
  test('removes the targeted preset', () => {
    const result = deletePreset([HOME, WORK], 'a');
    expect(result).toEqual([WORK]);
  });

  test('non-existent id is a no-op', () => {
    const result = deletePreset([HOME, WORK], 'zzz');
    expect(result).toEqual([HOME, WORK]);
  });

  test('does not mutate the input array', () => {
    const input = [HOME, WORK];
    deletePreset(input, 'a');
    expect(input).toHaveLength(2);
  });
});

describe('findPreset', () => {
  test('returns the matching preset', () => {
    expect(findPreset([HOME, WORK], 'b')).toBe(WORK);
  });

  test('returns undefined for missing / null / undefined / empty id', () => {
    expect(findPreset([HOME], 'zzz')).toBeUndefined();
    expect(findPreset([HOME], null)).toBeUndefined();
    expect(findPreset([HOME], undefined)).toBeUndefined();
    expect(findPreset([HOME], '')).toBeUndefined();
  });
});

describe('coerceLocationPresets', () => {
  test('returns [] for non-array input', () => {
    expect(coerceLocationPresets(null)).toEqual([]);
    expect(coerceLocationPresets(undefined)).toEqual([]);
    expect(coerceLocationPresets('not an array')).toEqual([]);
    expect(coerceLocationPresets({})).toEqual([]);
  });

  test('drops malformed entries silently', () => {
    const dirty = [
      HOME,
      { id: '', name: 'NoId', latitude: 0, longitude: 0 }, // empty id
      { id: 'x', name: '', latitude: 0, longitude: 0 }, // empty name
      { id: 'y', name: 'NaN', latitude: NaN, longitude: 0 }, // NaN coords
      { id: 'z', name: 'OutOfRange', latitude: 95, longitude: 0 }, // lat > 90
      WORK,
    ];
    const result = coerceLocationPresets(dirty);
    expect(result).toEqual([HOME, WORK]);
  });

  test('caps at MAX_LOCATION_PRESETS even if input is longer', () => {
    const big: unknown[] = [];
    for (let i = 0; i < MAX_LOCATION_PRESETS + 10; i++) {
      big.push({
        id: `id${i}`,
        name: `P${i}`,
        latitude: i % 90,
        longitude: i % 180,
      });
    }
    const result = coerceLocationPresets(big);
    expect(result).toHaveLength(MAX_LOCATION_PRESETS);
  });

  test('truncates oversized name and label fields', () => {
    const result = coerceLocationPresets([
      {
        id: 'a',
        name: 'A'.repeat(200),
        latitude: 1,
        longitude: 2,
        label: 'L'.repeat(500),
      },
    ]);
    expect(result[0].name.length).toBe(60);
    expect(result[0].label?.length).toBe(200);
  });
});
