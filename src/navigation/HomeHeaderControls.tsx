/**
 * Home header controls (location chip + Settings gear) — v2.7.41.
 *
 * Extracted from RootNavigator so the same row can render in two places:
 *
 *  • iOS/Android — inside the native navigation header (`headerRight`),
 *    exactly as before.
 *  • Mac Catalyst — as the FIRST ROW OF HOME CONTENT instead. On Catalyst
 *    the transparent navigation bar sits inside the window's title-bar
 *    DRAG REGION, so clicks on header buttons were intermittently
 *    swallowed as window drags ("the settings gear sometimes works").
 *    Content rows live below the drag region, so clicks always land.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { HeaderToolbarIcons } from '../components/HeaderToolbarIcons';
import { LocationChip } from '../screens/home/LocationChip';
import { useAppPalette } from '../hooks/useAppPalette';
import type { RootStackParamList } from './types';

export function HomeHeaderControls() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    // The location pin sits left of the Settings gear, so both top-level
    // controls live in the same row. The pin renders for users on manual
    // location (with or without saved presets) and shows the current
    // location label; tapping it opens the preset switcher when presets
    // exist, otherwise Settings. GPS/automatic-mode users get a clean
    // single-icon row (no static location label to show).
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <LocationChip
        compactHeader
        onAddLocation={() =>
          navigation.navigate('Settings', { highlight: 'savedLocations' })
        }
      />
      <HeaderToolbarIcons
        // Use palette.accentSolid (the user's chosen accent color from
        // settings, resolved through the SystemTheme native module on
        // Material You devices) instead of theme.colors.primary which
        // is React Navigation's static "primary" and doesn't track the
        // accent picker. This makes the Settings gear match the
        // location-pin tint and every other accent-tinted glyph in
        // the app.
        tintColor={palette.accentSolid}
        onMonth={() => navigation.navigate('MonthTimes')}
        onCompass={() => navigation.navigate('Compass')}
        onSettings={() => navigation.navigate('Settings')}
        monthA11yLabel={t('a11y.openMonth')}
        compassA11yLabel={t('a11y.openCompass')}
        settingsA11yLabel={t('a11y.openSettings')}
        // Calendar (month) and Compass already exist on the home screen
        // body — Calendar via the "Prayer times for the whole month" link
        // under the prayer table, Compass as a tile in QuickActionsGrid.
        // Surfacing them in the header too is duplication; only Settings
        // has no body-row equivalent, so keep that one.
        showMonth={false}
        showCompass={false}
      />
    </View>
  );
}
