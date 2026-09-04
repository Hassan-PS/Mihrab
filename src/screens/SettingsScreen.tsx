/**
 * Settings — the index.
 *
 * It used to be twelve cards in one scroll, which is a page you read
 * rather than a page you use: finding one toggle meant remembering
 * roughly how far down it lived and swiping until it appeared. Seven
 * rows fit on a screen, and a screen you can take in at a glance is one
 * you can navigate from memory the second time.
 *
 * Each row is a section, each section is a pushed route, and the list of
 * them lives in `settings/subpages.tsx` so the index and the navigator
 * cannot disagree about which sections exist. The pages themselves own
 * their modals now — twelve cards' worth of picker state used to sit on
 * this one screen, with nothing to say which card would open which.
 *
 * The header on each subpage — the title and the back control beside it
 * — is the native stack's own. See `RootNavigator`.
 */
import { useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useNavigation,
  useScrollToTop,
  type NavigationProp,
} from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../navigation/types';
import { useAppPalette } from '../hooks/useAppPalette';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useLayoutRtl } from '../i18n/useLayoutRtl';
import { cardEdgeStyle, rowDividerStyle } from '../theme/chrome';
import { useTabBarInset } from '../navigation/tabBarInset';
import { useTabBarScroll } from '../navigation/tabBarVisibility';
import { ChevronIcon } from './settings/SettingsSectionIcons';
import { SETTINGS_SUBPAGES } from './settings/subpages';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const tabBarInset = useTabBarInset();
  // The bar gets out of the way while reading — see tabBarVisibility.ts.
  const tabBarScroll = useTabBarScroll();
  const isRtl = useLayoutRtl();

  /**
   * Tapping the Settings tab while already on it returns this list to
   * the top — the standard idiom, and the fastest way back to the index
   * after a long page.
   */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const go = useCallback(
    (route: (typeof SETTINGS_SUBPAGES)[number]['route']) => () =>
      navigation.navigate(route as never),
    [navigation],
  );

  return (
    <ScrollView
      ref={scrollRef}
      {...tabBarScroll}
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: 24 + tabBarInset },
      ]}
      contentInsetAdjustmentBehavior="automatic">
      <CenteredColumn>
        <View
          style={[
            styles.group,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          {SETTINGS_SUBPAGES.map((page, i) => (
            <Pressable
              key={page.route}
              accessibilityRole="button"
              accessibilityLabel={t(page.titleKey)}
              accessibilityHint={t(page.blurbKey)}
              onPress={go(page.route)}
              style={({ pressed }) => [
                styles.row,
                i < SETTINGS_SUBPAGES.length - 1 && rowDividerStyle(palette),
                pressed && { backgroundColor: palette.accentBg },
              ]}>
              <View
                style={[
                  styles.iconWell,
                  { backgroundColor: palette.accentBg },
                ]}>
                <page.Icon color={palette.accentSolid} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: palette.text }]}>
                  {t(page.titleKey)}
                </Text>
                {/* One line, and one line only. A blurb that wraps to
                    three turns an index back into a page to read. */}
                <Text
                  numberOfLines={1}
                  style={[styles.blurb, { color: palette.muted }]}>
                  {t(page.blurbKey)}
                </Text>
              </View>
              <ChevronIcon color={palette.muted} rtl={isRtl} />
            </Pressable>
          ))}
        </View>
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  blurb: { fontSize: 12 },
});
