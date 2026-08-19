/**
 * Every week you have ever logged, two facts per square (design review 2c).
 *
 * Prayers and fasting are the same act — recording what you did today — and
 * they were split across two screens with two visual languages. One graph
 * carries both: FILL DEPTH is prayers logged (0→5), an INSET RING is the
 * fast. They never collide because they use different channels, so either
 * can be read alone or both at once; a second grid would have doubled the
 * screen for half the insight.
 *
 * The ring rather than another colour step, because fasting is not "more
 * prayer" — it is a different axis, and it cannot be another rung on the
 * green ramp. An outline reads as a distinct category, and the two amber
 * days a week (Mondays and Thursdays) show up as a rhythm rather than noise.
 *
 * Rows are weekdays, so a habit that fails on Fridays — or a Ramadan block —
 * reads as a shape.
 *
 * IT SCROLLS, and it reaches the first day you ever logged. It used to be
 * thirteen fixed weeks, defended on the grounds that "a hard month scrolls
 * out of view rather than standing as a monument". That reasoning protected
 * the user from their own record and took the record with it: a year in,
 * every square earned before April was simply gone, with no way back to it.
 * Ownership of the data wins — you can always look away from a graph, but
 * you cannot look at one that was never drawn. The grid now runs from the
 * Monday of the earliest entry to this week, and opens parked on today, so
 * the default view is still the recent one.
 *
 * An empty square is warm paper, never grey: the GitHub reading of
 * "empty = failure" is not a judgement this app should make about a
 * religious practice.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import type { DayScore } from '../journal/journal';
import {
  dayAt,
  ringSegments,
  sunnahFraction,
  type SunnahLog,
} from '../journal/sunnah';
import { QIYAM_MARK, sunnahGold } from './sunnahTheme';
import { dayKey } from './practiceStore';
import {
  maxOffset,
  offsetAfterGrowth,
  shouldLoadOlder,
  todayOffset,
} from './heatmapScroll';

/**
 * The SHORTEST the graph is ever drawn. Thirteen ≈ a quarter and fits the
 * narrowest phone without scrolling, so a new user with three days of
 * history still sees a graph rather than a stub. Past that it grows.
 */
export const HEATMAP_WEEKS = 13;
/**
 * 18, not 15. The square was carrying four signals — fill depth for prayers
 * kept, a 2pt border for fasting, a red corner dot for a missed prayer, and a
 * second border for selection — and sunnah logging adds a gold ring and a
 * qiyam mark. At 15pt, with the fast border eating 2pt off every edge, six
 * signals is an unreadable speck. The graph scrolls, so width is the cheapest
 * thing here; three points buys the ring somewhere to live.
 */
const SQUARE = 18;
const GAP = 4;
/** One week column, including the gap that follows it. */
const COL = SQUARE + GAP;
/** Height of the month-label strip above the grid. */
const MONTH_ROW = 15;
/** Amber, for the fast ring — the app's own amber accent swatch. */
const FAST_RING_LIGHT = '#B45309';
const FAST_RING_DARK = '#FBBF24';
/**
 * The border a square carries when it is fasted or selected.
 *
 * One constant because both are the same width and only one is ever drawn —
 * and because everything drawn INSIDE the square has to know about it. An
 * absolutely-positioned child is laid out against its parent's PADDING box,
 * not its border box, so a bordered square silently moves its own origin
 * inward by this much: a mark at `top: 2.5` lands 4.5 from the outer edge on
 * a fasted day and 2.5 on an ordinary one, and a 13pt side that fits an 18pt
 * square runs off the end of a 14pt one. Every inset below is written as the
 * distance from the OUTER edge and corrected by `insetFor`.
 */
const SQUARE_BORDER = 2;

/**
 * The empty day: the palest step of the SAME hue as the rest of the ramp.
 *
 * Low enough to read as "nothing here", high enough to sit in the same
 * sequential scale as the five above it. It gets a hairline ring as well —
 * no tint this pale clears the 2:1 contrast floor against a white card, and
 * a grid whose empty cells vanish in sunlight is a grid with no shape.
 */
const EMPTY_TINT = 0.1;
const EMPTY_RING_TINT = 0.22;

