/**
 * Screen 4 — alerts.
 *
 * One screen that finally does the whole job: the permission, the setting
 * the permission implies, the adhan, the advance reminder, and — on
 * Android 12+ — the exact-alarm grant that used to be a screen of its own
 * whose entire content was a paragraph about a system dialog.
 *
 * ── THE WRITE THAT WAS MISSING FOR A YEAR ─────────────────────────────
 *
 * `notificationsEnabled` defaults to false and `alertModes.ts` turns
 * every prayer silent while it is. The old step asked the OS for
 * permission and wrote nothing, so pressing "Enable alerts" and granting
 * it produced an app that never spoke — with the OS listing Mihrab as a
 * permitted notifier, which is the one state in which nobody goes looking
 * for an in-app switch. Fixed in Phase 0; this screen keeps the contract
 * and the reasoning.
 *
 * Only on a yes. A settings key claiming we may notify while the OS
 * forbids it is a lie the home-screen banner then has to untangle, and it
 * makes the Settings switch read as on while nothing arrives.
 *
 * ── AND THE ADHAN, HERE, NOT IN SETTINGS ──────────────────────────────
 *
 * Seventeen adhans ship with the app and the default is the system tone,
 * which is how a large share of people conclude a prayer app has no
 * adhan. Four are offered here — the rest stay in Settings, where the
 * import-your-own path and its native plumbing already live. A shortlist
 * is the point: this is a screen about whether the app speaks at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import notifee, {
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useIsActive } from '../../hooks/useIsActive';
import { requestNotificationPermission } from '../../notifications/requestNotificationAccess';
import {
  NOTIFICATION_SOUND_OPTIONS,
  type NotificationSoundId,
} from '../../notifications/notificationSounds';
import {
  previewAdhanSound,
  stopAdhanPreview,
} from '../../notifications/prayerNotifications';
import {
  SettingsGroup,
  SettingsLinkRow,
} from '../../screens/settings/SettingsGroup';
import { PreReminderModal } from '../../screens/settings/PreReminderModal';
import type { PrePrayerReminderMinutes } from '../../settings/prePrayerReminder';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
  QuietAction,
} from '../OnboardingChrome';

/**
 * The shortlist. Ids only — the labels come off each option's own
 * `labelKey`, so this screen never carries its own copy of four names
 * that Settings would then have to be kept in step with.
 */
const SHORTLIST: NotificationSoundId[] = [
  'adhan_makkah',
  'adhan_madina',
  'adhan_abdul_basit',
  'default',
];

type Face = 'unasked' | 'granted' | 'denied';

