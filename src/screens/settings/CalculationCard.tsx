// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
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
import { sharedSettingsStyles as s } from './sharedStyles';

type CalculationCardProps = {
  onOpenMethodPicker: () => void;
  onOpenOffsetsModal: () => void;
};

function CalculationCardImpl({
  onOpenMethodPicker,
  onOpenOffsetsModal,
}: CalculationCardProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
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
