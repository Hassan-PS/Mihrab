import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  ActivityIndicator,
  Animated,
  Image,
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
import { DISPLAY_ORDER } from '../types/prayer';
import { formatDisplayTime } from '../utils/prayerTimes';

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
              
              {/* Banner */}
          <View style={styles.banner}>
            <View style={[styles.bannerTop, { flexDirection: 'row' }]}>
              <View style={[styles.bannerLeft, { alignItems: 'flex-start' }]}>
                <Text style={styles.appName}>{t('app.name')}</Text>
                <Text style={styles.githubLink}>github.com/Hassan-PS/PrayerApp</Text>
              </View>
              <View style={styles.bannerRight}>
                <Image
                  source={require('../../assets/qr-code.png')}
                  style={styles.qrCode}
                  resizeMode="contain"
                />
              </View>
            </View>
            
            <View style={styles.bannerBottom}>
              <Text style={styles.islamicMonth}>{islamicMonthName}</Text>
              <Text style={styles.gregorianMonth}>{gregorianMonthName}</Text>
              <Text style={styles.locationText}>{locationName}</Text>
            </View>
          </View>

          {/* Table */}
          <View style={[styles.table, { borderColor: tableBorderColor }]}>
            {/* Header Row */}
            <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: headerBgColor, flexDirection: 'row' }]}>
              <View style={[styles.cell, styles.cellDay, { borderColor: tableBorderColor }]}>
                <Text style={[styles.headerText, { color: headerAccent }]}>{t('month.dayOfWeek', 'Day')}</Text>
              </View>
              <View style={[styles.cell, styles.cellDateGroup, { borderColor: tableBorderColor, flexDirection: 'column', paddingVertical: 0 }]}>
                <View style={[styles.cellSubHeader, { borderBottomWidth: 1, borderColor: tableBorderColor }]}>
                  <Text style={[styles.headerText, { color: headerAccent }]}>{t('month.date', 'Date')}</Text>
                </View>
                <View style={[styles.cellSubRow, { flexDirection: 'row' }]}>
                  <View style={[styles.cellSubCol, { borderRightWidth: 1, borderColor: tableBorderColor }]}>
                    <Text style={[styles.headerText, { color: headerAccent }]}>{t('month.hijri', 'Hijri')}</Text>
                  </View>
                  <View style={styles.cellSubCol}>
                    <Text style={[styles.headerText, { color: headerAccent }]}>{t('month.gregorian', 'Greg.')}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.cell, styles.cellTimesGroup, { borderColor: tableBorderColor, flexDirection: 'column', paddingVertical: 0, borderRightWidth: 0 }]}>
                <View style={[styles.cellSubHeader, { borderBottomWidth: 1, borderColor: tableBorderColor }]}>
                  <Text style={[styles.headerText, { color: headerAccent }]}>{t('month.prayerTimes', 'Prayer Times')}</Text>
                </View>
                <View style={[styles.cellSubRow, { flexDirection: 'row' }]}>
                  {DISPLAY_ORDER.map((key, idx) => {
                    const isSunrise = key === 'Sunrise';
                    return (
                      <View key={key} style={[styles.cellSubCol, { borderRightWidth: idx === DISPLAY_ORDER.length - 1 ? 0 : 1, borderColor: tableBorderColor }]}>
                        <Text style={[styles.headerText, { color: isSunrise ? '#6b7280' : headerAccent }]}>{t(`prayer.${key}`)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Data Rows */}
            {rows?.map((row, index) => {
              const isFriday = row.date.getDay() === 5;
              const rowBg = isFriday ? '#e5e7eb' : index % 2 === 0 ? '#ffffff' : '#f9fafb';
              const gregDateStr = row.date.getDate().toString();
              const loc = i18n.language;
              const hijriDateStr = new Intl.DateTimeFormat(`${loc}-u-ca-islamic`, { day: 'numeric' }).format(row.date);
              const dayStr = row.date.toLocaleDateString(loc, { weekday: 'short' });
              
              return (
                <View key={index} style={[styles.tableRow, { backgroundColor: rowBg, flexDirection: 'row' }]}>
                  <View style={[styles.cell, styles.cellDay, { borderColor: tableBorderColor }]}>
                    <Text style={[styles.cellText, isFriday && styles.boldText, { color: textColor }]}>
                      {dayStr}
                    </Text>
                  </View>
                  <View style={[styles.cell, styles.cellDateGroup, { borderColor: tableBorderColor, flexDirection: 'row', paddingVertical: 0 }]}>
                    <View style={[styles.cellSubCol, { borderRightWidth: 1, borderColor: tableBorderColor, justifyContent: 'center' }]}>
                      <Text style={[styles.cellText, isFriday && styles.boldText, { color: textColor }]}>{hijriDateStr}</Text>
                    </View>
                    <View style={[styles.cellSubCol, { justifyContent: 'center' }]}>
                      <Text style={[styles.cellText, isFriday && styles.boldText, { color: textColor }]}>{gregDateStr}</Text>
                    </View>
                  </View>
                  <View style={[styles.cell, styles.cellTimesGroup, { borderColor: tableBorderColor, flexDirection: 'row', paddingVertical: 0, borderRightWidth: 0 }]}>
                    {DISPLAY_ORDER.map((key, idx) => {
                      const raw = row.timings[key];
                      const timeStr = raw ? formatDisplayTime(raw) : '—';
                      const isSunrise = key === 'Sunrise';
                      return (
                        <View key={key} style={[styles.cellSubCol, { borderRightWidth: idx === DISPLAY_ORDER.length - 1 ? 0 : 1, borderColor: tableBorderColor, justifyContent: 'center' }]}>
                          <Text style={[styles.cellText, isFriday && styles.boldText, { color: isSunrise ? '#9ca3af' : textColor, fontStyle: isSunrise ? 'italic' : 'normal' }]}>
                            {timeStr}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
            </ViewShot>
          </Animated.View>
        </PinchGestureHandler>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: palette.border, backgroundColor: palette.bg }]}>
        <TouchableOpacity
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
  container: {
    flex: 1,
  },
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
  err: {
    fontSize: 16,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center', // Center the A4 container
  },
  shotContainer: {
    backgroundColor: '#ffffff',
    padding: 32, // More padding for A4 look
    borderRadius: 0, // A4 isn't rounded
    // A4 aspect ratio is roughly 1:1.414, but we'll let content dictate height
    // while ensuring a minimum width/height ratio if needed.
    width: 794, // A4 width at 96 DPI
    alignSelf: 'center',
    // Add shadow for preview
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  banner: {
    marginBottom: 16,
    backgroundColor: '#14532d',
    borderRadius: 8,
    padding: 16,
  },
  bannerTop: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bannerLeft: {
    flex: 1,
  },
  bannerRight: {
    marginStart: 16,
  },
  appName: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  githubLink: {
    color: '#9ca3af',
    fontSize: 16,
    marginTop: 4,
  },
  qrCode: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  bannerBottom: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#166534',
    paddingTop: 12,
  },
  islamicMonth: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  gregorianMonth: {
    color: '#d1d5db',
    fontSize: 20,
    marginBottom: 4,
  },
  locationText: {
    color: '#9ca3af',
    fontSize: 18,
  },
  table: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  tableHeader: {
    borderBottomWidth: 2,
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
  },
  cellDay: {
    flex: 1.5,
    paddingVertical: 8,
  },
  cellDateGroup: {
    flex: 2,
  },
  cellTimesGroup: {
    flex: 6,
  },
  cellSubHeader: {
    width: '100%',
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSubRow: {
    flex: 1,
    width: '100%',
  },
  cellSubCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  headerText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cellText: {
    fontSize: 16,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: 'bold',
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
  shareBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
