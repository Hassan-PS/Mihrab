/**
 * Four numbers above the graph — the part you read rather than decode.
 *
 * WHY IT LIVES HERE AND NOT IN THE HEATMAP. `PracticeHeatmap` renders twice:
 * on the Log, and on Home through `PracticeCard`, where the card deliberately
 * has no legend, no caption and no day selection. Putting the row inside the
 * component would put it on Home too, and Home already answers a different
 * question. So the row belongs to the screen, not to the graph.
 *
 * EVERY TILE SAYS WHAT IT COUNTS. The caption this replaces read "5-day
 * streak (best 12) · 0-day sunnah · 1 fasts", and the middle of that is a
 * puzzle: 0-day sunnah is a streak of days on which EVERY sunnah and Witr
 * were prayed, which is demanding enough that most people would see 0 for
 * ever. The unit now sits in the value itself — `5 days`, `68%` — because a
 * bare number beside a bare word is where the ambiguity came from.
 *
 * OWED IS THE ONLY TILE THAT IS A CALL TO ACTION, so it is the only one with
 * a tinted background and the only one that says "tap". When there is nothing
 * owed it turns quiet green and says so: the reward for being clear is that
 * it stops asking.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import { tabularNumeralStyle } from '../../theme/textScale';
import type { PracticeStats } from '../../practice/practiceStats';

type Props = {
  stats: PracticeStats;
  palette: AppPalette;
  /** Whether the grid is currently showing only owed days. */
  showingOwed: boolean;
  onToggleOwed: () => void;
};

function Tile({
  value,
  unit,
  label,
  foot,
  palette,
  tone,
}: {
  value: string;
  unit?: string;
  label: string;
  foot?: string;
  palette: AppPalette;
  tone?: 'gold' | 'amber';
}) {
  const color =
    tone === 'gold'
      ? palette.isDark
        ? '#E8CE7A'
        : '#9A7B1F'
      : tone === 'amber'
        ? palette.isDark
          ? '#FBBF24'
          : '#B45309'
        : palette.accent;
  return (
    <View style={[styles.tile, { backgroundColor: palette.controlBg }]}>
      <Text
        style={[styles.value, tabularNumeralStyle, { color }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {value}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
      <Text style={[styles.label, { color: palette.muted }]} numberOfLines={2}>
        {label}
      </Text>
      {foot ? (
        <Text style={[styles.foot, { color: palette.muted }]} numberOfLines={1}>
          {foot}
        </Text>
      ) : null}
    </View>
  );
}

function PracticeStatsRowImpl({
  stats,
  palette,
  showingOwed,
  onToggleOwed,
}: Props) {
  const { t } = useTranslation();
  const owed = stats.owed.length;
  // A rate needs a denominator that has happened. Before then it shows an
  // em-dash rather than a 0% that would read as failure on a fresh install.
  const rate =
    stats.sunnahRate === null
      ? '—'
      : String(Math.round(stats.sunnahRate * 100));

  return (
    <View style={styles.row}>
      <Tile
        palette={palette}
        value={String(stats.streak)}
        unit={t('stats.daysUnit', ' days')}
        label={t('stats.streakLabel', 'On-time streak')}
        foot={
          stats.bestStreak > 0
            ? t('stats.best', 'best {{best}}', { best: stats.bestStreak })
            : undefined
        }
      />
      <Tile
        palette={palette}
        tone="gold"
        value={rate}
        unit={stats.sunnahRate === null ? undefined : '%'}
        label={t('stats.sunnahLabel', 'Sunnah kept')}
        foot={t('stats.thisMonth', 'this month')}
      />
      <Tile
        palette={palette}
        tone="amber"
        value={String(stats.fastsThisMonth)}
        unit={t('stats.daysUnit', ' days')}
        label={t('stats.fastedLabel', 'Fasted')}
        foot={t('stats.thisMonth', 'this month')}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showingOwed, disabled: owed === 0 }}
        accessibilityLabel={
          owed === 0
            ? t('stats.nothingOwedA11y', 'Nothing owed')
            : // `{{owed}}` rather than `{{count}}`: `count` is i18next's
              // plural selector, and Arabic would then need six forms.
              t('stats.owedA11y', '{{owed}} prayers owed, show them', {
                owed,
              })
        }
        disabled={owed === 0}
        onPress={onToggleOwed}
        style={[
          styles.tile,
          owed === 0
            ? { backgroundColor: palette.accentBg }
            : {
                backgroundColor: palette.isDark ? '#3A1E1B' : '#FBEDEB',
                borderWidth: showingOwed ? 1.5 : StyleSheet.hairlineWidth,
                borderColor: String(palette.danger),
              },
        ]}
      >
        <Text
          style={[
            styles.value,
            tabularNumeralStyle,
            { color: owed === 0 ? palette.accent : String(palette.danger) },
          ]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {owed}
        </Text>
        <Text
          style={[
            styles.label,
            { color: owed === 0 ? palette.muted : String(palette.danger) },
          ]}
          numberOfLines={2}
        >
          {owed === 0
            ? t('stats.nothingOwed', 'Nothing owed')
            : t('stats.owedLabel', 'Prayers owed')}
        </Text>
        {owed > 0 ? (
          <Text style={[styles.foot, { color: palette.muted }]} numberOfLines={1}>
            {showingOwed
              ? t('stats.owedHide', 'showing ✕')
              : t('stats.owedShow', 'tap to see')}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export const PracticeStatsRow = memo(PracticeStatsRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 7, marginBottom: 4 },
  tile: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  /**
   * `allowFontScaling` off on the figures, on for the labels.
   *
   * Four tiles across a phone give each about 80pt. The words can wrap and
   * the tiles grow together; a figure that scales turns "68%" into two lines
   * and breaks the row's rhythm for no gain, since it is already the largest
   * thing in the tile.
   */
  value: { fontSize: 19, fontWeight: '700', lineHeight: 23 },
  unit: { fontSize: 11, fontWeight: '700' },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 12,
    /**
     * Two lines of room whether or not the label needs them.
     *
     * "On-time streak" and "Prayers owed" wrap on a phone; "Fasted" does
     * not. Without this the four feet — `best 11`, `this month`, `this
     * month`, `tap to see` — land on two different baselines and the row
     * reads as four unrelated boxes rather than one instrument.
     */
    minHeight: 24,
  },
  foot: { fontSize: 9, marginTop: 2, textAlign: 'center' },
});
