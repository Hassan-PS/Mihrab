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
import { Animated, Platform, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAppPalette } from '../hooks/useAppPalette';
import { translucentSurface } from '../theme/chrome';
import { CARD_SHADOW } from '../theme/tokens';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';
import {
  FLOATS_OVER_CONTENT,
  TAB_BAR_HEIGHT,
  TAB_BAR_SIDE_INSET,
  useTabBarBottom,
} from './tabBarInset';
import { useTabBarHidden } from './tabBarVisibility';
import { HomeScreen } from '../screens/HomeScreen';
import { QuranScreen } from '../screens/QuranScreen';
import { TasbihScreen } from '../screens/TasbihScreen';
import { DuasScreen } from '../screens/DuasScreen';
import { LogScreen } from '../screens/LogScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HomeHeaderControls } from './HomeHeaderControls';
import { SyncHeaderButton } from '../screens/sync/SyncHeaderButton';
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

  /**
   * Out of the way while reading, back on the way up.
   *
   * Driven straight into `tabBarStyle` because the bar IS an
   * `Animated.View` — the navigator applies that style to one, which is
   * what makes a native-driver transform legal here and saves wrapping the
   * bar in a custom `tabBar`. The wrapper route was tried in the design and
   * rejected: this pill has a history of painting correctly while
   * receiving no touches, and the least it can be disturbed the better.
   *
   * Only where the bar FLOATS. On iPad and Mac it is in flow and the page
   * ends above it, so sliding it away would reflow the content under the
   * reader's thumb — a different behaviour, and a worse one.
   */
  const hidden = useTabBarHidden();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: hidden ? 1 : 0,
      // Long enough to read as movement, short enough that a flick up
      // does not feel like waiting for the bar.
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [hidden, slide]);
  const hideBy = TAB_BAR_HEIGHT + barBottom + 16;

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
              backgroundColor: translucentSurface(palette.card),
              position: 'absolute',
              /**
               * ABSOLUTE AGAIN — and this time the tabs still work.
               *
               * It was in flow for a while because an earlier attempt at
               * `position: 'absolute'` produced a bar that painted in the
               * right place and received touches nowhere: every tab dead,
               * the screenshot perfect. That is no longer true. Re-tested
               * on the current navigator by tapping all six in turn and
               * reading the header each time — Today, Quran, Tasbih, Duas,
               * Log, Settings all switch. Whatever it was has been fixed
               * upstream, and being in flow was costing the thing the pill
               * exists for: a page that stops dead at a solid bar looks
               * finished, and the reader cannot tell there is more below.
               *
               * The price is that the navigator reserves nothing, so every
               * scrolling screen has to add the bar's height itself — that
               * is `useTabBarInset`, which the six tab screens already
               * call, and which is why this was one line to change back.
               *
               * `marginBottom` is the WHOLE gap under the bar. Setting
               * `height` below makes `getTabBarHeight` return that number
               * verbatim, so there is nothing here to correct — see
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
              // Cast because react-navigation types this as a plain
              // ViewStyle, while the view it lands on is animated. The
              // value is legal where it is used; only the type is narrow.
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, hideBy],
                  }),
                },
              ] as unknown as ViewStyle['transform'],
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
      }}
    >
      <Tab.Screen
        name="TodayTab"
        component={HomeScreen}
        options={{
          title: t('nav.today', 'Today'),
          tabBarIcon: TabHomeIcon,
          // Everywhere but Catalyst, where Home draws its own top bar —
          // see the Catalyst branch at the end of these options.
          headerShown: !isMacCatalyst,
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
          /**
           * Mac Catalyst builds this row itself, in content (v2.9.2).
           *
           * The navigation bar cannot hold the location chip there: it is
           * transparent and sits inside the window's title-bar DRAG
           * REGION, so clicks on it get swallowed as window drags — which
           * is what sent the chip into the body in the first place. But
           * leaving the bar up with only the wordmark in it spent a whole
           * row on a word, and pushed the chip onto a SECOND row below it:
           * two bars where the Mac has one.
           *
           * So the bar goes, and Home renders wordmark and chip as one
           * row of content — same line, opposite ends, entirely below the
           * drag region. See HomeScreen's `macHeaderRow`.
           */
          ...(isMacCatalyst
            ? {}
            : { headerRight: () => <HomeHeaderControls /> }),
        }}
      />
      <Tab.Screen
        name="QuranTab"
        component={QuranScreen}
        options={{
          title: t('nav.quran'),
          tabBarIcon: TabBookIcon,
          headerShown: true,
          // Only these two tabs carry it, and only once sync is set up: this
          // is the screen whose data the user just changed. See SyncHeaderButton.
          headerRight: () => <SyncHeaderButton />,
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
          headerRight: () => <SyncHeaderButton />,
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
