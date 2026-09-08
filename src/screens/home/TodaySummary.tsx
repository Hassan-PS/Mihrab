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
import Svg, { Circle, Path } from 'react-native-svg';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { TABULAR_MAX_FONT_SCALE } from '../../theme/textScale';
import {
  LOGGABLE_PRAYERS,
  usePracticeToday,
} from '../../practice/practiceStore';
import { HOME_TABLE_RADIUS } from './tokens';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

type Props = {
  /** Opens the Log (prayers + fasting). */
  onOpenLog?: () => void;
};

const MARK = 20;
const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The mark beside a fact: a ring filled to the fraction done, and a tick
 * once it is whole. It was a filled box with an "✕" in it — meant as a
 * check, read as an error — and "3 of 5 prayers logged" beside a crossed
 * box said the opposite of what the line said (redesign-plan B.1.7).
 */
function Mark({ fraction }: { fraction: number }) {
  const { palette } = useAppPalette();
  const done = fraction >= 1;
  const pct = Math.max(0, Math.min(1, fraction));
  return (
    <Svg width={MARK} height={MARK} viewBox={`0 0 ${MARK} ${MARK}`}>
      <Circle
        cx={MARK / 2}
        cy={MARK / 2}
        r={RING_R}
        stroke={palette.accentSolid}
        strokeOpacity={done ? 1 : 0.25}
        strokeWidth={2}
        fill={done ? palette.accentSolid : 'none'}
      />
      {done ? (
        <Path
          d="M6 10.5l2.6 2.6L14 7.6"
          stroke={palette.onAccent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : (
        <Circle
          cx={MARK / 2}
          cy={MARK / 2}
          r={RING_R}
          stroke={palette.accentSolid}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_C * pct} ${RING_C}`}
          // Start at twelve o'clock.
          transform={`rotate(-90 ${MARK / 2} ${MARK / 2})`}
        />
      )}
    </Svg>
  );
}

/** One logged fact. Only ever rendered for something that happened, so it
 *  has no unmarked state to draw. */
function Line({
  label,
  fraction = 1,
  first = false,
}: {
  label: string;
  fraction?: number;
  first?: boolean;
}) {
  const { palette } = useAppPalette();
  return (
    <View style={[styles.line, first && styles.firstLine]}>
      <Mark fraction={fraction} />
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
        {/* No heading. The card sits on the Today tab; a label reading
            "Today" above three facts about today was the one overline that
            said nothing at all (redesign-plan P1). The accessibility label
            on the Pressable still names it. */}
        {logged > 0 ? (
          <Line
            first
            fraction={logged / LOGGABLE_PRAYERS}
            label={t('home.prayersLogged', {
              defaultValue: '{{count}} of {{total}} prayers logged',
              count: logged,
              total: LOGGABLE_PRAYERS,
            })}
          />
        ) : null}
        {fasted ? (
          <Line
            first={logged === 0}
            label={t(`home.fastKept.${fastType ?? 'voluntary'}`, {
              defaultValue: 'Fast kept',
            })}
          />
        ) : null}
        {dhikrSets > 0 ? (
          <Line
            first={logged === 0 && !fasted}
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
  inner: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  firstLine: { marginTop: 0 },
  label: { flex: 1, fontSize: TYPE.callout.fontSize },
});
