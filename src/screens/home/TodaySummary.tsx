/**
 * "Today" summary — what the tool tiles used to occupy (design review 2a).
 *
 * `QuickActionsGrid` defined six destinations, three of which fit above the
 * fold; with a tab bar carrying navigation, a row of buttons to elsewhere is
 * redundant. Home reports instead of routing: prayers logged, the fast, and
 * dhikr — the three facts the app already records about a day.
 *
 * Each line states something true or is not drawn at all. A checkbox for a
 * thing the app cannot observe would be the same mistake as a countdown on a
 * day that has no countdown.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { TABULAR_MAX_FONT_SCALE } from '../../theme/textScale';
import { LOGGABLE_PRAYERS, usePracticeToday } from '../../practice/practiceStore';
import { HOME_TABLE_RADIUS } from './tokens';

type Props = {
  /** Opens the Log (prayers + fasting). */
  onOpenLog?: () => void;
};

function Line({ done, label }: { done: boolean; label: string }) {
  const { palette } = useAppPalette();
  return (
    <View style={styles.line}>
      <View
        style={[
          styles.box,
          done
            ? { backgroundColor: palette.accentSolid }
            : {
                borderWidth: 1.5,
                borderColor: palette.border ?? palette.muted,
              },
        ]}>
        {done ? (
          <Text style={[styles.tick, { color: palette.onAccent }]}>✓</Text>
        ) : null}
      </View>
      <Text
        style={[styles.label, { color: done ? palette.text : palette.muted }]}
        numberOfLines={2}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
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

  return (
    <GlassSurface
      style={[
        styles.card,
        { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) },
      ]}>
      <Pressable
        accessibilityRole={onOpenLog ? 'button' : 'summary'}
        accessibilityLabel={t('home.todaySummary', 'Today')}
        onPress={onOpenLog}
        style={styles.inner}>
        <Text style={[styles.heading, { color: palette.muted }]}>
          {t('home.todaySummary', 'Today')}
        </Text>
        <Line
          done={logged >= LOGGABLE_PRAYERS}
          label={t('home.prayersLogged', {
            defaultValue: '{{count}} of {{total}} prayers logged',
            count: logged,
            total: LOGGABLE_PRAYERS,
          })}
        />
        <Line
          done={fasted}
          label={
            fasted
              ? t(`home.fastKept.${fastType ?? 'voluntary'}`, {
                  defaultValue: 'Fast kept',
                })
              : t('home.noFastToday', 'No fast recorded')
          }
        />
        <Line
          done={dhikrSets > 0}
          label={t('home.dhikrSets', {
            defaultValue: '{{count}} dhikr sets completed',
            count: dhikrSets,
          })}
        />
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
