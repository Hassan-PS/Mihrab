/**
 * The Log — prayers and fasting on one screen (design review 2c).
 *
 * They were two screens with two visual languages recording the same act:
 * what you did today. Merged, they share one graph — green depth for
 * prayers, an amber ring for the fast — and one day column. The stats
 * trio and the two "all logged days" lists are gone: the graph already
 * shows the streak, so the number only has to name it, and a wall of
 * squares says more than a scrolling list of dates ever did.
 *
 * Everything either screen could DO is still here: the four statuses, the
 * private note per prayer, marking and unmarking a fast, the day-before
 * reminder and the sunnah calendar (behind "All upcoming", since a calendar
 * is reference, not a daily action).
 *
 * THE SCREEN SHOWS A DAY, not today. It used to be welded to `dayKey()`,
 * which meant the journal could only ever be written forward: a prayer you
 * forgot to mark last night was unreachable the next morning, and a record
 * you cannot correct is one you stop trusting. Any day back to the first
 * one you ever logged can be opened — with the arrows, or by tapping its
 * square in the graph — and every control on the screen writes to whichever
 * day is open. Forward stops at today, because a log of the future is a
 * plan, and this screen is not for plans.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  I18nManager,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import notifee, { EventType } from '@notifee/react-native';
import { JOURNAL_LOG_ACTION_ID } from '../notifications/prayerNotifications';
import { useAppPalette } from '../hooks/useAppPalette';
import { ConfirmModal } from '../components/ConfirmModal';
import { FillSummary } from '../components/FillSummary';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { usePrayerDay } from '../hooks/usePrayerDay';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import {
  FASTING_KEY,
  JOURNAL_KEY,
  dayKey,
  primePractice,
  usePracticeHistory,
} from '../practice/practiceStore';
import {
  buildHeatmap,
  PracticeHeatmap,
  weeksToCover,
} from '../practice/PracticeHeatmap';
import { getCachedPrayerTimes } from '../prayer/prayerStorage';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { applyOffsets } from '../settings/prayerOffsets';
import { injectNightTimes } from '../utils/nightTimes';
import type { TimingsMap } from '../types/prayer';
import {
  coerceJournalEntries,
  computeCurrentStreak,
  getEntryStatus,
  removeEntry,
  scoreByDay,
  setEntryNote,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
  type JournalStatus,
} from '../journal/journal';
import { upcomingPrayers } from '../journal/upcoming';
import { dragTranslation, swipeDayDelta } from '../journal/daySwipe';
import { applyBackfill, planBackfill } from '../journal/backfill';
import { applyMonthFill, planMonthFill } from '../journal/fillMonths';
import { installedOnDay } from '../journal/installDate';
import { syncEndOfDayReminderForDay } from '../notifications/endOfDayLog';
import {
  coerceFastEntries,
  computeFastStats,
  findFastEntry,
  isRecommendedVoluntaryFastDay,
  ramadanDayNumber,
  upsertFastEntry,
  deleteFastEntry,
  type FastEntry,
} from '../fasting/fasting';
import { cardEdgeStyle, inputChromeStyle } from '../theme/chrome';
import { tabularNumeralStyle } from '../theme/textScale';
import { formatDisplayTime } from '../utils/prayerTimes';
import { useTabBarInset } from '../navigation/tabBarInset';

const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const STATUSES: JournalStatus[] = ['on-time', 'late', 'missed', 'qadha'];

/**
 * A `YYYY-MM-DD` key back into a local Date, anchored at noon.
 *
 * Noon and not midnight: adding or subtracting a day around a DST boundary
 * can land on an hour that does not exist locally, and the resulting Date
 * rolls into the neighbouring day. The log would then skip 30 March or
 * repeat 26 October once a year, in exactly the countries that would never
 * think to report it.
 */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** Oldest day with anything recorded, or null for an empty journal. */
function earliestEntryOf(entries: JournalEntry[]): string | null {
  let first: string | null = null;
  for (const e of entries) if (first === null || e.date < first) first = e.date;
  return first;
}

