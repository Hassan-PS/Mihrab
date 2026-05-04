// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo } from 'react';
import { PermissionsAndroid, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import notifee, {
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';
import { useNotificationsSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { getNotificationSoundOption } from '../../notifications/notificationSounds';
import { sharedSettingsStyles as s } from './sharedStyles';

type NotificationsCardProps = {
  onOpenSoundPicker: () => void;
  onOpenPreReminderPicker: () => void;
};

/**
 * Notifications card. The toggle is async — it requests the platform-specific
 * permissions (iOS notification, Android POST_NOTIFICATIONS, Android exact
 * alarm settings page) before flipping `notificationsEnabled` to true.
 */
function NotificationsCardImpl({
  onOpenSoundPicker,
  onOpenPreReminderPicker,
}: NotificationsCardProps) {
  const { t } = useTranslation();
  // Subscribes only to the notifications slice (task #11).
  const { slice: settings, update: updateSettings } = useNotificationsSettings();
  const { palette } = useAppPalette();

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

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.notifications')}
      </Text>
      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.prayerAlerts')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.prayerAlertsHelp')}
          </Text>
        </View>
        <Switch
          value={settings.notificationsEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={settings.notificationsEnabled ? palette.accentSolid : '#f3f4f6'}
          onValueChange={onToggle}
        />
      </View>

      {settings.notificationsEnabled && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.notificationSound')}
          style={[
            s.card,
            s.rowPress,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={onOpenSoundPicker}>
          <View style={s.switchCopy}>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.notificationSound')}
            </Text>
            <Text style={[s.valueText, { color: palette.text }]}>
              {t(selectedNotificationSound.labelKey)}
            </Text>
            <Text style={[s.help, { color: palette.muted }]}>
              {t(selectedNotificationSound.helpKey)}
            </Text>
          </View>
          <Text style={[s.changeLink, { color: palette.accent }]}>
            {t('common.change')}
          </Text>
        </Pressable>
      )}

      {settings.notificationsEnabled && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.prePrayerReminder')}
          style={[
            s.card,
            s.rowPress,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={onOpenPreReminderPicker}>
          <View style={s.switchCopy}>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.prePrayerReminder')}
            </Text>
            <Text style={[s.valueText, { color: palette.text }]}>
              {settings.prePrayerReminderMinutes === 0
                ? t('settings.prePrayerReminderOff')
                : t('settings.prePrayerReminderOption', {
                    count: settings.prePrayerReminderMinutes,
                  })}
            </Text>
            <Text style={[s.help, { color: palette.muted }]}>
              {t('settings.prePrayerReminderHelp')}
            </Text>
          </View>
          <Text style={[s.changeLink, { color: palette.accent }]}>
            {t('common.change')}
          </Text>
        </Pressable>
      )}
    </>
  );
}

export const NotificationsCard = memo(NotificationsCardImpl);
