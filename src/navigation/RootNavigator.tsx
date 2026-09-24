import { useNavigation, useTheme } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabs } from './MainTabs';
import { HeaderPlaybackBar } from '../quran/audio/HeaderPlaybackBar';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { CompassScreen } from '../screens/CompassScreen';
import { isMacCatalyst } from '../responsive/breakpoints';
import { MonthTimesScreen } from '../screens/MonthTimesScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { QuranSurahScreen } from '../screens/QuranSurahScreen';
import { QuranDownloadsScreen } from '../screens/QuranDownloadsScreen';
import { TajweedGuideScreen } from '../quran/tajweed/TajweedGuideScreen';
import { TilawahScreen } from '../screens/quran/TilawahScreen';
import { ShareMonthScreen } from '../screens/ShareMonthScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { FastingScreen } from '../screens/FastingScreen';
import { SETTINGS_STACK_PAGES } from '../screens/settings/subpages';
import type { RootStackParamList } from './types';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';

const Stack = createNativeStackNavigator<RootStackParamList>();

const isIOS = Platform.OS === 'ios';

/** The wrapper the playback bar and the screen share. */
const SCREEN = { flex: 1 } as const;


// Home header controls now live in ../navigation/HomeHeaderControls so the
// HomeScreen can render the same row as content on Mac Catalyst, where the
// transparent navigation bar sits in the window's title-bar drag region and
// clicks on header buttons were intermittently swallowed as window drags.

/**
 * Auto-routes to Onboarding on first run when `onboardingComplete` is
 * still false — task #60. Uses a one-shot ref so the auto-route fires
 * exactly once per app launch and doesn't fight the user if they pop back.
 */
function useOnboardingAutoRoute() {
  const { settings, hydrated } = usePrayerSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!hydrated) return;
    if (settings.onboardingComplete) return;
    firedRef.current = true;
    navigation.navigate('Onboarding');
  }, [hydrated, navigation, settings.onboardingComplete]);
}

function TabsRoot() {
  // The onboarding auto-route effect lives on the landing route so it has a
  // navigation prop without pulling a one-shot effect into
  // AppNavigationRoot's tree. The landing route is the tab navigator now.
  useOnboardingAutoRoute();
  return <MainTabs />;
}

