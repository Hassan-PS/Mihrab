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
  setNavigationBarStyle?: (isDark: boolean) => void;
  getColorScheme?: () => string | null;
  isButtonNavigation?: () => boolean | null;
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
 * Make the Android system navigation bar match the app theme (icon
 * appearance + adaptive scrim). No-op on iOS and on builds without the
 * native module. Safe to call on every theme change.
 */
export function setNavigationBarStyle(isDark: boolean): void {
  if (Platform.OS !== 'android' || !native?.setNavigationBarStyle) return;
  try {
    native.setNavigationBarStyle(isDark);
  } catch {
    // best-effort cosmetic; ignore
  }
}

/**
 * The system light/dark scheme, read closer to the source than React
 * Native reads it — or null when there is nothing better to offer.
 *
 * See `SystemThemeModule.getColorScheme`: RN resolves
 * `Appearance.getColorScheme()` through the APPLICATION context's
 * configuration, and this app declares `android:configChanges="uiMode"`, so
 * a theme change reaches the Activity without any guarantee the
 * application's copy follows. Null on iOS and on any build without the
 * module, where RN's own answer is the right one.
 */
export function getNativeColorScheme(): 'light' | 'dark' | null {
  if (Platform.OS !== 'android' || !native?.getColorScheme) return null;
  try {
    const scheme = native.getColorScheme();
    return scheme === 'dark' || scheme === 'light' ? scheme : null;
  } catch {
    return null;
  }
}

/**
 * Is the system on button navigation rather than gestures? `undefined` when
 * nobody can say — iOS, or a build without the module — and the caller then
 * falls back to judging by the inset's height.
 *
 * See `SystemThemeModule.isButtonNavigation`: on Android 14 a three-button
 * bar and a gesture strip both report 24dp, so height alone cannot tell them
 * apart and the floating tab bar tucked itself under the buttons.
 */
export function isButtonNavigation(): boolean | undefined {
  if (Platform.OS !== 'android' || !native?.isButtonNavigation) return undefined;
  try {
    const v = native.isButtonNavigation();
    return typeof v === 'boolean' ? v : undefined;
  } catch {
    return undefined;
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
