/**
 * The sunnah control that sits at the end of each prayer's row.
 *
 * ONE TILE, CYCLING, SHOWING ITS STATE. A button that goes 0 → 1 → 2 → 0 with
 * nothing on it is a guessing game — you cannot tell what the next tap will
 * do, or what the last one did. So the pips carry the count and the caption
 * reads it back ("1 of 2"), and the tile is ringed once the prayer's sunnah is
 * complete. That also makes the control undoable without a second button,
 * which matters in a row that already holds four.
 *
 * ASR IS DRAWN, NOT HIDDEN. Asr carries no sunnah mu'akkadah, and an empty
 * gap where the other rows have a control reads as a bug. A dimmed tile
 * saying "None" answers the question instead of raising it, and screen
 * readers are told the same thing rather than meeting an unlabelled blank.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import type { JournalPrayer } from '../../journal/journal';
import { SUNNAH_UNITS } from '../../journal/sunnah';
import { sunnahGold } from '../../practice/sunnahTheme';

type Props = {
  prayer: JournalPrayer;
  count: number;
  palette: AppPalette;
  onPress: () => void;
};

function SunnahTileImpl({ prayer, count, palette, onPress }: Props) {
  const { t } = useTranslation();
  const max = SUNNAH_UNITS[prayer];
  const gold = sunnahGold(palette.isDark);
  const none = max === 0;
  const complete = !none && count >= max;

  const label = none
    ? t('sunnah.none', 'None')
    : max === 1
      ? t('sunnah.short', 'Sunnah')
      : t('sunnah.ofTotal', '{{done}} of {{total}}', {
          done: count,
          total: max,
        });

  return (
    <Pressable
      accessibilityRole="button"
      disabled={none}
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={
        none
          ? t('sunnah.a11yNone', '{{prayer}}: no sunnah prayer', {
              prayer: t(`prayer.${prayer}`),
            })
          : t(
              'sunnah.a11yCount',
              '{{prayer}} sunnah: {{done}} of {{total}} logged',
              {
                prayer: t(`prayer.${prayer}`),
                done: count,
                total: max,
              },
            )
      }
      accessibilityState={{ disabled: none }}
      style={[
        styles.tile,
        { backgroundColor: palette.controlBg },
        none && styles.tileNone,
        complete && { borderColor: gold },
      ]}
    >
      <View style={styles.pips}>
        {none ? (
          <View style={[styles.pip, { borderColor: palette.muted as string }]} />
        ) : (
          Array.from({ length: max }, (_, i) => (
            <View
              key={i}
              style={[
                styles.pip,
                { borderColor: gold },
                i < count && { backgroundColor: gold },
              ]}
            />
          ))
        )}
      </View>
      <Text
        style={[styles.label, { color: palette.muted }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const SunnahTile = memo(SunnahTileImpl);

const styles = StyleSheet.create({
  // Fixed width, not flex: the four status chips beside it are each `flex: 1`
  // inside a 14pt-padded panel, and letting this one flex too crushes them on
  // the narrowest phones.
  tile: {
    width: 62,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    gap: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tileNone: { opacity: 0.38 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
