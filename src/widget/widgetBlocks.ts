/**
 * Everything the home-screen widgets read BESIDES prayer times.
 *
 * Six widget kinds need five different slices of app state, and each one of
 * them arriving as its own schema change would be five migrations of the
 * payload the native renderers parse. So the blocks are defined once, here,
 * built by pure functions, and hung off `WidgetPrayerPayload` as optional
 * fields — a renderer that does not know a block simply never looks at it.
 *
 * All of it is OPTIONAL on purpose. The widget process cannot read the
 * encrypted journal blob and must not try: practice data is sensitive, it
 * lives behind `durableEncryptedGet`, and a widget extension has no business
 * holding that key. The app reads it, reduces it to the few numbers a 4x4
 * grid can show, and pushes that. A block is absent when the app has not
 * pushed it yet, which every renderer must treat as "do not draw the
 * section" rather than as zero — a streak of 0 and an unknown streak look
 * identical on screen and mean opposite things.
 */
import type { JournalEntry, JournalPrayer } from '../journal/journal';
import type { FastEntry } from '../fasting/fasting';
import type { TimingsMap } from '../types/prayer';
import {
  combineLocalDateAndTime,
  formatDisplayTime,
  startOfLocalDay,
} from '../utils/prayerTimes';
import { dayAt, sunnahCount, type SunnahLog } from '../journal/sunnah';
import { owedPrayers, sunnahRateFor } from '../practice/practiceStats';
import { MUSHAF_PAGES, MUSHAF_SURAHS } from '../quran/pages';
import { mushafSurahName } from '../quran/surahName';
import {
  KHATMAH_TOTAL_PAGES,
  khatmahCurrentPage,
  khatmahToday,
  type KhatmahPlan,
  type LastRead,
  type QuranBookmark,
} from '../quran/quranState';
import { gregorianToHijri } from '../hijri/convert';
import { formatHijriLabel } from '../hijri/formatHijriLabel';
import { TASBIH_PRESETS, findPreset } from '../tasbih/tasbih';
import i18n from '../i18n';

/** The five salāh a day can hold, in the order they are prayed. */
export const WIDGET_LOGGABLE: ReadonlyArray<JournalPrayer> = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
];

/**
 * How many days of practice history travel with the payload.
 *
 * Fourteen weeks is what the widest grid in the design draws (Android 4x4),
 * and a day costs about forty bytes — so the whole block is under 4 KB, which
 * is the number that matters: this rides in a SharedPreferences string and an
 * App Group plist, both of which are read on the main thread of a process
 * that has milliseconds to live.
 */
export const PRACTICE_WINDOW_DAYS = 98;

/** One day's marks on the practice grid. */
export type WidgetPracticeDay = {
  /** Local YYYY-MM-DD. */
  d: string;
  /** Salāh prayed on time or late — the fill depth, 0..5. */
  k: number;
  /** At least one prayer recorded missed and not yet made up. */
  m?: true;
  /** A completed fast. */
  f?: true;
  /** Sunnah units kept, 0..SUNNAH_TOTAL. */
  s?: number;
};

export type WidgetPracticeBlock = {
  streak: number;
  bestStreak: number;
  /** Of the five, how many are logged today. */
  loggedToday: number;
  /** Prayers recorded missed and not yet made up, all time. */
  owed: number;
  /** Sunnah kept this month as a fraction, or null before there is a
   *  denominator worth dividing by. */
  sunnahRate: number | null;
  fastsThisMonth: number;
  /** Oldest first, ending today. Days with nothing recorded are omitted —
   *  the renderer fills the calendar, so an absent day is an empty square. */
  days: WidgetPracticeDay[];
};

