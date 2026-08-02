import { useNavigation, useTheme } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabs } from './MainTabs';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { CompassScreen } from '../screens/CompassScreen';
import { MonthTimesScreen } from '../screens/MonthTimesScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { QuranSurahScreen } from '../screens/QuranSurahScreen';
import { QuranDownloadsScreen } from '../screens/QuranDownloadsScreen';
import { ShareMonthScreen } from '../screens/ShareMonthScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { FastingScreen } from '../screens/FastingScreen';
import type { RootStackParamList } from './types';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';

const Stack = createNativeStackNavigator<RootStackParamList>();

const isIOS = Platform.OS === 'ios';


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
      screenOptions={{
        // Large title only on iOS AND only for LTR locales — RTL locales fall
        // back to the compact title to avoid the Arabic-letters-reversed bug.
        headerLargeTitle: isIOS && !isRtlLocale,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerBlurEffect: theme.dark ? 'dark' : 'light',
        headerTransparent: isIOS,
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
      <Stack.Screen
        name="Compass"
        component={CompassScreen}
        options={{ title: t('nav.compass'), headerLargeTitle: false }}
      />
      <Stack.Screen
        name="QuranSurah"
        component={QuranSurahScreen}
        options={{ title: '', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="QuranDownloads"
        component={QuranDownloadsScreen}
        options={{
          title: t('downloads.title', 'Manage downloads'),
          headerLargeTitle: false,
        }}
      />
      {/* The Log: prayers and fasting on one screen (design review 2c).
          The route keeps its old name so the "Log prayer" notification
          action and every existing deep link still land somewhere. */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ title: '', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="Backup"
        component={BackupScreen}
        options={{ title: t('nav.backup'), headerLargeTitle: false }}
      />
      {/* The sunnah calendar, the day-before reminder and the full history —
          reference material, reached from the Log's fasting card rather
          than owning a destination of its own. */}
      <Stack.Screen
        name="Fasting"
        component={FastingScreen}
        options={{ title: t('nav.fasting'), headerLargeTitle: false }}
      />
    </Stack.Navigator>
  );
}
