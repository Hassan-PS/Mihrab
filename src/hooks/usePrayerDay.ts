import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { requestAndroidLocationPermission } from '../utils/locationPermission';
import {
  getOrFetchPrayerTimes,
  getCacheStatus,
  refreshPrayerDataCache,
  maybeFullSyncOnWifi,
  purgeCachesNear,
} from '../prayer/prayerStorage';
import { getPositionStaged } from '../utils/getPosition';
import { recordLocationFix } from '../prayer/cityRegistry';
import { reverseLocality, type ReverseLocality } from '../geocoding/nominatim';
import { computeLocalAdhanTimes } from '../providers/localAdhan';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import type { PrayerAppSettings } from '../settings/types';
import type { TimingsMap } from '../types/prayer';
import { addDays, startOfLocalDay } from '../utils/prayerTimes';

/** How many consecutive days (today + N-1 more) to fetch and expose. */
const WEEK_DAYS = 7;

export type PrayerDayState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'permission_denied' }
  | { phase: 'location_error'; message: string }
  /**
   * GPS failed AND we have no previously-saved location to fall back to —
   * surface a manual-entry CTA so the user can type a city or coordinates.
   * Added 2026-05-04 (#125): we used to silently fall through to on-device
   * adhan calculation here, but with no coords there is nothing to calculate
   * from. The user must provide a location.
   */
  | { phase: 'manual_required'; message: string }
  | { phase: 'api_error'; message: string }
  | {
      phase: 'ready';
      latitude: number;
      longitude: number;
      /** Reverse-geocoded city name for the active location (automatic mode).
       *  Undefined in manual mode or before geocoding resolves. Surfaced on
       *  the location chip so automatic mode names the city. */
      cityName?: string;
      /**
       * Start of the LOCAL calendar day `week[0]` was fetched for (v2.7.38).
       * Consumers that place the HH:MM timings on absolute dates (the
       * notification scheduler above all) MUST anchor to this — not to
       * "now" — or a sync that runs after midnight with stale state pins
       * yesterday's clock times onto today's date (the 1–2 min-early
       * adhan + duplicate-alert bug).
       */
      baseDate: Date;
      /** Convenience alias for week[0]. */
      today: TimingsMap;
      /** Convenience alias for week[1] (may be undefined). */
      tomorrow?: TimingsMap;
      /**
       * Consecutive days starting from today (index 0 = today, 1 = tomorrow …).
       * Always has at least one entry. Stops at the first day that could not be
       * fetched so callers can rely on the array being gapless.
       */
      week: TimingsMap[];
      /** True when showing on-device fallback times because the network/provider failed. */
      usingLocalFallback?: boolean;
      /**
       * True while a silent background operation is in flight:
       *  - fetching data for a newly detected location, OR
       *  - filling gaps in the local cache after showing today's times.
       * The displayed times are always valid; this flag just drives a subtle
       * loading indicator so the user knows a refresh is happening.
       */
      backgroundRefreshing?: boolean;
    };

// `coordsChangedSignificantly` extracted to `src/utils/coords.ts` (task #17)
// so it can be unit-tested without dragging in the NetInfo / Geolocation
// native modules.
import { coordsChangedSignificantly } from '../utils/coords';
import { applyOffsets, type PrayerOffsetMinutes } from '../settings/prayerOffsets';
import { injectNightTimes } from '../utils/nightTimes';

/**
 * Apply per-prayer offsets uniformly across a week of timings — task #22 +
 * follow-up #59. Applied at READ time (here, in the hook) rather than at
 * cache-write time so the cache stays raw: when the user changes an offset,
 * cached data is re-derived without a re-fetch, and a buggy offset only
 * affects the VIEW, never poisoning the stored data. No-op when there are
 * no offsets, so the original references pass through and downstream
 * memoisation stays cheap.
 */
function applyOffsetsToWeek(
  week: TimingsMap[],
  offsets: PrayerOffsetMinutes | undefined,
): TimingsMap[] {
  if (!offsets || Object.keys(offsets).length === 0) return week;
  return week.map(t => applyOffsets(t, offsets));
}