/** One prayer as the Log Today widget needs it. */
export type WidgetTodayPrayer = {
  key: JournalPrayer;
  /** Localized full name. */
  name: string;
  /** Display time, same formatting as the prayer rows. */
  time: string;
  /** Journal status, or null when nothing is recorded yet. */
  status: 'on-time' | 'late' | 'missed' | 'qadha' | null;
  /**
   * Its time has arrived. The widget only offers a tap on a prayer that is
   * due: logging Isha at noon is not something anyone means to do, and an
   * enabled control that records a lie is worse than a disabled one.
   */
  due: boolean;
};

export type WidgetTodayBlock = {
  /** Local YYYY-MM-DD this block describes. Guards against a widget that
   *  slept through midnight rendering yesterday's ticks as today's. */
  dateKey: string;
  logged: number;
  loggable: number;
  /** Missed today and not yet made up. */
  owed: number;
  prayers: WidgetTodayPrayer[];
};

export type WidgetKhatmah = {
  /** 1-based day of the plan. */
  day: number;
  targetDays: number;
  /** Pages the plan asks for today. */
  pagesToday: number;
  /** Pages read today so far. */
  doneToday: number;
  behindBy: number;
  daysLeft: number;
};

export type WidgetReadingBlock = {
  surah: number;
  /** Localized surah name — Arabic script under an Arabic UI. */
  surahName: string;
  ayah: number;
  page: number;
  juz: number;
  /** Whole-Quran progress. */
  pagesRead: number;
  totalPages: number;
  bookmarks: number;
  /** Epoch ms of the last page turn, or null when nothing has been read. */
  lastReadAt: number | null;
  khatmah?: WidgetKhatmah;
};

export type WidgetHijriBlock = {
  day: number;
  month: number;
  year: number;
  /** Localized month name on its own, for layouts that stack the parts. */
  monthName: string;
  /** The whole thing, already localized ("25 Ṣafar 1448"). */
  label: string;
  /** The month after this one, and how far away it is. Always present:
   *  a calendar always has a next month, where it may have no next event. */
  nextMonthName: string;
  nextMonthInDays: number;
};

export type WidgetTasbihBlock = {
  presetId: string;
  /** Localized transliteration ("SubḥānAllāh"). */
  label: string;
  arabic: string;
  count: number;
  /** 0 means open counting. */
  target: number;
  unbounded: boolean;
  /** Position in the six-preset cycle, 0-based, and the cycle length. */
  index: number;
  total: number;
  /** Every preset's count, in preset order — this is what makes it visible
   *  that stepping to the next dhikr keeps the one you were on. */
  counts: number[];
  /** Sum across all presets in the current session-day. */
  todayTotal: number;
};

/**
 * The optional half of the widget payload. Each field is independent; a
 * caller that can only supply some of them supplies those.
 */
export type WidgetExtras = {
  practice?: WidgetPracticeBlock;
  today?: WidgetTodayBlock;
  reading?: WidgetReadingBlock;
  hijri?: WidgetHijriBlock;
  tasbih?: WidgetTasbihBlock;
};

// ── Practice ─────────────────────────────────────────────────────────

