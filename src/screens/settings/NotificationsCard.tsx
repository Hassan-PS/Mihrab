// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo, useState } from 'react';
import {
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
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
  // Which daily-notification time the picker edits (v2.7.28: khatmah too).
  const [timeTarget, setTimeTarget] = useState<'ayah' | 'khatmah' | null>(
    null,
  );

  /** Platform notification permission (subset of the master toggle flow). */
  const ensureNotifPermission = async (): Promise<boolean> => {
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
  };

  const onToggleAyahOfDay = async (value: boolean) => {
    if (!value) {
      updateSettings({ ayahOfDayEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ ayahOfDayEnabled: true });
  };

  const onToggleKhatmahReminder = async (value: boolean) => {
    if (!value) {
      updateSettings({ khatmahReminderEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ khatmahReminderEnabled: true });
  };

  const fmtTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const pickerHour =
    timeTarget === 'khatmah'
      ? settings.khatmahReminderHour
      : settings.ayahOfDayHour;
  const pickerMinute =
    timeTarget === 'khatmah'
      ? settings.khatmahReminderMinute
      : settings.ayahOfDayMinute;
  const setPickerHour = (h: number) => {
    if (timeTarget === 'khatmah') updateSettings({ khatmahReminderHour: h });
    else updateSettings({ ayahOfDayHour: h });
  };
  const setPickerMinute = (m: number) => {
    if (timeTarget === 'khatmah') updateSettings({ khatmahReminderMinute: m });
    else updateSettings({ ayahOfDayMinute: m });
  };

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
          thumbColor={'#ffffff'}
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

      {/* Additional, non-prayer times. Each gates one entry across the prayer
          table, notifications, home-screen widget, and Live Activity. They use
          the default notification sound (never the adhan). Shown regardless of
          the master alerts toggle because they also control table/widget
          visibility, not just notifications. */}
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.additionalTimes')}
      </Text>

      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.sunriseTime')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.sunriseTimeHelp')}
          </Text>
        </View>
        <Switch
          value={settings.sunriseEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => updateSettings({ sunriseEnabled: v })}
        />
      </View>

      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.islamicMidnight')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.islamicMidnightHelp')}
          </Text>
        </View>
        <Switch
          value={settings.islamicMidnightEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => updateSettings({ islamicMidnightEnabled: v })}
        />
      </View>

      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.lastThird')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.lastThirdHelp')}
          </Text>
        </View>
        <Switch
          value={settings.lastThirdEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => updateSettings({ lastThirdEnabled: v })}
        />
      </View>

      {/* Ayah of the day (v2.7.27) — daily random ayah + translation at a
          chosen time. Independent of the master prayer-alerts toggle. */}
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('quran.ayahOfDayTitle', 'Ayah of the day')}
      </Text>

      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.ayahOfDay', 'Daily ayah notification')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t(
              'settings.ayahOfDayHelp',
              'A randomly chosen ayah with its translation, every day.',
            )}
          </Text>
        </View>
        <Switch
          value={settings.ayahOfDayEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={onToggleAyahOfDay}
        />
      </View>

      {settings.ayahOfDayEnabled && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.ayahOfDayTime', 'Notification time')}
          style={[
            s.card,
            s.rowPress,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={() => setTimeTarget('ayah')}>
          <View style={s.switchCopy}>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.ayahOfDayTime', 'Notification time')}
            </Text>
            <Text style={[s.valueText, { color: palette.text }]}>
              {fmtTime(settings.ayahOfDayHour, settings.ayahOfDayMinute)}
            </Text>
          </View>
          <Text style={[s.changeLink, { color: palette.accent }]}>
            {t('common.change')}
          </Text>
        </Pressable>
      )}

      {/* Khatmah daily reminder (v2.7.28) — only meaningful while a plan
          is active; the scheduler no-ops otherwise. */}
      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.khatmahReminder', 'Khatmah daily reminder')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t(
              'settings.khatmahReminderHelp',
              "Today's portion and where to continue, while a khatmah is active.",
            )}
          </Text>
        </View>
        <Switch
          value={settings.khatmahReminderEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={onToggleKhatmahReminder}
        />
      </View>

      {settings.khatmahReminderEnabled && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.ayahOfDayTime', 'Notification time')}
          style={[
            s.card,
            s.rowPress,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={() => setTimeTarget('khatmah')}>
          <View style={s.switchCopy}>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.ayahOfDayTime', 'Notification time')}
            </Text>
            <Text style={[s.valueText, { color: palette.text }]}>
              {fmtTime(
                settings.khatmahReminderHour,
                settings.khatmahReminderMinute,
              )}
            </Text>
          </View>
          <Text style={[s.changeLink, { color: palette.accent }]}>
            {t('common.change')}
          </Text>
        </Pressable>
      )}

      {/* Time picker — hour stepper + quarter-hour minute chips. Shared
          by the ayah-of-the-day and khatmah reminder rows. */}
      <Modal
        visible={timeTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setTimeTarget(null)}>
        <Pressable
          style={[timeStyles.backdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setTimeTarget(null)}
        />
        <View style={[timeStyles.sheet, { backgroundColor: palette.card }]}>
          <Text style={[timeStyles.title, { color: palette.text }]}>
            {t('settings.ayahOfDayTime', 'Notification time')}
          </Text>
          <View style={timeStyles.hourRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.hourDown', 'Hour −')}
              hitSlop={8}
              onPress={() => setPickerHour((pickerHour + 23) % 24)}
              style={[timeStyles.stepBtn, { borderColor: palette.border }]}>
              <Text style={[timeStyles.stepGlyph, { color: palette.accentSolid }]}>
                −
              </Text>
            </Pressable>
            <Text style={[timeStyles.timeValue, { color: palette.text }]}>
              {fmtTime(pickerHour, pickerMinute)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.hourUp', 'Hour +')}
              hitSlop={8}
              onPress={() => setPickerHour((pickerHour + 1) % 24)}
              style={[timeStyles.stepBtn, { borderColor: palette.border }]}>
              <Text style={[timeStyles.stepGlyph, { color: palette.accentSolid }]}>
                +
              </Text>
            </Pressable>
          </View>
          <View style={timeStyles.minuteRow}>
            {[0, 15, 30, 45].map(m => {
              const selected = pickerMinute === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setPickerMinute(m)}
                  style={[
                    timeStyles.chip,
                    {
                      backgroundColor: selected
                        ? palette.accentBg
                        : 'transparent',
                      borderColor: selected
                        ? palette.accentSolid
                        : palette.border,
                    },
                  ]}>
                  <Text
                    style={{
                      color: selected ? palette.accentSolid : palette.muted,
                      fontWeight: '600',
                      fontSize: 13,
                      fontVariant: ['tabular-nums'],
                    }}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.done', 'Done')}
            onPress={() => setTimeTarget(null)}
            style={[timeStyles.doneBtn, { backgroundColor: palette.accentSolid }]}>
            <Text style={timeStyles.doneLabel}>{t('common.done', 'Done')}</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const timeStyles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 20, fontWeight: '700' },
  timeValue: {
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 110,
    textAlign: 'center',
  },
  minuteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  doneBtn: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneLabel: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});

export const NotificationsCard = memo(NotificationsCardImpl);
