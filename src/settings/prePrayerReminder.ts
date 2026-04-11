/** Allowed minutes before each prayer for the optional advance notification. */
export const PRE_PRAYER_REMINDER_OPTIONS = [
  0, 5, 10, 15, 20, 30, 45, 60,
] as const;

export type PrePrayerReminderMinutes =
  (typeof PRE_PRAYER_REMINDER_OPTIONS)[number];

export function coercePrePrayerReminderMinutes(
  value: unknown,
): PrePrayerReminderMinutes {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (PRE_PRAYER_REMINDER_OPTIONS as readonly number[]).includes(value)
  ) {
    return value as PrePrayerReminderMinutes;
  }
  return 0;
}
