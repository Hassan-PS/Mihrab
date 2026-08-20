import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import notifee, {
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';
import { ProviderPickerModal } from '../components/ProviderPickerModal';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { usePrayerDay } from '../hooks/usePrayerDay';
import { getCacheStatus } from '../prayer/prayerStorage';
import { usePrefetchSavedLocations } from '../hooks/usePrefetchSavedLocations';
import { syncPrayerNotifications } from '../notifications/prayerNotifications';
import { syncPrayerWidget } from '../widget/syncPrayerWidget';
import { collectWidgetExtras } from '../widget/collectWidgetExtras';
import { useWidgetDataRevision } from '../widget/useWidgetDataRevision';
import { syncLiveActivity } from '../liveActivity/syncLiveActivity';
import {
  getEffectiveDataProvider,
  resolveCoordsForProvider,
} from '../settings/effectiveProvider';
import {
  addDays,
  getNextPrayerDisplay,
} from '../utils/prayerTimes';
import { filterOptionalTimes } from '../utils/nightTimes';
import type { RootStackParamList } from '../navigation/types';
import { computeSeasonalTreatment } from '../seasonal/treatments';
import { TodayCard } from './home/TodayCard';
import { formatHijriLabel } from '../hijri/formatHijriLabel';
import { QuranCard } from './home/QuranCard';
import { PermissionBanners } from './home/PermissionBanners';
import { ProviderFooter } from './home/ProviderFooter';
import { DataStatsPanel } from './home/DataStatsPanel';
import { PracticeCard } from './home/PracticeCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TodaySummary } from './home/TodaySummary';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { isMacCatalyst } from '../responsive/breakpoints';
import { HomeHeaderControls } from '../navigation/HomeHeaderControls';
import { RamadanCountdownCard } from './home/RamadanCountdownCard';
import { useNonReadyPhaseElement } from './home/usePhaseRouting';
import { HOME_SCREEN_PADDING } from './home/tokens';
import { useTabBarInset } from '../navigation/tabBarInset';
import { rescheduleEndOfDayLogReminders } from '../notifications/endOfDayLog';
import {
  FeatureTourModal,
  hasSeenFeatureTour,
} from '../polish/FeatureTourModal';

/**
 * HomeScreen orchestrator — task #8 split.
 *
 * Owns hooks, effects, and orchestration; delegates rendering to children
 * under `src/screens/home/`. Two big perf wins land here:
 *
 *  1. The 30-second clock tick lives inside `TodayCard`'s hero (the only
 *     component that displays the countdown). Previously the tick triggered
 *     `setNow(...)` in this file, forcing an 800-line tree to re-render every
 *     30 seconds. Now only the countdown re-renders — not even the day strip
 *     or the eight prayer rows beside it.
 *
 *  2. `nextInfo` (the next prayer's name + Date) is recomputed only when a
 *     prayer actually passes — not every tick. The local "watchdog" effect
 *     polls every 30s but only calls `setNextInfo(...)` when the result has
 *     genuinely changed, so the day table re-renders only when the
 *     highlighted row should move.
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
  // Moves when a prayer is logged, a page is turned or a bead is counted —
  // none of which changes a prayer time, all of which change the widget.
  const widgetRevision = useWidgetDataRevision();
  // Background prefetch of 12 months for every saved location preset, so
  // switching presets is instant and doesn't wipe the previously-cached
  // months — task #145. Runs serially in the background, never blocks the
  // home render.
  usePrefetchSavedLocations();
  const { palette } = useAppPalette();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Cap the day-card width to the centered content column so the carousel
  // doesn't overflow the capped column on iPad/Mac windows.
  // Must equal the width the SIBLING cards actually render at — i.e. the
  // CenteredColumn inner width. The old `contentColumnWidth(w) - padding`
  // subtracted the screen padding AFTER the 720pt cap, so in the regular
  // band (window ≥ ~750pt) the day table came out 32pt narrower than the
  // hero/shortcut cards above and below it ("weird margins", Mac
  // 2026-07-16). The screen padding only eats into the column while the
  // window is narrower than cap + padding.
  // Expanded (wide iPad landscape / Mac window): lay Home out as a two-column
  // dashboard — a fixed "today" main column beside a flexible tools sidebar —
  // so the cards fill the window and fit without scrolling. The day carousel
  // is sized to the fixed main column so its pages stay crisp and aligned.
  // 1180 (not the 1100 'expanded' edge): below that the sidebar drops
  // under ~440pt and the tools grid crams — the centered single column
  // reads far better in that band (Mac audit 2026-07-16, plan v2 §B4).
  const isDashboard = screenWidth >= 1180;
  // Adapt to the window instead of a fixed cap: up to 1360pt of content
  // on big Mac windows, with the main column taking a proportional share
  // (clamped so the day table keeps a comfortable measure).
  const dashCap = Math.min(1360, screenWidth - 48);
  const HOME_MAIN_COL = isDashboard
    ? Math.max(620, Math.min(740, Math.round(dashCap * 0.54)))
    : 620;
  // Desktop zoom (Mac feedback 2026-07-16, "still a lot of empty
  // space"): past the width cap, ADAPT BY SCALING — the whole dashboard
  // zooms uniformly to the window, bounded by both axes and capped at
  // 1.45× so type never turns cartoonish. A pure width cap left the
  // dashboard floating tiny in a 2560×1440 fullscreen window.
  const DASH_BASE_HEIGHT = 940; // hero + day table + shortcut + padding
  const dashScale = isDashboard
    ? Math.min(
        1.45,
        Math.max(
          1,
          Math.min((screenWidth - 64) / dashCap, screenHeight / DASH_BASE_HEIGHT),
        ),
      )
    : 1;
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [exactAlarmDenied, setExactAlarmDenied] = useState(false);
  const [notifPermDenied, setNotifPermDenied] = useState(false);
  const [nextInfo, setNextInfo] = useState<{ name: string; at: Date } | null>(
    null,
  );

  // First-run feature walkthrough: shown once after onboarding completes.
  // Focus-scoped (not mount-scoped) so the Settings "Show the app tour"
  // replay — which clears the flag and pops back here — re-triggers it.
  const tabBarInset = useTabBarInset();
  const [tourVisible, setTourVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!settings.onboardingComplete) return;
      let cancelled = false;
      void hasSeenFeatureTour().then(seen => {
        if (!cancelled && !seen) setTourVisible(true);
      });
      return () => {
        cancelled = true;
      };
    }, [settings.onboardingComplete]),
  );

  // Reactive gating of the optional non-prayer entries, so flipping a toggle
  // updates the surfaces immediately without a re-fetch. usePrayerDay always
  // derives Sunrise + the two night times into the raw `week`; here we strip
  // per-surface:
  //   • table / notifications / Live Activity → respect all three toggles
  //     (Sunrise + the two night times). The LA counts down to Islamic Midnight
  //     and the Last Third when they're the next event.
  //   • home-screen widget → unchanged from before: Sunrise always shown, the
  //     night times never shown.
  const view = useMemo(() => {
    if (state.phase !== 'ready') return null;
    const { today, tomorrow, week } = state;
    const mk = (tg: {
      Sunrise: boolean;
      Midnight: boolean;
      Lastthird: boolean;
    }) => ({
      today: filterOptionalTimes(today, tg),
      tomorrow: tomorrow ? filterOptionalTimes(tomorrow, tg) : undefined,
      week: week.map(d => filterOptionalTimes(d, tg)),
    });
    return {
      table: mk({
        Sunrise: settings.sunriseEnabled,
        Midnight: settings.islamicMidnightEnabled,
        Lastthird: settings.lastThirdEnabled,
      }),
      la: mk({
        Sunrise: settings.sunriseEnabled,
        Midnight: settings.islamicMidnightEnabled,
        Lastthird: settings.lastThirdEnabled,
      }),
      // The widget gets the LONG window, not the carousel's week — its copy
      // has to stay true across however long the app goes unopened.
      widget: {
        ...mk({ Sunrise: true, Midnight: false, Lastthird: false }),
        week: (state.widgetWeek ?? week).map(d =>
          filterOptionalTimes(d, {
            Sunrise: true,
            Midnight: false,
            Lastthird: false,
          }),
        ),
      },
    };
  }, [
    state,
    settings.sunriseEnabled,
    settings.islamicMidnightEnabled,
    settings.lastThirdEnabled,
  ]);

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
  // schedule any per-tick state update — `now` lives inside TodayCard's hero.
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
      const next = view
        ? getNextPrayerDisplay(view.table.today, view.table.tomorrow, current)
        : null;
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
  }, [state, retry, view]);

  useEffect(() => {
    if (!hydrated || state.phase !== 'ready' || !view) return;
    syncPrayerNotifications({
      enabled: settings.notificationsEnabled,
      prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
      notificationSound: settings.notificationSound,
      today: view.table.today,
      tomorrow: view.table.tomorrow,
      // Anchor the schedule to the day the maps were FETCHED for — if this
      // sync fires with stale state just after midnight, yesterday's map
      // must not be pinned onto today's date (early-adhan bug, v2.7.38).
      baseDate: state.baseDate,
      // Extra cached days extend coverage past tomorrow so alerts keep
      // firing when the app isn't opened for a couple of days (v2.7.40).
      week: view.table.week,
      journalLogActionEnabled: settings.journalNotificationActionsEnabled,
    }).catch(e => console.warn('syncPrayerNotifications (effect):', e));
    // The end-of-day prompt is scheduled from the same data and the same
    // moment as the prayer alerts: it needs Isha for every day it covers,
    // and this is the one place in the app that holds a week of times
    // anchored to the day they were fetched for.
    rescheduleEndOfDayLogReminders({
      enabled: settings.endOfDayLogReminderEnabled,
      week: view.table.week,
      baseDate: state.baseDate,
    }).catch(e => console.warn('rescheduleEndOfDayLogReminders:', e));
  }, [
    hydrated,
    settings.notificationsEnabled,
    settings.prePrayerReminderMinutes,
    settings.notificationSound,
    settings.journalNotificationActionsEnabled,
    settings.endOfDayLogReminderEnabled,
    state,
    view,
  ]);

  /**
   * What the widget and Live Activity call this place.
   *
   * The reverse-geocoded city comes FIRST. It used to be absent entirely, so
   * every user on automatic location had `59.3293°, 18.0686°` sitting on
   * their home screen — coordinates to four decimal places, which is about
   * eleven metres, readable by anyone who glances at the phone. The app's own
   * header has said "Stockholm" the whole time; it just never told the widget.
   *
   * Coordinates remain the last resort rather than being dropped: before
   * geocoding resolves, a widget that says where it thinks you are is more
   * useful than one that says nothing, and a wrong city is worse than a
   * blunt number.
   */
  const locationLabel = useMemo(() => {
    if (settings.locationMode === 'manual' && settings.manualLocationLabel) {
      return settings.manualLocationLabel;
    }
    if (state.phase === 'ready') {
      if (state.cityName) return state.cityName;
      return `${state.latitude.toFixed(4)}°, ${state.longitude.toFixed(4)}°`;
    }
    return '';
  }, [settings.locationMode, settings.manualLocationLabel, state]);

  useFocusEffect(
    useCallback(() => {
      if (!hydrated || state.phase !== 'ready' || !view) return;
      syncPrayerNotifications({
        enabled: settings.notificationsEnabled,
        prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
        notificationSound: settings.notificationSound,
        today: view.table.today,
        tomorrow: view.table.tomorrow,
        baseDate: state.baseDate,
        week: view.table.week,
      }).catch(e => console.warn('syncPrayerNotifications (focus):', e));
      {
        const t = computeSeasonalTreatment(
          view.table.today,
          view.table.tomorrow,
          new Date(),
        );
        collectWidgetExtras({ timings: view.widget.today, now: new Date() })
          .then(extras =>
            syncPrayerWidget(
              view.widget.today,
              view.widget.tomorrow,
              new Date(),
              locationLabel,
              { lat: state.latitude, lng: state.longitude },
              { jumuah: t.jumuah, ramadan: t.ramadan, eid: t.eid },
              view.widget.week,
              extras,
            ),
          )
          .catch(e => console.warn('syncPrayerWidget (focus):', e));
        // Live activity — task #128. Same cadence as the widget so the
        // notification stays in sync with what's on the home screen.
        syncLiveActivity({
          options: { enabled: settings.liveActivityEnabled },
          today: view.la.today,
          tomorrow: view.la.tomorrow,
          week: view.la.week,
          now: new Date(),
          locationName: locationLabel,
          coords: { lat: state.latitude, lng: state.longitude },
          seasonal: { jumuah: t.jumuah, ramadan: t.ramadan, eid: t.eid },
          // Use the app's actual current accent so the notification matches the
          // app exactly (standard theme → the brand emerald; system colours →
          // the live Material You colour). When systemAccent is set, the native
          // side re-resolves the live system colour on each repost.
          accentHex: palette.accentSolid,
          // Android: follow the live Material You system colour (re-resolved
          // natively on each repost) only when system colours are enabled.
          systemAccent:
            Platform.OS === 'android' &&
            settings.appearance === 'system' &&
            settings.useSystemDynamicTheme,
          // iOS Liquid Glass: let the Live Activity use the dynamic system
          // tint instead of the brand accent so it matches the system theme.
          systemTinted:
            Platform.OS === 'ios' &&
            settings.appearance === 'system' &&
            settings.useSystemDynamicTheme,
          design: settings.liveActivityDesign,
        }).catch(e => console.warn('syncLiveActivity (focus):', e));
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
      view,
      locationLabel,
      settings.liveActivityEnabled,
      palette.accentSolid,
      settings.appAccentId,
      settings.appAccentCustomHex,
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.liveActivityDesign,
    ]),
  );

  // Push the widget payload whenever displayable data changes. We don't
  // include `now` in the deps any more — the widget doesn't need a tick-by-tick
  // refresh; it updates when the underlying data does.
  useEffect(() => {
    if (!hydrated || state.phase !== 'ready' || !view) return;
    const seasonal = computeSeasonalTreatment(
      view.table.today,
      view.table.tomorrow,
      new Date(),
    );
    collectWidgetExtras({ timings: view.widget.today, now: new Date() })
      .then(extras =>
        syncPrayerWidget(
          view.widget.today,
          view.widget.tomorrow,
          new Date(),
          locationLabel,
          { lat: state.latitude, lng: state.longitude },
          {
            jumuah: seasonal.jumuah,
            ramadan: seasonal.ramadan,
            eid: seasonal.eid,
          },
          view.widget.week,
          extras,
        ),
      )
      .catch(e => console.warn('syncPrayerWidget (effect):', e));
  }, [
    hydrated,
    state,
    view,
    locationLabel,
    // A prayer logged, a page turned or a bead counted changes what the
    // widget should say without changing any prayer time — so the payload
    // has to be rebuilt on those too, not only on `view`.
    widgetRevision,
  ]);

  // Live Activity sync — runs whenever prayer data changes OR whenever the
  // "next prayer" pointer advances (nextInfo change is detected by the 30-second
  // watchdog above). Including nextInfo here is the key fix for the countdown
  // reaching zero without advancing: when Fajr passes and nextInfo flips to
  // Dhuhr, this effect re-fires with `now: new Date()`, so syncLiveActivity
  // recomputes the correct next prayer and pushes updated content.
  useEffect(() => {
    if (!hydrated || state.phase !== 'ready' || !view) return;
    const seasonal = computeSeasonalTreatment(
      view.table.today,
      view.table.tomorrow,
      new Date(),
    );
    syncLiveActivity({
      options: { enabled: settings.liveActivityEnabled },
      today: view.la.today,
      tomorrow: view.la.tomorrow,
      week: view.la.week,
      now: new Date(),
      locationName: locationLabel,
      coords: { lat: state.latitude, lng: state.longitude },
      seasonal: {
        jumuah: seasonal.jumuah,
        ramadan: seasonal.ramadan,
        eid: seasonal.eid,
      },
      // App's actual current accent (see focus-effect note above).
      accentHex: palette.accentSolid,
      // Android: follow the live Material You system colour only when system
      // colours are enabled (re-resolved natively on each repost).
      systemAccent:
        Platform.OS === 'android' &&
        settings.appearance === 'system' &&
        settings.useSystemDynamicTheme,
      // iOS Liquid Glass: dynamic system tint instead of the brand accent.
      systemTinted:
        Platform.OS === 'ios' &&
        settings.appearance === 'system' &&
        settings.useSystemDynamicTheme,
      design: settings.liveActivityDesign,
    }).catch(e => console.warn('syncLiveActivity (effect):', e));
  }, [
    hydrated,
    state,
    view,
    // nextInfo is the computed "which prayer is next right now" value.
    // The 30-second watchdog updates it whenever a prayer passes, triggering
    // this effect to re-sync the Live Activity with the new next prayer.
    nextInfo,
    locationLabel,
    settings.liveActivityEnabled,
    palette.accentSolid,
    settings.appAccentId,
    settings.appAccentCustomHex,
    settings.appearance,
    settings.useSystemDynamicTheme,
    settings.liveActivityDesign,
    // Re-push the Live Activity the instant the user changes its options
    // (HomeScreen stays mounted, so this fires even from the Settings screen).
    settings.liveActivitySecondMetric,
    // Re-push when the app language changes so the notification's localised
    // labels (In/At/Since, mute toggle, Hijri month) update. Using i18n.language
    // (not settings.language) guarantees i18n has already switched before we
    // rebuild the payload via i18n.t.
    i18n.language,
  ]);

  // Persist last-fetched coords so MonthScreen and offline use can fall back to
  // them, plus the reverse-geocoded city name so the location chip can name the
  // automatic location (and keep naming it across restarts).
  const readyLat = state.phase === 'ready' ? state.latitude : undefined;
  const readyLng = state.phase === 'ready' ? state.longitude : undefined;
  const readyCity = state.phase === 'ready' ? state.cityName : undefined;
  useEffect(() => {
    if (readyLat == null || readyLng == null) return;
    const coordsSame =
      settings.lastFetchedLatitude === readyLat &&
      settings.lastFetchedLongitude === readyLng;
    // Only track the auto city name in automatic mode; manual mode uses
    // manualLocationLabel instead.
    const nextCity =
      settings.locationMode === 'automatic' ? readyCity : undefined;
    const citySame = settings.autoLocationLabel === nextCity;
    if (coordsSame && citySame) return;
    const patch: {
      lastFetchedLatitude: number;
      lastFetchedLongitude: number;
      autoLocationLabel?: string;
    } = {
      lastFetchedLatitude: readyLat,
      lastFetchedLongitude: readyLng,
    };
    if (!citySame) patch.autoLocationLabel = nextCity;
    updateSettings(patch);
  }, [
    readyLat,
    readyLng,
    readyCity,
    settings.locationMode,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    settings.autoLocationLabel,
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
  /**
   * Short weekday for a strip chip.
   *
   * Whatever the locale's own "short" form is, and no truncation on top of
   * it: cutting to three characters turned the Arabic week into الس/الأ/الا/
   * الث/الأ/الخ/الج — where الأحد (Sunday) and الأربعاء (Wednesday) both
   * became "الأ". Scripts that do not abbreviate keep their whole word, and
   * the strip scrolls if the week is wider than the card.
   */
  const getDayShort = useCallback(
    (dayOffset: number): string =>
      addDays(new Date(), dayOffset)
        .toLocaleDateString(i18n.language, { weekday: 'short' })
        .replace(/[.,]\s*$/, ''),
    [i18n.language],
  );
  /** Day of month for a strip chip, in the app language's numerals. */
  const getDayNumber = useCallback(
    (dayOffset: number): string =>
      addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        day: 'numeric',
      }),
    [i18n.language],
  );
  const getHijriDate = useCallback(
    (dayOffset: number): string => formatHijriLabel(addDays(new Date(), dayOffset)),
    // i18n.language drives the localised Hijri month name inside the formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const handleOpenQuran = useCallback(
    // The Quran is a TAB now, not a pushed page — jump to it rather than
    // stacking a second copy on top of Today (design review 2e).
    () => navigation.navigate('QuranTab' as never),
    [navigation],
  );
  /** Continue reading exactly where the card says — surah, page, ayah. */
  const handleOpenQuranAt = useCallback(
    (surahNumber: number, page?: number, ayah?: number) =>
      navigation.navigate('QuranSurah', {
        surahNumber,
        initialPage: page,
        scrollToAyah: ayah,
      }),
    [navigation],
  );
  const handleOpenLog = useCallback(
    () => navigation.navigate('LogTab' as never),
    [navigation],
  );

  // Data-freshness status for the hero indicator (v2.7.30): when timings
  // last landed from the provider + how many days sit in the on-device
  // cache. Re-checked whenever the fetch state changes (a background
  // refresh completing flips `state`, which re-runs this).
  const [dataStatus, setDataStatus] = useState<{
    lastFetchedAt: Date | null;
    totalDaysCached: number;
  } | null>(null);
  useEffect(() => {
    if (state.phase !== 'ready') return;
    let cancelled = false;
    getCacheStatus({
      provider: effectiveProvider,
      latitude: state.latitude,
      longitude: state.longitude,
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    })
      .then(s => {
        if (cancelled) return;
        setDataStatus({
          lastFetchedAt: s.lastFetchedAt ? new Date(s.lastFetchedAt) : null,
          totalDaysCached: s.totalDaysCached,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    state,
    effectiveProvider,
    settings.calculationMethod,
    settings.school,
  ]);
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
  if (state.phase !== 'ready' || !view) return null; // narrowing for TS

  // ── Ready layout ──────────────────────────────────────────────────────────
  const carouselResetKey = `${state.latitude}-${state.longitude}`;

  return (
    <View style={styles.homeRoot}>
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={[
        styles.scrollContent,
        // Breathing room under the last card — and NOTHING for the tab
        // bar or the safe area. The bar is in flow, so the scroll view
        // already ends above it, and the bar's own bottom margin already
        // spends `insets.bottom`. Adding it here as well cost ~54pt of
        // dead air at the foot of the page, which on iPad was most of
        // the reason the dashboard overflowed and had to scroll at all.
        { paddingBottom: 24 + tabBarInset },
        // Fill the viewport on the dashboard: when the two columns are
        // shorter than the window, center them vertically instead of
        // leaving the bottom half of a Mac/iPad window empty (§B1).
        isDashboard && styles.scrollContentDash,
      ]}
      contentInsetAdjustmentBehavior="automatic">
      {/* gap must live INSIDE CenteredColumn: the wrapper collapses all
          cards into one child of the scroll container, so the container's
          own gap:12 stopped separating them (2.7.36 regression — the
          carousel dots overlapped the day table and the Quran button). */}
      <CenteredColumn
        maxWidth={isDashboard ? dashCap : undefined}
        style={styles.homeColumn}
        innerStyle={styles.homeColumn}>
      <PermissionBanners
        usingLocalFallback={state.usingLocalFallback ?? false}
        exactAlarmDenied={exactAlarmDenied}
        notifPermDenied={notifPermDenied}
        onRetryFetch={retry}
      />

      {/* Mac Catalyst: the location chip is the first ROW OF CONTENT, not a
          pinned overlay and not the navigation header.

          Not the header, because on Catalyst the transparent navigation bar
          sits inside the window's title-bar DRAG REGION and clicks on it were
          intermittently swallowed as window drags. That is why it moved out.

          Not an overlay either, which is where it went instead: pinned to
          `right: 14` of the WINDOW while every card is centred inside a
          width-capped column. On a wide window the cards are narrower than
          the window, so the chip landed in the empty margin and looked
          deliberate. Narrow the window until the cards fill it — a small Mac
          window is the ordinary case, not an edge one — and the same chip is
          suddenly sitting on top of the hero card and hanging past its right
          edge (reported with a screenshot, 2026-08-18).

          In the column it is right-aligned to the same edge as the cards at
          every width, by construction rather than by coincidence, and it
          still clears the drag region and still sits outside the scale
          transform on `dashRow` that would otherwise paint over it. */}
      {isMacCatalyst ? (
        <View style={styles.macHeaderRow}>
          <HomeHeaderControls />
        </View>
      ) : null}

      {(() => {
        // One card: countdown → day strip → times → month link (2a). The
        // hero and the table were the same data at two sizes, and the day
        // switcher was six invisible dots between them.
        const dayTable = (
          <TodayCard
            week={view.table.week}
            nextInfo={nextInfo}
            resetKey={carouselResetKey}
            getDayLabel={getDayLabel}
            getDayDate={getDayDate}
            getHijriDate={getHijriDate}
            getDayShort={getDayShort}
            getDayNumber={getDayNumber}
            onOpenMonth={handleOpenMonth}
            dataStatus={dataStatus}
            expanded={isDashboard}
          />
        );
        const ramadanCard = (
          <RamadanCountdownCard today={state.today} tomorrow={state.tomorrow} />
        );
        const quranShortcut = (
          <QuranCard onOpenAt={handleOpenQuranAt} onOpenQuran={handleOpenQuran} />
        );
        const toolsGrid = <TodaySummary onOpenLog={handleOpenLog} />;
        const providerFooter = (
          <ProviderFooter
            effectiveProvider={effectiveProvider}
            calculationMethod={settings.calculationMethod}
            school={settings.school}
            dataProviderAuto={settings.dataProviderAuto}
            locationLabel={locationLabel}
            backgroundRefreshing={state.backgroundRefreshing ?? false}
            onPress={handleOpenProviderPicker}
          />
        );
        const practiceCard = settings.showPracticeOnHome ? (
          <ErrorBoundary label="PracticeCard">
            <PracticeCard />
          </ErrorBoundary>
        ) : null;
        const statsPanel = settings.showDataStats ? (
          <ErrorBoundary label="DataStatsPanel">
            <DataStatsPanel />
          </ErrorBoundary>
        ) : null;

        if (isDashboard) {
          return (
            // transform-scale zoom: layout stays at the capped size (so
            // the carousel paging math is untouched); the rendered
            // result grows around the centered box to fill the window.
            <View
              style={[
                styles.dashRow,
                dashScale > 1 && { transform: [{ scale: dashScale }] },
              ]}>
              {/* The main column carries the day table AND NOTHING ELSE.
                  It is the tallest thing on the screen by a wide margin —
                  hero, day strip, six rows and the month link — and on an
                  11" iPad in landscape it uses essentially the whole
                  window on its own. Anything stacked under it therefore
                  falls off the bottom, which is exactly what happened to
                  the Quran card: the one card on Home you are meant to
                  ACT on was the one card you had to scroll to find
                  (reported 2026-08-02).

                  So the Quran card moves across to the side column, and
                  goes FIRST in it — the side column was half empty, and
                  a shortcut outranks a read-only summary. Home now fits
                  the window on iPad with nothing to scroll to. */}
              <View style={{ width: HOME_MAIN_COL, gap: 12 }}>{dayTable}</View>
              <View style={styles.dashSide}>
                {quranShortcut}
                {toolsGrid}
                {practiceCard}
                {ramadanCard}
                {providerFooter}
                {statsPanel}
              </View>
            </View>
          );
        }
        return (
          <>
            {dayTable}
            {ramadanCard}
            {quranShortcut}
            {toolsGrid}
            {practiceCard}
            {providerFooter}
            {statsPanel}
          </>
        );
      })()}
      </CenteredColumn>

      <ProviderPickerModal
        visible={providerPickerOpen}
        onClose={handleCloseProviderPicker}
        settings={settings}
        updateSettings={updateSettings}
        palette={pickerPalette}
      />

      <FeatureTourModal
        visible={tourVisible}
        onClose={() => setTourVisible(false)}
      />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Expanded-width dashboard: fixed "today" main column + flexible tools
  // sidebar, so Home fills a wide window and fits without scrolling.
  dashRow: {
    flexDirection: 'row',
    // Stretch (not flex-start): the sidebar's last card can breathe to
    // the main column's height, so the two columns read as one piece.
    alignItems: 'stretch',
    gap: 20,
  },
  dashSide: {
    flex: 1,
    gap: 12,
  },
  homeRoot: { flex: 1 },
  // Mac Catalyst header controls, in the flow (see the render site).
  // `flex-end` rather than `right`, so Arabic and the other right-to-left
  // languages get the mirror of this and not the same corner.
  macHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  // Inter-card rhythm for BOTH CenteredColumn variants (compact uses the
  // outer `style`, wide uses the capped inner column).
  homeColumn: { gap: 12 },
  scrollContent: {
    padding: HOME_SCREEN_PADDING,
    paddingBottom: 36,
    gap: 12,
  },
  // Dashboard: let the content grow to the viewport and center it
  // vertically when shorter (§B1 — kills the dead bottom half).
  scrollContentDash: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
