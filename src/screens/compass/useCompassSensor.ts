import { useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter, Platform } from 'react-native';
import {
  magnetometer,
  SensorTypes,
  setUpdateIntervalForType,
} from 'react-native-sensors';
import { CompassModule } from '../../native/CompassModule';
import { normalizeHeadingDeg } from '../../utils/qibla';
import {
  combineSignal,
  headingFromMagnetometer,
  magneticFieldScore,
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

const compassEmitter =
  Platform.OS === 'ios' && CompassModule
    // NativeEventEmitter expects a full NativeModule (with addListener /
    // removeListeners), which CompassModule satisfies at runtime; cast here
    // to avoid a compile-time mismatch against the narrower interface.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? new NativeEventEmitter(CompassModule as any)
    : null;

/**
 * Owns the full magnetometer/CompassModule subscription lifecycle — task #10.
 *
 * Encapsulates everything that was previously inline in CompassScreen:
 *   • Platform-specific subscription (CompassModule on iOS, react-native-sensors
 *     on Android).
 *   • Smoothing of raw readings (15% blend toward each new sample).
 *   • Stability score from a rolling history of 12 samples.
 *   • Signal strength score combining field magnitude and stability.
 *   • Startup timeout that flips to "unsupported" if no sample arrives in 10s.
 *   • Watchdog interval that detects stalled samples and restarts the
 *     subscription.
 *   • AppState listener that restarts subscription on resume.
 *   • Permission-denied detection on iOS Motion access.
 *
 * Returns a snapshot of the current reading. The screen renders from this
 * snapshot only — no sensor state leaks outside.
 */
export function useCompassSensor(enabled: boolean): CompassSensorReading {
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
        if (!cancelled && !gotSampleRef.current) setUnsupportedUi();
      }, SENSOR_TIMEOUT_MS);
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

    const startSubscription = () => {
      if (Platform.OS === 'ios' && CompassModule) {
        subscriptionRef.current?.unsubscribe();
        CompassModule.startUpdates();
        const sub = compassEmitter?.addListener(
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
      } else {
        subscriptionRef.current?.unsubscribe();
        subscriptionRef.current = magnetometer.subscribe({
          next: ({ x, y, z }) => {
            if (cancelled) return;
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

            const hist = [
              ...headingHistoryRef.current.slice(-(HEADING_HISTORY - 1)),
              raw,
            ];
            headingHistoryRef.current = hist;
            const field = magneticFieldScore(x, y, z ?? 0);
            const stab = stabilityScoreFromHeadings(hist);
            setStability(stab);
            const signal = combineSignal(field, stab);
            setSignalStrength(signal);
            if (signal < 20) setSignalQuality('very_weak');
            else if (signal < 45) setSignalQuality('weak');
            else setSignalQuality('good');
          },
          error: error => {
            if (cancelled) return;
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
            subscriptionRef.current?.unsubscribe();
            subscriptionRef.current = null;
          },
        });
      }
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
  }, [enabled]);

  return { heading, mode, signalStrength, signalQuality, stability };
}
