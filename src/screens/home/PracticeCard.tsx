/**
 * The practice graph, on Home, behind a switch.
 *
 * Home answers "when do I pray next"; the graph answers "how have I been
 * doing", and those are different questions on different clocks — which is
 * why this is off by default and why the toggle sits next to the graph on
 * the Log tab as well as in Settings. For the people who do want it, seeing
 * the squares on the screen they open twenty times a day is the entire
 * point of keeping the record at all.
 *
 * The squares themselves are not controls — no day selection, no legend, no
 * caption; a legend repeated on two screens is furniture, and per-square
 * selection here would mean two graphs behaving differently. But the card
 * opens the Log, because a picture of your record that does nothing when you
 * press it reads as broken: people press it precisely because they want the
 * thing it is a picture OF.
 *
 * That press lives on a ROW at the foot of the card, not on the card itself.
 * Wrapping the whole card in a Pressable put a press target around a
 * horizontally scrolling grid, and the two fought for every gesture: the
 * graph would not scroll here at all, which is a strange thing for the same
 * component to do on one screen and not the other. The row is also the
 * app's own idiom for this — "All upcoming →" on the Log does the same job.
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { scoreByDay } from '../../journal/journal';
import { usePracticeHistory } from '../../practice/practiceStore';
import {
  buildHeatmap,
  PracticeHeatmap,
  weeksToCover,
} from '../../practice/PracticeHeatmap';
import { HOME_TABLE_RADIUS } from './tokens';

function PracticeCardImpl() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation();
  const { journal, fasts } = usePracticeHistory();

  const earliest = useMemo(() => {
    let first: string | null = null;
    for (const e of journal)
      if (first === null || e.date < first) first = e.date;
    for (const f of fasts) if (first === null || f.date < first) first = f.date;
    return first;
  }, [journal, fasts]);

  /**
   * The same reach-back the Log has.
   *
   * Without it this graph drew exactly the weeks it had data for — thirteen
   * on a young journal — which fits the card, which means the ScrollView
   * has nothing to scroll and the grid simply does not move. That is
   * indistinguishable from a bug, and it made the same component behave
   * differently on two screens. Dragging to the oldest column now loads
   * another half-year here too.
   */
  const [extraWeeks, setExtraWeeks] = useState(0);
  const showMore = useCallback(() => setExtraWeeks(w => w + 26), []);

  const rows = useMemo(
    () =>
      buildHeatmap(
        scoreByDay(journal),
        new Set(fasts.filter(f => f.completed).map(f => f.date)),
        new Date(),
        weeksToCover(earliest) + extraWeeks,
      ),
    [journal, fasts, earliest, extraWeeks],
  );

  const weekdayLabels = useMemo(() => {
    const monday = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d
        .toLocaleDateString(i18n.language, { weekday: 'narrow' })
        .slice(0, 2);
    });
  }, [i18n.language]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderRadius: HOME_TABLE_RADIUS,
          ...cardEdgeStyle(palette),
        },
      ]}
    >
      <Text style={[styles.title, { color: palette.muted }]}>
        {t('log.practiceTitle')}
      </Text>
      <PracticeHeatmap
        rows={rows}
        weekdayLabels={weekdayLabels}
        onReachOldest={showMore}
        compact
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('log.openLogFromHome', 'Open the Log')}
        onPress={() => navigation.navigate('LogTab' as never)}
        style={({ pressed }) => [
          styles.openRow,
          { borderTopColor: palette.border ?? palette.muted },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Text style={[styles.openLabel, { color: palette.accent }]}>
          {t('log.openLogFromHome', 'Open the Log')}
        </Text>
        <Text style={{ color: palette.accent, fontSize: 15 }}>→</Text>
      </Pressable>
    </View>
  );
}

export const PracticeCard = memo(PracticeCardImpl);

const styles = StyleSheet.create({
  card: { padding: 14, overflow: 'hidden' },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 12,
  },
  openLabel: { fontSize: 13.5, fontWeight: '600' },
  title: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
});
