import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import notifee, { AndroidNotificationSetting, AuthorizationStatus } from '@notifee/react-native';
import { CalendarIcon } from '../components/HeaderToolbarIcons';
import { LocationSetup } from '../components/LocationSetup';
import { ProviderPickerModal } from '../components/ProviderPickerModal';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { usePrayerDay } from '../hooks/usePrayerDay';
import { syncPrayerNotifications } from '../notifications/prayerNotifications';
import { syncPrayerWidget } from '../widget/syncPrayerWidget';
import { cardEdgeStyle, rowDividerStyle } from '../theme/chrome';
import { getMethodLabel } from '../settings/methods';
import { providerHidesCalculationMethod } from '../settings/providerUi';
import {
  getEffectiveDataProvider,
  resolveCoordsForProvider,
} from '../settings/effectiveProvider';
import { getProviderLabel } from '../settings/providersCatalog';
import { DISPLAY_ORDER } from '../types/prayer';
import type { TimingsMap } from '../types/prayer';
import {
  addDays,
  formatCountdown,
  formatDisplayTime,
  formatLocalTime,
  getNextPrayerDisplay,
  isSameLocalDay,
} from '../utils/prayerTimes';
import type { RootStackParamList } from '../navigation/types';

const isIOS = Platform.OS === 'ios';

