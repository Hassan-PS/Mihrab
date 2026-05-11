/**
 * Live Activity — pinned prayer-countdown notification (Android).
 * (iOS uses ActivityKit via the PrayerLiveActivity native module —
 * see `src/native/PrayerLiveActivity.ts` and `src/liveActivity/`.)
 *
 * The notification is intentionally low-importance:
 *  - dedicated channel, no sound, no vibration, no popup
 *  - ongoing+chronometer so Android renders a live countdown without
 *    re-posting every minute
 *  - BigText body lists the rest of the day's prayer times when expanded
 *
 * Lifecycle:
 *  - `startOrUpdateLiveActivity()` is idempotent — call it whenever the
 *    prayer-day payload, settings, or locale change. If the notification
 *    is already pinned, notifee will update it in place (same id).
 *  - `stopLiveActivity()` cancels the pinned notification.
 *  - On BOOT_COMPLETED the OS will dismiss the ongoing notification, so
 *    `index.js` re-arms it on app launch through `syncLiveActivity()`.
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

/** What we render. Built from the widget payload + the user's display
 *  preferences. */
export type LiveActivityRenderInput = {
  payload: WidgetPrayerPayload;
  /** ms-since-epoch of the upcoming prayer the countdown points at;
   *  `null` if there is no next prayer (after-isha case is folded into
   *  the payload's next-day rollover, so this is rarely null). */
  nextPrayerTimestamp: number | null;
  /** Already-localised label for the next prayer, e.g. "Fajr" / "الفجر". */
  nextPrayerLabel: string;
  /** Hijri caption for the secondary line, e.g. "12 Dhul-Qa'dah 1447"; pass
   *  empty string to omit. */
  hijriLabel: string;
  /** Active location caption, e.g. "Stockholm"; pass empty to omit. */
  locationLabel: string;
  /** Display knobs from settings (the Android renderer only needs these;
   *  iOS reads its own equivalents from the live-activity attributes). */
  compactMode: boolean;
  showSunrise: boolean;
  showHijri: boolean;
  showLocation: boolean;
};

/**
 * Ensure the low-importance channel exists. notifee.createChannel is
 * idempotent — calling it on every refresh is fine and lets us update
 * the localised name when the user switches language.
 */
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
      importance: AndroidImportance.LOW, // no sound, no popup
      sound: undefined,
      vibration: false,
    });
  } catch {
    // Non-fatal — Android may rate-limit channel ops in some shells.
  }
}

/**
 * Build the multi-line BigText body. Each row is one prayer; the next
 * prayer is marked with a leading bullet so the eye lands on it first.
 * Past prayers get a leading middle-dot to read as muted.
 */
function buildBigTextBody(input: LiveActivityRenderInput): string {
  const { payload } = input;
  const rows: { key: string; abbr: string; time: string; isNext: boolean; isPast: boolean }[] = [];
  // Splice sunrise at index 1 if enabled, matching the widget convention.
  const baseRows = [...payload.rows];
  if (input.showSunrise && payload.sunriseRow) {
    if (baseRows.length > 0) baseRows.splice(1, 0, payload.sunriseRow);
    else baseRows.push(payload.sunriseRow);
  }
  // We don't know wall-clock past/future from the payload alone, so we
  // infer from `nextKey`: every row up to (and not including) the next
  // prayer's row is past. Robust because the payload itself was built
  // around "now".
  let seenNext = false;
  for (const r of baseRows) {
    const isNext = r.key === payload.nextKey;
    if (isNext) seenNext = true;
    const isPast = !seenNext && !isNext;
    rows.push({
      key: r.key,
      abbr: r.abbr,
      time: r.time,
      isNext,
      isPast,
    });
  }
  // Render: 11 chars padded for the prayer label so columns line up in
  // the BigText render on most Android shells.
  const lines = rows.map(r => {
    const marker = r.isNext ? '› ' : r.isPast ? '·  ' : '   ';
    const label = r.abbr;
    return `${marker}${label.padEnd(10, ' ')} ${r.time}`;
  });
  if (input.showHijri && input.hijriLabel) {
    lines.push('');
    lines.push(input.hijriLabel);
  }
  if (input.showLocation && input.locationLabel) {
    if (!input.showHijri || !input.hijriLabel) lines.push('');
    lines.push(`📍 ${input.locationLabel}`);
  }
  return lines.join('\n');
}

/**
 * Post or update the pinned notification. Idempotent.
 */
export async function startOrUpdateLiveActivity(
  input: LiveActivityRenderInput,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureChannel();

  const titleTpl = i18n.t('liveActivity.title', 'Next prayer');
  const headline = `${titleTpl}: ${input.nextPrayerLabel}`;
  // Body for the collapsed render — single line with the next prayer's time.
  const collapsedBody = input.nextPrayerTimestamp
    ? `${input.nextPrayerLabel} · ${formatHHMM(input.nextPrayerTimestamp)}`
    : i18n.t('liveActivity.soon', 'Starting soon');

  const expandedBody = input.compactMode ? collapsedBody : buildBigTextBody(input);

  try {
    await notifee.displayNotification({
      id: LIVE_ACTIVITY_NOTIFICATION_ID,
      title: headline,
      body: collapsedBody,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_prayer',
        ongoing: true,
        // `autoCancel: false` keeps the notification pinned when the user
        // taps it (the press action still launches the app).
        autoCancel: false,
        // `localOnly: true` keeps Wear OS / connected watches from
        // mirroring a status-style ongoing notification — we don't want
        // the wrist tap to fire on every update.
        localOnly: true,
        // `showChronometer: true` + `chronometerDirection: 'down'`
        // turns the timestamp into a live countdown rendered by the
        // system bar without us re-posting every second.
        showChronometer: input.nextPrayerTimestamp != null,
        chronometerDirection: 'down',
        timestamp: input.nextPrayerTimestamp ?? undefined,
        showTimestamp: input.nextPrayerTimestamp != null,
        category: AndroidCategory.STATUS,
        visibility: AndroidVisibility.PUBLIC,
        importance: AndroidImportance.LOW,
        // BigText style — multi-line list of prayers when the user
        // pulls the shade down.
        style: { type: AndroidStyle.BIGTEXT, text: expandedBody },
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch (e) {
    console.warn('[liveActivity] post failed', e);
  }
}

/** Cancel the pinned notification (no-op on iOS). */
export async function stopLiveActivity(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.cancelNotification(LIVE_ACTIVITY_NOTIFICATION_ID);
  } catch {
    // Non-fatal.
  }
}

function formatHHMM(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
