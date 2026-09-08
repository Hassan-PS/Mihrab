import { memo } from 'react';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE } from '../../theme/textScale';
import { typeStyle } from '../../theme/typography';

/**
 * Tile — a number on the page, with its label under it
 * (docs/design/redesign-plan.md §2.5).
 *
 * No background, ever. The Log's four statistics were tiles inside a card
 * inside a card; a Tile sits directly on the page and lets size do the
 * work a box was doing. `value` is tabular so a row of them lines up.
 *
 * `tone` is for the ONE tile on a row that has something to say — the
 * best streak, the thing owed — and it is the accent or nothing. Gold and
 * orange statistics read as alarms (redesign-plan P6).
 */
type Props = {
  value: string;
  /** A unit after the value, small: "days", "%". */
  unit?: string;
  label: string;
  caption?: string;
  tone?: 'accent';
  color?: ColorValue;
  accessibilityLabel?: string;
};

function TileImpl({ value, unit, label, caption, tone, color, accessibilityLabel }: Props) {
  const { palette } = useAppPalette();
  const valueColor = color ?? (tone === 'accent' ? palette.accent : palette.text);
  return (
    <View
      style={styles.tile}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${value}${unit ?? ''} ${label}`}>
      {/* The unit lives INSIDE the value, as a smaller run — "5 days", not
          a "5" next to a bare word, which is where the Log's caption got
          its ambiguity from (see PracticeStatsRow). The caller owns the
          spacing: locales hand over " days" with its space, "%" without. */}
      <Text
        style={[typeStyle('title2'), styles.value, { color: valueColor }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {value}
        {unit ? (
          <Text style={[typeStyle('footnote'), styles.unit, { color: valueColor }]}>
            {unit}
          </Text>
        ) : null}
      </Text>
      <Text style={[typeStyle('label'), { color: palette.muted }]} numberOfLines={2}>
        {label}
      </Text>
      {caption ? (
        <Text style={[typeStyle('caption'), styles.caption, { color: palette.muted }]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export const Tile = memo(TileImpl);

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 0 },
  value: { fontVariant: ['tabular-nums'] },
  unit: { fontWeight: '600' },
  caption: { marginTop: 2 },
});
