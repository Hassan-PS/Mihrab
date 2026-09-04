/**
 * Prayer alerts: the master switch and the four questions that only
 * matter once it is on — which sound, which stream, how far ahead, and
 * whether the platform is going to let any of it through.
 *
 * This used to be the whole Notifications page: four unrelated families
 * in one scroll, seven hundred lines, and by the fourth heading nobody
 * had read the second. The extra times and the daily Qur'an reminders
 * now live on their own pages, reached from rows this page's screen
 * draws. What is left is one family, and it fits on a screen.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import notifee, {
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';
import { useNotificationsSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { getNotificationSoundOption } from '../../notifications/notificationSounds';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from './SettingsGroup';

type NotificationsCardProps = {
  onOpenSoundPicker: () => void;
  onOpenPreReminderPicker: () => void;
};

/**
 * The master toggle is async: it asks for the platform's permissions —
 * iOS notifications, Android POST_NOTIFICATIONS, and Android's exact
 * alarm settings page, which the adhan's AlarmManager schedule needs —
 * before flipping `notificationsEnabled` to true.
 */
function NotificationsCardImpl({
  onOpenSoundPicker,
  onOpenPreReminderPicker,
}: NotificationsCardProps) {
  const { t } = useTranslation();
  // Subscribes only to the notifications slice (task #11).
  const { slice: settings, update: updateSettings } = useNotificationsSettings();
  const { palette } = useAppPalette();

  // Android: battery optimization defers or drops the AlarmManager alarms
  // the adhan rides on once nothing (e.g. the Live Activity's foreground
  // service) keeps the app exempt — "adhan never fires" on aggressive
  // shells (v2.7.40). Surface a fix-it row while the app is still
  // optimized, re-checked on foreground so it disappears right after the
  // user excludes the app.
  const [batteryOptimized, setBatteryOptimized] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    const check = () => {
      notifee
        .isBatteryOptimizationEnabled()
        .then(v => {
          if (alive) setBatteryOptimized(v);
        })
        .catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const selectedNotificationSound = useMemo(
    () => getNotificationSoundOption(settings.notificationSound),
    [settings.notificationSound],
  );

  const onToggle = async (value: boolean) => {
    if (!value) {
      updateSettings({ notificationsEnabled: false });
      return;
    }
    if (Platform.OS === 'ios') {
      const perm = await notifee.requestPermission({
        alert: true,
        badge: true,
        sound: true,
      });
      const ok =
        perm.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
        perm.authorizationStatus === AuthorizationStatus.PROVISIONAL;
      if (!ok) return;
    }
    if (
      Platform.OS === 'android' &&
      typeof Platform.Version === 'number' &&
      Platform.Version >= 33
    ) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    if (
      Platform.OS === 'android' &&
      typeof Platform.Version === 'number' &&
      Platform.Version >= 31
    ) {
      const nSettings = await notifee.getNotificationSettings();
      if (nSettings.android.alarm === AndroidNotificationSetting.DISABLED) {
        await notifee.openAlarmPermissionSettings();
      }
    }
    updateSettings({ notificationsEnabled: true });
  };

  const on = settings.notificationsEnabled;

  // No heading on this group: the page is already called Notifications,
  // and a "NOTIFICATIONS" label under a "Notifications" title is a word
  // spent saying nothing. The groups that follow are the ones that need
  // naming.
  return (
    <SettingsGroup>
      <SettingsToggleRow
        title={t('settings.prayerAlerts')}
        help={t('settings.prayerAlertsHelp')}
        value={on}
        onValueChange={onToggle}
      />

      {on && Platform.OS === 'android' && batteryOptimized ? (
        <SettingsLinkRow
          title={t('settings.batteryWarning', 'Alerts may be unreliable')}
          help={t(
            'settings.batteryWarningHelp',
            'Battery optimization can delay or silence adhan alerts while the app is closed. Tap to exclude Mihrab.',
          )}
          onPress={() => {
            notifee.openBatteryOptimizationSettings().catch(() => {});
          }}
          accessory={
            <Text style={[styles.change, { color: palette.accentSolid }]}>
              {t('common.change')}
            </Text>
          }
        />
      ) : null}

      {on ? (
        <SettingsLinkRow
          title={t('settings.notificationSound')}
          value={t(selectedNotificationSound.labelKey)}
          help={t(selectedNotificationSound.helpKey)}
          onPress={onOpenSoundPicker}
        />
      ) : null}

      {/* ANDROID ONLY, and deliberately so. iOS notification sounds obey
          the physical silent switch, and only Apple's Critical Alerts
          entitlement overrides that — granted to health and public-safety
          apps, not to us. A toggle here that did nothing on iPhone would
          be worse than its absence. See settings/types.ts. */}
      {on && Platform.OS === 'android' ? (
        <SettingsToggleRow
          title={t('settings.adhanAlarmStream')}
          help={t('settings.adhanAlarmStreamHelp')}
          value={settings.adhanUsesAlarmStream}
          onValueChange={v => updateSettings({ adhanUsesAlarmStream: v })}
        />
      ) : null}

      {on ? (
        <SettingsLinkRow
          title={t('settings.prePrayerReminder')}
          value={
            settings.prePrayerReminderMinutes === 0
              ? t('settings.prePrayerReminderOff')
              : t('settings.prePrayerReminderOption', {
                  count: settings.prePrayerReminderMinutes,
                })
          }
          help={t('settings.prePrayerReminderHelp')}
          onPress={onOpenPreReminderPicker}
        />
      ) : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  change: { fontSize: 14, fontWeight: '600' },
});

export const NotificationsCard = memo(NotificationsCardImpl);
