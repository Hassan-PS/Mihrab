/**
 * The sunnah control, in the prayer's header rather than beside its statuses.
 *
 * IT USED TO SPEAK A DIFFERENT LANGUAGE FROM ITS OWN ROW. The four status
 * chips are a radio group: flat pills, one of them filled. Sitting at the end
 * of that row, behind a hairline divider, was a bordered tile with pips and
 * small-caps text — a stepper. Two control grammars, side by side, five times
 * down the page, and the row read as "controls" rather than as a prayer. It
 * also stole 62pt, which is why the statuses had to be abbreviated to "Miss"
 * and "Qad" — words that exist in no language the app ships in.
 *
 * Moving it up to sit with the time solves both at once: the status row
 * becomes one radio group and nothing else, and the chips get the width to
 * say what they mean. The sunnah is a different KIND of fact from the fard —
 * a count, not a choice — so it belongs beside the other fact in that header
 * (the time), not among the choices.
 *
 * ASR SIMPLY HAS NO CHIP. The old tile stayed and said "None", which is a
 * control whose whole content is an explanation of why it does nothing. Every
 * other row carrying a gold chip makes Asr's silence self-explanatory, and a
 * screen reader is told the same by the row's own label rather than by an
 * unlabelled dead button.
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
  /** The prayer's time has not come. Dimmed and inert, like the chips. */
  notYet?: boolean;
  onPress: () => void;
};

function SunnahChipImpl({ prayer, count, palette, notYet, onPress }: Props) {
  const { t } = useTranslation();
  const max = SUNNAH_UNITS[prayer];
  // Asr, and anything else that carries no sunnah: draw nothing at all.
  if (max <= 0) return null;

  const gold = sunnahGold(palette.isDark);
  const complete = count >= max;
  const dead = notYet === true;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={dead}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={t(
        'sunnah.a11yCount',
        '{{prayer}} sunnah: {{done}} of {{total}} logged',
        { prayer: t(`prayer.${prayer}`), done: count, total: max },
      )}
      accessibilityState={{ disabled: dead }}
      style={[
        styles.chip,
        { borderColor: gold },
        complete && { backgroundColor: palette.isDark ? '#3A310F' : '#F4E9C8' },
        dead && styles.dead,
      ]}
    >
      <View style={styles.pips}>
        {Array.from({ length: max }, (_, i) => (
          <View
            key={i}
            style={[
              styles.pip,
              { borderColor: gold },
              i < count && { backgroundColor: gold },
            ]}
          />
        ))}
      </View>
      <Text
        style={[styles.label, { color: gold }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {/* A one-unit prayer says the word; a two-unit one has to say which
            of the two, and "1/2" is the only phrasing that stays legible at
            this size in every script. */}
        {max === 1
          ? t('sunnah.short', 'Sunnah')
          : t('sunnah.ofTotalShort', '{{done}}/{{total}}', {
              done: count,
              total: max,
            })}
      </Text>
    </Pressable>
  );
}

export const SunnahChip = memo(SunnahChipImpl);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  dead: { opacity: 0.4 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 7, height: 7, borderRadius: 99, borderWidth: 1.5 },
  label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
});
