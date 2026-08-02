/**
 * Which language the app should open in when the user has never picked one.
 *
 * Until v2.8.4 Mihrab always started in English: `DEFAULT_SETTINGS.language`
 * is 'en' and nothing ever consulted the device. A phone set to Arabic or
 * Swedish still got an English app, and the Quran screens — where the app
 * matters most, and where the surrounding content is Arabic — were where it
 * looked most wrong. This resolves the device's preferred languages against
 * the list we actually ship, and is consulted ONCE: the moment a language is
 * stored (whether by this function or by the picker) the stored value wins
 * forever. Nobody's explicit choice is ever second-guessed.
 *
 * No new dependency: iOS exposes the preference list on SettingsManager,
 * Android exposes the resolved locale on its I18nManager module, and Intl is
 * the backstop (Hermes ships with full ICU on both platforms).
 */
import { NativeModules, Platform } from 'react-native';

/** Device language preferences, best first, as BCP-47-ish tags. */
export function deviceLanguageTags(): string[] {
  const tags: string[] = [];
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const list = settings?.AppleLanguages;
      if (Array.isArray(list)) tags.push(...list.map(String));
      if (typeof settings?.AppleLocale === 'string') {
        tags.push(settings.AppleLocale);
      }
    } else {
      const id = NativeModules.I18nManager?.localeIdentifier;
      if (typeof id === 'string') tags.push(id);
    }
  } catch {
    // A missing native module is not a reason to fail a settings load.
  }
  try {
    const intlLocale = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
    if (typeof intlLocale === 'string') tags.push(intlLocale);
  } catch {
    /* no Intl — fall through to the caller's fallback */
  }
  return tags.filter(Boolean);
}

/** Primary subtag, lower-cased: "sv_SE" / "ar-Arab-EG" → "sv" / "ar". */
function primarySubtag(tag: string): string {
  return tag.replace('_', '-').split('-')[0].toLowerCase();
}

/**
 * First device language we ship, or `fallback` if none of them match.
 * `supported` is the app's own list, so this file never has to know it.
 */
export function resolveDeviceLanguage<T extends string>(
  supported: ReadonlyArray<T>,
  fallback: T,
  tags: ReadonlyArray<string> = deviceLanguageTags(),
): T {
  for (const tag of tags) {
    const primary = primarySubtag(tag);
    const hit = supported.find(s => s.toLowerCase() === primary);
    if (hit) return hit;
  }
  return fallback;
}
