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
import { madhabMatches, selectedMadhab } from '../../prayer/madhab';
import { substituteApplies } from '../../prayer/daruriTimes';
import type { PrayerOffsetMinutes } from '../../settings/prayerOffsets';
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
  /** Opens the school picker — issue #21. */
  onOpenMadhabPicker: () => void;
};

function CalculationCardImpl({
  onOpenMethodPicker,
  onOpenOffsetsModal,
  onOpenMadhabPicker,
}: CalculationCardProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  // `school` is 1 for Ḥanafī ʿAṣr (2:1 shadow), 0 for the 1:1 the rest of
  // the madhāhib use — including Mālikī, which is why it matters here.
  const hanafiAsr = settings.school === 1;
  /** Custom, unless the stored school still describes the stored shadow. */
  const madhab = selectedMadhab(settings.madhab, settings.school);
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

  /**
   * Is the 45° substitute worth offering here — issue #20.
   *
   * Poleward of 45°, where fn. 653 is addressed and where the app
   * actually leaves boundaries blank. Below it the switch would do
   * nothing at all, and a switch that does nothing is worse than an
   * absent one: it invites somebody to turn it on and then wonder what
   * broke. Anyone who already has it on keeps the switch wherever they
   * are, so a trip south does not silently take a setting away.
   */
  const substituteOffered =
    settings.malikiLat45Substitute ||
    substituteApplies(coordsForEffective?.latitude ?? NaN);

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

      {/* THE SCHOOL, and then the shadow it implies — issue #21.
       *
       * The shadow switch stays underneath rather than being replaced by
       * this row: it is how Custom is reachable, and Custom is what every
       * existing install upgrades into. Changing it by hand drops the
       * school back to Custom rather than leaving a school's name on a
       * combination it does not describe. */}
      {/* THE SCHOOL IS SHOWN EVEN WHERE THE SHADOW IS NOT.
       *
       * A published timetable decides ʿaṣr for you — Islamiska Förbundet
       * prints one figure per city — so the shadow switch is hidden under
       * those providers. The SCHOOL is not only about the shadow: under
       * Mālikī the farḍ at dawn is Ṣubḥ (#22) and the second times are
       * offered, and neither of those is the provider's business. Hiding
       * this row with the switch would have left a Mālikī user in Sweden
       * unable to say so. */}
      <SettingsLinkRow
        title={t('settings.madhab', 'School')}
        value={
          madhab
            ? t(`settings.madhab_${madhab}`)
            : t('settings.madhabCustom', 'Custom')
        }
        onPress={onOpenMadhabPicker}
      />
      {providerHidesHanafiAsr(effectiveProvider) ? null : (
        <>
          <SettingsToggleRow
            title={t('settings.hanafiAsr')}
            help={t('settings.hanafiAsrHelp')}
            value={settings.school === 1}
            onValueChange={v =>
              updateSettings({
                school: v ? 1 : 0,
                // Hand-editing the shadow is what Custom means.
                madhab: madhabMatches(settings.madhab, v ? 1 : 0)
                  ? settings.madhab
                  : null,
              })
            }
          />
        </>
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
      {/* UNDER MĀLIKĪ, or to whoever already turned it on.
       *
       * The red warning this replaces existed because a Ḥanafī ʿaṣr and a
       * Mālikī boundary could be chosen together and then had to be
       * explained. Offering the switch where the reckoning is chosen means
       * that combination is no longer reachable by accident — but it stays
       * visible for anyone already using it, because taking a feature away
       * during an upgrade is worse than an odd-looking card. They see the
       * same warning they always did. */}
      {madhab === 'maliki' || settings.malikiSecondTimesEnabled ? (
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
      ) : null}

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

          {/* THE 45° SUBSTITUTE — issue #20.
           *
           * Offered where the reader is poleward of 45°, which is where
           * fn. 653 is addressed, and to anyone who already turned it on
           * — the same rule the second-times switch itself follows, and
           * for the same reason: a feature must not vanish because
           * somebody travelled.
           *
           * The quote sits UNDER the switch rather than behind an info
           * tap. It is the whole justification for printing a time this
           * reader's own sky did not give, and a person deciding whether
           * to accept that should not have to go looking for it. */}
          {substituteOffered ? (
            <>
              <SettingsToggleRow
                title={t('settings.malikiLat45', '45° substitute')}
                help={t('settings.malikiLat45Help')}
                value={settings.malikiLat45Substitute}
                onValueChange={v =>
                  updateSettings({ malikiLat45Substitute: v })
                }
              />
              {settings.malikiLat45Substitute ? (
                <Text style={[s.help, { color: palette.muted, marginTop: 6 }]}>
                  {t('settings.malikiLat45Source')}
                </Text>
              ) : null}
            </>
          ) : null}

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
