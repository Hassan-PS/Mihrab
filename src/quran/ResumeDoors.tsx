/**
 * The two doors back into the Qur'an — issue #41.
 *
 * One row per door, and a door only when it is true: the khatmah's next
 * page while a plan runs, and the reading marker when the reader has one
 * of their own (`selectQuranCardState` says which). Both, when both — a
 * reader who keeps a khatmah and reads Al-Kahf on Fridays has two places
 * to go back to, and until this the card offered one and called it
 * "Continue" without saying which.
 *
 * Drawn on Home's card and at the top of the Qur'an tab from this one
 * component, so the two screens cannot say different things about where
 * "Continue" leads. The shell — glass on Home, a card on the tab — is the
 * caller's; this is the rows.
 *
 * ── ONE ROW OF HEIGHT ON TODAY ────────────────────────────────────────
 *
 * Today is one screen, and the card sits under a table that fills it:
 * every point of height here is a point the hero gives up, and a second
 * door as a second ROW pushed the card under the tab bar on a phone. So
 * on Today the two doors stand side by side (`layout="columns"`), each
 * half the width — a title, a line under it — and the card is as tall
 * with two doors as with one. The Qur'an tab has the room and stacks
 * them, with the page number and the plan's bar.
 *
 * ── THE REFERENCE IS NEVER CUT ────────────────────────────────────────
 *
 * The reporter's second complaint: "some surah have long name and we
 * can't see the verse we are at". The line was one string, and the
 * ellipsis fell on its end, which is where the number was. The surah's
 * name is the part that may shrink; `2:19 · page 5` is set after it in
 * its own text and keeps its width, so the one thing the row is for is
 * the one thing that cannot disappear.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { QuranBookIcon } from '../theme/icons';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';
import { findSurah } from './quran';
import { surahName } from './surahName';
import { READING_COLOR, type LastRead } from './quranState';
import type { KhatmahTarget } from './khatmahTarget';
import { PAGE_TO_READ } from './PageProgressMark';
import type { KhatmahGap } from './quranCardState';
import type { QuranCardKhatmah, QuranCardState } from './quranCardState';

type Props = {
  state: QuranCardState;
  onOpenKhatmah: (target: KhatmahTarget) => void;
  onOpenReading: (marker: LastRead) => void;
  /** The Qur'an index — where "Start reading" and the khatmah offer go. */
  onOpenQuran: () => void;
  /**
   * Draw the way in when there is no door yet. Home wants it — the card
   * never disappears — and the Qur'an tab does not: it IS the way in.
   */
  showStart?: boolean;
  /** Two doors side by side (Today) or one under the other (the tab). */
  layout?: 'stack' | 'columns';
};

function ProgressBar({ value, color }: { value: number; color: string }) {
  const { palette } = useAppPalette();
  return (
    <View style={[styles.track, { backgroundColor: palette.controlBg }]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
          },
        ]}
      />
    </View>
  );
}

function Door({
  label,
  onPress,
  children,
  divided,
  column,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  divided?: boolean;
  /** Half the width, beside another door; the divider is then a vertical rule. */
  column?: boolean;
}) {
  const { palette } = useAppPalette();
  const rule = palette.border ?? palette.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.door,
        column && styles.column,
        divided && !column && [styles.divided, { borderTopColor: rule }],
        divided && column && [styles.dividedColumn, { borderStartColor: rule }],
        pressed && { opacity: 0.75 },
      ]}>
      {children}
    </Pressable>
  );
}

/**
 * THE PAGES LEFT BEHIND, AND THE WAY BACK TO THEM.
 *
 * A khatmah no longer stalls on a hole — reading on is credited while
 * unread pages sit behind the reader (`khatmahCreditWindow`). That is the
 * right trade, but it means the plan can reach its last page with pages
 * in it nobody read, so the hole has to say so, and saying "4 pages
 * unread on day 1" without a way there is a chore rather than an offer.
 *
 * Its own pressable, INSIDE the door: the door continues the khatmah and
 * this goes somewhere else, so one tap target could not mean both. Drawn
 * only when there is a hole, which is the uncommon case.
 */
