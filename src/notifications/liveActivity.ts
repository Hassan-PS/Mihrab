/**
 * Live Activity — pinned prayer-countdown notification (Android).
 * (iOS uses ActivityKit via the PrayerLiveActivity native module —
 * see `src/native/PrayerLiveActivity.ts` and `src/liveActivity/`.)
 *
 * Design notes (v2.1.0-beta.2):
 *  - **InboxStyle** for the expanded view. Each prayer renders as its own
 *    visible row. The previous BigText approach was rendering as a wall
 *    of wrapped paragraph text on MIUI/OxygenOS/ColorOS — those shells
 *    auto-flow the bigText paragraph and visibly collapse embedded
 *    newlines. InboxStyle's `lines: string[]` is the platform-native way
 *    to render a list and behaves identically across vendors.
 *  - **Chronometer** stays. notifee maps it to the system metadata row
 *    next to the app name, so the live countdown ticks without us
 *    re-posting; the small icon stays in the status bar.
 *  - **Accent color** drives the small-icon tint and the chronometer
 *    text colour on Android 12+ Material You shells.
 *  - **Friendly countdown text** ("in 3h 47m") in the body line so even
 *    shells that don't render the chronometer prominently still
 *    communicate the duration at a glance.
 *  - **Short location** — the geocoded label can be a full address
 *    ("Stockholm, Stockholm Municipality, Stockholm County, 111 29,
 *    Sweden"). We render the first comma-separated component, which is
 *    virtually always the locality.
 *
 * Lifecycle:
 *  - `startOrUpdateLiveActivity()` is idempotent — call it whenever the
 *    prayer-day payload, settings, or locale change. notifee replaces
 *    in place when the id matches.
 *  - `stopLiveActivity()` cancels the pinned notification.
 *  - The OS clears ongoing notifications on reboot; index.js re-arms
 *    via `syncLiveActivity()` on next foreground.
 */

import { Platform } from 'react-native';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
} from '@notifee/react-native';
import i18n from '../i18n';
import type { WidgetPrayerPayload } from '../widget/buildWidgetPayload';

/** Stable notifee id — fixed so updates replace in place, not stack. */
export const LIVE_ACTIVITY_NOTIFICATION_ID = 'mihrab.live_activity.prayer_countdown';

/** Dedicated low-importance channel so the ongoing notification doesn't
 *  sound or vibrate when first posted. */
const CHANNEL_ID = 'mihrab_live_activity_v1';

export type LiveActivityRenderInput = {
  payload: WidgetPrayerPayload;
  /** ms-since-epoch of the upcoming prayer. */
  nextPrayerTimestamp: number | null;
  /** Already-localised label for the next prayer. */
  nextPrayerLabel: string;
  /** Hijri caption, e.g. "12 Dhul-Qa'dah 1447" — empty = omit. */
  hijriLabel: string;
  /** Active location caption — we shorten internally. */
  locationLabel: string;
  /** App accent color hex, e.g. "#6BC98A". */
  accentHex: string;
  /** Display knobs from settings. */
  compactMode: boolean;
  showSunrise: boolean;
  showHijri: boolean;
  showLocation: boolean;
};

/** ── Channel ─────────────────────────────────────────────────────── */

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: i18n.t('liveActivity.channelName', 'Prayer countdown'),
      description: i18n.t(
        'liveActivity.channelDesc',
        'Pinned ongoing notification with the next-prayer countdown.',
      ),
      importance: AndroidImportance.LOW,
      sound: undefined,
      vibration: false,
    });
  } catch {
    // Non-fatal.
  }
}

/** ── Helpers ─────────────────────────────────────────────────────── */

/** First comma-separated component, e.g. "Stockholm" from a full
 *  geocoded address. */
function shortLocation(label: string): string {
  if (!label) return '';
  const first = label.split(',')[0]?.trim();
  return first || label;
}

