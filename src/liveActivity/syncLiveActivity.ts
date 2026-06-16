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
import { NEXT_SALAH_ORDER } from '../types/prayer';
import type { AppAccentId } from '../settings/types';
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
};
// Note: Hijri/location/sunrise/compact display knobs were removed from the
// Live Activity UI in v2.1.0-beta.5. Sunrise is always shown and the other
// captions are always omitted, so the orchestrator no longer takes per-display
// options beyond the master `enabled` flag. The `liveActivity*` fields still
// persist in settings storage (schema is additive-only) but are unused.

/**
 * Resolve a #RRGGBB hex for the user's chosen app accent. The Android
 * notification's `color` field tints the small icon + chronometer; the
 * iOS Live Activity uses it as the system tint for the Lock-Screen
 * Activity. We pick the LIGHT swatch because notifications render
 * against the system shade, not the in-app dark mode — using the dark
 * variant would muddy the tint against a colourful wallpaper.
 *
 * Kept local to the live-activity module so we don't drag the full
 * `useAppPalette` (which needs RN's `useColorScheme()` and a hook
 * context) into a pure-data path.
 */
const ACCENT_LIGHT: Record<Exclude<AppAccentId, 'custom'>, string> = {
  green: '#22c55e',
  teal: '#0d9488',
  blue: '#2563eb',
  amber: '#b45309',
};

export function resolveAccentHex(
  accentId: AppAccentId,
  customHex: string,
): string {
  if (accentId === 'custom') {
    const valid = /^#[0-9a-fA-F]{6}$/.test(customHex.trim());
    return valid ? customHex.trim() : '#22c55e';
  }
  return ACCENT_LIGHT[accentId] ?? ACCENT_LIGHT.green;
}

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

/**
 * Epoch (ms) of the prayer that most recently passed at or before `now`,
 * scanning today's raw timings (the five salāh + Sunrise). Used as the start
 * anchor for the iOS Live Activity progress bar. Returns null before the day's
 * first event so the caller can fall back to a sensible default.
 */
export function computePrevPrayerEpochMs(
  today: TimingsMap,
  now: Date,
): number | null {
  const nowMs = now.getTime();
  let prev: number | null = null;
  // Scan every event present in today's (already-filtered) timings — the five
  // salāh, Sunrise, and any enabled night times — so the progress bar anchors
  // on whichever one most recently passed (e.g. Islamic Midnight before Fajr).
  for (const key of NEXT_SALAH_ORDER) {
    const hhmm = today[key];
    const at = hhmm ? parseHHMMOnDate(hhmm, now) : null;
    if (!at) continue;
    let t = at.getTime();
    // A time that reads as "future" belongs to the previous calendar day's
    // occurrence when we're looking backwards (e.g. just after midnight).
    if (t > nowMs) t -= 24 * 60 * 60 * 1000;
    if (t <= nowMs && (prev == null || t > prev)) prev = t;
  }
  return prev;
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
  // Locale files use capitalised keys: prayer.Fajr, prayer.Maghrib, etc.
  // Try exact case first, then lowercase so older locale structures still work.
  const kExact = `prayer.${key}`;
  if (i18n.exists(kExact)) return i18n.t(kExact);
  const kLower = `prayer.${key.toLowerCase()}`;
  return i18n.exists(kLower) ? i18n.t(kLower) : key;
}

// Module-level debounce for syncLiveActivity.
// Multiple React effects (state, nextInfo, focusEffect) can fire at nearly
// the same instant when the app launches. Without debouncing, the iOS Swift
// bridge receives 3-4 concurrent start() calls, which races the
// stop-then-restart logic and leaves no active Live Activity on screen.
// 800ms is long enough to coalesce a typical burst of launch-time effects
// but short enough to feel instant to the user.
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingArgs: Parameters<typeof syncLiveActivityImpl>[0] | null = null;

export function syncLiveActivity(
  args: Parameters<typeof syncLiveActivityImpl>[0],
): Promise<void> {
  _pendingArgs = args;
  if (_debounceTimer !== null) {
    // Already waiting — just update the pending args so the latest wins.
    return Promise.resolve();
  }
  return new Promise(resolve => {
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      const a = _pendingArgs!;
      _pendingArgs = null;
      syncLiveActivityImpl(a).then(resolve).catch(resolve);
    }, 800);
  });
}

