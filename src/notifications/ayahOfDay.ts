/**
 * Ayah of the day — v2.7.27.
 *
 * A daily notification at the user's chosen time carrying one randomly
 * drawn ayah (uniform over all 6,236) with its translation in the active
 * edition — the same "default tafsir" resolution the reader uses.
 *
 * Strategy mirrors `fastingReminders.ts`:
 *   • Schedule the next 14 days as individual TIMESTAMP triggers with
 *     stable ids (`ayah-day-YYYY-MM-DD`), each day's ayah drawn at
 *     scheduling time so every day is a fresh random pick.
 *   • Re-sync (cancel + schedule) whenever the toggle/time/edition/
 *     language changes and on app foreground (see `useAyahOfDaySync`),
 *     so the 14-day window keeps rolling forward.
 *
 * Plain visible notification on the default sound — never the adhan.
 */

import notifee, {
  AndroidImportance,
  AndroidStyle,
  TriggerType,
} from '@notifee/react-native';
import i18n from '../i18n';
import { findSurah, loadSurah, SURAHS } from '../quran/quran';
import {
  defaultEditionForLocale,
  editionMatchesLocale,
  getAyahTranslation,
  type QuranTranslationId,
} from '../quran/translations';

const AYAH_DAY_ID_PREFIX = 'ayah-day-';
const AYAH_DAY_CHANNEL_ID = 'prayer_app_ayah_of_day';
const LOOK_AHEAD_DAYS = 14;

/** Resolve the active edition outside React (same rule as useActiveEdition). */
export function resolveEditionForNotification(
  quranTranslationEdition: string,
  language: string,
): QuranTranslationId {
  if (
    quranTranslationEdition &&
    editionMatchesLocale(quranTranslationEdition, language)
  ) {
    return quranTranslationEdition as QuranTranslationId;
  }
  return defaultEditionForLocale(language);
}

/** Uniform random ayah reference over all 6,236 ayahs. */
export function randomAyahRef(
  rand: () => number = Math.random,
): { surah: number; ayah: number } {
  const total = SURAHS.reduce((sum, s) => sum + s.ayahCount, 0);
  let n = Math.floor(rand() * total);
  for (const s of SURAHS) {
    if (n < s.ayahCount) return { surah: s.number, ayah: n + 1 };
    n -= s.ayahCount;
  }
  return { surah: 1, ayah: 1 };
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Skip verses whose Arabic runs past this — a handful of very long ayahs
 * (e.g. 2:282, the "debt verse") span most of a page and never render sensibly
 * in a notification even with BigTextStyle. We re-draw a few times to avoid
 * them; the daily ayah stays a normal, readable length.
 */
const MAX_AYAH_ARABIC_CHARS = 400;

/** Draw a random ayah short enough to render as a notification. */
async function drawNotifiableAyah(edition: QuranTranslationId): Promise<{
  ref: { surah: number; ayah: number };
  arabic: string;
  translation: string;
}> {
  let last: { ref: { surah: number; ayah: number }; arabic: string; translation: string } = {
    ref: { surah: 1, ayah: 1 },
    arabic: '',
    translation: '',
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const ref = randomAyahRef();
    let arabic = '';
    try {
      const loaded = await loadSurah(ref.surah);
      arabic = loaded?.arabic[ref.ayah - 1] ?? '';
    } catch {
      // Arabic text unavailable — translation-only body still works.
    }
    const translation = getAyahTranslation(edition, ref.surah, ref.ayah) ?? '';
    last = { ref, arabic, translation };
    // Accept anything within the cap; if Arabic couldn't load, don't loop forever.
    if (arabic.length <= MAX_AYAH_ARABIC_CHARS) return last;
  }
  return last; // gave up after 6 tries — use the last pick
}

/** Cancel every scheduled ayah-of-the-day notification. */
export async function cancelAllAyahOfDay(): Promise<void> {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const ours = ids.filter(id => id.startsWith(AYAH_DAY_ID_PREFIX));
    if (ours.length > 0) {
      await Promise.all(ours.map(id => notifee.cancelTriggerNotification(id)));
    }
  } catch (e) {
    console.warn('cancelAllAyahOfDay failed:', e);
  }
}

/**
 * Re-schedule the rolling 14-day window. Replaces any existing triggers.
 * No-op (after cancelling) when disabled.
 */
export async function rescheduleAyahOfDay(opts: {
  enabled: boolean;
  hour: number;
  minute: number;
  /** Raw settings value; resolved against `language` internally. */
  quranTranslationEdition: string;
  language: string;
  now?: Date;
}): Promise<void> {
  await cancelAllAyahOfDay();
  if (!opts.enabled) return;

  const hour = Math.max(0, Math.min(23, Math.floor(opts.hour)));
  const minute = Math.max(0, Math.min(59, Math.floor(opts.minute)));
  const now = opts.now ?? new Date();
  const edition = resolveEditionForNotification(
    opts.quranTranslationEdition,
    opts.language,
  );

  try {
    await notifee.createChannel({
      id: AYAH_DAY_CHANNEL_ID,
      name: i18n.t('quran.ayahOfDayChannelName', 'Ayah of the day'),
      importance: AndroidImportance.DEFAULT,
    });
  } catch {
    // Non-fatal.
  }

  for (let i = 0; i < LOOK_AHEAD_DAYS; i++) {
    const fireAt = new Date(now);
    fireAt.setDate(fireAt.getDate() + i);
    fireAt.setHours(hour, minute, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;

    const { ref, arabic, translation } = await drawNotifiableAyah(edition);
    const surahMeta = findSurah(ref.surah);

    const refLabel = `${surahMeta?.romanized ?? ''} ${ref.surah}:${ref.ayah}`;
    // BigTextStyle renders the whole thing on expand (like a long chat message),
    // so keep the caps generous; a blank line separates Arabic from translation.
    const body = [clip(arabic, 400), clip(translation, 500)]
      .filter(Boolean)
      .join('\n\n');

    try {
      await notifee.createTriggerNotification(
        {
          id: `${AYAH_DAY_ID_PREFIX}${ymd(fireAt)}`,
          title: `${i18n.t('quran.ayahOfDayTitle', 'Ayah of the day')} · ${refLabel}`,
          body,
          data: { surah: String(ref.surah), ayah: String(ref.ayah) },
          android: {
            channelId: AYAH_DAY_CHANNEL_ID,
            smallIcon: 'ic_stat_prayer',
            // BigTextStyle — the full ayah + translation on expand.
            style: { type: AndroidStyle.BIGTEXT, text: body },
            pressAction: { id: 'default', launchActivity: 'default' },
          },
          ios: {
            sound: 'default',
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: fireAt.getTime(),
        },
      );
    } catch (e) {
      console.warn('Failed to schedule ayah of the day', ymd(fireAt), e);
    }
  }
}
