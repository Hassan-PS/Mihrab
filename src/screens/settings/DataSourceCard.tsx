// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../../settings/effectiveProvider';
import {
  getProviderLabel,
  PRAYER_DATA_PROVIDERS,
} from '../../settings/providersCatalog';
import { sharedSettingsStyles as s } from './sharedStyles';

type DataSourceCardProps = {
  onOpenProviderPicker: () => void;
};

function DataSourceCardImpl({ onOpenProviderPicker }: DataSourceCardProps) {
  const { t } = useTranslation();
  const { settings } = usePrayerSettings();
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
    [
      settings.dataProviderAuto,
      settings.dataProvider,
      coordsForEffective,
    ],
  );
  const lockedProviderDesc = useMemo(() => {
    const opt = PRAYER_DATA_PROVIDERS.find(o => o.id === settings.dataProvider);
    return t(`providers.${settings.dataProvider}.desc`, {
      defaultValue: opt?.description ?? '',
    });
  }, [settings.dataProvider, t]);

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.dataSource')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.provider')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={onOpenProviderPicker}>
        <View style={s.copyBlock}>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.provider')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {settings.dataProviderAuto
              ? t('settings.providerAutoLine', {
                  label: getProviderLabel(effectiveProvider),
                })
              : getProviderLabel(settings.dataProvider)}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {settings.dataProviderAuto
              ? t('settings.providerAutoHelp')
              : lockedProviderDesc}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>
          {t('common.change')}
        </Text>
      </Pressable>
    </>
  );
}

export const DataSourceCard = memo(DataSourceCardImpl);
