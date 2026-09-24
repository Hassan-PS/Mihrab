/**
 * "Silence the phone at prayer time" — issue #60.
 *
 * The shape of the setting, its defaults, the values each field may
 * take, and the coercion that turns whatever was on disk into that.
 * Kept free of React Native so the window builder in
 * `notifications/prayerSilence.ts` and its tests can share it.
 *
 * ── WHAT IT ASKS ──────────────────────────────────────────────────────
 *
 * Which prayers the phone goes quiet for; how far before the adhan it
 * starts; how long after the adhan it stays quiet. Jumuʿah is its own
 * entry: it lasts longer than a daily prayer, and many mosques hold it
 * at a fixed clock time all year rather than at Ẓuhr, so it carries its
 * own duration and an optional fixed time. On a Friday a Jumuʿah entry
 * stands in for Ẓuhr.
 *
 * Android only. iOS lets no app touch silent mode or Focus, so the
 * setting is never shown there and nothing reads it.
 */
import {
  PRE_PRAYER_REMINDER_OPTIONS,
  type PrePrayerReminderMinutes,
} from './prePrayerReminder';

/** The prayers a window can be set around, in the order they are listed. */
export const SILENCE_PRAYERS = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
  'Jumuah',
] as const;
export type SilencePrayer = (typeof SILENCE_PRAYERS)[number];

/** How long the phone stays quiet after the adhan, for a daily prayer. */
export const SILENCE_DURATION_OPTIONS = [15, 20, 30, 45, 60, 90] as const;
/** The same for Jumuʿah, which runs to a khuṭbah and a prayer. */
export const SILENCE_JUMUAH_DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

export type SilenceDurationMinutes = (typeof SILENCE_DURATION_OPTIONS)[number];
export type SilenceJumuahDurationMinutes =
  (typeof SILENCE_JUMUAH_DURATION_OPTIONS)[number];

export type PrayerSilenceSettings = {
  /** The master switch. Off, nothing below is read. */
  enabled: boolean;
  /** Which prayers, as a subset of `SILENCE_PRAYERS` in that order. */
  prayers: SilencePrayer[];
  /** Minutes before the adhan the phone goes quiet; 0 is at the adhan. */
  leadMinutes: PrePrayerReminderMinutes;
  /** Minutes after the adhan it stays quiet, for a daily prayer. */
  durationMinutes: SilenceDurationMinutes;
  /** The same for Jumuʿah. */
  jumuahDurationMinutes: SilenceJumuahDurationMinutes;
  /**
   * When Jumuʿah is held, as `HH:MM` on the local clock, or null to
   * follow Ẓuhr. A mosque that holds it at 13:30 all year is the common
   * case this exists for.
   */
  jumuahTime: string | null;
};

export const DEFAULT_PRAYER_SILENCE: PrayerSilenceSettings = {
  enabled: false,
  // Every prayer, and Jumuʿah: the person turning this on goes to the
  // mosque, and unticking is a smaller ask than ticking six chips.
  prayers: [...SILENCE_PRAYERS],
  leadMinutes: 5,
  durationMinutes: 30,
  jumuahDurationMinutes: 60,
  jumuahTime: null,
};

const JUMUAH_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function pick<T extends number>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof value === 'number' &&
    (options as readonly number[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Whatever was on disk, made into a setting every reader can trust. */
export function coercePrayerSilence(value: unknown): PrayerSilenceSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PRAYER_SILENCE };
  const raw = value as Partial<Record<keyof PrayerSilenceSettings, unknown>>;
  const prayers = Array.isArray(raw.prayers)
    ? SILENCE_PRAYERS.filter(p => (raw.prayers as unknown[]).includes(p))
    : [...DEFAULT_PRAYER_SILENCE.prayers];
  return {
    enabled: raw.enabled === true,
    prayers,
    // The reminder picker's own list, so one sheet serves both questions.
    leadMinutes: pick(
      raw.leadMinutes,
      PRE_PRAYER_REMINDER_OPTIONS,
      DEFAULT_PRAYER_SILENCE.leadMinutes,
    ),
    durationMinutes: pick(
      raw.durationMinutes,
      SILENCE_DURATION_OPTIONS,
      DEFAULT_PRAYER_SILENCE.durationMinutes,
    ),
    jumuahDurationMinutes: pick(
      raw.jumuahDurationMinutes,
      SILENCE_JUMUAH_DURATION_OPTIONS,
      DEFAULT_PRAYER_SILENCE.jumuahDurationMinutes,
    ),
    jumuahTime:
      typeof raw.jumuahTime === 'string' && JUMUAH_TIME.test(raw.jumuahTime)
        ? raw.jumuahTime
        : null,
  };
}

/** Add or remove one prayer, keeping the stored order canonical. */
export function toggleSilencePrayer(
  prayers: readonly SilencePrayer[],
  prayer: SilencePrayer,
): SilencePrayer[] {
  return prayers.includes(prayer)
    ? prayers.filter(p => p !== prayer)
    : SILENCE_PRAYERS.filter(p => p === prayer || prayers.includes(p));
}
