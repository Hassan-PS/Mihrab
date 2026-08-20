import { NavigationContainer } from '@react-navigation/native';
import { layoutDirectionFor } from './i18n/layoutDirection';
import { useEffect, useMemo, useRef } from 'react';
import {
  Appearance,
  AppState,
  Platform,
  StatusBar,
  View,
} from 'react-native';
import { usePrayerSettings } from './context/PrayerSettingsContext';
import { useSystemColorScheme } from './hooks/useSystemColorScheme';
import { RootNavigator } from './navigation/RootNavigator';
import { SystemNavigationScrim } from './navigation/SystemNavigationScrim';
import {
  restartApp as nativeRestartApp,
  setNavigationBarStyle,
} from './native/SystemTheme';
import {
  resolveAppPalette,
  resolveEffectiveDark,
} from './theme/appPalette';
import { buildNavigationTheme } from './theme/navigationTheme';
import { useSyncWidgetUiHints } from './widget/syncWidgetUiHints';
import { syncWidgetLogQueue } from './widget/syncWidgetLogQueue';
import { getPrayerLiveActivityModule } from './native/PrayerLiveActivity';
import { isMacCatalyst } from './responsive/breakpoints';
import { rescheduleAyahOfDay } from './notifications/ayahOfDay';
import { rescheduleFastingReminders } from './notifications/fastingReminders';
import { rescheduleKhatmahReminder } from './notifications/khatmahReminder';
import {
  getQuranState,
  hydrateQuranState,
  subscribeQuranState,
} from './quran/quranState';
import { reconcileMushafAssets } from './quran/mushafAssets';

