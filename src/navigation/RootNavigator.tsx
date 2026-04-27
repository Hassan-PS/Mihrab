import { useNavigation, useTheme } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { HeaderToolbarIcons } from '../components/HeaderToolbarIcons';
import { CompassScreen } from '../screens/CompassScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MonthTimesScreen } from '../screens/MonthTimesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShareMonthScreen } from '../screens/ShareMonthScreen';
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

export function RootNavigator() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerLargeTitle: isIOS,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerBlurEffect: theme.dark ? 'dark' : 'light',
        headerTransparent: isIOS,
        headerStyle: { backgroundColor: isIOS ? 'transparent' : theme.colors.background },
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerTitleStyle: { color: theme.colors.text },
        headerLargeTitleStyle: { color: theme.colors.text },
      }}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
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
      <Stack.Screen
        name="MonthTimes"
        component={MonthTimesScreen}
        options={{ title: t('nav.month'), headerLargeTitle: false, headerTransparent: false, headerStyle: { backgroundColor: theme.colors.background } }}
      />
      <Stack.Screen
        name="ShareMonth"
        component={ShareMonthScreen}
        options={{ title: t('nav.shareMonth'), headerLargeTitle: false, headerTransparent: false, headerStyle: { backgroundColor: theme.colors.background } }}
      />
      <Stack.Screen
        name="Compass"
        component={CompassScreen}
        options={{ title: t('nav.compass'), headerLargeTitle: false, headerTransparent: false, headerStyle: { backgroundColor: theme.colors.background } }}
      />
    </Stack.Navigator>
  );
}
