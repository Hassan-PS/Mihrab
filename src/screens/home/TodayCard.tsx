/**
 * Home's single "today" card (design review 2a).
 *
 * Replaces four floating slabs — hero, day table, carousel dots, month link —
 * with one object, in the order a person actually reads it:
 *
 *   how long have I got  →  which day am I looking at  →  the times
 *
 * That ordering is the whole point of the change. The old hero answered the
 * wrong question (64pt "12:59", a 14pt "in 3h 24m" pill) and then the table
 * repeated the same prayer one row down; the day switcher was six 6-px dots
 * wedged between two cards, which nobody swipes because they cannot see its
 * edge.
 *
 * The hero adapts rather than lies: a countdown only means something for
 * today, so on any other day that slot becomes the date, the hijri date and
 * the day's first prayer — same position, honest content. For the same
 * reason the next-prayer highlight and its rail appear only on today; on
 * Saturday nothing is next, so nothing is emphasised.
 *
 * Both gestures drive one selection: tap a chip, or swipe the card body the
 * way the carousel used to work.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  TITLE_BAND_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../../types/prayer';
import type { TimingsMap } from '../../types/prayer';
import {
  combineLocalDateAndTime,
  formatCountdown,
  formatDisplayTime,
  formatLocalTime,
} from '../../utils/prayerTimes';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { DayStrip, type DayStripEntry } from './DayStrip';
import { PrayerRow } from './PrayerRow';
import { HOME_TABLE_RADIUS } from './tokens';

/** The five salāh — the only rows a "first prayer of the day" can name. */
const SALAH_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

export type TodayCardProps = {
  /** Today first, then the next six days. */
  week: TimingsMap[];
  nextInfo: { name: string; at: Date } | null;
  /** Changing this returns the strip to today (e.g. the user moved city). */
  resetKey: string;
  getDayLabel: (dayOffset: number) => string;
  getDayDate: (dayOffset: number) => string;
  getHijriDate?: (dayOffset: number) => string;
  /** Two-letter weekday for the strip chips. */
  getDayShort: (dayOffset: number) => string;
  /** Day of month for the strip chips. */
  getDayNumber: (dayOffset: number) => string;
  onOpenMonth?: () => void;
  /** Data-freshness whisper under the hero. */
  dataStatus?: { lastFetchedAt: Date | null; totalDaysCached: number } | null;
  /** Wide iPad/Mac dashboard: the hero gets more presence. */
  expanded?: boolean;
};

/**
 * The countdown half of the hero, isolated so the 30-second clock tick
 * re-renders one small component instead of the strip and eight rows with
 * it — the same containment `NextPrayerCard` was built for.
 */
