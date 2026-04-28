import Geolocation from '@react-native-community/geolocation';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  getOrFetchPrayerTimes,
  getCacheStatus,
  refreshPrayerDataCache,
  maybeFullSyncOnWifi,
} from '../prayer/prayerStorage';
import { computeLocalAdhanTimes } from '../providers/localAdhan';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import type { PrayerAppSettings } from '../settings/types';
import type { TimingsMap } from '../types/prayer';
import { addDays } from '../utils/prayerTimes';

export type PrayerDayState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'permission_denied' }
  | { phase: 'location_error'; message: string }
  | { phase: 'api_error'; message: string }
  | {
      phase: 'ready';
      latitude: number;
      longitude: number;
      today: TimingsMap;
      tomorrow?: TimingsMap;
      /** True when showing on-device fallback times because the network/provider failed. */
      usingLocalFallback?: boolean;
    };

/**
 * Returns true when the two positions differ by more than `thresholdDeg` degrees
 * in either axis (~1 km at the equator with the default 0.01°).
 */
function coordsChangedSignificantly(
  newLat: number,
  newLng: number,
  oldLat: number | null | undefined,
  oldLng: number | null | undefined,
  thresholdDeg = 0.01,
): boolean {
  if (oldLat == null || oldLng == null) return true;
  return (
    Math.abs(newLat - oldLat) > thresholdDeg ||
    Math.abs(newLng - oldLng) > thresholdDeg
  );
}

export function usePrayerDay(settings: PrayerAppSettings, hydrated: boolean) {
  const [state, setState] = useState<PrayerDayState>({ phase: 'idle' });
  const loadGenerationRef = useRef(0);

  const loadTimes = useCallback(
    async (
      latitude: number,
      longitude: number,
      isBackgroundRefresh: boolean = false,
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
      }
      try {
        const todayTimings = await getOrFetchPrayerTimes({
          provider,
          latitude,
          longitude,
          date: new Date(),
          calculationMethod: settings.calculationMethod,
          school: settings.school,
        });
        let tomorrow: TimingsMap | undefined;
        try {
          tomorrow = await getOrFetchPrayerTimes({
            provider,
            latitude,
            longitude,
            date: addDays(new Date(), 1),
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          });
        } catch {
          tomorrow = undefined;
        }
        if (gen !== loadGenerationRef.current) {
          return;
        }
        setState({
          phase: 'ready',
          latitude,
          longitude,
          today: todayTimings,
          tomorrow,
        });

        // Background cache refresh if needed
        try {
          const status = await getCacheStatus({
            provider,
            latitude,
            longitude,
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          });
          if (status.monthsStored < 2 || status.isExpired) {
            // Refresh up to 12 months ahead in the background
            refreshPrayerDataCache(
              {
                provider,
                latitude,
                longitude,
                calculationMethod: settings.calculationMethod,
                school: settings.school,
              },
              12
            ).catch(e => console.error('Background prayer cache refresh failed', e));
          }
        } catch {
          // Ignore cache check errors
        }
      } catch (e) {
        if (gen !== loadGenerationRef.current) {
          return;
        }
        // Network / provider failed — try on-device calculation as an offline fallback
        // so the app is usable without a connection on first launch.
        try {
          const localToday = computeLocalAdhanTimes({
            latitude,
            longitude,
            date: new Date(),
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          });
          let localTomorrow: TimingsMap | undefined;
          try {
            localTomorrow = computeLocalAdhanTimes({
              latitude,
              longitude,
              date: addDays(new Date(), 1),
              calculationMethod: settings.calculationMethod,
              school: settings.school,
            }).timings;
          } catch {
            localTomorrow = undefined;
          }
          if (gen !== loadGenerationRef.current) {
            return;
          }
          setState({
            phase: 'ready',
            latitude,
            longitude,
            today: localToday.timings,
            tomorrow: localTomorrow,
            usingLocalFallback: true,
          });
        } catch {
          // Local calculation also failed (invalid coordinates?)
          if (gen !== loadGenerationRef.current) {
            return;
          }
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
        if (!isBackgroundRefresh) {
          setState({ phase: 'loading' });
        }
        loadTimes(settings.manualLatitude, settings.manualLongitude, isBackgroundRefresh).catch(
          () => {},
        );
        return;
      }

      // ── GPS mode: show cached data instantly, refresh coords in background ──
      const cachedLat = settings.lastFetchedLatitude;
      const cachedLng = settings.lastFetchedLongitude;
      const hasCached = cachedLat != null && cachedLng != null;

      if (hasCached) {
        // Immediately render the last-known prayer data — no loading spinner.
        // Pass isBackgroundRefresh=true so loadTimes won't reset to 'loading'.
        loadTimes(cachedLat!, cachedLng!, true).catch(() => {});
      } else if (!isBackgroundRefresh) {
        setState({ phase: 'loading' });
      }

      // Request Android location permission. Because we already have data on
      // screen (if hasCached), the permission dialog doesn't block a blank UI.
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          if (!hasCached) {
            setState({ phase: 'permission_denied' });
          }
          return;
        }
      }

      // Get fresh GPS in the background. A 25 s watchdog fires if the OS never
      // responds (seen on certain Android ROMs and iOS edge cases).
      let watchdogFired = false;
      const watchdog = setTimeout(() => {
        watchdogFired = true;
        if (!hasCached && !isBackgroundRefresh) {
          setState({ phase: 'location_error', message: 'Location request timed out' });
        }
      }, 25000);

      Geolocation.getCurrentPosition(
        pos => {
          clearTimeout(watchdog);
          if (watchdogFired) return;
          const { latitude: newLat, longitude: newLng } = pos.coords;
          // Only re-fetch prayer data when the device has moved significantly
          // (~1 km). Same neighbourhood → cached data is accurate, skip the
          // network round-trip.
          if (coordsChangedSignificantly(newLat, newLng, cachedLat, cachedLng)) {
            loadTimes(newLat, newLng, true).catch(() => {});
          }
        },
        err => {
          clearTimeout(watchdog);
          if (watchdogFired) return;
          // GPS failed — cached data is already on screen if hasCached.
          if (!hasCached && !isBackgroundRefresh) {
            setState({ phase: 'location_error', message: err.message || 'Could not get location' });
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
      );
    };
    run().catch(() => {});
  }, [
    loadTimes,
    settings.locationMode,
    settings.manualLatitude,
    settings.manualLongitude,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
  ]);

  // WiFi-triggered background sync: keep the 12-month cache topped up whenever
  // the device connects to WiFi, using whatever coords are currently available.
  useEffect(() => {
    if (!hydrated || !settings.locationOnboardingComplete) {
      return;
    }
    const unsubscribeNetInfo = NetInfo.addEventListener(netState => {
      if (!netState.isConnected || netState.type !== 'wifi') {
        return;
      }
      const lat =
        settings.locationMode === 'gps'
          ? settings.lastFetchedLatitude
          : settings.manualLatitude;
      const lng =
        settings.locationMode === 'gps'
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
