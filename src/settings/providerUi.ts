import type { PrayerDataProviderId } from './types';

/** Calculation-method picker does not apply (provider uses fixed rules/tables). */
export function providerHidesCalculationMethod(
  id: PrayerDataProviderId,
): boolean {
  return (
    id === 'prayertimes_dev' ||
    id === 'islamiska_forbundet' ||
    id === 'habous'
  );
}

/** Hanafi Asr toggle is hidden (organization publishes a single schedule). */
export function providerHidesHanafiAsr(id: PrayerDataProviderId): boolean {
  // Both publish a single schedule; there is no madhab to choose within it.
  return id === 'islamiska_forbundet' || id === 'habous';
}
