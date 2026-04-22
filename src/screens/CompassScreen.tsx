import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  magnetometer,
  SensorTypes,
  setUpdateIntervalForType,
} from 'react-native-sensors';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  normalizeHeadingDeg,
  qiblaBearingFrom,
} from '../utils/qibla';

const DIAL = 260;
const SMOOTH = 0.15;
const SENSOR_TIMEOUT_MS = 10000;
const HEADING_HISTORY = 12;
const STALE_SAMPLE_MS = 1800;
const WATCHDOG_INTERVAL_MS = 600;

type CompassMode =
  | 'checking'
  | 'live'
  | 'unsupported'
  | 'permission_denied';

/** -1 = checking, -2 = off, 0–100 = live strength */
type SignalStrength = number;
type SignalQuality = 'unknown' | 'good' | 'weak' | 'very_weak';

function headingFromMagnetometer(x: number, y: number): number {
  if (Platform.OS === 'ios') {
    const rad = Math.atan2(y, x);
    const deg = (rad * 180) / Math.PI;
    return normalizeHeadingDeg(90 - deg);
  }
  const rad = Math.atan2(-x, y);
  const deg = (rad * 180) / Math.PI;
  return normalizeHeadingDeg(deg);
}

function shortestAngleDiff(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function magneticFieldScore(x: number, y: number, z: number): number {
  const mag = Math.sqrt(x * x + y * y + z * z);
  // Typical Earth field ~25–65 µT on consumer magnetometers; scale gently.
  return Math.min(100, Math.max(0, ((mag - 10) / 60) * 100));
}

function stabilityScoreFromHeadings(headings: number[]): number {
  if (headings.length < 4) {
    return 55;
  }
  let sumSin = 0;
  let sumCos = 0;
  for (const h of headings) {
    const r = (h * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  const meanAngle = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  const mean = normalizeHeadingDeg(meanAngle);
  let varSum = 0;
  for (const h of headings) {
    const d = shortestAngleDiff(mean, h);
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / headings.length);
  return Math.min(100, Math.max(0, 100 - std * 6));
}

function combineSignal(field: number, stability: number): number {
  return Math.round(field * 0.5 + stability * 0.5);
}

export function CompassScreen() {
  const { t } = useTranslation();
  const { settings, hydrated } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [heading, setHeading] = useState(0);
  const [mode, setMode] = useState<CompassMode>('checking');
  const [signalStrength, setSignalStrength] = useState<SignalStrength>(-1);
  const [signalQuality, setSignalQuality] = useState<SignalQuality>('unknown');
  const [stability, setStability] = useState(100);

  const smoothedRef = useRef(0);
  const headingHistoryRef = useRef<number[]>([]);
  const gotSampleRef = useRef(false);
  const modeRef = useRef<CompassMode>('checking');

  useAndroidSubScreenBack();

  const needsGpsPrime =
    settings.locationMode === 'gps' &&
    (settings.lastFetchedLatitude == null ||
      settings.lastFetchedLongitude == null);

  const lat =
    settings.locationMode === 'gps'
      ? (settings.lastFetchedLatitude ?? settings.manualLatitude)
      : settings.manualLatitude;
  const lng =
    settings.locationMode === 'gps'
      ? (settings.lastFetchedLongitude ?? settings.manualLongitude)
      : settings.manualLongitude;

  const qibla = useMemo(() => qiblaBearingFrom(lat, lng), [lat, lng]);

  const needleDeg = useMemo(
    () => normalizeHeadingDeg(qibla - heading),
    [qibla, heading],
  );

  useEffect(() => {
    if (!hydrated || needsGpsPrime) {
      return undefined;
    }

    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let watchdogId: ReturnType<typeof setInterval> | null = null;
    let appStateSub: { remove: () => void } | null = null;
    gotSampleRef.current = false;
    headingHistoryRef.current = [];
    smoothedRef.current = 0;
    setMode('checking');
    modeRef.current = 'checking';
    setSignalStrength(-1);
    setSignalQuality('unknown');
    setStability(100);
    let lastSampleAt = 0;

    const setUnsupportedUi = () => {
      if (cancelled) {
        return;
      }
      setMode('unsupported');
      modeRef.current = 'unsupported';
      setSignalStrength(-2);
    };

    setUpdateIntervalForType(SensorTypes.magnetometer, 100);
    const clearStartupTimeout = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleStartupTimeout = () => {
      clearStartupTimeout();
      timeoutId = setTimeout(() => {
        if (!cancelled && !gotSampleRef.current) {
          setUnsupportedUi();
        }
      }, SENSOR_TIMEOUT_MS);
    };

    const restartSubscription = () => {
      if (cancelled) {
        return;
      }
      subscription?.unsubscribe();
      subscription = null;
      gotSampleRef.current = false;
      headingHistoryRef.current = [];
      lastSampleAt = 0;
      setMode('checking');
      modeRef.current = 'checking';
      setSignalStrength(-1);
      setSignalQuality('unknown');
      setStability(100);
      scheduleStartupTimeout();
      startSubscription();
    };

    const startSubscription = () => {
      subscription?.unsubscribe();
      subscription = magnetometer.subscribe({
        next: ({ x, y, z }) => {
          if (cancelled) {
            return;
          }
          clearStartupTimeout();
          lastSampleAt = Date.now();
          if (!gotSampleRef.current) {
            gotSampleRef.current = true;
            setMode('live');
            modeRef.current = 'live';
          }

          const raw = headingFromMagnetometer(x, y);
          const prev = smoothedRef.current;
          const delta = shortestAngleDiff(prev, raw);
          const nextH = normalizeHeadingDeg(prev + delta * SMOOTH);
          smoothedRef.current = nextH;
          setHeading(nextH);

          const hist = [...headingHistoryRef.current.slice(-(HEADING_HISTORY - 1)), raw];
          headingHistoryRef.current = hist;
          const field = magneticFieldScore(x, y, z ?? 0);
          const stab = stabilityScoreFromHeadings(hist);
          setStability(stab);
          const signal = combineSignal(field, stab);
          setSignalStrength(signal);
          if (signal < 20) {
            setSignalQuality('very_weak');
          } else if (signal < 45) {
            setSignalQuality('weak');
          } else {
            setSignalQuality('good');
          }
        },
        error: error => {
          if (cancelled) {
            return;
          }
          clearStartupTimeout();
          const msg = String(
            (error as { message?: string } | null)?.message ?? error ?? '',
          ).toLowerCase();
          const looksPermission =
            msg.includes('permission') ||
            msg.includes('denied') ||
            msg.includes('not authorized') ||
            msg.includes('motion');
          if (Platform.OS === 'ios' && looksPermission) {
            setMode('permission_denied');
            modeRef.current = 'permission_denied';
            setSignalStrength(-2);
          } else {
            setUnsupportedUi();
          }
          subscription?.unsubscribe();
          subscription = null;
        },
      });
    };

    scheduleStartupTimeout();
    startSubscription();

    watchdogId = setInterval(() => {
      if (
        cancelled ||
        modeRef.current === 'permission_denied' ||
        modeRef.current === 'unsupported'
      ) {
        return;
      }
      if (!gotSampleRef.current || lastSampleAt === 0) {
        return;
      }
      if (Date.now() - lastSampleAt > STALE_SAMPLE_MS) {
        restartSubscription();
      }
    }, WATCHDOG_INTERVAL_MS);

    appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        restartSubscription();
      }
    });

    return () => {
      cancelled = true;
      clearStartupTimeout();
      if (watchdogId != null) {
        clearInterval(watchdogId);
      }
      appStateSub?.remove();
      subscription?.unsubscribe();
    };
  }, [hydrated, needsGpsPrime]);

  const canShowLiveGuidance = mode === 'live' && signalStrength >= 0;
  const showStabilityWarning = canShowLiveGuidance && stability < 45;
  const showWeakSignal =
    canShowLiveGuidance &&
    (signalQuality === 'weak' || signalQuality === 'very_weak');

  const bearingBlock = (
    <>
      <Text style={[styles.bearingLabel, { color: palette.muted }]}>
        {t('compass.bearing')}
      </Text>
      <Text style={[styles.bearingValue, { color: palette.text }]}>
        {t('compass.fromNorth', { deg: Math.round(qibla) })}
      </Text>
    </>
  );

  const signalRow = (
    <View style={styles.signalBlock}>
      <View style={styles.signalHeader}>
        <Text style={[styles.signalLabel, { color: palette.muted }]}>
          {t('compass.signalStrength')}
        </Text>
        <Text style={[styles.signalValue, { color: palette.text }]}>
          {signalStrength === -1
            ? t('compass.signalChecking')
            : signalStrength === -2
              ? t('compass.signalOff')
              : `${signalStrength}%`}
        </Text>
      </View>
      <View
        style={[
          styles.signalTrack,
          { backgroundColor: palette.border },
        ]}>
        {mode === 'live' && signalStrength >= 0 ? (
          <View
            style={[
              styles.signalFill,
              {
                width: `${signalStrength}%`,
                backgroundColor: palette.accent,
              },
            ]}
          />
        ) : null}
      </View>
      {mode === 'live' ? (
        <Text style={[styles.signalHelp, { color: palette.muted }]}>
          {t('compass.signalHelp')}
        </Text>
      ) : null}
    </View>
  );

  if (!hydrated) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.muted }}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (needsGpsPrime) {
    return (
      <View style={[styles.centered, styles.pad, { backgroundColor: palette.bg }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('compass.needLocationTitle')}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {t('compass.needLocationBody')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {bearingBlock}

      {signalRow}

      {mode === 'permission_denied' && Platform.OS === 'ios' ? (
        <View style={styles.unsupportedBanner}>
          <Text style={[styles.unsupportedTitle, { color: palette.text }]}>
            {t('compass.motionPermissionTitle')}
          </Text>
          <Text style={[styles.unsupportedBody, { color: palette.muted }]}>
            {t('compass.motionPermissionDeniedBody')}
          </Text>
          <Text
            style={[styles.settingsLink, { color: palette.accent }]}
            onPress={() => {
              void Linking.openSettings();
            }}>
            {t('compass.openSettings')}
          </Text>
        </View>
      ) : null}

      {showWeakSignal ? (
        <View style={styles.unsupportedBanner}>
          <Text style={[styles.unsupportedTitle, { color: palette.text }]}>
            {signalQuality === 'very_weak'
              ? t('compass.signalVeryWeakTitle')
              : t('compass.signalWeakTitle')}
          </Text>
          <Text style={[styles.unsupportedBody, { color: palette.muted }]}>
            {t('compass.signalWeakBody')}
          </Text>
        </View>
      ) : null}

      {showStabilityWarning ? (
        <View style={styles.unsupportedBanner}>
          <Text style={[styles.unsupportedTitle, { color: palette.text }]}>
            {t('compass.motionDetectedTitle')}
          </Text>
          <Text style={[styles.unsupportedBody, { color: palette.muted }]}>
            {t('compass.motionDetectedBody')}
          </Text>
        </View>
      ) : null}

      {mode === 'unsupported' ? (
        <View style={styles.unsupportedBanner}>
          <Text style={[styles.unsupportedTitle, { color: palette.text }]}>
            {t('compass.unsupportedTitle')}
          </Text>
          <Text style={[styles.unsupportedBody, { color: palette.muted }]}>
            {t('compass.unsupportedBody')}
          </Text>
        </View>
      ) : null}

      <View style={styles.dialWrap}>
        <View
          style={[
            styles.dial,
            {
              backgroundColor: palette.card,
              opacity: mode === 'unsupported' ? 0.5 : 1,
              ...(palette.flatChrome
                ? { borderWidth: 0, borderColor: 'transparent' }
                : { borderColor: palette.border }),
            },
          ]}>
          <View style={styles.phoneFrontMark} pointerEvents="none">
            <Text style={[styles.phoneFrontLabel, { color: palette.accent }]}>
              {t('compass.phoneFront')}
            </Text>
            <View
              style={[
                styles.phoneFrontArrow,
                { borderTopColor: palette.accent },
              ]}
            />
          </View>

          <Text style={[styles.cardinal, styles.n, { color: palette.muted }]}>
            {t('compass.north')}
          </Text>
          <Text style={[styles.cardinal, styles.e, { color: palette.muted }]}>
            {t('compass.east')}
          </Text>
          <Text style={[styles.cardinal, styles.s, { color: palette.muted }]}>
            {t('compass.south')}
          </Text>
          <Text style={[styles.cardinal, styles.w, { color: palette.muted }]}>
            {t('compass.west')}
          </Text>

          {mode === 'checking' ? (
            <ActivityIndicator size="large" color={palette.accent} />
          ) : null}

          {mode === 'live' ? (
            <>
              <View
                style={[
                  styles.rotatePlate,
                  { transform: [{ rotate: `${needleDeg}deg` }] },
                ]}>
                <View
                  style={[
                    styles.qiblaArm,
                    { bottom: DIAL / 2, left: DIAL / 2 - 26 },
                  ]}>
                  <View style={styles.qiblaHead}>
                    <View
                      style={[
                        styles.qiblaTriangle,
                        { borderBottomColor: palette.accent },
                      ]}
                    />
                    <Text
                      style={[styles.qiblaHeadText, { color: palette.accent }]}>
                      {t('compass.qiblaMarker')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.qiblaShaft,
                      { backgroundColor: palette.accent },
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.hub, { backgroundColor: palette.text }]} />
            </>
          ) : null}

          {mode === 'unsupported' ? (
            <View style={styles.disabledOverlay} pointerEvents="none">
              <Text style={[styles.disabledGlyph, { color: palette.muted }]}>
                —
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {mode === 'checking' ? (
        <Text style={[styles.checkingHint, { color: palette.muted }]}>
          {Platform.OS === 'ios'
            ? t('compass.checkingCompassWithPrompt')
            : t('compass.checkingCompass')}
        </Text>
      ) : null}

      {mode === 'live' ? (
        <Text style={[styles.hint, { color: palette.muted }]}>
          {t('compass.hint')}
        </Text>
      ) : null}
    </View>
  );
}

const ARM_H = DIAL * 0.4;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 24,
    paddingTop: 16,
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
  bearingLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  bearingValue: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  signalBlock: {
    marginBottom: 16,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  signalLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  signalValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  signalTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  signalFill: {
    height: '100%',
    borderRadius: 4,
  },
  signalHelp: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  unsupportedBanner: {
    marginBottom: 12,
    gap: 8,
  },
  unsupportedTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  unsupportedBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  settingsLink: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  dialWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dial: {
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrontMark: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  phoneFrontLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  phoneFrontArrow: {
    marginTop: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cardinal: {
    position: 'absolute',
    fontSize: 14,
    fontWeight: '700',
  },
  n: { top: 36 },
  s: { bottom: 10 },
  e: { right: 14 },
  w: { left: 14 },
  rotatePlate: {
    position: 'absolute',
    width: DIAL,
    height: DIAL,
    top: 0,
    left: 0,
    zIndex: 1,
  },
  qiblaArm: {
    position: 'absolute',
    width: 52,
    height: ARM_H,
    alignItems: 'center',
    flexDirection: 'column-reverse',
  },
  qiblaShaft: {
    width: 7,
    height: ARM_H * 0.62,
    borderRadius: 3,
    marginTop: 4,
  },
  qiblaHead: {
    alignItems: 'center',
    marginBottom: 2,
  },
  qiblaTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: 2,
  },
  qiblaHeadText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  hub: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    left: DIAL / 2 - 7,
    top: DIAL / 2 - 7,
    zIndex: 3,
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  disabledGlyph: {
    fontSize: 48,
    fontWeight: '200',
  },
  checkingHint: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 16,
  },
});