export function AlertsScreen({
  progress,
  onAdvance,
}: {
  progress: { now: number; total: number } | null;
  onAdvance: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const active = useIsActive();
  const [osGranted, setOsGranted] = useState(false);
  const [refused, setRefused] = useState(false);
  const [alarmOk, setAlarmOk] = useState(true);
  const [preModal, setPreModal] = useState(false);
  const [previewing, setPreviewing] = useState<NotificationSoundId | null>(null);

  /**
   * Which face this screen wears — derived, not stored.
   *
   * "Granted" means BOTH that the OS allows it and that the app's own
   * master switch is on. Somebody re-running setup who turned alerts off
   * in Settings still has the OS permission; showing them the adhan list
   * as if alerts were on, while the shelf (which reads the switch) then
   * hides its alert rows, is two screens disagreeing about one fact. So
   * such a user sees the CTA again, and pressing it — which returns at
   * once, the permission being already held — is what turns the switch
   * back on. Nothing is flipped behind their back.
   *
   * "Denied" is the OS saying no to THIS screen's request, and it clears
   * the moment the OS says yes: the row that sends the user to system
   * settings can bring them back with the permission granted.
   */
  const face: Face = refused
    ? 'denied'
    : osGranted && settings.notificationsEnabled
      ? 'granted'
      : 'unasked';

  /**
   * Re-read whenever the app comes back to the foreground, because the
   * exact-alarm row sends the user out to system settings and they return
   * to this same screen — which is the whole reason it is a row here and
   * not a page of its own.
   */
  const refresh = useCallback(async () => {
    try {
      const s = await notifee.getNotificationSettings();
      const ok =
        s.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
        s.authorizationStatus === AuthorizationStatus.PROVISIONAL;
      setOsGranted(ok);
      if (ok) setRefused(false);
      setAlarmOk(
        Platform.OS !== 'android' ||
          s.android.alarm === AndroidNotificationSetting.ENABLED,
      );
    } catch {
      // A permission read that throws must not strand the flow; the
      // screen simply stays on its "not asked" face.
    }
  }, []);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  // Never leave a preview playing behind the flow.
  useEffect(
    () => () => {
      void stopAdhanPreview();
    },
    [],
  );

  const ask = async () => {
    try {
      if (await requestNotificationPermission()) {
        updateSettings({ notificationsEnabled: true });
        setOsGranted(true);
        setRefused(false);
        await refresh();
      } else {
        setRefused(true);
      }
    } catch (e) {
      // Permission errors must not block the flow — the home banner
      // carries the same prompt with a "Tap to grant" affordance.
      console.warn('Onboarding notification request failed:', e);
      setRefused(true);
    }
  };

  const play = (id: NotificationSoundId) => {
    if (previewing === id) {
      setPreviewing(null);
      void stopAdhanPreview();
      return;
    }
    setPreviewing(id);
    previewAdhanSound(id).catch(() => setPreviewing(null));
  };

  // The same two strings Settings uses for the same question, rather than
  // a second pair to keep in step with them.
  const minutesLabel =
    settings.prePrayerReminderMinutes === 0
      ? t('settings.prePrayerReminderOff', 'Off')
      : t('settings.prePrayerReminderOption', {
          count: settings.prePrayerReminderMinutes,
        });

  return (
    <OnboardingFrame
      progress={progress}
      // Before the question is answered this screen is a title, two lines
      // and two buttons — the same sparse shape as the greeting, and it
      // needs the same centring. Once granted it fills with the adhan
      // list and the rows, and top alignment is right again.
      center={face !== 'granted'}
      footer={
        face === 'unasked' ? (
          <>
            <PrimaryAction
              testID="onboarding-alerts-grant"
              label={t('onboarding.alerts.cta', 'Yes, notify me')}
              onPress={() => {
                void ask();
              }}
            />
            <QuietAction
              testID="onboarding-alerts-skip"
              label={t('onboarding.notNow', 'Not now')}
              onPress={onAdvance}
            />
          </>
        ) : (
          <PrimaryAction
            testID="onboarding-alerts-continue"
            label={t('common.continue', 'Continue')}
            onPress={onAdvance}
          />
        )
      }>
      <OnboardingHeading
        title={t('onboarding.alerts.title', 'Notify you at prayer times?')}
        body={t(
          'onboarding.alerts.body',
          'A notification when each prayer comes in — with the adhan, or your phone’s own tone. This device only.',
        )}
      />

      {face === 'denied' ? (
        <Text
          style={[typeStyle('footnote'), styles.denied, { color: palette.muted }]}>
          {t(
            'onboarding.alerts.denied',
            'Your phone is set to block notifications from Mihrab. You can turn them on later in Settings → Notifications.',
          )}
        </Text>
      ) : null}

      {face === 'granted' ? (
        <>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('onboarding.alerts.adhan', 'Adhan')}
            style={[
              styles.card,
              { backgroundColor: palette.card, borderRadius: RADIUS.lg },
            ]}>
            {SHORTLIST.map((id, i) => {
              const option = NOTIFICATION_SOUND_OPTIONS.find(o => o.id === id);
              if (!option) return null;
              const selected = settings.notificationSound === id;
              return (
                <View
                  key={id}
                  style={[
                    styles.soundRow,
                    i > 0
                      ? {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: palette.border,
                        }
                      : null,
                  ]}>
                  <Pressable
                    testID={`onboarding-adhan-${id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={t(option.labelKey)}
                    onPress={() => updateSettings({ notificationSound: id })}
                    style={({ pressed }) => [
                      styles.soundMain,
                      pressed && { opacity: 0.6 },
                    ]}>
                    <Text
                      style={[
                        typeStyle('headline'),
                        {
                          color: selected ? palette.accentSolid : palette.muted,
                        },
                      ]}>
                      {selected ? '●' : '○'}
                    </Text>
                    <Text style={[typeStyle('body'), { color: palette.text }]}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                  {id === 'default' ? null : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        previewing === id
                          ? t('common.stop', 'Stop')
                          : t('common.play', 'Play')
                      }
                      hitSlop={10}
                      onPress={() => play(id)}
                      style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                      <Text
                        style={[
                          typeStyle('headline'),
                          { color: palette.accentSolid },
                        ]}>
                        {previewing === id ? '■' : '▶'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
          <Text
            style={[typeStyle('footnote'), styles.more, { color: palette.muted }]}>
            {t('onboarding.alerts.adhanMore', 'More adhans in Settings')}
          </Text>

          <SettingsGroup>
            <SettingsLinkRow
              testID="onboarding-pre-reminder"
              title={t('onboarding.alerts.preReminder', 'Remind me before')}
              value={minutesLabel}
              onPress={() => setPreModal(true)}
            />
            {!alarmOk ? (
              <SettingsLinkRow
                testID="onboarding-exact-alarms"
                title={t('onboarding.alerts.exact', 'Exact timing')}
                help={t(
                  'onboarding.alerts.exactWhy',
                  'Android needs one more permission so alerts fire on the minute, not minutes late.',
                )}
                accessory={
                  <Text
                    style={[typeStyle('body'), { color: palette.accentSolid }]}>
                    {t('onboarding.alerts.exactFix', 'Fix')}
                  </Text>
                }
                onPress={() => {
                  void notifee.openAlarmPermissionSettings().catch(() => {});
                }}
              />
            ) : null}
          </SettingsGroup>
        </>
      ) : null}

      <PreReminderModal
        visible={preModal}
        current={settings.prePrayerReminderMinutes}
        palette={palette}
        onSelect={(minutes: PrePrayerReminderMinutes) => {
          updateSettings({ prePrayerReminderMinutes: minutes });
          setPreModal(false);
        }}
        onClose={() => setPreModal(false)}
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  denied: { textAlign: 'center', marginBottom: SPACING.md },
  card: { overflow: 'hidden', marginTop: SPACING.sm },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  soundMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  more: {
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
});
