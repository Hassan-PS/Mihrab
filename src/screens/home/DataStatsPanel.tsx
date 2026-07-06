import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { AppPalette } from '../../theme/appPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { HOME_CARD_RADIUS } from './tokens';
import {
  getDataStatus,
  recordDataSource,
  type DataStatus,
} from '../../prayer/dataStatus';
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

// Semantic status colours — universal (not the user accent), used sparingly.
const OK_GREEN = '#3fae6b';
const WARN_AMBER = '#d99a2b';

/**
 * Home-screen data-diagnostics card (shown at the bottom when the hidden
 * `showDataStats` flag is on — unlocked via 5 taps on the version in Settings).
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

  const statusMeta = (): { color: string; label: string } => {
    switch (status?.serverStatus) {
      case 'ok':
        return { color: OK_GREEN, label: t('dataStats.serverOk') };
      case 'warning':
        return { color: WARN_AMBER, label: t('dataStats.serverWarning') };
      default:
        return { color: String(palette.muted), label: t('dataStats.serverUnknown') };
    }
  };

  const sm = statusMeta();
  const coverage =
    status?.serverMinCoverageDays != null
      ? `${status.serverMinCoverageDays} ${t('dataStats.daysUnit')}`
      : dash;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderRadius: HOME_CARD_RADIUS,
          ...cardEdgeStyle(palette),
        },
      ]}>
      {/* header: title + server status pill */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.muted }]}>
          {t('dataStats.title')}
        </Text>
        <View style={styles.statusPill}>
          <View style={[styles.dot, { backgroundColor: sm.color }]} />
          <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      {/* source — the headline fact, in an accent pill */}
      <View style={styles.sourceRow}>
        <Text style={[styles.sourceLabel, { color: palette.muted }]}>
          {t('dataStats.source')}
        </Text>
        <View style={[styles.sourcePill, { backgroundColor: palette.accentBg }]}>
          <Text
            style={[styles.sourceValue, { color: palette.accent }]}
            numberOfLines={1}>
            {sourceLabel(status?.lastSource)}
          </Text>
        </View>
      </View>

      <View style={[styles.groupGap, { borderTopColor: palette.border }]} />

      <Row palette={palette} label={t('dataStats.daysStored')} value={cache ? `${cache.total} ${t('dataStats.daysUnit')}` : dash} />
      <Row palette={palette} label={t('dataStats.lastUpdated')} value={fmt(cache?.lastFetchedAt ?? status?.lastSourceAt)} />
      <Row palette={palette} label={t('dataStats.nextCheck')} value={fmt(status?.nextServerCheckDue)} />
      <Row palette={palette} label={t('dataStats.serverCoverage')} value={coverage} />
      <Row palette={palette} label={t('dataStats.serverRun')} value={fmt(status?.serverBuiltAt)} />
      <Row palette={palette} label={t('dataStats.nextServerRun')} value={fmt(nextServerRunAfter().toISOString())} last />
    </View>
  );
}

function Row({
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
      <Text style={[styles.rowLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: palette.text }]} numberOfLines={2}>
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
    paddingTop: 14,
    paddingBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  sourceLabel: { fontSize: 14, fontWeight: '600' },
  sourcePill: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    flexShrink: 1,
  },
  sourceValue: { fontSize: 13, fontWeight: '700' },
  groupGap: {
    marginTop: 10,
    marginBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: { fontSize: 13, flexShrink: 0 },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
});
