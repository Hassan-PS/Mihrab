import { useNavigation, useTheme } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { HeaderToolbarIcons } from '../components/HeaderToolbarIcons';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { CompassScreen } from '../screens/CompassScreen';
import { DuasScreen } from '../screens/DuasScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { MonthTimesScreen } from '../screens/MonthTimesScreen';
import { MosquesScreen } from '../screens/MosquesScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { QuranScreen } from '../screens/QuranScreen';
import { QuranSurahScreen } from '../screens/QuranSurahScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShareMonthScreen } from '../screens/ShareMonthScreen';
import { TasbihScreen } from '../screens/TasbihScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { FastingScreen } from '../screens/FastingScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const isIOS = Platform.OS === 'ios';

function HomeHeaderRight() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <HeaderToolbarIcons
      tintColor={theme.colors.primary}
      onMonth={() => navigation.navigate('MonthTimes')}
      onCompass={() => navigation.navigate('Compass')}
      onSettings={() => navigation.navigate('Settings')}
      monthA11yLabel={t('a11y.openMonth')}
      compassA11yLabel={t('a11y.openCompass')}
      settingsA11yLabel={t('a11y.openSettings')}
    />
  );
}

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

function HomeScreenWrapper() {
  // Wraps HomeScreen so the onboarding auto-route effect lives on the
  // landing route — it has access to the navigation prop without pulling
  // a one-shot effect into AppNavigationRoot's tree.
  useOnboardingAutoRoute();
  return <HomeScreen />;
}

export function RootNavigator() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
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
        headerTitleStyle: { color: theme.colors.text, writingDirection: titleWritingDirection },
        headerLargeTitleStyle: { color: theme.colors.text, writingDirection: titleWritingDirection },
        // Default portrait everywhere; the Quran mushaf-fullscreen mode
        // overrides this to 'all' via navigation.setOptions so the user
        // can rotate the phone for landscape reading. The activity's
        // android:screenOrientation is now 'unspecified' so this option
        // takes effect.
        orientation: 'portrait',
      }}>
      <Stack.Screen
        name="Home"
        component={HomeScreenWrapper}
        options={{
          title: t('nav.home'),
          headerRight: () => <HomeHeaderRight />,
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('nav.settings') }}
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
        name="Tasbih"
        component={TasbihScreen}
        options={{ title: t('nav.tasbih'), headerLargeTitle: false }}
      />
      <Stack.Screen
        name="Duas"
        component={DuasScreen}
        options={{ title: t('nav.duas'), headerLargeTitle: false }}
      />
      <Stack.Screen
        name="Quran"
        component={QuranScreen}
        options={{ title: t('nav.quran'), headerLargeTitle: false }}
      />
      <Stack.Screen
        name="QuranSurah"
        component={QuranSurahScreen}
        options={{ title: '', headerLargeTitle: false }}
      />
      <Stack.Screen
        name="Mosques"
        component={MosquesScreen}
        options={{ title: t('nav.mosques'), headerLargeTitle: false }}
      />
      <Stack.Screen
        name="Journal"
        component={JournalScreen}
        options={{ title: t('nav.journal'), headerLargeTitle: false }}
      />
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
      <Stack.Screen
        name="Fasting"
        component={FastingScreen}
        options={{ title: t('nav.fasting'), headerLargeTitle: false }}
      />
    </Stack.Navigator>
  );
}
