import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { getCacheStatus } from '../../prayer/prayerStorage';
import { refreshStoredPrayerData } from '../../prayer/refreshStoredData';

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

  /**
   * ── REFRESHING WHAT IS STORED, FROM SETTINGS (issue #56 follow-on) ──
   *
   * The same action as the month table's button and the pull on Home:
   * re-download the published table, drop this month's rows and fetch
   * them again. It belongs beside the source because that is the
   * question it answers — "where do my times come from, and can I make
   * the app go and get them again".
   *
   * The row says how much is stored, so the thing it acts on is on
   * screen rather than implied, and counts while it runs: this is tens
   * of seconds of work on a slow connection, and a row that looks
   * inert for that long reads as a row that did nothing.
   */
  const cacheParams = useMemo(
    () => ({
      provider: effectiveProvider,
      latitude: coordsForEffective?.latitude ?? 0,
      longitude: coordsForEffective?.longitude ?? 0,
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    }),
    [
      effectiveProvider,
      coordsForEffective,
      settings.calculationMethod,
      settings.school,
    ],
  );
  const located =
    Number.isFinite(cacheParams.latitude) &&
    Number.isFinite(cacheParams.longitude) &&
    !(cacheParams.latitude === 0 && cacheParams.longitude === 0);
  const [stored, setStored] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  const readStatus = useCallback(() => {
    if (!located) return;
    void getCacheStatus(cacheParams)
      .then(status => setStored(status.monthsStored))
      .catch(() => setStored(null));
  }, [cacheParams, located]);

  useEffect(readStatus, [readStatus]);

  const onRefresh = useCallback(() => {
    if (!located || progress) return;
    setProgress({ current: 0, total: 1 });
    void refreshStoredPrayerData(cacheParams, {
      onProgress: (current, total) => setProgress({ current, total }),
    })
      .catch(() => undefined)
      .then(() => {
        setProgress(null);
        readStatus();
      });
  }, [cacheParams, located, progress, readStatus]);

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
      {located ? (
        <SettingsLinkRow
          testID="settings-refresh-stored"
          // The month table's own words for the same action, because it
          // IS the same action — one string, one meaning, two places.
          title={t('month.refreshData', 'Refresh stored data')}
          value={
            progress
              ? `${t('month.refreshing', 'Refreshing…')} ${Math.round(
                  (progress.current / Math.max(1, progress.total)) * 100,
                )}%`
              : stored != null
                ? t('month.monthsStored', { count: stored })
                : undefined
          }
          help={t('settings.refreshStoredHelp', {
            defaultValue:
              'Fetches this month again rather than filling the gaps, so times that are wrong — after a change of clocks, say — are replaced rather than kept.',
          })}
          onPress={onRefresh}
        />
      ) : null}
    </SettingsGroup>
  );
}

export const DataSourceCard = memo(DataSourceCardImpl);
