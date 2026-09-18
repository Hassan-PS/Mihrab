/**
 * THE BOUNDARY, ON THE GLASS.
 *
 * `islamicDay` knows when the day turns; React does not, because nothing
 * in a component's props or state changes at maghrib — the clock simply
 * walks past a stored instant. A screen whose output depends on
 * `islamicDayKey` therefore subscribes here, and re-renders when the
 * store says the day may have moved.
 *
 * The snapshot is a counter rather than the key itself on purpose. A
 * getSnapshot that read the clock could return two different keys inside
 * one render at the exact millisecond of the boundary, which is the
 * tearing `useSyncExternalStore` warns about. A counter cannot: it
 * changes only when the store says so, and the component reads the key
 * normally while rendering.
 */
import { useSyncExternalStore } from 'react';

import { islamicDayVersion, subscribeIslamicDay } from './islamicDay';

/** Re-render this component when the Islamic day may have changed. */
export function useIslamicDay(): number {
  return useSyncExternalStore(
    subscribeIslamicDay,
    islamicDayVersion,
    islamicDayVersion,
  );
}
