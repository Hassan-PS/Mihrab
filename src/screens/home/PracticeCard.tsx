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
 * selection here would mean two graphs behaving differently. But the card as
 * a whole opens the Log, because a picture of your record that does nothing
 * when you press it reads as broken: people press it precisely because they
 * want the thing it is a picture OF.
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('log.openLogFromHome', 'Open the Log')}
      // The whole card, not the squares: the graph scrolls horizontally
      // inside itself, and a press target on each square would fight that
      // scroll for every gesture.
      onPress={() => navigation.navigate('LogTab' as never)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.card,
          borderRadius: HOME_TABLE_RADIUS,
          ...cardEdgeStyle(palette),
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.title, { color: palette.muted }]}>
        {t('log.practiceTitle')}
      </Text>
      <PracticeHeatmap rows={rows} weekdayLabels={weekdayLabels} compact />
    </Pressable>
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
