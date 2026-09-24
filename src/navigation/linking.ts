/**
 * Where a `mihrab://` link lands.
 *
 * Widgets were the only sender, and notifications are the second — see
 * `notificationRoute`, and #27, where every tapped reminder left you
 * wherever you happened to be. Before this existed a widget tap opened the
 * app on whatever screen it was last on, which is fine for a prayer table —
 * the answer is on the widget already — and useless for the ones whose whole
 * promise is a destination: Continue Reading means page 3 of Al-Baqarah, and
 * a streak card means the Log.
 *
 * Declared rather than hand-rolled: React Navigation's own linking config
 * knows how to build the nested state for "the Quran surah screen, pushed on
 * top of the Quran tab", which a manual `navigate()` from a URL listener has
 * to reconstruct by hand and gets wrong on a cold start.
 *
 * The scheme is app-private. Nothing outside the app is expected to send one,
 * and nothing a link can ask for is destructive — the worst a forged
 * `mihrab://` does is change which tab is showing.
 */
import { isMacCatalyst } from '../responsive/breakpoints';
import type { LinkingOptions } from '@react-navigation/native';
import notifee, { EventType } from '@notifee/react-native';
import { Linking } from 'react-native';

import { notificationRoute } from '../notifications/notificationRoute';
import type { RootStackParamList } from './types';

export const MIHRAB_SCHEME = 'mihrab://';

/** A link's boolean: present and `1` is true, anything else is not. */
function flag(value: string): boolean {
  return value === '1';
}

/** Only a positive integer is a surah, a page or an ayah. */
function positiveInt(value: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * A tapped notification, turned into a link — all three ways a tap arrives.
 *
 * Overriding `getInitialURL` and `subscribe` REPLACES React Navigation's
 * own, so both have to keep doing what the defaults did (`Linking`) as
 * well as the new thing. Getting that wrong breaks every widget on the
 * home screen, which is the more used half of this file.
 *
 * The three cases are genuinely three:
 *
 *   • app running       — notifee's foreground PRESS event;
 *   • app in the background — the same event, once the press brings it
 *     forward;
 *   • app not running   — `getInitialNotification`, and this is the case
 *     that is usually forgotten and is the ordinary one for a reminder
 *     that arrives hours after the app was last opened.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [MIHRAB_SCHEME],
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) return url;
    const initial = await notifee.getInitialNotification();
    return initial ? await notificationRoute(initial.notification) : null;
  },
  subscribe(listener) {
    const link = Linking.addEventListener('url', ({ url }) => listener(url));
    const press = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.PRESS) return;
      void notificationRoute(detail.notification).then(url => {
        if (url) listener(url);
      });
    });
    return () => {
      link.remove();
      press();
    };
  },
  config: {
    screens: {
      Home: {
        screens: {
          TodayTab: 'today',
          QuranTab: 'quran',
          TasbihTab: 'tasbih',
          /**
           * mihrab://duas — the index; mihrab://duas/evening — that
           * category, opened (#39).
           *
           * The name is checked by the screen rather than here: a
           * `parse` that cannot say "not a category" has to invent a
           * value, and the honest answer to an unknown name is the
           * index, which is what the screen does with one.
           */
          DuasTab: 'duas/:category?',
          LogTab: 'log',
          SettingsTab: 'settings',
        },
      },
      /**
       * mihrab://read/2?initialPage=3&scrollToAyah=5
       *
       * The query keys are the ROUTE PARAM names, spelled exactly as in
       * `parse` below — React Navigation matches on those, so a link
       * written with a friendlier `?ayah=5` parses to nothing at all and
       * opens the surah at the top with no error anywhere. This comment
       * said `?page=3&ayah=5` for a long time and cost an afternoon.
       *
       * `initialPage` drives the mushaf, `scrollToAyah` the translation reader, and the
       * screen already decides between them from what it is given — which is
       * why the widget sends whichever the user last had open rather than
       * this table trying to pick.
       *
       * `playFromAyah` is neither: it says begin reciting here, and it is
       * sent alongside whichever of the two positions the reader needs
       * (issue #25). A link without it opens silently, as every link did
       * before it existed.
       *
       * `sessionKhatmah=1` says the link IS the khatmah's door — the
       * widget's reading card and the khatmah reminder both offer the
       * plan's own page, and the reader has to know that to draw the
       * plan's done-marks and to keep the reading marker out of it (see
       * `quran/readingSession`). Without it those two doors would land on
       * the same page as the home card and behave differently.
       */
      QuranSurah: {
        path: 'read/:surahNumber',
        parse: {
          surahNumber: positiveInt as (v: string) => number,
          initialPage: positiveInt as (v: string) => number,
          scrollToAyah: positiveInt as (v: string) => number,
          playFromAyah: positiveInt as (v: string) => number,
          sessionKhatmah: flag as (v: string) => boolean,
        },
      },
      /**
       * mihrab://sync
       *
       * Pairing is the one settings destination worth reaching directly:
       * it is what a "sync could not finish" notice would link to, and it
       * is the screen someone is sent to when they are standing next to
       * the other device with its code on screen.
       */
      Sync: 'sync',
      /**
       * mihrab://downloads
       *
       * Where a download that stopped is picked up again (#55), and so
       * where the "download stopped" notification lands.
       */
      QuranDownloads: 'downloads',
      QuranTajweed: 'tajweed',
      MonthTimes: 'month',
      /**
       * Absent on a Mac, where `RootNavigator` does not register the
       * screen. A path that maps to a route the navigator has never
       * heard of is not a no-op — React Navigation warns and the link
       * dies somewhere unhelpful — so the map has to agree with the
       * navigator about what exists.
       */
      ...(isMacCatalyst ? {} : { Compass: 'qibla' as const }),
      Fasting: 'fasting',
    },
  },
};
