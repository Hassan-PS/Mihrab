import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';

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
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
});
