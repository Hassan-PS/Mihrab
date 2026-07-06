import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { AppPalette } from '../../theme/appPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { HOME_CARD_RADIUS } from './tokens';
import { getDataStatus, recordDataSource, type DataStatus } from '../../prayer/dataStatus';
import {
  getIslamiskaForbundetDatasetTimes,
  pollServerIndexNow,
} from '../../providers/islamiskaForbundetDataset';
import { getCacheStatus } from '../../prayer/prayerStorage';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../../settings/effectiveProvider';
import { nextServerRunAfter } from '../../config/datasets';
import type { DataSource } from '../../providers/types';

type DeviceCache = { total: number; lastFetchedAt: string | null };

/**
 * Home-screen data-diagnostics card (shown at the very bottom when the hidden
 * `showDataStats` flag is on — unlocked via 5 taps on the version in Settings).
 * Displays where today's times came from, coverage, refresh timing and the last
 * server-run status.
 */
function DataStatsPanelImpl() {
  const { t, i18n } = useTranslation();
  const { settings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [cache, setCache] = useState<DeviceCache | null>(null);

  const load = useCallback(() => {
    const coords = resolveCoordsFromSettings(settings);
    const provider = coords
      ? getEffectiveDataProvider(
          settings.dataProviderAuto,
          settings.dataProvider,
          coords,
        )
      : null;

    // Refresh the server-index snapshot (throttled) and, for Sweden, resolve
    // whether today's times come from the CDN mirror or the bundled seed — so
    // the last-server-run / next-check / source fields populate even when the
    // times themselves are being served from a warm cache.
    void (async () => {
      try {
        await pollServerIndexNow();
      } catch {
        /* offline — keep whatever was recorded before */
      }
      if (coords && provider === 'islamiska_forbundet') {
        try {
          const r = await getIslamiskaForbundetDatasetTimes({
            latitude: coords.latitude,
            longitude: coords.longitude,
            date: new Date(),
          });
          if (r.source) await recordDataSource(r.source);
        } catch {
          /* dataset miss — leave the last recorded source */
        }
      }
      setStatus(await getDataStatus());
    })();

    if (!coords || !provider) {
      setCache(null);
      return;
    }
    getCacheStatus({
      provider,
      latitude: coords.latitude,
      longitude: coords.longitude,
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    })
      .then(cs =>
        setCache({ total: cs.totalDaysCached, lastFetchedAt: cs.lastFetchedAt }),
      )
      .catch(() => setCache(null));
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const dash = t('dataStats.never', '—');
  const fmt = (iso: string | null | undefined): string => {
    if (!iso) return dash;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return dash;
    try {
      return d.toLocaleString(i18n.language || undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return d.toLocaleString();
    }
  };

  const sourceLabel = (src: DataSource | null | undefined): string => {
    switch (src) {
      case 'cdn':
        return t('dataStats.sourceCdn');
      case 'seed':
        return t('dataStats.sourceSeed');
      case 'scrape':
        return t('dataStats.sourceScrape');
      case 'aladhan':
        return t('dataStats.sourceAladhan');
      case 'local':
        return t('dataStats.sourceLocal');
      default:
        return t('dataStats.sourceUnknown');
    }
  };

  const serverLabel = (): string => {
    const st = status?.serverStatus ?? 'unknown';
    const text =
      st === 'ok'
        ? t('dataStats.serverOk')
        : st === 'warning'
          ? t('dataStats.serverWarning')
          : t('dataStats.serverUnknown');
    if (!status?.serverBuiltAt) return text;
    const cov =
      status.serverMinCoverageDays != null
        ? ` · ${status.serverMinCoverageDays} ${t('dataStats.daysUnit')}`
        : '';
    return `${text}${cov} · ${fmt(status.serverBuiltAt)}`;
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, borderRadius: HOME_CARD_RADIUS, ...cardEdgeStyle(palette) },
      ]}>
      <Text style={[styles.title, { color: palette.muted }]}>
        {t('dataStats.title')}
      </Text>
      <StatRow palette={palette} label={t('dataStats.source')} value={sourceLabel(status?.lastSource)} />
      <StatRow
        palette={palette}
        label={t('dataStats.daysStored')}
        value={cache ? `${cache.total} ${t('dataStats.daysUnit')}` : dash}
      />
      <StatRow
        palette={palette}
        label={t('dataStats.lastUpdated')}
        value={fmt(cache?.lastFetchedAt ?? status?.lastSourceAt)}
      />
      <StatRow
        palette={palette}
        label={t('dataStats.nextCheck')}
        value={fmt(status?.nextServerCheckDue)}
      />
      <StatRow palette={palette} label={t('dataStats.serverRun')} value={serverLabel()} />
      <StatRow
        palette={palette}
        label={t('dataStats.nextServerRun')}
        value={fmt(nextServerRunAfter().toISOString())}
        last
      />
    </View>
  );
}

function StatRow({
  palette,
  label,
  value,
  last,
}: {
  palette: AppPalette;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: palette.border,
        },
      ]}>
      <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: palette.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export const DataStatsPanel = memo(DataStatsPanelImpl);

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  label: { fontSize: 13, flexShrink: 0 },
  value: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
