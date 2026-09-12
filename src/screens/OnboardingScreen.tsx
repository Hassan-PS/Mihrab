/**
 * The `Onboarding` route.
 *
 * This file used to be the whole flow — a 440-line screen that walked a
 * list of four label bags, rendered a crescent and a paragraph for each,
 * and asked the user exactly one real question. The remake gives every
 * screen its own component with its own copy, controls and writes, so
 * what is left here is the route entry.
 *
 * The flow itself lives in `src/onboarding/` — `OnboardingFlow` for the
 * order, transitions and the one deferred write, `screens/` for the six,
 * `steps.ts` for which of them apply. `SalamHero` moved to
 * `screens/SalamScreen.tsx` with the screen it belongs to.
 *
 * See docs/design/onboarding-remake.md.
 */
export { OnboardingFlow as OnboardingScreen } from '../onboarding/OnboardingFlow';
