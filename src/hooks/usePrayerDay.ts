import Geolocation from '@react-native-community/geolocation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { getOrFetchPrayerTimes, getCacheStatus, refreshPrayerDataCache } from '../prayer/prayerStorage';
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
    };

export function usePrayerDay(settings: PrayerAppSettings, hydrated: boolean) {
  const [state, setState] = useState<PrayerDayState>({ phase: 'idle' });
  const loadGenerationRef = useRef(0);

  const loadTimes = useCallback(
    async (latitude: number, longitude: number, isBackgroundRefresh: boolean = false) => {
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
        const message =
          e instanceof Error ? e.message : 'Failed to load prayer times';
        setState({ phase: 'api_error', message });
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
    if (!isBackgroundRefresh) {
      setState({ phase: 'loading' });
    }
    const run = async () => {
      if (settings.locationMode === 'manual') {
        loadTimes(settings.manualLatitude, settings.manualLongitude, isBackgroundRefresh).catch(
          () => {},
        );
        return;
      }
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setState({ phase: 'permission_denied' });
          return;
        }
      }
      Geolocation.getCurrentPosition(
        pos => {
          loadTimes(pos.coords.latitude, pos.coords.longitude, isBackgroundRefresh).catch(() => {});
        },
        err => {
          if (!isBackgroundRefresh) {
            setState({
              phase: 'location_error',
              message: err.message || 'Could not get location',
            });
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
