/**
 * The one place a screen asks "how does this user read a clock?" — issue #18.
 *
 * Returns a bound formatter that turns the app's canonical 24-hour
 * `HH:mm` into what belongs on screen. Every display call site uses it,
 * so the answer cannot drift between the Today card, the month table and
 * the share sheet.
 *
 * Three inputs, resolved in `resolveHour12`: the user's explicit choice,
 * the device's own 12/24-hour switch, and — only when the device could
 * not be asked — what the app language would write.
 *
 * The device answer is re-read when the app returns to the foreground.
 * Someone who leaves Mihrab to flip that switch in system settings comes
 * back to an app that already agrees with their clock.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useAppearanceSettings } from '../context/PrayerSettingsContext';
import {
  subscribeSystemIs24Hour,
  systemIs24Hour,
} from '../native/SystemClock';
import {
  makeClockFormatter,
  resolveHour12,
  type ClockFormatter,
} from '../utils/clockFormat';

/** The device's 12/24-hour switch, kept current across foregrounding. */
export function useSystemIs24Hour(): boolean | null {
  return useSyncExternalStore(
    subscribeSystemIs24Hour,
    systemIs24Hour,
    systemIs24Hour,
  );
}

export function useClockFormatter(): ClockFormatter {
  const { slice } = useAppearanceSettings();
  const systemIs24 = useSystemIs24Hour();
  const hour12 = resolveHour12(slice.clockFormat, systemIs24, slice.language);
  return useMemo(
    () => makeClockFormatter(hour12, slice.language),
    [hour12, slice.language],
  );
}
