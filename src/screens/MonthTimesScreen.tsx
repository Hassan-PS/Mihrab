import { useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton } from '../components/ui/Skeleton';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { SPACING } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import {
  loadMonthPrayerTimes,
  type MonthDayEntry,
} from '../prayer/loadMonthPrayerTimes';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { DISPLAY_ORDER } from '../types/prayer';
import { injectNightTimes } from '../utils/nightTimes';
import { formatLocalDate } from '../utils/date';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { getCacheStatus, refreshPrayerDataCache } from '../prayer/prayerStorage';
import { ShareMonthScreen } from './ShareMonthScreen';
import { MonthControls } from './month/MonthControls';
import {
  MONTH_ROW_HEIGHT,
  MonthColumnHeader,
  MonthRow,
} from './month/MonthTable';

export function MonthTimesScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  const monthWide = useBreakpoint() !== 'compact';
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const { settings, hydrated } = usePrayerSettings();
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
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

  /**
   * The night marks, derived here rather than taken from the provider.
   *
   * AlAdhan ships its own `Midnight`, `Firstthird` and `Lastthird`, and it
   * cuts the night from sunSET to sunRISE. Mihrab cuts it from Maghrib to
   * Fajr — the classical basis, and the one every other screen uses
   * (`nightTimes.ts`). Left alone, this table quietly answered a different
   * question from the day card beside it: 00:20 here against 23:41 there
   * for the same Islamic Midnight, and forty minutes is not a rounding.
   *
   * The month is a consecutive run of days, which is exactly what
   * `injectNightTimes` wants, so one pass over the rows makes the two
   * agree. Whatever the provider sent is overwritten.
   */
  const nightRows = useMemo(() => {
    if (!rows) return rows;
    const times = injectNightTimes(rows.map(r => r.timings));
    return rows.map((r, i) => ({ ...r, timings: times[i] }));
  }, [rows]);

  // Abbreviated column headers from localized prayer names
  const colHeaders = useMemo(
    () => DISPLAY_ORDER.map(key => t(`prayer.${key}`).slice(0, 3)),
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: MonthDayEntry }) => (
      <MonthRow
        item={item}
        palette={palette}
        isCurrentMonth={isCurrentMonth}
        todayDay={today.day}
      />
    ),
    [palette, isCurrentMonth, today.day],
  );

  if (!hydrated) {
    // Layout-stable skeleton — keeps the eye anchored to the table shape
    // instead of a centered spinner that disappears with a jump.
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={t('common.loading')}
        style={[styles.skeletonScreen, { backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 }]}>
        <Skeleton width="60%" height={28} radius="sm" />
        <Skeleton width="40%" height={16} radius="sm" />
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={styles.skelRow}>
            <Skeleton width={24} height={20} radius="sm" />
            <Skeleton width={64} height={16} radius="sm" />
            <Skeleton width={64} height={16} radius="sm" />
            <Skeleton width={64} height={16} radius="sm" />
            <Skeleton width={64} height={16} radius="sm" />
          </View>
        ))}
      </View>
    );
  }

  if (needsGpsPrime) {
    return (
      <View style={[styles.centered, styles.pad, { backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 }]}>
        <Text style={[styles.title, { color: palette.text }]}>{t('month.locationNotReadyTitle')}</Text>
        <Text style={[styles.body, { color: palette.muted }]}>{t('month.locationNotReadyBody')}</Text>
      </View>
    );
  }

  const controlsHeader = (
    <MonthControls
      palette={palette}
      monthTitle={monthTitle}
      isCurrentMonth={isCurrentMonth}
      isShareView={isShareView}
      effectiveProvider={effectiveProvider}
      calculationMethod={settings.calculationMethod}
      school={settings.school}
      cacheStatus={cacheStatus}
      refreshingCache={refreshingCache}
      refreshProgress={refreshProgress}
      loading={loading}
      error={error}
      onPrev={goPrevMonth}
      onNext={goNextMonth}
      onThisMonth={goThisMonth}
      onRefreshCache={handleRefreshCache}
      onToggleShareView={() => setIsShareView(v => !v)}
    />
  );

  const columnHeader = (
    <MonthColumnHeader
      palette={palette}
      colHeaders={colHeaders}
      dayLabel={t('month.dayOfWeek', 'Day')}
    />
  );

  if (isShareView) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 }}>
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
    <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 }}>
      <View style={[styles.monthInner, monthWide && styles.monthCap]}>
      {controlsHeader}
      {columnHeader}
      <FlatList
        style={{ flex: 1 }}
        data={nightRows ?? []}
        contentInsetAdjustmentBehavior="never"
        keyExtractor={item => formatLocalDate(item.date)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[styles.empty, { color: palette.muted }]}>{t('month.empty')}</Text>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        initialScrollIndex={
          isCurrentMonth && nightRows ? Math.max(0, today.day - 3) : 0
        }
        getItemLayout={(_, index) => ({
          length: MONTH_ROW_HEIGHT,
          offset: MONTH_ROW_HEIGHT * index,
          index,
        })}
        onScrollToIndexFailed={() => {}}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthInner: { flex: 1, width: '100%' },
  // Month schedule benefits from width; cap + center on very wide windows.
  monthCap: { maxWidth: 900, alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonScreen: { flex: 1, padding: SPACING.lg, gap: SPACING.sm },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  pad: { padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
});