/**
 * Drive the Live Activity to match the supplied state. Idempotent — call
 * on settings change, on prayer-day data update, and on AppState 'active'.
 */
async function syncLiveActivityImpl(args: {
  options: LiveActivityDisplayOptions;
  today: TimingsMap | null;
  tomorrow?: TimingsMap | null;
  /** Consecutive days starting today — drives the multi-day rollover so the
   *  Live Activity advances to the correct day without the app being opened. */
  week?: TimingsMap[] | null;
  now?: Date;
  locationName?: string;
  coords?: WidgetCoords;
  seasonal?: WidgetSeasonalFlags;
  /** App accent hex — drives the notification tint / Live Activity
   *  system color. Optional; defaults to brand green. */
  accentHex?: string;
  /** iOS only: when the Liquid Glass / system-colours theme is active, the
   *  Live Activity should ignore the brand accent and use the dynamic iOS
   *  system tint so it matches the in-app theme and adapts to light/dark. */
  systemTinted?: boolean;
  /** Android only: which enhanced Live Activity visual style to render. */
  design?: 'colorized' | 'timeOfDay';
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
      args.week ?? undefined,
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
  // Hijri and location intentionally NOT included in the Live Activity
  // anymore — the user explicitly asked for them removed in beta.5.
  // Sunrise is now permanent (not user-toggleable) — always shown in
  // the prayer list as it marks the end of the Fajr window.
  const accentHex = args.accentHex || '#22c55e';

  if (Platform.OS === 'android') {
    await androidStartOrUpdate({
      payload,
      nextPrayerTimestamp,
      nextPrayerLabel: nextLabel,
      hijriLabel: '',
      locationLabel: '',
      accentHex,
      design: args.design ?? 'timeOfDay',
      compactMode: true,
      showSunrise: true,
      showHijri: false,
      showLocation: false,
      // Pass today's raw timings so computePrevPrayerEpoch uses the actual
      // current-day HH:MM strings even after payload rolls over to tomorrow.
      todayTimings: args.today,
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
      // Localized full name so the background refresh task can rebuild the
      // hero label after a rollover (the strip still uses `abbr`).
      name: localizedPrayerLabel(r.key),
      time: r.time,
    }));
    // Start anchor for the progress bar — previous prayer, falling back to one
    // hour before the next prayer so the bar still renders sensibly before the
    // day's first event (or when today's timings are unavailable).
    const prevEpochMs =
      (args.today ? computePrevPrayerEpochMs(args.today, now) : null) ??
      (nextPrayerTimestamp != null ? nextPrayerTimestamp - 60 * 60 * 1000 : 0);

    const content: PrayerLiveActivityContent = {
      locale: i18n.language || 'en',
      nextKey: payload.nextKey ?? '',
      nextLabel,
      nextTime: payload.nextPrayerTime ?? '',
      // Swift ContentState.nextEpochSeconds is Double seconds-since-epoch.
      // nextPrayerTimestamp is ms-since-epoch — divide by 1000.
      nextEpochSeconds: (nextPrayerTimestamp ?? 0) / 1000,
      prevEpochSeconds: prevEpochMs / 1000,
      rows,
      sunriseRow: payload.sunriseRow
        ? {
            key: payload.sunriseRow.key,
            abbr: payload.sunriseRow.abbr,
            name: localizedPrayerLabel(payload.sunriseRow.key),
            time: payload.sunriseRow.time,
          }
        : undefined,
      extraRows: (payload.extraRows ?? []).map(r => ({
        key: r.key,
        abbr: r.abbr,
        name: localizedPrayerLabel(r.key),
        time: r.time,
      })),
      hijriLabel: '',
      locationLabel: '',
      accentHex,
      systemTinted: !!args.systemTinted,
      compactMode: true,
      showSunrise: true,
      showHijri: false,
      showLocation: false,
    };
    try {
      // Start is idempotent — stops any existing activity, then requests
      // a fresh one so the widget extension always renders the latest state.
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
