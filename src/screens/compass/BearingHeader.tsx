import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/** Top-of-screen "Qibla bearing: N° from north" label. */
type BearingHeaderProps = { qiblaDeg: number };

function BearingHeaderImpl({ qiblaDeg }: BearingHeaderProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <>
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('compass.bearing')}
      </Text>
      <Text
        style={[styles.value, tabularNumeralStyle, { color: palette.text }]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {t('compass.fromNorth', { deg: Math.round(qiblaDeg) })}
      </Text>
    </>
  );
}

export const BearingHeader = memo(BearingHeaderImpl);

const styles = StyleSheet.create({
  label: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  value: {
    fontSize: TYPE.title2.fontSize,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
});
