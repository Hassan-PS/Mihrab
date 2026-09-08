/**
 * What a tapped notification opens — issue #27.
 *
 * ── THE FAULT THIS FIXES ──────────────────────────────────────────────
 *
 * Reported as three bugs: the khatmah reminder, the ayah of the day and
 * the Log widget all opened the app and left you wherever you were last.
 * They are one fault. Every notification this app posts carries
 * `pressAction: { id: 'default' }`, which tells the system to open the
 * app, and NOTHING IN THE APP READ THE PRESS. The ayah of the day even
 * attaches its surah and ayah — the data was right, and no code ever
 * looked at it.
 *
 * So a notification's destination is a URL, resolved here, and handed to
 * the same deep-link machinery the widgets already use: `mihrab://…`,
 * parsed by src/navigation/linking.ts. Widgets and notifications then
 * reach a screen the same way, and there is one place that decides where
 * a tap goes.
 *
 * ── RESOLVED WHEN TAPPED, NOT WHEN SCHEDULED ──────────────────────────
 *
 * The khatmah reminder is written up to a week ahead, and its body names
 * a page — the page the plan was on at scheduling time. Baking that page
 * into the destination would send a reader who has since read on back to
 * where they were on Monday. So the notification carries only what it IS
 * (`route: 'khatmah'`), and where that leads is worked out at the moment
 * of the tap, from the plan as it stands. The ayah of the day is the
 * opposite case and is baked in: it is that day's ayah, and it does not
 * become a different one because the tap was late.
 *
 * ── UNKNOWN NOTIFICATIONS GO NOWHERE ──────────────────────────────────
 *
 * A null return means "open the app and change nothing", which is what
 * every other notification in the app does today. Adhan alerts, the
 * end-of-day log prompt and the fasting reminders have their own action
 * handling and are deliberately not routed here.
 */
import type { Notification } from '@notifee/react-native';
import { MIHRAB_SCHEME } from '../navigation/linking';
import { khatmahContinueTarget } from '../quran/khatmahTarget';
import {
  activeKhatmah,
  getQuranState,
  hydrateQuranState,
} from '../quran/quranState';

/** The value of `data.route` on a notification that has a destination. */
export const ROUTE_KHATMAH = 'khatmah';
export const ROUTE_AYAH_OF_DAY = 'ayahOfDay';

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * ONE OF THE TWO, NEVER BOTH. The surah screen picks its reader from
 * which of `initialPage` and `scrollToAyah` it is given — the same
 * contract PrayerWidgetReadingProvider follows — so a link that carries
 * both is a link that has not decided what it is asking for.
 */
function readUrl(surah: number, position: string): string {
  return `${MIHRAB_SCHEME}read/${surah}?${position}`;
}

export async function notificationRoute(
  notification: Notification | undefined,
): Promise<string | null> {
  const data = notification?.data;
  if (!data) return null;

  // The ayah of the day: its own ayah, decided the day it was written.
  const surah = positiveInt(data.surah);
  const ayah = positiveInt(data.ayah);
  if (data.route === ROUTE_AYAH_OF_DAY || (surah && ayah && !data.route)) {
    if (!surah || !ayah) return null;
    return readUrl(surah, `scrollToAyah=${ayah}`);
  }

  if (data.route === ROUTE_KHATMAH) {
    // The plan may have finished, been deleted, or never existed by the
    // time this fires — a week is a long time. The Qur'an tab is the
    // honest destination then: it is where the plan lives.
    try {
      await hydrateQuranState();
      const plan = activeKhatmah(getQuranState());
      if (!plan) return `${MIHRAB_SCHEME}quran`;
      const target = khatmahContinueTarget(plan);
      // The reader they were last in, which is the same signal the
      // Continue-reading widget uses to choose between the two.
      const mushaf = getQuranState().lastRead?.mode === 'mushaf';
      return readUrl(
        target.surah,
        mushaf ? `initialPage=${target.page}` : `scrollToAyah=${target.ayah}`,
      );
    } catch {
      return `${MIHRAB_SCHEME}quran`;
    }
  }

  return null;
}
