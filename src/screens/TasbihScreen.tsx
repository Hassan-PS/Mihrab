// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { useCallback, useEffect, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  adjacentPresetId,
  findPreset,
  TASBIH_PRESETS,
} from '../tasbih/tasbih';
import {
  countFor,
  hydrateTasbihState,
  incrementTasbih,
  resetTasbih,
  setActiveTasbih,
  useTasbihState,
} from '../tasbih/tasbihStore';
import { TasbihRing } from '../tasbih/TasbihRing';
import { recordDhikrSet } from '../practice/practiceStore';
import { hapticCelebrate, hapticTick } from '../polish/haptics';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../theme/textScale';
import { useTabBarInset } from '../navigation/tabBarInset';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

/**
 * TasbihScreen — task #19, reworked under #80, redesigned under the design
 * review (1b · Tasbih).
 *
 * What the review found and what changed here:
 *
 *  • "A 400pt white void with a number in it" — the count now sits inside a
 *    ring that fills as you tap, so the screen answers back. The ring IS
 *    the tap target and says so.
 *  • "Reset looks exactly like Next" — three identical buttons, one of
 *    which destroys the count. Reset is now a text link; advancing is a
 *    filled button.
 *  • "Post-prayer dhikr is a sequence, shown as one card" — the position
 *    ("Set 2 of 6") and a peek at what comes next turn six disconnected
 *    screens into one flow.
 *  • The Latin label was a spelling, not a meaning. Pronunciation and
 *    translation now share one line under the Arabic.
 *
 * Per-preset counts persist for the lifetime of the screen so navigating
 * between dhikr doesn't lose anyone's place. After the target on an
 * open-ended dhikr (`unboundedAfterTarget`) the cap is hidden and counting
 * continues.
 */