/** Local YYYY-MM-DD — the day the user is living in, not UTC. */
function dayKeyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Noon anchor, so stepping a day never lands on a DST-shifted hour. */
function noonOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export function buildPracticeBlock(input: {
  journal: JournalEntry[];
  fasts: FastEntry[];
  sunnah: SunnahLog;
  streak: number;
  bestStreak: number;
  now?: Date;
  windowDays?: number;
}): WidgetPracticeBlock {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? PRACTICE_WINDOW_DAYS;
  const today = dayKeyOf(now);

  // One pass over the journal rather than a filter per day: a three-year
  // journal is ~5000 entries and the naive form is 98 x 5000.
  const kept = new Map<string, number>();
  const missed = new Set<string>();
  for (const e of input.journal) {
    if (e.status === 'on-time' || e.status === 'late') {
      kept.set(e.date, (kept.get(e.date) ?? 0) + 1);
    } else if (e.status === 'missed') {
      missed.add(e.date);
    }
  }
  const fasted = new Set<string>();
  for (const f of input.fasts) if (f.completed) fasted.add(f.date);

  const days: WidgetPracticeDay[] = [];
  const cursor = noonOf(now);
  cursor.setDate(cursor.getDate() - (windowDays - 1));
  for (let i = 0; i < windowDays; i++) {
    const key = dayKeyOf(cursor);
    const k = kept.get(key) ?? 0;
    const s = sunnahCount(dayAt(input.sunnah, key));
    const m = missed.has(key);
    const f = fasted.has(key);
    if (k > 0 || s > 0 || m || f) {
      days.push({
        d: key,
        k: Math.min(k, WIDGET_LOGGABLE.length),
        ...(m ? { m: true as const } : {}),
        ...(f ? { f: true as const } : {}),
        ...(s > 0 ? { s } : {}),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    streak: input.streak,
    bestStreak: input.bestStreak,
    loggedToday: input.journal.filter(e => e.date === today).length,
    owed: owedPrayers(input.journal).length,
    sunnahRate: sunnahRateFor(input.sunnah, now),
    fastsThisMonth: input.fasts.filter(
      f => f.completed && f.date.slice(0, 7) === today.slice(0, 7),
    ).length,
    days,
  };
}

// ── Today (the Log Today widget) ─────────────────────────────────────

/**
 * Today's five, each with the status it currently carries and whether it is
 * yet due.
 *
 * `timings` is the RAW map (HH:mm strings), not the formatted rows, because
 * "has this prayer arrived" is a comparison and a formatted string is not
 * comparable — under a 12-hour locale "1:12 PM" sorts before "5:10 AM".
 */
export function buildTodayBlock(input: {
  journal: JournalEntry[];
  timings: TimingsMap;
  now?: Date;
}): WidgetTodayBlock {
  const now = input.now ?? new Date();
  const dateKey = dayKeyOf(now);
  const midnight = startOfLocalDay(now);
  const todays = input.journal.filter(e => e.date === dateKey);

  const prayers: WidgetTodayPrayer[] = WIDGET_LOGGABLE.map(key => {
    const raw = input.timings[key];
    const at = raw ? combineLocalDateAndTime(midnight, raw) : null;
    const entry = todays.find(e => e.prayer === key);
    return {
      key,
      name: i18n.t(`prayer.${key}`),
      time: raw ? formatDisplayTime(raw) : '—',
      status: entry ? entry.status : null,
      due: at != null && at.getTime() <= now.getTime(),
    };
  });

  return {
    dateKey,
    logged: todays.length,
    loggable: WIDGET_LOGGABLE.length,
    owed: todays.filter(e => e.status === 'missed').length,
    prayers,
  };
}

// ── Reading ──────────────────────────────────────────────────────────

function juzForPage(page: number): number {
  return MUSHAF_PAGES.find(p => p.page === page)?.juz ?? 1;
}

/**
 * Where the reader left off, and what the khatmah asks of today.
 *
 * Returns null when nothing has ever been read — the widget then has no
 * position to deep-link to, and a Continue Reading card that continues
 * nothing should not be drawn at all.
 */
export function buildReadingBlock(input: {
  lastRead: LastRead | null;
  bookmarks: QuranBookmark[];
  khatmah: KhatmahPlan | null;
  language?: string;
  now?: Date;
}): WidgetReadingBlock | null {
  const now = (input.now ?? new Date()).getTime();
  const plan = input.khatmah;
  const last = input.lastRead;
  if (!last && !plan) return null;

  // With a plan running, the plan's own page is the one to continue from —
  // the user may have browsed elsewhere since, and the widget's job is the
  // khatmah, not the last thing they happened to look at.
  const page = plan ? khatmahCurrentPage(plan) : (last?.page ?? 1);
  const pageMeta = MUSHAF_PAGES.find(p => p.page === page);
  const surah = plan
    ? (pageMeta?.start.surah ?? last?.surah ?? 1)
    : (last?.surah ?? 1);
  const ayah = plan ? (pageMeta?.start.ayah ?? 1) : (last?.ayah ?? 1);
  const meta = MUSHAF_SURAHS.find(s => s.number === surah);

  let khatmah: WidgetKhatmah | undefined;
  if (plan) {
    const { pagesToday, behindBy, daysLeft } = khatmahToday(plan, now);
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsed = Math.floor((now - plan.startedAt) / dayMs);
    const startedToday =
      plan.dayStartDate === dayKeyOf(new Date(now))
        ? (plan.dayStartPagesRead ?? plan.pagesRead)
        : plan.pagesRead;
    khatmah = {
      day: Math.max(1, Math.min(plan.targetDays, elapsed + 1)),
      targetDays: plan.targetDays,
      pagesToday,
      doneToday: Math.max(0, plan.pagesRead - startedToday),
      behindBy,
      daysLeft,
    };
  }

  return {
    surah,
    surahName: meta ? mushafSurahName(meta, input.language) : '',
    ayah,
    page,
    juz: juzForPage(page),
    pagesRead: plan ? plan.pagesRead : page,
    totalPages: KHATMAH_TOTAL_PAGES,
    bookmarks: input.bookmarks.length,
    lastReadAt: last?.updatedAt ?? null,
    ...(khatmah ? { khatmah } : {}),
  };
}

// ── Hijri ────────────────────────────────────────────────────────────

const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  'Rabi I',
  'Rabi II',
  'Jumada I',
  'Jumada II',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhul-Qa'dah",
  'Dhul-Hijjah',
] as const;

function hijriMonthName(month: number): string {
  const key = `hijri.month_${month}`;
  return i18n.exists(key) ? i18n.t(key) : HIJRI_MONTHS_EN[month - 1];
}

/**
 * Today's Hijri date plus the month after it.
 *
 * The forward walk is bounded at 32 days because a Hijri month is 29 or 30 —
 * an unbounded loop here would spin forever against a corrupt clock, and the
 * widget would take the whole extension's render budget with it.
 */
export function buildHijriBlock(now: Date = new Date()): WidgetHijriBlock {
  const h = gregorianToHijri(now);
  const cursor = noonOf(now);
  let inDays = 0;
  let nextMonth = h.month === 12 ? 1 : h.month + 1;
  for (let i = 1; i <= 32; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const step = gregorianToHijri(cursor);
    if (step.month !== h.month) {
      inDays = i;
      nextMonth = step.month;
      break;
    }
  }
  return {
    day: h.day,
    month: h.month,
    year: h.year,
    monthName: hijriMonthName(h.month),
    label: formatHijriLabel(now),
    nextMonthName: hijriMonthName(nextMonth),
    nextMonthInDays: inDays,
  };
}

// ── Tasbih ───────────────────────────────────────────────────────────

/**
 * The counter, as the interactive widget needs it.
 *
 * `counts` carries EVERY preset, not just the active one, because stepping
 * to the next dhikr must not look like it discarded the count you were on —
 * the screen keeps a per-preset map and the widget has to show the same
 * thing or the two will appear to disagree the first time someone uses both.
 */
export function buildTasbihBlock(input: {
  activeId: string;
  counts: Record<string, number>;
  /** Per-preset target override; falls back to the preset's own. */
  targets?: Record<string, number>;
}): WidgetTasbihBlock {
  const preset = findPreset(input.activeId);
  const index = Math.max(
    0,
    TASBIH_PRESETS.findIndex(p => p.id === preset.id),
  );
  const target = input.targets?.[preset.id] ?? preset.defaultTarget;
  const counts = TASBIH_PRESETS.map(p => input.counts[p.id] ?? 0);
  return {
    presetId: preset.id,
    label: i18n.t(preset.labelKey),
    arabic: preset.arabic,
    count: input.counts[preset.id] ?? 0,
    target,
    unbounded: preset.unboundedAfterTarget === true,
    index,
    total: TASBIH_PRESETS.length,
    counts,
    todayTotal: counts.reduce((a, b) => a + b, 0),
  };
}
