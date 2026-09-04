/**
 * Morning and evening adhkār reminders.
 *
 * The two sets of duas that are not said whenever you think of them —
 * they belong to a window in the day, and the window is defined by the
 * sun rather than by the clock:
 *
 *   • Morning — after Fajr, before sunrise.
 *   • Evening — after ʿAṣr, before sunset.
 *
 * Which is why this cannot be the ayah-of-the-day pattern with a picker.
 * "07:30" is the right time for morning adhkār in Stockholm in November
 * and two hours after sunrise in June; the same number cannot be both,
 * and asking someone to keep re-picking it as the year turns is asking
 * them to do the app's arithmetic. So there is no time to choose: a
 * toggle, and the time comes from the day's own prayer times.
 *
 * ── WHERE IN THE WINDOW ───────────────────────────────────────────────
 *
 * Not at its start: a notification that arrives while you are praying is
 * an interruption of the thing it is reminding you about. Not at its end
 * either — a reminder that lands as the window closes is a reproach.
 * `OFFSET_MINUTES` after the opening prayer, which is about when the
 * prayer is finished and the phone is picked up again.
 *
 * That offset is a preference, not a promise, and the window wins: at 60°
 * north in June, Fajr to sunrise is a matter of minutes, and a fixed
 * twenty would put the morning reminder after the window it names. So
 * the time is clamped to end a little before the window closes, and a
 * window too short to hold even that gets no notification at all rather
 * than a wrong one. The same arithmetic in reverse never happens for the
 * evening — ʿAṣr to sunset is hours — but it is written once and used by
 * both, because "it cannot happen" is how the polar-latitude bugs in
 * this app have always started.
 *
 * Scheduling mirrors `endOfDayLog.ts`: stable ids, one TIMESTAMP trigger
 * per day over the cached week, cancelled and rebuilt on every resync.
 * The times come from the same `week` + `baseDate` the prayer alerts use,
 * which is the only place in the app holding real times for future days
 * anchored to the day they were fetched for.
 */
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import type { TimingsMap } from '../types/prayer';

/** Stable prefix so a resync cancels only these. */
const ID_PREFIX = 'dua-adhkar-';

const CHANNEL_ID = 'prayer_app_dua_reminders';

/** How far after the opening prayer the reminder aims to land. */
export const OFFSET_MINUTES = 20;

/**
 * How much of the window's tail is left alone.
 *
 * A reminder at sunrise minus one minute is a reminder you cannot act on.
 */
const TAIL_MINUTES = 5;

/** How many cached days to cover. The week is all there ever is. */
const DAYS_AHEAD = 7;

export type DuaReminderKind = 'morning' | 'evening';

/** "05:12" / "05:12 (CEST)" → minutes past midnight, or null. */
export function clockMinutes(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Where in `[opens, closes)` the reminder lands, in minutes past
 * midnight — or null when the window cannot hold one.
 *
 * Exported for the tests, which is where the polar cases live: this is
 * three lines of arithmetic that decide whether a Norwegian June gets a
 * reminder before sunrise or one after it.
 */
export function reminderMinute(
  opens: number | null,
  closes: number | null,
): number | null {
  if (opens == null || closes == null) return null;
  // A window that does not open before it closes is not a window. This
  // happens for real: a day with no true dawn reports times that cross.
  if (closes <= opens) return null;
  const at = Math.min(opens + OFFSET_MINUTES, closes - TAIL_MINUTES);
  // Everything has been squeezed out — better to say nothing than to
  // name a window and then fire outside it.
  return at > opens ? at : null;
}

/** The two windows a day offers, by the prayer names that bound them. */
const WINDOWS: Record<DuaReminderKind, { opens: string; closes: string }> = {
  morning: { opens: 'Fajr', closes: 'Sunrise' },
  evening: { opens: 'Asr', closes: 'Maghrib' },
};

/** When `kind`'s reminder falls on `day`, or null if it cannot. */
export function reminderAt(
  kind: DuaReminderKind,
  day: Date,
  timings: TimingsMap | undefined,
): Date | null {
  const w = WINDOWS[kind];
  const minute = reminderMinute(
    clockMinutes(timings?.[w.opens as keyof TimingsMap]),
    clockMinutes(timings?.[w.closes as keyof TimingsMap]),
  );
  if (minute == null) return null;
  const at = new Date(day);
  at.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return at;
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function ensureChannel(): Promise<string> {
  if (Platform.OS !== 'android') return CHANNEL_ID;
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('duaReminders.channelName', 'Morning and evening duas'),
    // An invitation, not an alarm.
    importance: AndroidImportance.DEFAULT,
  });
}

/** Cancel every pending adhkār reminder. */
export async function cancelDuaReminders(): Promise<void> {
  const ids = await notifee.getTriggerNotificationIds().catch(() => []);
  const mine = ids.filter(id => id.startsWith(ID_PREFIX));
  if (mine.length) await notifee.cancelTriggerNotifications(mine);
}

export async function rescheduleDuaReminders(params: {
  morning: boolean;
  evening: boolean;
  /** Consecutive cached days starting today (`week[0]` = today). */
  week?: TimingsMap[];
  /** The local calendar day `week[0]` was fetched for. */
  baseDate?: Date;
  now?: Date;
}): Promise<void> {
  await cancelDuaReminders();
  const kinds: DuaReminderKind[] = [];
  if (params.morning) kinds.push('morning');
  if (params.evening) kinds.push('evening');
  if (!kinds.length) return;

  const week = params.week ?? [];
  if (!week.length) return;

  const now = params.now ?? new Date();
  const base = params.baseDate ?? now;
  const channelId = await ensureChannel();

  for (let i = 0; i < Math.min(week.length, DAYS_AHEAD); i++) {
    const day = new Date(base);
    day.setDate(day.getDate() + i);
    for (const kind of kinds) {
      const at = reminderAt(kind, day, week[i]);
      if (!at || at.getTime() <= now.getTime()) continue;
      await notifee
        .createTriggerNotification(
          {
            id: `${ID_PREFIX}${kind}-${ymd(day)}`,
            title:
              kind === 'morning'
                ? i18n.t('duaReminders.morningTitle', 'Morning adhkār')
                : i18n.t('duaReminders.eveningTitle', 'Evening adhkār'),
            body:
              kind === 'morning'
                ? i18n.t(
                    'duaReminders.morningBody',
                    'The morning duas — their time runs until sunrise.',
                  )
                : i18n.t(
                    'duaReminders.eveningBody',
                    'The evening duas — their time runs until sunset.',
                  ),
            data: { duaCategory: kind },
            android: {
              channelId,
              smallIcon: 'ic_stat_prayer',
              pressAction: { id: 'default' },
            },
          },
          { type: TriggerType.TIMESTAMP, timestamp: at.getTime() },
        )
        .catch(() => {});
    }
  }
}