export function AppNavigationRoot() {
  const { settings, hydrated } = usePrayerSettings();
  const systemScheme = useSystemColorScheme();

  useSyncWidgetUiHints();

  /**
   * Bring the Quran files on disk in line with the ones this build reads —
   * once, at launch, off the critical path.
   *
   * Here rather than in the reader because the files an update has left
   * behind are the reader's business only if the reader is opened, and the
   * whole problem is the installs where it isn't: the retired page images
   * were swept only by starting a download, so anyone who declined that once
   * kept the lot. Fonts from a superseded release are worse — nothing about
   * them looks wrong from inside the app, so nobody would ever go looking.
   */
  useEffect(() => {
    void reconcileMushafAssets().catch(e =>
      console.warn('mushafAssets: reconciliation failed', e),
    );
  }, []);

  // Daily-notification resync — ayah of the day, khatmah reminder, and
  // fasting reminders keep their rolling trigger windows fresh here.
  // Re-syncs when the relevant settings change and on every foreground,
  // throttled to once per hour (each scheduler cancels + recreates its
  // own date-stable trigger ids, so re-running is idempotent).
  // Fasting reminders used to resync only from the Fasting screen,
  // which let the 60-day window silently drain (v2.7.28 fix).
  const lastDailySyncRef = useRef(0);
  useEffect(() => {
    if (!hydrated) return;
    const sync = (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastDailySyncRef.current < 60 * 60 * 1000) return;
      lastDailySyncRef.current = now;
      // Companion mode + tafsir edition live in the quran blob, not the
      // settings context — hydrate (idempotent) then read non-reactively so
      // page-turn writes don't re-render the navigation root (v2.7.40).
      void hydrateQuranState().then(() => {
        const prefs = getQuranState().prefs;
        void rescheduleAyahOfDay({
          enabled: settings.ayahOfDayEnabled,
          hour: settings.ayahOfDayHour,
          minute: settings.ayahOfDayMinute,
          quranTranslationEdition: settings.quranTranslationEdition,
          language: settings.language,
          companionMode: prefs.companionMode,
          tafsirEditionId: prefs.tafsirEditionId,
        });
      });
      void rescheduleKhatmahReminder({
        enabled: settings.khatmahReminderEnabled,
        hour: settings.khatmahReminderHour,
        minute: settings.khatmahReminderMinute,
      });
      void rescheduleFastingReminders({
        enabled: settings.fastingRemindersEnabled,
        hour: settings.fastingReminderHour,
      });

    };
    sync(true);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sync(false);
    });
    // Re-sync when the companion choice itself changes (mode or tafsir
    // edition) so tomorrow's daily-ayah body reflects the new pick. Guarded
    // by a field comparison — the quran blob also changes on every page
    // turn/bookmark, which must NOT trigger a resync.
    let lastCompanion = '';
    const unsubQuran = subscribeQuranState(() => {
      const p = getQuranState().prefs;
      const key = `${p.companionMode}|${p.tafsirEditionId}`;
      if (lastCompanion === '') {
        lastCompanion = key;
        return;
      }
      if (key !== lastCompanion) {
        lastCompanion = key;
        sync(true);
      }
    });
    return () => {
      sub.remove();
      unsubQuran();
    };
  }, [
    hydrated,
    settings.ayahOfDayEnabled,
    settings.ayahOfDayHour,
    settings.ayahOfDayMinute,
    settings.quranTranslationEdition,
    settings.language,
    settings.khatmahReminderEnabled,
    settings.khatmahReminderHour,
    settings.khatmahReminderMinute,
    settings.fastingRemindersEnabled,
    settings.fastingReminderHour,
  ]);

  // iOS: re-show the Live Activity if the user dismissed it (swipe / "Clear
  // all") while the feature is still enabled. iOS forbids starting one from the
  // background and can't prevent dismissal, so we revive it on every foreground
  // — the closest to "always shown while enabled". The native side no-ops when
  // the feature is off, a card is already showing, or there's no next prayer
  // today. (HomeScreen still re-syncs on focus; this also covers other screens.)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const reassert = () => {
      getPrayerLiveActivityModule()?.reassert?.().catch(() => {});
    };
    reassert();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') reassert();
    });
    return () => sub.remove();
  }, []);

  // Write anything tapped on the Log Today widget into the journal.
  //
  // The widget queues taps rather than writing them, because the journal is
  // encrypted and its one writer lives here in JS — see widgetLogQueue.ts.
  // On foreground is where the queue almost always drains: the user taps the
  // widget, opens the app later, and the Log already agrees with what the
  // widget was showing. Runs on mount too, for a cold start from the widget.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const drain = () => {
      void syncWidgetLogQueue();
    };
    drain();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') drain();
    });
    return () => sub.remove();
  }, []);

  // Auto-restart on a system dark/light flip when dynamic colors are
  // active — task #118. Material You's PlatformColor refs resolve at
  // view-attach time, so a mid-session theme flip leaves stale tints
  // on already-rendered surfaces. The user opted into Material You so
  // they expect colour changes to be reflected; we trigger a clean
  // native restart instead of trying to reconcile the half-themed UI.
  // The previous-scheme ref prevents the effect from firing on initial
  // mount (when systemScheme transitions undefined → 'light'/'dark').
  const prevSchemeRef = useRef<typeof systemScheme | undefined>(undefined);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const prev = prevSchemeRef.current;
    prevSchemeRef.current = systemScheme;
    // Skip if this is the first time we see a real value, or if dynamic
    // colors aren't active, or if the user is forcing light/dark
    // explicitly (system follow is off).
    if (prev === undefined) return;
    if (!systemScheme) return;
    if (prev === systemScheme) return;
    if (settings.appearance !== 'system') return;
    if (!settings.useSystemDynamicTheme) return;
    nativeRestartApp();
  }, [systemScheme, settings.appearance, settings.useSystemDynamicTheme]);

  // iOS: force the window's userInterfaceStyle to the app's chosen appearance
  // so native chrome follows the in-app theme, not the system one, when they
  // differ. Without this the navigation-bar Liquid Glass / blur material behind
  // the header location-pin + Settings-gear chip resolves against the device
  // trait collection (system light/dark) while the chip's own glyphs/text use
  // the app palette — so a light-app-on-dark-system (or vice-versa) device gets
  // a mismatched header. `Appearance.setColorScheme` sets the key window's
  // overrideUserInterfaceStyle; 'system' clears the override. iOS-only: Android
  // theming already flows through the palette + native nav-bar style + the
  // dynamic-colour restart path above, and an override there would fight it.
  const isDark = useMemo(
    () => resolveEffectiveDark(settings.appearance, systemScheme),
    [settings.appearance, systemScheme],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (settings.appearance === 'system' && !isMacCatalyst) {
      Appearance.setColorScheme('unspecified');
      return;
    }
    // Explicit light/dark — and ALWAYS on Mac (Catalyst / iPad-on-Mac):
    // pin the native chrome to the app's RESOLVED theme. On Mac the
    // window trait (which the header's glass chip material follows) and
    // RN's detected scheme can disagree, leaving a dark chip on a light
    // app (reported 2026-07-16). Freezing the override to the resolved
    // value keeps every native surface in step with the app theme.
    Appearance.setColorScheme(
      settings.appearance === 'system'
        ? isDark
          ? 'dark'
          : 'light'
        : settings.appearance,
    );
  }, [settings.appearance, isDark]);

  const palette = useMemo(
    () =>
      resolveAppPalette({
        appearance: settings.appearance,
        useSystemDynamicTheme: settings.useSystemDynamicTheme,
        systemScheme,
        pureBlackDark: settings.pureBlackDark,
        appAccentId: settings.appAccentId,
        appAccentCustomHex: settings.appAccentCustomHex,
      }),
    [
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.pureBlackDark,
      settings.appAccentId,
      settings.appAccentCustomHex,
      systemScheme,
    ],
  );

  const navTheme = useMemo(
    () => buildNavigationTheme(palette, isDark),
    [palette, isDark],
  );

  // Keep the Android system navigation bar in step with the app theme.
  // Re-applied whenever dark/light flips and again when the app returns
  // to the foreground (the OS can reset the inset controller across some
  // backgrounding paths). No-op on iOS.
  useEffect(() => {
    setNavigationBarStyle(isDark);
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setNavigationBarStyle(isDark);
    });
    return () => sub.remove();
  }, [isDark]);

  // Every right-to-left language we ship, not just Arabic — Urdu was
  // getting an LTR layout with RTL text in it. One rule, one place:
  // see `layoutDirection.ts` for why that matters.
  const layoutDir = layoutDirectionFor(settings.language);

  return (
    <View style={{ flex: 1, direction: layoutDir }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
      <SystemNavigationScrim palette={palette} />
    </View>
  );
}