const HeroToday = memo(function HeroToday({
  nextInfo,
  today,
  expanded,
}: {
  nextInfo: { name: string; at: Date };
  today: TimingsMap;
  expanded: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const remainingSeconds = Math.max(
    0,
    Math.floor((nextInfo.at.getTime() - now.getTime()) / 1000),
  );

  /**
   * The rail measures the CURRENT interval — from the prayer that has most
   * recently passed to the one being counted down to. Without a previous
   * time to anchor it (before Fajr, or when the day's earlier entries are
   * hidden by the optional-times toggles) there is no interval to be a
   * fraction of, so the rail is simply not drawn.
   */
  const rail = useMemo(() => {
    const passed = DISPLAY_ORDER.map(key => ({
      key,
      raw: today[key],
    }))
      .filter(e => e.raw)
      .map(e => ({ key: e.key, at: combineLocalDateAndTime(now, e.raw) }))
      .filter(e => e.at.getTime() <= now.getTime());
    const from = passed[passed.length - 1];
    if (!from) return null;
    const span = nextInfo.at.getTime() - from.at.getTime();
    if (span <= 0) return null;
    const pct = Math.max(
      0,
      Math.min(1, (now.getTime() - from.at.getTime()) / span),
    );
    return { from, pct };
  }, [today, now, nextInfo.at]);

  return (
    <View style={[styles.hero, expanded && styles.heroExpanded]}>
      <Text
        style={[styles.heroEyebrow, { color: palette.accent }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
        {t('home.nextPrayerIn', {
          defaultValue: '{{prayer}} in',
          prayer: t(`prayer.${nextInfo.name}`),
        })}
      </Text>
      <View style={styles.heroCountdownRow}>
        <Text
          style={[
            styles.heroCountdown,
            expanded && styles.heroCountdownExpanded,
            tabularNumeralStyle,
            { color: palette.accent },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          // Clock runs are a Latin-style left-to-right unit whatever the app
          // language; iOS bidi otherwise collapses the line in Arabic.
          accessibilityLanguage="en-US">
          {formatCountdown(remainingSeconds)}
        </Text>
        <Text
          style={[styles.heroAt, tabularNumeralStyle, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          accessibilityLanguage="en-US">
          {formatLocalTime(nextInfo.at)}
        </Text>
      </View>
      {rail ? (
        <View style={styles.railWrap}>
          <View style={[styles.railTrack, { backgroundColor: palette.controlBg }]}>
            <View
              style={[
                styles.railFill,
                {
                  backgroundColor: palette.accentSolid,
                  width: `${Math.round(rail.pct * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.railLabels}>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: palette.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t(`prayer.${rail.from.key}`)}
            </Text>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: palette.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t(`prayer.${nextInfo.name}`)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

/** The hero on any day that is not today: date, hijri date, first prayer. */
function HeroOtherDay({
  label,
  date,
  hijri,
  timings,
}: {
  label: string;
  date: string;
  hijri?: string;
  timings: TimingsMap;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const first = SALAH_ORDER.find(key => timings[key]);
  return (
    <View style={styles.hero}>
      <Text
        style={[styles.heroEyebrow, { color: palette.muted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
        {label}
      </Text>
      <Text
        style={[styles.heroDate, { color: palette.text }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
        {date}
      </Text>
      {hijri ? (
        <Text
          style={[styles.heroHijri, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
          {hijri}
        </Text>
      ) : null}
      {first ? (
        <View style={[styles.firstPill, { backgroundColor: palette.controlBg }]}>
          <Text
            style={[styles.firstPillText, { color: palette.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('home.firstPrayer', {
              defaultValue: 'First prayer {{prayer}} · {{time}}',
              prayer: t(`prayer.${first}`),
              time: formatDisplayTime(timings[first]),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TodayCardImpl({
  week,
  nextInfo,
  resetKey,
  getDayLabel,
  getDayDate,
  getHijriDate,
  getDayShort,
  getDayNumber,
  onOpenMonth,
  dataStatus,
  expanded = false,
}: TodayCardProps) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const [selected, setSelected] = useState(0);
  const rtl = isRtlLanguage(i18n.language);

  // A new city (or a fresh week of data) puts the strip back on today.
  useEffect(() => setSelected(0), [resetKey]);
  // Never leave the selection pointing past the end of a shorter week.
  useEffect(() => {
    setSelected(s => (s < week.length ? s : 0));
  }, [week.length]);

  const days: DayStripEntry[] = useMemo(
    () =>
      week.map((_, offset) => ({
        offset,
        dow: getDayShort(offset),
        dom: getDayNumber(offset),
        a11yLabel: `${getDayLabel(offset)} — ${getDayDate(offset)}`,
      })),
    [week, getDayShort, getDayNumber, getDayLabel, getDayDate],
  );

  /**
   * Swiping the card body still turns the day, because that is the gesture
   * the carousel taught. It is a PanResponder rather than a paged ScrollView:
   * the hero and the rows both change with the day but the strip between them
   * does not, and a pager cannot hold two non-adjacent slices of one card.
   * The responder only claims clearly horizontal drags, so the vertical
   * scroll of the page underneath is untouched.
   */
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lengthRef = useRef(week.length);
  lengthRef.current = week.length;
  const rtlRef = useRef(rtl);
  rtlRef.current = rtl;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < 40) return;
          // Dragging leftward advances in LTR and goes back in RTL, matching
          // the direction the strip itself runs.
          const forward = rtlRef.current ? g.dx > 0 : g.dx < 0;
          const next = selectedRef.current + (forward ? 1 : -1);
          if (next < 0 || next >= lengthRef.current) return;
          setSelected(next);
        },
      }),
    [],
  );

  const timings = week[selected] ?? week[0] ?? {};
  const isToday = selected === 0;
  const visibleRows = DISPLAY_ORDER.filter(key => timings[key]);
  const handleSelect = useCallback((offset: number) => setSelected(offset), []);

  return (
    <GlassSurface
      style={[
        styles.card,
        { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) },
      ]}
      {...pan.panHandlers}>
      <View
        style={[
          styles.heroWrap,
          {
            backgroundColor: isToday ? palette.accentBg : 'transparent',
          },
        ]}>
        {isToday && nextInfo ? (
          <HeroToday nextInfo={nextInfo} today={timings} expanded={expanded} />
        ) : (
          <HeroOtherDay
            label={getDayLabel(selected)}
            date={getDayDate(selected)}
            hijri={getHijriDate?.(selected)}
            timings={timings}
          />
        )}
        {isToday && dataStatus && dataStatus.totalDaysCached > 0 ? (
          <Text
            style={[styles.dataStatus, { color: palette.muted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {(dataStatus.lastFetchedAt
              ? t('home.updatedAt', {
                  // LTR isolate: a Latin-digit run inside a possibly-RTL
                  // sentence scrambles without it.
                  when: `⁦${formatLocalTime(dataStatus.lastFetchedAt)}⁩`,
                }) + ' · '
              : '') +
              t('home.daysStored', { count: dataStatus.totalDaysCached })}
          </Text>
        ) : null}
      </View>

      <DayStrip days={days} selected={selected} onSelect={handleSelect} />

      {visibleRows.map((key, rowIndex) => (
        <PrayerRow
          key={key}
          prayerKey={key}
          rawTime={timings[key]}
          // Only today can have a "next" — on Thursday nothing is next, and
          // an emphasis that means nothing is just decoration.
          isNext={isToday && nextInfo?.name === key}
          isSecondary={(OPTIONAL_TIME_KEYS as readonly string[]).includes(key)}
          isLast={rowIndex === visibleRows.length - 1}
        />
      ))}

      {onOpenMonth ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.monthTimesLink')}
          accessibilityHint={t('a11y.openMonth')}
          onPress={onOpenMonth}
          style={[
            styles.monthRow,
            { borderTopColor: palette.border ?? palette.muted },
          ]}>
          <Text
            style={[styles.monthLabel, { color: palette.accent }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
            {t('home.monthTimesLink')}
          </Text>
          <Text style={[styles.monthChevron, { color: palette.accent }]}>
            {rtl ? '←' : '→'}
          </Text>
        </Pressable>
      ) : null}
    </GlassSurface>
  );
}

export const TodayCard = memo(TodayCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  heroWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  hero: {},
  heroExpanded: { paddingVertical: 10 },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroCountdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
  },
  // The question the app is opened to answer, at the size that says so.
  heroCountdown: { fontSize: 54, fontWeight: '700' },
  heroCountdownExpanded: { fontSize: 78 },
  heroAt: { fontSize: 17, fontWeight: '600' },
  heroDate: { fontSize: 34, fontWeight: '700', marginTop: 2 },
  heroHijri: { fontSize: 14, marginTop: 2 },
  firstPill: {
    marginTop: 13,
    alignSelf: 'flex-start',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
  },
  firstPillText: { fontSize: 13, fontWeight: '600' },
  railWrap: { marginTop: 11 },
  railTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  railFill: { height: '100%', borderRadius: 3 },
  railLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  railLabel: { fontSize: 11.5, fontWeight: '600' },
  dataStatus: { marginTop: 10, fontSize: 11, fontWeight: '500' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: { fontSize: 13.5, fontWeight: '600' },
  monthChevron: { fontSize: 15 },
});
