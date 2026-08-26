/**
 * "Log prayer" on a prayer-time notification — the half that writes.
 *
 * The action has been on the notification since v2.4, and it did nothing to
 * the journal. Pressing it ran a handler in LogScreen that highlighted the
 * matching row for four seconds, which is useful only if the Log tab happens
 * to be mounted and the app is in the foreground — and someone pressing a
 * button on a notification is by definition not looking at the Log tab. With
 * the app backgrounded or closed, the press did nothing at all: the button
 * dismissed itself and the prayer stayed unlogged. Reported 2026-08-07.
 *
 * So the press now writes the entry itself, from the background handler,
 * exactly as the end-of-day reminder's action does. The highlight in
 * LogScreen stays for the case where the screen IS open — it now marks a row
 * that has just been filled in rather than one the user still has to fill.
 *
 * ── Which day it lands on ─────────────────────────────────────────────
 *
 * The date travels in the notification, and the write goes to THAT date, not
 * to whatever day it is when the button is pressed. Isha fires at 23:40 in a
 * Swedish winter and is answered at 00:05; "today" would then credit the
 * wrong day and leave the real one blank. The id (`pt-<epochMs>-<Prayer>`)
 * carries the same instant, so a payload lost to a cold start still resolves.
 *
 * ── Why 'on-time' ─────────────────────────────────────────────────────
 *
 * The button is pressed while the notification is on screen, which is to say
 * within the prayer's own window. Recording anything else would be inventing
 * a claim the user did not make; someone who prayed late will open the app
 * and say so, and this entry is editable like any other.
 */
import notifee, { EventType, type Event } from '@notifee/react-native';
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
import {
  coerceSunnahLog,
  dayAt,
  fieldFor,
  setSunnah,
  SUNNAH_UNITS,
  type SunnahLog,
} from '../journal/sunnah';
import {
  JOURNAL_KEY,
  SUNNAH_KEY,
  notifyPracticeChanged,
} from '../practice/practiceStore';
import { syncEndOfDayReminderForDay } from './endOfDayLog';

/**
 * The action's id. Defined HERE and re-exported to `prayerNotifications`
 * rather than the other way round: the background handler must not import
 * the scheduler, which pulls in i18n, settings and the whole prayer-times
 * stack for a press that only needs to write one line to the journal.
 */
export const JOURNAL_LOG_ACTION_ID = 'journal-log-prayer';
const LOG_ACTION_ID = JOURNAL_LOG_ACTION_ID;

/**
 * "Log with sunnah" — the same write plus that prayer's sunnah prayers.
 *
 * A separate id rather than a flag on the payload, because the payload is the
 * part a notification relay is free to drop: a watch that strips `data` still
 * sends the id, and the id alone has to say both which prayer and which of
 * the two buttons was pressed.
 *
 * It fills ONLY that prayer's own sunnah — Fajr 1, Dhuhr 2, Maghrib 1,
 * Isha 2. Witr and Qiyam al-Layl are left alone even on Isha: they are
 * prayed later in the night, and a button pressed as Isha comes in cannot
 * honestly claim them.
 */
export const JOURNAL_LOG_SUNNAH_ACTION_ID = 'journal-log-sunnah';
const LOG_SUNNAH_ACTION_ID = JOURNAL_LOG_SUNNAH_ACTION_ID;

/** Must match PRAYER_NOTIFICATION_ID_PREFIX in prayerNotifications.ts. */
const PRAYER_ID_PREFIX = 'pt-';

const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** Local ISO day key — the day the user is living in, not UTC. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The prayer named by an action id, or null when the id is not ours.
 *
 * Android ids carry the prayer — `journal-log-prayer:Maghrib` — because the
 * action is built per notification. iOS actions are declared once on a
 * category and cannot vary per notification, so there the id is bare and the
 * prayer comes from the payload instead; `isLogActionId` covers both.
 */
export function prayerFromActionId(
  id: string | undefined,
): JournalPrayer | null {
  if (typeof id !== 'string') return null;
  const prefix = id.startsWith(`${LOG_SUNNAH_ACTION_ID}:`)
    ? LOG_SUNNAH_ACTION_ID
    : id.startsWith(`${LOG_ACTION_ID}:`)
      ? LOG_ACTION_ID
      : null;
  if (!prefix) return null;
  const name = id.slice(prefix.length + 1);
  return (PRAYERS as string[]).includes(name) ? (name as JournalPrayer) : null;
}

/** Does this action id belong to either of the two log buttons? */
export function isLogActionId(id: string | undefined): boolean {
  if (typeof id !== 'string') return false;
  return (
    id === LOG_ACTION_ID ||
    id.startsWith(`${LOG_ACTION_ID}:`) ||
    id === LOG_SUNNAH_ACTION_ID ||
    id.startsWith(`${LOG_SUNNAH_ACTION_ID}:`)
  );
}

/** Is this the "Log with sunnah" button rather than the plain one? */
export function isSunnahLogActionId(id: string | undefined): boolean {
  if (typeof id !== 'string') return false;
  return (
    id === LOG_SUNNAH_ACTION_ID || id.startsWith(`${LOG_SUNNAH_ACTION_ID}:`)
  );
}

