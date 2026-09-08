/**
 * Firing the user's own reminders — issue #29.
 *
 * The model and the times live in `src/dhikr/dhikrReminders.ts`; this is
 * only the part that talks to notifee, and it is the same shape as every
 * other reminder here: cancel by prefix, then write a rolling window of
 * absolute TIMESTAMP triggers with stable ids, rolled forward by the
 * daily resync. notifee has no repeating trigger that survives a
 * timezone change the way a list of instants recomputed from the current
 * zone does.
 *
 * ── OFFLINE, WHICH WAS THE ACTUAL REQUEST ─────────────────────────────
 *
 * #29 asked for reminders that work "100% offline, without requiring an
 * Internet connection". Nothing here reaches the network — not for the
 * time, not for the words, not for the sound — and the triggers are held
 * by the operating system, so they fire with the app closed, after a
 * reboot, and in flight mode.
 *
 * ── THE BUDGET, AND WHY IT IS NOT GENEROUS ────────────────────────────
 *
 * iOS keeps only the 64 soonest pending notifications an app has
 * registered and silently drops the rest. Prayers, their pre-reminders
 * and the second-time alerts already spend most of that. So this is
 * capped twice: a short look-ahead, and a hard ceiling on how many of
 * these may be pending at once — the soonest first. A dhikr reminder
 * must never be the reason somebody's Fajr alert did not arrive.
 *
 * ── TWO CHANNELS ──────────────────────────────────────────────────────
 *
 * On Android a sound is a property of a channel, not of a notification,
 * so "silent" is a second channel rather than a flag. That is the same
 * reason `notificationSounds.ts` has one channel per adhan.
 */
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import i18n from '../i18n';
import { ROUTE_DHIKR } from './notificationRoute';
import { dhikrArabic, findDhikr } from '../dhikr/dhikr';
import {
  reminderOccurrences,
  type DhikrReminder,
} from '../dhikr/dhikrReminders';

const DHIKR_ID_PREFIX = 'dhikr-rem-';
export const DHIKR_REMINDER_CHANNEL_ID = 'prayer_app_dhikr_reminders';
export const DHIKR_REMINDER_SILENT_CHANNEL_ID =
  'prayer_app_dhikr_reminders_silent';

/** Days of cover, and the ceiling described in the header. */
export const DHIKR_LOOK_AHEAD_DAYS = 3;
export const DHIKR_PENDING_LIMIT = 24;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** `HH:mm` of a Date — part of an id, so two a day never collide. */
function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export async function cancelAllDhikrReminders(): Promise<void> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const mine = ids.filter(id => id.startsWith(DHIKR_ID_PREFIX));
    if (mine.length > 0) await notifee.cancelTriggerNotifications(mine);
  } catch {
    // Nothing scheduled, or the store is unavailable. Either way there is
    // nothing to cancel and what gets written below is what matters.
  }
}

/**
 * What one reminder says, in the language the app is in right now.
 *
 * A preset names its dhikr and shows the words; a custom one shows
 * exactly what the user wrote and nothing the app made up. The Arabic is
 * the body rather than the title because a title is truncated first on
 * both platforms, and the words are the point.
 */
export function reminderText(reminder: DhikrReminder): {
  title: string;
  body: string;
} {
  if (!reminder.dhikr) {
    return {
      title: reminder.title?.trim() || i18n.t('dhikr.customTitle', 'Reminder'),
      body: reminder.body?.trim() ?? '',
    };
  }
  const entry = findDhikr(reminder.dhikr);
  if (!entry) return { title: i18n.t('dhikr.customTitle', 'Reminder'), body: '' };
  return {
    title: i18n.t(entry.meaningKey),
    body: dhikrArabic(entry),
  };
}

async function scheduleOne(opts: {
  id: string;
  at: Date;
  reminder: DhikrReminder;
}): Promise<void> {
  const { title, body } = reminderText(opts.reminder);
  const silent = opts.reminder.sound === 'silent';
  try {
    await notifee.createTriggerNotification(
      {
        id: opts.id,
        title,
        body,
        // A preset reminder opens the counter for those words; see
        // notificationRoute. A custom one has nothing to count, and
        // opening the app is the honest answer.
        data: opts.reminder.dhikr
          ? { route: ROUTE_DHIKR, dhikr: opts.reminder.dhikr }
          : { route: ROUTE_DHIKR },
        android: {
          channelId: silent
            ? DHIKR_REMINDER_SILENT_CHANNEL_ID
            : DHIKR_REMINDER_CHANNEL_ID,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default', launchActivity: 'default' },
        },
        ...(silent ? {} : { ios: { sound: 'default' } }),
      },
      { type: TriggerType.TIMESTAMP, timestamp: opts.at.getTime() },
    );
  } catch (e) {
    console.warn('Failed to schedule dhikr reminder', opts.id, e);
  }
}

/**
 * Every instant to write, soonest first and already capped.
 *
 * Pure and exported: the ordering and the ceiling are the two things
 * worth testing without a notification system, and the ceiling is the
 * one that protects the prayer alerts.
 */
export function dhikrSchedule(opts: {
  reminders: readonly DhikrReminder[];
  now: Date;
  days?: number;
  limit?: number;
}): { reminder: DhikrReminder; at: Date }[] {
  const out: { reminder: DhikrReminder; at: Date }[] = [];
  for (const reminder of opts.reminders) {
    for (const at of reminderOccurrences({
      reminder,
      now: opts.now,
      days: opts.days ?? DHIKR_LOOK_AHEAD_DAYS,
    })) {
      out.push({ reminder, at });
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out.slice(0, opts.limit ?? DHIKR_PENDING_LIMIT);
}

export async function rescheduleDhikrReminders(opts: {
  reminders: readonly DhikrReminder[];
  now?: Date;
}): Promise<void> {
  await cancelAllDhikrReminders();
  const enabled = opts.reminders.filter(r => r.enabled);
  if (enabled.length === 0) return;

  const now = opts.now ?? new Date();
  const due = dhikrSchedule({ reminders: enabled, now });
  if (due.length === 0) return;

  try {
    await notifee.createChannel({
      id: DHIKR_REMINDER_CHANNEL_ID,
      name: i18n.t('settings.dhikrRemindersChannel', 'Dhikr reminders'),
      importance: AndroidImportance.DEFAULT,
    });
    if (due.some(d => d.reminder.sound === 'silent')) {
      await notifee.createChannel({
        id: DHIKR_REMINDER_SILENT_CHANNEL_ID,
        name: i18n.t(
          'settings.dhikrRemindersSilentChannel',
          'Dhikr reminders (silent)',
        ),
        importance: AndroidImportance.LOW,
        sound: undefined,
      });
    }
  } catch {
    // Non-fatal: Android falls back to a default channel, iOS has none.
  }

  for (const { reminder, at } of due) {
    await scheduleOne({
      id: `${DHIKR_ID_PREFIX}${reminder.id}-${ymd(at)}-${hm(at)}`,
      at,
      reminder,
    });
  }
}
