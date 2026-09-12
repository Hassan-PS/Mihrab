/**
 * "May we notify this person?" — asked once, answered the same way
 * everywhere.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO COPIES ───────────────────────────
 *
 * There were two places that asked: the master switch in Settings →
 * Notifications, and the onboarding step. Settings asked properly — it
 * read the answer and only flipped `notificationsEnabled` when the answer
 * was yes. Onboarding asked, threw the answer away, and wrote no setting
 * at all.
 *
 * `notificationsEnabled` defaults to false, and `shownAlertMode` in
 * settings/alertModes.ts opens with
 *
 *     if (!notificationsEnabled) return 'silent';
 *
 * so every prayer in the day resolves to silent. The result: somebody
 * installs a prayer app, is asked "We can quietly notify you at each
 * prayer time", presses **Enable alerts**, grants the permission — and
 * hears nothing, ever. The operating system lists Mihrab as a permitted
 * notifier the whole time, which is the one state in which nobody thinks
 * to go looking for an in-app switch.
 *
 * So the asking lives here, once. A caller gets a boolean and is expected
 * to act on it.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';

/**
 * Ask for permission to post notifications. True when we may.
 *
 * PROVISIONAL counts as yes on iOS: it is Apple's quiet trial mode, in
 * which notifications are delivered straight to the notification centre
 * without interrupting. They still arrive, so the app may still schedule.
 *
 * Android 12 and below grant notifications at install time — there is
 * nothing to ask and the honest answer is yes. Note that this is about
 * POST_NOTIFICATIONS only: whether an alarm-backed adhan can fire *on
 * time* is the separate exact-alarm permission, which is deliberately not
 * folded in here because a denied exact alarm still leaves a working
 * (if late) notification, and conflating the two would have a user who
 * refused one lose the other.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const perm = await notifee.requestPermission({
      alert: true,
      badge: true,
      sound: true,
    });
    return (
      perm.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
      perm.authorizationStatus === AuthorizationStatus.PROVISIONAL
    );
  }
  if (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version >= 33
  ) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}
