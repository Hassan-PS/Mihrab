import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidStyle,
  AuthorizationStatus,
  TriggerType,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import {
  getNotificationSoundOption,
  NOTIFICATION_SOUND_OPTIONS,
  registerCustomAdhan,
  resolveSoundTargets,
  alarmChannelId,
  type NotificationSoundId,
} from './notificationSounds';
import {
  ensureCustomAdhanChannel,
  ensureAlarmAdhanChannel,
  deleteAdhanChannel,
  syncCustomAdhan,
} from '../native/CustomAdhan';
import { ADHAN_CONTROLS_CATEGORY_ID } from './adhanActionIds';
import { prayerAlertActions } from './prayerAlertActions';
import { JOURNAL_LOG_ACTION_ID } from './prayerLogAction';
import { AdhanPlayer } from '../native/AdhanPlayer';
import { getMutedNextAdhan } from './adhanMute';
import type { TimingsMap } from '../types/prayer';
import { isNonPrayerEvent } from '../types/prayer';
import {
  buildPrePrayerReminderEvents,
  buildUpcomingSalahEvents,
  formatLocalTime,
} from '../utils/prayerTimes';

/** Sunrise + the two night times are not salāh: default sound, no adhan, no
 *  journal action. The predicate lives in types/prayer beside the list, so
 *  every path that has to ask asks the same question — this file used to own
 *  the only copy, and the mute task did not have one. */

/** Safety cap for how long a delivered prayer notification lingers before it
 *  auto-dismisses, when the next prayer is unusually far off (e.g. Isha→Fajr). */
const MAX_LINGER_MS = 12 * 60 * 60 * 1000;
/** A delivered prayer/reminder notification older than this (its scheduled time
 *  is this far in the past) is considered stale and cleared on the next sync. */
const STALE_DISPLAYED_GRACE_MS = 60 * 60 * 1000;

/** Extract the scheduled epoch-ms encoded in one of our notification ids
 *  (`pt-<ms>-<name>` or `pt-pre-<ms>-<name>`). Returns null for foreign ids. */
function prayerNotificationTime(id: string): number | null {
  const m = /^pt-(?:pre-)?(\d+)-/.exec(id);
  return m ? Number(m[1]) : null;
}

/**
 * Clear already-DELIVERED prayer/reminder notifications whose scheduled time is
 * well in the past. `cancelOwnedPrayerNotifications` only cancels pending
 * *triggers*; once a notification has fired it lingers in the shade / AOD until
 * dismissed — which is how a previous prayer's "Prayer time" alert stayed on
 * screen next to the next prayer's reminder (the reported "it says Isha when it
 * isn't"). Going forward `timeoutAfter` auto-dismisses each one when the next
 * prayer arrives; this pass also cleans up ones delivered before that fix.
 */
async function clearStaleDisplayedPrayerNotifications(
  now: number,
): Promise<void> {
  if (Platform.OS !== 'android') return; // iOS delivered list isn't reliably enumerable
  let displayed;
  try {
    displayed = await notifee.getDisplayedNotifications();
  } catch {
    return;
  }
  for (const d of displayed) {
    const id = d.notification?.id;
    if (
      typeof id !== 'string' ||
      !id.startsWith(PRAYER_NOTIFICATION_ID_PREFIX)
    ) {
      continue;
    }
    const t = prayerNotificationTime(id);
    if (t != null && t < now - STALE_DISPLAYED_GRACE_MS) {
      await notifee.cancelDisplayedNotification(id).catch(() => {});
    }
  }
}

/** Prefix used for all prayer-time and pre-prayer trigger notification IDs.
 *  Used to identify "ours" vs other notifications (e.g. the adhan preview)
 *  in the diff-based cancellation pass.
 */
const PRAYER_NOTIFICATION_ID_PREFIX = 'pt-';

const PREVIEW_NOTIFICATION_ID = 'adhan_preview';
let _previewCancelTimeout: ReturnType<typeof setTimeout> | null = null;

