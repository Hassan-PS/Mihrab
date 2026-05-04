/**
 * Onboarding step state machine — task #30.
 *
 * Defines the 3-step first-run flow (location → notifications → exact-alarms).
 * Pure logic — UI lives in `OnboardingScreen.tsx`. Each step is conditional:
 *
 *   • Location: shown when `locationOnboardingComplete` is false.
 *   • Notifications: always shown (asks for OS permission).
 *   • Exact alarms: Android 12+ only; skipped on iOS and older Android.
 *
 * Skippable: every step has a "Skip for now" CTA. The deferred screen
 * (HomeScreen / SettingsScreen) shows the matching prompt banner with a
 * clear path back. The flow re-triggers from Settings → "Show onboarding".
 */

import { Platform } from 'react-native';

export type OnboardingStepId =
  | 'welcome'
  | 'location'
  | 'notifications'
  | 'exactAlarms';

export type OnboardingStep = {
  id: OnboardingStepId;
  /** i18n key for the step title (`onboarding.<id>.title`). */
  titleKey: string;
  /** i18n key for the body explanation. */
  bodyKey: string;
  /** Primary action label key. */
  primaryKey: string;
  /** Secondary action ("Skip") label key. */
  secondaryKey: string;
};

/**
 * Compute the ordered list of steps to show on first run.
 *
 * @param locationDone Pass `settings.locationOnboardingComplete` here so the
 *   user re-running onboarding from Settings (after picking a location) skips
 *   step 2.
 */
export function buildOnboardingSteps(
  locationDone: boolean,
): OnboardingStep[] {
  const out: OnboardingStep[] = [
    {
      id: 'welcome',
      titleKey: 'onboarding.welcome.title',
      bodyKey: 'onboarding.welcome.body',
      primaryKey: 'common.continue',
      secondaryKey: 'onboarding.skip',
    },
  ];
  if (!locationDone) {
    out.push({
      id: 'location',
      titleKey: 'onboarding.location.title',
      bodyKey: 'onboarding.location.body',
      primaryKey: 'onboarding.location.cta',
      secondaryKey: 'onboarding.skip',
    });
  }
  out.push({
    id: 'notifications',
    titleKey: 'onboarding.notifications.title',
    bodyKey: 'onboarding.notifications.body',
    primaryKey: 'onboarding.notifications.cta',
    secondaryKey: 'onboarding.skip',
  });
  if (
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version >= 31
  ) {
    out.push({
      id: 'exactAlarms',
      titleKey: 'onboarding.exactAlarms.title',
      bodyKey: 'onboarding.exactAlarms.body',
      primaryKey: 'onboarding.exactAlarms.cta',
      secondaryKey: 'onboarding.skip',
    });
  }
  return out;
}
