// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  adjacentPresetId,
  findPreset,
  increment,
  TASBIH_PRESETS,
  type TasbihPresetId,
} from '../tasbih/tasbih';
import { cardEdgeStyle } from '../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../theme/textScale';

/**
 * TasbihScreen — task #19, reworked under #80.
 *
 * One-tap increment surface with Arabic + pronunciation guide + Latin
 * transliteration label. Per-preset counts persist for the lifetime of
 * the screen so the user can navigate prev/next between dhikr without
 * losing their place.
 *
 * After the target is reached on an open-ended dhikr (unboundedAfterTarget),
 * the cap is hidden and counting continues indefinitely.
 */
export function TasbihScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  useAndroidSubScreenBack();
  // Plain <View> root: on iOS the header is transparent (for the blur
  // effect), so the screen content starts at y=0 and we manually reserve
  // the header height as paddingTop. On Android the header is opaque
  // and the system already insets content below it, so no manual
  // padding is needed.
  const headerHeight = useHeaderHeight();
  const topInset = Platform.OS === 'ios' ? headerHeight : 0;

  const [presetId, setPresetId] = useState<TasbihPresetId>(
    TASBIH_PRESETS[0].id,
  );
  // Per-preset count map — survives prev/next navigation within this
  // screen but resets when the screen unmounts. Initial counts default
  // to 0 for every preset.
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(TASBIH_PRESETS.map(p => [p.id, 0])),
  );

  const preset = findPreset(presetId);
  const count = counts[presetId] ?? 0;
  const target = preset.defaultTarget;
  const targetReached = target > 0 && count >= target;
  const showCap =
    target > 0 && !(preset.unboundedAfterTarget && count >= target);

  const onIncrement = useCallback(() => {
    setCounts(prev => {
      const cur = prev[presetId] ?? 0;
      const { count: next, reachedTarget } = increment(cur, target);
      Vibration.vibrate(reachedTarget ? [0, 60, 80, 60, 80, 60] : 20);
      return { ...prev, [presetId]: next };
    });
  }, [presetId, target]);

  const onResetCurrent = useCallback(() => {
    setCounts(prev => ({ ...prev, [presetId]: 0 }));
  }, [presetId]);

  const onPrev = useCallback(() => {
    setPresetId(cur => adjacentPresetId(cur, 'prev'));
  }, []);

  const onNext = useCallback(() => {
    setPresetId(cur => adjacentPresetId(cur, 'next'));
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: topInset + 12 }]}>
      <View
        style={[
          styles.dhikrCard,
          {
            backgroundColor: palette.card,
            ...cardEdgeStyle(palette),
          },
        ]}>
        {preset.arabic ? (
          <Text
            style={[styles.arabic, { color: palette.text }]}
            accessibilityLabel={preset.arabic}>
            {preset.arabic}
          </Text>
        ) : null}
        <Text
          style={[styles.pronunciation, { color: palette.text }]}
          maxFontSizeMultiplier={1.6}>
          {preset.pronunciation}
        </Text>
        <Text style={[styles.translit, { color: palette.muted }]}>
          {t(preset.labelKey)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tasbih.increment')}
        accessibilityValue={{
          now: count,
          min: 0,
          max: showCap ? target : 9999,
          text: showCap ? `${count} / ${target}` : `${count}`,
        }}
        onPress={onIncrement}
        android_ripple={{ color: palette.accentBg, foreground: false }}
        style={({ pressed }: { pressed: boolean }) => [
          styles.tapTarget,
          {
            backgroundColor: targetReached ? palette.accentBg : palette.card,
            borderColor: targetReached ? palette.accent : palette.border,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}>
        <Text
          style={[styles.count, tabularNumeralStyle, { color: palette.text }]}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {count}
        </Text>
        {showCap ? (
          <Text
            style={[
              styles.targetText,
              tabularNumeralStyle,
              { color: palette.muted },
            ]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            / {target}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasbih.prev', 'Previous')}
          onPress={onPrev}
          style={[
            styles.navBtn,
            { borderColor: palette.border, backgroundColor: palette.card },
          ]}>
          <Text style={[styles.navLabel, { color: palette.text }]}>
            ← {t('tasbih.prev', 'Previous')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasbih.reset')}
          onPress={onResetCurrent}
          style={[
            styles.navBtn,
            styles.navBtnSmall,
            { borderColor: palette.border, backgroundColor: palette.card },
          ]}>
          <Text style={[styles.navLabel, { color: palette.muted }]}>
            {t('tasbih.reset')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasbih.next', 'Next')}
          onPress={onNext}
          style={[
            styles.navBtn,
            { borderColor: palette.border, backgroundColor: palette.card },
          ]}>
          <Text style={[styles.navLabel, { color: palette.text }]}>
            {t('tasbih.next', 'Next')} →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 16 },
  dhikrCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  arabic: {
    fontSize: 30,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pronunciation: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  translit: { fontSize: 13, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  tapTarget: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  count: { fontSize: 96, fontWeight: '700' },
  targetText: { fontSize: 24, fontWeight: '500' },
  navRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  navBtn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnSmall: { flex: 0.7 },
  navLabel: { fontSize: 15, fontWeight: '600' },
});
