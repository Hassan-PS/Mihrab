/**
 * Gather the non-prayer-times blocks from the app's own stores.
 *
 * Deliberately NOT a hook. Five hooks threaded through HomeScreen to feed
 * one JSON string would put the widget's concerns in a screen that has
 * nothing to do with widgets, and would re-render it every time a bead was
 * counted. This reads the stores directly, at the moment the payload is
 * built, and returns a plain object.
 *
 * Every read is independently guarded. The widget is best-effort: an
 * unreadable Quran blob must not cost the user their prayer times, which
 * are the reason the widget exists.
 */
import {
  computeCurrentStreak,
  computeLongestStreak,
} from '../journal/journal';
import { loadPractice } from '../practice/practiceStore';
import { isMushafDownloaded } from '../quran/mushafDownload';
import {
  activeKhatmah,
  getQuranState,
  hydrateQuranState,
} from '../quran/quranState';
import { getTasbihState, hydrateTasbihState } from '../tasbih/tasbihStore';
import i18n from '../i18n';
import type { TimingsMap } from '../types/prayer';
import {
  buildHijriBlock,
  buildPracticeBlock,
  buildReadingBlock,
  buildTasbihBlock,
  buildTodayBlock,
  type WidgetExtras,
} from './widgetBlocks';

export async function collectWidgetExtras(input: {
  /** Today's timings — the Log Today block needs them to decide what is due. */
  timings: TimingsMap;
  now?: Date;
  /**
   * Defaults to the app's current language rather than being passed in.
   *
   * The blocks carry localized surah and dhikr names, so they need it — but
   * making every caller remember to hand it over buys nothing except a
   * dependency on `i18n.language` in whichever effect happens to build the
   * payload, and one caller forgetting means a widget quietly stuck in
   * English. The widget layer knows it needs the language; it can ask.
   */
  language?: string;
}): Promise<WidgetExtras> {
  const now = input.now ?? new Date();
  const language = input.language ?? i18n.language;
  const extras: WidgetExtras = {};

  // The Hijri date is computed, not stored, so it can never fail and is
  // always worth sending.
  try {
    extras.hijri = buildHijriBlock(now);
  } catch {
    /* best-effort */
  }

  try {
    const practice = await loadPractice();
    extras.practice = buildPracticeBlock({
      journal: practice.journal,
      fasts: practice.fasts,
      sunnah: practice.sunnah,
      streak: computeCurrentStreak(practice.journal, now),
      bestStreak: computeLongestStreak(practice.journal),
      now,
    });
    extras.today = buildTodayBlock({
      journal: practice.journal,
      timings: input.timings,
      now,
    });
  } catch {
    /* best-effort */
  }

  try {
    await hydrateQuranState();
    const quran = getQuranState();
    // Checked here rather than in the builder so the builder stays pure, and
    // guarded separately so a filesystem hiccup costs the mushaf deep link
    // rather than the whole reading block.
    let mushafDownloaded = false;
    try {
      mushafDownloaded = await isMushafDownloaded();
    } catch {
      /* treat as absent — the translation reader always works */
    }
    const reading = buildReadingBlock({
      lastRead: quran.lastRead,
      bookmarks: quran.bookmarks,
      khatmah: activeKhatmah(quran) ?? null,
      riwayah: quran.prefs.riwayah,
      language,
      now,
      mushafDownloaded,
    });
    if (reading) extras.reading = reading;
  } catch {
    /* best-effort */
  }

  try {
    await hydrateTasbihState();
    const tasbih = getTasbihState();
    extras.tasbih = buildTasbihBlock({
      activeId: tasbih.activeId,
      counts: tasbih.counts,
      todayTotal: tasbih.todayTotal,
      todayRounds: tasbih.todayRounds,
    });
  } catch {
    /* best-effort */
  }

  return extras;
}
