/**
 * Where a `mihrab://` link lands.
 *
 * Widgets are the only sender. Before this existed a widget tap opened the
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
import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

export const MIHRAB_SCHEME = 'mihrab://';

/** Only a positive integer is a surah, a page or an ayah. */
function positiveInt(value: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [MIHRAB_SCHEME],
  config: {
    screens: {
      Home: {
        screens: {
          TodayTab: 'today',
          QuranTab: 'quran',
          TasbihTab: 'tasbih',
          DuasTab: 'duas',
          LogTab: 'log',
          SettingsTab: 'settings',
        },
      },
      /**
       * mihrab://read/2?page=3&ayah=5
       *
       * `page` drives the mushaf, `ayah` the translation reader, and the
       * screen already decides between them from what it is given — which is
       * why the widget sends whichever the user last had open rather than
       * this table trying to pick.
       */
      QuranSurah: {
        path: 'read/:surahNumber',
        parse: {
          surahNumber: positiveInt as (v: string) => number,
          initialPage: positiveInt as (v: string) => number,
          scrollToAyah: positiveInt as (v: string) => number,
        },
      },
      MonthTimes: 'month',
      Compass: 'qibla',
      Fasting: 'fasting',
    },
  },
};
