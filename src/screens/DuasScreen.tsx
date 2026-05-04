// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { TITLE_BAND_MAX_FONT_SCALE } from '../theme/textScale';

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
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  useAndroidSubScreenBack();
  const [selected, setSelected] = useState<DuaCategory>('morning');

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
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

      <ScrollView contentContainerStyle={styles.list}>
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
            {/* Pronunciation guide — Latin transliteration always shown
                under the Arabic so non-Arabic speakers can recite. */}
            <Text
              style={[styles.translit, { color: palette.muted }]}
              accessibilityLabel={dua.transliteration}>
              {dua.transliteration}
            </Text>
            <Text style={[styles.translation, { color: palette.text }]}>
              {/* Per-dua localized translation falls back to bundled
                  English. To add another locale, drop entries under
                  `duas.<id>.translation` in that locale's JSON. */}
              {t(`duas.${dua.id}.translation`, { defaultValue: dua.translation })}
            </Text>
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
  tabs: { padding: 16, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  tabLabel: { fontSize: 14, fontWeight: '600' },
  list: { padding: 16, paddingTop: 0, gap: 12 },
  card: { borderRadius: 14, padding: 16, gap: 8 },
  title: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  arabic: { fontSize: 24, lineHeight: 40, textAlign: 'right', writingDirection: 'rtl' },
  translit: { fontSize: 14, fontStyle: 'italic' },
  translation: { fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  meta: { fontSize: 12 },
  source: { flexShrink: 1, textAlign: 'right' },
});
