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
import { linking } from './navigation/linking';
import { RootNavigator } from './navigation/RootNavigator';
import { SystemNavigationScrim } from './navigation/SystemNavigationScrim';
import { useSystemBarSurface } from './navigation/systemBarSurface';
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
import { onWidgetQueueChanged } from './native/WidgetQueueWatcher';
import { syncWidgetLogQueue } from './widget/syncWidgetLogQueue';
import { syncWidgetTasbihQueue } from './widget/syncWidgetTasbihQueue';
import {
  republishWidgetPayload,
  startWidgetPayloadSync,
} from './widget/republishWidgetPayload';
import { getPrayerLiveActivityModule } from './native/PrayerLiveActivity';
import { isMacCatalyst } from './responsive/breakpoints';
import { rescheduleAyahOfDay } from './notifications/ayahOfDay';
import { rescheduleFastingReminders } from './notifications/fastingReminders';
import {
  khatmahReminderDue,
  rescheduleKhatmahReminder,
} from './notifications/khatmahReminder';
import {
  activeKhatmah,
  getQuranState,
  hydrateQuranState,
  subscribeQuranState,
} from './quran/quranState';
import { reconcileMushafAssets } from './quran/mushafAssets';
import { startAutoSync } from './sync/autoSync';
import {
  dayTzFingerprint,
  markResynced,
  shouldResync,
} from './utils/resyncGate';

