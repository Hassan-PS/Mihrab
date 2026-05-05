// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  DUA_CATEGORIES,
  duasByCategory,
  type DuaCategory,
} from '../duas/duas';
import { cardEdgeStyle } from '../theme/chrome';
import { TITLE_BAND_MAX_FONT_SCALE, tabularNumeralStyle } from '../theme/textScale';

/**
 * Dua library screen — task #26.
 *
 * Vertical scroll of category sections. Tap a category chip at the top to
 * jump-scroll to that section. Each dua row shows Arabic + transliteration
 * + translation + source + repeat count.
 */
export function DuasScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  // Arabic readers don't need a Latin pronunciation guide or an English
  // meaning — they read the Arabic directly. Hide both supplementary
  // lines when the app language is Arabic so the row stays clean and
  // reverent.
  const isArabic = i18n.language === 'ar';
  const showTranslit = !isArabic;
  const showTranslation = !isArabic;
  useAndroidSubScreenBack();
  const [selected, setSelected] = useState<DuaCategory>('morning');
  // Per-dua tap-to-count state — task #94. Persists for the lifetime of
  // the screen so the user can navigate away from a dua and come back to
  // resume their count. Reset by tapping the inline reset affordance.
  const [counts, setCounts] = useState<Record<string, number>>({});

  const onIncrement = useCallback((id: string, target: number) => {
    setCounts(prev => {
      const cur = prev[id] ?? 0;
      const next = cur + 1;
      Vibration.vibrate(target > 0 && next === target ? [0, 60, 80, 60, 80, 60] : 20);
      return { ...prev, [id]: next };
    });
  }, []);
  const onResetCount = useCallback((id: string) => {
    setCounts(prev => ({ ...prev, [id]: 0 }));
  }, []);

  // Safe-area / nav-bar offset — task #145 (iOS).
  //
  // The global navigator uses `headerTransparent: true` on iOS so the blur
  // effect can extend behind content. That means the screen content starts
  // at y=0 of the window and the category chips ended up rendering BEHIND
  // the transparent header — invisible to the user. Push the tabs row down
  // by the navigation header height so the chips appear just below the
  // title bar like the user expects. Android has an opaque header so
  // header height == 0 from this hook (the header sits above the content),
  // and we don't need extra padding.
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const topOffset = Platform.OS === 'ios' ? headerHeight : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {/* Tabs are wrapped in a fixed-height row pinned just under the
          system header, so when the active category has only one or two
          duas the chips stay at the top instead of vertically centering
          (#101 follow-up). The dua list ScrollView fills the rest of
          the screen and starts at a predictable y-offset. */}
      <View style={[styles.tabsRow, { paddingTop: topOffset }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        accessibilityRole="tablist">
        {DUA_CATEGORIES.map(c => {
          const isSel = c === selected;
          return (
            <Pressable
              key={c}
              accessibilityRole="tab"
              accessibilityLabel={t(`duas.cat.${c}`)}
              accessibilityState={{ selected: isSel }}
              onPress={() => setSelected(c)}
              style={[
                styles.tab,
                {
                  backgroundColor: isSel ? palette.accent : palette.card,
                  borderColor: isSel ? palette.accent : palette.border,
                },
              ]}>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isSel ? '#fff' : palette.text },
                ]}>
                {t(`duas.cat.${c}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic">
        {duasByCategory(selected).map(dua => (
          <View
            key={dua.id}
            style={[
              styles.card,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <Text
              style={[styles.title, { color: palette.text }]}
              maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
              {/* Per-dua localized title falls back to bundled English. */}
              {t(`duas.${dua.id}.title`, { defaultValue: dua.titleEn })}
            </Text>
            <Text
              style={[styles.arabic, { color: palette.text }]}
              accessibilityLabel={dua.arabic}>
              {dua.arabic}
            </Text>
            {/* Pronunciation guide — Latin transliteration shown under the
                Arabic so non-Arabic speakers can recite. Hidden for Arabic
                readers (they read the Arabic line directly). */}
            {showTranslit ? (
              <Text
                style={[styles.translit, { color: palette.muted }]}
                accessibilityLabel={dua.transliteration}>
                {dua.transliteration}
              </Text>
            ) : null}
            {showTranslation ? (
              <Text style={[styles.translation, { color: palette.text }]}>
                {/* Per-dua localized translation falls back to bundled
                    English. To add another locale, drop entries under
                    `duas.<id>.translation` in that locale's JSON. Hidden
                    entirely when the app language is Arabic. */}
                {t(`duas.${dua.id}.translation`, { defaultValue: dua.translation })}
              </Text>
            ) : null}
            {dua.repeat ? (
              // Tap-to-count counter for duas with a recommended
              // repetition (e.g. ×3, ×100). Mirrors the Tasbih pattern:
              // big number + target, haptic on each tap, reset
              // affordance, persists across the screen session.
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('duas.tapToCount', 'Tap to count')}
                  accessibilityValue={{
                    now: counts[dua.id] ?? 0,
                    min: 0,
                    max: dua.repeat,
                    text: `${counts[dua.id] ?? 0} / ${dua.repeat}`,
                  }}
                  onPress={() => onIncrement(dua.id, dua.repeat ?? 0)}
                  style={[
                    styles.counterBtn,
                    {
                      backgroundColor:
                        (counts[dua.id] ?? 0) >= (dua.repeat ?? 0)
                          ? palette.accentBg
                          : palette.bg,
                      borderColor:
                        (counts[dua.id] ?? 0) >= (dua.repeat ?? 0)
                          ? palette.accent
                          : palette.border,
                    },
                  ]}>
                  <Text
                    style={[styles.counterValue, tabularNumeralStyle, { color: palette.text }]}>
                    {counts[dua.id] ?? 0}
                  </Text>
                  <Text style={[styles.counterTarget, { color: palette.muted }]}>
                    / {dua.repeat}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tasbih.reset', 'Reset')}
                  onPress={() => onResetCount(dua.id)}
                  hitSlop={8}
                  style={styles.counterReset}>
                  <Text style={[styles.counterResetLabel, { color: palette.muted }]}>
                    {t('tasbih.reset', 'Reset')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              {dua.repeat ? (
                <Text style={[styles.meta, { color: palette.accent }]}>
                  {t('duas.repeat', { count: dua.repeat })}
                </Text>
              ) : null}
              <Text style={[styles.meta, styles.source, { color: palette.muted }]}>
                {dua.source}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const _DuasScreenMemo = memo(DuasScreen);
export { _DuasScreenMemo as DuasScreenMemo };

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsRow: {
    // Fixed-height pinned row so single-dua categories don't vertically
    // center the chips. The list area below uses flex:1 underneath.
    flexShrink: 0,
  },
  listScroll: { flex: 1 },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  tabLabel: { fontSize: 14, fontWeight: '600', lineHeight: 18, includeFontPadding: false },
  list: { padding: 16, paddingTop: 0, gap: 12 },
  card: { borderRadius: 14, padding: 16, gap: 8 },
  title: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  arabic: { fontSize: 24, lineHeight: 40, textAlign: 'right', writingDirection: 'rtl' },
  translit: { fontSize: 14, fontStyle: 'italic' },
  translation: { fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  meta: { fontSize: 12 },
  source: { flexShrink: 1, textAlign: 'right' },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  counterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  counterValue: { fontSize: 28, fontWeight: '700' },
  counterTarget: { fontSize: 16, fontWeight: '500' },
  counterReset: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  counterResetLabel: { fontSize: 13, fontWeight: '600' },
});
