/**
 * The seven-day strip (design review 2a).
 *
 * Replaces the carousel's six 6-px dots, which asked people to swipe
 * something whose edge they could not see. Seven chips: today first, then
 * six days forward — no past days occupying the spot the eye lands on. In an
 * RTL language the row mirrors, so today stays on the leading edge.
 *
 * Forward-only is deliberate. People check ahead (Fajr tomorrow, Jumuah);
 * back-logging a missed prayer belongs to the Log tab's history, not to a
 * strip whose job is "which day am I looking at".
 */
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

export type DayStripEntry = {
  /** Offset from today, 0…6 — also the index into the week's timings. */
  offset: number;
  /** Two-letter weekday, in the app language. */
  dow: string;
  /** Day of month, in the app language's numerals. */
  dom: string;
  /** Full label for screen readers ("Tomorrow", "Wednesday 6 August"). */
  a11yLabel: string;
};

type Props = {
  days: DayStripEntry[];
  selected: number;
  onSelect: (offset: number) => void;
};

function DayStripImpl({ days, selected, onSelect }: Props) {
  const { palette } = useAppPalette();
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={t('home.dayStrip', 'Choose a day')}
      // No manual mirroring here. The app root already sets `direction` from
      // the chosen language, so a plain row runs the right way — adding
      // `row-reverse` on top of that flipped it twice and put today on the
      // trailing edge in Arabic.
      style={[styles.strip, { borderBottomColor: palette.border ?? palette.muted }]}
      contentContainerStyle={styles.stripContent}>
      {days.map(day => {
        const isSelected = day.offset === selected;
        return (
          <Pressable
            key={day.offset}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={day.a11yLabel}
            onPress={() => onSelect(day.offset)}
            // Only the chosen day has ink (redesign-plan P4): seven filled
            // rectangles with one selected was the row shouting and the
            // choice whispering. The other six are plain text.
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: isSelected
                  ? palette.accentSolid
                  : pressed
                  ? palette.controlBg
                  : 'transparent',
              },
            ]}>
            <Text
              style={[
                styles.dow,
                { color: isSelected ? palette.onAccent : palette.muted },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {day.dow}
            </Text>
            <Text
              style={[
                styles.dom,
                tabularNumeralStyle,
                { color: isSelected ? palette.onAccent : palette.text },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {day.dom}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.tailSpacer} />
    </ScrollView>
  );
}

export const DayStrip = memo(DayStripImpl);

const styles = StyleSheet.create({
  strip: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  stripContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  chip: {
    minWidth: 44,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    gap: 1,
  },
  dow: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
  },
  dom: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
  // Keeps the last chip clear of the card's rounded corner while scrolling.
  tailSpacer: { width: 2 },
});
