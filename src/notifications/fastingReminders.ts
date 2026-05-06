/**
 * Fasting reminders — task #98.
 *
 * Schedules a one-shot notifee notification the evening before each
 * Monday, Thursday, and curated special fasting day (Ashura, Arafah,
 * White Days 13–15, 6 of Shawwal, 1 Ramadan).
 *
 * Strategy:
 *   • Look ahead 60 days from now.
 *   • For each candidate day, compute the trigger as the user's chosen
 *     reminder hour on the *previous* day. Skip past triggers.
 *   • Schedule each as a TIMESTAMP trigger with a stable id so we can
 *     cancel on disable / re-schedule on settings changes.
 *   • Cap at 30 future reminders to stay under platform schedule limits.
 *
 * Notifications are visible system notifications — not the prayer-adhan
 * style — so they don't sound an adhan. Just a gentle reminder.
 */

import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import i18n from '../i18n';
import { gregorianToHijri } from '../hijri/convert';

/** Stable prefix so we can cancel only fasting reminders without
 *  touching prayer notifications. */
const FASTING_REMINDER_ID_PREFIX = 'fast-rem-';

const FASTING_CHANNEL_ID = 'prayer_app_fasting_reminders';

type CandidateDay = {
  /** ISO yyyy-mm-dd of the fast day itself. */
  date: Date;
  /** Stable id suffix for the trigger (e.g. 'mon-2026-05-11'). */
  idSuffix: string;
  /** i18n body key suffix. */
  reasonKey:
    | 'monday'
    | 'thursday'
    | 'whiteDays'
    | 'ashura'
    | 'arafah'
    | 'sixOfShawwal'
    | 'ramadanBegins';
  /** English fallback. */
  reasonEn: string;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isMonOrThu(d: Date): 'monday' | 'thursday' | null {
  const dow = d.getDay();
  if (dow === 1) return 'monday';
  if (dow === 4) return 'thursday';
  return null;
}

/** Walk N days forward from `from` and collect every candidate day. */
function collectCandidates(from: Date, lookAheadDays: number): CandidateDay[] {
  const out: CandidateDay[] = [];
  const cur = new Date(from);
  for (let i = 0; i < lookAheadDays; i++) {
    const dow = isMonOrThu(cur);
    if (dow === 'monday') {
      out.push({
        date: new Date(cur),
        idSuffix: `mon-${ymd(cur)}`,
        reasonKey: 'monday',
        reasonEn: 'Tomorrow is Monday — a Sunnah fast.',
      });
    } else if (dow === 'thursday') {
      out.push({
        date: new Date(cur),
        idSuffix: `thu-${ymd(cur)}`,
        reasonKey: 'thursday',
        reasonEn: 'Tomorrow is Thursday — a Sunnah fast.',
      });
    }
    const h = gregorianToHijri(cur);
    if (h.month === 1 && h.day === 10) {
      out.push({
        date: new Date(cur),
        idSuffix: `ashura-${ymd(cur)}`,
        reasonKey: 'ashura',
        reasonEn: "Tomorrow is the Day of Ashura — fasting it expiates the past year.",
      });
    } else if (h.month === 12 && h.day === 9) {
      out.push({
        date: new Date(cur),
        idSuffix: `arafah-${ymd(cur)}`,
        reasonKey: 'arafah',
        reasonEn: "Tomorrow is the Day of Arafah — fasting it expiates two years.",
      });
    } else if (h.day === 13 || h.day === 14 || h.day === 15) {
      // White Days — every Hijri month (skipping during Ramadan since
      // the whole month is fast).
      if (h.month !== 9) {
        out.push({
          date: new Date(cur),
          idSuffix: `white-${ymd(cur)}`,
          reasonKey: 'whiteDays',
          reasonEn: 'Tomorrow is one of the White Days — a Sunnah fast every Hijri month.',
        });
      }
    } else if (h.month === 10 && h.day >= 2 && h.day <= 7) {
      out.push({
        date: new Date(cur),
        idSuffix: `shawwal-${ymd(cur)}`,
        reasonKey: 'sixOfShawwal',
        reasonEn: 'Tomorrow is one of the Six of Shawwal — fast six days after Eid for Ramadan-equivalent reward.',
      });
    } else if (h.month === 9 && h.day === 1) {
      out.push({
        date: new Date(cur),
        idSuffix: `ramadan-${ymd(cur)}`,
        reasonKey: 'ramadanBegins',
        reasonEn: 'Ramadan begins tomorrow — may Allah grant you strength to fast it.',
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Cancel every previously-scheduled fasting reminder. Use before
 * re-scheduling, or when the user disables the toggle.
 */
export async function cancelAllFastingReminders(): Promise<void> {
  try {
    const triggers = await notifee.getTriggerNotificationIds();
    const ours = triggers.filter(id => id.startsWith(FASTING_REMINDER_ID_PREFIX));
    if (ours.length > 0) {
      await Promise.all(ours.map(id => notifee.cancelTriggerNotification(id)));
    }
  } catch (e) {
    console.warn('cancelAllFastingReminders failed:', e);
  }
}

/**
 * Re-schedule all fasting reminders for the next 60 days at the user's
 * chosen reminder hour the evening before. Replaces any existing
 * reminders. No-op when `enabled` is false (after cancelling).
 */
export async function rescheduleFastingReminders(opts: {
  enabled: boolean;
  hour: number;
  now?: Date;
}): Promise<void> {
  await cancelAllFastingReminders();
  if (!opts.enabled) return;
  const hour = Math.max(0, Math.min(23, opts.hour));
  const now = opts.now ?? new Date();

  // Ensure the channel exists (Android no-op on iOS).
  try {
    await notifee.createChannel({
      id: FASTING_CHANNEL_ID,
      name: i18n.t('fasting.reminderChannelName', 'Fasting reminders'),
      importance: AndroidImportance.DEFAULT,
    });
  } catch {
    // Non-fatal.
  }

  const candidates = collectCandidates(now, 60);
  let scheduled = 0;
  for (const c of candidates) {
    if (scheduled >= 30) break; // Stay under platform limits.
    // Trigger: previous day at the user's hour.
    const trigger = new Date(c.date);
    trigger.setDate(trigger.getDate() - 1);
    trigger.setHours(hour, 0, 0, 0);
    if (trigger.getTime() <= now.getTime()) continue;

    const id = `${FASTING_REMINDER_ID_PREFIX}${c.idSuffix}`;
    const body = i18n.t(`fasting.reminder.${c.reasonKey}`, c.reasonEn);
    try {
      await notifee.createTriggerNotification(
        {
          id,
          title: i18n.t('fasting.reminderTitle', 'Fasting reminder'),
          body,
          android: {
            channelId: FASTING_CHANNEL_ID,
            // Same monochrome status-bar icon as the prayer-time
            // notifications so every Mihrab notification reads as one
            // family in the system tray. Without an explicit smallIcon
            // Android falls back to a default white circle.
            smallIcon: 'ic_stat_prayer',
            pressAction: { id: 'open-fasting' },
          },
          ios: {
            sound: 'default',
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: trigger.getTime(),
        },
      );
      scheduled += 1;
    } catch (e) {
      console.warn('Failed to schedule fasting reminder', id, e);
    }
  }
}
