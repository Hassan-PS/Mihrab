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
import { findPageForAyah } from '../quran/pages';
import { khatmahContinueTarget } from '../quran/khatmahTarget';
import { findDhikr } from '../dhikr/dhikr';
import { isDuaCategory } from '../duas/duas';
import { hydrateTasbihState, setActiveTasbih } from '../tasbih/tasbihStore';
import {
  activeKhatmah,
  getQuranState,
  hydrateQuranState,
} from '../quran/quranState';

/** The value of `data.route` on a notification that has a destination. */
export const ROUTE_KHATMAH = 'khatmah';
export const ROUTE_AYAH_OF_DAY = 'ayahOfDay';
/** A whole surah — the Al-Kahf and Al-Mulk reminders, #36. */
export const ROUTE_SURAH = 'surah';
/** One of the user's own dhikr reminders — #29. */
export const ROUTE_DHIKR = 'dhikr';
/** The morning or evening adhkār reminder — #39. */
export const ROUTE_DUA_CATEGORY = 'duaCategory';

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

  // A surah, opened at its beginning, in whichever reader they were last
  // in — the same choice the khatmah link makes below.
  if (data.route === ROUTE_SURAH) {
    if (!surah) return null;
    try {
      await hydrateQuranState();
      if (getQuranState().lastRead?.mode === 'mushaf') {
        // The page the surah BEGINS on — most surahs start partway down
        // one, so this is a lookup rather than a page whose start names
        // the surah.
        return readUrl(surah, `initialPage=${findPageForAyah(surah, 1)}`);
      }
    } catch {
      // Fall through to the ayah form, which needs nothing loaded.
    }
    return readUrl(surah, 'scrollToAyah=1');
  }

  // A dhikr reminder — issue #29. The counter, already on those words,
  // so the reminder is a thing you can act on rather than read.
  //
  // The preset is set here and not carried in the URL because the Tasbih
  // screen takes its dhikr from the store rather than from route params
  // — the same reason the khatmah link resolves its page at tap time.
  // A custom reminder has nothing to count and carries no dhikr; it
  // opens the counter on whatever was last there, which is the honest
  // answer for words the app did not choose.
  if (data.route === ROUTE_DHIKR) {
    const entry =
      typeof data.dhikr === 'string' ? findDhikr(data.dhikr) : undefined;
    if (entry?.tasbihPresetId) {
      try {
        await hydrateTasbihState();
        setActiveTasbih(entry.tasbihPresetId);
      } catch {
        // The counter opens on its last dhikr rather than not at all.
      }
    }
    return `${MIHRAB_SCHEME}tasbih`;
  }

  // The morning and evening adhkār — issue #39. The reminder names a
  // window of the day and the duas that belong in it, and then landed
  // the reader wherever they happened to be: the data was on the
  // notification from the day it was written (`duaCategory`) and, as in
  // #27, nothing read it.
  //
  // Baked in rather than resolved here, like the ayah of the day and
  // unlike the khatmah: an evening reminder means the evening adhkār
  // however late it is opened, and the window it names has not moved.
  // The category is validated on the way out because `duas/:category`
  // is a public-looking path in a private scheme, and an unknown name
  // should open the index rather than a page of nothing.
  if (data.route === ROUTE_DUA_CATEGORY || (!data.route && data.duaCategory)) {
    return isDuaCategory(data.duaCategory)
      ? `${MIHRAB_SCHEME}duas/${data.duaCategory}`
      : `${MIHRAB_SCHEME}duas`;
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
