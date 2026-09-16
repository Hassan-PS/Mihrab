/**
 * The frame every settings subpage sits in.
 *
 * One place for the things all seven get wrong differently otherwise:
 * the scroll container, the width cap on a wide window, the room the tab
 * bar needs at the foot, and the Android hardware-back deferral each
 * page owes its modals.
 *
 * The top bar is drawn here — the same pattern as the Duas category bar:
 * opaque `palette.bg`, `TabBackButton`, bold centred title. The native
 * stack header is hidden for these routes so the bar is literally the
 * page colour, not a Material/UIKit chrome that drifts from it.
 */
import type { ReactNode, RefObject } from 'react';
import { useLayoutEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../../hooks/useAppPalette';
import { CenteredColumn } from '../../responsive/CenteredColumn';
import { TabBackButton } from '../../navigation/TabBackButton';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { setSystemBarSurface } from '../../navigation/systemBarSurface';
import { useAndroidSubScreenBack } from '../../navigation/useAndroidSubScreenBack';
import { useKeyboardAwareScroll } from '../../hooks/useKeyboardAwareScroll';
import { SETTINGS_STACK_PAGES } from './subpages';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';

type Props = {
  children: ReactNode;
  /**
   * True while any of this page's modals is open, so Android's back
   * button dismisses the modal instead of popping the page.
   */
  deferBackRef?: RefObject<boolean>;
};

export function SettingsPage({ children, deferBackRef }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  // Pushed over the tabs: no tab bar here. Clear the gesture handle /
  // three-button bar the way Duas clears them when its list runs to the
  // foot — reserve the drawn height, not only the (often shorter) inset.
  const systemBottom = useSystemNavigationReserve();
  // Optional by design: a page with no modals has nothing to defer.
  useAndroidSubScreenBack(deferBackRef);
  // Every settings subpage with a field in it — location search, the
  // coordinate boxes, a saved place's name — rides on this one scroller.
  const kb = useKeyboardAwareScroll<ScrollView>();

  const page = SETTINGS_STACK_PAGES.find(p => p.route === route.name);
  const title = t(page?.titleKey ?? route.name);
  const backLabel = t(page?.backTitleKey ?? 'nav.settings');

  // Own the system navigation band before paint: opaque page colour so
  // three-button nav matches the settings page (and Verdant) instead of
  // the tab-bar foot colour sitting under a full-screen push. Released on
  // leave so the tab chrome takes it back.
  const pageBg =
    typeof palette.bg === 'string'
      ? palette.bg
      : typeof palette.accentSurface === 'string'
        ? palette.accentSurface
        : null;
  useLayoutEffect(() => {
    if (!pageBg) return undefined;
    return setSystemBarSurface({ color: pageBg, isDark: palette.isDark });
  }, [pageBg, palette.isDark]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <CenteredColumn
        style={[
          styles.barPinned,
          {
            paddingTop: insets.top + SPACING.md,
            backgroundColor: palette.bg,
          },
        ]}
      >
        <View style={styles.bar}>
          <View style={styles.barSide}>
            <TabBackButton
              label={backLabel}
              onPress={() => navigation.goBack()}
            />
          </View>
          <Text
            style={[styles.title, { color: palette.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}
          >
            {title}
          </Text>
          <View style={[styles.barSide, styles.barSideEnd]} />
        </View>
      </CenteredColumn>

      <ScrollView
        ref={kb.ref}
        automaticallyAdjustKeyboardInsets
        style={[styles.scroll, { backgroundColor: palette.bg }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: SPACING.xl + systemBottom },
          kb.contentPadding,
        ]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
      >
        <CenteredColumn>
          <View style={styles.stack}>{children}</View>
        </CenteredColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingTop: SPACING.md },
  stack: { gap: 0 },
  // Same geometry as DuasScreen's categoryBarPinned / categoryBar.
  barPinned: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginStart: -SPACING.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: TYPE.title2.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  barSide: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  barSideEnd: { justifyContent: 'flex-end' },
});
