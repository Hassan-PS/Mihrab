/**
 * Which way this render is laid out — asked of the app, not of the OS.
 *
 * THIS IS NOT `I18nManager.isRTL`, AND THAT IS THE WHOLE POINT.
 *
 * The app does not call `I18nManager.forceRTL`. It mirrors itself with a
 * Yoga `direction: 'rtl'` on the root view (see `AppNavigationRoot`), which
 * is what lets the language be switched inside the app without the restart
 * `forceRTL` demands. `I18nManager.isRTL` is left reading the DEVICE locale,
 * so on an English phone with the app set to Arabic it is `false` while
 * every row on screen is mirrored.
 *
 * Anything that branches on `I18nManager.isRTL` is therefore right only for
 * the users whose phone language happens to match their app language. The
 * practice graph did: it decided which end of its content was "today" and
 * which was "the oldest week", got both backwards in Arabic, and the bug was
 * invisible until the history grew long enough for the graph to scroll.
 *
 * `layoutDirection.ts` says exactly one rule should answer this question.
 * This is that rule, in the form a component can consume.
 */
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from './layoutDirection';

export function useLayoutRtl(): boolean {
  const { i18n } = useTranslation();
  return isRtlLanguage(i18n.language);
}
