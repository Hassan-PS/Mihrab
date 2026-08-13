/**
 * End-of-day "log all as complete" reminder — v2.8.5.
 *
 * Logging the day is otherwise five separate acts of bookkeeping performed
 * while you are trying to pray. Most nights the honest answer is "all five,
 * yes" — so once the day's prayers are behind you, a single notification
 * asks exactly that, and one tap answers it without opening the app.
 *
 * ── Why the date travels in the payload ───────────────────────────────
 *
 * The prompt lands ten minutes after Isha, which in a Swedish summer is
 * near midnight. People sleep through it and answer in the morning, and a
 * handler that logged "today" would then credit the wrong day and leave
 * the real one blank — the exact failure the reminder exists to prevent.
 * So the notification carries the date it was scheduled FOR, and the
 * action writes to that date no matter when it is pressed. Answering
 * Tuesday's prompt on Wednesday logs Tuesday.
 *
 * Only unlogged prayers are filled in: a day where Asr was already marked
 * `missed` keeps that record. The button means "the rest went fine", not
 * "overwrite what I told you".
 *
 * ── And it does not ask a question already answered ───────────────────
 *
 * A day whose five prayers are all recorded gets no prompt. Being asked to
 * log a day you have just finished logging is the app failing to notice its
 * own record, and the fix is not to ask more quietly — it is not to ask.
 * The prompt is retired the moment the day completes (every journal write
 * calls `syncEndOfDayReminderForDay`) and restored if an entry is later
 * removed, because then the day genuinely is unfinished again.
 */
import notifee, {
  AndroidImportance,
  EventType,
  TriggerType,
  type Event,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import {
  coerceJournalEntries,
  getEntryStatus,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
} from '../journal/journal';
import { JOURNAL_KEY, notifyPracticeChanged } from '../practice/practiceStore';
import type { TimingsMap } from '../types/prayer';

/** The action's id — also the iOS category, one action inside it. */
export const END_OF_DAY_ACTION_ID = 'log-day-all';
export const END_OF_DAY_CATEGORY_ID = 'end_of_day_log';

/** Stable prefix so a resync cancels only these. */
const ID_PREFIX = 'eod-log-';

const CHANNEL_ID = 'prayer_app_end_of_day_log';

/**
 * Ten minutes after Isha. Long enough that the prayer itself is done and
 * the phone has been picked up again; short enough to still be the same
 * evening rather than a next-day chore.
 */
const MINUTES_AFTER_ISHA = 10;

/** How far ahead to schedule, so the reminder survives a week unopened. */
const DAYS_AHEAD = 7;

const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** Local ISO day key — the day the user is living in, not UTC. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * "21:40" / "21:40 (CEST)" → a Date on `day`. Returns null for anything
 * unparseable rather than guessing: a reminder at the wrong hour is worse
 * than no reminder.
 */
export function ishaTriggerAt(
  day: Date,
  timings: TimingsMap | undefined,
): Date | null {
  const raw = timings?.Isha;
  if (typeof raw !== 'string') return null;
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const at = new Date(day);
  at.setHours(hour, minute, 0, 0);
  return new Date(at.getTime() + MINUTES_AFTER_ISHA * 60_000);
}

async function ensureChannel(): Promise<string> {
  if (Platform.OS !== 'android') return CHANNEL_ID;
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('endOfDay.channelName', 'End-of-day log'),
    // A question, not an alarm: it must not interrupt, only wait.
    importance: AndroidImportance.DEFAULT,
  });
}

/** iOS needs the action declared on a category before it can be shown. */
async function ensureIosCategory(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const existing = await notifee.getNotificationCategories().catch(() => []);
  const others = existing.filter(c => c.id !== END_OF_DAY_CATEGORY_ID);
  await notifee.setNotificationCategories([
    ...others,
    {
      id: END_OF_DAY_CATEGORY_ID,
      actions: [
        {
          id: END_OF_DAY_ACTION_ID,
          title: i18n.t('endOfDay.action', 'Log all as complete'),
        },
      ],
    },
  ]);
}

/** Cancel every pending end-of-day reminder. */
export async function cancelEndOfDayLogReminders(): Promise<void> {
  const ids = await notifee.getTriggerNotificationIds().catch(() => []);
  const mine = ids.filter(id => id.startsWith(ID_PREFIX));
  if (mine.length) await notifee.cancelTriggerNotifications(mine);
}

/** Every one of the five recorded — whatever the statuses are. A day of
 *  five `missed` is still a day that has been accounted for, and asking
 *  about it would be asking someone to re-live it. */
export function dayIsFullyLogged(
  entries: JournalEntry[],
  date: string,
): boolean {
  return PRAYERS.every(p => Boolean(getEntryStatus(entries, date, p)));
}

/**
 * Retire the prompt for `date` once its day is complete.
 *
 * Called from every journal write, so the prompt disappears the moment the
 * fifth prayer goes in rather than at the next sync — the window between
 * "I have logged everything" and "Log today's prayers?" is exactly where
 * the annoyance lives.
 *
 * Cancel-only by design. Restoring a prompt needs that day's Isha time,
 * which lives in the prayer-times cache and is not this module's business;
 * un-logging a prayer therefore brings the prompt back at the next resync,
 * which happens when the app next comes to the foreground — and the user
 * who just un-logged something is, definitionally, in the app.
 */
export async function syncEndOfDayReminderForDay(
  date: string,
  entries: JournalEntry[],
): Promise<void> {
  if (!dayIsFullyLogged(entries, date)) return;
  await notifee
    .cancelTriggerNotification(`${ID_PREFIX}${date}`)
    .catch(() => {});
  await notifee.cancelNotification(`${ID_PREFIX}${date}`).catch(() => {});
}

