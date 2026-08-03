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
 * Read-only here: no day selection, no legend, no caption. Tapping a square
 * would have to open the Log tab on that day, which is a navigation the
 * card cannot honestly promise from inside Home's scroll view, and a legend
 * repeated on two screens is furniture. The Log tab remains the place where
 * the graph is a control rather than a picture.
 */
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  const { journal, fasts } = usePracticeHistory();

  const earliest = useMemo(() => {
    let first: string | null = null;
    for (const e of journal) if (first === null || e.date < first) first = e.date;
    for (const f of fasts) if (first === null || f.date < first) first = f.date;
    return first;
  }, [journal, fasts]);

  const rows = useMemo(
    () =>
      buildHeatmap(
        scoreByDay(journal),
        new Set(fasts.filter(f => f.completed).map(f => f.date)),
        new Date(),
        weeksToCover(earliest),
      ),
    [journal, fasts, earliest],
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
      ]}>
      <Text style={[styles.title, { color: palette.muted }]}>
        {t('log.practiceTitle')}
      </Text>
      <PracticeHeatmap rows={rows} weekdayLabels={weekdayLabels} compact />
    </View>
  );
}

export const PracticeCard = memo(PracticeCardImpl);

const styles = StyleSheet.create({
  card: { padding: 14, overflow: 'hidden' },
  title: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
});
