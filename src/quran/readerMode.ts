/**
 * Which reader a surah is actually open in.
 *
 * Two settings decide it, and only one of them is obvious.
 * `quranReadingMode` is the remembered choice, but it is only consulted
 * while `quranVerseByVerseEnabled` is on — off, the muṣḥaf is the only
 * reader and the pref is a memory of the last time there were two (see
 * `settings/types.ts`). Reading `quranReadingMode` on its own therefore
 * answers a question nobody asked: not "what am I looking at" but "what
 * was I looking at, once".
 *
 * The distance between those two matters because the answer is written
 * down. `AyahActionSheet` records the reader a reading position came
 * from, and `lastRead.mode` is then what decides whether the home card
 * counts pages and whether a daily-ayah notification opens a page or an
 * ayah. A muṣḥaf reader whose old pref still said 'withTranslation'
 * would quietly file muṣḥaf positions under the other reader and get the
 * wrong card and the wrong notification for it.
 *
 * So both callers ask here instead, and there is one derivation to keep
 * right rather than two to keep in step.
 */
import type { PrayerAppSettings } from '../settings/types';

export type ReaderMode = PrayerAppSettings['quranReadingMode'];

/** The reader on screen, as opposed to the one last remembered. */
export function activeReaderMode(
  settings: Pick<
    PrayerAppSettings,
    'quranReadingMode' | 'quranVerseByVerseEnabled'
  >,
): ReaderMode {
  return settings.quranVerseByVerseEnabled &&
    settings.quranReadingMode === 'withTranslation'
    ? 'withTranslation'
    : 'mushaf';
}
