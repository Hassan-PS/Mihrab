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
import { I18nManager } from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import Share from 'react-native-share';
import ViewShot, { captureRef } from 'react-native-view-shot';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import type { RootStackParamList } from '../navigation/types';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  loadMonthPrayerTimes,
  type MonthDayEntry,
} from '../prayer/loadMonthPrayerTimes';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { getMethodLabel } from '../settings/methods';
import { getProviderLabel } from '../settings/providersCatalog';
import {
  providerHidesCalculationMethod,
  providerHidesHanafiAsr,
} from '../settings/providerUi';
import type { AppLanguage } from '../settings/types';
import { isRtlLanguage } from '../i18n/layoutDirection';
import { languageLabel } from '../i18n/languages';
import { injectNightTimes } from '../utils/nightTimes';
import { sheetPlaceName } from '../share/sheetPlaceName';
import { pngToPdfA4, fromBase64, toBase64 } from '../share/pngToPdf';
import { LanguageModal } from './settings/LanguageModal';
import { ShareBanner } from './share/ShareBanner';
import { ShareFooter } from './share/ShareFooter';
import { ShareTable } from './share/ShareTable';

/**
 * A4 at 96 DPI. The sheet is drawn at exactly this size so that what is
 * exported is a page rather than a picture of unknown dimensions — see
 * `share/pngToPdf`, which wraps the capture in a page that says A4.
 */
const A4_W = 794;
const A4_H = 1123;

/** The sheet's own margin, inside the A4 page. */
const SHEET_PADDING = 24;

