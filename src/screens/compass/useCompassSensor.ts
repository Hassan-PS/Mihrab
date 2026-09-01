import { useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter } from 'react-native';
import {
  CompassModule,
  CompassNativeModule,
} from '../../native/CompassModule';
import { normalizeHeadingDeg } from '../../utils/qibla';
import {
  combineSignal,
  shortestAngleDiff,
  stabilityScoreFromHeadings,
} from './sensorMath';

const SMOOTH = 0.15;
const SENSOR_TIMEOUT_MS = 10_000;
const HEADING_HISTORY = 12;
const STALE_SAMPLE_MS = 1800;
const WATCHDOG_INTERVAL_MS = 600;

export type CompassMode =
  | 'checking'
  | 'live'
  | 'unsupported'
  | 'permission_denied';

/** -1 = checking, -2 = off, 0-100 = live strength */
export type SignalStrength = number;

export type SignalQuality = 'unknown' | 'good' | 'weak' | 'very_weak';

export type CompassSensorReading = {
  heading: number;
  mode: CompassMode;
  signalStrength: SignalStrength;
  signalQuality: SignalQuality;
  stability: number;
};

// NativeEventEmitter wants the real NativeModule — the one with
// addListener / removeListeners, which both platforms' modules declare —
// rather than the typed wrapper the rest of the app calls.
const compassEmitter = CompassNativeModule
  ? new NativeEventEmitter(CompassNativeModule as never)
  : null;

/**
 * Owns the full heading subscription lifecycle — task #10.
 *
 * ── ONE PATH, BOTH PLATFORMS ──────────────────────────────────────────
 *
 * This used to branch: the native module on iOS, `react-native-sensors`'
 * raw magnetometer on Android. The Android half computed `atan2(-x, y)`,
 * which is a heading only while the phone is flat, and reported MAGNETIC
 * north with no declination correction — while the Qibla bearing it was
 * drawn against is measured from TRUE north. Tilt and declination were
 * both silent errors on a screen whose entire job is a direction.
 *
 * Android now has its own native module doing what the platform's own
 * recipe says (rotation vector → remap for display rotation → orientation
 * → GeomagneticField declination), so both platforms deliver the same
 * `CompassHeading` event and everything below is shared. See
 * `android/.../CompassModule.kt` and `ios/PrayerApp/CompassModule.swift`.
 *
 * Still here, because none of it belonged in the screen:
 *   • Smoothing of raw readings (15% blend toward each new sample).
 *   • Stability score from a rolling history of 12 samples.
 *   • Signal strength combining reported accuracy and stability.
 *   • Startup timeout that flips to "unsupported" if no sample arrives in
 *     10s — which is also how a device with no usable sensor reports
 *     itself, since the native side simply stays quiet.
 *   • Watchdog that restarts a stalled subscription.
 *   • AppState listener that restarts on resume.
 *
 * @param enabled   subscribe only while the screen is focused AND the app
 *                  is foregrounded — a compass left running in a pocket is
 *                  a battery bug.
 * @param latitude  the user's coordinates, needed on Android to turn
 * @param longitude magnetic north into true north.
 */
export function useCompassSensor(
  enabled: boolean,
  latitude: number,
  longitude: number,
): CompassSensorReading {
  const [heading, setHeading] = useState(0);
  const [mode, setMode] = useState<CompassMode>('checking');
  const [signalStrength, setSignalStrength] = useState<SignalStrength>(-1);
  const [signalQuality, setSignalQuality] = useState<SignalQuality>('unknown');
  const [stability, setStability] = useState(100);

  const smoothedRef = useRef(0);
  const headingHistoryRef = useRef<number[]>([]);
  const gotSampleRef = useRef(false);
  const modeRef = useRef<CompassMode>('checking');

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    const subscriptionRef: { current: { unsubscribe: () => void } | null } = {
      current: null,
    };
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
      if (cancelled) return;
      setMode('unsupported');
      modeRef.current = 'unsupported';
      setSignalStrength(-2);
    };

    const clearStartupTimeout = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleStartupTimeout = () => {
      clearStartupTimeout();
      timeoutId = setTimeout(() => {
        if (!cancelled && !gotSampleRef.current) setUnsupportedUi();
      }, SENSOR_TIMEOUT_MS);
    };

    const startSubscription = () => {
      if (!CompassModule || !compassEmitter) {
        setUnsupportedUi();
        return;
      }
      subscriptionRef.current?.unsubscribe();
      CompassModule.startUpdates(latitude, longitude);
      const sub = compassEmitter.addListener(
        'CompassHeading',
        (data: { heading: number; accuracy: number }) => {
          if (cancelled) return;
          clearStartupTimeout();
          lastSampleAt = Date.now();
          if (!gotSampleRef.current) {
            gotSampleRef.current = true;
            setMode('live');
            modeRef.current = 'live';
          }

          const raw = data.heading;
          const prev = smoothedRef.current;
          const delta = shortestAngleDiff(prev, raw);
          const nextH = normalizeHeadingDeg(prev + delta * SMOOTH);
          smoothedRef.current = nextH;
          setHeading(nextH);

          const hist = [
            ...headingHistoryRef.current.slice(-(HEADING_HISTORY - 1)),
            raw,
          ];
          headingHistoryRef.current = hist;
          const stab = stabilityScoreFromHeadings(hist);
          setStability(stab);

          // Negative accuracy means "needs calibrating" on both platforms
          // — CoreLocation's own convention, which the Android module
          // adopts for SENSOR_STATUS_UNRELIABLE.
          if (data.accuracy < 0) {
            setSignalStrength(10);
            setSignalQuality('very_weak');
          } else {
            const field = Math.max(0, 100 - data.accuracy * 2);
            const signal = combineSignal(field, stab);
            setSignalStrength(signal);
            if (signal < 20) setSignalQuality('very_weak');
            else if (signal < 45) setSignalQuality('weak');
            else setSignalQuality('good');
          }
        },
      );
      subscriptionRef.current = {
        unsubscribe: () => {
          try {
            sub?.remove();
          } finally {
            CompassModule?.stopUpdates();
          }
        },
      };
    };

    const restartSubscription = () => {
      if (cancelled) return;
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
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
      if (!gotSampleRef.current || lastSampleAt === 0) return;
      if (Date.now() - lastSampleAt > STALE_SAMPLE_MS) {
        restartSubscription();
      }
    }, WATCHDOG_INTERVAL_MS);

    appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') restartSubscription();
    });

    return () => {
      cancelled = true;
      clearStartupTimeout();
      if (watchdogId != null) clearInterval(watchdogId);
      appStateSub?.remove();
      try {
        subscriptionRef.current?.unsubscribe();
      } catch (e) {
        console.warn('useCompassSensor: subscription cleanup error:', e);
      }
      subscriptionRef.current = null;
    };
  }, [enabled, latitude, longitude]);

  return { heading, mode, signalStrength, signalQuality, stability };
}