export function LogScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const tabBarInset = useTabBarInset();
  const navigation = useNavigation();
  const {
    settings,
    hydrated: settingsHydrated,
    updateSettings,
  } = usePrayerSettings();
  const { state } = usePrayerDay(settings, settingsHydrated);
  useAndroidSubScreenBack();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [fasts, setFasts] = useState<FastEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [openNote, setOpenNote] = useState<JournalPrayer | null>(null);
  const [actionTargetPrayer, setActionTargetPrayer] =
    useState<JournalPrayer | null>(null);
  const today = dayKey();
  /**
   * The day being shown and written to. Defaults to today, and every write
   * on this screen goes here rather than to `today`.
   */
  const [selected, setSelected] = useState(today);
  const isToday = selected === today;
  /** The day, readable from callbacks that must not be rebuilt when it
   *  changes — the pan responder, above all: rebuilding it mid-gesture
   *  drops the drag. */
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /**
   * Ticks once a minute, only while today is on screen. It exists so a row
   * greyed out as "not yet" opens itself the minute the adhan time passes,
   * instead of the user tapping a dead chip and wondering what is broken.
   */
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setMinuteTick(n => n + 1), 60000);
    return () => clearInterval(id);
  }, [isToday]);
  const selectedDate = useMemo(() => dateFromKey(selected), [selected]);
  /** Forward is barred past today — see the header comment. */
  const canGoForward = selected < today;

  const stepDay = useCallback(
    (delta: number) => {
      setSelected(cur => {
        const d = dateFromKey(cur);
        d.setDate(d.getDate() + delta);
        const next = dayKey(d);
        return next > today ? cur : next;
      });
    },
    [today],
  );

  /**
   * ── The day panel is a page you can throw sideways ──────────────────
   *
   * The arrows are precise and slow: reaching last month is thirty taps,
   * and the graph above already shows the square you want. Dragging the
   * panel is how anyone expects to move between days, and both remain —
   * the arrows for one day at a time, the drag for the habit.
   *
   * PanResponder rather than a paged ScrollView because this lives INSIDE
   * a vertical ScrollView: the responder only claims the gesture once it
   * is decisively horizontal, so scrolling the page still works with a
   * finger anywhere on the panel, including on top of it.
   *
   * The decision itself is `swipeDayDelta`, kept out of here and unit
   * tested — a gesture cannot be tested in Jest, an intent can.
   */
  const panX = useRef(new Animated.Value(0)).current;
  const panWidth = useRef(0);
  const canGoForwardRef = useRef(false);
  canGoForwardRef.current = canGoForward;
  const settle = useCallback(
    (delta: -1 | 0 | 1) => {
      if (delta === 0) {
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }).start();
        return;
      }
      // Out, swap the day, then in from the other side: the day being
      // replaced leaves the way the finger sent it, which is what makes it
      // read as a page rather than a redraw.
      const width = panWidth.current || 320;
      const rtl = I18nManager.isRTL;
      const outward = (delta === -1 ? 1 : -1) * (rtl ? -1 : 1) * width;
      Animated.timing(panX, {
        toValue: outward,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        stepDay(delta);
        panX.setValue(-outward);
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }).start();
      });
    },
    [panX, stepDay],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Never on touch-down: a tap on a status chip must reach the chip.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderMove: (_e, g) => {
          panX.setValue(
            dragTranslation({
              dx: g.dx,
              canGoForward: canGoForwardRef.current,
              rtl: I18nManager.isRTL,
            }),
          );
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          settle(
            swipeDayDelta({
              dx: g.dx,
              vx: g.vx,
              width: panWidth.current || 320,
              canGoForward: canGoForwardRef.current,
              rtl: I18nManager.isRTL,
            }),
          );
        },
        onPanResponderTerminate: () => settle(0),
      }),
    [panX, settle],
  );

  /**
   * A press on the notification's "Log prayer" writes the entry itself —
   * `prayerLogAction` owns that, and it works with the app closed, which is
   * the only way a button on a notification is any use. This handler is the
   * cosmetic half: if the Log happens to be open, jump to the day it landed
   * on and flash the row, so the record visibly gains what was just claimed
   * rather than changing behind the user's back.
   */
  useEffect(() => {
    const sub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.ACTION_PRESS) return;
      const id = detail.pressAction?.id ?? '';
      if (!id.startsWith(JOURNAL_LOG_ACTION_ID)) return;
      const data = detail.notification?.data as
        | Record<string, unknown>
        | undefined;
      const fromId = id.startsWith(`${JOURNAL_LOG_ACTION_ID}:`)
        ? id.slice(JOURNAL_LOG_ACTION_ID.length + 1)
        : null;
      const name = (fromId ?? data?.prayer) as JournalPrayer;
      if (!PRAYERS.includes(name)) return;
      // The day the ALERT was for, which after midnight is not today — the
      // write lands there, so the screen must follow it there.
      const date = data?.targetDate;
      setSelected(
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : dayKey(),
      );
      setActionTargetPrayer(name);
      setTimeout(() => setActionTargetPrayer(null), 4000);
    });
    return sub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      durableEncryptedGet(JOURNAL_KEY).catch(() => null),
      durableEncryptedGet(FASTING_KEY).catch(() => null),
    ])
      .then(([j, f]) => {
        if (cancelled) return;
        if (j) setEntries(coerceJournalEntries(JSON.parse(j)));
        if (f) setFasts(coerceFastEntries(JSON.parse(f)));
      })
      .catch(e => {
        console.warn('LogScreen load failed:', e);
        Alert.alert(
          t('journal.loadFailedTitle', 'Could not load journal'),
          t(
            'journal.loadFailedBody',
            'Your data is safe on disk but could not be read right now. Please try opening the journal again.',
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  /**
   * Anything that writes practice data from OUTSIDE this screen — the
   * end-of-day notification's "log the day" button, most of all — lands
   * here without a reload. The screen keeps its own copy as the thing it
   * renders and writes; this only pulls in changes it did not make.
   */
  const store = usePracticeHistory();
  useEffect(() => {
    if (!hydrated || !store.hydrated) return;
    setEntries(cur => (cur === store.journal ? cur : store.journal));
    setFasts(cur => (cur === store.fasts ? cur : store.fasts));
  }, [hydrated, store.hydrated, store.journal, store.fasts]);

  const persistJournal = useCallback(
    /** `dates` names the days this write touched — one, normally; every
     *  backfilled day when the button below is used. */
    async (next: JournalEntry[], dates: string[] = [selectedRef.current]) => {
      const prev = entries;
      setEntries(next);
      // Published before the write, not after it. Encrypting and writing a
      // journal with a year in it is long enough to watch, and every other
      // surface — Home's graph, the Today summary — used to sit on the old
      // value until it finished. `primePractice` hands over the value we
      // already have rather than sending everyone back to disk for it.
      primePractice({ journal: next });
      try {
        await durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next));
        // A day that is now fully recorded has answered the evening's
        // "log today's prayers?" prompt before it was asked, so the prompt
        // is retired here rather than left to fire at us tonight.
        for (const date of dates) {
          void syncEndOfDayReminderForDay(date, next);
        }
      } catch (e) {
        console.warn('LogScreen journal persist failed', e);
        setEntries(prev);
        primePractice({ journal: prev });
        Alert.alert(
          t('journal.saveFailedTitle', 'Could not save'),
          t('journal.saveFailedBody', 'Please try again.'),
        );
      }
    },
    [entries, t],
  );

  const persistFasts = useCallback(
    async (next: FastEntry[]) => {
      const prev = fasts;
      setFasts(next);
      primePractice({ fasts: next });
      try {
        await durableEncryptedSet(FASTING_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('LogScreen fasting persist failed', e);
        setFasts(prev);
        primePractice({ fasts: prev });
      }
    },
    [fasts],
  );

  /**
   * Note drafts belong to the day on screen, so they are re-read whenever
   * the day changes — not once on hydrate. Getting this wrong would carry
   * one day's private note onto another and save it there.
   */
  useEffect(() => {
    if (!hydrated) return;
    const next: Record<string, string> = {};
    for (const p of PRAYERS) {
      const e = entries.find(x => x.date === selected && x.prayer === p);
      next[p] = e?.note ?? '';
    }
    setDraftNotes(next);
    setOpenNote(null);
    // Deliberately not keyed on `entries`: re-running on every save would
    // wipe whatever the user has typed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, selected]);

  const onMark = useCallback(
    (prayer: JournalPrayer, status: JournalStatus) => {
      // Tapping the selected status again clears it — the only way to undo
      // a mis-tap.
      if (getEntryStatus(entries, selected, prayer) === status) {
        void persistJournal(removeEntry(entries, selected, prayer));
        return;
      }
      void persistJournal(upsertEntry(entries, selected, prayer, status));
    },
    [entries, selected, persistJournal],
  );

  const onSaveNote = useCallback(
    (prayer: JournalPrayer) => {
      void persistJournal(
        setEntryNote(entries, selected, prayer, draftNotes[prayer] ?? ''),
      );
    },
    [draftNotes, entries, selected, persistJournal],
  );

  const dayFast = findFastEntry(fasts, selected);
  const toggleFast = useCallback(() => {
    if (dayFast) {
      void persistFasts(deleteFastEntry(fasts, selected));
      return;
    }
    // Ramadan is a property of the DAY being logged, not of the day the
    // logging happens on — back-filling a fast in Ramadan from the week
    // after must still record it as a Ramadan fast.
    const ramadanDay = ramadanDayNumber(dateFromKey(selected));
    void persistFasts(
      upsertFastEntry(fasts, selected, {
        type: ramadanDay != null ? 'ramadan' : 'voluntary',
        completed: true,
      }),
    );
  }, [fasts, selected, dayFast, persistFasts]);

  // ── The graph ────────────────────────────────────────────────────────
  /**
   * The oldest day with anything on it, across both stores — the graph is
   * drawn back to this and no further. Fasts count as well as prayers: a
   * Ramadan logged before the journal was ever used is still history.
   */
  const earliestLogged = useMemo(() => {
    let earliest: string | null = null;
    for (const e of entries) {
      if (earliest === null || e.date < earliest) earliest = e.date;
    }
    for (const f of fasts) {
      if (earliest === null || f.date < earliest) earliest = f.date;
    }
    return earliest;
  }, [entries, fasts]);

  /**
   * How far back the graph is drawn.
   *
   * Three inputs, because the graph has to cover everything the user can
   * reach by any route: their first entry, the day they have currently
   * open (the arrows walk into months with nothing logged in them, and a
   * graph that stopped at the first entry left the open day off its own
   * chart), and whatever they have asked for by dragging the grid back.
   */
  const [extraWeeks, setExtraWeeks] = useState(0);
  const spanWeeks =
    Math.max(weeksToCover(earliestLogged), weeksToCover(selected)) + extraWeeks;
  const showMore = useCallback(() => setExtraWeeks(w => w + 26), []);

  const heatmapRows = useMemo(() => {
    const fasted = new Set(fasts.filter(f => f.completed).map(f => f.date));
    return buildHeatmap(scoreByDay(entries), fasted, new Date(), spanWeeks);
  }, [entries, fasts, spanWeeks]);

  const weekdayLabels = useMemo(() => {
    // Monday-first initials in the app language.
    const monday = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d
        .toLocaleDateString(i18n.language, { weekday: 'narrow' })
        .slice(0, 2);
    });
  }, [i18n.language]);

  const streak = computeCurrentStreak(entries);
  const fastStats = computeFastStats(fasts);

  /**
   * The selected day's prayer times, for the row labels and the iftar line.
   *
   * Today comes straight from `usePrayerDay`, which is already loaded and
   * already carries the user's per-prayer offsets. An older day is read
   * from the local cache and put through the same two transforms, so the
   * time next to "Asr" here is the one the rest of the app would have
   * shown that day rather than a raw provider value four minutes off.
   *
   * A miss is normal and silent: the cache holds about a year, and a day
   * older than that — or one logged in another city — simply shows no
   * times. Nothing on this screen depends on them.
   */
  const [pastTimes, setPastTimes] = useState<TimingsMap | null>(null);
  const coords =
    state.phase === 'ready'
      ? { latitude: state.latitude, longitude: state.longitude }
      : null;
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  useEffect(() => {
    if (isToday || lat === undefined || lon === undefined) {
      setPastTimes(null);
      return;
    }
    let cancelled = false;
    void getCachedPrayerTimes({
      provider: getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        { latitude: lat, longitude: lon },
      ),
      latitude: lat,
      longitude: lon,
      date: dateFromKey(selected),
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    })
      .then(raw => {
        if (cancelled) return;
        setPastTimes(
          raw
            ? injectNightTimes([applyOffsets(raw, settings.prayerOffsets)])[0]
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setPastTimes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isToday,
    selected,
    lat,
    lon,
    settings.dataProviderAuto,
    settings.dataProvider,
    settings.calculationMethod,
    settings.school,
    settings.prayerOffsets,
  ]);

  const dayTimes = isToday
    ? state.phase === 'ready'
      ? state.today
      : undefined
    : pastTimes ?? undefined;

  const maghrib = dayTimes?.Maghrib;
  const isSunnahDay = isRecommendedVoluntaryFastDay(selectedDate);
  const ramadanDay = ramadanDayNumber(selectedDate);

  /**
   * Prayers that have not happened yet, and so cannot be logged.
   *
   * Only ever non-empty on today: a past day happened in full, and there is
   * no future day to be on. It is deliberately keyed on the CLOCK, not on
   * "is this the current prayer" — the honest question is whether the time
   * has come, and the honest answer at 14:00 is that Isha has not.
   *
   * A day whose times we do not have (older than the cache, or logged in
   * another city) greys out nothing. Refusing to record a prayer because
   * the app has misplaced its timetable would be the app's problem charged
   * to the user.
   */
  const upcoming = useMemo(
    () => upcomingPrayers(PRAYERS, dayTimes, new Date(), isToday),
    // `minuteTick` re-runs this as the clock passes each prayer, so a row
    // un-greys itself while the screen is open rather than on next launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToday, dayTimes, minuteTick],
  );

  /**
   * "Mark all on time" fills the prayers that HAVE HAPPENED and no others.
   *
   * It cannot be the loophole around the greyed-out chips. A button that
   * quietly wrote "on time" against an Isha four hours away would put a
   * claim in the user's own record that they never made, and that record is
   * the entire product here.
   */
  const markAllOnTime = useCallback(() => {
    let next = entries;
    for (const p of PRAYERS) {
      if (upcoming.has(p)) continue;
      if (!getEntryStatus(next, selected, p)) {
        next = upsertEntry(next, selected, p, 'on-time');
      }
    }
    if (next !== entries) void persistJournal(next);
  }, [entries, selected, persistJournal, upcoming]);

  /**
   * ── Filling in the days before you started logging ──────────────────
   *
   * Someone who has prayed for months and installed the app on Tuesday
   * opens this screen to a wall of empty squares that says, wrongly, that
   * they have done nothing. One button fills every day from the install
   * back-stop up to yesterday.
   *
   * It asks first, and the question names the exact number of days and the
   * exact range, because "fill in 214 days" and "fill in 3 days" deserve
   * different answers and only the user knows which this is. Today is
   * excluded — it still has prayers in it that have not happened — and
   * anything already recorded is left exactly as it was.
   */
  const [backfilling, setBackfilling] = useState(false);
  const earliestEntry = useMemo(() => earliestEntryOf(entries), [entries]);
  /**
   * The pending fill, held open while the user decides.
   *
   * `apply` closes over the journal AS READ FROM DISK when the button was
   * pressed, not over the screen's state: the dialog is on screen for as
   * long as the user takes to read it, and what gets written must be what
   * was described to them.
   */
  const [pendingFill, setPendingFill] = useState<{
    title: string;
    days: number;
    prayers: number;
    range: string;
    preserved: string;
    /** Days deliberately not touched — shown as a figure, not a sentence. */
    skipped?: number;
    apply: () => void;
  } | null>(null);
  /** A dialog that reports rather than asks — nothing to fill, or refused. */
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);

  /** "13 May – 7 August", in the user's own language. */
  const formatRange = useCallback(
    (from: string, to: string) => {
      const fmt = (key: string) =>
        dateFromKey(key).toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
        });
      return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
    },
    [i18n.language],
  );

  /** The write half, shared by both buttons: persist, or refuse loudly. */
  const commitFill = useCallback(
    (build: () => JournalEntry[], previous: JournalEntry[]) => {
      try {
        const next = build();
        if (next === previous) return;
        void persistJournal(
          next,
          // Every filled day is now complete, so each one's evening prompt
          // is retired with it.
          next.map(e => e.date).filter((d, idx, all) => all.indexOf(d) === idx),
        );
      } catch (e) {
        // The no-data-loss assertion failed, which means a bug in this app.
        // The only safe response is to write nothing at all and say so.
        console.error('LogScreen fill refused', e);
        setNotice({
          title: t('log.backfillRefusedTitle', 'Nothing was changed'),
          message: t('log.backfillRefusedBody', {
            defaultValue:
              'Filling in those days would have altered something you had already logged, so it was stopped. Your journal is untouched.',
          }),
        });
      }
    },
    [persistJournal, t],
  );

  const runBackfill = useCallback(async () => {
    if (backfilling) return;
    // Never from an unhydrated screen. `entries` starts as [] and fills in a
    // beat later; backfilling against that empty array and writing the
    // result would replace the user's whole journal with the days this
    // button invented. The button is disabled until hydration, and this is
    // the second lock on the same door.
    if (!hydrated) return;
    setBackfilling(true);
    try {
      // Read from DISK, not from the screen's copy. The screen's copy is a
      // render value: correct in every case anyone thought of, and this is
      // the one write in the app where being wrong loses a year of someone's
      // record. If the read fails we abort — a journal we could not read is
      // not one we may overwrite.
      let stored: JournalEntry[];
      try {
        const raw = await durableEncryptedGet(JOURNAL_KEY);
        stored = raw ? coerceJournalEntries(JSON.parse(raw)) : [];
      } catch (e) {
        console.warn('LogScreen backfill: journal unreadable', e);
        setNotice({
          title: t('journal.loadFailedTitle', 'Could not load journal'),
          message: t('log.backfillUnreadable', {
            defaultValue:
              'Your journal could not be read just now, so nothing was changed. Please try again.',
          }),
        });
        return;
      }
      const installedOn = await installedOnDay(
        earliestEntryOf(stored) ?? earliestEntry,
      );
      const plan = planBackfill(stored, installedOn);
      if (!plan.from || !plan.to) {
        setNotice({
          title: t('log.backfillNothingTitle', 'Nothing to fill in'),
          message: t(
            'log.backfillNothingBody',
            'Every day before today is already recorded.',
          ),
        });
        return;
      }
      setPendingFill({
        title: t('log.backfillTitle', 'Fill in earlier days?'),
        days: plan.days,
        prayers: plan.prayers,
        range: formatRange(plan.from, plan.to),
        preserved: t('log.backfillPreserved', {
          defaultValue:
            'Days you have already logged are left alone, and today is not touched.',
        }),
        // Against `stored`, the copy read from disk and planned against —
        // not the screen's state, which may have moved on while the dialog
        // was open.
        apply: () =>
          commitFill(() => applyBackfill(stored, installedOn), stored),
      });
    } finally {
      setBackfilling(false);
    }
  }, [backfilling, commitFill, earliestEntry, formatRange, hydrated, t]);

  /**
   * ── Filling three months, for a practice older than the app ─────────
   *
   * The button above stops where the app's own history stops. This one
   * reaches past it, because someone who has prayed for years did not
   * start doing so when they installed this.
   *
   * What pays for that reach is the strictness: it only writes to days
   * holding NOTHING — no status, no note, no fast. A half-described day is
   * left exactly as it was, in full, rather than having four claims added
   * next to the one the user actually made. `fillMonths` has the whole
   * argument; this is the half that asks first.
   */
  const runMonthFill = useCallback(async () => {
    if (backfilling || !hydrated) return;
    setBackfilling(true);
    try {
      let storedJournal: JournalEntry[];
      let storedFasts: FastEntry[];
      try {
        // From disk, both stores, for the same reason as the button above:
        // planning against a stale render value is how a fill becomes a
        // replacement.
        const [j, f] = await Promise.all([
          durableEncryptedGet(JOURNAL_KEY),
          durableEncryptedGet(FASTING_KEY),
        ]);
        storedJournal = j ? coerceJournalEntries(JSON.parse(j)) : [];
        storedFasts = f ? coerceFastEntries(JSON.parse(f)) : [];
      } catch (e) {
        console.warn('LogScreen month fill: stores unreadable', e);
        setNotice({
          title: t('journal.loadFailedTitle', 'Could not load journal'),
          message: t('log.backfillUnreadable', {
            defaultValue:
              'Your journal could not be read just now, so nothing was changed. Please try again.',
          }),
        });
        return;
      }

      const plan = planMonthFill(storedJournal, storedFasts);
      if (!plan.from || !plan.to) {
        setNotice({
          title: t('log.backfillNothingTitle', 'Nothing to fill in'),
          message: t('log.fillMonthsNothingBody', {
            defaultValue:
              'Every day in the past three months already has something logged.',
          }),
        });
        return;
      }
      setPendingFill({
        title: t('log.fillMonthsTitle', 'Fill the past three months?'),
        days: plan.days,
        prayers: plan.prayers,
        range: formatRange(plan.from, plan.to),
        // The reassurance this button most needs, and the reason it is
        // safe. The COUNT of untouched days rides in the figures block, so
        // this sentence names no numbers and needs no plural forms.
        skipped: plan.skipped,
        preserved: t('log.fillMonthsPreserved', {
          defaultValue:
            'Days already holding a status, a note or a fast are left exactly as they are. Today is not touched.',
        }),
        apply: () =>
          commitFill(
            () => applyMonthFill(storedJournal, storedFasts),
            storedJournal,
          ),
      });
    } finally {
      setBackfilling(false);
    }
  }, [backfilling, commitFill, formatRange, hydrated, t]);

  /** "Sunday 2 August" — the day's own name, not a raw key. */
  const selectedLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        // The year only when it is not the current one — it is noise for
        // the ninety percent of visits that land in the last few months.
        ...(selectedDate.getFullYear() === new Date().getFullYear()
          ? {}
          : { year: 'numeric' }),
      }),
    [selectedDate, i18n.language],
  );

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.scroll, { paddingBottom: tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* The gap lives HERE, not on the ScrollView's content container.
          `contentContainerStyle`'s gap applies to the ScrollView's direct
          children, and there is exactly one — this column — so it separated
          nothing at all and every card on this page sat flush against the
          next. The stack is the thing whose children need spacing, so the
          spacing belongs on the stack. */}
      <CenteredColumn innerStyle={styles.stack} style={styles.stack}>
        {/* ── The graph ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            {t('log.practiceTitle')}
          </Text>
          <PracticeHeatmap
            rows={heatmapRows}
            weekdayLabels={weekdayLabels}
            selectedKey={selected}
            onSelectDay={setSelected}
            onReachOldest={showMore}
            caption={`${t('log.streakCaption', {
              defaultValue: '{{count}}-day streak',
              count: streak,
            })} · ${t('log.fastsCaption', {
              defaultValue: '{{count}} fasts',
              count: fastStats.total,
            })}`}
          />
          {/* Under the graph, because the graph is what makes the case for
              it: a wall of empty squares behind someone who has been
              praying for months is the app being wrong about them. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.backfillAction', 'Fill in earlier days')}
            onPress={runBackfill}
            // Disabled until the journal has been read: a press before that
            // would plan against an empty array.
            disabled={backfilling || !hydrated}
            style={[
              styles.backfillRow,
              { borderTopColor: palette.border ?? palette.muted },
            ]}
          >
            <Text
              style={[styles.backfillLabel, { color: palette.accent }]}
              numberOfLines={1}
            >
              {t('log.backfillAction', 'Fill in earlier days')}
            </Text>
            <Text style={{ color: palette.accent, fontSize: 15 }}>→</Text>
          </Pressable>
          {/* The longer reach, and the stricter rule: only days holding
              nothing at all. Second because it is the bigger claim. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'log.fillMonthsAction',
              'Fill the past three months',
            )}
            onPress={runMonthFill}
            disabled={backfilling || !hydrated}
            style={[
              styles.backfillRow,
              { borderTopColor: palette.border ?? palette.muted },
            ]}
          >
            <Text
              style={[styles.backfillLabel, { color: palette.accent }]}
              numberOfLines={1}
            >
              {t('log.fillMonthsAction', 'Fill the past three months')}
            </Text>
            <Text style={{ color: palette.accent, fontSize: 15 }}>→</Text>
          </Pressable>
        </View>

        {/* ── The day being logged ──────────────────────────────────── */}
        <View style={styles.dayBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.previousDay')}
            onPress={() => stepDay(-1)}
            hitSlop={10}
            style={[styles.dayArrow, { backgroundColor: palette.controlBg }]}
          >
            <Text style={[styles.dayArrowGlyph, { color: palette.accent }]}>
              ‹
            </Text>
          </Pressable>
          <View style={styles.dayNameWrap}>
            <Text
              style={[styles.dayName, { color: palette.text }]}
              numberOfLines={1}
            >
              {isToday ? t('journal.todayLabel') : selectedLabel}
            </Text>
            {isToday ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('log.backToToday')}
                onPress={() => setSelected(today)}
                hitSlop={6}
              >
                <Text style={[styles.backToToday, { color: palette.accent }]}>
                  {t('log.backToToday')}
                </Text>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.nextDay')}
            // Tomorrow is not a thing you can have prayed.
            disabled={!canGoForward}
            onPress={() => stepDay(1)}
            hitSlop={10}
            style={[
              styles.dayArrow,
              {
                backgroundColor: palette.controlBg,
                opacity: canGoForward ? 1 : 0.35,
              },
            ]}
          >
            <Text style={[styles.dayArrowGlyph, { color: palette.accent }]}>
              ›
            </Text>
          </Pressable>
        </View>
        {/* ── The day, as one card you can throw sideways ───────────────
            One surface, not a stack of loose cards: the whole thing is a
            single day, it moves as a single thing, and it should look like
            a single thing. The grabber at the top is the only part of this
            that is decoration, and it earns its place — a panel that moves
            when dragged but gives no sign it can be is a gesture nobody
            discovers. `onLayout` gives the pan responder the width it needs
            to decide what counts as a swipe. */}
        <Animated.View
          onLayout={e => {
            panWidth.current = e.nativeEvent.layout.width;
          }}
          style={[
            styles.dayPanel,
            {
              backgroundColor: palette.card,
              ...cardEdgeStyle(palette),
              transform: [{ translateX: panX }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={t('log.swipeHint', 'Swipe to change day')}
            style={styles.grabberWrap}
          >
            <View
              style={[
                styles.grabber,
                { backgroundColor: palette.border ?? palette.muted },
              ]}
            />
          </View>

          <View style={styles.todayHeader}>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('log.markAllOnTime', 'Mark all on time')}
              onPress={markAllOnTime}
              style={[styles.ghostBtn, { backgroundColor: palette.controlBg }]}
            >
              <Text style={[styles.ghostLabel, { color: palette.accent }]}>
                {t('log.markAllOnTime', 'Mark all on time')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.panelSection}>
            {PRAYERS.map((prayer, index) => {
              const current = getEntryStatus(entries, selected, prayer);
              const draft = draftNotes[prayer] ?? '';
              const savedNote = entries.find(
                e => e.date === selected && e.prayer === prayer,
              )?.note;
              const draftDirty = (savedNote ?? '') !== draft;
              const time = dayTimes?.[prayer];
              /**
               * Greyed out only while there is nothing to correct. The rule
               * exists to stop a NEW claim being made about a prayer that
               * has not happened; it must not trap one that somehow already
               * exists — from an older build, or a mis-tap before the clock
               * moved — behind four dead chips with no way to clear it.
               */
              const notYet = upcoming.has(prayer) && !current;
              return (
                <View
                  key={prayer}
                  style={[
                    styles.prayerRow,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: palette.border ?? palette.muted,
                    },
                    actionTargetPrayer === prayer && {
                      backgroundColor: palette.accentBg,
                    },
                  ]}
                >
                  <View style={styles.prayerHead}>
                    <Text style={[styles.prayerName, { color: palette.text }]}>
                      {t(`prayer.${prayer}`)}
                    </Text>
                    {time ? (
                      <Text
                        style={[
                          styles.prayerTime,
                          tabularNumeralStyle,
                          { color: palette.muted },
                        ]}
                      >
                        {formatDisplayTime(time)}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        'journal.noteLabel',
                        'Personal note (private, encrypted)',
                      )}
                      onPress={() =>
                        setOpenNote(cur => (cur === prayer ? null : prayer))
                      }
                      hitSlop={8}
                      style={styles.noteToggle}
                    >
                      <Text
                        style={{
                          color: savedNote ? palette.accent : palette.muted,
                          fontSize: 15,
                        }}
                      >
                        ✎
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.statusRow}>
                    {STATUSES.map(s => {
                      const isSel = current === s;
                      return (
                        <Pressable
                          key={s}
                          accessibilityRole="radio"
                          accessibilityLabel={t(`journal.status.${s}`)}
                          accessibilityState={{
                            selected: isSel,
                            disabled: notYet,
                          }}
                          // A prayer whose time has not come cannot be
                          // recorded — in either direction. The chips are the
                          // rule; "Mark all on time" obeys the same one.
                          disabled={notYet}
                          onPress={() => onMark(prayer, s)}
                          style={[
                            styles.statusChip,
                            {
                              backgroundColor: isSel
                                ? palette.accentSolid
                                : palette.controlBg,
                              opacity: notYet ? 0.4 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusLabel,
                              {
                                color: isSel ? palette.onAccent : palette.text,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {t(`journal.statusShort.${s}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {openNote === prayer ? (
                    <View style={styles.noteRow}>
                      <TextInput
                        accessibilityLabel={t(
                          'journal.noteLabel',
                          'Personal note (private, encrypted)',
                        )}
                        value={draft}
                        onChangeText={txt =>
                          setDraftNotes(prev => ({ ...prev, [prayer]: txt }))
                        }
                        onBlur={() => {
                          if (draftDirty) onSaveNote(prayer);
                        }}
                        placeholder={t(
                          'journal.notePlaceholder',
                          'Private note (only on this device)',
                        )}
                        placeholderTextColor={String(palette.muted)}
                        multiline
                        style={[
                          styles.noteInput,
                          inputChromeStyle(palette),
                          { color: palette.text, backgroundColor: palette.bg },
                        ]}
                      />
                      {draftDirty ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            'journal.saveNote',
                            'Save note',
                          )}
                          onPress={() => onSaveNote(prayer)}
                          style={[
                            styles.saveNoteBtn,
                            { backgroundColor: palette.accentSolid },
                          ]}
                        >
                          <Text
                            style={[
                              styles.saveNoteLabel,
                              { color: palette.onAccent },
                            ]}
                          >
                            {t('journal.saveNote', 'Save')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* ── Fasting: a section of the day, not a card of its own ──── */}
          <View
            style={[
              styles.panelSection,
              styles.panelDivider,
              { borderTopColor: palette.border ?? palette.muted },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: palette.muted }]}>
              {t('log.fastingTitle')}
            </Text>
            <View style={styles.fastRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fastState, { color: palette.text }]}>
                  {dayFast
                    ? t('fasting.statusKept')
                    : ramadanDay != null
                    ? t('fasting.ramadanDayLabel', { day: ramadanDay })
                    : isSunnahDay
                    ? t('fasting.statusRecommended')
                    : t('log.noFastLogged')}
                </Text>
                {maghrib ? (
                  <Text
                    style={[styles.fastMeta, { color: palette.muted }]}
                    numberOfLines={1}
                  >
                    {t('log.iftarAt', {
                      defaultValue: 'Iftar {{time}}',
                      time: formatDisplayTime(maghrib),
                    })}
                  </Text>
                ) : null}
              </View>
              {/* Neutral wording in both states: "Mark TODAY as fasted" was
                a lie on every day but one, now that older days open here. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  dayFast ? t('log.unmarkFasted') : t('log.markFasted')
                }
                onPress={toggleFast}
                style={[
                  styles.fastCta,
                  {
                    backgroundColor: dayFast
                      ? palette.controlBg
                      : palette.accentSolid,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.fastCtaLabel,
                    { color: dayFast ? palette.text : palette.onAccent },
                  ]}
                >
                  {dayFast ? t('log.unmarkFasted') : t('log.markFasted')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('log.allUpcoming', 'All upcoming')}
              onPress={() => navigation.navigate('Fasting' as never)}
              style={[
                styles.upcomingRow,
                { borderTopColor: palette.border ?? palette.muted },
              ]}
            >
              <Text style={[styles.upcomingLabel, { color: palette.accent }]}>
                {t('log.allUpcoming', 'All upcoming')}
              </Text>
              <Text style={{ color: palette.accent, fontSize: 15 }}>→</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ── The two switches, after the day they act on ───────────────
            They used to sit between the date and the prayers, which put two
            settings in the middle of the thing you came here to do. They
            are about the day rather than part of it, so they follow it. */}
        <View
          style={[
            styles.card,
            styles.reminderRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
        >
          <View style={styles.reminderCopy}>
            <Text style={[styles.reminderTitle, { color: palette.text }]}>
              {t('settings.endOfDayLog')}
            </Text>
            <Text style={[styles.reminderHelp, { color: palette.muted }]}>
              {t('settings.endOfDayLogHelp')}
            </Text>
          </View>
          <Switch
            value={settings.endOfDayLogReminderEnabled}
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor="#ffffff"
            onValueChange={v =>
              updateSettings({ endOfDayLogReminderEnabled: v })
            }
          />
        </View>

        {/* The same switch is in Settings. It lives here too because this is
            where you are looking at the graph and deciding you want it in
            front of you every time you open the app. */}
        <View
          style={[
            styles.card,
            styles.reminderRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
        >
          <View style={styles.reminderCopy}>
            <Text style={[styles.reminderTitle, { color: palette.text }]}>
              {t('log.showOnHome')}
            </Text>
            <Text style={[styles.reminderHelp, { color: palette.muted }]}>
              {t('log.showOnHomeHelp')}
            </Text>
          </View>
          <Switch
            value={settings.showPracticeOnHome}
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor="#ffffff"
            onValueChange={v => updateSettings({ showPracticeOnHome: v })}
          />
        </View>

        {!hydrated ? (
          <Text style={[styles.hint, { color: palette.muted }]}>
            {t('common.loading')}
          </Text>
        ) : null}

        {/* Themed, in-app, and the same dialog the theme-restart prompt
            uses — a stock Alert cannot show the figures, and these are the
            two prompts in the app whose figures are the whole point. */}
        <ConfirmModal
          visible={pendingFill !== null}
          title={pendingFill?.title ?? ''}
          confirmLabel={t('log.backfillConfirm', 'Fill them in')}
          cancelLabel={t('common.cancel', 'Cancel')}
          onCancel={() => setPendingFill(null)}
          onConfirm={() => {
            const pending = pendingFill;
            setPendingFill(null);
            pending?.apply();
          }}
        >
          {pendingFill ? (
            <FillSummary
              days={pendingFill.days}
              daysLabel={t('log.fillSummaryDays', 'Days')}
              prayers={pendingFill.prayers}
              prayersLabel={t('log.fillSummaryPrayers', 'Prayers')}
              range={pendingFill.range}
              preservedCount={pendingFill.skipped}
              preservedLabel={t('log.fillSummaryLeftAlone', 'Left alone')}
              preserved={pendingFill.preserved}
            />
          ) : null}
        </ConfirmModal>

        <ConfirmModal
          visible={notice !== null}
          title={notice?.title ?? ''}
          message={notice?.message}
          confirmLabel={t('common.ok', 'OK')}
          cancelLabel={t('common.cancel', 'Cancel')}
          hideCancel
          onCancel={() => setNotice(null)}
          onConfirm={() => setNotice(null)}
        />
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 36 },
  /** Space between every card on the page. 14 rather than 12: the day panel
   *  is now one tall card between two smaller ones, and at 12 the seams
   *  read as a rendering artefact rather than a deliberate gap. */
  stack: { gap: 14 },
  card: { borderRadius: 18, padding: 14 },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Inside the day card now, so it carries the card's own side padding
    // rather than sitting flush against the screen's.
    paddingHorizontal: 14,
    paddingTop: 2,
  },
  dayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  dayArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayArrowGlyph: { fontSize: 20, fontWeight: '700', lineHeight: 22 },
  dayNameWrap: { flex: 1, alignItems: 'center' },
  dayName: { fontSize: 16, fontWeight: '700' },
  backToToday: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  ghostBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  reminderCopy: { flex: 1, minWidth: 0, gap: 2 },
  reminderTitle: { fontSize: 14, fontWeight: '700' },
  reminderHelp: { fontSize: 12, lineHeight: 16 },
  ghostLabel: { fontSize: 12, fontWeight: '700' },
  prayerRow: { paddingVertical: 10 },
  prayerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prayerName: { fontSize: 15, fontWeight: '600' },
  prayerTime: { flex: 1, fontSize: 13 },
  noteToggle: { padding: 4 },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  statusChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  noteInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  saveNoteBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  saveNoteLabel: { fontSize: 13, fontWeight: '700' },
  fastRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fastState: { fontSize: 15, fontWeight: '600' },
  fastMeta: { fontSize: 12.5, marginTop: 2 },
  fastCta: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  fastCtaLabel: { fontSize: 13, fontWeight: '700' },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
    marginTop: 12,
  },
  upcomingLabel: { fontSize: 13.5, fontWeight: '600' },
  /** The swipeable day page: one card surface holding the whole day. */
  dayPanel: { borderRadius: 18, overflow: 'hidden', paddingBottom: 4 },
  /** Sections inside that card carry the padding the old separate cards
   *  did, so nothing shifted visually except the seams between them. */
  panelSection: { paddingHorizontal: 14, paddingVertical: 12 },
  panelDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  grabberWrap: { alignItems: 'center', paddingTop: 9, paddingBottom: 2 },
  /** The sheet-style handle. Small, dim, and the only thing on the screen
   *  that says this panel is draggable — without it the gesture is
   *  undiscoverable, and a feature nobody finds is not a feature. */
  grabber: { width: 38, height: 4, borderRadius: 2, opacity: 0.7 },
  backfillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
    marginTop: 12,
  },
  backfillLabel: { fontSize: 13.5, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 8 },
});
