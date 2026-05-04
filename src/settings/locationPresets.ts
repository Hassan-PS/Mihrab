/**
 * Location-preset helpers — task #18.
 *
 * Pure CRUD over `LocationPreset[]`. Used by `LocationCard` (settings) and
 * the HomeScreen quick-switcher chip. Always returns NEW arrays — never
 * mutates input — so React state-update equality stays predictable.
 */

import type { LocationPreset } from './types';

/** Maximum saved presets. Beyond ~12 the picker UI becomes unwieldy on
 *  small screens; the limit also acts as a soft cap on PII storage size. */
export const MAX_LOCATION_PRESETS = 12;

/** Generate a stable opaque preset id. Uses Math.random — no need for
 *  cryptographic uniqueness, just collision-resistance within one user's
 *  list of <= MAX_LOCATION_PRESETS items. */
export function newPresetId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e10).toString(36);
  return `loc_${t}_${r}`;
}

/** Coerce arbitrary stored input into a clean preset list — drops malformed
 *  entries silently rather than throwing. Used during settings load. */
export function coerceLocationPresets(value: unknown): LocationPreset[] {
  if (!Array.isArray(value)) return [];
  const out: LocationPreset[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0) continue;
    if (typeof r.name !== 'string' || r.name.trim().length === 0) continue;
    if (typeof r.latitude !== 'number' || !Number.isFinite(r.latitude)) continue;
    if (typeof r.longitude !== 'number' || !Number.isFinite(r.longitude)) continue;
    if (r.latitude < -90 || r.latitude > 90) continue;
    if (r.longitude < -180 || r.longitude > 180) continue;
    out.push({
      id: r.id,
      name: r.name.trim().slice(0, 60),
      latitude: r.latitude,
      longitude: r.longitude,
      label: typeof r.label === 'string' ? r.label.slice(0, 200) : undefined,
    });
    if (out.length >= MAX_LOCATION_PRESETS) break;
  }
  return out;
}

/** Append a new preset; returns the updated list (caller persists via
 *  `updateSettings`). Trims name, ignores empty names, enforces the cap. */
export function addPreset(
  presets: LocationPreset[],
  draft: Omit<LocationPreset, 'id'>,
): LocationPreset[] {
  const name = draft.name.trim();
  if (!name) return presets;
  if (presets.length >= MAX_LOCATION_PRESETS) return presets;
  const next: LocationPreset = {
    id: newPresetId(),
    name: name.slice(0, 60),
    latitude: draft.latitude,
    longitude: draft.longitude,
    label: draft.label?.slice(0, 200),
  };
  return [...presets, next];
}

/** Update a preset's editable fields (name + label). Lat/lng changes go
 *  through "save current as new" instead of in-place editing — matches user
 *  expectation that "Home" stays as the saved coords until explicitly re-saved. */
export function updatePreset(
  presets: LocationPreset[],
  id: string,
  patch: Partial<Pick<LocationPreset, 'name' | 'label'>>,
): LocationPreset[] {
  return presets.map(p => {
    if (p.id !== id) return p;
    const name = patch.name?.trim();
    return {
      ...p,
      name: name && name.length > 0 ? name.slice(0, 60) : p.name,
      label: patch.label !== undefined ? patch.label.slice(0, 200) : p.label,
    };
  });
}

/** Remove a preset. Returns the new list. Caller is responsible for
 *  clearing `activeLocationPresetId` if the deleted preset was active. */
export function deletePreset(
  presets: LocationPreset[],
  id: string,
): LocationPreset[] {
  return presets.filter(p => p.id !== id);
}

/** Lookup helper. Returns undefined if id is empty/null/missing. */
export function findPreset(
  presets: LocationPreset[],
  id: string | undefined | null,
): LocationPreset | undefined {
  if (!id) return undefined;
  return presets.find(p => p.id === id);
}
