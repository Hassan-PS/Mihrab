import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import notifee, {
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';
import { ProviderPickerModal } from '../components/ProviderPickerModal';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { usePrayerDay } from '../hooks/usePrayerDay';
import { syncPrayerNotifications } from '../notifications/prayerNotifications';
import { syncPrayerWidget } from '../widget/syncPrayerWidget';
import {
  getEffectiveDataProvider,
  resolveCoordsForProvider,
} from '../settings/effectiveProvider';
import {
  addDays,
  getNextPrayerDisplay,
} from '../utils/prayerTimes';
import type { RootStackParamList } from '../navigation/types';
import { computeSeasonalTreatment } from '../seasonal/treatments';
import { DayCarousel } from './home/DayCarousel';
import { LocationChip } from './home/LocationChip';
import { MonthShortcut } from './home/MonthShortcut';
import { NextPrayerCard } from './home/NextPrayerCard';
import { PermissionBanners } from './home/PermissionBanners';
import { ProviderFooter } from './home/ProviderFooter';
import { QuickActionsGrid } from './home/QuickActionsGrid';
import { RamadanCountdownCard } from './home/RamadanCountdownCard';
import { useNonReadyPhaseElement } from './home/usePhaseRouting';
import { HOME_SCREEN_PADDING } from './home/tokens';

/**
 * HomeScreen orchestrator — task #8 split.
 *
 * Owns hooks, effects, and orchestration; delegates rendering to children
 * under `src/screens/home/`. Two big perf wins land here:
 *
 *  1. The 30-second clock tick lives inside `NextPrayerCard` (the only
 *     component that displays the countdown). Previously the tick triggered
 *     `setNow(...)` in this file, forcing an 800-line tree to re-render every
 *     30 seconds. Now only the hero card re-renders.
 *
 *  2. `nextInfo` (the next prayer's name + Date) is recomputed only when a
 *     prayer actually passes — not every tick. The local "watchdog" effect
 *     polls every 30s but only calls `setNextInfo(...)` when the result has
 *     genuinely changed, so DayCarousel re-renders only when the highlighted
 *     row should move.
 *
 * Anything else this file does (notification sync, widget sync, last-fetched
 * coord persistence, locale-aware day labels) is unchanged behavior — same
 * effects, same call shapes, just lifted out of the rendering hot path.
 */
export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const { settings, hydrated, updateSettings } = usePrayerSettings();
  const { state, retry } = usePrayerDay(settings, hydrated);
  const { palette } = useAppPalette();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - HOME_SCREEN_PADDING * 2;

  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [exactAlarmDenied, setExactAlarmDenied] = useState(false);
  const [notifPermDenied, setNotifPermDenied] = useState(false);
  const [nextInfo, setNextInfo] = useState<{ name: string; at: Date } | null>(
    null,
  );

  const loadedDateKeyRef = useRef<string | null>(null);
  const loadedTzOffsetRef = useRef<number | null>(null);

  // Track the loaded date+tz so the watchdog interval can detect a day or
  // time-zone shift since the last successful fetch and trigger a retry().
  useEffect(() => {
    if (state.phase === 'ready') {
      loadedDateKeyRef.current = new Date().toDateString();
      loadedTzOffsetRef.current = new Date().getTimezoneOffset();
    }
  }, [state]);

  // Watchdog interval: detects day/tz change and recomputes nextInfo only when
  // the next prayer has actually changed. Crucially, this effect does NOT
  // schedule any per-tick state update — `now` lives inside NextPrayerCard.
  useEffect(() => {
    function tick() {
      if (state.phase !== 'ready') return;
      const current = new Date();
      const dateChanged =
        loadedDateKeyRef.current !== null &&
        current.toDateString() !== loadedDateKeyRef.current;
      const tzChanged =
        loadedTzOffsetRef.current !== null &&
        current.getTimezoneOffset() !== loadedTzOffsetRef.current;
      if (dateChanged || tzChanged) {
        retry();
        return;
      }
      const next = getNextPrayerDisplay(state.today, state.tomorrow, current);
      setNextInfo(prev => {
        if (
          prev?.name === next?.name &&
          prev?.at.getTime() === next?.at.getTime()
        ) {
          return prev;
        }
        return next;
      });
    }
    // Compute immediately so nextInfo is ready on first render after fetch.
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [state, retry]);

  useEffect(() => {
    if (!hydrated || state.phase !== 'ready') return;
    syncPrayerNotifications({
      enabled: settings.notificationsEnabled,
      prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
      notificationSound: settings.notificationSound,
      today: state.today,
      tomorrow: state.tomorrow,
      journalLogActionEnabled: settings.journalNotificationActionsEnabled,
    }).catch(e => console.warn('syncPrayerNotifications (effect):', e));
  }, [
    hydrated,
    settings.notificationsEnabled,
    settings.prePrayerReminderMinutes,
    settings.notificationSound,
    settings.journalNotificationActionsEnabled,
    state,
  ]);

  const locationLabel = useMemo(() => {
    if (settings.locationMode === 'manual' && settings.manualLocationLabel) {
      return settings.manualLocationLabel;
    }
    if (state.phase === 'ready') {
      return `${state.latitude.toFixed(4)}°, ${state.longitude.toFixed(4)}°`;
    }
    return '';
  }, [settings.locationMode, settings.manualLocationLabel, state]);

  useFocusEffect(
    useCallback(() => {
      if (!hydrated || state.phase !== 'ready') return;
      syncPrayerNotifications({
        enabled: settings.notificationsEnabled,
        prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
        notificationSound: settings.notificationSound,
        today: state.today,
        tomorrow: state.tomorrow,
      }).catch(e => console.warn('syncPrayerNotifications (focus):', e));
      {
        const t = computeSeasonalTreatment(state.today, state.tomorrow, new Date());
        syncPrayerWidget(
          state.today,
          state.tomorrow,
          new Date(),
          locationLabel,
          { lat: state.latitude, lng: state.longitude },
          { jumuah: t.jumuah, ramadan: t.ramadan, eid: t.eid },
        ).catch(e => console.warn('syncPrayerWidget (focus):', e));
      }

      if (settings.notificationsEnabled) {
        notifee
          .getNotificationSettings()
          .then(s => {
            if (Platform.OS === 'android') {
              setExactAlarmDenied(
                s.android.alarm !== AndroidNotificationSetting.ENABLED,
              );
            } else if (Platform.OS === 'ios') {
              setNotifPermDenied(
                s.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
                  s.authorizationStatus !== AuthorizationStatus.PROVISIONAL,
              );
            }
          })
          .catch(e => console.warn('getNotificationSettings:', e));
      } else {
        setExactAlarmDenied(false);
        setNotifPermDenied(false);
      }
    }, [
      hydrated,
      settings.notificationsEnabled,
      settings.prePrayerReminderMinutes,
      settings.notificationSound,
      state,
      locationLabel,
    ]),
  );

  // Push the widget payload whenever displayable data changes. We don't
  // include `now` in the deps any more — the widget doesn't need a tick-by-tick
  // refresh; it updates when the underlying data does.
  useEffect(() => {
    if (!hydrated || state.phase !== 'ready') return;
    const seasonal = computeSeasonalTreatment(
      state.today,
      state.tomorrow,
      new Date(),
    );
    syncPrayerWidget(
      state.today,
      state.tomorrow,
      new Date(),
      locationLabel,
      { lat: state.latitude, lng: state.longitude },
      { jumuah: seasonal.jumuah, ramadan: seasonal.ramadan, eid: seasonal.eid },
    ).catch(e => console.warn('syncPrayerWidget (effect):', e));
  }, [hydrated, state, locationLabel]);

  // Persist last-fetched coords so MonthScreen and offline use can fall back to them.
  const readyLat = state.phase === 'ready' ? state.latitude : undefined;
  const readyLng = state.phase === 'ready' ? state.longitude : undefined;
  useEffect(() => {
    if (readyLat == null || readyLng == null) return;
    if (
      settings.lastFetchedLatitude === readyLat &&
      settings.lastFetchedLongitude === readyLng
    ) {
      return;
    }
    updateSettings({
      lastFetchedLatitude: readyLat,
      lastFetchedLongitude: readyLng,
    });
  }, [
    readyLat,
    readyLng,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    updateSettings,
  ]);

  const coordsForProviderUi = useMemo(
    () => resolveCoordsForProvider(settings, state),
    [settings, state],
  );
  const effectiveProvider = useMemo(
    () =>
      getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coordsForProviderUi,
      ),
    [settings.dataProviderAuto, settings.dataProvider, coordsForProviderUi],
  );

  const getDayLabel = useCallback(
    (dayOffset: number): string => {
      if (dayOffset === 0) return t('home.today');
      if (dayOffset === 1) return t('home.tomorrow');
      return addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        weekday: 'long',
      });
    },
    [t, i18n.language],
  );
  const getDayDate = useCallback(
    (dayOffset: number): string =>
      addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
      }),
    [i18n.language],
  );

  const pickerPalette = useMemo(
    () => ({
      card: palette.card,
      text: palette.text,
      muted: palette.muted,
      border: palette.border,
      bg: palette.bg,
      overlay: palette.overlay,
      flatChrome: palette.flatChrome,
      accent: palette.accent,
      accentBg: palette.accentBg,
    }),
    [palette],
  );

  const handleOpenMonth = useCallback(
    () => navigation.navigate('MonthTimes'),
    [navigation],
  );
  const handleOpenProviderPicker = useCallback(
    () => setProviderPickerOpen(true),
    [],
  );
  const handleCloseProviderPicker = useCallback(
    () => setProviderPickerOpen(false),
    [],
  );

  // ── Phase routing: any non-ready phase short-circuits here. ───────────────
  const nonReadyEl = useNonReadyPhaseElement({
    hydrated,
    locationOnboardingComplete: settings.locationOnboardingComplete,
    state,
    retry,
  });
  if (nonReadyEl) return nonReadyEl;
  if (state.phase !== 'ready') return null; // narrowing for TS

  // ── Ready layout ──────────────────────────────────────────────────────────
  const carouselResetKey = `${state.latitude}-${state.longitude}`;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic">
      <PermissionBanners
        usingLocalFallback={state.usingLocalFallback ?? false}
        exactAlarmDenied={exactAlarmDenied}
        notifPermDenied={notifPermDenied}
        onRetryFetch={retry}
      />

      <LocationChip />

      <NextPrayerCard nextInfo={nextInfo} />

      <DayCarousel
        week={state.week}
        cardWidth={cardWidth}
        nextPrayerName={nextInfo?.name ?? null}
        resetKey={carouselResetKey}
        getDayLabel={getDayLabel}
        getDayDate={getDayDate}
      />

      <RamadanCountdownCard today={state.today} tomorrow={state.tomorrow} />

      <MonthShortcut onPress={handleOpenMonth} />

      <QuickActionsGrid />

      <ProviderFooter
        effectiveProvider={effectiveProvider}
        calculationMethod={settings.calculationMethod}
        school={settings.school}
        dataProviderAuto={settings.dataProviderAuto}
        locationLabel={locationLabel}
        backgroundRefreshing={state.backgroundRefreshing ?? false}
        onPress={handleOpenProviderPicker}
      />

      <ProviderPickerModal
        visible={providerPickerOpen}
        onClose={handleCloseProviderPicker}
        settings={settings}
        updateSettings={updateSettings}
        palette={pickerPalette}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    padding: HOME_SCREEN_PADDING,
    paddingBottom: 36,
    gap: 12,
  },
});