export function TasbihScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  const tasbihWide = useBreakpoint() !== 'compact';
  const capStyle = tasbihWide ? styles.capWide : null;
  const { t, i18n } = useTranslation();
  // Arabic readers don't need a Latin pronunciation guide — they read the
  // Arabic directly. Hide it when the app language is Arabic.
  const showPronunciation = i18n.language !== 'ar';
  const { palette } = useAppPalette();
  const { width, height } = useWindowDimensions();
  useAndroidSubScreenBack();
  // No manual header offset (v2.8.5) — see the note in DuasScreen. Tasbih
  // is a tab now, and the tab navigator's header is opaque: it insets the
  // content itself, so reserving its height here counted it twice.
  const tabBarInset = useTabBarInset();

  // The count now outlives this screen — it is the same store the home-screen
  // widget reads, so unmounting must not zero it and a reboot must not either.
  useEffect(() => {
    void hydrateTasbihState();
  }, []);
  const tasbih = useTasbihState();
  const presetId = tasbih.activeId;

  const preset = findPreset(presetId);
  const index = TASBIH_PRESETS.findIndex(p => p.id === presetId);
  const nextPreset = findPreset(adjacentPresetId(preset.id, 'next'));
  const count = countFor(tasbih, presetId);
  const target = preset.defaultTarget;
  const targetReached = target > 0 && count >= target;
  const showCap =
    target > 0 && !(preset.unboundedAfterTarget && count >= target);

  /**
   * The ring is the whole focal object, so it should take the room it can
   * without pushing the sequence peek or the controls off a small screen.
   * Bounded by the narrower of "half the height" and "the width minus its
   * margins", then capped so a Mac window doesn't render a 600pt donut.
   */
  const ringSize = useMemo(
    () => Math.max(180, Math.min(300, Math.min(width - 96, height * 0.34))),
    [width, height],
  );

  const onIncrement = useCallback(() => {
    const { reachedTarget } = incrementTasbih();
    if (reachedTarget) {
      void hapticCelebrate();
      // A completed set is the one thing about dhikr worth remembering past
      // this screen: Home's Today summary can then state it instead of
      // showing a checkbox for something the app never observed.
      void recordDhikrSet();
    } else {
      void hapticTick();
    }
  }, []);

  const onResetCurrent = useCallback(() => {
    resetTasbih();
  }, []);

  const onPrev = useCallback(() => {
    setActiveTasbih(adjacentPresetId(presetId, 'prev'));
  }, [presetId]);

  const onNext = useCallback(() => {
    setActiveTasbih(adjacentPresetId(presetId, 'next'));
  }, [presetId]);

  /** "Sub-ḥāna llāh · Glory be to Allah" — one line, not three. */
  const subtitle = showPronunciation
    ? `${preset.pronunciation} · ${t(preset.meaningKey)}`
    : t(preset.meaningKey);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: palette.bg,
          paddingTop: SPACING.md,
          // Not a scrolling screen — the controls simply stop above the
          // floating bar rather than scrolling clear of it.
          paddingBottom: tabBarInset,
        },
      ]}>
      <View style={[styles.head, capStyle]}>
        <Text style={[styles.position, { color: palette.muted }]}>
          {t('tasbih.setPosition', {
            index: index + 1,
            total: TASBIH_PRESETS.length,
          })}
        </Text>
        {preset.arabic ? (
          <Text
            style={[styles.arabic, { color: palette.text }]}
            accessibilityLabel={preset.arabic}>
            {preset.arabic}
          </Text>
        ) : null}
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          {subtitle}
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
        style={({ pressed }: { pressed: boolean }) => [
          styles.tapTarget,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}>
        <TasbihRing
          size={ringSize}
          progress={target > 0 ? count / target : 0}
          color={targetReached ? palette.accentSolid : palette.accentSolid}
          trackColor={String(palette.controlBg)}>
          <Text
            style={[
              styles.count,
              tabularNumeralStyle,
              { color: palette.text, fontSize: ringSize * 0.34 },
            ]}
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
              {t('tasbih.ofTarget', { target })}
            </Text>
          ) : null}
        </TasbihRing>
        <Text style={[styles.hint, { color: palette.muted }]}>
          {t('tasbih.tapAnywhere')}
        </Text>
      </Pressable>

      {/* The peek: 33 / 33 / 34 is one ritual in three parts, and knowing
          what follows is what makes it feel like one. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('tasbih.upNext')} — ${nextPreset.arabic}`}
        onPress={onNext}
        // A line, not a card: the screen wants one focal object, and the
        // preview of what comes next was a fourth container under it
        // (redesign-plan B.5.5).
        style={[styles.peek, capStyle]}>
        <Text style={[styles.peekLabel, { color: palette.muted }]}>
          {t('tasbih.upNext')}
        </Text>
        <View style={styles.peekBody}>
          <Text
            style={[styles.peekMeta, { color: palette.muted }]}
            numberOfLines={1}>
            {/* The Latin label is a spelling aid. Next to the Arabic it is
                already printed in, for a reader whose UI is Arabic, it is
                just a second alphabet saying the same word — so an Arabic
                UI gets the count alone. */}
            {showPronunciation
              ? `${t(nextPreset.labelKey)} · ${nextPreset.defaultTarget}`
              : String(nextPreset.defaultTarget)}
          </Text>
          <Text
            style={[styles.peekArabic, { color: palette.text }]}
            numberOfLines={1}>
            {nextPreset.arabic}
          </Text>
        </View>
      </Pressable>

      <View style={[styles.navRow, capStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasbih.prev', 'Previous')}
          onPress={onPrev}
          style={({ pressed }) => [
            styles.navBtn,
            pressed && { backgroundColor: palette.controlBg },
          ]}>
          <Text style={[styles.navLabel, { color: palette.muted }]}>
            ← {t('tasbih.prev', 'Previous')}
          </Text>
        </Pressable>
        {/* Reset destroys the count, so it must not look like the two
            buttons that merely move: a link, not a slab. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasbih.resetSet')}
          onPress={onResetCurrent}
          hitSlop={10}
          style={styles.resetLink}>
          <Text style={[styles.resetLabel, { color: palette.muted }]}>
            {t('tasbih.resetSet')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasbih.skip')}
          onPress={onNext}
          // Tertiary, like its siblings: the primary action on this screen
          // is the tap, not a button (redesign-plan B.5.4).
          style={({ pressed }) => [
            styles.navBtn,
            pressed && { backgroundColor: palette.controlBg },
          ]}>
          <Text style={[styles.navLabel, { color: palette.accentSolid }]}>
            {t('tasbih.skip')} →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cap the counter column on iPad/Mac so the big number stays centered
  // instead of stretching across a wide window.
  capWide: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  root: { flex: 1, padding: SPACING.lg, gap: SPACING.lg },
  head: { alignItems: 'center', gap: SPACING.sm },
  position: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
  },
  arabic: {
    fontSize: 30, // tokens-ok-line: display or Arabic scale, sized by hand
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  subtitle: { fontSize: TYPE.callout.fontSize, fontWeight: '500', textAlign: 'center' },
  tapTarget: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  count: { fontWeight: '700' },
  targetText: { fontSize: TYPE.body.fontSize, fontWeight: '500', marginTop: 2 },
  hint: { fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 0.3 },
  peek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  peekLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
  },
  peekBody: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  peekMeta: { fontSize: TYPE.label.fontSize, fontWeight: '600' },
  peekArabic: { fontSize: TYPE.title3.fontSize, fontWeight: '600', writingDirection: 'rtl' },
  navRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
    // Off the tab bar. The row is the last thing in a `flex: 1` column, so
    // it sits against the bottom of the screen — and the bottom of the
    // screen is where the navigation bar is. Previous and Skip are big
    // targets a thumb reaches for without looking, which is exactly the
    // thumb that was landing on the tab bar instead.
    marginBottom: SPACING.md,
  },
  navBtn: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  resetLink: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.md },
  resetLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
});
