import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CalendarIcon } from '../components/HeaderToolbarIcons';
import { LocationSetup } from '../components/LocationSetup';
import { ProviderSourceHeader } from '../components/ProviderSourceHeader';
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
import {
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

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { settings, hydrated, updateSettings } = usePrayerSettings();
  const { state, retry } = usePrayerDay(settings, hydrated);
  const { palette } = useAppPalette();
  const [now, setNow] = useState(() => new Date());
  const loadedDateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.phase === 'ready') {
      loadedDateKeyRef.current = new Date().toDateString();
    }
  }, [state]);

  useEffect(() => {
    const id = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (
        loadedDateKeyRef.current !== null &&
        current.toDateString() !== loadedDateKeyRef.current
      ) {
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
    }).catch(() => {});
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
      }).catch(() => {});
      syncPrayerWidget(state.today, state.tomorrow, new Date(), locationLabel).catch(() => {});
    }, [
      hydrated,
      settings.notificationsEnabled,
      settings.prePrayerReminderMinutes,
      settings.notificationSound,
      state,
      locationLabel,
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
    syncPrayerWidget(state.today, state.tomorrow, now, locationLabel).catch(() => {});
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
    [
      settings.dataProviderAuto,
      settings.dataProvider,
      coordsForProviderUi,
    ],
  );

  const nextInfo = useMemo(() => {
    if (state.phase !== 'ready') {
      return null;
    }
    return getNextPrayerDisplay(state.today, state.tomorrow, now);
  }, [state, now]);

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
          onPress={retry}
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
          onPress={retry}
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
          onPress={retry}
          style={[styles.button, { backgroundColor: palette.accent }]}>
          <Text style={styles.buttonLabel}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const { today } = state;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.scrollContent}>
      <ProviderSourceHeader
        settings={settings}
        updateSettings={updateSettings}
        coords={coordsForProviderUi}
        palette={palette}
      />

      {/* Next prayer hero card */}
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

          {/* Name + time row */}
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

          {/* Countdown */}
          <View style={styles.nextCountdownRow}>
            <View style={[styles.countdownPill, { backgroundColor: palette.card }]}>
              <Text style={[styles.nextCountdown, { color: palette.muted }]}>
                {t('home.nextIn', {
                  time: formatCountdown(
                    Math.max(
                      0,
                      Math.floor((nextInfo.at.getTime() - now.getTime()) / 1000),
                    ),
                  ),
                })}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Location + provider info */}
      <Text style={[styles.coords, { color: palette.muted }]}>
        {locationLabel ? `${locationLabel} · ` : ''}
        {getProviderLabel(effectiveProvider)}
        {!providerHidesCalculationMethod(effectiveProvider)
          ? ` · ${getMethodLabel(settings.calculationMethod)}`
          : ''}
        {effectiveProvider !== 'islamiska_forbundet' && settings.school === 1
          ? ` · ${t('home.hanafiSuffix')}`
          : ''}
      </Text>

      {/* Prayer times table */}
      <View
        style={[
          styles.table,
          {
            backgroundColor: palette.card,
            borderRadius: TABLE_RADIUS,
            ...cardEdgeStyle(palette),
          },
        ]}>
        {DISPLAY_ORDER.map((key, index) => {
          const raw = today[key];
          if (!raw) {
            return null;
          }
          const isNext =
            nextInfo &&
            nextInfo.name === key &&
            nextInfo.at > now &&
            isSameLocalDay(nextInfo.at, now);
          const isSunrise = key === 'Sunrise';
          const isLast = index === DISPLAY_ORDER.length - 1;

          return (
            <View
              key={key}
              style={[
                styles.row,
                !isLast && rowDividerStyle(palette),
                isNext && { backgroundColor: palette.accentBg },
              ]}>
              {/* Active-row accent bar (left edge) */}
              {isNext && (
                <View
                  style={[styles.activeBar, { backgroundColor: palette.accent }]}
                />
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
                    color: isNext
                      ? palette.accent
                      : isSunrise
                      ? palette.muted
                      : palette.text,
                    fontWeight: isNext ? '700' : '500',
                  },
                ]}>
                {formatDisplayTime(raw)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Month shortcut */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorScreen: {
    padding: 24,
  },
  loadingHint: {
    marginTop: 12,
  },
  bodyCenter: {
    textAlign: 'center',
  },
  muted: {
    fontSize: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextCard: {
    overflow: 'hidden',
  },
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
  nextName: {
    fontSize: 32,
    fontWeight: '700',
    flex: 1,
  },
  nextTime: {
    fontSize: 26,
    fontWeight: '700',
  },
  nextCountdownRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  countdownPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  nextCountdown: {
    fontSize: 14,
    fontWeight: '500',
  },
  coords: {
    fontSize: 13,
    lineHeight: 18,
  },
  table: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: ROW_PADDING_V,
    paddingHorizontal: 16,
    paddingLeft: 20,
    position: 'relative',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  rowName: {
    fontSize: 17,
  },
  rowTime: {
    fontSize: 17,
  },
  monthShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  monthShortcutLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
