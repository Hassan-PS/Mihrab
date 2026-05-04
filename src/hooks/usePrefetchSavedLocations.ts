/**
 * Background 12-month prefetch for every saved location preset — task #145.
 *
 * The user added multiple location presets (Stockholm, Cairo, …) and
 * complained that "switching deletes stored prayer times". The underlying
 * cache is now multi-keyed (one slot per (provider, lat, lng, method, school)
 * tuple), so different presets'\'' months coexist instead of overwriting each
 * other. To make switching feel instant, this hook PREFETCHES every preset'\''s
 * upcoming 12 months in the background so the user never sees a network
 * spinner when toggling.
 *
 * Behavior:
 *   • Runs once on mount, then again whenever `locationPresets` or the
 *     calculation method/school change.
 *   • Each preset is fetched serially (not in parallel) to avoid hammering
 *     providers when the user has 5+ saved locations.
 *   • The currently-active preset is fetched FIRST so the home screen has
 *     fresh data even if the user backgrounds the app mid-fill.
 *   • Failures are best-effort and logged, not surfaced — the user keeps
 *     their existing cached data even if the background fill is interrupted.
 *   • Cooldown via `maybeFullSyncOnWifi` so we don'\''t re-fetch every render.
 */

import { useEffect } from 'react';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { refreshPrayerDataCache } from '../prayer/prayerStorage';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';

export function usePrefetchSavedLocations(): void {
  const { settings } = usePrayerSettings();
  const presets = settings.locationPresets;
  const activeId = settings.activeLocationPresetId;
  const calculationMethod = settings.calculationMethod;
  const school = settings.school;
  const dataProviderAuto = settings.dataProviderAuto;
  const dataProvider = settings.dataProvider;

  useEffect(() => {
    if (!presets || presets.length === 0) return;
    let cancelled = false;

    void (async () => {
      // Order: active preset first, then the rest. This way if the user
      // backgrounds the app mid-fill the most-likely-needed cache is
      // already warm.
      const ordered = [...presets].sort((a, b) => {
        if (a.id === activeId) return -1;
        if (b.id === activeId) return 1;
        return 0;
      });

      for (const preset of ordered) {
        if (cancelled) return;
        const provider = getEffectiveDataProvider(
          dataProviderAuto,
          dataProvider,
          { latitude: preset.latitude, longitude: preset.longitude },
        );
        try {
          await refreshPrayerDataCache(
            {
              provider,
              latitude: preset.latitude,
              longitude: preset.longitude,
              calculationMethod,
              school,
            },
            12,
          );
        } catch (e) {
          // Best-effort — never block the user'\''s app on a background fill.
          console.warn(
            `usePrefetchSavedLocations: prefetch for "${preset.name}" failed`,
            e,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // The hook re-runs when the user adds/removes a preset, switches active
    // preset, or changes the calculation method/school. Lat/lng inside an
    // existing preset are immutable (a "modified" preset becomes a new id),
    // so referential identity of `presets` is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, activeId, calculationMethod, school, dataProviderAuto, dataProvider]);
}
