import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { rowDividerStyle } from '../../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { formatDisplayTime } from '../../utils/prayerTimes';
import { HOME_ROW_PADDING_V } from './tokens';

/**
 * Single prayer row inside a day card.
 *
 * Memoized so DayCard re-renders don't cascade unless this row's specific
 * props changed (the `isNext` highlight is the only frequently-changing one).
 */
type PrayerRowProps = {
  prayerKey: string;
  rawTime: string;
  isNext: boolean;
  isSunrise: boolean;
  isLast: boolean;
};

function PrayerRowImpl({
  prayerKey,
  rawTime,
  isNext,
  isSunrise,
  isLast,
}: PrayerRowProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <View
      style={[
        styles.row,
        !isLast && rowDividerStyle(palette),
        isNext && { backgroundColor: palette.accentBg },
      ]}>
      {isNext && (
        <View
          style={[styles.activeBar, { backgroundColor: palette.accent }]}
        />
      )}
      <Text
        style={[
          styles.name,
          {
            color: isSunrise && !isNext ? palette.muted : palette.text,
            fontStyle: isSunrise ? 'italic' : 'normal',
            fontWeight: isNext ? '600' : '500',
          },
        ]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {t(`prayer.${prayerKey}`)}
      </Text>
      <Text
        style={[
          styles.time,
          tabularNumeralStyle,
          {
            color: isNext
              ? palette.accent
              : isSunrise
              ? palette.muted
              : palette.text,
            fontWeight: isNext ? '700' : '500',
          },
        ]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {formatDisplayTime(rawTime)}
      </Text>
    </View>
  );
}

export const PrayerRow = memo(PrayerRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: HOME_ROW_PADDING_V,
    paddingHorizontal: 16,
    paddingStart: 20,
    position: 'relative',
  },
  activeBar: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  name: { fontSize: 17 },
  time: { fontSize: 17 },
});
