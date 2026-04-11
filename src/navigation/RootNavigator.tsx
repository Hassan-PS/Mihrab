import { useNavigation, useTheme } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { HeaderToolbarIcons } from '../components/HeaderToolbarIcons';
import { CompassScreen } from '../screens/CompassScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MonthTimesScreen } from '../screens/MonthTimesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
  return (
    <Stack.Navigator>
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
        options={{ title: t('nav.month') }}
      />
      <Stack.Screen
        name="Compass"
        component={CompassScreen}
        options={{ title: t('nav.compass') }}
      />
    </Stack.Navigator>
  );
}