/** Gate key for the daily notification reschedules — see utils/resyncGate. */
const DAILY_RESYNC_KEY = 'root.dailyReschedules';

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
      // The hourly gate above stops it running on every single foreground.
      // This one stops the runs that DO get through from redoing work whose
      // inputs are identical — and this rebuild is not cheap: the ayah path
      // cancels fourteen notifications and recreates them with up to
      // fourteen sequential surah loads, plus a tafsir fetch each when the
      // companion is tafsir. Same day, same settings, same fourteen
      // notifications (docs/design/background-power.md).
      //
      // The day is in the fingerprint, so the sliding window still rebuilds
      // once a day; a settings change still passes `force` and changes the
      // fingerprint, so nothing a user does waits for anything.
      // Read before hydration on the first pass, so this may be the default
      // companion rather than the stored one — worth at most one extra
      // rebuild at launch, and `subscribeQuranState` below forces a sync the
      // moment the real value differs.
      const prefs = getQuranState()?.prefs;
      const dailyPrint = dayTzFingerprint(
        new Date(now),
        String(settings.ayahOfDayEnabled),
        settings.ayahOfDayHour,
        settings.ayahOfDayMinute,
        settings.quranTranslationEdition,
        settings.language,
        String(prefs?.companionMode),
        String(prefs?.tafsirEditionId),
        String(settings.khatmahReminderEnabled),
        settings.khatmahReminderHour,
        settings.khatmahReminderMinute,
        String(settings.fastingRemindersEnabled),
        settings.fastingReminderHour,
      );
      if (!shouldResync(DAILY_RESYNC_KEY, dailyPrint, now)) return;
      markResynced(DAILY_RESYNC_KEY, dailyPrint, now);
      lastDailySyncRef.current = now;
      // Companion mode + tafsir edition live in the quran blob, not the
      // settings context — hydrate (idempotent) then read non-reactively so
      // page-turn writes don't re-render the navigation root (v2.7.40).
      void hydrateQuranState().then(() => {
        const hydrated = getQuranState().prefs;
        void rescheduleAyahOfDay({
          enabled: settings.ayahOfDayEnabled,
          hour: settings.ayahOfDayHour,
          minute: settings.ayahOfDayMinute,
          quranTranslationEdition: settings.quranTranslationEdition,
          language: settings.language,
          companionMode: hydrated.companionMode,
          tafsirEditionId: hydrated.tafsirEditionId,
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
    // The khatmah reminder is the one daily notification whose usefulness
    // changes DURING the day: finishing the portion should silence today's,
    // and starting or finishing a plan changes whether there is anything to
    // schedule at all. Its window is written a week ahead, so without this
    // nothing would revisit today's until tomorrow — the reader who read
    // this morning still got poked this evening. Guarded on the verdict, not
    // on the state: the quran blob also changes on every page turn.
    let lastKhatmah = '';
    const unsubKhatmah = subscribeQuranState(() => {
      const plan = activeKhatmah(getQuranState());
      const key = plan
        ? `${plan.id}|${khatmahReminderDue(plan, Date.now())}`
        : 'none';
      if (lastKhatmah === '') {
        lastKhatmah = key;
        return;
      }
      if (key === lastKhatmah) return;
      lastKhatmah = key;
      void rescheduleKhatmahReminder({
        enabled: settings.khatmahReminderEnabled,
        hour: settings.khatmahReminderHour,
        minute: settings.khatmahReminderMinute,
      });
    });
    return () => {
      sub.remove();
      unsubQuran();
      unsubKhatmah();
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

  // Keep the widget payload in step with the app, from the ROOT.
  //
  // This used to live in HomeScreen, which the lazy tab navigator only mounts
  // once Today has been focused — so every deep link the widgets themselves
  // fire opened the app on a screen that could not refresh them. Here it runs
  // for the whole life of the app whichever screen the user landed on.
  useEffect(() => startWidgetPayloadSync(), []);

  // Pull in whatever the other devices wrote, from the ROOT and for the same
  // reason: sync should already have happened by the time the user reaches
  // the screen that shows the data, whichever screen that is. Throttled and
  // silent — see autoSync.ts.
  useEffect(() => startAutoSync(), []);

  // Write anything tapped on the Log Today widget into the journal.
  //
  // The widget queues taps rather than writing them, because the journal is
  // encrypted and its one writer lives here in JS — see widgetLogQueue.ts.
  // On foreground is where the queue almost always drains: the user taps the
  // widget, opens the app later, and the Log already agrees with what the
  // widget was showing. Runs on mount too, for a cold start from the widget.
  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    // Republish AFTER the drain, not alongside it.
    //
    // Both drains write to the journal and the tasbih counter, and both are
    // async. Started fire-and-forget they reliably finished after the first
    // payload push of a cold start, so a tap made on the widget landed in the
    // journal and the payload that was supposed to reflect it had already been
    // written from the pre-drain values — with nothing scheduled to correct
    // it. Awaiting them costs nothing here and closes the race.
    const drain = () => {
      void Promise.allSettled([
        syncWidgetLogQueue(),
        syncWidgetTasbihQueue(),
      ]).then(() => republishWidgetPayload('queue-drain'));
    };
    drain();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') drain();
    });
    // THE THIRD TRIGGER, and the one a widget tap actually produces.
    //
    // Mount and `active` are both about the app changing state, and a widget
    // tap changes nothing about the app: the intent runs in the extension and
    // does not bring anything forward. On iPhone that never showed, because
    // you cannot see a Home Screen widget while the app is in front of you —
    // the tap happens backgrounded and opening the app fires `active`. On a
    // Mac, Notification Center opens over an app that stays active, so the
    // two triggers above can go a whole session without firing. Measured
    // 2026-08-29: two taps sat in the queue with the app open throughout, and
    // only a relaunch wrote them, while the widget drew their ticks the whole
    // time. Entries are discarded after a fortnight, so that is lost data
    // rather than late data.
    const unsubscribeQueue = onWidgetQueueChanged(drain);
    return () => {
      sub.remove();
      unsubscribeQueue();
    };
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
  //
  // A screen that has claimed the bottom of the window decides this
  // instead — the muṣḥaf's night page under a light app theme wants light
  // glyphs, and the app theme cannot know that. See `systemBarSurface`.
  const barSurface = useSystemBarSurface();
  const barIsDark = barSurface ? barSurface.isDark : isDark;
  useEffect(() => {
    setNavigationBarStyle(barIsDark);
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setNavigationBarStyle(barIsDark);
    });
    return () => sub.remove();
  }, [barIsDark]);

  // Every right-to-left language we ship, not just Arabic — Urdu was
  // getting an LTR layout with RTL text in it. One rule, one place:
  // see `layoutDirection.ts` for why that matters.
  const layoutDir = layoutDirectionFor(settings.language);

  return (
    <View style={{ flex: 1, direction: layoutDir }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navTheme} linking={linking}>
        <RootNavigator />
      </NavigationContainer>
      <SystemNavigationScrim palette={palette} />
    </View>
  );
}
