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

function KhatmahDoor({
  khatmah,
  divided,
  column,
  onPress,
}: {
  khatmah: QuranCardKhatmah;
  divided?: boolean;
  column?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const title = khatmah.done
    ? t('home.readingDone', "Today's reading done")
    : t('quran.continueKhatmah', 'Continue khatmah');
  const left = khatmah.done
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
          {column
            ? left
            : `${t('home.khatmahDay', {
                defaultValue: 'Khatmah day {{day}} of {{total}}',
                day: khatmah.dayNumber,
                total: khatmah.targetDays,
              })} · ${left}`}
        </Text>
        <ProgressBar value={khatmah.progress} color={palette.accentSolid} />
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
});
