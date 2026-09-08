import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';
import type { CompassMode, SignalStrength } from './useCompassSensor';
import { RADIUS, SPACING } from '../../theme/tokens';
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
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('compass.signalStrength')}
        </Text>
        <Text
          style={[styles.value, { color: palette.text }]}
          maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
          {valueText}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('compass.signalStrength')}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: signalStrength >= 0 ? signalStrength : 0,
          text: valueText,
        }}
        style={[styles.track, { backgroundColor: palette.border }]}>
        {mode === 'live' && signalStrength >= 0 ? (
          <View
            style={[
              styles.fill,
              {
                width: `${signalStrength}%`,
                backgroundColor: palette.accent,
              },
            ]}
          />
        ) : null}
      </View>
      {mode === 'live' ? (
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('compass.signalHelp')}
        </Text>
      ) : null}
    </View>
  );
}

export const SignalIndicator = memo(SignalIndicatorImpl);

const styles = StyleSheet.create({
  block: { marginBottom: SPACING.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '600',
  },
  value: {
    fontSize: TYPE.callout.fontSize,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: RADIUS.xs },
  help: { fontSize: TYPE.label.fontSize, lineHeight: 17, marginTop: SPACING.sm },
});