/** The journal as stored, or [] when there is none / it is unreadable. */
async function storedEntries(): Promise<JournalEntry[]> {
  const raw = await durableEncryptedGet(JOURNAL_KEY).catch(() => null);
  if (!raw) return [];
  try {
    return coerceJournalEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Rebuild the rolling window of reminders.
 *
 * Idempotent: ids are derived from the date, so re-running replaces rather
 * than duplicates. Called on the same foreground/settings resync as the
 * other daily schedulers.
 */
export async function rescheduleEndOfDayLogReminders(params: {
  enabled: boolean;
  /** Consecutive cached days starting today (`week[0]` = today). */
  week?: TimingsMap[];
  /** The local calendar day `week[0]` was fetched for. */
  baseDate?: Date;
  now?: Date;
  /** The journal, when the caller already has it in hand. Read from
   *  encrypted storage otherwise — a day that is fully logged gets no
   *  prompt, so this is needed either way. */
  entries?: JournalEntry[];
}): Promise<void> {
  await cancelEndOfDayLogReminders();
  if (!params.enabled) return;
  const week = params.week ?? [];
  if (!week.length) return;

  const now = params.now ?? new Date();
  const base = params.baseDate ?? now;
  const channelId = await ensureChannel();
  await ensureIosCategory();
  // Read once, outside the loop: the journal is encrypted and this runs on
  // every foreground resync.
  const entries = params.entries ?? (await storedEntries());

  for (let i = 0; i < Math.min(week.length, DAYS_AHEAD); i++) {
    const day = new Date(base);
    day.setDate(day.getDate() + i);
    const at = ishaTriggerAt(day, week[i]);
    if (!at || at.getTime() <= now.getTime()) continue;
    const target = ymd(day);
    // Today may already be fully logged by the time this runs — someone who
    // logs each prayer as they pray it has answered the question before it
    // is asked. Tomorrow and later can be complete too, if the day was
    // filled in ahead by the backfill button.
    if (dayIsFullyLogged(entries, target)) continue;
    await notifee
      .createTriggerNotification(
        {
          id: `${ID_PREFIX}${target}`,
          title: i18n.t('endOfDay.title', 'Log today’s prayers?'),
          body: i18n.t(
            'endOfDay.body',
            'Mark all five as prayed on time, or open the Log to fill them in one by one.',
          ),
          // The date this prompt is ABOUT. Read back by the action handler
          // so a late answer still lands on the right day.
          data: { targetDate: target },
          ios: { categoryId: END_OF_DAY_CATEGORY_ID },
          android: {
            channelId,
            smallIcon: 'ic_stat_prayer',
            pressAction: { id: 'default' },
            actions: [
              {
                title: i18n.t('endOfDay.action', 'Log all as complete'),
                pressAction: { id: END_OF_DAY_ACTION_ID },
              },
            ],
          },
        },
        { type: TriggerType.TIMESTAMP, timestamp: at.getTime() },
      )
      .catch(() => {});
  }
}

/**
 * Fill every UNLOGGED prayer of `date` with 'on-time', leaving the rest of
 * the journal — and every already-recorded prayer — untouched. Returns the
 * SAME array when there was nothing to add, so callers can skip the write.
 *
 * Deliberately additive: a day where Asr was marked `missed` keeps that
 * record. The button means "the rest went fine", not "overwrite what I
 * told you".
 */
export function fillDayOnTime(
  entries: JournalEntry[],
  date: string,
  now: Date = new Date(),
): JournalEntry[] {
  let next = entries;
  for (const p of PRAYERS) {
    if (!getEntryStatus(next, date, p)) {
      next = upsertEntry(next, date, p, 'on-time', now);
    }
  }
  return next;
}

/**
 * Mark every unlogged prayer of `date` as on-time in the stored journal.
 * Returns true when something was written.
 */
export async function logAllPrayersOnTime(date: string): Promise<boolean> {
  const raw = await durableEncryptedGet(JOURNAL_KEY).catch(() => null);
  let entries: JournalEntry[] = [];
  if (raw) {
    try {
      entries = coerceJournalEntries(JSON.parse(raw));
    } catch {
      entries = [];
    }
  }
  const next = fillDayOnTime(entries, date);
  if (next === entries) return false;
  await durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next));
  notifyPracticeChanged();
  return true;
}

/**
 * Handle a press on the reminder's action. Returns true when the event
 * belonged to this feature, so the caller can stop looking.
 */
export async function handleEndOfDayLogEvent(event: Event): Promise<boolean> {
  const { type, detail } = event;
  if (type !== EventType.ACTION_PRESS) return false;
  if (detail.pressAction?.id !== END_OF_DAY_ACTION_ID) return false;

  const notification = detail.notification;
  const fromData = notification?.data?.targetDate;
  // The id carries the same date, so a payload lost to a cold start (or an
  // OS that drops `data`) still resolves to the right day.
  const fromId =
    typeof notification?.id === 'string' &&
    notification.id.startsWith(ID_PREFIX)
      ? notification.id.slice(ID_PREFIX.length)
      : null;
  const target =
    typeof fromData === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fromData)
      ? fromData
      : fromId && /^\d{4}-\d{2}-\d{2}$/.test(fromId)
      ? fromId
      : null;
  if (!target) return true;

  await logAllPrayersOnTime(target).catch(() => false);
  if (notification?.id) {
    await notifee.cancelNotification(notification.id).catch(() => {});
  }
  return true;
}