/**
 * The sunnah line: same idea as the fasting ring, one step inside it.
 *
 * `INSET` clears the fasting border (2pt, drawn inside the square by RN) with
 * half a point to spare, so the two never touch and never read as one thick
 * rim. `LINE` is thinner than the fast ring's 2pt on purpose — the outer ring
 * is a yes/no and should stay the louder of the two; this one is a quantity.
 */
const SUNNAH_INSET = 2.5;
const SUNNAH_LINE = 1.5;
/** The length of one side of the inset square the line travels round. */
const SUNNAH_SIDE = SQUARE - SUNNAH_INSET * 2;

/**
 * The corner dots, and how far in they sit.
 *
 * Far enough to clear BOTH rings: the fasting border ends at 2, the sunnah
 * line at `SUNNAH_INSET + SUNNAH_LINE` = 4. Half a point past that keeps a
 * dot on clean fill on any day, however many marks it carries.
 */
const DOT = 4;
const DOT_INSET = SUNNAH_INSET + SUNNAH_LINE + 0.5;

/**
 * An inset measured from the square's outer edge, expressed in the
 * coordinates its children are actually laid out in. See `SQUARE_BORDER`.
 */
function insetFor(outer: number, border: number): number {
  return outer - border;
}

/**
 * The ring and the two dots, for a square with a border and one without.
 *
 * Precomputed rather than built per square: those are the only two cases
 * there are, and the grid draws every square of every week at once — years
 * of them — so allocating three style objects per day is a cost with nothing
 * to show for it.
 */
function markStyles(border: number) {
  const ring = insetFor(SUNNAH_INSET, border);
  const dot = insetFor(DOT_INSET, border);
  const mark = {
    position: 'absolute' as const,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  };
  return {
    /**
     * A complete day's line, closed. Same inset and thickness as the
     * segments it replaces, so nothing shifts as the last sunnah goes in.
     */
    ring: {
      position: 'absolute' as const,
      top: ring,
      left: ring,
      right: ring,
      bottom: ring,
      borderWidth: SUNNAH_LINE,
    },
    /**
     * The owed-prayer mark, and the night-prayer mark opposite it: a dot
     * each, rather than another border or another colour ramp. Both of those
     * channels are spent — the fast ring, the sunnah line, the score depth —
     * and a fourth competing for the same edges would make a day that is
     * fasted, missed and prayed through unreadable.
     *
     * BOTH DOTS SIT INSIDE BOTH LINES. They used to be inset 1.5, which put
     * them under the fasting border and across the sunnah line — three marks
     * fighting for the same few points of edge, so on a day carrying all of
     * them you could not tell which was which. `DOT_INSET` clears the
     * fasting ring and the sunnah line together, so a dot is always drawn on
     * clean fill whatever else the day holds. The dots shrank to pay for it.
     */
    missed: { ...mark, top: dot, insetInlineEnd: dot },
    /** The corner opposite, so a night holding both is two marks not one. */
    qiyam: { ...mark, bottom: dot, insetInlineStart: dot },
  };
}

const MARKS_PLAIN = markStyles(0);
const MARKS_BORDERED = markStyles(SQUARE_BORDER);

/**
 * One drawn side of that line: `i` is 0…3 clockwise from the top-left, `len`
 * is how much of that side is covered (0…1).
 *
 * Lengths are computed in points rather than percentages because a percentage
 * would resolve against the SQUARE, not against the inset box the line
 * actually travels round, and every segment would overshoot by the inset.
 *
 * Geometric `left`/`right` rather than `insetInlineStart`/`End`: this is a
 * clock hand, and a clock does not run backwards in Arabic.
 */
function sunnahSegment(i: number, len: number, border: number): ViewStyle {
  const run = Math.max(0, Math.min(1, len)) * SUNNAH_SIDE;
  const at = insetFor(SUNNAH_INSET, border);
  const base = { position: 'absolute' as const };
  switch (i) {
    case 0: // top, left → right
      return { ...base, top: at, left: at, width: run, height: SUNNAH_LINE };
    case 1: // right, top → bottom
      return { ...base, top: at, right: at, width: SUNNAH_LINE, height: run };
    case 2: // bottom, right → left
      return {
        ...base,
        bottom: at,
        right: at,
        width: run,
        height: SUNNAH_LINE,
      };
    default: // left, bottom → top
      return {
        ...base,
        bottom: at,
        left: at,
        width: SUNNAH_LINE,
        height: run,
      };
  }
}

