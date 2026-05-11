/**
 * Live Activity orchestrator — task #128.
 *
 * Combines the widget payload, Hijri date, location label, and the
 * user's display preferences and dispatches to the right platform
 * implementation:
 *
 *   Android  → notifee ongoing-notification (src/notifications/liveActivity.ts)
 *   iOS      → ActivityKit native module (src/native/PrayerLiveActivity.ts)
 *
 * iOS implementation is gated on the native module being linked.
 * The first beta ships without the iOS bridge — calls there silently
 * no-op. Task #129 lands the ActivityKit widget + bridge.
 */

import { Platform } from 'react-native';
import i18n from '../i18n';
import type { TimingsMap } from '../types/prayer';
import {
  buildWidgetPayload,
  type WidgetCoords,
  type WidgetSeasonalFlags,
} from '../widget/buildWidgetPayload';
import { gregorianToHijri } from '../hijri/convert';
import {
  startOrUpdateLiveActivity as androidStartOrUpdate,
  stopLiveActivity as androidStop,
} from '../notifications/liveActivity';
import {
  getPrayerLiveActivityModule,
  type PrayerLiveActivityContent,
} from '../native/PrayerLiveActivity';

export type LiveActivityDisplayOptions = {
  enabled: boolean;
  compactMode: boolean;
  showSunrise: boolean;
  showHijri: boolean;
  showLocation: boolean;
};

/**
 * Hijri month names (transliterated). For locales with their own script
 * we let i18n's namespace handle it via the optional `hijri.month_<n>`
 * keys; falling back to this English transliteration when missing keeps
 * the format readable for every locale without forcing 12 new keys
 * across all 13 files in this beta.
 */
const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  'Rabi I',
  'Rabi II',
  'Jumada I',
  'Jumada II',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhul-Qa'dah",
  'Dhul-Hijjah',
] as const;

function formatHijriLabel(d: Date): string {
  const h = gregorianToHijri(d);
  const monthKey = `hijri.month_${h.month}`;
  const m =
    i18n.exists(monthKey) ? i18n.t(monthKey) : HIJRI_MONTHS_EN[h.month - 1];
  return `${h.day} ${m} ${h.year}`;
}

function parseHHMMOnDate(hhmm: string, base: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const out = new Date(base);
  out.setHours(h, min, 0, 0);
  return out;
}

function localizedPrayerLabel(key: string | null | undefined): string {
  if (!key) return '';
  // Re-use existing prayer label keys (settings.fajr, settings.dhuhr, …)
  // when present, else fall back to the raw key.
  const k = `prayer.${key.toLowerCase()}`;
  return i18n.exists(k) ? i18n.t(k) : key;
}

/**
 * Drive the Live Activity to match the supplied state. Idempotent — call
 * on settings change, on prayer-day data update, and on AppState 'active'.
 */
export async function syncLiveActivity(args: {
  options: LiveActivityDisplayOptions;
  today: TimingsMap | null;
  tomorrow?: TimingsMap | null;
  now?: Date;
  locationName?: string;
  coords?: WidgetCoords;
  seasonal?: WidgetSeasonalFlags;
}): Promise<void> {
  const now = args.now ?? new Date();

  // Off → ensure we cancel any pre-existing pinned activity.
  if (!args.options.enabled || !args.today) {
    await stopLiveActivityCrossPlatform();
    return;
  }

  // We reuse buildWidgetPayload so the row keys + abbreviations and the
  // tomorrow-rollover logic stay consistent with the home-screen widget.
  let payload;
  try {
    payload = buildWidgetPayload(
      args.today,
      args.tomorrow ?? undefined,
      now,
      args.locationName,
      args.coords,
      args.seasonal,
    );
  } catch (e) {
    console.warn('[liveActivity] payload build failed', e);
    await stopLiveActivityCrossPlatform();
    return;
  }

  // Figure out the wall-clock timestamp of the next prayer for the
  // Android chronometer / iOS Text(timerInterval:).
  let nextPrayerTimestamp: number | null = null;
  if (payload.nextKey && payload.nextPrayerTime) {
    // Pick today's date as the base. After-Isha rollover already swapped
    // payload to tomorrow's date in dayLabel; we infer the right base by
    // comparing the parsed time vs. now — if it's in the past, advance
    // one day.
    let parsed = parseHHMMOnDate(payload.nextPrayerTime, now);
    if (parsed && parsed.getTime() <= now.getTime()) {
      parsed = parseHHMMOnDate(
        payload.nextPrayerTime,
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      );
    }
    if (parsed) nextPrayerTimestamp = parsed.getTime();
  }

  const nextLabel = localizedPrayerLabel(payload.nextKey);
  const hijri = args.options.showHijri ? formatHijriLabel(now) : '';
  const location =
    args.options.showLocation && args.locationName ? args.locationName : '';

  if (Platform.OS === 'android') {
    await androidStartOrUpdate({
      payload,
      nextPrayerTimestamp,
      nextPrayerLabel: nextLabel,
      hijriLabel: hijri,
      locationLabel: location,
      compactMode: args.options.compactMode,
      showSunrise: args.options.showSunrise,
      showHijri: args.options.showHijri,
      showLocation: args.options.showLocation,
    });
    return;
  }

  if (Platform.OS === 'ios') {
    const mod = getPrayerLiveActivityModule();
    if (!mod) {
      // ActivityKit bridge not yet linked — see task #129.
      // Silent no-op so the toggle still appears functional from the
      // user's POV (next beta ships the iOS visual).
      return;
    }
    const rows = payload.rows.map(r => ({
      key: r.key,
      abbr: r.abbr,
      time: r.time,
    }));
    const content: PrayerLiveActivityContent = {
      locale: i18n.language || 'en',
      nextKey: payload.nextKey ?? '',
      nextLabel,
      nextTime: payload.nextPrayerTime ?? '',
      nextEpochMs: nextPrayerTimestamp ?? 0,
      rows,
      sunriseRow: args.options.showSunrise ? payload.sunriseRow : undefined,
      hijriLabel: hijri,
      locationLabel: location,
      compactMode: args.options.compactMode,
      showSunrise: args.options.showSunrise,
      showHijri: args.options.showHijri,
      showLocation: args.options.showLocation,
    };
    try {
      // Start is idempotent — module should detect a running activity and
      // update in place.
      await mod.start(JSON.stringify(content));
    } catch (e) {
      console.warn('[liveActivity] ios start/update failed', e);
    }
  }
}

/** End any running Live Activity on the current platform. */
export async function stopLiveActivityCrossPlatform(): Promise<void> {
  if (Platform.OS === 'android') {
    await androidStop();
    return;
  }
  if (Platform.OS === 'ios') {
    const mod = getPrayerLiveActivityModule();
    if (!mod) return;
    try {
      await mod.stop();
    } catch {
      // Non-fatal.
    }
  }
}
