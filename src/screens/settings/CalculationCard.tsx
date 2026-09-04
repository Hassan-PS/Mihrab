// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../../settings/effectiveProvider';
import {
  providerHidesCalculationMethod,
  providerHidesHanafiAsr,
} from '../../settings/providerUi';
import { getMethodLabel } from '../../settings/methods';
import type { PrayerOffsetMinutes } from '../../settings/prayerOffsets';
import {
  DARURI_KEYS,
  DARURI_OF,
  type DaruriKey,
} from '../../prayer/daruriTimes';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';

type CalculationCardProps = {
  onOpenMethodPicker: () => void;
  onOpenOffsetsModal: () => void;
  /** Opens the lead-time picker for the Mālikī second-time alerts. */
  onOpenDaruriLeadPicker: () => void;
};

function CalculationCardImpl({
  onOpenMethodPicker,
  onOpenOffsetsModal,
  onOpenDaruriLeadPicker,
}: CalculationCardProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  // `school` is 1 for Ḥanafī ʿAṣr (2:1 shadow), 0 for the 1:1 the rest of
  // the madhāhib use — including Mālikī, which is why it matters here.
  const hanafiAsr = settings.school === 1;
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
  const { palette } = useAppPalette();

  const coordsForEffective = useMemo(
    () => resolveCoordsFromSettings(settings),
    [settings],
  );
  const effectiveProvider = useMemo(
    () =>
      getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coordsForEffective,
      ),
    [settings.dataProviderAuto, settings.dataProvider, coordsForEffective],
  );

  return (
    <SettingsGroup title={t('settings.calculation')}>
      {providerHidesCalculationMethod(effectiveProvider) ? (
        <SettingsBlock>
          <Text style={[s.help, { color: palette.muted }]}>
            {effectiveProvider === 'islamiska_forbundet'
              ? t('settings.calcHiddenSweden')
              : t('settings.calcHiddenPraytimes')}
          </Text>
        </SettingsBlock>
      ) : (
        <SettingsLinkRow
          title={t('settings.method')}
          value={getMethodLabel(settings.calculationMethod)}
          onPress={onOpenMethodPicker}
        />
      )}

      {providerHidesHanafiAsr(effectiveProvider) ? null : (
        <SettingsToggleRow
          title={t('settings.hanafiAsr')}
          help={t('settings.hanafiAsrHelp')}
          value={settings.school === 1}
          onValueChange={v => updateSettings({ school: v ? 1 : 0 })}
        />
      )}

      {/* Mālikī second times (issue #19).
       *
       * Here rather than with the other optional times, for two reasons.
       * Those four each schedule a notification and this one deliberately
       * does not — it is a line under a prayer, not an event. And the
       * sentence that matters most about it ("the 1:1 shadow whatever your
       * madhab setting says") only means anything sitting directly under
       * the Ḥanafī asr switch it overrides.
       *
       * On Ḥanafī ʿAṣr the card contradicts itself and it is worth saying
       * so BEFORE the switch is touched, not after. Ẓuhr's boundary is the
       * 1:1 shadow whatever this setting says (it has to be — it is a
       * Mālikī boundary), so it lands about half an hour before the 2:1
       * ʿAṣr on the row underneath it, and the two look like a bug rather
       * than like two madhhabs in one table. The switch is not hidden:
       * someone may want exactly this. They should just know they are
       * asking for it. */}
      <SettingsToggleRow
        title={t('settings.malikiSecondTimes', 'Maliki second times')}
        help={
          hanafiAsr
            ? t('settings.malikiSecondTimesHanafiWarning')
            : t('settings.malikiSecondTimesHelp')
        }
        helpDanger={hanafiAsr}
        value={settings.malikiSecondTimesEnabled}
        onValueChange={v => updateSettings({ malikiSecondTimesEnabled: v })}
      />

      {/* Only once it is on. Off, these are paragraphs explaining
          something the reader has not asked about; on, they are what the
          app is and is not claiming, which they are owed. */}
      {settings.malikiSecondTimesEnabled ? (
        <SettingsBlock>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.malikiSecondTimesModelled')}
          </Text>
          <Text style={[s.help, { color: palette.muted, marginTop: 6 }]}>
            {t('settings.malikiSecondTimesSource')}
          </Text>

          {/* SHOWING them and ANNOUNCING them are now two decisions.
           *
           * They used to be one, and the reporter of #19 wanted the
           * second without the first — "Having an additional time in the
           * rows will just make the UI compact and bad looking" — which
           * the app could not give him: the alerts hung off the same
           * switch as the rows, so the only way to be told about a
           * boundary was to also put it on the card. On by default, so
           * this changes nothing for anyone who already had it. */}
          <SettingsToggleRow
            title={t('settings.malikiRows', 'Show them in the day’s times')}
            help={t(
              'settings.malikiRowsHelp',
              'Off, the boundaries are only announced — nothing is added to the card or the month.',
            )}
            value={settings.malikiSecondTimeRows}
            onValueChange={v => updateSettings({ malikiSecondTimeRows: v })}
          />

          {/* Alerts, chosen one prayer at a time.
           *
           * Chips rather than five switch rows: five switches is a
           * settings screen inside a settings card, and it would read as
           * five decisions the app expects you to make. A row of chips
           * reads as one — "which of these, if any" — and its honest
           * default is that none of them are lit. */}
          <View style={[styles.alertsBlock, { borderTopColor: palette.border }]}>
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
      ) : null}

      {/*
       * Per-prayer offsets — task #22. Always available regardless of
       * provider; the offsets are applied AFTER provider validation. The
       * row shows the count of non-zero offsets, so whether anything is
       * currently shifted is answered without opening it.
       */}
      <SettingsLinkRow
        title={t('settings.prayerOffsets')}
        value={
          countNonZero(settings.prayerOffsets) === 0
            ? t('settings.prayerOffsetsNone')
            : t('settings.prayerOffsetsCount', {
                count: countNonZero(settings.prayerOffsets),
              })
        }
        onPress={onOpenOffsetsModal}
      />
    </SettingsGroup>
  );
}

function countNonZero(offsets: PrayerOffsetMinutes | undefined): number {
  if (!offsets) return 0;
  return Object.values(offsets).filter(v => typeof v === 'number' && v !== 0)
    .length;
}

export const CalculationCard = memo(CalculationCardImpl);

const styles = StyleSheet.create({
  alertsBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  leadRow: {
    marginTop: 4,
  },
});
