/**
 * The windows the phone goes quiet for — issue #60.
 *
 * `buildSilenceWindows` is the whole of the arithmetic, pure so the tests
 * can replay it: from the prayer events the alert scheduler already
 * builds and the setting, to a sorted list of non-overlapping
 * `[start, end)` stretches. `syncPrayerSilence` wraps it in the words the
 * ongoing notification prints and hands the list to the native side.
 *
 * ── THE RULES ─────────────────────────────────────────────────────────
 *
 * A window opens `leadMinutes` before the adhan and closes
 * `durationMinutes` after it — "quiet from five minutes before ʿAṣr until
 * half an hour after" is how the request was phrased, and it is how
 * people think about it.
 *
 * On a Friday, Ẓuhr is Jumuʿah for anyone who goes to the mosque. If
 * Jumuʿah is among the chosen prayers, Friday's Ẓuhr window takes the
 * Jumuʿah duration and, when one is set, the fixed Jumuʿah time instead
 * of the adhan. If it is not chosen, Friday's Ẓuhr is an ordinary Ẓuhr.
 *
 * Windows that touch or overlap — Maghrib and ʿIshāʾ an hour apart in a
 * northern summer — become one, so the phone does not come back for two
 * minutes between them. Windows already over are dropped.
 */
import { buildUpcomingSalahEvents } from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';
import type {
  PrayerSilenceSettings,
  SilencePrayer,
} from '../settings/prayerSilence';
import {
  clearSilenceWindows,
  prayerSilenceAvailable,
  setSilenceWindows,
  type SilenceWindow,
} from '../native/PrayerSilence';
import { makeClockFormatter } from '../utils/clockFormat';
import i18n from '../i18n';

export type SilenceSpan = {
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive. */
  end: number;
  /** The prayer(s) it is for — `Jumuah` for a Friday Ẓuhr taken as such. */
  prayers: SilencePrayer[];
};

const FRIDAY = 5;
const MINUTE = 60_000;

/** The chosen prayer an event stands for, or null when it is not chosen. */
function silencePrayerOf(
  name: string,
  at: Date,
  chosen: readonly SilencePrayer[],
): SilencePrayer | null {
  if (name === 'Dhuhr' && at.getDay() === FRIDAY && chosen.includes('Jumuah')) {
    return 'Jumuah';
  }
  return (chosen as readonly string[]).includes(name)
    ? (name as SilencePrayer)
    : null;
}

/** `HH:MM` on the same local day as `day`, as a Date. */
function atClockTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

export function buildSilenceWindows(
  events: readonly { name: string; at: Date }[],
  settings: PrayerSilenceSettings,
  now: Date,
): SilenceSpan[] {
  if (!settings.enabled || settings.prayers.length === 0) return [];
  const spans: SilenceSpan[] = [];
  for (const e of events) {
    const prayer = silencePrayerOf(e.name, e.at, settings.prayers);
    if (!prayer) continue;
    const jumuah = prayer === 'Jumuah';
    const anchor =
      jumuah && settings.jumuahTime
        ? atClockTime(e.at, settings.jumuahTime)
        : e.at;
    const duration = jumuah
      ? settings.jumuahDurationMinutes
      : settings.durationMinutes;
    const start = anchor.getTime() - settings.leadMinutes * MINUTE;
    const end = anchor.getTime() + duration * MINUTE;
    if (end <= now.getTime()) continue;
    spans.push({ start, end, prayers: [prayer] });
  }
  spans.sort((a, b) => a.start - b.start);
  // Merge what touches or overlaps, keeping every prayer's name for the
  // notification — "Silenced for Maghrib & Isha".
  const merged: SilenceSpan[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      for (const p of s.prayers)
        if (!last.prayers.includes(p)) last.prayers.push(p);
    } else {
      merged.push({ ...s, prayers: [...s.prayers] });
    }
  }
  return merged;
}

/**
 * Rewrite the native side's windows from the same timings the alerts
 * are scheduled from. Cheap enough to call on every resync; the native
 * side re-arms its alarms only when something moved.
 */
export async function syncPrayerSilence(params: {
  settings: PrayerSilenceSettings;
  today: TimingsMap;
  tomorrow?: TimingsMap;
  baseDate?: Date;
  /** Consecutive cached days from today; days beyond tomorrow extend coverage. */
  week?: TimingsMap[];
  hour12?: boolean;
  now?: Date;
}): Promise<SilenceSpan[]> {
  if (!prayerSilenceAvailable) return [];
  const now = params.now ?? new Date();
  if (!params.settings.enabled || params.settings.prayers.length === 0) {
    await clearSilenceWindows();
    return [];
  }
  const events = buildUpcomingSalahEvents(
    params.today,
    params.tomorrow,
    // Not the alert scheduler's "in a moment" cutoff: a window that
    // opened before the app was opened is still a window, and the native
    // side is what decides whether now falls inside one.
    new Date(now.getTime() - 24 * 60 * MINUTE),
    params.baseDate ?? now,
    params.week?.slice(2, 4) ?? [],
  );
  const spans = buildSilenceWindows(events, params.settings, now);
  const clock = makeClockFormatter(params.hour12 === true, i18n.language);
  const join = i18n.t('common.listJoin', { defaultValue: ' & ' });
  const windows: SilenceWindow[] = spans.map(s => ({
    start: s.start,
    end: s.end,
    title: i18n.t('silence.activeTitle', {
      prayer: s.prayers
        .map(p => i18n.t(`prayer.${p}`, { defaultValue: p }))
        .join(join),
      defaultValue: 'Silenced for {{prayer}}',
    }),
    text: i18n.t('silence.activeText', {
      time: clock.fromDate(new Date(s.end)),
      defaultValue: 'Until {{time}}',
    }),
  }));
  await setSilenceWindows(windows, {
    endNow: i18n.t('silence.endNow', { defaultValue: 'End now' }),
    channel: i18n.t('silence.channel', {
      defaultValue: 'Silence at prayer time',
    }),
  });
  return spans;
}