export function usePrayerDay(settings: PrayerAppSettings, hydrated: boolean) {
  const [state, setState] = useState<PrayerDayState>({ phase: 'idle' });
  const loadGenerationRef = useRef(0);
  // City-registry wiring (automatic mode). Track the last coords we
  // reverse-geocoded so we only hit the network when the device has actually
  // moved a meaningful distance, and the city we last loaded times for so a
  // second fix in the same city is a no-op.
  const lastGeocodeRef = useRef<{
    lat: number;
    lng: number;
    locality: ReverseLocality | null;
  } | null>(null);
  const loadedCityIdRef = useRef<string | null>(null);
  // Latest auto-mode load OUTPUTS (last-fetched coords + resolved city name).
  // Read through a ref — NOT the requestAndLoad dependency array — so that a
  // completed load persisting these back into settings does NOT re-trigger the
  // whole GPS cycle. That feedback loop used to race an in-flight fetch for a
  // newly-entered city against a stale re-run, leaving the screen on the old
  // city's times while the label had already switched (Sweden→abroad bug).
  const autoRef = useRef<{
    lat: number | null | undefined;
    lng: number | null | undefined;
    label: string | undefined;
  }>({ lat: undefined, lng: undefined, label: undefined });
  autoRef.current = {
    lat: settings.lastFetchedLatitude,
    lng: settings.lastFetchedLongitude,
    label: settings.autoLocationLabel,
  };

  const loadTimes = useCallback(
    async (
      latitude: number,
      longitude: number,
      isBackgroundRefresh: boolean = false,
      label?: string,
    ) => {
      const gen = ++loadGenerationRef.current;
      const coords = { latitude, longitude };
      const provider = getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coords,
      );

      if (!isBackgroundRefresh) {
        setState({ phase: 'loading' });
      } else {
        // Mark current ready state as actively refreshing so the UI can show
        // a subtle indicator without blanking the displayed times.
        setState(prev =>
          prev.phase === 'ready' ? { ...prev, backgroundRefreshing: true } : prev,
        );
      }

      try {
        // Fetch WEEK_DAYS consecutive days concurrently so the swipeable day
        // carousel loads atomically — no staggered re-renders as later days arrive.
        const now = new Date();
        const weekResults = await Promise.allSettled(
          Array.from({ length: WEEK_DAYS }, (_, i) =>
            getOrFetchPrayerTimes({
              provider,
              latitude,
              longitude,
              date: addDays(now, i),
              calculationMethod: settings.calculationMethod,
              school: settings.school,
            }),
          ),
        );

        if (gen !== loadGenerationRef.current) return;

        // Build a gapless week: stop at the first failure so callers can rely
        // on week[i] corresponding to today + i days without holes.
        const weekTimings: TimingsMap[] = [];
        for (const result of weekResults) {
          if (result.status === 'fulfilled') {
            weekTimings.push(result.value);
          } else {
            break;
          }
        }

        if (weekTimings.length === 0) {
          throw new Error('No prayer times available');
        }

        // Apply per-prayer offsets at READ time so the cache stays raw —
        // a setting change immediately re-derives without a re-fetch.
        // Apply offsets first, then derive the night times (Islamic Midnight +
        // Last Third) from the adjusted Maghrib/Fajr so they track any nudge.
        const offsettedWeek = injectNightTimes(
          applyOffsetsToWeek(weekTimings, settings.prayerOffsets),
        );

        // Check whether the local cache needs a background fill.  We do this
        // before the final setState so we can include backgroundRefreshing in
        // the same update — preventing a brief false-idle flash.
        let needsCacheFill = false;
        try {
          const status = await getCacheStatus({
            provider,
            latitude,
            longitude,
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          });
          needsCacheFill = status.monthsStored < 2 || status.isExpired;
        } catch {
          // Cache status check failing is non-critical; we just won't fill.
        }

        if (gen !== loadGenerationRef.current) return;

        setState(prev => ({
          phase: 'ready',
          latitude,
          longitude,
          // Preserve a previously-resolved city name if this refresh didn't
          // carry one (e.g. the instant cached re-render before geocoding).
          cityName: label ?? (prev.phase === 'ready' ? prev.cityName : undefined),
          baseDate: startOfLocalDay(now),
          today: offsettedWeek[0],
          tomorrow: offsettedWeek[1],
          week: offsettedWeek,
          backgroundRefreshing: needsCacheFill,
        }));

        if (needsCacheFill) {
          // Fill up to 12 months ahead in the background; clear the indicator
          // when done regardless of success or failure.
          refreshPrayerDataCache(
            {
              provider,
              latitude,
              longitude,
              calculationMethod: settings.calculationMethod,
              school: settings.school,
            },
            12,
          )
            .catch(e => console.error('Background prayer cache refresh failed', e))
            .finally(() => {
              if (gen !== loadGenerationRef.current) return;
              setState(prev =>
                prev.phase === 'ready'
                  ? { ...prev, backgroundRefreshing: false }
                  : prev,
              );
            });
        }
      } catch (e) {
        if (gen !== loadGenerationRef.current) return;

        // Network / provider failed — fall back to on-device calculation so
        // the app remains usable offline.  Generate the full week from local
        // adhan so the day carousel still works without connectivity.
        try {
          const now = new Date();
          const localWeek: TimingsMap[] = [];
          for (let i = 0; i < WEEK_DAYS; i++) {
            try {
              const local = computeLocalAdhanTimes({
                latitude,
                longitude,
                date: addDays(now, i),
                calculationMethod: settings.calculationMethod,
                school: settings.school,
              });
              localWeek.push(local.timings);
            } catch {
              break;
            }
          }

          if (localWeek.length === 0) {
            throw new Error('Local adhan calculation failed');
          }

          if (gen !== loadGenerationRef.current) return;

          // Apply per-prayer offsets to the local-adhan fallback too —
          // the user's adjustment must be honored even when offline.
          const offsettedLocalWeek = injectNightTimes(
            applyOffsetsToWeek(localWeek, settings.prayerOffsets),
          );

          setState(prev => ({
            phase: 'ready',
            latitude,
            longitude,
            cityName:
              label ?? (prev.phase === 'ready' ? prev.cityName : undefined),
            baseDate: startOfLocalDay(now),
            today: offsettedLocalWeek[0],
            tomorrow: offsettedLocalWeek[1],
            week: offsettedLocalWeek,
            usingLocalFallback: true,
            backgroundRefreshing: false,
          }));
        } catch {
          // Local calculation also failed (invalid coordinates?)
          if (gen !== loadGenerationRef.current) return;
          const message =
            e instanceof Error ? e.message : 'Failed to load prayer times';
          setState({ phase: 'api_error', message });
        }
      }
    },
    [
      settings.dataProvider,
      settings.dataProviderAuto,
      settings.calculationMethod,
      settings.school,
    ],
  );

  const requestAndLoad = useCallback((isBackgroundRefresh: boolean = false) => {
    const run = async () => {
      // ── Manual mode: simple, no GPS needed ──────────────────────────────────
      if (settings.locationMode === 'manual') {
        // (0, 0) is the explicit "no location set" sentinel from
        // DEFAULT_SETTINGS — fetching prayer times for that point
        // hits the middle of the Atlantic and confuses every
        // provider (especially the islamiska_forbundet reverse
        // geocoder). Prompt the user to set a location instead of
        // burning network requests on a sentinel value (#137).
        if (
          (settings.manualLatitude === 0 && settings.manualLongitude === 0) ||
          !Number.isFinite(settings.manualLatitude) ||
          !Number.isFinite(settings.manualLongitude)
        ) {
          if (!isBackgroundRefresh) {
            setState({
              phase: 'manual_required',
              message: 'No location set yet',
            });
          }
          return;
        }
        if (!isBackgroundRefresh) {
          setState({ phase: 'loading' });
        }
        loadTimes(
          settings.manualLatitude,
          settings.manualLongitude,
          isBackgroundRefresh,
        ).catch(() => {});
        return;
      }

      // ── Automatic mode ───────────────────────────────────────────────────────
      // Strategy:
      //  1. Immediately show last-known data (if any) — zero wait for the user.
      //  2. Silently resolve the current GPS position in the background.
      //  3. If position changed significantly (~1 km), fetch new times without
      //     blanking the screen; swap atomically when both today+week ready.
      //  4. Whether or not position changed, always check cache staleness and
      //     fill gaps in the background, signalling via backgroundRefreshing.

      // Read the last-known coords/label from the ref (see autoRef above) so
      // this callback is stable across loads and doesn't re-fire the GPS cycle.
      const cachedLat = autoRef.current.lat;
      const cachedLng = autoRef.current.lng;
      const cachedLabel = autoRef.current.label;
      const hasCached = cachedLat != null && cachedLng != null;

      if (hasCached) {
        // Instantly render last-known times while GPS resolves in background.
        // isBackgroundRefresh=true prevents the 'loading' flash. Seed the chip
        // with the previously-resolved city name so it doesn't flash coords.
        loadTimes(cachedLat, cachedLng, true, cachedLabel).catch(() => {});
      } else if (!isBackgroundRefresh) {
        setState({ phase: 'loading' });
      }

      // Request Android location permission. Because we already have data on
      // screen (if hasCached), the permission dialog doesn't block a blank UI.
      // Accepts an "Approximate" (COARSE-only) grant — that's enough for
      // prayer times and is the Wi-Fi positioning the user wants when GPS is
      // unavailable, so a coarse grant must NOT be treated as a refusal.
      if (Platform.OS === 'android') {
        const perm = await requestAndroidLocationPermission();
        if (perm !== 'granted') {
          if (!hasCached) {
            // No previous location AND no permission → ask the user to set
            // a manual location instead of stranding them on a dead-end
            // "permission denied" wall (#125).
            setState({ phase: 'permission_denied' });
          }
          return;
        }
      }

      // Resolve fresh position in the background using the staged locator
      // (fast Wi-Fi/cell coarse fix first, precise GPS refine after). A 25 s
      // watchdog fires only if NOTHING lands (seen on certain Android ROMs and
      // iOS edge cases).
      let gotAnyFix = false;
      let watchdogFired = false;
      const watchdog = setTimeout(() => {
        watchdogFired = true;
        if (!gotAnyFix && !hasCached && !isBackgroundRefresh) {
          // No previous coords + no fix at all → prompt for manual entry
          // rather than computing prayer times against bogus defaults (#125).
          setState({
            phase: 'manual_required',
            message: 'Location request timed out',
          });
        }
      }, 25_000);

      // Turn a raw fix into the right city + anchor, then (if the city
      // changed) fetch its times against the STABLE anchor coordinate so
      // moving within a city never re-downloads. Serialised so a fast coarse
      // fix and a slightly-later fine fix don't interleave their registry
      // writes.
      let onFixChain: Promise<void> = Promise.resolve();
      const handleFix = async (fixLat: number, fixLng: number) => {
        // Throttle reverse-geocoding: only re-geocode when we've moved
        // meaningfully (~1 km) from the last geocoded point; otherwise reuse
        // the cached locality (or null offline).
        let locality: ReverseLocality | null = null;
        const prev = lastGeocodeRef.current;
        if (
          prev &&
          prev.locality &&
          !coordsChangedSignificantly(fixLat, fixLng, prev.lat, prev.lng)
        ) {
          // Reuse only a SUCCESSFUL nearby result. We never cache a failure,
          // so a transient geocoder outage self-heals on the next fix instead
          // of sticking to coords until the device moves >1 km.
          locality = prev.locality;
        } else {
          try {
            locality = await reverseLocality(fixLat, fixLng);
          } catch {
            locality = null; // offline / geocoder down → registry falls back
          }
          if (locality) {
            lastGeocodeRef.current = { lat: fixLat, lng: fixLng, locality };
          }
        }

        const summary = await recordLocationFix(
          fixLat,
          fixLng,
          locality,
          new Date(),
        );

        // Purge the prayer cache of any city whose retention window lapsed.
        for (const a of summary.evictedAnchors) {
          purgeCachesNear(a.latitude, a.longitude).catch(() => {});
        }

        // Only (re)fetch when the ACTIVE city changed since the last load —
        // this is what makes intra-city movement free.
        const cityChanged = loadedCityIdRef.current !== summary.cityId;
        if (cityChanged) {
          loadedCityIdRef.current = summary.cityId;
          loadTimes(
            summary.anchorLat,
            summary.anchorLng,
            true,
            summary.displayName,
          ).catch(() => {});
        } else if (summary.displayName) {
          // Same city, but we may now have a nicer name than the seed — patch
          // it onto the ready state without a re-fetch.
          setState(cur =>
            cur.phase === 'ready'
              ? { ...cur, cityName: summary.displayName }
              : cur,
          );
        }
      };

      getPositionStaged(
        fix => {
          if (watchdogFired) return;
          // A fix landed → the watchdog no longer needs to fire.
          gotAnyFix = true;
          clearTimeout(watchdog);
          onFixChain = onFixChain.then(() =>
            handleFix(fix.latitude, fix.longitude).catch(() => {}),
          );
        },
        err => {
          clearTimeout(watchdog);
          if (watchdogFired || gotAnyFix) return;
          if (!hasCached && !isBackgroundRefresh) {
            // No fix at all AND no previously-saved location → send the user
            // to manual entry rather than stranding them (#125).
            setState({
              phase: 'manual_required',
              message: err.message || 'Could not get location',
            });
          }
          // Fix failed but cached data is already on screen — stay on it. We
          // explicitly do NOT compute on-device times against GPS-less
          // coordinates (#125).
        },
      );
    };
    run().catch(() => {});
  }, [
    loadTimes,
    settings.locationMode,
    settings.manualLatitude,
    settings.manualLongitude,
    // NOTE: lastFetchedLatitude/Longitude/autoLocationLabel are intentionally
    // read via autoRef (not deps) so a completed load doesn't re-fire the GPS
    // cycle and race itself. Manual coords + mode stay as deps because a real
    // user change there SHOULD re-resolve.
  ]);

  // WiFi-triggered background sync: silently top up the 12-month cache
  // whenever the device connects to WiFi.  No backgroundRefreshing indicator
  // here — this is a maintenance task that may run for a long time and the
  // user already has correct times on screen.
  useEffect(() => {
    if (!hydrated || !settings.locationOnboardingComplete) {
      return;
    }
    const unsubscribeNetInfo = NetInfo.addEventListener(netState => {
      if (!netState.isConnected || netState.type !== 'wifi') {
        return;
      }
      const lat =
        settings.locationMode === 'automatic'
          ? settings.lastFetchedLatitude
          : settings.manualLatitude;
      const lng =
        settings.locationMode === 'automatic'
          ? settings.lastFetchedLongitude
          : settings.manualLongitude;
      if (lat == null || lng == null) {
        return;
      }
      const provider = getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        { latitude: lat, longitude: lng },
      );
      maybeFullSyncOnWifi({
        provider,
        latitude: lat,
        longitude: lng,
        calculationMethod: settings.calculationMethod,
        school: settings.school,
      }).catch(e => console.warn('WiFi-triggered sync check failed:', e));
    });
    return () => {
      unsubscribeNetInfo();
    };
  }, [
    hydrated,
    settings.locationOnboardingComplete,
    settings.locationMode,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    settings.manualLatitude,
    settings.manualLongitude,
    settings.dataProvider,
    settings.dataProviderAuto,
    settings.calculationMethod,
    settings.school,
  ]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!settings.locationOnboardingComplete) {
      setState(prev => (prev.phase === 'idle' ? prev : { phase: 'idle' }));
      return;
    }
    requestAndLoad();

    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        requestAndLoad(true);
      }
    });

    return () => {
      sub.remove();
    };
  }, [hydrated, settings.locationOnboardingComplete, requestAndLoad]);

  return { state, retry: requestAndLoad };
}
