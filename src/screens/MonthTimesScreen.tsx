import { useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import type { RootStackParamList } from '../navigation/types';
import {
  loadMonthPrayerTimes,
  type MonthDayEntry,
} from '../prayer/loadMonthPrayerTimes';
import { getMethodLabel } from '../settings/methods';
import { providerHidesCalculationMethod } from '../settings/providerUi';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { getProviderLabel } from '../settings/providersCatalog';
import { DISPLAY_ORDER } from '../types/prayer';
import { formatLocalDate } from '../utils/date';
import { formatDisplayTime } from '../utils/prayerTimes';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { getCacheStatus, refreshPrayerDataCache } from '../prayer/prayerStorage';
import { ShareMonthScreen } from './ShareMonthScreen';

// Column flex weights — day label + 6 prayer columns
const COL_DAY = 1.4;
const COL_TIME = 1.0;

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function MonthTimesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const { settings, hydrated } = usePrayerSettings();
  const { palette } = useAppPalette();
  const headerHeight = useHeaderHeight();

  const today = useMemo(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  }, []);

  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [rows, setRows] = useState<MonthDayEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<{ monthsStored: number; isExpired: boolean } | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [isShareView, setIsShareView] = useState(false);

  useAndroidSubScreenBack();

  const needsGpsPrime =
    settings.locationMode === 'automatic' &&
    (settings.lastFetchedLatitude == null || settings.lastFetchedLongitude == null);

  const lat = settings.locationMode === 'automatic'
    ? (settings.lastFetchedLatitude ?? settings.manualLatitude) : settings.manualLatitude;
  const lng = settings.locationMode === 'automatic'
    ? (settings.lastFetchedLongitude ?? settings.manualLongitude) : settings.manualLongitude;

  const coordsForProvider = useMemo(() => {
    if (needsGpsPrime) return null;
    return { latitude: lat, longitude: lng };
  }, [needsGpsPrime, lat, lng]);

  const effectiveProvider = useMemo(
    () => getEffectiveDataProvider(settings.dataProviderAuto, settings.dataProvider, coordsForProvider),
    [settings.dataProviderAuto, settings.dataProvider, coordsForProvider],
  );

  const monthTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    return d.toLocaleString(i18n.language, { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth, i18n.language]);

  const isCurrentMonth = viewYear === today.year && viewMonth === today.month;

  const goPrevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else { setViewMonth(m => m - 1); }
  }, [viewMonth]);

  const goNextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else { setViewMonth(m => m + 1); }
  }, [viewMonth]);

  const goThisMonth = useCallback(() => {
    setViewYear(today.year);
    setViewMonth(today.month);
  }, [today]);

  const updateCacheStatus = useCallback(() => {
    if (!hydrated || needsGpsPrime) return;
    getCacheStatus({
      provider: effectiveProvider, latitude: lat, longitude: lng,
      calculationMethod: settings.calculationMethod, school: settings.school,
    }).then(setCacheStatus).catch(e => console.warn('getCacheStatus:', e));
  }, [hydrated, needsGpsPrime, effectiveProvider, lat, lng, settings.calculationMethod, settings.school]);

  useEffect(() => { updateCacheStatus(); }, [updateCacheStatus]);

  const handleRefreshCache = useCallback(async () => {
    if (!hydrated || needsGpsPrime) return;
    setRefreshingCache(true);
    setRefreshProgress({ current: 0, total: 1 });
    try {
      await refreshPrayerDataCache(
        { provider: effectiveProvider, latitude: lat, longitude: lng,
          calculationMethod: settings.calculationMethod, school: settings.school },
        12,
        (current, total) => setRefreshProgress({ current, total }),
      );
      updateCacheStatus();
      setRows(null);
      setLoading(true);
      const data = await loadMonthPrayerTimes(viewYear, viewMonth, {
        provider: effectiveProvider, latitude: lat, longitude: lng,
        calculationMethod: settings.calculationMethod, school: settings.school,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('month.loadError'));
    } finally {
      setRefreshingCache(false);
      setRefreshProgress(null);
      setLoading(false);
    }
  }, [hydrated, needsGpsPrime, effectiveProvider, lat, lng, settings.calculationMethod, settings.school, viewYear, viewMonth, updateCacheStatus, t]);

  useEffect(() => {
    if (!hydrated || needsGpsPrime) {
      setRows(null); setLoading(false); setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true); setError(null);
    loadMonthPrayerTimes(viewYear, viewMonth, {
      provider: effectiveProvider, latitude: lat, longitude: lng,
      calculationMethod: settings.calculationMethod, school: settings.school,
    }).then(data => { if (!cancelled) setRows(data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : t('month.loadError')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hydrated, needsGpsPrime, viewYear, viewMonth, effectiveProvider,
      settings.calculationMethod, settings.school, lat, lng, t]);

  // Abbreviated column headers from localized prayer names
  const colHeaders = useMemo(() =>
    DISPLAY_ORDER.map(key => t(`prayer.${key}`).slice(0, 3)),
    [t],
  );

  const renderItem = useCallback(({ item }: { item: MonthDayEntry }) => {
    const d = item.date;
    const isToday = isCurrentMonth && d.getDate() === today.day;
    const isFriday = d.getDay() === 5;
    const dayLabel = `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;

    return (
      <View style={[
        styles.row,
        { borderBottomColor: palette.border },
        isToday && { backgroundColor: palette.accentBg },
        isFriday && !isToday && { backgroundColor: palette.card },
      ]}>
        {/* Active-day accent bar */}
        {isToday && <View style={[styles.todayBar, { backgroundColor: palette.accent }]} />}

        <Text style={[
          styles.cellDay,
          { color: isToday ? palette.accent : isFriday ? palette.text : palette.muted,
            fontWeight: isFriday || isToday ? '700' : '400' },
        ]}>
          {dayLabel}
        </Text>

        {DISPLAY_ORDER.map((key, idx) => {
          const raw = item.timings[key];
          const timeStr = raw ? formatDisplayTime(raw) : '—';
          const isSunrise = key === 'Sunrise';
          return (
            <Text
              key={key}
              style={[
                styles.cellTime,
                { color: isToday
                    ? palette.accent
                    : isSunrise
                    ? palette.muted
                    : palette.text,
                  fontStyle: isSunrise ? 'italic' : 'normal',
                  fontWeight: isToday ? '600' : '400',
                },
              ]}>
              {timeStr}
            </Text>
          );
        })}
      </View>
    );
  }, [palette, isCurrentMonth, today.day]);

  if (!hydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg, paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (needsGpsPrime) {
    return (
      <View style={[styles.centered, styles.pad, { backgroundColor: palette.bg, paddingTop: headerHeight }]}>
        <Text style={[styles.title, { color: palette.text }]}>{t('month.locationNotReadyTitle')}</Text>
        <Text style={[styles.body, { color: palette.muted }]}>{t('month.locationNotReadyBody')}</Text>
      </View>
    );
  }

  const controlsHeader = (
    <View style={[styles.controls, { backgroundColor: palette.bg, borderBottomColor: palette.border }]}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <Pressable onPress={goPrevMonth} hitSlop={16} style={styles.navHit}>
          <Text style={[styles.navArrow, { color: palette.accent }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: palette.text }]}>{monthTitle}</Text>
        <Pressable onPress={goNextMonth} hitSlop={16} style={styles.navHit}>
          <Text style={[styles.navArrow, { color: palette.accent }]}>›</Text>
        </Pressable>
      </View>

      {/* Actions row */}
      <View style={styles.actionsRow}>
        {!isCurrentMonth && (
          <Pressable onPress={goThisMonth} style={[styles.pill, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.pillLabel, { color: palette.accent }]}>{t('month.thisMonth')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleRefreshCache}
          disabled={refreshingCache}
          style={[styles.pill, { backgroundColor: palette.card, borderColor: palette.border, opacity: refreshingCache ? 0.5 : 1 }]}>
          <Text style={[styles.pillLabel, { color: palette.muted }]}>
            {refreshingCache
              ? (refreshProgress ? `${Math.round((refreshProgress.current / refreshProgress.total) * 100)}%` : '…')
              : t('month.refreshData')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setIsShareView(v => !v)}
          style={[styles.pill, { backgroundColor: isShareView ? palette.accentBg : palette.card, borderColor: isShareView ? palette.accent : palette.border }]}>
          <Text style={[styles.pillLabel, { color: isShareView ? palette.accent : palette.muted }]}>
            {t('month.shareView', 'Share')}
          </Text>
        </Pressable>
      </View>

      {/* Meta info */}
      <Text style={[styles.meta, { color: palette.muted }]}>
        {getProviderLabel(effectiveProvider)}
        {!providerHidesCalculationMethod(effectiveProvider) ? ` · ${getMethodLabel(settings.calculationMethod)}` : ''}
        {effectiveProvider !== 'islamiska_forbundet' && settings.school === 1 ? ` · ${t('home.hanafiSuffix')}` : ''}
        {cacheStatus && !refreshingCache ? ` · ${cacheStatus.monthsStored}mo cached` : ''}
      </Text>

      {loading && <ActivityIndicator style={{ marginTop: 8 }} color={palette.accent} />}
      {error && <Text style={[styles.err, { color: palette.danger }]}>{error}</Text>}
    </View>
  );

  // Sticky column header row
  const columnHeader = (
    <View style={[styles.colHeader, { backgroundColor: palette.card, borderBottomColor: palette.accent }]}>
      <Text style={[styles.colHeaderDay, { color: palette.muted }]}>{t('month.dayOfWeek', 'Day')}</Text>
      {DISPLAY_ORDER.map((key, idx) => {
        const isSunrise = key === 'Sunrise';
        return (
          <Text
            key={key}
            style={[styles.colHeaderTime, { color: isSunrise ? palette.muted : palette.accent }]}>
            {colHeaders[idx]}
          </Text>
        );
      })}
    </View>
  );

  if (isShareView) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: headerHeight }}>
        {controlsHeader}
        <ShareMonthScreen
          route={{ key: 'ShareMonth', name: 'ShareMonth', params: { year: viewYear, month: viewMonth } }}
          navigation={navigation as any}
          embedded={true}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: headerHeight }}>
      {controlsHeader}
      {columnHeader}
      <FlatList
        style={{ flex: 1 }}
        data={rows ?? []}
        contentInsetAdjustmentBehavior="never"
        keyExtractor={item => formatLocalDate(item.date)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[styles.empty, { color: palette.muted }]}>{t('month.empty')}</Text>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        initialScrollIndex={isCurrentMonth && rows ? Math.max(0, today.day - 3) : 0}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

const ROW_HEIGHT = 40;

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pad: { padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  err: { marginTop: 6, fontSize: 13, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },

  controls: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navHit: { minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 30, fontWeight: '300', lineHeight: 36 },
  monthTitle: { fontSize: 20, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillLabel: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 8, lineHeight: 16 },

  colHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1.5,
  },
  colHeaderDay: {
    flex: COL_DAY,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colHeaderTime: {
    flex: COL_TIME,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  todayBar: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cellDay: {
    flex: COL_DAY,
    fontSize: 13,
    paddingStart: 4,
  },
  cellTime: {
    flex: COL_TIME,
    fontSize: 12,
    textAlign: 'center',
  },
});
