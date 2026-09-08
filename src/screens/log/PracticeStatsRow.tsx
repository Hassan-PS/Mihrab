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
 * ever. The unit now sits beside the value — `5 days`, `68 %` — because a
 * bare number beside a bare word is where the ambiguity came from.
 *
 * ON THE PAGE, NOT IN BOXES (docs/design/redesign-plan.md §2.5, P6). The
 * tiles were four filled rectangles inside a card inside a card, in green,
 * gold, orange and red — six colours on one screen, and a "0 days" in
 * orange that read as an alarm. Now they are numbers with labels under
 * them, in the text colour, and the only tile with a colour of its own is
 * the one that is a call to action: prayers owed, in the danger colour,
 * because it is the one thing here that asks for something.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import type { PracticeStats } from '../../practice/practiceStats';
import { Tile } from '../../components/ui/Tile';

type Props = {
  stats: PracticeStats;
  palette: AppPalette;
  /** Whether the grid is currently showing only owed days. */
  showingOwed: boolean;
  onToggleOwed: () => void;
};

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
        value={String(stats.streak)}
        unit={t('stats.daysUnit', ' days')}
        label={t('stats.streakLabel', 'On-time streak')}
        caption={
          stats.bestStreak > 0
            ? t('stats.best', 'best {{best}}', { best: stats.bestStreak })
            : undefined
        }
      />
      <Tile
        value={rate}
        unit={stats.sunnahRate === null ? undefined : '%'}
        label={t('stats.sunnahLabel', 'Sunnah kept')}
        caption={t('stats.thisMonth', 'this month')}
      />
      <Tile
        value={String(stats.fastsThisMonth)}
        unit={t('stats.daysUnit', ' days')}
        label={t('stats.fastedLabel', 'Fasted')}
        caption={t('stats.thisMonth', 'this month')}
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
        style={[styles.owed, showingOwed && { backgroundColor: palette.controlBg }]}
      >
        <Tile
          value={String(owed)}
          label={
            owed === 0
              ? t('stats.nothingOwed', 'Nothing owed')
              : t('stats.owedLabel', 'Prayers owed')
          }
          caption={
            owed > 0
              ? showingOwed
                ? t('stats.owedHide', 'showing ✕')
                : t('stats.owedShow', 'tap to see')
              : undefined
          }
          color={owed === 0 ? palette.text : palette.danger}
        />
      </Pressable>
    </View>
  );
}

export const PracticeStatsRow = memo(PracticeStatsRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  owed: { flex: 1, minWidth: 0, borderRadius: 12, marginHorizontal: -4, paddingHorizontal: 4 },
});
