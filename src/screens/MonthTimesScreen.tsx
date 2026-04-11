import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import {
  loadMonthPrayerTimes,
  type MonthDayEntry,
} from '../prayer/loadMonthPrayerTimes';
import { getMethodLabel } from '../settings/methods';
import { providerHidesCalculationMethod } from '../settings/providerUi';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { getProviderLabel } from '../settings/providersCatalog';
import { DISPLAY_ORDER } from '../types/prayer';
import { cardEdgeStyle } from '../theme/chrome';
import { formatLocalDate } from '../utils/date';
import { formatDisplayTime } from '../utils/prayerTimes';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';

export function MonthTimesScreen() {
  const { t, i18n } = useTranslation();
  const { settings, hydrated } = usePrayerSettings();
  const { palette } = useAppPalette();

  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [rows, setRows] = useState<MonthDayEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useAndroidSubScreenBack();

  const needsGpsPrime =
    settings.locationMode === 'gps' &&
    (settings.lastFetchedLatitude == null ||
      settings.lastFetchedLongitude == null);

  const lat =
    settings.locationMode === 'gps'
      ? (settings.lastFetchedLatitude ?? 0)
      : settings.manualLatitude;
  const lng =
    settings.locationMode === 'gps'
      ? (settings.lastFetchedLongitude ?? 0)
      : settings.manualLongitude;

  const coordsForProvider = useMemo(() => {
    if (needsGpsPrime) {
      return null;
    }
    return { latitude: lat, longitude: lng };
  }, [needsGpsPrime, lat, lng]);

  const effectiveProvider = useMemo(
    () =>
      getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coordsForProvider,
      ),
    [
      settings.dataProviderAuto,
      settings.dataProvider,
      coordsForProvider,
    ],
  );

  const monthTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    const loc =
      i18n.language === 'sv'
        ? 'sv-SE'
        : i18n.language === 'ar'
          ? 'ar'
          : 'en-US';
    return d.toLocaleString(loc, { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth, i18n.language]);

  const goPrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  }, [viewMonth]);

  const goNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  }, [viewMonth]);

  const goThisMonth = useCallback(() => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  }, []);

  useEffect(() => {
    if (!hydrated || needsGpsPrime) {
      setRows(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadMonthPrayerTimes(viewYear, viewMonth, {
      provider: effectiveProvider,
      latitude: lat,
      longitude: lng,
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    })
      .then(data => {
        if (!cancelled) {
          setRows(data);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : t('month.loadError'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  },     [
    hydrated,
    needsGpsPrime,
    viewYear,
    viewMonth,
    effectiveProvider,
    settings.calculationMethod,
    settings.school,
    lat,
    lng,
    t,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: MonthDayEntry }) => {
      const line = DISPLAY_ORDER.map(key => {
        const raw = item.timings[key];
        return raw ? formatDisplayTime(raw) : '—';
      }).join('  ');
      const dayLine = `${formatLocalDate(item.date)} · ${item.date.toLocaleDateString(
        undefined,
        { weekday: 'short' },
      )}`;
      return (
        <View
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.rowDay, { color: palette.text }]}>{dayLine}</Text>
          <Text style={[styles.rowTimes, { color: palette.muted }]}>{line}</Text>
        </View>
      );
    },
    [palette.border, palette.card, palette.flatChrome, palette.muted, palette.text],
  );

  if (!hydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (needsGpsPrime) {
    return (
      <View style={[styles.centered, styles.pad, { backgroundColor: palette.bg }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('month.locationNotReadyTitle')}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {t('month.locationNotReadyBody')}
        </Text>
      </View>
    );
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.monthNav}>
        <Pressable onPress={goPrevMonth} hitSlop={12} style={styles.navHit}>
          <Text style={[styles.navArrow, { color: palette.accent }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: palette.text }]}>
          {monthTitle}
        </Text>
        <Pressable onPress={goNextMonth} hitSlop={12} style={styles.navHit}>
          <Text style={[styles.navArrow, { color: palette.accent }]}>›</Text>
        </Pressable>
      </View>
      <Pressable onPress={goThisMonth} style={styles.thisMonthBtn}>
        <Text style={[styles.thisMonthLabel, { color: palette.accent }]}>
          {t('month.thisMonth')}
        </Text>
      </Pressable>
      <Text style={[styles.meta, { color: palette.muted }]}>
        {getProviderLabel(effectiveProvider)}
        {!providerHidesCalculationMethod(effectiveProvider)
          ? ` · ${getMethodLabel(settings.calculationMethod)}`
          : ''}
        {effectiveProvider !== 'islamiska_forbundet' && settings.school === 1
          ? ` · ${t('home.hanafiSuffix')}`
          : ''}
      </Text>
      <Text style={[styles.legend, { color: palette.muted }]}>
        {DISPLAY_ORDER.map(k => t(`prayer.${k}`)).join(' · ')}
      </Text>
      {loading && (
        <ActivityIndicator style={styles.headerSpinner} color={palette.accent} />
      )}
      {error && (
        <Text style={[styles.err, { color: palette.accent }]}>{error}</Text>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.listContent}
      data={rows ?? []}
      keyExtractor={item => formatLocalDate(item.date)}
      ListHeaderComponent={header}
      renderItem={renderItem}
      ListEmptyComponent={
        !loading && !error ? (
          <Text style={[styles.empty, { color: palette.muted }]}>
            {t('month.empty')}
          </Text>
        ) : null
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pad: {
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 32,
  },
  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navHit: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  thisMonthBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  thisMonthLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  legend: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  headerSpinner: {
    marginTop: 12,
  },
  err: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  row: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowDay: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  rowTimes: {
    fontSize: 13,
    lineHeight: 18,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
});
