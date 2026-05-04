import type { ReactElement } from 'react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { LocationSetup } from '../../components/LocationSetup';
import { PhaseScreen } from './PhaseScreen';
import type { PrayerDayState } from '../../hooks/usePrayerDay';

/**
 * Routes the non-`ready` phases of `usePrayerDay` to the matching screen.
 *
 * Returns `null` when the caller should render the main ready layout, or a
 * ReactElement for any of the loading/onboarding/error phases. Co-located
 * with HomeScreen because no other screen consumes this routing logic.
 */
export function useNonReadyPhaseElement(args: {
  hydrated: boolean;
  locationOnboardingComplete: boolean;
  state: PrayerDayState;
  retry: () => void;
}): ReactElement | null {
  const { hydrated, locationOnboardingComplete, state, retry } = args;
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  if (!hydrated) {
    return createElement(PhaseScreen, {
      kind: 'loading',
      hint: t('common.loading'),
    });
  }
  if (!locationOnboardingComplete) {
    return createElement(LocationSetup, { palette });
  }
  if (state.phase === 'idle') {
    return createElement(PhaseScreen, { kind: 'idle' });
  }
  if (state.phase === 'loading') {
    return createElement(PhaseScreen, {
      kind: 'loading',
      hint: t('home.loadingPrayer'),
    });
  }
  if (state.phase === 'permission_denied') {
    return createElement(PhaseScreen, {
      kind: 'error',
      title: t('errors.locationNeededTitle'),
      body: t('errors.locationNeededBody'),
      retryLabel: t('common.tryAgain'),
      onRetry: retry,
    });
  }
  if (state.phase === 'location_error') {
    return createElement(PhaseScreen, {
      kind: 'error',
      title: t('errors.locationErrorTitle'),
      body: state.message,
      bodyDanger: true,
      retryLabel: t('common.tryAgain'),
      onRetry: retry,
    });
  }
  if (state.phase === 'api_error') {
    return createElement(PhaseScreen, {
      kind: 'error',
      title: t('errors.apiErrorTitle'),
      body: state.message,
      retryLabel: t('common.retry'),
      onRetry: retry,
    });
  }
  return null;
}