async function ensureChannel(
  selectedSound: NotificationSoundId,
  alarmStream = false,
) {
  // BEFORE the Android-only part, because iOS needs this too: what it
  // registers is the converted clip's filename, which is how the notification
  // addresses the user's recording there.
  if (selectedSound === 'custom') {
    const imported = await syncCustomAdhan();
    if (imported) {
      const channelId = await ensureCustomAdhanChannel(
        `Prayer times (${imported.name})`,
      );
      registerCustomAdhan({ ...imported, channelId: channelId ?? undefined });
    }
  }
  if (Platform.OS !== 'android') {
    return;
  }
  const selected = getNotificationSoundOption(selectedSound);
  const defaultOption = getNotificationSoundOption('default');
  // Only two channels are ever used: the `default` channel (pre-prayer
  // reminders + Sunrise) and the selected adhan channel (the five daily
  // prayers). Previously ALL 17 adhan channels were created on every sync,
  // leaving users with 17 near-identical "Prayer times" entries in Android's
  // notification settings. We now create only what's needed and delete the
  // surplus so existing users' settings get cleaned up too. (Channel sound is
  // immutable after creation, which is why each sound still needs its own
  // channel rather than mutating one.)
  //
  // The user's own recording is handled above and is deliberately absent from
  // the loop below: its channel is built natively, around a token derived from
  // the file, because Notifee's channel `sound` only ever resolves a `res/raw`
  // resource. If its file has gone — a reinstall drops it while the setting
  // that selects it survives — `resolveSoundTargets` has already fallen back
  // to the default channel, which is what gets created here.
  const needed = new Set([
    defaultOption.androidChannelId,
    resolveSoundTargets(selectedSound).androidChannelId,
  ]);
  for (const option of NOTIFICATION_SOUND_OPTIONS) {
    // Notifee neither created nor owns the custom channel, and this entry's
    // ids are placeholders — deleting by them would take out the default
    // channel. The native module prunes its own stale channels on import.
    if (option.id === 'custom') continue;
    if (needed.has(option.androidChannelId)) {
      await notifee.createChannel({
        id: option.androidChannelId,
        name:
          option.id === selected.id
            ? `Prayer times (${i18n.t(option.labelKey)})`
            : 'Prayer times',
        importance: AndroidImportance.HIGH,
        vibration: true,
        ...(option.androidSound ? { sound: option.androidSound } : {}),
      });
    } else {
      // No-op when the channel was never created (e.g. fresh installs).
      await notifee.deleteChannel(option.androidChannelId).catch(() => {});
    }
  }

  // ── THE ALARM-STREAM TWIN (issue #9) ────────────────────────────────
  //
  // Built natively, because Notifee's `createChannel` cannot express audio
  // attributes and `USAGE_ALARM` is the entire point: it routes the adhan
  // to the alarm stream, which the ringer switch does not silence.
  //
  // Only ever ONE of these exists — the twin of whatever adhan is
  // selected. The ordinary channels above are still created either way:
  // the pre-prayer reminder and Sunrise keep using them, because a
  // reminder that overrides a silenced phone is not what was asked for.
  //
  // Turning the setting off deletes it, so Android's notification settings
  // do not keep an entry that nothing posts to any more.
  const selectedTargets = resolveSoundTargets(selectedSound);
  const alarmId = alarmChannelId(selectedTargets.androidChannelId);
  if (alarmStream) {
    const option = getNotificationSoundOption(selectedSound);
    await ensureAlarmAdhanChannel(
      alarmId,
      `Prayer times (${i18n.t(option.labelKey)}) — alarm`,
      // null means "the imported recording", which the native side reads
      // from disk. Bundled adhans name their res/raw resource.
      selectedSound === 'custom' ? null : (option.androidSound ?? null),
    );
  } else {
    await deleteAdhanChannel(alarmId);
  }
}

function iosNotificationsAllowed(status: AuthorizationStatus): boolean {
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

/** Re-check exact-alarm permission. Android can revoke SCHEDULE_EXACT_ALARM
 *  at runtime; this MUST be called close to scheduling, not just at boot.
 */
async function canUseExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const settings = await notifee.getNotificationSettings();
  return settings.android.alarm === AndroidNotificationSetting.ENABLED;
}

