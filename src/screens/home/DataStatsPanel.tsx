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
  type ServerDatasetId,
} from '../../prayer/dataStatus';
import {
  getIslamiskaForbundetDatasetTimes,
  pollServerIndexNow,
} from '../../providers/islamiskaForbundetDataset';
import { pollServerIndexNow as pollHabousIndexNow } from '../../providers/habousDataset';
import { getCacheStatus } from '../../prayer/prayerStorage';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../../settings/effectiveProvider';
import {
  nextHabousServerRunAfter,
  nextServerRunAfter,
} from '../../config/datasets';
import type { DataSource } from '../../providers/types';
import type { PrayerDataProviderId } from '../../settings/types';

/**
 * The two prepared datasets, in the order the panel lists them, each with the
 * provider that reads it and the server-run schedule to expect.
 */
const SERVERS: {
  id: ServerDatasetId;
  provider: PrayerDataProviderId;
  labelKey: string;
  labelDefault: string;
  nextRun: () => Date;
  /**
   * Why this dataset's window is the size it is, where the number alone is
   * misleading. Only Habous has one, and it is the difference between "the
   * build is broken" and "that is everything the ministry publishes".
   */
  coverageNoteKey?: string;
  coverageNoteDefault?: string;
}[] = [
  {
    id: 'ifis',
    provider: 'islamiska_forbundet',
    labelKey: 'dataStats.serverSweden',
    labelDefault: 'Sweden · Islamiska Förbundet',
    nextRun: nextServerRunAfter,
  },
  {
    id: 'habous',
    provider: 'habous',
    labelKey: 'dataStats.serverMorocco',
    labelDefault: 'Morocco · Habous',
    nextRun: nextHabousServerRunAfter,
    coverageNoteKey: 'dataStats.habousWindow',
    coverageNoteDefault:
      'The ministry publishes only the current Hijri month, so this window shrinks by a day each day and refills when the month turns. A rebuild cannot make it longer.',
  },
];

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
  // Which dataset this phone is actually being served by, so the panel can
  // mark it. Null when the effective provider is not a prepared dataset.
  const [active, setActive] = useState<ServerDatasetId | null>(null);

  const load = useCallback(() => {
    const coords = resolveCoordsFromSettings(settings);
    const provider = coords
      ? getEffectiveDataProvider(
          settings.dataProviderAuto,
          settings.dataProvider,
          coords,
        )
      : null;

    setActive(SERVERS.find(s => s.provider === provider)?.id ?? null);

    void (async () => {
      // Both servers, whichever one is serving this phone. The panel reports
      // on both, and a dataset that is never polled reads "not checked yet"
      // for ever — which is how the shared slot used to look after someone
      // travelled between the two regions.
      await Promise.all(
        [pollServerIndexNow(), pollHabousIndexNow()].map(p =>
          p.catch(() => {
            /* offline — keep whatever was recorded before */
          }),
        ),
      );
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

  // The pill reports the dataset in use, not "the last one that answered".
  const statusMeta = (): { color: string; label: string } => {
    switch (active ? status?.servers[active]?.status : undefined) {
      case 'ok':
        return { color: OK_GREEN, label: t('dataStats.serverOk') };
      case 'warning':
        return { color: WARN_AMBER, label: t('dataStats.serverWarning') };
      default:
        return { color: String(palette.muted), label: t('dataStats.serverUnknown') };
    }
  };

  const sm = statusMeta();
  const coverageOf = (id: ServerDatasetId): string => {
    const days = status?.servers[id]?.minCoverageDays;
    return days != null ? `${days} ${t('dataStats.daysUnit')}` : dash;
  };

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

      <Row palette={palette} label={t('dataStats.daysStored')} value={cache ? `${cache.total} ${t('dataStats.daysUnit')}` : dash} last />

      {/* One block per prepared dataset. Two servers, two build jobs, two
          windows — Sweden runs most of a year ahead, Morocco a couple of
          weeks — and they used to share a single set of rows, so a phone in
          Stockholm could be shown Morocco's coverage under a heading that
          named neither. */}
      {SERVERS.map(server => (
        <View key={server.id}>
          <View style={[styles.groupGap, { borderTopColor: palette.border }]} />
          <View style={styles.serverHead}>
            <Text style={[styles.serverName, { color: palette.muted }]}>
              {t(server.labelKey, { defaultValue: server.labelDefault })}
            </Text>
            {active === server.id && (
              <View
                style={[styles.activeTag, { backgroundColor: palette.accentBg }]}>
                <Text style={[styles.activeTagText, { color: palette.accent }]}>
                  {t('dataStats.inUse', { defaultValue: 'in use' })}
                </Text>
              </View>
            )}
          </View>
          <Row
            palette={palette}
            label={t('dataStats.serverCoverage')}
            value={coverageOf(server.id)}
          />
          {server.coverageNoteKey ? (
            <Text style={[styles.note, { color: palette.muted }]}>
              {t(server.coverageNoteKey, {
                defaultValue: server.coverageNoteDefault,
              })}
            </Text>
          ) : null}
          <Row
            palette={palette}
            label={t('dataStats.serverRun')}
            value={fmt(status?.servers[server.id]?.builtAt)}
          />
          <Row
            palette={palette}
            label={t('dataStats.nextServerRun')}
            value={fmt(server.nextRun().toISOString())}
          />
          <Row
            palette={palette}
            label={t('dataStats.nextCheck')}
            value={fmt(status?.servers[server.id]?.nextCheckDue)}
            last
          />
        </View>
      ))}
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
  serverHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  serverName: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  activeTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  activeTagText: { fontSize: 10, fontWeight: '700' },
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
  // Sits under the coverage row it explains, not in the row's own grid.
  note: { fontSize: 11, lineHeight: 15, paddingBottom: 10 },
  rowLabel: { fontSize: 13, flexShrink: 0 },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
});