function formatHHMM(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Compact human duration: "3h 47m" / "47m" / "30s". */
function formatRemaining(ms: number): string {
  if (ms <= 0) return i18n.t('liveActivity.now', 'Now');
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return `${Math.floor(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Look up the long localised prayer name (e.g. "Maghrib" not "Magh"),
 * falling back to the canonical row key if no translation exists. Row
 * keys are stable (Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha) so the fallback
 * is always meaningful.
 */
function localizedPrayerName(key: string): string {
  const k = `prayer.${key.toLowerCase()}`;
  return i18n.exists(k) ? i18n.t(k) : key;
}

/**
 * Build the InboxStyle line list. One entry per prayer in chronological
 * order, with the next prayer carrying a leading "›" marker so the eye
 * lands on it.
 */
function buildInboxLines(input: LiveActivityRenderInput): string[] {
  const { payload } = input;
  const ordered = [...payload.rows];
  if (input.showSunrise && payload.sunriseRow) {
    if (ordered.length > 0) ordered.splice(1, 0, payload.sunriseRow);
    else ordered.push(payload.sunriseRow);
  }
  return ordered.map(r => {
    const isNext = r.key === payload.nextKey;
    const marker = isNext ? '›' : ' ';
    const name = localizedPrayerName(r.key);
    // Use NBSP between marker/name/time so the shell doesn't collapse
    // the leading marker indent — InboxStyle treats each line as a
    // single CharSequence and trims leading whitespace.
    return `${marker}  ${name}  ${r.time}`;
  });
}

/** ── Public API ──────────────────────────────────────────────────── */

export async function startOrUpdateLiveActivity(
  input: LiveActivityRenderInput,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureChannel();

  // ── Text ────────────────────────────────────────────────────────
  const nextTime = input.nextPrayerTimestamp
    ? formatHHMM(input.nextPrayerTimestamp)
    : '';
  const remaining = input.nextPrayerTimestamp
    ? formatRemaining(input.nextPrayerTimestamp - Date.now())
    : i18n.t('liveActivity.soon', 'Starting soon');

  // Title — what's next + when. Same in collapsed and expanded.
  const title = nextTime
    ? `${input.nextPrayerLabel} · ${nextTime}`
    : input.nextPrayerLabel || i18n.t('liveActivity.soon', 'Starting soon');

  // Body — countdown + optional location, separated by middle dots.
  const inLabel = i18n.t('liveActivity.in', 'in {{remaining}}', { remaining });
  const locShort =
    input.showLocation && input.locationLabel
      ? shortLocation(input.locationLabel)
      : '';
  const body = locShort ? `${inLabel} · ${locShort}` : inLabel;

  // Expanded — InboxStyle list. Compact mode skips the list entirely.
  const inboxLines = input.compactMode ? [] : buildInboxLines(input);

  // Summary — Hijri date when enabled. Lives below the InboxStyle list.
  const summary =
    input.showHijri && input.hijriLabel ? input.hijriLabel : undefined;

  try {
    await notifee.displayNotification({
      id: LIVE_ACTIVITY_NOTIFICATION_ID,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_prayer',
        // App accent tints the small icon on Android 8+ and the
        // chronometer text colour on Android 12+ Material You shells.
        color: input.accentHex || undefined,
        ongoing: true,
        autoCancel: false,
        // No Wear OS mirror — info-only surface, the wrist would
        // re-render on every update.
        localOnly: true,
        // Live countdown rendered by the system. timestamp = target
        // instant, chronometerDirection 'down' → ticks toward it.
        showChronometer: input.nextPrayerTimestamp != null,
        chronometerDirection: 'down',
        timestamp: input.nextPrayerTimestamp ?? undefined,
        showTimestamp: input.nextPrayerTimestamp != null,
        category: AndroidCategory.STATUS,
        visibility: AndroidVisibility.PUBLIC,
        importance: AndroidImportance.LOW,
        // InboxStyle = platform-native list-of-lines. Each line is a
        // separate visible row; the shell elides them per its own
        // density rules. Empty lines[] → fall back to the body.
        style:
          inboxLines.length > 0
            ? {
                type: AndroidStyle.INBOX,
                lines: inboxLines,
                title,
                summary,
              }
            : undefined,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch (e) {
    console.warn('[liveActivity] post failed', e);
  }
}

export async function stopLiveActivity(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.cancelNotification(LIVE_ACTIVITY_NOTIFICATION_ID);
  } catch {
    // Non-fatal.
  }
}
