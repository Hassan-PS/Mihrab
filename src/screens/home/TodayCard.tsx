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
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsActive } from '../../hooks/useIsActive';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import {
  cycleAlertModePatch,
  shownAlertMode,
  type PrayerAlertMode,
} from '../../settings/alertModes';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  TITLE_BAND_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../../types/prayer';
import {
  DARURI_CONFIDENCE,
  type DaruriKey,
} from '../../prayer/daruriTimes';
import type { TimingsMap } from '../../types/prayer';
import {
  addDays,
  combineLocalDateAndTime,
  countdownParts,
  eventAt,
  startOfLocalDay,
} from '../../utils/prayerTimes';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { DayStrip, type DayStripEntry } from './DayStrip';
import { isSalah, quickLogPhase, useQuickLog } from '../../journal/quickLog';
import { HeroSky } from './HeroSky';
import { HERO_Y, skyFrame, skyInkAt, skyMoment, type SkyInkColors } from './skyModel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QiblaChip } from './QiblaChip';
import { PrayerRow } from './PrayerRow';
import {
  useNextAlertOverride,
  clearNextAlertOverride,
} from '../../notifications/adhanMute';
import { clearNativeAlertOverride } from '../../native/MihrabLiveActivity';
import { ymdLocal } from '../../notifications/scheduling';
import { QiblaChipCorner } from './QiblaChip';
import { HOME_SCREEN_PADDING, HOME_TABLE_RADIUS } from './tokens';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

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
  /**
   * Qibla bearing in degrees from true north, or null when there is no
   * fix yet. Passed in rather than computed here because this card is
   * presentational and the coordinates live in settings.
   */
  qiblaBearing?: number | null;
  /** Opens the compass screen from the hero chip. */
  onOpenQibla?: () => void;
  /** Wide iPad/Mac dashboard: the hero gets more presence. */
  expanded?: boolean;
  /**
   * The phone layout: the hero runs to the top edge of the screen, under
   * the status bar, and carries the location chip and the Qibla chip in
   * its top row — the screen's own header is hidden. The day strip and
   * the rows sit on the page beneath it, not in a card.
   */
  fullBleed?: boolean;
  /** The location chip for the hero's top row, drawn in the sky's ink. */
  renderLocation?: (ink: SkyInkColors) => ReactNode;
};

/**
 * The countdown half of the hero, isolated so the clock tick re-renders one
 * small component instead of the strip and eight rows with it — the same
 * containment `NextPrayerCard` was built for.
 *
 * ── WHY IT TICKS EVERY SECOND, AND ONLY WHEN LOOKED AT ────────────────
 *
 * It used to tick every thirty, which is all minutes need. Seconds are
 * shown now, so the interval has to match them — and a second-by-second
 * setState on a tab nobody is looking at is a wake-up per second for
 * nothing. The interval exists only while this screen has focus, and the
 * clock is re-read on the way back in so the number is never stale for a
 * frame.
 */