function buildTimestampTrigger(
  timestamp: number,
  exactAlarms: boolean,
): {
  type: typeof TriggerType.TIMESTAMP;
  timestamp: number;
  alarmManager?: { type: AlarmType };
} {
  const trigger = {
    type: TriggerType.TIMESTAMP as const,
    timestamp,
  };
  if (Platform.OS === 'android') {
    // Always ride AlarmManager on Android (v2.7.28). Without this,
    // notifee schedules through WorkManager, which aggressive OEM
    // battery managers (MIUI, One UI, etc.) defer by minutes — a late
    // adhan is a broken adhan. Exact when the user granted exact-alarm
    // access; otherwise the inexact allow-while-idle variant, which
    // needs no permission and is still far more punctual than WM.
    Object.assign(trigger, {
      alarmManager: {
        type: exactAlarms
          ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE
          : AlarmType.SET_AND_ALLOW_WHILE_IDLE,
      },
    });
  }
  return trigger;
}

/**
 * Clamp the pre-prayer reminder offset to a sane range.
 *
 * Defense-in-depth: settings.coercePrePrayerReminderMinutes already restricts
 * input to a discrete option list, but corrupted AsyncStorage, type-bypass
 * paths, or future callers might pass negative numbers, NaN, Infinity, or
 * absurdly large values. Negative reminders would fire AFTER the prayer
 * (the bug called out in task #3); huge values would create reminders many
 * hours before. Clamp to [0, 60] and reject non-finite input.
 *
 * @returns an integer in [0, 60]. Returns 0 for any invalid input.
 */
export function clampPrePrayerReminderMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const n = Math.floor(value);
  if (n <= 0) return 0;
  if (n >= 60) return 60;
  return n;
}

/**
 * Cancel any existing prayer-time / pre-prayer trigger notifications whose
 * IDs are NOT in `keepIds`. Preserves unrelated notifications (e.g. the
 * adhan preview).
 *
 * This replaces the previous `cancelTriggerNotifications()` bulk call. The
 * bulk call created a window where ALL prayer notifications vanished
 * between cancel and recreate; if the app was killed in that gap, prayer
 * alerts silently disappeared. The diff-based approach only cancels truly
 * obsolete IDs and lets `createTriggerNotification` replace existing IDs
 * atomically (notifee's documented behavior).
 */
async function cancelOwnedPrayerNotifications(
  keepIds: string[],
): Promise<void> {
  const keep = new Set(keepIds);
  let existing;
  try {
    existing = await notifee.getTriggerNotifications();
  } catch {
    // Older notifee versions / flaky native module — fall back to bulk cancel
    // so we at least don't leak orphan notifications. Better than skipping.
    await notifee.cancelTriggerNotifications().catch(() => {});
    return;
  }
  for (const t of existing) {
    const id = t.notification?.id;
    if (typeof id !== 'string') continue;
    if (id === PREVIEW_NOTIFICATION_ID) continue; // never cancel the preview
    if (!id.startsWith(PRAYER_NOTIFICATION_ID_PREFIX)) continue; // only ours
    if (keep.has(id)) continue;
    await notifee.cancelTriggerNotification(id).catch(() => {});
  }
}

/** Play a short preview of the given adhan/notification sound. */
export async function previewAdhanSound(
  soundId: NotificationSoundId,
): Promise<void> {
  // Cancel any in-flight preview
  if (_previewCancelTimeout !== null) {
    clearTimeout(_previewCancelTimeout);
    _previewCancelTimeout = null;
  }
  await notifee.cancelNotification(PREVIEW_NOTIFICATION_ID).catch(() => {});

  // iOS: play the FULL adhan in-app (the Settings screen is open, so this is
  // foreground playback). The notification sound is capped at 30s, so previewing
  // via a notification would only play a 29s clip — playing the bundled full
  // recording lets the user actually hear the complete adhan they're choosing.
  if (Platform.OS === 'ios' && soundId !== 'default') {
    if (soundId === 'custom') {
      // Not a bundle resource, so it is played by path — and by the FULL
      // original rather than the 29s clip the notification would get, which is
      // the whole reason the original is kept alongside it.
      const imported = await syncCustomAdhan();
      if (imported?.path) void AdhanPlayer.playPath(imported.path);
      return;
    }
    void AdhanPlayer.play(soundId);
    return;
  }

  await ensureChannel(soundId);
  const targets = resolveSoundTargets(soundId);

  await notifee.displayNotification({
    id: PREVIEW_NOTIFICATION_ID,
    title: i18n.t('settings.adhanPreviewTitle'),
    body: i18n.t('settings.adhanPreviewBody', { defaultValue: '' }),
    ios: { sound: targets.iosSound },
    android: {
      channelId: targets.androidChannelId,
      smallIcon: 'ic_stat_prayer',
      pressAction: { id: 'default' },
    },
  });

  // Auto-cancel after 30 s (adhan recordings are ~30–60 s; this clears the banner)
  _previewCancelTimeout = setTimeout(() => {
    _previewCancelTimeout = null;
    notifee.cancelNotification(PREVIEW_NOTIFICATION_ID).catch(() => {});
  }, 30000);
}