/**
 * A capture that never returns must not leave the button spinning.
 *
 * It happened: with an output size asked for, view-shot's promise simply
 * never settled and the export sat there with a spinner in it. The cause
 * is fixed above, but a UI that cannot recover from a hung native call is
 * a bug of its own.
 */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('capture timed out')), ms),
    ),
  ]);
}

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

  /**
   * The language of the SHEET, which is not the language of the app.
   *
   * A person exports this to pin up in a hallway, hand to a neighbour or
   * post in a group chat, and the people who read it there need not read
   * what the sender reads. Defaults to the app's language, because that
   * is the common case, and is remembered only for as long as the screen
   * is open — it is a property of this export, not a setting.
   */
  const [sheetLang, setSheetLang] = useState<AppLanguage>(
    (i18n.language.slice(0, 2) as AppLanguage) || 'en',
  );
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  /** The sheet's own translator, fixed to `sheetLang`. */
  const st = useMemo(() => i18n.getFixedT(sheetLang), [i18n, sheetLang]);

  /**
   * Whether the SHEET has to be mirrored, which is not the same question
   * as whether its language is right-to-left.
   *
   * This renders inside the app's tree, and that tree is already mirrored
   * when the APP is in Arabic or Urdu. A `row-reverse` inside a mirrored
   * tree flips twice and lands back where it started — the same trap
   * `i18n/layoutDirection` warns about. What the sheet needs is the
   * DIFFERENCE between the direction it wants and the one it is sitting
   * in.
   */
  const sheetRtl = isRtlLanguage(sheetLang) !== I18nManager.isRTL;

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

  /**
   * The night marks, derived here rather than taken from the provider.
   *
   * They were printing as "—" for every day of the month. The columns
   * come from `DISPLAY_ORDER`, which carries Islamic Midnight, the Last
   * Third and now the First Third, but the rows come straight off
   * `loadMonthPrayerTimes` — and those are provider rows. AlAdhan does
   * send its own, cut from sunset to sunrise, while Mihrab cuts the night
   * from Maghrib to Fajr; every other provider sends nothing at all. So
   * they were either absent or quietly disagreeing with the day card by
   * forty minutes.
   *
   * One pass over the month, which is a consecutive run of days and so
   * exactly what `injectNightTimes` wants, and the sheet agrees with the
   * app that made it.
   */
  const sheetRows = useMemo(() => {
    if (!rows) return rows;
    const times = injectNightTimes(rows.map(r => r.timings));
    return rows.map((r, i) => ({ ...r, timings: times[i] }));
  }, [rows]);

  const shareSheet = useCallback(
    async (as: 'image' | 'pdf') => {
      if (!viewShotRef.current?.capture) return;
      try {
        setSharing(true);
        // Captured at twice the page so the print does not go soft, and
        // at a fixed size so the export does not vary with the device's
        // pixel ratio — two phones must produce the same file.
        // NO `width`/`height` HERE, deliberately.
        //
        // Those options are what a fixed-size export wants, and asking
        // for them hangs the button forever on the New Architecture:
        // react-native-view-shot's resize path calls
        // `FabricUIManager.resolveView` off the UI thread, Fabric raises
        // `Expected to run on UI thread!` as a soft exception, and the
        // promise never settles — so not even the `finally` below runs.
        // Seen on API 36; the capture without them is fine.
        //
        // Nothing is lost that matters. The sheet is laid out at A4's own
        // 794×1123, so the capture comes out at that times the device's
        // pixel ratio — 192 DPI on a 2× phone, 288 on a 3× — and
        // `pngToPdfA4` scales whatever it is onto a page that says A4.
        // The PAGE is exact either way, which is the part that prints.
        const base64 = await withTimeout(
          captureRef(viewShotRef, {
            format: 'png',
            quality: 1,
            result: 'base64',
          }),
          20000,
        );
        const stem = `mihrab-${year}-${String(month + 1).padStart(2, '0')}`;
        const dir = ReactNativeBlobUtil.fs.dirs.CacheDir;
        if (as === 'pdf') {
          const pdf = pngToPdfA4(fromBase64(base64));
          const path = `${dir}/${stem}.pdf`;
          await ReactNativeBlobUtil.fs.writeFile(path, toBase64(pdf), 'base64');
          await Share.open({ url: `file://${path}`, type: 'application/pdf' });
        } else {
          const path = `${dir}/${stem}.png`;
          await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');
          await Share.open({ url: `file://${path}`, type: 'image/png' });
        }
      } catch (e) {
        // A cancelled share sheet throws too, and is not an error.
        console.log('Share error:', e);
      } finally {
        setSharing(false);
      }
    },
    [month, year],
  );

  const islamicMonthName = useMemo(() => {
    try {
      // Get the middle of the month to represent the most prominent Hijri month
      const midDate = new Date(year, month, 15);
      return new Intl.DateTimeFormat(`${sheetLang}-u-ca-islamic`, { month: 'long', year: 'numeric' }).format(midDate);
    } catch {
      return '';
    }
  }, [year, month, sheetLang]);

  const gregorianMonthName = useMemo(() => {
    const d = new Date(year, month, 1);
    return d.toLocaleString(sheetLang, { month: 'long', year: 'numeric' });
  }, [year, month, sheetLang]);

  const locationName = useMemo(
    () =>
      sheetPlaceName({
        manual: settings.locationMode === 'manual',
        manualLabel: settings.manualLocationLabel,
        autoLabel: settings.autoLocationLabel,
        latitude: lat,
        longitude: lng,
      }),
    [
      settings.locationMode,
      settings.manualLocationLabel,
      settings.autoLocationLabel,
      lat,
      lng,
    ],
  );

  /** The reckoning, stated — a timetable without it cannot be checked. */
  const methodLine = useMemo(() => {
    const tr = (key: string, opts: { defaultValue: string }) =>
      st(key, opts) as string;
    const parts: string[] = [];
    if (!providerHidesCalculationMethod(effectiveProvider)) {
      parts.push(getMethodLabel(settings.calculationMethod, tr));
    }
    if (!providerHidesHanafiAsr(effectiveProvider)) {
      parts.push(
        settings.school === 1
          ? st('share.asrHanafi', { defaultValue: 'Asr: Hanafi' })
          : st('share.asrStandard', { defaultValue: 'Asr: standard' }),
      );
    }
    return parts.join(' · ');
  }, [effectiveProvider, settings.calculationMethod, settings.school, st]);

  const sourceLine = useMemo(
    () =>
      st('share.source', {
        defaultValue: 'Times from {{source}}',
        source: getProviderLabel(effectiveProvider, (key, opts) =>
          st(key, opts) as string,
        ),
      }) as string,
    [effectiveProvider, st],
  );

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
                t={st}
                islamicMonthName={islamicMonthName}
                gregorianMonthName={gregorianMonthName}
                locationName={locationName}
                methodLine={methodLine}
                rtl={sheetRtl}
              />
              <View style={styles.sheetBody}>
                <ShareTable
                  rows={sheetRows}
                  locale={sheetLang}
                  t={st}
                  rtl={sheetRtl}
                />
                <ShareFooter t={st} sourceLine={sourceLine} rtl={sheetRtl} />
              </View>
            </ViewShot>
          </Animated.View>
        </PinchGestureHandler>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: palette.border, backgroundColor: palette.bg }]}>
        {/* The sheet's language, chosen per export rather than in
            Settings: the app is for the sender, the sheet is for whoever
            reads it on the wall. */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('share.sheetLanguage', 'Sheet language')}
          style={[styles.langRow, { borderColor: palette.border }]}
          onPress={() => setLangPickerOpen(true)}>
          <Text style={[styles.langLabel, { color: palette.muted }]}>
            {t('share.sheetLanguage', 'Sheet language')}
          </Text>
          <Text style={[styles.langValue, { color: palette.accentSolid }]}>
            {languageLabel(sheetLang)}
            {'  ▾'}
          </Text>
        </TouchableOpacity>

        <View style={styles.exportRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('share.exportImage', 'Share image')}
            accessibilityState={{ busy: sharing, disabled: sharing }}
            style={[styles.exportBtn, { backgroundColor: palette.accent }]}
            onPress={() => shareSheet('image')}
            disabled={sharing}>
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.exportBtnText}>
                {t('share.exportImage', 'Share image')}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('share.exportPdf', 'Share PDF (A4)')}
            accessibilityState={{ busy: sharing, disabled: sharing }}
            style={[
              styles.exportBtn,
              styles.exportBtnGhost,
              { borderColor: palette.accent },
            ]}
            onPress={() => shareSheet('pdf')}
            disabled={sharing}>
            <Text style={[styles.exportBtnText, { color: palette.accentSolid }]}>
              {t('share.exportPdf', 'Share PDF (A4)')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <LanguageModal
        visible={langPickerOpen}
        current={sheetLang}
        palette={palette}
        onSelect={lang => {
          setSheetLang(lang);
          setLangPickerOpen(false);
        }}
        onClose={() => setLangPickerOpen(false)}
      />
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
  // A4 at 96 DPI, both dimensions. The height used to be left to the
  // content, which meant the exported file was A4 wide and whatever tall
  // the month happened to be — so it printed at a size the dialogue
  // guessed. Fixed height plus a fitted row height is what makes "export
  // as A4" true rather than approximate.
  shotContainer: {
    backgroundColor: '#ffffff',
    padding: SHEET_PADDING,
    borderRadius: 0,
    width: A4_W, maxWidth: A4_W,
    height: A4_H,
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
  sheetBody: { flex: 1, justifyContent: 'space-between' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  langLabel: { fontSize: 13 },
  langValue: { fontSize: 14, fontWeight: '700' },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnGhost: { backgroundColor: 'transparent', borderWidth: 1 },
  exportBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
