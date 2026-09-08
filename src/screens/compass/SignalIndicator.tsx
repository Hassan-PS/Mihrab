import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';
import type { CompassMode, SignalStrength } from './useCompassSensor';
import { SPACING } from '../../theme/tokens';
import { InfoButton } from '../../components/ui/InfoSheet';
import { TYPE } from '../../theme/typography';

/**
 * Signal strength header + progress bar. Memoized so it re-renders only on
 * actual signal change (not on every heading tick).
 */
type SignalIndicatorProps = {
  mode: CompassMode;
  signalStrength: SignalStrength;
};

function SignalIndicatorImpl({ mode, signalStrength }: SignalIndicatorProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const valueText =
    signalStrength === -1
      ? t('compass.signalChecking')
      : signalStrength === -2
      ? t('compass.signalOff')
      : `${signalStrength}%`;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('compass.signalStrength')}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: signalStrength >= 0 ? signalStrength : 0,
        text: valueText,
      }}>
      {/* One line. The bar itself is now the arc around the dial; this is
          its caption, and the paragraph about magnetic fields is a tap
          away (redesign-plan B.8.4). */}
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('compass.signalStrength')}
      </Text>
      <Text
        style={[styles.value, { color: palette.text }]}
        maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
        {valueText}
      </Text>
      {mode === 'live' ? (
        <InfoButton title={t('compass.signalStrength')} body={t('compass.signalHelp')} />
      ) : null}
    </View>
  );
}

export const SignalIndicator = memo(SignalIndicatorImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  label: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  value: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