export type HeatmapDay = {
  key: string;
  /** 0…5, weighted by status — see `STATUS_WEIGHT`. Drives the fill depth. */
  kept: number;
  /** How many of the five carry any entry, whatever it says. */
  logged: number;
  /** How many were marked `missed` — drives the corner mark. */
  missed: number;
  fasted: boolean;
  /** 0…1 — how far the gold line has travelled round the square. */
  sunnah: number;
  /** Any Qiyam al-Layl that night — drives the mark in the corner. */
  qiyam: boolean;
  /** Days after today inside the trailing week — drawn as blanks. */
  future: boolean;
};

/** Noon-anchored, so adding days never lands on a DST hour that doesn't exist. */
function atNoon(d: Date): Date {
  const out = new Date(d);
  out.setHours(12, 0, 0, 0);
  return out;
}

/** The Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const out = atNoon(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How many week columns are needed to reach back to `earliest`.
 *
 * Never fewer than `HEATMAP_WEEKS`, so the graph keeps its shape on a fresh
 * install. A key that cannot be parsed — or one in the future, which no
 * honest log has — falls back to the minimum rather than producing a grid of
 * unknown size.
 */
export function weeksToCover(
  earliest: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!earliest) return HEATMAP_WEEKS;
  const first = parseDayKey(earliest);
  if (!first) return HEATMAP_WEEKS;
  const from = mondayOf(first);
  const to = mondayOf(now);
  const weeks =
    Math.round((to.getTime() - from.getTime()) / (7 * 86400000)) + 1;
  return Math.max(HEATMAP_WEEKS, weeks);
}

/**
 * `weeks` weeks ending with the week that contains today, as weekday rows.
 * Weeks start on Monday so the two sunnah fast days sit in the first and
 * fourth rows rather than being split across a boundary.
 */
