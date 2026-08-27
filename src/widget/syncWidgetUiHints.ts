import React, { useEffect, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { PrayerAppSettings, WidgetHighlightId } from '../settings/types';
import { getPrayerWidgetModule } from '../native/PrayerWidget';

// 'dynamic' is gone (2026-08-27), so a native side still reporting it is
// not adopted back into settings.
const VALID_WIDGET_HIGHLIGHT_IDS = new Set<string>([
  'green', 'teal', 'blue', 'amber', 'custom',
]);

/**
 * #127: When the user has the unified dynamic-colors toggle on (iOS
 * dynamic), the widget follows the OS palette. When off, the
 * `widgetHighlightId` is kept in sync with the app accent picker, so the
 * widget gets the same color the user picked for the app.
 */
function useDynamicHighlightForWidget(settings: PrayerAppSettings): boolean {
  // ANDROID WIDGETS NEVER FOLLOW MATERIAL YOU (2026-08-27, by request).
  //
  // The app may still; the widget may not. A wallpaper-derived accent gave
  // the card a hue with no relationship to the one the user picked, and on
  // some wallpapers barely any contrast against the card itself. The
  // highlight is now whatever the widget settings say, or green.
  //
  // The native side ignores the stored flag too, so a widget drawn before
  // JS has run this time — after a boot or a restore — is already right.
  // This half stops the app asking for something that will not happen.
  if (Platform.OS === 'android') return false;
  return settings.useSystemDynamicTheme;
}

function syncNativeWidgetAppearance(
  settings: PrayerAppSettings,
  dynamicHl: boolean,
): void {
  const mod = getPrayerWidgetModule();
  const hex =
    settings.widgetHighlightId === 'custom'
      ? settings.widgetHighlightCustomHex
      : null;

  if (Platform.OS === 'android' && mod?.setAndroidWidgetAppearance) {
    // No 'dynamic' to translate any more: `coerceWidgetHighlightId` turns
    // an older build's stored value into the default on load, so what
    // arrives here is always an id the drawing code knows.
    void mod.setAndroidWidgetAppearance(
      settings.androidWidgetBackgroundOpacity,
      settings.widgetHighlightId,
      hex,
      dynamicHl,
    );
    return;
  }

  if (Platform.OS === 'ios' && mod?.setIosWidgetHighlightAppearance) {
    void mod.setIosWidgetHighlightAppearance(
      settings.widgetHighlightId,
      hex,
      dynamicHl,
    );
  } else if (Platform.OS === 'ios' && mod?.setWidgetHighlightDynamic) {
    void mod.setWidgetHighlightDynamic(dynamicHl);
  }

  if (Platform.OS === 'ios' && mod?.setUiHints) {
    void mod.setUiHints('fixed', false);
  }
}

/** Syncs widget highlight / Android opacity with app settings (and Theme → System colors for dynamic accent). */
export function useSyncWidgetUiHints(): void {
  const { hydrated, settings, updateSettings } = usePrayerSettings();
  const dynamicHl = useDynamicHighlightForWidget(settings);
  const [nativeSynced, setNativeSynced] = useState(Platform.OS !== 'android');

  // Keep a ref to the latest settings so AppState listener uses fresh values
  const settingsRef = React.useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') return;

    const syncFromNative = () => {
      const mod = getPrayerWidgetModule();
      if (mod?.getAndroidWidgetAppearance) {
        mod.getAndroidWidgetAppearance().then(nativeSettings => {
          if (nativeSettings) {
            const currentSettings = settingsRef.current;
            const updates: Partial<PrayerAppSettings> = {};
            if (nativeSettings.opacity !== currentSettings.androidWidgetBackgroundOpacity) {
              updates.androidWidgetBackgroundOpacity = nativeSettings.opacity;
            }
            // The dynamic flag is NOT adopted back any more. This effect is
            // Android-only, Android widgets no longer have a dynamic mode,
            // and reading an older build's stored flag into settings would
            // put 'dynamic' back into the app's own accent state for a
            // widget that is not going to honour it.
            const hlId = nativeSettings.highlightId;
            if (hlId !== currentSettings.widgetHighlightId && VALID_WIDGET_HIGHLIGHT_IDS.has(hlId)) {
              updates.widgetHighlightId = hlId as WidgetHighlightId;
            }
            if (nativeSettings.highlightHex && nativeSettings.highlightHex !== currentSettings.widgetHighlightCustomHex) {
              updates.widgetHighlightCustomHex = nativeSettings.highlightHex;
            }
            if (Object.keys(updates).length > 0) {
              updateSettings(updates);
            }
          }
        }).catch(e => console.error('Failed to get widget appearance', e))
        .finally(() => setNativeSynced(true));
      } else {
        setNativeSynced(true);
      }
    };

    syncFromNative();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        syncFromNative();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !nativeSynced) {
      return;
    }
    syncNativeWidgetAppearance(settings, dynamicHl);
  }, [
    hydrated,
    nativeSynced,
    dynamicHl,
    settings,
  ]);
}
