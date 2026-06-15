/**
 * Typed wrapper for the MihrabLiveActivity native module (Android).
 *
 * The Android Live Activity is rendered via a custom RemoteViews layout
 * declared in:
 *   • android/app/src/main/res/layout/live_activity_collapsed.xml
 *   • android/app/src/main/res/layout/live_activity_expanded.xml
 * Both layouts include a `Chronometer` view configured for count-down,
 * a `ProgressBar` showing fraction of time elapsed between the previous
 * and next prayer, and (in the expanded view) six row slots populated
 * from the payload.
 *
 * On Android 16+ the notification carries `android.shortCriticalText`
 * in its extras so the system shade can promote it to the status-bar
 * "Live Update" chip — Android's closest analogue to iOS's Dynamic
 * Island.
 *
 * `getMihrabLiveActivityModule()` returns null on platforms where the
 * module isn't linked (iOS, JS-only tests). Callers should fall through
 * to the notifee path when it returns null.
 */
import { NativeModules } from 'react-native';

export type MihrabLiveActivityPayload = {
  /** Localised prayer name for the upcoming prayer. */
  nextLabel: string;
  /** HH:MM display string for the upcoming prayer. */
  nextTime: string;
  /** Stable row key for the upcoming prayer (e.g. 'Fajr'). */
  nextKey: string;
  /** ms-since-epoch of the upcoming prayer — drives the Chronometer
   *  countdown and the progress-bar fraction calculation. */
  nextEpochMs: number;
  /** ms-since-epoch of the PREVIOUS prayer. The native foreground
   *  service uses (now - prev) / (next - prev) to recompute the
   *  progress bar on every minute-tick so the bar advances even when
   *  the app isn't open. */
  prevEpochMs: number;
  /** Already-localised title rendered in `setContentTitle`; mostly
   *  shown by Wear OS / connected devices that ignore RemoteViews. */
  title: string;
  /** Already-localised body for the same fallback path. */
  body: string;
  /** 0..1 — fraction of elapsed time between previous prayer and next.
   *  Computed JS-side; the native module just renders. */
  progressFraction: number;
  /** Chronological prayer list. Each row carries the stable `key`, the
   *  localised long `name`, and the HH:MM `time`. */
  rows: { key: string; name: string; time: string }[];
  /** Sunrise row sent separately so the native module can splice it
   *  into slot 1 only when the user has the toggle on. */
  sunriseRow?: { key: string; name: string; time: string };
  /** Multi-day schedule (index 0 = today). The foreground-service ticker
   *  uses this to recompute the next/previous prayer against the absolute
   *  dated schedule, so the countdown rolls onto the correct day's times
   *  without the app being reopened. Each day carries the localised long
   *  prayer names. Optional — when absent the service falls back to the
   *  single-day `rows` + HH:MM advance logic. */
  days?: {
    dateKey: string;
    rows: { key: string; name: string; time: string }[];
    sunriseRow?: { key: string; name: string; time: string };
  }[];
  /** Hijri caption, empty string → omit. */
  hijriLabel: string;
  /** Location caption — already shortened to the first comma-separated
   *  component by the JS side. */
  locationLabel: string;
  /** App accent hex (#RRGGBB) — drives the dot, chronometer text,
   *  progress-bar tint. */
  accentHex: string;
  /** Enhanced visual style for the Android 16 ProgressStyle Live Activity:
   *   'colorized' — accent-coloured notification background.
   *   'timeOfDay' — neutral card with a dawn→dusk→night colour ramp. */
  design?: 'colorized' | 'timeOfDay';
  /** Display knobs. */
  compactMode: boolean;
  showSunrise: boolean;
  showHijri: boolean;
  showLocation: boolean;
  /** Localised "Prayer countdown active" text for the silent FGS
   *  placeholder notification — respects the app's selected language
   *  rather than the device OS locale. */
  fgsText?: string;
};

export interface MihrabLiveActivityInterface {
  display(payloadJson: string): Promise<void>;
  cancel(): Promise<void>;
}

export function getMihrabLiveActivityModule(): MihrabLiveActivityInterface | null {
  const mod = NativeModules.MihrabLiveActivity as
    | MihrabLiveActivityInterface
    | undefined;
  if (mod?.display) return mod;
  return null;
}