export function buildHeatmap(
  scoreByDay: Map<string, DayScore>,
  fastedDays: Set<string>,
  now: Date = new Date(),
  weeks: number = HEATMAP_WEEKS,
  /**
   * Optional so the existing callers and every test that predates sunnah
   * logging keep working unchanged — an absent log simply draws no gold.
   */
  sunnahLog: SunnahLog = {},
): HeatmapDay[][] {
  const today = atNoon(now);
  const span = Math.max(1, Math.floor(weeks));
  const start = mondayOf(today);
  start.setDate(start.getDate() - (span - 1) * 7);

  const rows: HeatmapDay[][] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const row: HeatmapDay[] = [];
    for (let week = 0; week < span; week++) {
      const d = new Date(start);
      d.setDate(start.getDate() + week * 7 + weekday);
      const key = dayKey(d);
      const score = scoreByDay.get(key);
      const sun = dayAt(sunnahLog, key);
      row.push({
        key,
        kept: score?.kept ?? 0,
        logged: score?.logged ?? 0,
        missed: score?.missed ?? 0,
        fasted: fastedDays.has(key),
        sunnah: sunnahFraction(sun),
        qiyam: sun.qiyam > 0,
        future: d.getTime() > today.getTime(),
      });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * One label per week column, blank unless the column opens a new month.
 *
 * Without these, scrolling two years back is a featureless field of squares
 * — you can reach the past but you cannot tell where you have landed.
 */
export function monthLabelsFor(rows: HeatmapDay[][], locale: string): string[] {
  const mondays = rows[0] ?? [];
  let previous = -1;
  return mondays.map((cell, i) => {
    const d = parseDayKey(cell.key);
    if (!d) return '';
    const month = d.getMonth();
    if (month === previous) return '';
    previous = month;
    // The first column usually sits mid-month; labelling it would put a name
    // over a week that mostly belongs to the month before.
    if (i === 0) return '';
    const name = d.toLocaleDateString(locale, { month: 'short' });
    // January carries the year, so scrolling back years stays legible.
    return month === 0 ? `${name} ${d.getFullYear()}` : name;
  });
}

/** Hex with an alpha suffix — the green ramp is one colour at five depths. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

type Props = {
  rows: HeatmapDay[][];
  /** Weekday initials, already localised, Monday first. */
  weekdayLabels: string[];
  caption?: string;
  /** The day the Log is currently showing, drawn lifted out of the grid. */
  selectedKey?: string;
  /**
   * When set, only these days are drawn at full strength — everything else
   * drops back. Emphasis rather than a seventh permanent encoding: the
   * missed dot is 4pt on an 18pt square, and a day that went four-of-five is
   * a strong green square that camouflages it. This is how you FIND them.
   */
  emphasise?: Set<string>;
  /** Tapping a square opens that day. Omit to keep the graph read-only. */
  onSelectDay?: (key: string) => void;
  /**
   * The view has reached the oldest column drawn. The owner answers by
   * handing back more weeks; the graph keeps the dates under the viewport
   * where they were, so the user carries on dragging into the new ones.
   */
  onReachOldest?: () => void;
  /** Hides the legend and the caption, for the small copy on Home. */
  compact?: boolean;
};

function PracticeHeatmapImpl({
  rows,
  weekdayLabels,
  emphasise,
  caption,
  selectedKey,
  onSelectDay,
  onReachOldest,
  compact,
}: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const ring = palette.isDark ? FAST_RING_DARK : FAST_RING_LIGHT;
  const gold = sunnahGold(palette.isDark);
  const accent = palette.accentSolid;

  const legend = useMemo(() => [0, 1, 3, 5], []);

  /**
   * What a square is filled with.
   *
   *   nothing recorded  → warm paper, as before
   *   recorded, none kept → the danger tone at a low alpha
   *   otherwise → the green ramp, by WEIGHTED score
   *
   * The middle case is the whole point of the change. Depth used to come
   * from the number of entries, so five prayers marked missed drew the
   * darkest green on the graph — the app congratulating someone for a day
   * they had just told it went badly. A missed day is not blank either:
   * the user did the work of recording it, and blanking it would lose the
   * difference between a day that went wrong and a day nobody opened the
   * app on. It is a mark, in a colour that is not the colour of success.
   */
  /**
   * The depth ramp, measured rather than judged.
   *
   * Two things were wrong, and a contrast/CVD validator found both:
   *
   * THE EMPTY DAY WAS THE WRONG HUE. It used `controlBg`, a warm cream, while
   * every other step is green — so across the whole ramp the hue swung 83°,
   * which is not a sequential scale at all but a hue jump followed by one.
   * An empty day is the ZERO of this scale, not a different kind of thing, so
   * it is now the palest step of the same green. Hue spread: 10°.
   *
   * THE FIRST STEP WAS BELOW THE CONTRAST FLOOR. A one-prayer day sat at
   * 1.93:1 against the card — under the 2:1 minimum, which is the difference
   * between "a faint square" and "no square" in sunlight. Starting the ramp
   * at 0.42 instead of 0.36 alpha puts it at 2.15:1.
   *
   * An empty cell cannot clear 2:1 against a white card at any lightness that
   * still reads as empty, so it takes a hairline ring instead — secondary
   * encoding, which is also what makes the grid survive a bright screen.
   */
  const fillFor = (day: HeatmapDay) => {
    if (day.future) return 'transparent';
    if (day.kept > 0) return withAlpha(accent, 0.42 + 0.58 * (day.kept / 5));
    if (day.logged > 0) return withAlpha(String(palette.danger), 0.3);
    return withAlpha(accent, EMPTY_TINT);
  };
  const weeks = rows[0]?.length ?? 0;
  const months = useMemo(
    () => monthLabelsFor(rows, i18n.language),
    [rows, i18n.language],
  );

  /**
   * Open on today, not on the oldest week.
   *
   * Keyed on the column count rather than run on every content-size change:
   * the grid re-measures whenever a square is tapped or a status changes, and
   * yanking the view back to today each time would make scrolling back
   * impossible — you would be dragged to the present the moment you logged
   * anything.
   */
  const scrollRef = useRef<ScrollView>(null);
  const parked = useRef(false);
  const drawnWeeks = useRef(0);
  const offset = useRef(0);
  const asking = useRef(false);
  /**
   * The two numbers the direction logic needs, kept from the last layout and
   * content measurement. `onScroll` carries its own copies, so these only
   * have to be good enough to park with.
   */
  const contentWidth = useRef(0);
  const viewportWidth = useRef(0);
  const rtl = I18nManager.isRTL;

  /**
   * Park on today. NOT `scrollToEnd` — the end of the content is the end of
   * the writing direction only in Latin; in Arabic it is the oldest week the
   * user has, which is where the graph used to open.
   */
  const parkOnToday = () => {
    const max = maxOffset(contentWidth.current, viewportWidth.current);
    scrollRef.current?.scrollTo({ x: todayOffset(rtl, max), animated: false });
  };

  const onSized = () => {
    if (weeks === 0) return;
    if (!parked.current) {
      // Nothing to park against until the row has been measured, and
      // parking against a width of zero would claim the graph is settled
      // while it is still standing on week one. The content-size callback
      // comes back for us.
      if (contentWidth.current <= 0) return;
      parked.current = true;
      drawnWeeks.current = weeks;
      parkOnToday();
      return;
    }
    if (weeks === drawnWeeks.current) return;
    const added = weeks - drawnWeeks.current;
    drawnWeeks.current = weeks;
    if (added > 0 && asking.current) {
      /**
       * Columns were added at the OLD end BECAUSE THE USER DRAGGED THERE.
       * In Latin that end is the left, so the growth pushes everything they
       * were looking at to the right by exactly that many columns and the
       * view lurches forwards in time — the one thing they were dragging
       * away from. `offsetAfterGrowth` puts the dates back under the thumb,
       * and knows that in Arabic the past is the other way and the answer is
       * to hold still.
       */
      scrollRef.current?.scrollTo({
        x: offsetAfterGrowth(rtl, offset.current, added, COL),
        animated: false,
      });
      asking.current = false;
      return;
    }
    /**
     * The grid changed size for a reason that was NOT a load-more: the
     * encrypted journal finished hydrating and the history turned out to be
     * longer than the thirteen-week default, or a day was logged outside
     * the drawn span.
     *
     * This used to take the branch above and shove the view sideways by the
     * difference. Hydration lands a beat after the screen appears — which
     * is exactly when the user's first drag arrives — so the first attempt
     * to scroll got yanked out from under the thumb, felt like lag, and
     * often ended somewhere the user did not ask for. Re-park instead:
     * nobody has scrolled anywhere yet, so today is still the right place
     * to be.
     */
    parkOnToday();
  };
  useEffect(() => {
    if (parked.current) return;
    onSized();
    // Cold mount: the content has no width yet when the effect first runs,
    // so `onContentSizeChange` is the path that usually wins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  return (
    <View>
      <View style={styles.grid}>
        <View style={styles.labels}>
          {/* Clears the month strip, so weekday initials line up with rows. */}
          <View style={styles.monthSpacer} />
          {weekdayLabels.map((label, i) => (
            <View key={i} style={styles.labelCell}>
              {/* Every other row, so the column stays quiet. */}
              {i % 2 === 0 ? (
                <Text
                  style={[styles.labelText, { color: palette.muted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                >
                  {label}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={w => {
            contentWidth.current = w;
            onSized();
          }}
          // The viewport width is half of what tells the graph which end of
          // the content it is standing at, and in Arabic that is the half
          // that decides whether "here" is today or two years ago.
          onLayout={e => {
            viewportWidth.current = e.nativeEvent.layout.width;
          }}
          scrollEventThrottle={64}
          // Diagonal drags belong to the page, not to the graph. Without
          // this a mostly-vertical swipe that starts on the grid drags the
          // weeks a few pixels sideways and stutters the page scroll, which
          // is most of what "the first attempt is laggy" was.
          directionalLockEnabled
          // Android: let this scroll inside the page's scroll rather than
          // making the parent fight it for every gesture.
          nestedScrollEnabled
          onScroll={e => {
            const { contentOffset, contentSize, layoutMeasurement } =
              e.nativeEvent;
            offset.current = contentOffset.x;
            contentWidth.current = contentSize.width;
            viewportWidth.current = layoutMeasurement.width;
            // Nothing is asked for until the initial park has happened. The
            // offset before that is 0, which looks exactly like "the user
            // has dragged to the oldest week" and used to fire a load-more
            // during mount — twenty-six more columns arriving underneath
            // the first drag.
            if (!parked.current || !onReachOldest) return;
            // Which end of the content the oldest week is on is the whole
            // question in Arabic, where it is the far one rather than 0.
            if (
              !shouldLoadOlder({
                rtl,
                offset: contentOffset.x,
                contentWidth: contentSize.width,
                viewportWidth: layoutMeasurement.width,
                columnWidth: COL,
              })
            ) {
              return;
            }
            if (asking.current) return;
            asking.current = true;
            onReachOldest();
          }}
          contentContainerStyle={styles.scrollBody}
        >
          <View>
            <View style={styles.monthRow}>
              {months.map((label, i) => (
                <View key={i} style={styles.monthCell}>
                  {label ? (
                    <Text
                      style={[styles.monthText, { color: palette.muted }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.weeks}>
              {rows.map((row, r) => (
                <View key={r} style={styles.week}>
                  {row.map(day => {
                    const selected = !day.future && day.key === selectedKey;
                    // A bordered square lays its children out 2pt further
                    // in than a bare one, so every mark drawn inside has to
                    // know which it is. See `SQUARE_BORDER`.
                    const border = selected || day.fasted ? SQUARE_BORDER : 0;
                    /**
                     * A day carrying nothing at all — no prayers, no sunnah,
                     * no fast, no qiyam. Only these get the empty-cell edge:
                     * a border shifts every absolutely-positioned mark
                     * inside the square, so a day with a mark must not have
                     * one added underneath it.
                     */
                    /**
                     * Emphasis: dim everything that is not being looked for.
                     *
                     * Two exemptions, and both are about what the mark MEANS
                     * rather than how loud it is. A future day is not a day
                     * that failed the filter, it is a day that has not
                     * happened. And the selected square is not data at all —
                     * it is where you are — so dimming it takes away the one
                     * fixed point on the grid at exactly the moment the rest
                     * of it has gone quiet.
                     */
                    const muted =
                      emphasise !== undefined &&
                      !emphasise.has(day.key) &&
                      !day.future &&
                      !selected;
                    const bare =
                      !day.future &&
                      day.logged === 0 &&
                      day.kept === 0 &&
                      day.missed === 0 &&
                      day.sunnah === 0 &&
                      !day.fasted &&
                      !day.qiyam;
                    const marks = border ? MARKS_BORDERED : MARKS_PLAIN;
                    return (
                      <Pressable
                        key={day.key}
                        // The day itself, so a square can be addressed by
                        // date from a test or a maestro flow — otherwise the
                        // only handle on a cell is its position in a grid
                        // whose size now depends on the user's own history.
                        testID={day.key}
                        disabled={day.future || !onSelectDay}
                        onPress={() => onSelectDay?.(day.key)}
                        accessibilityRole={onSelectDay ? 'button' : 'image'}
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${t('log.dayA11y', {
                          defaultValue:
                            '{{date}}: {{prayers}} prayers logged{{fast}}',
                          date: day.key,
                          prayers: day.logged,
                          fast: day.fasted
                            ? `, ${t('log.fasted', 'fasted')}`
                            : '',
                          // A mark that only exists visually is a mark half
                          // the point of which — finding the day again —
                          // does not work with a screen reader.
                        })}${
                          !day.future && day.missed > 0
                            ? `, ${t('journal.status.missed')}`
                            : ''
                        }${
                          // A mark that exists only visually is half a mark.
                          !day.future && day.sunnah >= 1
                            ? `, ${t('sunnah.a11yAll', 'all sunnah')}`
                            : ''
                        }${
                          !day.future && day.qiyam
                            ? `, ${t('sunnah.qiyam', 'Qiyam al-Layl')}`
                            : ''
                        }`}
                        style={[
                          styles.square,
                          { backgroundColor: fillFor(day) },
                          // See EMPTY_TINT: the palest step needs an edge to
                          // survive a bright screen. ONLY on a day that
                          // carries nothing at all — a border changes the
                          // box the ring, the line and the dots are laid out
                          // against, so a day with any mark on it must not
                          // gain one here. (The geometry tests caught this.)
                          muted && styles.squareMuted,
                          bare
                            ? [
                                styles.emptyEdge,
                                { borderColor: withAlpha(accent, EMPTY_RING_TINT) },
                              ]
                            : null,
                          // Selection lifts the square AND outlines it in
                          // the text colour. The lift alone was invisible on
                          // an empty day, which is most of them and exactly
                          // the ones you open in order to fill in.
                          selected && styles.squareSelected,
                          selected && {
                            borderWidth: SQUARE_BORDER,
                            borderColor: palette.text,
                          },
                          // Amber last, so it wins the outline on a day that
                          // is both selected and fasted: the ring carries
                          // data, the lift only carries where you are.
                          day.fasted && {
                            borderWidth: SQUARE_BORDER,
                            borderColor: ring,
                          },
                        ]}
                      >
                        {/* A day carrying a missed prayer gets a mark, even
                            when the rest of it went well. `missed` is how
                            people note that a prayer is owed and will be
                            made up later, so the day has to be findable
                            afterwards — and four on-time plus one missed is
                            a strong green square in which the one thing
                            being looked for is invisible. The corner is the
                            only channel left: depth is the score, the ring
                            is the fast, the outline is the selection. */}
                        {/* The sunnah line, INSET inside the fast border so
                            the two never merge into one thick edge. It is
                            DRAWN ROUND the square as the day fills — four
                            straight segments, clockwise from the top-left —
                            rather than a faint full ring going solid, so how
                            far round it has gone reads as a quantity at a
                            glance instead of asking the eye to judge
                            opacity against six other shades of fill.
                            Straight sides rather than an arc because an arc
                            needs react-native-svg, and this grid draws every
                            square of every week at once across years of
                            history on a surface that already cost a release
                            to make scroll smoothly. */}
                        {!day.future && day.sunnah > 0 ? (
                          day.sunnah >= 1 ? (
                            // A complete day is one closed line, not four
                            // segments that happen to meet — one View instead
                            // of four, on the days a committed user has most.
                            <View
                              pointerEvents="none"
                              style={[marks.ring, { borderColor: gold }]}
                            />
                          ) : (
                            ringSegments(day.sunnah).map((len, i) =>
                              len <= 0 ? null : (
                                <View
                                  key={i}
                                  pointerEvents="none"
                                  style={[
                                    sunnahSegment(i, len, border),
                                    { backgroundColor: gold },
                                  ]}
                                />
                              ),
                            )
                          )
                        ) : null}
                        {!day.future && day.qiyam ? (
                          <View
                            pointerEvents="none"
                            style={[
                              marks.qiyam,
                              { backgroundColor: QIYAM_MARK },
                            ]}
                          />
                        ) : null}
                        {!day.future && day.missed > 0 ? (
                          <View
                            style={[
                              marks.missed,
                              { backgroundColor: String(palette.danger) },
                            ]}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {compact ? null : (
        <>
          <View style={styles.legendRow}>
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('log.legendPrayers', '0 → 5 prayers')}
            </Text>
            <View style={styles.legendSquares}>
              {legend.map(n => (
                <View
                  key={n}
                  style={[
                    styles.legendSquare,
                    {
                      backgroundColor:
                        n > 0
                          ? withAlpha(accent, 0.2 + 0.8 * (n / 5))
                          : palette.controlBg,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          {/* The two categorical marks get their own line. Squeezed onto the
              ramp's row they read as another rung of it, which is the exact
              confusion the ramp change was made to end. */}
          <View style={styles.legendRow}>
            {/* The swatch carries the mark itself, not just the tint: the
                tint only ever appears on a day where NOTHING was kept,
                while the mark appears on any day holding a missed prayer,
                which is the thing worth finding. */}
            <View
              style={[
                styles.legendSquare,
                { backgroundColor: withAlpha(String(palette.danger), 0.3) },
              ]}
            >
              <View
                style={[
                  styles.legendMissedMark,
                  { backgroundColor: String(palette.danger) },
                ]}
              />
            </View>
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('journal.status.missed')}
            </Text>
            <View
              style={[
                styles.legendSquare,
                {
                  borderWidth: 2,
                  borderColor: ring,
                  backgroundColor: 'transparent',
                },
              ]}
            />
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('log.fasted', 'fasted')}
            </Text>
            {/* Gold and the fast amber are near-neighbours, so the legend
                puts them on the same line — seen side by side they are two
                colours; met one at a time they are both "yellowish". */}
            <View
              style={[
                styles.legendSquare,
                { borderWidth: 2, borderColor: gold, backgroundColor: 'transparent' },
              ]}
            />
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('sunnah.legend', 'sunnah')}
            </Text>
            <View
              style={[
                styles.legendSquare,
                { backgroundColor: palette.controlBg },
              ]}
            >
              <View
                style={[styles.legendQiyamMark, { backgroundColor: QIYAM_MARK }]}
              />
            </View>
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('sunnah.qiyamLegend', 'night prayer')}
            </Text>
          </View>
        </>
      )}

      {caption && !compact ? (
        <Text
          style={[styles.caption, { color: palette.muted }]}
          // Two, not one. The caption gained the personal best beside the
          // streak, and four figures no longer fit one line on a 320pt phone
          // — least of all in a language that spells its numbers out. It
          // wraps rather than being clipped mid-word.
          numberOfLines={2}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export const PracticeHeatmap = memo(PracticeHeatmapImpl);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 6 },
  labels: { gap: GAP },
  labelCell: { height: SQUARE, justifyContent: 'center' },
  labelText: { fontSize: 9, fontWeight: '600' },
  monthSpacer: { height: MONTH_ROW },
  // `gap` deliberately absent: each cell is exactly one column wide, so the
  // strip and the grid below it stay in step by construction.
  monthRow: { flexDirection: 'row', height: MONTH_ROW },
  monthCell: { width: COL, justifyContent: 'flex-end' },
  // Wider than the column it sits in, so a three-letter month name is not
  // clipped to one. Overflow is harmless: the next label is a month away.
  monthText: { fontSize: 9, fontWeight: '600', width: COL * 3 },
  // `paddingEnd`, not `paddingRight`: in Arabic and Urdu the grid runs the
  // other way and the breathing room has to follow it (the repo's RTL audit
  // catches exactly this).
  /**
   * Pinned to the END — the side today is on.
   *
   * When the grid is narrower than the space it has (a new install, a wide
   * phone, an iPad), the columns used to sit at the start, so the record
   * hugged the left edge with a gap after it and today floated in the
   * middle of nowhere. Pinned to the end, today is always at the edge you
   * scroll away from and the visible width is filled with as much past as
   * there is. `flex-end` follows the writing direction, so RTL gets the
   * mirror of this rather than a special case.
   */
  scrollBody: { paddingEnd: 2, flexGrow: 1, justifyContent: 'flex-end' },
  weeks: { gap: GAP },
  week: { flexDirection: 'row', gap: GAP },
  square: { width: SQUARE, height: SQUARE, borderRadius: 3.5 },
  /** See EMPTY_TINT — applied only to a day with nothing drawn on it. */
  emptyEdge: { borderWidth: StyleSheet.hairlineWidth },
  /**
   * The de-emphasised state, while the grid is showing only owed days.
   *
   * 0.16 rather than hiding them: the shape of the record is what makes the
   * marked days legible as "three days out of all this", and a grid that
   * emptied itself would lose the very context that makes the answer mean
   * something.
   */
  squareMuted: { opacity: 0.16 },
  // The ring and the two dots live in `markStyles`, not here: their insets
  // depend on whether the square carries a border, which a static stylesheet
  // cannot express.
  squareSelected: { transform: [{ scale: 1.4 }], zIndex: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  legendSquares: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendSquare: { width: 11, height: 11, borderRadius: 2.5 },
  legendQiyamMark: {
    position: 'absolute',
    bottom: 1,
    insetInlineStart: 1,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendMissedMark: {
    position: 'absolute',
    top: 1,
    insetInlineEnd: 1,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendText: { fontSize: 10.5, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 17, marginTop: 8 },
});
