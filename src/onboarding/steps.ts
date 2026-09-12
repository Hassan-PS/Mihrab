/**
 * Which screens first launch shows, in order.
 *
 * ── WHAT CHANGED, AND WHY THE SHAPE GOT SMALLER ───────────────────────
 *
 * This used to return four objects carrying an i18n key each — title,
 * body, primary label, secondary label — because every step was the same
 * screen with different words in it: a crescent, a centred paragraph and
 * two stacked buttons. Four steps, one of which contained a decision.
 *
 * The remake gives each step its own component with its own copy, its own
 * controls and its own writes (docs/design/onboarding-remake.md §3), so a
 * shared label bag would be four strings nothing reads. What is left is
 * the only thing this file was ever really for: the ORDER, and which
 * steps apply to this install.
 *
 * ── WHY THERE IS NO LONGER A PLATFORM BRANCH ──────────────────────────
 *
 * `exactAlarms` was a whole screen, on Android 12+ only, whose content
 * was a paragraph about a system dialog. It is now one row on the alerts
 * screen, shown when the OS says the permission is missing and resolved
 * without leaving the flow. So the list is the same six everywhere —
 * minus `location` when the user already has one, which is the single
 * remaining condition.
 *
 * Kept pure, and kept here rather than inlined in the flow component, so
 * a test can hold the order still without rendering anything.
 */

export type OnboardingStepId =
  /** The salām, the language chip, and nothing to decide. */
  | 'salam'
  /** GPS, city search or coordinates. No skip — App Store 5.1.1(iv). */
  | 'location'
  /** Which school, shown against the user's own ʿaṣr. */
  | 'madhab'
  /** Notification permission, the adhan, and the Android exact-alarm row. */
  | 'alerts'
  /** The optional shelf: everything that is a preference, not a question. */
  | 'personalise'
  /** Their real Today card, and Start. */
  | 'ready';

/** In order. `location` drops out when it is already answered. */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
  'salam',
  'location',
  'madhab',
  'alerts',
  'personalise',
  'ready',
];

/**
 * The ordered list of steps to show.
 *
 * @param locationDone Pass `settings.locationOnboardingComplete`. Someone
 *   re-running the flow from Settings with a location already set skips
 *   straight from the salām to the school.
 */
export function buildOnboardingSteps(
  locationDone: boolean,
): OnboardingStepId[] {
  return ONBOARDING_STEPS.filter(id => id !== 'location' || !locationDone);
}

/**
 * How far along a step is, for the progress rule.
 *
 * The salām is not counted: progress starts when the questions do, and a
 * rule that is already one-sixth full on the greeting claims the user has
 * done something they have not. Returns `null` for the salām, and
 * otherwise 1…n over the steps that remain.
 */
export function onboardingProgress(
  steps: readonly OnboardingStepId[],
  index: number,
): { now: number; total: number } | null {
  if (steps[index] === 'salam') return null;
  const counted = steps.filter(id => id !== 'salam');
  const now = counted.indexOf(steps[index]) + 1;
  if (now <= 0) return null;
  return { now, total: counted.length };
}
