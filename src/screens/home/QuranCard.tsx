/**
 * Home's Quran card (design review 2b) — four states, one card.
 *
 * It never disappears: whichever of the four states is true, the card is
 * the way into the muṣḥaf — continue, the khatmah's next page, today's
 * portion done, or start. The state itself is chosen by
 * `selectQuranCardState` so this file only has to draw.
 *
 * It no longer reads a verse. The ayah of the day was drawn here when
 * nothing had been started, and a card that is sometimes a shortcut and
 * sometimes a passage of scripture was two things on one spot; Today is
 * the times, and this is the door. The verse keeps its notification.
 *
 * One row, low: an icon, a line, a line under it, a bar when there is a
 * plan. It sits under a table that fills the screen, and every point of
 * height here is a point the hero gives up.
 *
 * The progress bar exists only when a plan does. Without a khatmah there is
 * nothing to be a fraction of, and an empty bar would invent a goal the user
 * never set.
 */
import { memo, useEffect } from 'react';
import {
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { QuranBookIcon } from '../../theme/icons';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { TABULAR_MAX_FONT_SCALE } from '../../theme/textScale';
import { TYPE } from '../../theme/typography';
import { findSurah } from '../../quran/quran';
import { surahName } from '../../quran/surahName';
import { useQuranState } from '../../quran/quranState';
import { warmMushafLayout } from '../../quran/mushafLayout';
import { selectQuranCardState } from '../../quran/quranCardState';
import { HOME_TABLE_RADIUS } from './tokens';
import { RADIUS, SPACING } from '../../theme/tokens';

type Props = {
  /** Continue reading — surah + optional page for the mushaf. */
  onOpenAt: (surah: number, page?: number, ayah?: number) => void;
  /** Opens the Quran home (surah list, khatmah controls). */
  onOpenQuran: () => void;
};

function ProgressBar({ value }: { value: number }) {
  const { palette } = useAppPalette();
  return (
    <View style={[styles.track, { backgroundColor: palette.controlBg }]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: palette.accentSolid,
            width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
          },
        ]}
      />
    </View>
  );
}

function QuranCardImpl({ onOpenAt, onOpenQuran }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const quran = useQuranState();
  const card = selectQuranCardState(quran);
  // A card that says "Continue" into the muṣḥaf is a reader about to open
  // it. Bring the page-layout data in now, after the home screen has
  // settled, rather than in the middle of the push transition when the
  // first page asks for it — see `warmMushafLayout`.
  const readsMushaf = quran.lastRead?.mode === 'mushaf';
  const riwayah = quran.prefs.riwayah;
  useEffect(() => {
    if (!readsMushaf) return;
    const task = InteractionManager.runAfterInteractions(() =>
      warmMushafLayout(riwayah),
    );
    return () => task.cancel();
  }, [readsMushaf, riwayah]);

  const surahLabel = (n: number) => {
    const meta = findSurah(n);
    return meta ? surahName(meta, i18n.language) : '';
  };

  const shell = (children: React.ReactNode, onPress: () => void, label: string) => (
    <GlassSurface
      style={[
        styles.card,
        { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }: { pressed: boolean }) => [
          styles.pressable,
          pressed && { opacity: 0.75 },
        ]}>
        {children}
      </Pressable>
    </GlassSurface>
  );

  if (card.kind === 'done') {
    return shell(
      <>
        <View style={[styles.tick, { backgroundColor: palette.accentSolid }]}>
          <Text style={[styles.tickGlyph, { color: palette.onAccent }]}>✓</Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {t('home.readingDone', "Today's reading done")}
          </Text>
          <Text
            style={[styles.subtitle, { color: palette.muted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('home.khatmahDay', {
              defaultValue: 'Khatmah day {{day}} of {{total}}',
              day: card.dayNumber,
              total: card.targetDays,
            })}
            {' · '}
            {t('home.khatmahDaysToGo', {
              defaultValue: '{{count}} days to go',
              count: card.daysToGo,
            })}
          </Text>
          <ProgressBar value={card.progress} />
        </View>
        {/* Completion is worth stating plainly; "read on" keeps the door
            open without nagging. */}
        <Text style={[styles.trailingAction, { color: palette.accent }]}>
          {t('home.readOn', 'Read on')}
        </Text>
      </>,
      onOpenQuran,
      t('home.readingDone', "Today's reading done"),
    );
  }

  const lastRead = card.kind === 'start' ? null : card.lastRead;
  const continueLabel = lastRead
    ? t('home.continueAt', {
        defaultValue: 'Continue · {{surah}} {{ref}}',
        surah: surahLabel(lastRead.surah),
        ref: `${lastRead.surah}:${lastRead.ayah}`,
      })
    : t('home.startReading', 'Start reading');

  return shell(
    <>
      <QuranBookIcon color={palette.accentSolid} size={20} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {continueLabel}
        </Text>
        {card.kind === 'khatmah' ? (
          <>
            <Text
              style={[styles.subtitle, { color: palette.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t('home.khatmahDay', {
                defaultValue: 'Khatmah day {{day}} of {{total}}',
                day: card.dayNumber,
                total: card.targetDays,
              })}
              {' · '}
              {t('home.pagesLeftToday', {
                defaultValue: '{{count}} pages left today',
                count: card.pagesLeftToday,
              })}
            </Text>
            <ProgressBar value={card.progress} />
          </>
        ) : lastRead ? (
          <Text
            style={[styles.subtitle, { color: palette.muted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('home.pageNumber', {
              defaultValue: 'page {{page}}',
              page: lastRead.page ?? 1,
            })}
          </Text>
        ) : (
          <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
            {t('home.startReadingHint', 'Al-Fātiḥah, page 1')}
          </Text>
        )}
      </View>
      {/* No plan yet — a bookmark or nothing at all: the khatmah offer
          rides along as a chip rather than becoming its own empty-state
          screen. */}
      {card.kind === 'continue' || card.kind === 'start' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.startKhatmah', 'Start a khatmah')}
          onPress={onOpenQuran}
          style={[styles.chip, { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.chipLabel, { color: palette.accent }]} numberOfLines={1}>
            {t('quran.startKhatmah', 'Start a khatmah')}
          </Text>
        </Pressable>
      ) : null}
    </>,
    () =>
      lastRead
        ? onOpenAt(lastRead.surah, lastRead.page, lastRead.ayah)
        : onOpenQuran(),
    continueLabel,
  );
}

export const QuranCard = memo(QuranCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  subtitle: { fontSize: TYPE.caption.fontSize, marginTop: 1 },
  track: { height: 3, borderRadius: 2, marginTop: SPACING.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickGlyph: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  trailingAction: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full },
  chipLabel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
});
