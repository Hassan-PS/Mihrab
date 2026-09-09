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
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAppPalette } from '../hooks/useAppPalette';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { translucentSurface } from '../theme/chrome';
import { resolveSpring } from '../theme/motion';
import { CARD_SHADOW, RADIUS, SPACING } from '../theme/tokens';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';
import {
  FLOATS_OVER_CONTENT,
  TAB_BAR_HEIGHT,
  TAB_BAR_SIDE_INSET,
  useTabBarBottom,
} from './tabBarInset';
import { TabBarScrim } from './TabBarScrim';
import { StatusBarBand } from './StatusBarBand';
import { showTabBar, useTabBarHidden } from './tabBarVisibility';
import { HomeScreen } from '../screens/HomeScreen';
import { QuranScreen } from '../screens/QuranScreen';
import { TasbihScreen } from '../screens/TasbihScreen';
import { DuasScreen } from '../screens/DuasScreen';
import { LogScreen } from '../screens/LogScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HomeHeaderControls } from './HomeHeaderControls';
import { HeaderPlaybackBar } from '../quran/audio/HeaderPlaybackBar';
import { MihrabHeaderTitle } from './MihrabHeaderTitle';
import { isMacCatalyst, HOME_DASHBOARD_MIN_WIDTH } from '../responsive/breakpoints';
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

/** The wrapper the playback bar and the screen share. */
const SCREEN = { flex: 1 } as const;

