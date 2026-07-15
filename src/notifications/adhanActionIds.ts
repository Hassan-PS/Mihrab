/**
 * Notification action / category identifiers for the adhan + prayer alerts.
 *
 * Kept in a tiny leaf module (no imports) so it can be shared by
 * `prayerNotifications.ts` (which attaches the actions), `adhanSafetyControls.ts`
 * (which registers the iOS category + handles the presses), and
 * `notificationActions.ts` (which reschedules a snooze) WITHOUT creating an
 * import cycle between them.
 */

/** iOS category id carrying the Stop + Snooze actions. */
export const ADHAN_CONTROLS_CATEGORY_ID = 'adhan_controls';
/** Stop the currently-playing adhan (clears the banner, stops in-app audio). */
export const ADHAN_ACTION_STOP = 'adhan_stop';
/** Legacy: disable the adhan sound preference (kept for back-compat). */
export const ADHAN_ACTION_DISABLE = 'adhan_disable';
/** Snooze: re-fire this prayer's alert after N minutes (presets + free-form). */
export const ADHAN_ACTION_SNOOZE = 'adhan_snooze';
