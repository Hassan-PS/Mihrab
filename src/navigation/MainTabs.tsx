/**
 * The six tabs (design review 2e): Today · Quran · Tasbih · Duas · Log ·
 * Settings.
 *
 * What moved and why:
 *
 *   • A "More" tab is an admission the deciding was never finished. With
 *     Mosques cut and Month folded into Settings there was nothing left for
 *     it to hold, so the sixth tab became what people were reaching for
 *     anyway.
 *   • Tasbih and Duas are separate. Bundling them as "Dhikr" saved a tab and
 *     cost clarity: one is a counter you tap fifty times, the other is a
 *     library you read. Tasbih is now one tap away right after prayer.
 *   • Find a masjid is gone — maps apps do it better, and it was the one
 *     feature needing a network round-trip in an otherwise offline app.
 *   • Qibla lost its tile and became a compass button in the Today header,
 *     next to the location it depends on.
 *
 * Six is the ceiling, not a target: iOS collapses to five-plus-More unless
 * the bar is explicitly six, and Android's guidance caps at five. If a
 * seventh is ever needed, re-merge Tasbih and Duas rather than bringing
 * "More" back.
 *
 * The bar itself is a floating rounded pill rather than a full-width slab
 * welded to the bottom edge — see `tabBarStyle` below. Readers never see
 * it: the mushaf is pushed onto the root stack ON TOP of the tabs.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import { useAppPalette } from '../hooks/useAppPalette';
import { CARD_SHADOW } from '../theme/tokens';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';
import {
  FLOATS_OVER_CONTENT,
  TAB_BAR_HEIGHT,
  TAB_BAR_SIDE_INSET,
  useTabBarBottom,
} from './tabBarInset';
import { HomeScreen } from '../screens/HomeScreen';
import { QuranScreen } from '../screens/QuranScreen';
import { TasbihScreen } from '../screens/TasbihScreen';
import { DuasScreen } from '../screens/DuasScreen';
import { LogScreen } from '../screens/LogScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HomeHeaderControls } from './HomeHeaderControls';
import { MihrabHeaderTitle } from './MihrabHeaderTitle';
import { isMacCatalyst } from '../responsive/breakpoints';
import {
  TabBookIcon,
  TabDuasIcon,
  TabHomeIcon,
  TabLogIcon,
  TabSettingsIcon,
  TabTasbihIcon,
} from './tabIcons';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const barBottom = useTabBarBottom();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accentSolid,
        // Still stringified: react-navigation types the TINT colours as
        // plain strings, so a PlatformColor cannot be passed here even
        // though it can be passed to the style below.
        tabBarInactiveTintColor: String(palette.muted),
        /**
         * Two bars, not one.
         *
         * PHONES get the floating pill: inset from the edges, rounded,
         * with the page running underneath so a list that would otherwise
         * stop dead at a solid bar says "there is more here".
         *
         * iPad AND MAC get the plain full-width bar back — the pill was
         * tried there and rejected. A desktop window has room to spare, so
         * detaching chrome from the edge buys nothing, and the pill's own
         * geometry went wrong twice on the way (clipped off the bottom of
         * a Mac window, invisible against a dark background).
         *
         * Note the colours are passed through as `ColorValue`, NOT through
         * `String()`. Under the system/glass themes these are PlatformColor
         * objects; stringifying one yields "[object Object]", which RN
         * resolves to nothing — which is why the Mac bar had no surface at
         * all, only floating labels on the window background.
         */
        tabBarStyle: FLOATS_OVER_CONTENT
          ? {
              backgroundColor: palette.card,
              /**
               * IN FLOW, not absolute.
               *
               * Absolute is how you let the page run underneath a bar, and
               * it is what this bar had — but an absolutely positioned tab
               * bar in this navigator paints in the right place and
               * receives touches nowhere. Every tab was dead: the bar
               * looked exactly right in a screenshot and the app could not
               * be navigated. Tried with `alignSelf` + `width` and with
               * `left`/`right`; both the same.
               *
               * A tab bar you cannot tap is not a trade worth making for
               * content peeking under it, so the pill stays in flow and
               * the page stops above it.
               *
               * `marginBottom` is the WHOLE gap under the bar. Setting
               * `height` below makes `getTabBarHeight` return that number
               * verbatim, so the navigator reserves no safe area at all
               * and there is nothing here to correct — see
               * `useTabBarBottom`. It was written as a correction (and so
               * came out negative), which hung the pill off the bottom of
               * the window and cut the labels off entirely.
               */
              marginHorizontal: TAB_BAR_SIDE_INSET,
              marginBottom: barBottom,
              height: TAB_BAR_HEIGHT,
              paddingTop: 6,
              paddingBottom: 4,
              borderRadius: 22,
              // A detached pill is bounded by its own silhouette, not by a
              // hairline where it meets the screen edge.
              borderTopWidth: 0,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.border ?? palette.muted,
              shadowColor: CARD_SHADOW.shadowColor,
              shadowOpacity: CARD_SHADOW.shadowOpacity,
              shadowRadius: CARD_SHADOW.shadowRadius,
              shadowOffset: CARD_SHADOW.shadowOffset,
              elevation: CARD_SHADOW.elevation,
            }
          : {
              backgroundColor: palette.card,
              borderTopColor: palette.border ?? palette.muted,
              // iPad gets NOTHING else — the original bar, exactly.
              // Overriding its height would drop the labels onto the home
              // indicator, since the navigator's own height folds in
              // `insets.bottom` and a fixed number cannot.
              //
              // A Mac window has no such inset, and Catalyst scales the
              // canvas down, so there the default bar is genuinely too
              // short to read and takes the taller one.
              ...(IS_MAC_CATALYST
                ? {
                    height: TAB_BAR_HEIGHT,
                    paddingTop: desktopSize(6),
                    paddingBottom: desktopSize(6),
                  }
                : null),
            },
        // Catalyst scales the whole canvas down for the Mac, so a label
        // designed at 10.5 lands near 8 — see responsive/desktop.ts.
        tabBarLabelStyle: { fontSize: desktopSize(10.5), fontWeight: '600' },
        // The bar is the app's own chrome; on iOS the blur belongs to the
        // system, so leave the default there.
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}>
      <Tab.Screen
        name="TodayTab"
        component={HomeScreen}
        options={{
          title: t('nav.today', 'Today'),
          tabBarIcon: TabHomeIcon,
          headerShown: true,
          // Always "Mihrab" — a proper name, not a translated label.
          headerTitle: () => <MihrabHeaderTitle />,
          /**
           * The wordmark sits at the LEADING EDGE, not centred (v2.8.5).
           *
           * A centred title reserves the middle third of the bar for
           * itself and leaves `headerRight` whatever is left — which on a
           * phone is not enough for a city name, so "San Francisco Auto"
           * ran off the right edge. It is also simply wrong for a
           * wordmark: centring says "this is the name of the screen you
           * pushed", and Today is not pushed from anywhere.
           *
           * Set explicitly rather than left to the platform default: the
           * JS header centres on iOS and leads on Android, and this row is
           * the same row on both.
           */
          headerTitleAlign: 'left',
          // Mac Catalyst renders these as the first row of Home content
          // instead: the transparent navigation bar sits in the window's
          // title-bar drag region, where clicks get swallowed.
          ...(isMacCatalyst ? {} : { headerRight: () => <HomeHeaderControls /> }),
        }}
      />
      <Tab.Screen
        name="QuranTab"
        component={QuranScreen}
        options={{
          title: t('nav.quran'),
          tabBarIcon: TabBookIcon,
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="TasbihTab"
        component={TasbihScreen}
        options={{
          title: t('nav.tasbih'),
          tabBarIcon: TabTasbihIcon,
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="DuasTab"
        component={DuasScreen}
        options={{
          title: t('nav.duas'),
          tabBarIcon: TabDuasIcon,
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="LogTab"
        component={LogScreen}
        options={{
          title: t('log.title', 'Log'),
          tabBarIcon: TabLogIcon,
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: t('nav.settings'),
          tabBarIcon: TabSettingsIcon,
          headerShown: true,
        }}
      />
    </Tab.Navigator>
  );
}
