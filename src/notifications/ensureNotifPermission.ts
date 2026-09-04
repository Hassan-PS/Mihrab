/**
 * "May we post a notification at all?" — asked before a toggle that
 * would otherwise promise something the platform will not deliver.
 *
 * This is the subset of the master prayer-alerts flow that every other
 * reminder needs: the iOS permission prompt and Android 13's
 * POST_NOTIFICATIONS. It deliberately does NOT ask about exact alarms —
 * only the adhan rides on AlarmManager, and sending someone to a system
 * settings page for a daily ayah would be a toll nothing here charges.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';

export async function ensureNotifPermission(): Promise<boolean> {
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
