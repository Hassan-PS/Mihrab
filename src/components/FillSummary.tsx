/**
 * What a fill button is about to write, as figures rather than a sentence.
 *
 * The prompt used to be one paragraph carrying four numbers: "This records
 * 435 prayers across 87 empty days (May 13 – August 7) as prayed on time. 5
 * days are left alone…". Every number in it matters — this is the one
 * confirmation in the app that writes hundreds of entries to the user's own
 * record — and a paragraph is the worst place to put numbers that matter.
 * People agree to paragraphs without reading them.
 *
 * So the two figures that decide the answer are set large and side by side,
 * the range sits under them as the thing being claimed, and what is being
 * LEFT ALONE gets its own line — because for a button whose whole risk is
 * touching something it shouldn't, that is the reassurance the user came
 * looking for.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../hooks/useAppPalette';
import { tabularNumeralStyle } from '../theme/textScale';

type Props = {
  /** Big figure, left: days that would gain entries. */
  days: number;
  daysLabel: string;
  /** Big figure, right: individual prayers that would be recorded. */
  prayers: number;
  prayersLabel: string;
  /** "13 May – 7 August" — the span actually being written to. */
  range: string;
  /**
   * Third figure: days deliberately NOT touched. A number rather than a
   * sentence for the usual reason, and for one more — "1 days are left
   * alone" is the kind of copy that makes a user trust the rest of the
   * dialog less, and pluralising it properly would mean six variants of
   * the sentence in Arabic alone. A figure under a caption inflects in no
   * language.
   */
  preservedCount?: number;
  preservedLabel?: string;
  /** The reassurance line, which names no numbers. */
  preserved?: string;
};

export function FillSummary({
  days,
  daysLabel,
  prayers,
  prayersLabel,
  range,
  preservedCount,
  preservedLabel,
  preserved,
}: Props) {
  const { palette } = useAppPalette();
  const border = palette.border ?? palette.muted;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.figures,
          { backgroundColor: palette.controlBg, borderColor: border },
        ]}
      >
        <View style={styles.figure}>
          <Text
            style={[
              styles.number,
              tabularNumeralStyle,
              { color: palette.text },
            ]}
          >
            {days}
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            {daysLabel}
          </Text>
        </View>
        <View style={[styles.rule, { backgroundColor: border }]} />
        <View style={styles.figure}>
          <Text
            style={[
              styles.number,
              tabularNumeralStyle,
              { color: palette.text },
            ]}
          >
            {prayers}
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            {prayersLabel}
          </Text>
        </View>
        {preservedCount !== undefined && preservedLabel ? (
          <>
            <View style={[styles.rule, { backgroundColor: border }]} />
            <View style={styles.figure}>
              <Text
                style={[
                  styles.number,
                  tabularNumeralStyle,
                  // Muted: this is the figure that reassures rather than
                  // the figure being agreed to, and it should not compete
                  // with the two that are.
                  { color: palette.muted },
                ]}
              >
                {preservedCount}
              </Text>
              <Text style={[styles.caption, { color: palette.muted }]}>
                {preservedLabel}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      <Text
        style={[styles.range, tabularNumeralStyle, { color: palette.text }]}
        numberOfLines={2}
      >
        {range}
      </Text>

      {preserved ? (
        <Text style={[styles.preserved, { color: palette.muted }]}>
          {preserved}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  figures: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  figure: { flex: 1, alignItems: 'center', gap: 2 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  number: { fontSize: 26, fontWeight: '700' },
  caption: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  range: {
    fontSize: 14.5,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  preserved: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
});