const HeroToday = memo(function HeroToday({
  target,
  chosen,
  onExpire,
  today,
  tomorrowFajr,
  expanded,
  bleed,
  topRow,
  ownsStatusBar = false,
  statusBarInset = 0,
  fill = false,
  dateLine,
}: {
  /** What the countdown is aimed at: the next prayer, or the user's pick. */
  target: { name: string; at: Date };
  /** True when the user aimed it rather than it simply being next. */
  chosen: boolean;
  /** Called when a chosen prayer's time arrives, to hand the hero back. */
  onExpire: () => void;
  today: TimingsMap;
  /** Tomorrow's Fajr, `HH:mm`, which closes tonight's sky. */
  tomorrowFajr?: string;
  expanded: boolean;
  /**
   * Full-bleed (phone): how far the hero's padding reaches above and to
   * the sides, so the sky covers it — the top includes the status bar.
   */
  bleed?: { horizontal: number; top: number; bottom: number };
  /** The top row: location chip leading, Qibla chip trailing. */
  topRow?: { renderLocation?: (ink: SkyInkColors) => ReactNode; qibla?: ReactNode };
  /** The status bar's glyphs follow the sky while this hero is on screen. */
  ownsStatusBar?: boolean;
  /** The status bar's height, which the sky's bodies keep out of. */
  statusBarInset?: number;
  /**
   * Full-bleed: the hero grows to fill what the page leaves it, the
   * countdown block sits at its foot, and the sky's sun, moon and stars
   * are laid out in the room between the top row and that block — so
   * nothing drawn is ever under the status bar, the camera, the location
   * chip or the countdown.
   */
  fill?: boolean;
  /**
   * Today's date, Gregorian and Hijri — issue #23.
   *
   * Every other day's hero says which day it is; today's said only how
   * long until the next prayer, and the Hijri date was on the widget but
   * nowhere in the app. It goes at the foot of the hero rather than the
   * head: what someone opens this screen for is the number, and a date
   * above it would be a line to read past.
   */
  dateLine?: string;
}) {
  const { t } = useTranslation();
  const clock = useClockFormatter();
  // Focus AND foreground. `useIsFocused()` on its own kept this ticking once
  // a second in the user's pocket: backgrounding the app from the Today tab
  // leaves Today the focused route, so the timer never stopped.
  const active = useIsActive();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return undefined;
    // Immediately, not on the first interval: coming back from the background
    // the displayed countdown is as stale as the time spent away.
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const remainingSeconds = Math.max(
    0,
    Math.floor((target.at.getTime() - now.getTime()) / 1000),
  );

  // A choice that has come and gone is not a choice any more. Handing the
  // hero back is better than counting down to zero forever, or than showing
  // a prayer that is now in the past.
  useEffect(() => {
    if (chosen && remainingSeconds <= 0) onExpire();
  }, [chosen, remainingSeconds, onExpire]);

  const parts = countdownParts(remainingSeconds);

  /**
   * The sky, from the CLOCK — not from the target. Someone aiming the
   * countdown at Isha in the morning still sees the morning. Recomputed
   * once a minute (the moment is rounded to the minute) so the SVG is not
   * redrawn on every tick; a passage is hours long, so a minute is a
   * fraction of a percent of it.
   */
  const minuteKey = Math.floor(now.getTime() / 60_000);
  const frame = useMemo(
    () => skyFrame(skyMoment(today, new Date(minuteKey * 60_000), tomorrowFajr), new Date(minuteKey * 60_000)),
    [today, tomorrowFajr, minuteKey],
  );
  /**
   * The hero's ink comes from the sky, not the theme (skyModel.ts), and
   * per element: the eyebrow sits over the sky's top, the countdown over
   * its middle, the rail and the date over its foot — and at dawn those
   * three can be three different skies. The accent does not appear on the
   * hero at all; the countdown is the ink, and its size is its rank.
   */
  /**
   * In the growing hero the block is at the foot and the hero is as tall
   * as the page allows, so where each element actually sits is measured:
   * the hero's height, the top row's, the block's top and height. Until
   * the first layout — and in the card, which does not grow — the fixed
   * fractions the design was drawn at stand in.
   */
  const [heroH, setHeroH] = useState(0);
  const [topRowH, setTopRowH] = useState(0);
  const [block, setBlock] = useState<{ y: number; h: number } | null>(null);
  const onHeroLayout = useCallback((e: LayoutChangeEvent) => {
    setHeroH(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onTopRowLayout = useCallback((e: LayoutChangeEvent) => {
    setTopRowH(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onBlockLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setBlock({ y: Math.round(y), h: Math.round(height) });
  }, []);
  // The hero's box excludes the bleed, so a fraction of the SKY (which is
  // the box plus the bleed) is offset by the bleed's top.
  const bleedTop = bleed?.top ?? 0;
  const bleedBottom = bleed?.bottom ?? 0;
  const skyH = heroH + bleedTop + bleedBottom;
  const measured = fill && heroH > 0 && block !== null;
  const heroY = measured
    ? {
        eyebrow: (bleedTop + block.y) / skyH,
        countdown: (bleedTop + block.y + block.h * 0.35) / skyH,
        foot: (bleedTop + block.y + block.h) / skyH,
      }
    : HERO_Y;
  const inkTop = skyInkAt(frame, measured ? heroY.eyebrow : HERO_Y.eyebrow);
  const ink = skyInkAt(frame, measured ? heroY.countdown : HERO_Y.countdown);
  const inkFoot = skyInkAt(frame, measured ? heroY.foot : HERO_Y.foot);
  // The band the bodies keep out of: the status bar and the top row above,
  // the countdown block (and the hero's foot padding) below.
  const sceneTop = fill ? statusBarInset + topRowH + SPACING.md : 0;
  const sceneBottom = fill && block ? heroH - block.y + bleedBottom : 0;

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
    const span = target.at.getTime() - from.at.getTime();
    if (span <= 0) return null;
    const pct = Math.max(
      0,
      Math.min(1, (now.getTime() - from.at.getTime()) / span),
    );
    return { from, pct };
  }, [today, now, target.at]);

  return (
    <View
      style={[styles.hero, expanded && styles.heroExpanded, fill && styles.heroFill]}
      onLayout={fill ? onHeroLayout : undefined}>
      {/* The sky, under everything and out to the card's edges — and, on
          the phone, up under the status bar. */}
      <HeroSky
        frame={frame}
        sceneTop={sceneTop}
        sceneBottom={sceneBottom}
        bleed={
          bleed ?? {
            horizontal: SPACING.xl,
            top: expanded ? SPACING.lg + SPACING.md : SPACING.lg,
            bottom: expanded ? SPACING.lg + SPACING.md : SPACING.lg,
          }
        }
      />
      {/* The status bar sits over the sky, so its glyphs take the sky's
          ink — only while this screen is the one on show: the tabs keep
          their screens mounted, and a bar styled by an unseen hero would
          be wrong on every other tab. Unmounting hands the root's back.
          `active` (focus AND foreground) rather than `useIsFocused`, the
          same gate as the countdown, so nothing here runs in a pocket. */}
      {ownsStatusBar && active ? (
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={inkTop.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
          animated
        />
      ) : null}
      {topRow ? (
        <View style={styles.heroTopRow} onLayout={fill ? onTopRowLayout : undefined}>
          <View style={styles.heroTopLeading}>{topRow.renderLocation?.(inkTop)}</View>
          {topRow.qibla}
        </View>
      ) : null}
      {/* The room the sky's bodies move in. */}
      {fill ? <View style={styles.heroScene} /> : null}
      <View onLayout={fill ? onBlockLayout : undefined}>
      <Text
        style={[styles.heroEyebrow, { color: inkTop.muted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
        {t('home.nextPrayerIn', {
          defaultValue: '{{prayer}} in',
          prayer: t(`prayer.${target.name}`),
        })}
      </Text>
      <View style={styles.heroCountdownRow}>
        <Text
          style={[
            styles.heroCountdown,
            expanded && styles.heroCountdownExpanded,
            tabularNumeralStyle,
            { color: ink.text },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          // Clock runs are a Latin-style left-to-right unit whatever the app
          // language; iOS bidi otherwise collapses the line in Arabic.
          accessibilityLanguage="en-US">
          {parts.main}
        </Text>
        <Text
          style={[
            styles.heroSeconds,
            expanded && styles.heroSecondsExpanded,
            tabularNumeralStyle,
            { color: ink.muted },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          accessibilityLanguage="en-US">
          {parts.seconds}s
        </Text>
        <Text
          style={[styles.heroAt, tabularNumeralStyle, { color: ink.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          accessibilityLanguage="en-US">
          {clock.fromDate(target.at)}
        </Text>
      </View>
      {rail ? (
        <View style={styles.railWrap}>
          <View style={[styles.railTrack, { backgroundColor: inkFoot.track }]}>
            <View
              style={[
                styles.railFill,
                {
                  backgroundColor: inkFoot.fill,
                  width: `${Math.round(rail.pct * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.railLabels}>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: inkFoot.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t(`prayer.${rail.from.key}`)}
            </Text>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: inkFoot.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {t(`prayer.${target.name}`)}
            </Text>
          </View>
        </View>
      ) : null}
      {dateLine ? (
        <Text
          style={[styles.heroTodayDate, { color: inkFoot.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
          {dateLine}
        </Text>
      ) : null}
      </View>
    </View>
  );
});

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
  qiblaBearing,
  onOpenQibla,
  expanded = false,
  fullBleed = false,
  renderLocation,
}: TodayCardProps) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const { settings, updateSettings } = usePrayerSettings();
  const [selected, setSelected] = useState(0);
  /**
   * The prayer the user aimed the countdown at, or null for "whatever is
   * next".
   *
   * Null is not the same as pointing it at the next prayer: the next prayer
   * moves on its own, and someone who never chose should keep getting the
   * one that moves.
   */
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const rtl = isRtlLanguage(i18n.language);

  // A new city (or a fresh week of data) puts the strip back on today.
  useEffect(() => setSelected(0), [resetKey]);
  useEffect(() => setChosenKey(null), [resetKey]);
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
   * The days are PAGES under one hero.
   *
   * The card used to swap its whole body for the chosen day — the sky and
   * the countdown for a date and a "first prayer" pill — which turned the
   * one living thing on the screen into a dead panel the moment anyone
   * looked at Wednesday. Now the hero is always today, and only the table
   * under the strip turns: a paged list, one day per page, that the strip
   * selects and tracks. Swiping the rows is the gesture the carousel
   * taught; tapping a chip scrolls there.
   *
   * The pager needs the width of a page, which is the width of the table,
   * so it is measured; until it is (the first frame, and in a test
   * renderer) today's table is drawn on its own.
   */
  const [pageWidth, setPageWidth] = useState(0);
  const onTableLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setPageWidth(prev => (prev === w ? prev : w));
  }, []);
  const pagerRef = useRef<FlatList<TimingsMap>>(null);
  const scrollToDay = useCallback(
    (offset: number, animated: boolean) => {
      if (pageWidth <= 0) return;
      pagerRef.current?.scrollToIndex({ index: offset, animated });
    },
    [pageWidth],
  );
  const onPageSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      setSelected(Math.max(0, Math.min(week.length - 1, page)));
    },
    [pageWidth, week.length],
  );
  const pageLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  // Today's times, which the hero, the countdown and the check column all
  // work from whatever day the table is turned to. Memoised because the
  // aim-and-countdown memos below depend on it.
  const timings = useMemo(() => week[0] ?? {}, [week]);

  /**
   * How each row announces itself, and the tap that cycles it — v2.14.5.
   *
   * Read through `alertModeFor` rather than straight from the map: the
   * map is sparse, and an absent row means "whatever the app did before
   * this control existed", which depends on whether an adhan is chosen.
   * Writing is a merge for the same reason — one row's answer must not
   * become an answer for all five.
   */
  /**
   * The row and the master switch cannot disagree — see `shownAlertMode`
   * and `cycleAlertModePatch`, which is where the rule lives and where it
   * is tested. Both directions: off silences every row without forgetting
   * what it was, and switching a row on turns the master back on.
   */
  const alertsEnabled = settings.notificationsEnabled;
  const alertModeOf = useCallback(
    (key: string): PrayerAlertMode =>
      shownAlertMode(
        key,
        settings.prayerAlertModes,
        settings.notificationSound !== 'default',
        alertsEnabled,
      ),
    [alertsEnabled, settings.prayerAlertModes, settings.notificationSound],
  );
  const cycleAlertMode = useCallback(
    (key: string) => {
      updateSettings(
        cycleAlertModePatch(
          key,
          alertModeOf(key),
          settings.prayerAlertModes,
          alertsEnabled,
        ),
      );
    },
    [alertModeOf, alertsEnabled, settings.prayerAlertModes, updateSettings],
  );
  const visibleRows = useMemo(
    () => DISPLAY_ORDER.filter(key => timings[key]),
    [timings],
  );
  /**
   * The one occurrence the Live Activity's button has put on a different
   * alert — and which row of THIS day, if any, that is.
   *
   * Matched on the event AND the day it falls on, which is what an
   * occurrence is: silencing tonight's Ishāʾ says nothing about
   * tomorrow's, and the name alone would put the marker on both.
   *
   * The day comes from `eventAt`, the scheduler's own answer to "when
   * does this row happen" — not from the card's date. The First Third of
   * the night belongs to the evening it starts in, so at a long summer
   * latitude it sits on this card while its instant is tomorrow's; asking
   * any other way named a different occurrence than the one the alert was
   * written against, and the marker never appeared for it at all.
   *
   * It follows the occurrence onto whichever card holds it, which after
   * Ishāʾ is tomorrow's.
   */
  const override = useNextAlertOverride();
  const overrideKeyFor = useCallback(
    (offset: number, dayTimings: TimingsMap, rows: readonly string[]): string | null => {
      if (!override) return null;
      // WITH NOTIFICATIONS OFF THERE IS NOTHING TO EXPLAIN. The master
      // switch has already made every row silent, so a line promising
      // "Alert just this once" would be promising an alert that cannot
      // happen. The override is inert, not gone: turn the switch back on
      // before that instant and the line returns with it.
      if (!alertsEnabled) return null;
      const base = addDays(startOfLocalDay(new Date()), offset);
      for (const key of rows) {
        if (key !== override.name) continue;
        if (ymdLocal(eventAt(key, dayTimings, base)) !== override.date) continue;
        // AND ONLY WHEN IT STILL DIFFERS FROM THE ROW. An override is
        // written against an instant and the standing setting can move
        // under it: silence one Fajr from the card, then set the Fajr row
        // to silent here, and the two now say the same thing. Calling that
        // "just this once" would tell the reader their permanent change had
        // not taken. The card drops its own marker on the same test, and
        // the two must not disagree about whether anything is temporary.
        return override.mode === alertModeOf(key) ? null : key;
      }
      return null;
    },
    [override, alertsEnabled, alertModeOf],
  );
  /**
   * What the row is set to when nobody has overridden it — what reset
   * puts back. Read the same way the cycling control reads it, master
   * switch included, so the word this promises matches the word that
   * appears once it is pressed.
   */
  const standingModeOf = alertModeOf;
  const resetOverride = useCallback(async () => {
    // Both copies. JS holds the one the scheduler reads; native holds the
    // one the card's button labels itself from, so clearing only this
    // side would leave the button still saying "· once" for a prayer the
    // app had just put back.
    await clearNextAlertOverride();
    await clearNativeAlertOverride();
  }, []);
  /**
   * The longest time on this card, which sizes the time column on all of
   * its rows — see `timeSample` in PrayerRow.
   *
   * Length is the comparison because two times in the same locale and
   * clock format differ only in how many digits they carry — but that
   * stands in for WIDTH only while the numerals really are tabular, and
   * `fontVariant: ['tabular-nums']` is a request a font is free to
   * ignore. A row therefore falls back to its own time when this sample
   * is no longer than it (issue #26, and the long note in PrayerRow).
   */
  const timeSampleFor = useCallback(
    (dayTimings: TimingsMap, rows: readonly string[]) =>
      rows.reduce((widest, key) => {
        const shown = clock(dayTimings[key]);
        return shown.length > widest.length ? shown : widest;
      }, ''),
    [clock],
  );
  /**
   * Today's date on today's card — issue #23.
   *
   * Built from the same two callbacks the other days' hero already uses,
   * so the Gregorian half is formatted once for the whole card and the
   * Hijri half cannot drift from the one on the widget.
   */
  const todayDateLine = useMemo(() => {
    const gregorian = getDayDate(0);
    const hijri = getHijriDate?.(0);
    return hijri ? `${gregorian} · ${hijri}` : gregorian;
  }, [getDayDate, getHijriDate]);
  const handleSelect = useCallback(
    (offset: number) => {
      setSelected(offset);
      scrollToDay(offset, true);
    },
    [scrollToDay],
  );
  // A new city (or a fresh week) put the strip back on today; the pager
  // follows it there.
  useEffect(() => {
    scrollToDay(0, false);
  }, [resetKey, scrollToDay]);

  /**
   * What the hero counts down to, and which rows can be aimed at.
   *
   * Only today has either. A row is aimable only while it is still ahead —
   * counting down to a time that has passed is a negative number dressed up
   * as information — and the set is recomputed whenever the next prayer
   * changes, which is the moment one of them stops being ahead.
   */
  const now = nextInfo ? new Date() : null;
  const aimable = useMemo(() => {
    const out = new Set<string>();
    if (!now) return out;
    for (const key of visibleRows) {
      const raw = timings[key];
      if (!raw) continue;
      if (combineLocalDateAndTime(now, raw).getTime() > now.getTime()) {
        out.add(key);
      }
    }
    return out;
    // `now` is deliberately not a dependency: it is re-read on every render
    // this memo would run for anyway, and adding it would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timings, visibleRows.join(','), nextInfo?.name]);

  const target = useMemo(() => {
    if (!nextInfo) return null;
    if (!chosenKey) return nextInfo;
    const raw = timings[chosenKey];
    if (!raw) return nextInfo;
    return {
      name: chosenKey,
      at: combineLocalDateAndTime(new Date(), raw),
    };
  }, [nextInfo, chosenKey, timings]);

  /**
   * The check beside each salāh — see quickLog.ts. Today only: a tap on
   * tomorrow's Fajr has nothing to record, and yesterday is the Log's.
   */
  const quickLog = useQuickLog();
  const tomorrow = week[1];
  const logNow = new Date();

  const clearChosen = useCallback(() => setChosenKey(null), []);
  const aimAt = useCallback(
    (key: string) => setChosenKey(current => (current === key ? null : key)),
    [],
  );

  const insets = useSafeAreaInsets();
  // Full-bleed: the hero's top padding clears the status bar; the sky
  // bleeds up under it. The card chrome — radius, edge, glass — is gone:
  // the hero is a panel of the page, and the rows sit on the page.
  const heroTop = fullBleed ? insets.top + SPACING.md : SPACING.lg;
  const Outer = fullBleed ? View : GlassSurface;
  const qiblaChip =
    fullBleed && qiblaBearing != null ? (
      <QiblaChip bearing={qiblaBearing} onPress={onOpenQibla} />
    ) : null;

  /**
   * One day's table. Today's rows carry the live things — the next-prayer
   * emphasis, the aim, the alert bells, the check column; another day's
   * rows carry the times and the Mālikī boundaries and nothing that
   * pretends a tap on Thursday changes Thursday.
   */
  const renderDay = (offset: number) => {
    const dayTimings = week[offset] ?? {};
    const isToday = offset === 0;
    const rows = DISPLAY_ORDER.filter(key => dayTimings[key]);
    const overrideKey = overrideKeyFor(offset, dayTimings, rows);
    const timeSample = timeSampleFor(dayTimings, rows);
    return rows.map((key, rowIndex) => (
      <PrayerRow
        key={key}
        prayerKey={key}
        rawTime={dayTimings[key]}
        // Only today can have one — on Thursday nothing is next, and an
        // emphasis that means nothing is just decoration. It follows the
        // hero rather than the clock: see PrayerRow.
        isNext={isToday && target?.name === key}
        isChosen={isToday && chosenKey === key}
        onSelect={isToday && aimable.has(key) ? () => aimAt(key) : undefined}
        isSecondary={(OPTIONAL_TIME_KEYS as readonly string[]).includes(key)}
        isLast={rowIndex === rows.length - 1}
        // Mālikī second times (issue #19). The boundaries ride in the
        // same map under keys nothing else iterates, so a row that has
        // one shows it and every other row is unchanged.
        daruriAt={dayTimings[`${key}Daruri`]}
        daruriApprox={
          DARURI_CONFIDENCE[`${key}Daruri` as DaruriKey] === 'modelled'
        }
        // Only on today's card. On yesterday's or tomorrow's the
        // control would still change a setting for every day, which
        // is not what a tap on a past row looks like it does.
        // The bell shows what will ACTUALLY happen at this time, which
        // is the override when there is one. A row that showed the
        // standing setting while the card showed something else would
        // be the app holding two answers about one prayer — the thing
        // the alert-mode button exists to stop.
        alertMode={
          isToday
            ? overrideKey === key && override
              ? override.mode
              : alertModeOf(key)
            : undefined
        }
        onCycleAlertMode={isToday ? () => cycleAlertMode(key) : undefined}
        // Not gated on `isToday`: this one belongs to an instant, and
        // after Isha that instant is on tomorrow's card.
        overrideMode={overrideKey === key ? override?.mode : undefined}
        standingAlertMode={overrideKey === key ? standingModeOf(key) : undefined}
        onResetAlertMode={overrideKey === key ? resetOverride : undefined}
        timeSample={timeSample}
        log={
          isToday && isSalah(key)
            ? {
                status: quickLog.statusOf(key),
                phase: quickLogPhase(key, dayTimings, logNow, tomorrow),
              }
            : undefined
        }
        onToggleLog={
          isToday && isSalah(key)
            ? () => void quickLog.toggle(key, dayTimings, tomorrow)
            : undefined
        }
        hasCheckColumn={isToday}
      />
    ));
  };

  return (
    <Outer
      style={
        fullBleed
          ? styles.cardBleed
          : [styles.card, { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) }]
      }>
      {/* Full-bleed, the hero GROWS: the card fills the page and the hero
          takes whatever the table leaves, so the sky ends at the tab bar
          and the page has no band of nothing under the rows. */}
      <View
        style={[
          styles.heroWrap,
          { paddingTop: heroTop },
          fullBleed && styles.heroWrapBleed,
          { backgroundColor: palette.accentBg },
        ]}>
        {target ? (
          <HeroToday
            target={target}
            chosen={chosenKey !== null}
            onExpire={clearChosen}
            today={timings}
            tomorrowFajr={tomorrow?.Fajr}
            expanded={expanded}
            dateLine={todayDateLine}
            bleed={{ horizontal: SPACING.xl, top: heroTop, bottom: SPACING.lg }}
            statusBarInset={fullBleed ? insets.top : 0}
            fill={fullBleed}
            topRow={fullBleed ? { renderLocation, qibla: qiblaChip } : undefined}
            ownsStatusBar={fullBleed}
          />
        ) : null}
        {/* Parked in the corner rather than in the hero's own markup, and
            LAST among the wrapper's children on purpose: the eyebrow above
            the countdown is a full-width `Text`, so it overlaps the corner,
            and a later sibling wins the hit test whatever `zIndex` says. */}
        {/* Keyed on the BEARING, not on the callback: on a Mac there is
            no compass screen to open and `onOpenQibla` is undefined, but
            the bearing is trigonometry on two coordinates and is just as
            true there. The chip becomes a readout. */}
        {fullBleed ? null : (
          <QiblaChipCorner
            bearing={qiblaBearing ?? null}
            onPress={onOpenQibla}
          />
        )}
      </View>

      <View style={fullBleed ? styles.tableBleed : null}>
        <DayStrip days={days} selected={selected} onSelect={handleSelect} />

        <View onLayout={onTableLayout}>
          {pageWidth > 0 ? (
            <FlatList
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              // Seven pages, all light: mount them all so a swipe never
              // lands on a blank page mid-render.
              initialNumToRender={week.length}
              data={week}
              keyExtractor={(_, index) => String(index)}
              getItemLayout={pageLayout}
              onMomentumScrollEnd={onPageSettled}
              // Nested in the page's vertical scroll: this one owns only
              // clearly horizontal drags.
              nestedScrollEnabled
              renderItem={({ index }) => (
                <View style={{ width: pageWidth }}>{renderDay(index)}</View>
              )}
            />
          ) : (
            renderDay(0)
          )}
        </View>

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
      </View>
    </Outer>
  );
}

export const TodayCard = memo(TodayCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  // Full-bleed: no radius at the top (it meets the screen edge), the
  // page's radius at the foot where the hero becomes the page.
  // Grow to fill the page; never shrink under the content. `flex: 1`
  // would set flexBasis 0 and let a long table (extra times, the Mālikī
  // boundaries) squash the hero to nothing; with basis auto the hero keeps
  // its own height and the page scrolls the little it then has to.
  cardBleed: { overflow: 'hidden', flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  heroWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },
  heroWrapBleed: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    borderBottomStartRadius: HOME_TABLE_RADIUS,
    borderBottomEndRadius: HOME_TABLE_RADIUS,
    overflow: 'hidden',
  },
  tableBleed: { paddingHorizontal: HOME_SCREEN_PADDING },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  heroTopLeading: { flexShrink: 1, flexGrow: 1 },
  hero: {},
  heroExpanded: { paddingVertical: SPACING.md },
  heroFill: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  /** Grows; the sun and moon cross it — and gives way first when the
   *  table needs the room (the sky then hides its bodies, see HeroSky). */
  heroScene: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 },
  // Sentence case, quiet: the countdown is the thing the eye lands on and
  // the eyebrow only names what it counts to. It was an uppercase,
  // letterspaced overline — the 2016 idiom (docs/design/redesign-plan.md
  // §2.1, the `label` token).
  heroEyebrow: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '600',
  },
  heroCountdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginTop: 2,
  },
  // The question the app is opened to answer, at the size that says so.
  heroCountdown: { fontSize: 54, fontWeight: '700' }, // tokens-ok-line: display or Arabic scale, sized by hand
  heroCountdownExpanded: { fontSize: 78 }, // tokens-ok-line: display or Arabic scale, sized by hand
  // Two thirds of the "at" line's weight and a third of the countdown's
  // size: present, readable, and never the thing the eye lands on first.
  heroSeconds: { fontSize: TYPE.title2.fontSize, fontWeight: '600', marginStart: -3 },
  heroSecondsExpanded: { fontSize: 28 }, // tokens-ok-line: display or Arabic scale, sized by hand
  heroAt: { fontSize: TYPE.title3.fontSize, fontWeight: '600' },
  heroTodayDate: { fontSize: TYPE.footnote.fontSize, marginTop: SPACING.md },
  railWrap: { marginTop: SPACING.md },
  railTrack: { height: 5, borderRadius: RADIUS.xs, overflow: 'hidden' },
  railFill: { height: '100%', borderRadius: RADIUS.xs },
  railLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  railLabel: { fontSize: TYPE.label.fontSize, fontWeight: '600' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  monthChevron: { fontSize: TYPE.callout.fontSize },
});
