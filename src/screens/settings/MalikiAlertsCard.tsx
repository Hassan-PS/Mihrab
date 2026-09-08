// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  DARURI_KEYS,
  DARURI_OF,
  type DaruriKey,
} from '../../prayer/daruriTimes';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';

/**
 * Settings → Notifications → the Mālikī second times, the part that fires.
 *
 * ── WHY IT IS HERE AND NOT WITH THE CALCULATION ───────────────────────
 *
 * It used to sit inside the Calculation card on Prayer times, under the
 * switch that turns the second times on. Reported in #23: "keep Prayer
 * Times strictly focused on calculation parameters and time displays;
 * move all notification triggers into Notifications." He is right, and it
 * is the taxonomy this app already claims everywhere else — a screen
 * about where the numbers come from should not be where you go to change
 * what interrupts you.
 *
 * The split is by what a control DOES, not by what it is about. Whether
 * the boundaries are computed at all, and whether they are printed on the
 * day's card, are questions about the times: they stayed. Which of them
 * are announced, how much warning, and whether the end of the window is
 * announced too: those fire, so they moved.
 *
 * Nothing stored changed name or meaning, so an upgrade moves the
 * controls and not the configuration.
 */
type MalikiAlertsCardProps = {
  /** Opens the lead-time picker for the Mālikī second-time alerts. */
  onOpenDaruriLeadPicker: () => void;
};

function MalikiAlertsCardImpl({
  onOpenDaruriLeadPicker,
}: MalikiAlertsCardProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const alerts = settings.malikiSecondTimeAlerts;

  /**
   * Adding and removing rather than rewriting: the stored order follows
   * `DARURI_KEYS`, so two blobs holding the same set are the same string
   * and a tap that turns something off and on again is not a change.
   */
  const toggleAlert = (key: DaruriKey) => {
    const next = alerts.includes(key)
      ? alerts.filter(k => k !== key)
      : DARURI_KEYS.filter(k => k === key || alerts.includes(k));
    updateSettings({ malikiSecondTimeAlerts: next });
  };

  return (
    <SettingsGroup title={t('settings.malikiSecondTimes', 'Maliki second times')}>
      {/* SAYS SO RATHER THAN VANISHING. With the reckoning off there is
          nothing here to announce, and a card that simply disappeared
          would leave a reader looking for a control they remember, on the
          screen it is supposed to be on. */}
      {settings.malikiSecondTimesEnabled ? (
        <SettingsBlock>
      {/* Alerts, chosen one prayer at a time.
       *
       * Chips rather than five switch rows: five switches is a
       * settings screen inside a settings card, and it would read as
       * five decisions the app expects you to make. A row of chips
       * reads as one — "which of these, if any" — and its honest
       * default is that none of them are lit. */}
      <View style={[styles.block, { borderTopColor: palette.border }]}>
        <Text style={[s.label, { color: palette.muted }]}>
          {t('settings.malikiAlerts', 'Notify me')}
        </Text>
        <View
          style={styles.chipRow}
          accessibilityRole="none"
          accessibilityLabel={t('settings.malikiAlerts', 'Notify me')}>
          {DARURI_KEYS.map(key => {
            const on = alerts.includes(key);
            const label = t(`prayer.${DARURI_OF[key]}`);
            return (
              <Pressable
                key={key}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: on }}
                onPress={() => toggleAlert(key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? palette.accentBg : 'transparent',
                    borderColor: on ? palette.accentSolid : palette.border,
                  },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.chipLabel,
                    { color: on ? palette.accentSolid : palette.muted },
                  ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[s.help, { color: palette.muted }]}>
          {t('settings.malikiAlertsHelp')}
        </Text>

        {/* Only once something is going to fire. With nothing chosen,
            "how much warning" is a question about nothing. */}
        {alerts.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'settings.malikiAlertsLead',
              'How much warning',
            )}
            style={[s.rowPress, styles.leadRow]}
            onPress={onOpenDaruriLeadPicker}>
            <View>
              <Text style={[s.label, { color: palette.muted }]}>
                {t('settings.malikiAlertsLead', 'How much warning')}
              </Text>
              <Text style={[s.valueText, { color: palette.text }]}>
                {settings.malikiSecondTimeAlertMinutes === 0
                  ? t('settings.malikiAlertsAtTime', 'When it ends')
                  : t('settings.prePrayerReminderOption', {
                      count: settings.malikiSecondTimeAlertMinutes,
                    })}
              </Text>
            </View>
            <Text style={[s.changeLink, { color: palette.accent }]}>
              {t('common.change')}
            </Text>
          </Pressable>
        ) : null}

        {/* The other end of the window — issue #19 again.
         *
         * The alert above says the preferred time is over and there
         * is still a valid window to pray in. This one says the
         * window has shut and what is left is qaḍāʾ. It fires AT the
         * instant whatever warning is set above: a notification
         * saying a prayer is missed while there are still ten minutes
         * to pray it would simply be false. */}
        {alerts.length > 0 ? (
          <SettingsToggleRow
            title={t('settings.malikiEndAlerts', 'And when the time ends')}
            help={t(
              'settings.malikiEndAlertsHelp',
              'A second notification at the moment the prayer becomes qaḍāʾ. Fired at the time itself, never early.',
            )}
            value={settings.malikiSecondTimeEndAlerts}
            onValueChange={v =>
              updateSettings({ malikiSecondTimeEndAlerts: v })
            }
          />
        ) : null}
      </View>
        </SettingsBlock>
      ) : (
        <SettingsBlock>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.malikiAlertsDisabled')}
          </Text>
        </SettingsBlock>
      )}
    </SettingsGroup>
  );
}

export const MalikiAlertsCard = memo(MalikiAlertsCardImpl);

const styles = StyleSheet.create({
  block: { gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  leadRow: { marginTop: 4 },
});
