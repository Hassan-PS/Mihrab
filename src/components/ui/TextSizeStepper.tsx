// hover-ok: a compact control inside a reading header — the pressed
// background is the affordance, and a hover state on a three-part pill
// reads as three separate buttons.
import { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useReadingText } from '../../hooks/useReadingText';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * `−  A  +` — the size of the text you are reading.
 *
 * ── WHY THE A IS THERE ────────────────────────────────────────────────
 *
 * Two bare arithmetic signs in a header do not say what they change.
 * Zoom? The Arabic? The whole page? The A between them is the label: it
 * is the letter whose size is in question, and it is the convention every
 * reading app already taught people. It earns a second job from being
 * there anyway — a tap puts the size back — and says which state it is in
 * by its colour: muted at the size the app ships with, accent once the
 * reader has moved it, so "you have changed this, and this undoes it" is
 * legible without a word of explanation.
 *
 * ── WHY IT IS DRAWN SMALL AND TOUCHED LARGE ───────────────────────────
 *
 * A 44-point square either side would be a hundred points of control in a
 * header whose job is to name a sūrah. The pill is 32 high and the glyphs
 * are 20; `hitSlop` takes each button back out to 44, so what the thumb
 * gets and what the eye gets are decided separately — the eye's version
 * belongs to the header, the thumb's to the platform's guidance.
 *
 * ── RTL ───────────────────────────────────────────────────────────────
 *
 * Plain `row`. The tree is already mirrored for Arabic and Urdu, so
 * minus-on-the-start and plus-on-the-end follow the reading direction
 * without anything here reversing. Neither glyph is directional.
 */
function TextSizeStepperImpl({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { grow, shrink, reset, canGrow, canShrink, isDefault } =
    useReadingText();

  const button = (
    dir: 'shrink' | 'grow',
    enabled: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        dir === 'grow'
          ? t('reading.textLarger', 'Larger text')
          : t('reading.textSmaller', 'Smaller text')
      }
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        pressed && { backgroundColor: palette.card },
        !enabled && styles.disabled,
      ]}>
      <Text
        style={[styles.glyph, { color: palette.accentSolid }]}
        // The pill is a fixed height, so its glyphs do not follow the
        // system font scale off the end of it — which is exactly the
        // setting somebody using this control is most likely to have on.
        maxFontSizeMultiplier={1}
        allowFontScaling={false}>
        {dir === 'grow' ? '+' : '−'}
      </Text>
    </Pressable>
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={t('reading.textSize', 'Text size')}
      style={[styles.pill, { backgroundColor: palette.controlBg }, style]}>
      {button('shrink', canShrink, shrink)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('reading.textSizeReset', 'Reset text size')}
        accessibilityState={{ disabled: isDefault }}
        disabled={isDefault}
        onPress={reset}
        hitSlop={8}
        style={styles.label}>
        <Text
          style={[
            styles.labelGlyph,
            { color: isDefault ? palette.muted : palette.accentSolid },
          ]}
          maxFontSizeMultiplier={1}
          allowFontScaling={false}>
          A
        </Text>
      </Pressable>
      {button('grow', canGrow, grow)}
    </View>
  );
}

export const TextSizeStepper = memo(TextSizeStepperImpl);

const PILL_HEIGHT = 32;

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    height: PILL_HEIGHT,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xs,
  },
  button: {
    width: 34,
    height: PILL_HEIGHT - 4,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
  glyph: {
    fontSize: 20, // tokens-ok-line: a glyph sized to the pill, not to the type scale
    lineHeight: 22, // tokens-ok-line: a glyph sized to the pill, not to the type scale
    fontWeight: '600',
    // Android reserves vertical room for ascenders the sign does not use,
    // which lands the − above the middle of the pill.
    includeFontPadding: false,
    textAlign: 'center',
  },
  label: {
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  labelGlyph: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '700',
    includeFontPadding: false,
  },
});
