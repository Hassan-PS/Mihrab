import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../../settings/effectiveProvider';
import {
  getProviderLabel,
  PRAYER_DATA_PROVIDERS,
} from '../../settings/providersCatalog';
import { SettingsGroup, SettingsLinkRow } from './SettingsGroup';

type DataSourceCardProps = {
  onOpenProviderPicker: () => void;
};

function DataSourceCardImpl({ onOpenProviderPicker }: DataSourceCardProps) {
  const { t } = useTranslation();
  const { settings } = usePrayerSettings();

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
    <SettingsGroup title={t('settings.dataSource')}>
      <SettingsLinkRow
        title={t('settings.provider')}
        value={
          settings.dataProviderAuto
            ? t('settings.providerAutoLine', {
                label: getProviderLabel(effectiveProvider),
              })
            : getProviderLabel(settings.dataProvider)
        }
        help={
          settings.dataProviderAuto
            ? t('settings.providerAutoHelp')
            : lockedProviderDesc
        }
        onPress={onOpenProviderPicker}
      />
    </SettingsGroup>
  );
}

export const DataSourceCard = memo(DataSourceCardImpl);
