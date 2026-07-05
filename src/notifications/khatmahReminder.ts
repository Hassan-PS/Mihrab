/**
 * Khatmah daily reminder — v2.7.28.
 *
 * While a khatmah plan is active, a gentle daily notification at the
 * user's chosen time with today's portion and where to continue.
 * Same strategy as `ayahOfDay.ts`: individual TIMESTAMP triggers for a
 * rolling 7-day window with stable ids (`khatmah-rem-YYYY-MM-DD`),
 * re-synced on foreground / settings change / khatmah progress.
 *
 * Default notification sound — never the adhan.
 */
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import i18n from '../i18n';
import {
  activeKhatmah,
  getQuranState,
  hydrateQuranState,
  khatmahCurrentPage,
  khatmahToday,
} from '../quran/quranState';

const KHATMAH_REM_ID_PREFIX = 'khatmah-rem-';
const KHATMAH_CHANNEL_ID = 'prayer_app_khatmah_reminder';
const LOOK_AHEAD_DAYS = 7;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export async function cancelAllKhatmahReminders(): Promise<void> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const ours = ids.filter(id => id.startsWith(KHATMAH_REM_ID_PREFIX));
    if (ours.length > 0) {
      await Promise.all(ours.map(id => notifee.cancelTriggerNotification(id)));
    }
  } catch (e) {
    console.warn('cancelAllKhatmahReminders failed:', e);
  }
}

/**
 * Re-schedule the rolling window. No-op (after cancelling) when the
 * toggle is off or no khatmah plan is active. The body reflects the
 * plan state at scheduling time; each resync refreshes it.
 */
export async function rescheduleKhatmahReminder(opts: {
  enabled: boolean;
  hour: number;
  minute: number;
  now?: Date;
}): Promise<void> {
  await cancelAllKhatmahReminders();
  if (!opts.enabled) return;

  await hydrateQuranState();
  const plan = activeKhatmah(getQuranState());
  if (!plan) return;

  const hour = Math.max(0, Math.min(23, Math.floor(opts.hour)));
  const minute = Math.max(0, Math.min(59, Math.floor(opts.minute)));
  const now = opts.now ?? new Date();

  try {
    await notifee.createChannel({
      id: KHATMAH_CHANNEL_ID,
      name: i18n.t('quran.khatmahReminderChannelName', 'Khatmah reminder'),
      importance: AndroidImportance.DEFAULT,
    });
  } catch {
    // Non-fatal.
  }

  const { pagesToday } = khatmahToday(plan, now.getTime());
  const continueFrom = khatmahCurrentPage(plan);

  for (let i = 0; i < LOOK_AHEAD_DAYS; i++) {
    const fireAt = new Date(now);
    fireAt.setDate(fireAt.getDate() + i);
    fireAt.setHours(hour, minute, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;

    try {
      await notifee.createTriggerNotification(
        {
          id: `${KHATMAH_REM_ID_PREFIX}${ymd(fireAt)}`,
          title: i18n.t('quran.khatmahReminderTitle', 'Khatmah'),
          body: i18n.t('quran.khatmahReminderBody', {
            defaultValue:
              "Today's portion: {{pages}} pages — continue from page {{page}}.",
            pages: pagesToday,
            page: continueFrom,
          }),
          android: {
            channelId: KHATMAH_CHANNEL_ID,
            smallIcon: 'ic_stat_prayer',
            pressAction: { id: 'default', launchActivity: 'default' },
          },
          ios: { sound: 'default' },
        },
        { type: TriggerType.TIMESTAMP, timestamp: fireAt.getTime() },
      );
    } catch (e) {
      console.warn('Failed to schedule khatmah reminder', ymd(fireAt), e);
    }
  }
}
