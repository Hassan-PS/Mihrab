/**
 * Al-Kahf on Friday, Al-Mulk at night — issue #36.
 *
 * The two reading habits people keep that are not a khatmah, and neither
 * is served by a reminder about a portion: one is weekly and one is
 * nightly, and both are about a specific surah rather than about progress.
 *
 * ── WHAT THE APP CAN HONESTLY PROMISE ─────────────────────────────────
 *
 * "Before sleeping" is not a time this app knows. The choices were to
 * guess it from ʿIshāʾ — wrong for anyone who sleeps early, and wrong at
 * high latitude in June where ʿIshāʾ can be near midnight — or to ask.
 * It asks, and defaults late enough to be after ʿIshāʾ across most of the
 * year in most places. The same goes for Friday: the reminder fires on
 * the calendar Friday at the hour you choose, rather than at Maghrib on
 * Thursday when the Islamic day turns, because someone setting a morning
 * reminder for Al-Kahf means Friday morning.
 *
 * ── THE SAME SHAPE AS THE OTHERS ──────────────────────────────────────
 *
 * A rolling window of individual TIMESTAMP triggers with stable ids, the
 * way `ayahOfDay` and `khatmahReminder` do it: notifee has no weekly
 * trigger that survives a timezone change the way a list of absolute
 * instants does, and a resync on foreground rolls the window forward.
 * Cancel-then-schedule, so a change of time never leaves the old one
 * behind.
 *
 * Tapping either opens that surah — see `notificationRoute`. A reminder
 * to read something that does not open it is a reminder to go looking.
 */
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import i18n from '../i18n';
import { ROUTE_SURAH } from './notificationRoute';

/** Al-Kahf and Al-Mulk, by their numbers in the muṣḥaf. */
export const KAHF = 18;
export const MULK = 67;

const KAHF_ID_PREFIX = 'surah-kahf-';
const MULK_ID_PREFIX = 'surah-mulk-';
export const SURAH_REMINDER_CHANNEL_ID = 'prayer_app_surah_reminders';

/** Fridays ahead, and nights ahead. Both a fortnight of cover. */
const KAHF_LOOK_AHEAD_WEEKS = 2;
const MULK_LOOK_AHEAD_DAYS = 14;

/** JS `getDay()` for Friday. */
const FRIDAY = 5;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function cancelWithPrefix(prefix: string): Promise<void> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const mine = ids.filter(id => id.startsWith(prefix));
    if (mine.length > 0) await notifee.cancelTriggerNotifications(mine);
  } catch {
    // Nothing scheduled, or the store is unavailable: either way there is
    // nothing to cancel and the schedule below is what matters.
  }
}

export async function cancelAllSurahReminders(): Promise<void> {
  await cancelWithPrefix(KAHF_ID_PREFIX);
  await cancelWithPrefix(MULK_ID_PREFIX);
}

/**
 * The instants a reminder should fire at, from `now` forward.
 *
 * Exported because this is the part worth testing without a notification
 * system: a schedule that includes a moment already past fires the
 * instant it is created, and one that skips today's Friday because the
 * hour has not arrived yet is a week of silence.
 */
export function reminderTimes(opts: {
  now: Date;
  hour: number;
  minute: number;
  /** Every day, or only Fridays. */
  weekly: boolean;
  count: number;
}): Date[] {
  const hour = Math.max(0, Math.min(23, Math.floor(opts.hour)));
  const minute = Math.max(0, Math.min(59, Math.floor(opts.minute)));
  const out: Date[] = [];
  const day = new Date(opts.now);
  day.setHours(hour, minute, 0, 0);
  // Look far enough ahead to find `count` matching days even when only
  // one day in seven qualifies.
  const horizon = opts.weekly ? opts.count * 7 + 7 : opts.count + 1;
  for (let i = 0; i < horizon && out.length < opts.count; i++) {
    const at = new Date(day);
    at.setDate(day.getDate() + i);
    if (opts.weekly && at.getDay() !== FRIDAY) continue;
    // Strictly future: a trigger in the past is delivered immediately,
    // which on a resync means the reminder you already read arriving again.
    if (at.getTime() <= opts.now.getTime()) continue;
    out.push(at);
  }
  return out;
}

async function scheduleOne(opts: {
  id: string;
  at: Date;
  surah: number;
  title: string;
  body: string;
}): Promise<void> {
  try {
    await notifee.createTriggerNotification(
      {
        id: opts.id,
        title: opts.title,
        body: opts.body,
        // The surah, resolved to the reader the person is using when they
        // tap it — see notificationRoute.
        data: { route: ROUTE_SURAH, surah: String(opts.surah) },
        android: {
          channelId: SURAH_REMINDER_CHANNEL_ID,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default', launchActivity: 'default' },
        },
        ios: { sound: 'default' },
      },
      { type: TriggerType.TIMESTAMP, timestamp: opts.at.getTime() },
    );
  } catch (e) {
    console.warn('Failed to schedule surah reminder', opts.id, e);
  }
}

export async function rescheduleSurahReminders(opts: {
  kahfEnabled: boolean;
  kahfHour: number;
  kahfMinute: number;
  mulkEnabled: boolean;
  mulkHour: number;
  mulkMinute: number;
  now?: Date;
}): Promise<void> {
  await cancelAllSurahReminders();
  if (!opts.kahfEnabled && !opts.mulkEnabled) return;

  const now = opts.now ?? new Date();

  try {
    await notifee.createChannel({
      id: SURAH_REMINDER_CHANNEL_ID,
      name: i18n.t('settings.surahRemindersChannel', 'Surah reminders'),
      importance: AndroidImportance.DEFAULT,
    });
  } catch {
    // Non-fatal: Android creates a default channel, iOS has none.
  }

  if (opts.kahfEnabled) {
    for (const at of reminderTimes({
      now,
      hour: opts.kahfHour,
      minute: opts.kahfMinute,
      weekly: true,
      count: KAHF_LOOK_AHEAD_WEEKS,
    })) {
      await scheduleOne({
        id: `${KAHF_ID_PREFIX}${ymd(at)}`,
        at,
        surah: KAHF,
        title: i18n.t('surahReminders.kahfTitle', 'Al-Kahf'),
        body: i18n.t('surahReminders.kahfBody', "It is Friday — read Surah Al-Kahf."),
      });
    }
  }

  if (opts.mulkEnabled) {
    for (const at of reminderTimes({
      now,
      hour: opts.mulkHour,
      minute: opts.mulkMinute,
      weekly: false,
      count: MULK_LOOK_AHEAD_DAYS,
    })) {
      await scheduleOne({
        id: `${MULK_ID_PREFIX}${ymd(at)}`,
        at,
        surah: MULK,
        title: i18n.t('surahReminders.mulkTitle', 'Al-Mulk'),
        body: i18n.t('surahReminders.mulkBody', 'Before sleeping — read Surah Al-Mulk.'),
      });
    }
  }
}