/** Cancel any in-flight adhan preview notification. */
export async function stopAdhanPreview(): Promise<void> {
  if (_previewCancelTimeout !== null) {
    clearTimeout(_previewCancelTimeout);
    _previewCancelTimeout = null;
  }
  void AdhanPlayer.stop();
  await notifee.cancelNotification(PREVIEW_NOTIFICATION_ID).catch(() => {});
}

/**
 * Result of a sync attempt. Exposed so callers (HomeScreen) can react —
 * e.g. show an "exact-alarm permission revoked" banner when
 * `status === 'scheduled'` and `exactAlarms === false` on Android.
 */
export type SyncPrayerNotificationsResult =
  | { status: 'disabled' }
  | { status: 'ios-permission-denied' }
  | {
      status: 'scheduled';
      scheduledCount: number;
      exactAlarms: boolean;
      reminderMinutes: number;
    };

/**
 * Stable id for the "Log prayer in journal" notification action — task #99.
 *
 * Every prayer-time notification carries this action. Pressing it RECORDS
 * the prayer — see `prayerLogAction`, which owns the write and works with
 * the app closed. It used only to hand a deep-link to the Log screen, which
 * meant it did nothing at all unless that screen happened to be open;
 * fixed 2026-08-07.
 */
export { JOURNAL_LOG_ACTION_ID };

/** Local ISO day key for the day an alert belongs to. Local, not UTC: the
 *  journal is keyed on the day the user is living in. */
