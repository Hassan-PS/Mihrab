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

  /**
   * A PINNED SOURCE THAT IS NOT THE ONE IN USE.
   *
   * A national source has tables for its own country and nothing else, so
   * pinning Sweden and then being in Cairo makes `getEffectiveDataProvider`
   * redirect to the worldwide default rather than map Cairo to the nearest
   * Swedish city. That is the right call and it was completely silent: the
   * row said Sweden and the times were AlAdhan's. It says so now, and the
   * row's value is what is actually answering.
   */
  const overridden =
    !settings.dataProviderAuto && effectiveProvider !== settings.dataProvider;

  return (
    <SettingsGroup title={t('settings.dataSource')}>
      <SettingsLinkRow
        title={t('settings.provider')}
        value={
          settings.dataProviderAuto
            ? t('settings.providerAutoLine', {
                label: getProviderLabel(effectiveProvider),
              })
            : getProviderLabel(
                overridden ? effectiveProvider : settings.dataProvider,
              )
        }
        help={
          settings.dataProviderAuto
            ? t('settings.providerAutoHelp')
            : overridden
              ? t('settings.providerOverridden', {
                  defaultValue:
                    '{{picked}} has no times for where you are, so {{used}} is answering instead.',
                  picked: getProviderLabel(settings.dataProvider),
                  used: getProviderLabel(effectiveProvider),
                })
              : lockedProviderDesc
        }
        onPress={onOpenProviderPicker}
      />
    </SettingsGroup>
  );
}

export const DataSourceCard = memo(DataSourceCardImpl);
