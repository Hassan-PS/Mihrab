/**
 * Canonical typed interface for the PrayerWidget native module (Android + iOS).
 *
 * Use `getPrayerWidgetModule()` rather than accessing NativeModules directly
 * so the TurboModule / legacy bridge fallback is handled in one place.
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

export interface PrayerWidgetInterface {
  /** Push a JSON-serialised WidgetPrayerPayload to the home-screen widget. */
  setData(json: string): Promise<void>;

  // ── Android appearance ────────────────────────────────────────────────────
  setAndroidWidgetAppearance?(
    opacity: number,
    highlightId: string,
    highlightHex: string | null,
    highlightDynamic: boolean,
  ): Promise<void>;
  getAndroidWidgetAppearance?(): Promise<{
    opacity: number;
    highlightId: string;
    highlightHex: string;
    highlightDynamic: boolean;
  } | null>;

  // ── iOS appearance ────────────────────────────────────────────────────────
  setIosWidgetHighlightAppearance?(
    highlightId: string,
    highlightHex: string | null,
    highlightDynamic: boolean,
  ): Promise<void>;
  /** Legacy iOS API — prefer setIosWidgetHighlightAppearance when available. */
  setWidgetHighlightDynamic?(enabled: boolean): Promise<void>;
  /** Legacy iOS API. */
  setUiHints?(style: string, oledBackground: boolean): Promise<void>;

  // ── The Log Today widget's tap queue ──────────────────────────────────────
  /**
   * Hand over every tap queued by the Log Today widget and clear it.
   *
   * A JSON string, not a bridge array, so the JS side runs it through
   * `coerceLogQueue` like anything else that crosses a process boundary —
   * these end up in the journal. Both platforms — Android's widget posts a
   * PendingIntent to a receiver and iOS 17's runs an AppIntent, and neither
   * of those processes can write an encrypted blob whose key lives here.
   * Absent on any build older than the one that added it, which is the
   * normal state during a staged rollout rather than an error.
   */
  takeLogQueue?(): Promise<string>;
}

/**
 * Returns the PrayerWidget native module, trying the legacy NativeModules
 * bridge first (works in both Turbo and non-Turbo builds), then falling back
 * to TurboModuleRegistry.  Returns null when the module is unavailable
 * (e.g. JS-only test environments).
 */
export function getPrayerWidgetModule(): PrayerWidgetInterface | null {
  const legacy = NativeModules.PrayerWidget as PrayerWidgetInterface | undefined;
  if (legacy?.setData) {
    return legacy;
  }
  try {
    // TurboModuleRegistry.get requires T to extend TurboModule; cast via unknown
    // since PrayerWidget is a legacy NativeModule, not a TurboModule spec.
    const turbo = TurboModuleRegistry.get('PrayerWidget') as PrayerWidgetInterface | null;
    if (turbo) return turbo;
  } catch {
    // TurboModuleRegistry.get can throw when the module is not registered.
  }
  return null;
}