function GapRow({
  gap,
  label,
  onPress,
}: {
  gap: KhatmahGap;
  label: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        gap.oneDay
          ? t('quran.khatmahGapOpen', {
              defaultValue: 'Read the {{count}} pages left unread on day {{day}}',
              count: gap.pages,
              day: gap.day,
            })
          : t('quran.khatmahGapOpenMany', {
              defaultValue: 'Read the {{count}} pages left unread behind you',
              count: gap.pages,
            })
      }
      hitSlop={6}
      onPress={onPress}
      style={styles.gapRow}>
      <View style={[styles.gapDot, { borderColor: PAGE_TO_READ }]} />
      <Text
        style={[styles.gapLabel, { color: PAGE_TO_READ }]}
        numberOfLines={1}>
        {/* Holes come in sets, and a set can straddle days: the count is
            every unread page behind the reader, and the day is named only
            while they all belong to it. */}
        {label}
      </Text>
      <Text style={[styles.gapGo, { color: PAGE_TO_READ }]}>
        {t('quran.khatmahGapGo', 'Go')}
      </Text>
    </Pressable>
  );
}

function KhatmahDoor({
  khatmah,
  divided,
  column,
  onPress,
  onOpenGap,
}: {
  khatmah: QuranCardKhatmah;
  divided?: boolean;
  column?: boolean;
  onPress: () => void;
  onOpenGap: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  /**
   * NOTHING AHEAD, HOLES BEHIND — the end of a khatmah read out of order.
   *
   * The plan is live (holes keep it from completing) and there is no
   * forward page, so "Continue khatmah · Today's reading done · 53 days
   * to go" would be three true-sounding things about a book that is read
   * but for two pages. The door says what is actually left and leads
   * there; the row inside it would be the same sentence twice.
   */
  const onlyGaps = khatmah.gap?.onlyLeft === true;
  const gapText = khatmah.gap
    ? khatmah.gap.oneDay
      ? t('quran.khatmahGap', {
          defaultValue: '{{count}} pages unread on day {{day}}',
          count: khatmah.gap.pages,
          day: khatmah.gap.day,
        })
      : t('quran.khatmahGapMany', {
          defaultValue: '{{count}} pages unread behind you',
          count: khatmah.gap.pages,
        })
    : '';
  const title = onlyGaps
    ? t('quran.khatmahFinishGaps', 'Finish the pages you skipped')
    : khatmah.done
      ? t('home.readingDone', "Today's reading done")
      : t('quran.continueKhatmah', 'Continue khatmah');
  const left = onlyGaps
    ? gapText
    : khatmah.done
      ? t('home.khatmahDaysToGo', {
          defaultValue: '{{count}} days to go',
          count: khatmah.daysToGo,
        })
      : t('home.pagesLeftToday', {
          defaultValue: '{{count}} pages left today',
          count: khatmah.pagesLeftToday,
        });
  return (
    <Door label={title} onPress={onPress} divided={divided} column={column}>
      {column ? null : <QuranBookIcon color={palette.accentSolid} size={20} />}
      <View style={styles.body}>
        <View style={[styles.titleRow, column && styles.titleRowColumn]}>
          {column ? <View style={[styles.dot, { backgroundColor: palette.accentSolid }]} /> : null}
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {column ? null : (
            <Text
              style={[styles.trailing, { color: palette.accent }]}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t('home.pageNumber', {
                defaultValue: 'page {{page}}',
                page: khatmah.target.page,
              })}
            </Text>
          )}
        </View>
        <Text
          style={[styles.subtitle, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {column || onlyGaps
            ? left
            : `${t('home.khatmahDay', {
                defaultValue: 'Khatmah day {{day}} of {{total}}',
                day: khatmah.dayNumber,
                total: khatmah.targetDays,
              })} · ${left}`}
        </Text>
        <ProgressBar value={khatmah.progress} color={palette.accentSolid} />
        {khatmah.gap && !onlyGaps ? (
          <GapRow gap={khatmah.gap} label={gapText} onPress={onOpenGap} />
        ) : null}
      </View>
    </Door>
  );
}

function ReadingDoor({
  marker,
  divided,
  column,
  onPress,
}: {
  marker: LastRead;
  divided?: boolean;
  column?: boolean;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const meta = findSurah(marker.surah);
  const name = meta ? surahName(meta, i18n.language) : '';
  const title = t('quran.continueReading', 'Continue reading');
  return (
    <Door
      label={`${title} · ${name} ${marker.surah}:${marker.ayah}`}
      onPress={onPress}
      divided={divided}
      column={column}>
      {column ? null : <QuranBookIcon color={READING_COLOR} size={20} />}
      <View style={styles.body}>
        <View style={[styles.titleRow, column && styles.titleRowColumn]}>
          {column ? <View style={[styles.dot, { backgroundColor: READING_COLOR }]} /> : null}
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {column ? null : (
            <Text
              style={[styles.trailing, { color: READING_COLOR }]}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t('home.pageNumber', {
                defaultValue: 'page {{page}}',
                page: marker.page,
              })}
            </Text>
          )}
        </View>
        <View style={styles.subtitleRow}>
          <Text
            style={[styles.subtitle, styles.shrinks, { color: palette.muted }]}
            numberOfLines={1}>
            {name}
          </Text>
          <Text
            style={[styles.subtitle, { color: palette.muted }]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {` · ${marker.surah}:${marker.ayah}`}
          </Text>
        </View>
      </View>
    </Door>
  );
}

function StartDoor({
  onOpenQuran,
}: {
  onOpenQuran: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const title = t('home.startReading', 'Start reading');
  return (
    <Door label={title} onPress={onOpenQuran}>
      <QuranBookIcon color={palette.accentSolid} size={20} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
          {t('home.startReadingHint', 'Al-Fātiḥah, page 1')}
        </Text>
      </View>
      <View style={[styles.chip, { backgroundColor: palette.accentBg }]}>
        <Text style={[styles.chipLabel, { color: palette.accent }]} numberOfLines={1}>
          {t('quran.startKhatmah', 'Start a khatmah')}
        </Text>
      </View>
    </Door>
  );
}

function ResumeDoorsImpl({
  state,
  onOpenKhatmah,
  onOpenReading,
  onOpenQuran,
  showStart = false,
  layout = 'stack',
}: Props) {
  const { khatmah, reading } = state;
  if (!khatmah && !reading) {
    return showStart ? <StartDoor onOpenQuran={onOpenQuran} /> : null;
  }
  // Side by side only when there are two: a lone door is a full row,
  // with its icon and its page, whichever screen it is on.
  const column = layout === 'columns' && khatmah != null && reading != null;
  const doors = (
    <>
      {khatmah ? (
        <KhatmahDoor
          khatmah={khatmah}
          column={column}
          onPress={() => onOpenKhatmah(khatmah.target)}
          // The same door, a different page: it is the plan's reading, so
          // the visit is the plan's and the done-marks are drawn.
          onOpenGap={() =>
            khatmah.gap ? onOpenKhatmah(khatmah.gap.target) : undefined
          }
        />
      ) : null}
      {reading ? (
        <ReadingDoor
          marker={reading}
          divided={khatmah != null}
          column={column}
          onPress={() => onOpenReading(reading)}
        />
      ) : null}
    </>
  );
  return column ? <View style={styles.columns}>{doors}</View> : doors;
}

export const ResumeDoors = memo(ResumeDoorsImpl);

const styles = StyleSheet.create({
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  columns: { flexDirection: 'row', alignItems: 'stretch' },
  column: { flex: 1, minWidth: 0, gap: 0, paddingHorizontal: SPACING.md },
  dividedColumn: { borderStartWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full, marginEnd: SPACING.xs },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  titleRowColumn: { alignItems: 'center', gap: 0 },
  title: { fontSize: TYPE.callout.fontSize, fontWeight: '600', flex: 1 },
  trailing: { fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  subtitleRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  subtitle: { fontSize: TYPE.caption.fontSize, marginTop: 1 },
  shrinks: { flexShrink: 1 },
  track: { height: 3, borderRadius: 2, marginTop: SPACING.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
  },
  chipLabel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  gapDot: { width: 8, height: 8, borderRadius: RADIUS.full, borderWidth: 1.5 },
  gapLabel: { fontSize: TYPE.caption.fontSize, fontWeight: '600', flexShrink: 1 },
  gapGo: { fontSize: TYPE.caption.fontSize, fontWeight: '700' },
});
