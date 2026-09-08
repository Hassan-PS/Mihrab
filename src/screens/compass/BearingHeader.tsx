import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * The bearing, as the screen's hero — the same idea as the countdown on
 * Today (docs/design/redesign-plan.md B.8.1). The number at display size,
 * "from north" under it; the label that used to sit above in capitals is
 * gone, because a large degree figure above a compass dial does not need
 * to be told what it is.
 */
type BearingHeaderProps = { qiblaDeg: number };

function BearingHeaderImpl({ qiblaDeg }: BearingHeaderProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const deg = Math.round(qiblaDeg);
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${t('compass.bearing')}: ${t('compass.fromNorth', { deg })}`}>
      <Text
        style={[styles.value, tabularNumeralStyle, { color: palette.text }]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
        // A Latin-digit run, whatever the app language.
        accessibilityLanguage="en-US">
        {`${deg}°`}
      </Text>
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('compass.fromNorthLabel', 'from north')}
      </Text>
    </View>
  );
}

export const BearingHeader = memo(BearingHeaderImpl);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: SPACING.sm },
  value: {
    fontSize: TYPE.display.fontSize,
    lineHeight: TYPE.display.lineHeight,
    fontWeight: '600',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  label: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -2,
  },
});