/** The prayer a press is about: the id if it names one, else the payload. */
export function prayerForPress(
  id: string | undefined,
  data: Record<string, unknown> | undefined,
): JournalPrayer | null {
  const fromId = prayerFromActionId(id);
  if (fromId) return fromId;
  const fromData = data?.prayer;
  return typeof fromData === 'string' &&
    (PRAYERS as string[]).includes(fromData)
    ? (fromData as JournalPrayer)
    : null;
}

/**
 * Which day the press belongs to: the payload first, then the timestamp
 * baked into the notification id, and only then the clock. The fallback is
 * last on purpose — see the header.
 */
export function targetDateForPress(
  data: Record<string, unknown> | undefined,
  notificationId: string | undefined,
  now: Date = new Date(),
): string {
  const fromData = data?.targetDate;
  if (typeof fromData === 'string' && DATE_RE.test(fromData)) return fromData;
  if (
    typeof notificationId === 'string' &&
    notificationId.startsWith(PRAYER_ID_PREFIX)
  ) {
    const epoch = Number(
      notificationId.slice(PRAYER_ID_PREFIX.length).split('-')[0],
    );
    if (Number.isFinite(epoch) && epoch > 0) return ymd(new Date(epoch));
  }
  return ymd(now);
}

/**
 * Record `prayer` on `date` as on-time unless it already carries a status.
 * Returns false when there was nothing to write, so an accidental double
 * press cannot overwrite a "missed" the user set deliberately.
 */
export async function logPrayerOnTime(
  date: string,
  prayer: JournalPrayer,
  now: Date = new Date(),
): Promise<boolean> {
  const raw = await durableEncryptedGet(JOURNAL_KEY).catch(() => null);
  let entries: JournalEntry[] = [];
  if (raw) {
    try {
      entries = coerceJournalEntries(JSON.parse(raw));
    } catch {
      entries = [];
    }
  }
  if (getEntryStatus(entries, date, prayer)) return false;
  const next = upsertEntry(entries, date, prayer, 'on-time', now);
  await durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next));
  notifyPracticeChanged();
  // Logging the fifth prayer of the day should retire that evening's
  // "log today's prayers?" prompt — see syncEndOfDayReminderForDay.
  await syncEndOfDayReminderForDay(date, next).catch(() => {});
  return true;
}

/**
 * Fill `prayer`'s own sunnah for `date`.
 *
 * Additive, like the fard write beside it: a count already recorded is left
 * alone rather than raised to the maximum, so pressing the button after
 * logging one of Dhuhr's two by hand cannot silently claim the second.
 * Witr and Qiyam are not touched — see JOURNAL_LOG_SUNNAH_ACTION_ID.
 */
export async function logSunnahFor(
  date: string,
  prayer: JournalPrayer,
): Promise<boolean> {
  const max = SUNNAH_UNITS[prayer] ?? 0;
  const field = fieldFor(prayer);
  if (max <= 0 || !field) return false;
  const raw = await durableEncryptedGet(SUNNAH_KEY).catch(() => null);
  let log: SunnahLog = {};
  if (raw) {
    try {
      log = coerceSunnahLog(JSON.parse(raw));
    } catch {
      log = {};
    }
  }
  // Anything the user already recorded by hand is theirs. The comment above
  // has always said so; the code said `>= max`, which left one of Dhuhr's
  // two rak'ah looking like an empty slot for this button to fill — and
  // worse, it re-filled a sunnah the user had deliberately UN-logged
  // earlier the same day, so clearing it from the Log screen appeared not
  // to stick (reported 2026-08-26).
  const already = dayAt(log, date)[field] as number;
  if (already > 0) return false;
  const next = setSunnah(log, date, { [field]: max });
  await durableEncryptedSet(SUNNAH_KEY, JSON.stringify(next));
  notifyPracticeChanged();
  return true;
}

/**
 * Handle a press on either of a prayer notification's log actions. Returns
 * true when the event belonged to this feature, so the caller stops looking.
 */
export async function handlePrayerLogEvent(event: Event): Promise<boolean> {
  const { type, detail } = event;
  if (type !== EventType.ACTION_PRESS) return false;
  const actionId = detail.pressAction?.id;
  if (!isLogActionId(actionId)) return false;

  const notification = detail.notification;
  const data = notification?.data as Record<string, unknown> | undefined;
  const prayer = prayerForPress(actionId, data);
  // The press was ours, so return true either way — falling through to the
  // adhan handler with an unidentifiable prayer would only stop the adhan.
  if (!prayer) return true;

  const date = targetDateForPress(
    data,
    typeof notification?.id === 'string' ? notification.id : undefined,
  );
  await logPrayerOnTime(date, prayer).catch(() => false);
  // The sunnah AFTER the fard, and in its own store: the fard is the entry
  // that matters, and it must land even if this half throws.
  if (isSunnahLogActionId(actionId)) {
    await logSunnahFor(date, prayer).catch(() => false);
  }
  // Clear the alert: the question it asked has been answered.
  if (notification?.id) {
    await notifee.cancelNotification(notification.id).catch(() => {});
  }
  return true;
}
