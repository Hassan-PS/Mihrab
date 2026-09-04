/**
 * Settings → Notifications → Extra times.
 *
 * The moments that are not one of the five, each gating one entry across
 * the prayer table, the notifications, the home-screen widget and the
 * Live Activity at once. They sit behind their own row rather than under
 * the prayer alerts because they are not alerts: a switch here changes
 * what the app SHOWS, and only then what it announces — which is why
 * they stay usable with the master alerts toggle off.
 */
import { useTranslation } from 'react-i18next';
import { useNotificationsSettings } from '../../../context/PrayerSettingsContext';
import { ensureNotifPermission } from '../../../notifications/ensureNotifPermission';
import { SettingsGroup, SettingsToggleRow } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';

export function ExtraTimesSettingsScreen() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useNotificationsSettings();

  const onToggleEndOfDayLog = async (value: boolean) => {
    if (!value) {
      updateSettings({ endOfDayLogReminderEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ endOfDayLogReminderEnabled: true });
  };

  return (
    <SettingsPage>
      {/* No heading: the page is already called Additional times. */}
      <SettingsGroup
        footer={t(
          'settings.additionalTimesFooter',
          'These appear in the prayer table, the widget and the Live Activity as well as in notifications, and they use the default sound rather than the adhan.',
        )}>
        <SettingsToggleRow
          title={t('settings.sunriseTime')}
          help={t('settings.sunriseTimeHelp')}
          value={settings.sunriseEnabled}
          onValueChange={v => updateSettings({ sunriseEnabled: v })}
        />
        <SettingsToggleRow
          title={t('settings.islamicMidnight')}
          help={t('settings.islamicMidnightHelp')}
          value={settings.islamicMidnightEnabled}
          onValueChange={v => updateSettings({ islamicMidnightEnabled: v })}
        />
        {/* First third of the night (issue #14) — the other end of the
            same arithmetic as the last third, and the one a reader looks
            at while the evening is still in front of them: in the Mālikī
            reckoning Ishāʾ leaves its preferred window when it closes.
            It is listed before the last third for that reason. */}
        <SettingsToggleRow
          title={t('settings.firstThird')}
          help={t('settings.firstThirdHelp')}
          value={settings.firstThirdEnabled}
          onValueChange={v => updateSettings({ firstThirdEnabled: v })}
        />
        <SettingsToggleRow
          title={t('settings.lastThird')}
          help={t('settings.lastThirdHelp')}
          value={settings.lastThirdEnabled}
          onValueChange={v => updateSettings({ lastThirdEnabled: v })}
        />
      </SettingsGroup>

      {/* End-of-day log prompt (v2.8.5). Not a time of day the sky
          decides, so it keeps its own group — and the same switch lives
          on the Log screen, where the thing it affects is visible. */}
      <SettingsGroup title={t('settings.logSection', 'Log')}>
        <SettingsToggleRow
          title={t('settings.endOfDayLog')}
          help={t('settings.endOfDayLogHelp')}
          value={settings.endOfDayLogReminderEnabled}
          onValueChange={onToggleEndOfDayLog}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}
