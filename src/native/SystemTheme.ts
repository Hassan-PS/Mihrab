/**
 * JS wrapper around the native `SystemTheme` module — task #112.
 *
 * Two operations:
 *
 *   • `restartApp()`     — fully restarts the activity + process so
 *     PlatformColor refs are re-resolved (used by the Material You
 *     toggle in AppearanceCard).
 *   • `getResolvedAccentHex()` — returns the device's `?attr/colorPrimary`
 *     as a #RRGGBB string. SVG icons can't render PlatformColor, so this
 *     gives us a stable hex that matches the live system tint under
 *     Material You.
 *
 * iOS doesn't allow programmatic restart and doesn't need the hex
 * resolution (palette.accent is already a Dynamic color RN handles
 * natively in style props, and SVG mostly works there with PlatformColor).
 * Both helpers degrade safely on iOS and on builds without the module.
 */

import { NativeModules, Platform } from 'react-native';

type SystemThemeNative = {
  restartApp?: () => void;
  resolveAccentHex?: () => string;
};

const native: SystemThemeNative | undefined = (
  NativeModules as Record<string, SystemThemeNative | undefined>
).SystemTheme;

export function restartApp(): boolean {
  if (Platform.OS !== 'android' || !native?.restartApp) return false;
  try {
    native.restartApp();
    return true;
  } catch (e) {
    console.warn('SystemTheme.restartApp failed:', e);
    return false;
  }
}

/**
 * Returns the device's resolved colorPrimary as a hex string, or null
 * when the native bridge is unavailable. Caller falls back to a
 * brand color when null.
 */
export function getResolvedAccentHex(): string | null {
  if (Platform.OS !== 'android' || !native?.resolveAccentHex) return null;
  try {
    const hex = native.resolveAccentHex();
    if (typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
    return null;
  } catch {
    return null;
  }
}