// Platform-specific design tokens
const CARD_RADIUS = isIOS ? 20 : 16;
const CARD_PADDING = isIOS ? 20 : 18;
const ROW_PADDING_V = isIOS ? 15 : 14;
const TABLE_RADIUS = isIOS ? 16 : 12;
const SCREEN_PADDING = 16;

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const { settings, hydrated, updateSettings } = usePrayerSettings();
  const { state, retry } = usePrayerDay(settings, hydrated);
  const { palette } = useAppPalette();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - SCREEN_PADDING * 2;

  const [now, setNow] = useState(() => new Date());
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const dayScrollRef = useRef<ScrollView>(null);
  const loadedDateKeyRef = useRef<string | null>(null);
  const loadedTzOffsetRef = useRef<number | null>(null);
  const [exactAlarmDenied, setExactAlarmDenied] = useState(false);
  const [notifPermDenied, setNotifPermDenied] = useState(false);

  // Reset carousel to today when location/data changes
  useEffect(() => {
    if (state.phase === 'ready') {
      loadedDateKeyRef.current = new Date().toDateString();
      loadedTzOffsetRef.current = new Date().getTimezoneOffset();
      setActiveDayIndex(0);
      dayScrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [state.phase === 'ready' ? state.latitude : null, state.phase === 'ready' ? state.longitude : null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.phase === 'ready') {
      loadedDateKeyRef.current = new Date().toDateString();
      loadedTzOffsetRef.current = new Date().getTimezoneOffset();
    }
  }, [state]);

  useEffect(() => {
    const id = setInterval(() => {
      const current = new Date();
      setNow(current);
      const dateChanged =
        loadedDateKeyRef.current !== null &&
        current.toDateString() !== loadedDateKeyRef.current;
      const tzChanged =
        loadedTzOffsetRef.current !== null &&
        current.getTimezoneOffset() !== loadedTzOffsetRef.current;
      if (dateChanged || tzChanged) {
        retry();
      }
    }, 30000);
    return () => clearInterval(id);
  }, [retry]);

  useEffect(() => {
    if (!hydrated || state.phase !== 'ready') {
      return;
    }
    syncPrayerNotifications({
      enabled: settings.notificationsEnabled,
      prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
      notificationSound: settings.notificationSound,
      today: state.today,
      tomorrow: state.tomorrow,
    }).catch(e => console.warn('syncPrayerNotifications (effect):', e));
  }, [
    hydrated,
    settings.notificationsEnabled,
    settings.prePrayerReminderMinutes,
    settings.notificationSound,
    state,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!hydrated || state.phase !== 'ready') {
        return;
      }
      syncPrayerNotifications({
        enabled: settings.notificationsEnabled,
        prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
        notificationSound: settings.notificationSound,
        today: state.today,
        tomorrow: state.tomorrow,
      }).catch(e => console.warn('syncPrayerNotifications (focus):', e));
      syncPrayerWidget(state.today, state.tomorrow, new Date(), locationLabel).catch(
        e => console.warn('syncPrayerWidget (focus):', e),
      );

      if (settings.notificationsEnabled) {
        notifee.getNotificationSettings().then(s => {
          if (Platform.OS === 'android') {
            setExactAlarmDenied(
              s.android.alarm !== AndroidNotificationSetting.ENABLED,
            );
          } else if (Platform.OS === 'ios') {
            setNotifPermDenied(
              s.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
              s.authorizationStatus !== AuthorizationStatus.PROVISIONAL,
            );
          }
        }).catch(e => console.warn('getNotificationSettings:', e));
      } else {
        setExactAlarmDenied(false);
        setNotifPermDenied(false);
      }
    }, [
      hydrated,
      settings.notificationsEnabled,
      settings.prePrayerReminderMinutes,
      settings.notificationSound,
      state,
    ]),
  );

  const locationLabel = useMemo(() => {
    if (settings.locationMode === 'manual' && settings.manualLocationLabel) {
      return settings.manualLocationLabel;
    }
    if (state.phase === 'ready') {
      return `${state.latitude.toFixed(4)}°, ${state.longitude.toFixed(4)}°`;
    }
    return '';
  }, [settings.locationMode, settings.manualLocationLabel, state]);

  useEffect(() => {
    if (!hydrated || state.phase !== 'ready') {
      return;
    }
    syncPrayerWidget(state.today, state.tomorrow, now, locationLabel).catch(
      e => console.warn('syncPrayerWidget (effect):', e),
    );
  }, [hydrated, state, now, locationLabel]);

  const readyLat = state.phase === 'ready' ? state.latitude : undefined;
  const readyLng = state.phase === 'ready' ? state.longitude : undefined;

  useEffect(() => {
    if (readyLat == null || readyLng == null) {
      return;
    }
    if (
      settings.lastFetchedLatitude === readyLat &&
      settings.lastFetchedLongitude === readyLng
    ) {
      return;
    }
    updateSettings({
      lastFetchedLatitude: readyLat,
      lastFetchedLongitude: readyLng,
    });
  }, [
    readyLat,
    readyLng,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    updateSettings,
  ]);

  const coordsForProviderUi = useMemo(
    () => resolveCoordsForProvider(settings, state),
    [settings, state],
  );

  const effectiveProvider = useMemo(
    () =>
      getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coordsForProviderUi,
      ),
    [settings.dataProviderAuto, settings.dataProvider, coordsForProviderUi],
  );

  const nextInfo = useMemo(() => {
    if (state.phase !== 'ready') return null;
    return getNextPrayerDisplay(state.today, state.tomorrow, now);
  }, [state, now]);

  /** Short label shown in the day card header: "Today", "Tomorrow", or weekday name. */
  const getDayLabel = useCallback(
    (dayOffset: number): string => {
      if (dayOffset === 0) return t('home.today');
      if (dayOffset === 1) return t('home.tomorrow');
      return addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        weekday: 'long',
      });
    },
    [t, i18n.language],
  );

  /** Short date string for the day card sub-header, e.g. "30 Apr". */
  const getDayDate = useCallback(
    (dayOffset: number): string =>
      addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
      }),
    [i18n.language],
  );

  // ── Palette object for ProviderPickerModal ─────────────────────────────────
  const pickerPalette = useMemo(
    () => ({
      card: palette.card,
      text: palette.text,
      muted: palette.muted,
      border: palette.border,
      bg: palette.bg,
      overlay: palette.overlay,
      flatChrome: palette.flatChrome,
      accent: palette.accent,
      accentBg: palette.accentBg,
    }),
    [palette],
  );

  // ── Early-exit phases ──────────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={[styles.muted, styles.loadingHint, { color: palette.muted }]}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  if (!settings.locationOnboardingComplete) {
    return <LocationSetup palette={palette} />;
  }

  if (state.phase === 'idle') {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (state.phase === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={[styles.muted, styles.loadingHint, { color: palette.muted }]}>
          {t('home.loadingPrayer')}
        </Text>
      </View>
    );
  }

  if (state.phase === 'permission_denied') {
    return (
      <View style={[styles.centered, styles.errorScreen, { backgroundColor: palette.bg }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('errors.locationNeededTitle')}
        </Text>
        <Text style={[styles.body, styles.bodyCenter, { color: palette.muted }]}>
          {t('errors.locationNeededBody')}
        </Text>
        <Pressable
          onPress={() => retry()}
          style={[styles.button, { backgroundColor: palette.accent }]}>
          <Text style={styles.buttonLabel}>{t('common.tryAgain')}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.phase === 'location_error') {
    return (
      <View style={[styles.centered, styles.errorScreen, { backgroundColor: palette.bg }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('errors.locationErrorTitle')}
        </Text>
        <Text style={[styles.body, styles.bodyCenter, { color: palette.danger }]}>
          {state.message}
        </Text>
        <Pressable
          onPress={() => retry()}
          style={[styles.button, { backgroundColor: palette.accent }]}>
          <Text style={styles.buttonLabel}>{t('common.tryAgain')}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.phase === 'api_error') {
    return (
      <View style={[styles.centered, styles.errorScreen, { backgroundColor: palette.bg }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('errors.apiErrorTitle')}
        </Text>
        <Text style={[styles.body, styles.bodyCenter, { color: palette.muted }]}>
          {state.message}
        </Text>
        <Pressable
          onPress={() => retry()}
          style={[styles.button, { backgroundColor: palette.accent }]}>
          <Text style={styles.buttonLabel}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const { week } = state;

  // ── Main ready layout ──────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic">

      {/* ── Banners ── */}
      {state.usingLocalFallback && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.bannerText, { color: palette.text }]}>
            {t('home.localFallbackNotice')}
          </Text>
          <Pressable onPress={() => retry()} hitSlop={8}>
            <Text style={[styles.bannerAction, { color: palette.accent }]}>
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      )}

      {exactAlarmDenied && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.bannerText, { color: palette.text }]} numberOfLines={2}>
            {t('home.exactAlarmDenied')}
          </Text>
          <Pressable
            onPress={() => notifee.openAlarmPermissionSettings().catch(() => {})}
            hitSlop={8}>
            <Text style={[styles.bannerAction, { color: palette.accent }]}>
              {t('common.openSettings')}
            </Text>
          </Pressable>
        </View>
      )}

      {notifPermDenied && (
        <View style={[styles.banner, { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.bannerText, { color: palette.text }]} numberOfLines={2}>
            {t('home.notifPermDenied')}
          </Text>
          <Pressable
            onPress={() => Linking.openSettings().catch(() => {})}
            hitSlop={8}>
            <Text style={[styles.bannerAction, { color: palette.accent }]}>
              {t('common.openSettings')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Next prayer hero card ── */}
      {nextInfo && (
        <View
          style={[
            styles.nextCard,
            {
              backgroundColor: palette.accentBg,
              borderRadius: CARD_RADIUS,
              padding: CARD_PADDING,
              ...cardEdgeStyle(palette),
            },
          ]}>
          <Text style={[styles.nextLabel, { color: palette.muted }]}>
            {t('home.nextPrayer')}
          </Text>
          <View style={styles.nextRow}>
            <Text
              style={[styles.nextName, { color: palette.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {t(`prayer.${nextInfo.name}`)}
            </Text>
            <Text style={[styles.nextTime, { color: palette.accent }]}>
              {formatLocalTime(nextInfo.at)}
            </Text>
          </View>
          <View style={styles.nextCountdownRow}>
            <View style={[styles.countdownPill, { backgroundColor: palette.card }]}>
              <Text style={[styles.nextCountdown, { color: palette.muted }]}>
                {t('home.nextIn', {
                  time: formatCountdown(
                    Math.max(0, Math.floor((nextInfo.at.getTime() - now.getTime()) / 1000)),
                  ),
                })}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Day carousel ── */}
      <ScrollView
        ref={dayScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={styles.carousel}
        onMomentumScrollEnd={e => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
          setActiveDayIndex(Math.max(0, Math.min(newIndex, week.length - 1)));
        }}>
        {week.map((timings: TimingsMap, dayIndex: number) => (
          <View
            key={dayIndex}
            style={[
              styles.dayCard,
              {
                width: cardWidth,
                backgroundColor: palette.card,
                borderRadius: TABLE_RADIUS,
                ...cardEdgeStyle(palette),
              },
            ]}>
            {/* Day header */}
            <View style={[styles.dayCardHeader, { borderBottomColor: palette.border ?? palette.muted }]}>
              <Text style={[styles.dayCardTitle, { color: palette.text }]}>
                {getDayLabel(dayIndex)}
              </Text>
              <Text style={[styles.dayCardDate, { color: palette.muted }]}>
                {getDayDate(dayIndex)}
              </Text>
            </View>

            {/* Prayer rows */}
            {DISPLAY_ORDER.map((key, rowIndex) => {
              const raw = timings[key];
              if (!raw) return null;
              const isNext =
                dayIndex === 0 &&
                nextInfo?.name === key &&
                nextInfo.at > now &&
                isSameLocalDay(nextInfo.at, now);
              const isSunrise = key === 'Sunrise';
              const isLast = rowIndex === DISPLAY_ORDER.length - 1;

              return (
                <View
                  key={key}
                  style={[
                    styles.row,
                    !isLast && rowDividerStyle(palette),
                    isNext && { backgroundColor: palette.accentBg },
                  ]}>
                  {isNext && (
                    <View style={[styles.activeBar, { backgroundColor: palette.accent }]} />
                  )}
                  <Text
                    style={[
                      styles.rowName,
                      {
                        color: isSunrise && !isNext ? palette.muted : palette.text,
                        fontStyle: isSunrise ? 'italic' : 'normal',
                        fontWeight: isNext ? '600' : '500',
                      },
                    ]}>
                    {t(`prayer.${key}`)}
                  </Text>
                  <Text
                    style={[
                      styles.rowTime,
                      {
                        color: isNext ? palette.accent : isSunrise ? palette.muted : palette.text,
                        fontWeight: isNext ? '700' : '500',
                      },
                    ]}>
                    {formatDisplayTime(raw)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* ── Dot indicators (only when there are multiple days) ── */}
      {week.length > 1 && (
        <View style={styles.dotRow} accessibilityElementsHidden>
          {week.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: palette.muted,
                  opacity: i === activeDayIndex ? 0.9 : 0.25,
                  width: i === activeDayIndex ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* ── Month shortcut ── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.monthTimesLink')}
        accessibilityHint={t('a11y.openMonth')}
        onPress={() => navigation.navigate('MonthTimes')}
        style={({ pressed }) => [
          styles.monthShortcut,
          {
            backgroundColor: palette.card,
            borderRadius: CARD_RADIUS,
            ...cardEdgeStyle(palette),
          },
          pressed && { opacity: 0.75 },
        ]}>
        <CalendarIcon color={palette.accent} size={20} />
        <Text style={[styles.monthShortcutLabel, { color: palette.accent }]}>
          {t('home.monthTimesLink')}
        </Text>
      </Pressable>

      {/* ── Provider / source footer ── */}
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('a11y.openTimesSource')}
        onPress={() => setProviderPickerOpen(true)}
        style={({ pressed }) => [
          styles.providerFooter,
          {
            backgroundColor: palette.card,
            borderRadius: TABLE_RADIUS,
            ...cardEdgeStyle(palette),
          },
          pressed && { opacity: 0.75 },
        ]}>
        <View style={styles.providerFooterBody}>
          <Text style={[styles.providerFooterKicker, { color: palette.muted }]}>
            {t('provider.timesSource').toUpperCase()}
          </Text>
          <Text
            style={[styles.providerFooterLabel, { color: palette.text }]}
            numberOfLines={1}>
            {getProviderLabel(effectiveProvider)}
            {!providerHidesCalculationMethod(effectiveProvider)
              ? ` · ${getMethodLabel(settings.calculationMethod)}`
              : ''}
            {effectiveProvider !== 'islamiska_forbundet' && settings.school === 1
              ? ` · ${t('home.hanafiSuffix')}`
              : ''}
          </Text>
          {locationLabel ? (
            <Text
              style={[styles.providerFooterSub, { color: palette.muted }]}
              numberOfLines={1}>
              {locationLabel}
              {settings.dataProviderAuto
                ? ` · ${t('provider.automaticByLocation')}`
                : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.providerFooterRight}>
          {state.backgroundRefreshing && (
            <ActivityIndicator
              size="small"
              color={palette.muted}
              accessibilityLabel={t('home.updatingLocation')}
              style={styles.refreshSpinner}
            />
          )}
          <Text style={[styles.providerChevron, { color: palette.accent }]}>▾</Text>
        </View>
      </Pressable>

      {/* Provider picker modal — controlled from footer press */}
      <ProviderPickerModal
        visible={providerPickerOpen}
        onClose={() => setProviderPickerOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
        palette={pickerPalette}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    padding: SCREEN_PADDING,
    paddingBottom: 36,
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorScreen: { padding: 24 },
  loadingHint: { marginTop: 12 },
  bodyCenter: { textAlign: 'center' },
  muted: { fontSize: 15 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },

  // ── Banners ──
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  bannerAction: { fontSize: 13, fontWeight: '600' },

  // ── Next prayer hero ──
  nextCard: { overflow: 'hidden' },
  nextLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nextName: { fontSize: 32, fontWeight: '700', flex: 1 },
  nextTime: { fontSize: 26, fontWeight: '700' },
  nextCountdownRow: { marginTop: 10, flexDirection: 'row' },
  countdownPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  nextCountdown: { fontSize: 14, fontWeight: '500' },

  // ── Day carousel ──
  carousel: {
    // Overflow visible so card shadow / edge isn't clipped.
    // The horizontal ScrollView clips itself anyway.
  },
  dayCard: {
    overflow: 'hidden',
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  dayCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dayCardDate: {
    fontSize: 13,
    fontWeight: '400',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: ROW_PADDING_V,
    paddingHorizontal: 16,
    paddingStart: 20,
    position: 'relative',
  },
  activeBar: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  rowName: { fontSize: 17 },
  rowTime: { fontSize: 17 },

  // ── Dot indicators ──
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: -4, // pull up slightly to reduce gap with card
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  // ── Month shortcut ──
  monthShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  monthShortcutLabel: { fontSize: 16, fontWeight: '600' },

  // ── Provider footer ──
  providerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 8,
  },
  providerFooterBody: {
    flex: 1,
    gap: 2,
  },
  providerFooterKicker: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  providerFooterLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  providerFooterSub: {
    fontSize: 12,
  },
  providerFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshSpinner: {},
  providerChevron: {
    fontSize: 18,
    fontWeight: '600',
  },
});
