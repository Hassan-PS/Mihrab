/**
 * Thirteen weeks of practice, two facts per square (design review 2c).
 *
 * Prayers and fasting are the same act — recording what you did today — and
 * they were split across two screens with two visual languages. One graph
 * carries both: FILL DEPTH is prayers logged (0→5), an INSET RING is the
 * fast. They never collide because they use different channels, so either
 * can be read alone or both at once; a second grid would have doubled the
 * screen for half the insight.
 *
 * The ring rather than another colour step, because fasting is not "more
 * prayer" — it is a different axis, and it cannot be another rung on the
 * green ramp. An outline reads as a distinct category, and the two amber
 * days a week (Mondays and Thursdays) show up as a rhythm rather than noise.
 *
 * Rows are weekdays, so a habit that fails on Fridays — or a Ramadan block —
 * reads as a shape. Thirteen columns at 15pt fits a 390pt phone with no
 * horizontal scroll, which is what usually kills this pattern on mobile.
 *
 * An empty square is warm paper, never grey: the GitHub reading of
 * "empty = failure" is not a judgement this app should make about a
 * religious practice, and thirteen weeks is short enough that a hard month
 * scrolls out of view rather than standing as a monument.
 */
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import { dayKey } from './practiceStore';

/** Weeks shown. Thirteen ≈ a quarter, and fits the narrowest phone. */
export const HEATMAP_WEEKS = 13;
const SQUARE = 15;
const GAP = 4;
/** Amber, for the fast ring — the app's own amber accent swatch. */
const FAST_RING_LIGHT = '#B45309';
const FAST_RING_DARK = '#FBBF24';

export type HeatmapDay = {
  key: string;
  /** 0…5 prayers logged. */
  prayers: number;
  fasted: boolean;
  /** Days after today inside the trailing week — drawn as blanks. */
  future: boolean;
};

/**
 * Thirteen weeks ending with the week that contains today, as weekday rows.
 * Weeks start on Monday so the two sunnah fast days sit in the first and
 * fourth rows rather than being split across a boundary.
 */
export function buildHeatmap(
  prayersByDay: Map<string, number>,
  fastedDays: Set<string>,
  now: Date = new Date(),
): HeatmapDay[][] {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  // Monday of the current week.
  const monday = new Date(today);
  const dow = (monday.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(monday.getDate() - dow);
  const start = new Date(monday);
  start.setDate(start.getDate() - (HEATMAP_WEEKS - 1) * 7);

  const rows: HeatmapDay[][] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const row: HeatmapDay[] = [];
    for (let week = 0; week < HEATMAP_WEEKS; week++) {
      const d = new Date(start);
      d.setDate(start.getDate() + week * 7 + weekday);
      const key = dayKey(d);
      row.push({
        key,
        prayers: prayersByDay.get(key) ?? 0,
        fasted: fastedDays.has(key),
        future: d.getTime() > today.getTime(),
      });
    }
    rows.push(row);
  }
  return rows;
}

/** Hex with an alpha suffix — the green ramp is one colour at five depths. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

type Props = {
  rows: HeatmapDay[][];
  /** Weekday initials, already localised, Monday first. */
  weekdayLabels: string[];
  caption?: string;
};

function PracticeHeatmapImpl({ rows, weekdayLabels, caption }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const ring = palette.isDark ? FAST_RING_DARK : FAST_RING_LIGHT;
  const accent = palette.accentSolid;

  const legend = useMemo(() => [0, 1, 3, 5], []);

  return (
    <View>
      <View style={styles.grid}>
        <View style={styles.labels}>
          {weekdayLabels.map((label, i) => (
            <View key={i} style={styles.labelCell}>
              {/* Every other row, so the column stays quiet. */}
              {i % 2 === 0 ? (
                <Text
                  style={[styles.labelText, { color: palette.muted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                  {label}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.weeks}>
          {rows.map((row, r) => (
            <View key={r} style={styles.week}>
              {row.map(day => (
                <View
                  key={day.key}
                  accessible
                  accessibilityLabel={t('log.dayA11y', {
                    defaultValue:
                      '{{date}}: {{prayers}} prayers logged{{fast}}',
                    date: day.key,
                    prayers: day.prayers,
                    fast: day.fasted
                      ? `, ${t('log.fasted', 'fasted')}`
                      : '',
                  })}
                  style={[
                    styles.square,
                    {
                      backgroundColor: day.future
                        ? 'transparent'
                        : day.prayers > 0
                          ? withAlpha(accent, 0.2 + 0.8 * (day.prayers / 5))
                          : palette.controlBg,
                    },
                    day.fasted && {
                      borderWidth: 2,
                      borderColor: ring,
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.legendRow}>
        <Text
          style={[styles.legendText, { color: palette.muted }]}
          numberOfLines={1}>
          {t('log.legendPrayers', '0 → 5 prayers')}
        </Text>
        <View style={styles.legendSquares}>
          {legend.map(n => (
            <View
              key={n}
              style={[
                styles.legendSquare,
                {
                  backgroundColor:
                    n > 0 ? withAlpha(accent, 0.2 + 0.8 * (n / 5)) : palette.controlBg,
                },
              ]}
            />
          ))}
          <View
            style={[
              styles.legendSquare,
              { borderWidth: 2, borderColor: ring, backgroundColor: 'transparent' },
            ]}
          />
        </View>
        <Text
          style={[styles.legendText, { color: palette.muted }]}
          numberOfLines={1}>
          {t('log.fasted', 'fasted')}
        </Text>
      </View>

      {caption ? (
        <Text
          style={[styles.caption, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export const PracticeHeatmap = memo(PracticeHeatmapImpl);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 6 },
  labels: { gap: GAP },
  labelCell: { height: SQUARE, justifyContent: 'center' },
  labelText: { fontSize: 9, fontWeight: '600' },
  weeks: { flex: 1, gap: GAP },
  week: { flexDirection: 'row', gap: GAP },
  square: { width: SQUARE, height: SQUARE, borderRadius: 3.5 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  legendSquares: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendSquare: { width: 11, height: 11, borderRadius: 2.5 },
  legendText: { fontSize: 10.5, fontWeight: '600' },
  caption: { fontSize: 12, marginTop: 8 },
});
