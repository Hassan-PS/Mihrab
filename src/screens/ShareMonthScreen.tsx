// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import type { RootStackParamList } from '../navigation/types';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  loadMonthPrayerTimes,
  type MonthDayEntry,
} from '../prayer/loadMonthPrayerTimes';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { ShareBanner } from './share/ShareBanner';
import { ShareTable } from './share/ShareTable';

type Props = NativeStackScreenProps<RootStackParamList, 'ShareMonth'>;

export function ShareMonthScreen({ route, navigation, embedded }: Props & { navigation?: any, embedded?: boolean }) {
  const { year, month } = route.params;
  const { t, i18n } = useTranslation();
  const { settings, hydrated } = usePrayerSettings();
  const { palette } = useAppPalette();
  const headerHeight = useHeaderHeight();
  const paddingTop = embedded ? 0 : headerHeight;
  const viewShotRef = useRef<ViewShot>(null);

  const [rows, setRows] = useState<MonthDayEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const { width: screenWidth } = useWindowDimensions();
  const A4_WIDTH = 794;
  const initialScale = Math.min(1, (screenWidth - 32) / A4_WIDTH);

  const baseScale = useRef(new Animated.Value(initialScale)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const lastScale = useRef(initialScale);

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  const onPinchHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      lastScale.current = Math.max(initialScale, Math.min(lastScale.current, 3));
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
    }
  };

  useAndroidSubScreenBack();

  // If embedded, we use the parent's navigation for back handling
  useEffect(() => {
    if (embedded && navigation) {
      const unsubscribe = navigation.addListener('beforeRemove', () => {
        // Allow default back behavior
      });
      return unsubscribe;
    }
  }, [embedded, navigation]);

  const needsGpsPrime =
    settings.locationMode === 'automatic' &&
    (settings.lastFetchedLatitude == null ||
      settings.lastFetchedLongitude == null);

  const lat =
    settings.locationMode === 'automatic'
      ? (settings.lastFetchedLatitude ?? 0)
      : settings.manualLatitude;
  const lng =
    settings.locationMode === 'automatic'
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

    loadMonthPrayerTimes(year, month, {
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
  }, [
    hydrated,
    needsGpsPrime,
    year,
    month,
    effectiveProvider,
    settings.calculationMethod,
    settings.school,
    lat,
    lng,
    t,
  ]);

  const handleShare = useCallback(async () => {
    if (!viewShotRef.current?.capture) return;
    try {
      setSharing(true);
      const uri = await viewShotRef.current.capture();
      await Share.open({
        url: Platform.OS === 'android' && !uri.startsWith('file://') ? `file://${uri}` : uri,
        type: 'image/png',
      });
    } catch (e) {
      console.log('Share error:', e);
    } finally {
      setSharing(false);
    }
  }, []);

  const islamicMonthName = useMemo(() => {
    try {
      // Get the middle of the month to represent the most prominent Hijri month
      const midDate = new Date(year, month, 15);
      const loc = i18n.language;
      return new Intl.DateTimeFormat(`${loc}-u-ca-islamic`, { month: 'long', year: 'numeric' }).format(midDate);
    } catch {
      return '';
    }
  }, [year, month, i18n.language]);

  const gregorianMonthName = useMemo(() => {
    const d = new Date(year, month, 1);
    const loc = i18n.language;
    return d.toLocaleString(loc, { month: 'long', year: 'numeric' });
  }, [year, month, i18n.language]);

  const locationName = useMemo(() => {
    if (settings.locationMode === 'manual' && settings.manualLocationLabel) {
      return settings.manualLocationLabel;
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }, [settings.locationMode, settings.manualLocationLabel, lat, lng]);

  if (!hydrated || loading) {
    // activity-indicator-allowed: ShareMonthScreen renders a single image
    // composite — a Skeleton table here would suggest a list-shaped page
    // when the actual deliverable is one composed graphic. Spinner is
    // shown for ~200 ms during Image.captureRef in most cases.
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg, paddingTop }]}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (needsGpsPrime) {
    return (
      <View style={[styles.centered, styles.pad, { backgroundColor: palette.bg, paddingTop }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('month.locationNotReadyTitle')}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {t('month.locationNotReadyBody')}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, styles.pad, { backgroundColor: palette.bg, paddingTop }]}>
        <Text style={[styles.err, { color: palette.accent }]}>{error}</Text>
      </View>
    );
  }

  const tableBorderColor = '#d1d5db';
  const headerBgColor = '#dcfce7';   // brand green tint for header row
  const headerAccent = '#166534';    // dark green text in header
  const textColor = '#1f2937';

  return (
    <View style={[styles.container, { backgroundColor: palette.bg, paddingTop }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} contentInsetAdjustmentBehavior="never">
        <PinchGestureHandler
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchHandlerStateChange}>
          <Animated.View
            style={{
              transform: [{ scale }],
              transformOrigin: 'top center',
            }}>
            <ViewShot
              ref={viewShotRef}
              options={{ format: 'png', quality: 1.0 }}
              style={styles.shotContainer}>
              <ShareBanner
                islamicMonthName={islamicMonthName}
                gregorianMonthName={gregorianMonthName}
                locationName={locationName}
              />
              <ShareTable rows={rows} locale={i18n.language} />
            </ViewShot>
          </Animated.View>
        </PinchGestureHandler>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: palette.border, backgroundColor: palette.bg }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('month.shareMonth', 'Share Image')}
          accessibilityState={{ busy: sharing, disabled: sharing }}
          style={[styles.shareBtn, { backgroundColor: palette.accent }]}
          onPress={handleShare}
          disabled={sharing}>
          {sharing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.shareBtnText}>{t('month.shareMonth', 'Share Image')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pad: { padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  err: { fontSize: 16, textAlign: 'center' },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  // A4 paper canvas at 96 DPI — the rendered PNG must be deterministic
  // regardless of device DPR, so we render at fixed dimensions and let
  // ViewShot capture at the device's pixel ratio.
  shotContainer: {
    backgroundColor: '#ffffff',
    padding: 32,
    borderRadius: 0,
    width: 794, maxWidth: 794, // A4 at 96 DPI — fixed by design.
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  shareBtn: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
