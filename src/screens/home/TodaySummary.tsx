/**
 * "Today" summary — what the tool tiles used to occupy (design review 2a).
 *
 * `QuickActionsGrid` defined six destinations, three of which fit above the
 * fold; with a tab bar carrying navigation, a row of buttons to elsewhere is
 * redundant. Home reports instead of routing: prayers logged, the fast, and
 * dhikr — the three facts the app already records about a day.
 *
 * Each line states something true or is not drawn at all — and that now
 * governs the whole card. Only what has actually been LOGGED appears.
 *
 * It used to list all three every day, with empty boxes against the ones
 * that had not happened yet: at seven in the morning it read "0 of 5
 * prayers logged · No fast recorded · 0 dhikr sets completed", which is a
 * list of the user's failures compiled before the day has begun. The three
 * lines were the same three lines forever, so the card carried no
 * information most of the time and a reproach the rest of it.
 *
 * A row appears when there is something to report, marked. An empty day
 * shows no card at all, which is the honest rendering of a day that has
 * nothing in it yet — and makes the card's presence mean something.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { TABULAR_MAX_FONT_SCALE } from '../../theme/textScale';
import {
  LOGGABLE_PRAYERS,
  usePracticeToday,
} from '../../practice/practiceStore';
import { HOME_TABLE_RADIUS } from './tokens';

type Props = {
  /** Opens the Log (prayers + fasting). */
  onOpenLog?: () => void;
};

/** One logged fact. Only ever rendered for something that happened, so it
 *  has no unmarked state to draw. */
function Line({ label }: { label: string }) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.line}>
      <View style={[styles.box, { backgroundColor: palette.accentSolid }]}>
        <Text style={[styles.tick, { color: palette.onAccent }]}>✕</Text>
      </View>
      <Text
        style={[styles.label, { color: palette.text }]}
        numberOfLines={2}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
      >
        {label}
      </Text>
    </View>
  );
}

function TodaySummaryImpl({ onOpenLog }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { hydrated, logged, fasted, fastType, dhikrSets } = usePracticeToday();

  // Nothing to report before the encrypted stores have been read — an empty
  // card that fills in a beat later reads as a glitch.
  if (!hydrated) return null;
  // Nor when the day is genuinely empty. A card headed "Today" with nothing
  // under it is worse than no card: it takes up the same room and says the
  // day is blank, which the user can see for themselves.
  if (logged === 0 && !fasted && dhikrSets === 0) return null;

  return (
    <GlassSurface
      style={[
        styles.card,
        { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) },
      ]}
    >
      <Pressable
        accessibilityRole={onOpenLog ? 'button' : 'summary'}
        accessibilityLabel={t('home.todaySummary', 'Today')}
        onPress={onOpenLog}
        style={styles.inner}
      >
        <Text style={[styles.heading, { color: palette.muted }]}>
          {t('home.todaySummary', 'Today')}
        </Text>
        {logged > 0 ? (
          <Line
            label={t('home.prayersLogged', {
              defaultValue: '{{count}} of {{total}} prayers logged',
              count: logged,
              total: LOGGABLE_PRAYERS,
            })}
          />
        ) : null}
        {fasted ? (
          <Line
            label={t(`home.fastKept.${fastType ?? 'voluntary'}`, {
              defaultValue: 'Fast kept',
            })}
          />
        ) : null}
        {dhikrSets > 0 ? (
          <Line
            label={t('home.dhikrSets', {
              defaultValue: '{{count}} dhikr sets completed',
              count: dhikrSets,
            })}
          />
        ) : null}
      </Pressable>
    </GlassSurface>
  );
}

export const TodaySummary = memo(TodaySummaryImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  inner: { paddingHorizontal: 16, paddingVertical: 13 },
  heading: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 7,
  },
  box: {
    width: 19,
    height: 19,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { fontSize: 11, fontWeight: '700' },
  label: { flex: 1, fontSize: 14.5 },
});
