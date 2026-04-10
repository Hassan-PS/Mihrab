import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
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

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { settings, hydrated, updateSettings } = usePrayerSettings();
  const { state, retry } = usePrayerDay(settings, hydrated);
  const { palette } = useAppPalette();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hydrated || state.phase !== 'ready') {
      return;
    }
    syncPrayerNotifications({
      enabled: settings.notificationsEnabled,
      today: state.today,
      tomorrow: state.tomorrow,
    }).catch(() => {});
  }, [hydrated, settings.notificationsEnabled, state]);

  useEffect(() => {
    if (!hydrated || state.phase !== 'ready') {
      return;
    }
    syncPrayerWidget(state.today, state.tomorrow, now).catch(() => {});
  }, [hydrated, state, now]);

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

  const { today, latitude, longitude } = state;

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

      <Text style={[styles.tagline, { color: palette.muted }]}>
        {t('app.tagline')}
      </Text>

      {nextInfo && (
        <View
          style={[
            styles.nextCard,
            { backgroundColor: palette.accentBg, borderColor: palette.border },
          ]}>
          <Text style={[styles.nextLabel, { color: palette.muted }]}>
            {t('home.nextPrayer')}
          </Text>
          <Text style={[styles.nextName, { color: palette.text }]}>
            {t(`prayer.${nextInfo.name}`)}
          </Text>
          <Text style={[styles.nextTime, { color: palette.accent }]}>
            {formatLocalTime(nextInfo.at)}
          </Text>
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
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.monthTimesLink')}
        accessibilityHint={t('a11y.openMonth')}
        onPress={() => navigation.navigate('MonthTimes')}
        style={({ pressed }) => [
          styles.monthShortcut,
          { borderColor: palette.border, backgroundColor: palette.card },
          pressed && { opacity: 0.85 },
        ]}>
        <CalendarIcon color={palette.accent} size={22} />
        <Text style={[styles.monthShortcutLabel, { color: palette.accent }]}>
          {t('home.monthTimesLink')}
        </Text>
      </Pressable>

      <Text style={[styles.coords, { color: palette.muted }]}>
        {settings.locationMode === 'manual' && settings.manualLocationLabel
          ? `${settings.manualLocationLabel} · `
          : `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}° · `}
        {getProviderLabel(effectiveProvider)}
        {!providerHidesCalculationMethod(effectiveProvider)
          ? ` · ${getMethodLabel(settings.calculationMethod)}`
          : ''}
        {effectiveProvider !== 'islamiska_forbundet' && settings.school === 1
          ? ` · ${t('home.hanafiSuffix')}`
          : ''}
      </Text>

      <View
        style={[
          styles.table,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}>
        {DISPLAY_ORDER.map(key => {
          const raw = today[key];
          if (!raw) {
            return null;
          }
          const isNext =
            nextInfo &&
            nextInfo.name === key &&
            nextInfo.at > now &&
            isSameLocalDay(nextInfo.at, now);
          return (
            <View
              key={key}
              style={[
                styles.row,
                { borderBottomColor: palette.border },
                isNext && { backgroundColor: palette.accentBg },
              ]}>
              <Text style={[styles.rowName, { color: palette.text }]}>
                {t(`prayer.${key}`)}
              </Text>
              <Text style={[styles.rowTime, { color: palette.accent }]}>
                {formatDisplayTime(raw)}
              </Text>
            </View>
          );
        })}
      </View>
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
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  nextLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  nextName: {
    fontSize: 28,
    fontWeight: '700',
  },
  nextTime: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 4,
  },
  nextCountdown: {
    fontSize: 15,
    marginTop: 8,
  },
  monthShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  monthShortcutLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  tagline: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  coords: {
    fontSize: 13,
    marginBottom: 12,
  },
  table: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: {
    fontSize: 17,
    fontWeight: '500',
  },
  rowTime: {
    fontSize: 17,
    fontWeight: '600',
  },
});