function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function syncPrayerNotifications(params: {
  enabled: boolean;
  prePrayerReminderMinutes: number;
  notificationSound: NotificationSoundId;
  /** Android: post the adhan to the alarm-stream channel, so the ringer
   *  switch does not silence it (issue #9). */
  adhanUsesAlarmStream?: boolean;
  today: TimingsMap;
  tomorrow?: TimingsMap;
  /** The local calendar day `today` was fetched for — see
   *  buildUpcomingSalahEvents. Pass whenever available. */
  baseDate?: Date;
  /** Consecutive cached days starting today (`week[0]` = today). Days beyond
   *  tomorrow extend alert coverage so alerts keep firing when the app isn't
   *  opened for a couple of days (v2.7.40) — capped internally. */
  week?: TimingsMap[];
  /** When true, the prayer-time alert gets a "Log prayer" action — task #99. */
  journalLogActionEnabled?: boolean;
}): Promise<SyncPrayerNotificationsResult> {
  if (!params.enabled) {
    await cancelOwnedPrayerNotifications([]);
    return { status: 'disabled' };
  }
  if (Platform.OS === 'ios') {
    const n = await notifee.getNotificationSettings();
    if (!iosNotificationsAllowed(n.authorizationStatus)) {
      await cancelOwnedPrayerNotifications([]);
      return { status: 'ios-permission-denied' };
    }
  }
  const useAlarmStream = params.adhanUsesAlarmStream === true;
  await ensureChannel(params.notificationSound, useAlarmStream);
  const prayerTimeSound = getNotificationSoundOption(params.notificationSound);
  const reminderSound = getNotificationSoundOption('default');
  const exactAlarms = await canUseExactAlarms();
  const now = new Date();
  // "Mute next adhan" marker ("<epochMs>-<name>") set from the Live Activity
  // toggle. The matching prayer is scheduled with the plain default sound so a
  // full resync (e.g. on app focus) doesn't undo the mute.
  const mutedNextAdhan = await getMutedNextAdhan();
  const salahEvents = buildUpcomingSalahEvents(
    params.today,
    params.tomorrow,
    now,
    params.baseDate ?? now,
    // Two extra cached days beyond tomorrow (4 days of coverage total).
    // Capped so a sync stays a few dozen AlarmManager registrations, well
    // under the per-app alarm limit and quick enough for an on-focus sync.
    params.week?.slice(2, 4) ?? [],
  );
  const reminderMinutes = clampPrePrayerReminderMinutes(
    params.prePrayerReminderMinutes,
  );
  const reminderEvents =
    reminderMinutes > 0
      ? buildPrePrayerReminderEvents(salahEvents, reminderMinutes, now)
      : [];

  // Nothing schedulable — the data is entirely in the past (e.g. a sync
  // fired with state fetched 2+ days ago, before the refetch landed).
  // Keep whatever is already scheduled rather than wiping the pending
  // alarms and leaving the user with NO alerts until the next good sync.
  if (salahEvents.length === 0 && reminderEvents.length === 0) {
    return {
      status: 'scheduled',
      scheduledCount: 0,
      exactAlarms,
      reminderMinutes,
    };
  }

  // Compute desired ID set BEFORE cancelling, so we know which existing
  // notifications to keep. createTriggerNotification with the same ID
  // replaces atomically (no cancel/recreate gap).
  const desiredIds = new Set<string>();
  for (const e of salahEvents) {
    desiredIds.add(
      `${PRAYER_NOTIFICATION_ID_PREFIX}${e.at.getTime()}-${e.name}`,
    );
  }
  for (const e of reminderEvents) {
    desiredIds.add(
      `${PRAYER_NOTIFICATION_ID_PREFIX}pre-${e.at.getTime()}-${e.name}`,
    );
  }
  await cancelOwnedPrayerNotifications([...desiredIds]);
  // Sweep up any previously-delivered prayer/reminder alerts that are now stale
  // (their time is well past) so an old prayer's banner can't sit next to the
  // current one in the shade / AOD.
  await clearStaleDisplayedPrayerNotifications(now.getTime());

  for (let i = 0; i < salahEvents.length; i++) {
    const e = salahEvents[i];
    const notificationId = `${PRAYER_NOTIFICATION_ID_PREFIX}${e.at.getTime()}-${
      e.name
    }`;
    // Sunrise, Islamic Midnight and the Last Third are NOT prayers, so they
    // must never play the adhan even when one is selected for the five daily
    // prayers. They fall back to the plain default notification sound; every
    // actual prayer uses the user's chosen adhan/sound.
    const isNonPrayer = isNonPrayerEvent(e.name);
    const isMutedNext = mutedNextAdhan === `${e.at.getTime()}-${e.name}`;
    const eventSound =
      isNonPrayer || isMutedNext ? reminderSound : prayerTimeSound;
    // The alarm twin is for the CALL TO PRAYER only. Sunrise and the night
    // times are not prayers, and a muted next adhan has just been silenced
    // on purpose — neither should override a silenced phone.
    const eventTargets = resolveSoundTargets(
      eventSound.id,
      useAlarmStream && !isNonPrayer && !isMutedNext,
    );
    const usesAdhan = eventSound.id !== 'default';
    const atPrayerTitle = i18n.t(`prayer.${e.name}`, { defaultValue: e.name });
    // A prayer alert says "Prayer time"; Sunrise / the night times are NOT
    // prayers, so they show the clock time instead of the misleading
    // "Prayer time" line (reported for the Sunrise alert).
    const atPrayerBody = isNonPrayer
      ? formatLocalTime(e.at)
      : i18n.t('alertCopy.atPrayer');
    // Auto-dismiss this alert when the NEXT event is due, so a fired prayer's
    // notification never lingers into (or past) the following prayer. Capped
    // for the long Isha→Fajr gap. Android honours this even if the app is
    // killed, which is the case that produced the stale "Isha" alert.
    const nextAt = salahEvents[i + 1]?.at.getTime();
    const timeoutAfterMs = Math.max(
      60_000,
      Math.min(nextAt ? nextAt - e.at.getTime() : MAX_LINGER_MS, MAX_LINGER_MS),
    );
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        // Translate the prayer name through i18n so the notification reads
        // in the active app language ("الفجر" rather than "Fajr" for an
        // Arabic user). `e.name` is the canonical English key (Fajr,
        // Sunrise, …) which doubles as the i18n lookup key under
        // `prayer.<name>`. Falls back to the raw English name if the
        // active locale is missing the entry.
        title: atPrayerTitle,
        body: atPrayerBody,
        data: {
          kind: 'prayer_time',
          usesAdhan: usesAdhan ? '1' : '0',
          // The day this alert is FOR. The "Log prayer" action writes to it
          // rather than to whatever day it is when the button is pressed:
          // Isha fires at 23:40 in a Swedish winter and gets answered after
          // midnight, and crediting the wrong day is the one thing a record
          // must not do. `prayerLogAction` reads this, falling back to the
          // timestamp in the notification id.
          targetDate: ymdLocal(e.at),
          prayer: e.name,
          // The selected adhan's id doubles as the bundled audio base name
          // (e.g. 'adhan_makkah' → adhan_makkah.mp3). The iOS foreground handler
          // uses it to play the FULL adhan on tap / when the app is open, since
          // iOS caps the notification sound itself at 30s.
          adhanSound: eventSound.id,
        },
        ios: {
          sound: eventTargets.iosSound,
          // Every real prayer (adhan or plain) carries the Stop + Snooze
          // category so both actions are available; non-prayer events (Sunrise,
          // night times) get no actions.
          ...(isNonPrayer ? {} : { categoryId: ADHAN_CONTROLS_CATEGORY_ID }),
        },
        android: {
          channelId: eventTargets.androidChannelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
          // Self-clear when the next prayer arrives (see timeoutAfterMs above).
          timeoutAfter: timeoutAfterMs,
          // BigText style: shows the body in full when the notification
          // is expanded, and gives Android more room in the collapsed
          // grouped-summary view than a single-line ticker. The text is
          // intentionally short; the style mostly fixes the case where a
          // longer prayer-name title squeezed the body to a single ellipsised
          // word (reported in v2.0.13 with Arabic locale).
          style: { type: AndroidStyle.BIGTEXT, text: atPrayerBody },
          // Built in prayerAlertActions so the alert and the copy a snooze
          // re-fires can never drift apart again. Non-prayer events
          // (Sunrise, the night times) carry none: there is nothing to log
          // and nothing to be late for.
          actions: isNonPrayer ? [] : prayerAlertActions(e.name),
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }

  for (const e of reminderEvents) {
    const notificationId = `${PRAYER_NOTIFICATION_ID_PREFIX}pre-${e.at.getTime()}-${
      e.name
    }`;
    // Sunrise and the three night marks get the warning too — a reader who
    // turned on the Last Third to be up for it wants the same fifteen
    // minutes' notice the five salāh get, and an alert at the moment itself
    // is no use to someone who needs to be awake before it. What they don't
    // get is being called a prayer: the alert AT the time shows their clock
    // time instead of "Prayer time", and the one ahead of it says the same
    // thing — "02:30 · starts in 15 min" — so the reader knows what is
    // coming without doing the arithmetic.
    const preBody = isNonPrayerEvent(e.name)
      ? `${formatLocalTime(
          new Date(e.at.getTime() + reminderMinutes * 60_000),
        )} · ${i18n.t('alertCopy.prePrayer', { count: reminderMinutes })}`
      : i18n.t('alertCopy.prePrayer', { count: reminderMinutes });
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: i18n.t(`prayer.${e.name}`, { defaultValue: e.name }),
        body: preBody,
        ios: {
          sound: reminderSound.iosSound,
        },
        android: {
          style: { type: AndroidStyle.BIGTEXT, text: preBody },
          channelId: reminderSound.androidChannelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
          // The "starts in N min" reminder auto-dismisses when the prayer
          // actually begins, so it never lingers past its own prayer.
          timeoutAfter: Math.max(60_000, reminderMinutes * 60_000),
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }

  return {
    status: 'scheduled',
    scheduledCount: salahEvents.length + reminderEvents.length,
    exactAlarms,
    reminderMinutes,
  };
}