export function MainTabs() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const isDashboardWidth = useWindowDimensions().width >= HOME_DASHBOARD_MIN_WIDTH;
  // Today's header survives only on the wide dashboard; see its options.
  const todayHeader = !isMacCatalyst && isDashboardWidth;
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
  const reduceMotion = useReduceMotion();
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // A spring, not a timing: the bar is a thing that MOVES, and the
    // `spatial` track lets it settle like one. Under Reduce Motion the same
    // call lands in a frame — see `resolveSpring`.
    Animated.spring(slide, {
      toValue: hidden ? 1 : 0,
      ...resolveSpring('spatial', reduceMotion),
    }).start();
  }, [hidden, reduceMotion, slide]);
  const hideBy = TAB_BAR_HEIGHT + barBottom + 16;

  return (
    <Tab.Navigator
      /**
       * ARRIVING SOMEWHERE ALWAYS SHOWS THE BAR.
       *
       * A tab screen is not unmounted when you leave it, so the unmount
       * cleanup in `useTabBarScroll` does not fire on a tab change. Without
       * this, scrolling Today down and then opening Tasbih — which has no
       * list to scroll and therefore no way to ask for the bar back — would
       * land you on a screen with the navigation hidden and nothing on it
       * able to restore it.
       */
      screenListeners={{ focus: showTabBar }}
      /**
       * The recitation follows the reader between tabs.
       *
       * Wrapping every tab here rather than adding a bar to six screens:
       * a screen that forgot to include it would be a screen where the
       * only way to pause is the notification shade. `HeaderPlaybackBar`
       * decides for itself whether it has anything to say.
       */
      screenLayout={({ route, children }) => (
        <View style={SCREEN}>
          {/* The bar is the page's own colour, and — since no tab draws a
              title bar any more — it is the first thing under the status
              bar and clears it itself (`headerless`). The one tab with a
              header left is Today on the wide dashboard, where the bar
              hangs under that header instead. */}
          <HeaderPlaybackBar
            surface={palette.bg}
            headerless={!(route.name === 'TodayTab' && todayHeader)}
          />
          {children}
          {/* Over the page, at the other end: the strip behind the status
              bar. Every tab pads its content clear of it, so a band of the
              page's own colour is invisible until something scrolls up
              into it — and then it is the thing that keeps the page's text
              off the clock. Today is not here: its sky runs under the
              status bar on purpose and it covers the strip itself, with
              the sky's own colour (`HomeStatusBand`). */}
          {route.name !== 'TodayTab' ? <StatusBarBand color={palette.bg} /> : null}
          {/* Under the bar, over the page: the fade that keeps the two from
              colliding. Same `slide` as the bar, so it leaves with it. */}
          <TabBarScrim bg={palette.bg} slide={slide} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        /**
         * Quran, Tasbih, Duas, Log and Settings centre their titles on
         * both platforms.
         *
         * The same inherited default the pushed subpages had, one level
         * up: the JS header centres on iOS and leads on Android, so five
         * of the six tabs read as two different designs depending on the
         * phone. Now chosen rather than inherited, and chosen to match
         * what the subpages beneath them do.
         *
         * Today overrides this back to `left` and says why — that row is
         * a wordmark next to a location chip, not the name of a screen
         * you pushed, and centring it cost the chip the room it needs.
         */
        headerTitleAlign: 'center',
        /**
         * The header is the page, not a bar on it. It took the navigation
         * theme's card colour, which on the warm paper theme is a white
         * band over an off-white page — a title bar, visibly. In the page's
         * own colour with no shadow, the title reads as the top of the page
         * (the way Pillars does it), and the bottom bar, in the same
         * colour, as its foot.
         */
        headerStyle: { backgroundColor: palette.bg },
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.accentSolid,
        /**
         * A HEX, NOT `String(palette.muted)`.
         *
         * react-navigation types the TINT colours as plain strings, so a
         * PlatformColor cannot be passed here — but stringifying one gives
         * "[object Object]", and this tint is handed to each tab's ICON,
         * which is an SVG. `react-native-svg` draws nothing for a colour it
         * cannot parse, so under Liquid Glass (where `muted` is
         * `PlatformColor('secondaryLabel')`) the bar came out as five
         * labels with no glyphs above them — only the active tab, on
         * `accentSolid`, had a colour it could use. `mutedSolid` is the
         * same colour as a hex, for exactly this.
         */
        tabBarInactiveTintColor: palette.mutedSolid,
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
              paddingTop: SPACING.sm,
              paddingBottom: SPACING.xs,
              borderRadius: RADIUS.xl,
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
              // In flow, the bar is either there or not: a page inside a
              // tab that asks for the whole screen (a dua category) puts
              // it away, and the page takes its height.
              display: hidden ? 'none' : 'flex',
              // The page's own colour, not the card's: the bar is part of
              // the page it sits under, and a hairline is the only edge.
              backgroundColor: palette.bg,
              borderTopColor: palette.border ?? palette.muted,
              borderTopWidth: StyleSheet.hairlineWidth,
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
          /**
           * NO HEADER ON THE PHONE (and on any window narrower than the
           * dashboard). Today's hero runs to the top of the screen, under
           * the status bar, and carries the location chip and the Qibla
           * chip in its top row — the wordmark and chip that lived here
           * are in the hero now, on the sky. The wide dashboard keeps its
           * card and this header; Catalyst draws its own bar as content.
           */
          headerShown: todayHeader,
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
          /**
           * NO TITLE BAR ON ANY TAB. The page begins at the status bar
           * (`useTabPageTop`), and what the bar used to hold moved into
           * the page: Quran's Tilāwah and sync controls are its first
           * row, the Log's sync is in its options menu, the arrow back to
           * Today is gone — the tab bar is the way between tabs, and the
           * hardware button still goes home (`decideAndroidBack`).
           */
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="TasbihTab"
        component={TasbihScreen}
        options={{
          title: t('nav.tasbih'),
          tabBarIcon: TabTasbihIcon,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="DuasTab"
        component={DuasScreen}
        options={{
          title: t('nav.duas'),
          tabBarIcon: TabDuasIcon,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="LogTab"
        component={LogScreen}
        options={{
          title: t('log.title', 'Log'),
          tabBarIcon: TabLogIcon,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: t('nav.settings'),
          tabBarIcon: TabSettingsIcon,
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}