export function RootNavigator() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  // Bottom safe-area inset. RN 0.83 draws edge-to-edge on Android (targetSdk 36
  // can't opt out), so without this the screen content renders *under* the
  // system navigation bar — most visible with 3-button navigation, where the
  // taller bar hides bottom buttons (Tasbih controls, Month "Share image") and
  // list footers. Applied globally via the native-stack contentStyle so every
  // screen's content clears the nav bar (scroll viewports shorten, fixed bottom
  // bars push up). No colour seam because theme.colors.background === palette.bg.
  const insets = useSafeAreaInsets();
  // RTL-aware title rendering — task #142.
  //
  // iOS native-stack `headerLargeTitle` is a UIKit `UINavigationBar` large
  // title. It does NOT do Unicode bidi reshaping of Arabic/Urdu/Hebrew text
  // — letters render in visual L-to-R order, producing the bug the user
  // reported: "أوقات الصلاة" → "ةلصلا تاقوأ" (letters reversed AND not
  // joined). `writingDirection: 'rtl'` on the style does NOT fix this; the
  // bug is below the RN style layer.
  //
  // The robust fix is to disable `headerLargeTitle` for RTL locales and use
  // the regular (compact) navigation bar instead. The compact title goes
  // through a different UIKit code path that DOES shape Arabic correctly,
  // matching what the user sees on the small header chip in screenshot 3.
  const isRtlLocale = ['ar', 'ur', 'he', 'fa'].includes(
    (i18n.language || '').slice(0, 2),
  );
  const titleWritingDirection: 'rtl' | 'ltr' = isRtlLocale ? 'rtl' : 'ltr';
  return (
    <Stack.Navigator
      /**
       * The same playback bar the tabs carry, on the pushed screens too —
       * settings pages, downloads, the month table. Tilawah and the reader
       * are excluded by the bar itself, which knows the route it is on.
       */
      screenLayout={({ children }) => (
        <View style={SCREEN}>
          {/* `theme.colors.background` is exactly what `headerStyle` below
              is given, so the bar and the header are one surface. */}
          <HeaderPlaybackBar
            surface={theme.colors.background}
            underTransparentHeader
          />
          {children}
        </View>
      )}
      screenOptions={{
        // Large title only on iOS AND only for LTR locales — RTL locales fall
        // back to the compact title to avoid the Arabic-letters-reversed bug.
        headerLargeTitle: isIOS && !isRtlLocale,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerBlurEffect: theme.dark ? 'dark' : 'light',
        headerTransparent: isIOS,
        /**
         * Centred on both platforms, not just on iOS.
         *
         * This is one of the few places the app took a platform default
         * without deciding anything: native-stack centres a title on iOS
         * and left-aligns it on Android, so the same subpage — Notifications,
         * Attributions, Daily reminders — read as two different designs
         * depending on the phone it was opened on. Every other piece of
         * chrome here is chosen rather than inherited; this one is now too.
         *
         * Only the pushed subpages. The tabs keep their own alignment
         * (see MainTabs), where the title sits beside a large-title layout
         * that is a different shape altogether.
         */
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: isIOS ? 'transparent' : theme.colors.background },
        headerLargeStyle: { backgroundColor: 'transparent' },
        // Keep content above the system navigation bar (edge-to-edge bottom inset).
        contentStyle: { paddingBottom: insets.bottom, backgroundColor: theme.colors.background },
        // writingDirection is a valid RN TextStyle prop (needed for the RTL
        // title fix) but react-navigation types the title style as a narrower
        // Pick<TextStyle, …> that omits it; cast past the type to keep the
        // runtime behavior.
        // `fontSize` on Catalyst only: UIKit sizes the navigation bar for a
        // tablet held at arm's length, and Catalyst then scales the whole
        // canvas down ~23% for the Mac. The compounded result is a 13pt
        // title on a desktop display. See responsive/desktop.ts.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        headerTitleStyle: {
          color: theme.colors.text,
          writingDirection: titleWritingDirection,
          ...(IS_MAC_CATALYST ? { fontSize: desktopSize(17) } : null),
        } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        headerLargeTitleStyle: {
          color: theme.colors.text,
          writingDirection: titleWritingDirection,
          ...(IS_MAC_CATALYST ? { fontSize: desktopSize(34) } : null),
        } as any,
        // Default portrait everywhere; the Quran mushaf-fullscreen mode
        // overrides this to 'all' via navigation.setOptions so the user
        // can rotate the phone for landscape reading. The activity's
        // android:screenOrientation is now 'unspecified' so this option
        // takes effect.
        orientation: 'portrait',
      }}>
      {/* The six tabs are the app (design review 2e). Everything below is
          pushed ON TOP of them: sub-pages, readers and one-off flows. */}
      <Stack.Screen
        name="Home"
        component={TabsRoot}
        options={{
          headerShown: false,
          // The stack's default `contentStyle` reserves the bottom safe
          // area for PUSHED pages, which have nothing else down there.
          // The tabs do: the tab bar reserves that inset itself, so
          // inheriting it as well left the bar floating a safe-area's
          // worth above the bottom edge with a band of dead background
          // beneath it (visible on iPad, where the inset is 20pt).
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
      {/* Subpages: inherit screenOptions defaults (transparent header on
          iOS for the blur effect, opaque on Android via headerStyle), only
          override `headerLargeTitle: false` to keep the compact navbar
          look. The previously-stacked `headerBackground` view + per-screen
          `headerTransparent: false` was creating a double-offset / extra
          gap below the title bar (#91). */}
      <Stack.Screen
        name="MonthTimes"
        component={MonthTimesScreen}
        options={{ title: t('nav.month'), headerLargeTitle: false }}
      />
      <Stack.Screen
        name="ShareMonth"
        component={ShareMonthScreen}
        options={{ title: t('nav.shareMonth'), headerLargeTitle: false }}
      />
      {/* Not on a Mac. There is no magnetometer in one, so the dial has
          nothing to point with — it would sit at a fixed heading and look
          broken, which is worse than the feature being absent. The HERO
          CHIP still shows the bearing there: that number is trigonometry
          on two coordinates, not a sensor reading.

          Unregistering rather than rendering a "not supported" screen so
          that `navigate('Compass')` cannot half-work, and so the `qibla`
          deep link 404s honestly instead of opening a dead room. */}
      {isMacCatalyst ? null : (
        <Stack.Screen
          name="Compass"
          component={CompassScreen}
          options={{ title: t('nav.compass'), headerLargeTitle: false }}
        />
      )}
      <Stack.Screen
        name="QuranSurah"
        component={QuranSurahScreen}
        options={{ title: '', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="QuranListen"
        component={TilawahScreen}
        options={{
          title: t('quran.listenTitle', 'Tilawah'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="QuranDownloads"
        component={QuranDownloadsScreen}
        options={{
          title: t('downloads.title', 'Manage downloads'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="QuranTajweed"
        component={TajweedGuideScreen}
        options={{
          title: t('tajweed.guideTitle', 'Reading the colours'),
          headerLargeTitle: false,
        }}
      />
      {/* A modal, not a pushed card, and no gesture.

          It used to be an ordinary push with a header, so the back arrow
          and the swipe both dropped the user out mid-flow onto a Home
          that may be nothing but a full-screen location wall. Leaving
          should be a decision — Skip, Not now, or Start — not a gesture.
          Android's hardware back is intercepted inside the flow, where it
          steps back one screen. See docs/design/onboarding-remake.md §6.5.

          `fullScreenModal`, not `modal`: on iOS the latter is a page
          sheet, which leaves a sliver of Home showing above the flow and
          insets the whole thing under a card edge. First launch should
          not have a half-built Home peeking over its shoulder. */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          title: '',
          headerShown: false,
          headerLargeTitle: false,
          presentation: 'fullScreenModal',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Backup"
        component={BackupScreen}
        options={{ title: t('nav.backup'), headerLargeTitle: false }}
      />
      {/* Pairing lives next to Backup because it is the same question asked
          twice — where does my record live, and how do I get it somewhere
          else. Its own destination rather than a card inside Backup, since
          the paired list is something people come back to. */}
      <Stack.Screen
        name="Sync"
        component={SyncScreen}
        options={{ title: t('nav.sync'), headerLargeTitle: false }}
      />
      {/* The sunnah calendar, the day-before reminder and the full history —
          reference material, reached from the Log's fasting card rather
          than owning a destination of its own. */}
      <Stack.Screen
        name="Fasting"
        component={FastingScreen}
        options={{ title: t('nav.fasting'), headerLargeTitle: false }}
      />

      {/* The settings subpages.
       *
       * Native header is hidden: SettingsPage draws the same pinned bar as
       * the Duas category view (opaque `palette.bg`, TabBackButton, bold
       * title) so the bar is the page colour rather than Material/UIKit
       * chrome that drifts from it. Swipe-back still works on the stack.
       *
       * `paddingBottom: 0` — the stack's default reserves `insets.bottom`
       * and paints it as a dead stripe behind the gesture handle / under
       * the three-button bar. Duas (a tab) never gets that stripe because
       * the Home route overrides contentStyle the same way; SettingsPage
       * owns the bottom reserve itself and publishes the page colour to
       * SystemNavigationScrim so three-button nav matches Verdant. */}
      {SETTINGS_STACK_PAGES.map(page => (
        <Stack.Screen
          key={page.route}
          name={page.route}
          component={page.component}
          options={{
            title: t(page.titleKey),
            headerShown: false,
            headerBackTitle: t(page.backTitleKey),
            contentStyle: {
              backgroundColor: theme.colors.background,
              paddingBottom: 0,
            },
          }}
        />
      ))}
    </Stack.Navigator>
  );
}
