/**
 * Home header controls (the location chip) — v2.7.41, reduced in v2.8.5.
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
 *
 * The Settings gear left this row when Settings became a tab — see the
 * comment on the returned element.
 */
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { LocationChip } from '../screens/home/LocationChip';
import type { MainTabParamList, RootStackParamList } from './types';

export function HomeHeaderControls() {
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParamList>,
        NativeStackNavigationProp<RootStackParamList>
      >
    >();
  return (
    // The pin renders for users on manual location (with or without saved
    // presets) and shows the current location label; tapping it opens the
    // preset switcher when presets exist, otherwise Settings.
    //
    // The gear is GONE from here (v2.8.5). It was the last survivor of a
    // toolbar that once held Calendar, Compass and Settings, kept because
    // "only Settings has no body-row equivalent" — and that stopped being
    // true when Settings became the sixth tab. A control that duplicates a
    // tab is not a shortcut, it is a second answer to the same question,
    // and on a phone it was crowding the wordmark hard enough to overlap
    // it. What's left is the one thing the header alone can say: where
    // these times are for.
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <LocationChip
        compactHeader
        // Straight to the page the saved locations are on, rather than
        // to the Settings tab and a scroll: since the settings became an
        // index of sections there is a destination for this, and landing
        // on it is the whole of what "Add new location" promised.
        onAddLocation={() =>
          navigation.navigate('SettingsLocation', {
            highlight: 'savedLocations',
          })
        }
      />
    </View>
  );
}
