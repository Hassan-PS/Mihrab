// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
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
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.calculation')}
      </Text>
      {providerHidesCalculationMethod(effectiveProvider) ? (
        <View
          style={[
            s.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[s.help, { color: palette.muted }]}>
            {effectiveProvider === 'islamiska_forbundet'
              ? t('settings.calcHiddenSweden')
              : t('settings.calcHiddenPraytimes')}
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.method')}
          style={[
            s.card,
            s.rowPress,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={onOpenMethodPicker}>
          <View>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.method')}
            </Text>
            <Text style={[s.valueText, { color: palette.text }]}>
              {getMethodLabel(settings.calculationMethod)}
            </Text>
          </View>
          <Text style={[s.changeLink, { color: palette.accent }]}>
            {t('common.change')}
          </Text>
        </Pressable>
      )}

      {!providerHidesHanafiAsr(effectiveProvider) && (
        <View
          style={[
            s.card,
            s.switchRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={s.switchCopy}>
            <Text style={[s.valueText, { color: palette.text }]}>
              {t('settings.hanafiAsr')}
            </Text>
            <Text style={[s.help, { color: palette.muted }]}>
              {t('settings.hanafiAsrHelp')}
            </Text>
          </View>
          <Switch
            value={settings.school === 1}
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor={'#ffffff'}
            onValueChange={v => updateSettings({ school: v ? 1 : 0 })}
          />
        </View>
      )}

      {/* Mālikī second times (issue #19).
       *
       * Here rather than with the other optional times, for two reasons.
       * Those four each schedule a notification and this one deliberately
       * does not — it is a line under a prayer, not an event. And the
       * sentence that matters most about it ("the 1:1 shadow whatever your
       * madhab setting says") only means anything sitting directly under
       * the Ḥanafī asr switch it overrides. */}
      <View
        style={[
          s.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchRow}>
          <View style={s.switchCopy}>
            <Text style={[s.valueText, { color: palette.text }]}>
              {t('settings.malikiSecondTimes', 'Maliki second times')}
            </Text>
            {/* On Ḥanafī ʿAṣr the card contradicts itself and it is worth
                saying so BEFORE the switch is touched, not after. Ẓuhr's
                boundary is the 1:1 shadow whatever this setting says (it
                has to be — it is a Mālikī boundary), so it lands about
                half an hour before the 2:1 ʿAṣr on the row underneath it,
                and the two look like a bug rather than like two madhhabs
                in one table. The switch is not hidden: someone may want
                exactly this. They should just know they are asking for
                it. */}
            <Text
              style={[
                s.help,
                { color: hanafiAsr ? palette.danger : palette.muted },
              ]}>
              {hanafiAsr
                ? t('settings.malikiSecondTimesHanafiWarning')
                : t('settings.malikiSecondTimesHelp')}
            </Text>
          </View>
          <Switch
            value={settings.malikiSecondTimesEnabled}
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor={'#ffffff'}
            onValueChange={v => updateSettings({ malikiSecondTimesEnabled: v })}
          />
        </View>
        {/* Only once it is on. Off, they are two paragraphs explaining
            something the reader has not asked about; on, they are what
            the app is and is not claiming, which they are owed. */}
        {settings.malikiSecondTimesEnabled ? (
          <>
            <Text style={[s.help, { color: palette.muted, marginTop: 10 }]}>
              {t('settings.malikiSecondTimesModelled')}
            </Text>
            <Text style={[s.help, { color: palette.muted, marginTop: 6 }]}>
              {t('settings.malikiSecondTimesSource')}
            </Text>

            {/* Alerts, chosen one prayer at a time.
             *
             * Chips rather than five switch rows: five switches is a
             * settings screen inside a settings card, and it would read
             * as five decisions the app expects you to make. A row of
             * chips reads as one — "which of these, if any" — and its
             * honest default is that none of them are lit. */}
            <View
              style={[styles.alertsBlock, { borderTopColor: palette.border }]}>
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
                          backgroundColor: on
                            ? palette.accentBg
                            : 'transparent',
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

              {/* Only once something is going to fire. With nothing
                  chosen, "how much warning" is a question about nothing. */}
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
            </View>
          </>
        ) : null}
      </View>

      {/*
       * Per-prayer offsets — task #22. Always available regardless of
       * provider; the offsets are applied AFTER provider validation.
       * Shows the count of non-zero offsets as the row value so the user
       * knows at a glance whether anything is currently shifted.
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.prayerOffsets')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={onOpenOffsetsModal}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.prayerOffsets')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {countNonZero(settings.prayerOffsets) === 0
              ? t('settings.prayerOffsetsNone')
              : t('settings.prayerOffsetsCount', {
                  count: countNonZero(settings.prayerOffsets),
                })}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>
          {t('common.change')}
        </Text>
      </Pressable>
    </>
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
