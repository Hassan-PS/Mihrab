/**
 * How each prayer announces itself.
 *
 * Until now this was one decision for all five: pick an adhan in
 * Settings and every prayer plays it, or pick "default" and none of them
 * do. That is the wrong shape for how people actually pray. Fajr at
 * 04:30 wants a quiet tone or nothing at all; Maghrib wants the adhan.
 * Anyone who wanted that had to change the setting twice a day, so in
 * practice they turned the adhan off and lost it for every prayer.
 *
 * So the mode belongs to the prayer, and it lives where the prayer is —
 * on its row on the home screen, next to the time, rather than three
 * screens away in Settings.
 *
 *   • `adhan`        — the call to prayer, in whichever recitation the
 *                      user chose. Only the five may have this.
 *   • `notification` — the ordinary alert tone.
 *   • `silent`       — nothing is scheduled. Not a muted notification: no
 *                      alarm is registered at all, which is also what
 *                      keeps a silenced prayer off the lock screen.
 *
 * Sunrise and the night marks get two of the three. They are times, not
 * prayers; the call to prayer is not theirs to make.
 */
import { OPTIONAL_TIME_KEYS } from '../types/prayer';

export type PrayerAlertMode = 'adhan' | 'notification' | 'silent';

/** What a prayer may be set to. */
export const SALAH_ALERT_MODES: readonly PrayerAlertMode[] = [
  'adhan',
  'notification',
  'silent',
];

/** What Sunrise and the night marks may be set to. */
export const EVENT_ALERT_MODES: readonly PrayerAlertMode[] = [
  'notification',
  'silent',
];

/** The five, in the order the day runs. */
export const SALAH_KEYS = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type AlertModeMap = Partial<Record<string, PrayerAlertMode>>;

export function isNonPrayerKey(key: string): boolean {
  return (OPTIONAL_TIME_KEYS as readonly string[]).includes(key);
}

/**
 * The modes a given row may cycle through — three for a prayer, two for
 * a time. `adhan` on Sunrise is not a preference this app will hold.
 */
export function modesFor(key: string): readonly PrayerAlertMode[] {
  return isNonPrayerKey(key) ? EVENT_ALERT_MODES : SALAH_ALERT_MODES;
}

/**
 * What this row is set to, falling back to what the app did before the
 * setting existed.
 *
 * The default is the old global behaviour exactly: the five follow the
 * chosen sound — an adhan if one is chosen, otherwise the plain tone —
 * and Sunrise and the night marks have always used the plain tone. So an
 * install that upgrades into this feature sounds identical until someone
 * touches a row, which is the only acceptable answer for a setting about
 * whether the adhan plays.
 */
export function alertModeFor(
  key: string,
  modes: AlertModeMap,
  adhanChosen: boolean,
): PrayerAlertMode {
  const stored = modes[key];
  if (stored && modesFor(key).includes(stored)) return stored;
  if (isNonPrayerKey(key)) return 'notification';
  return adhanChosen ? 'adhan' : 'notification';
}

/** The next mode in the cycle for this row. */
export function nextAlertMode(
  key: string,
  current: PrayerAlertMode,
): PrayerAlertMode {
  const modes = modesFor(key);
  const i = modes.indexOf(current);
  return modes[(i + 1) % modes.length];
}

/** Storage hands us whatever was on disk. */
export function coerceAlertModes(value: unknown): AlertModeMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: AlertModeMap = {};
  for (const [key, mode] of Object.entries(value as Record<string, unknown>)) {
    if (typeof mode !== 'string') continue;
    if (!(modesFor(key) as readonly string[]).includes(mode)) continue;
    out[key] = mode as PrayerAlertMode;
  }
  return out;
}

/**
 * What a home row SHOWS, given the master switch in Settings.
 *
 * `notificationsEnabled` decides whether the app speaks at all; these
 * modes decide what each prayer says when it does. They used to be
 * independent, which let the app hold two answers at once — five rows
 * showing a green bell above a master switch that was off, and silence at
 * every prayer time. The scheduler was already reading the master, so the
 * rows were the half that was lying.
 *
 * Off, every row reads silent. It only READS: the stored choice is left
 * alone, so turning the master back on restores what each prayer was set
 * to rather than flattening five decisions into one default.
 */
export function shownAlertMode(
  key: string,
  modes: AlertModeMap,
  adhanChosen: boolean,
  notificationsEnabled: boolean,
): PrayerAlertMode {
  if (!notificationsEnabled) return 'silent';
  return alertModeFor(key, modes, adhanChosen);
}

/**
 * What pressing a home row writes — the other direction of the same bind.
 *
 * Asking a prayer to sound the adhan while the master switch is off is a
 * contradiction whose other half is three screens away. Rather than doing
 * nothing visible and nothing audible, the row turns the master on.
 *
 * Cycling back to silent does NOT turn the master off: one prayer going
 * quiet is not a statement about the other four.
 */
export function cycleAlertModePatch(
  key: string,
  shown: PrayerAlertMode,
  modes: AlertModeMap,
  notificationsEnabled: boolean,
): { prayerAlertModes: AlertModeMap; notificationsEnabled?: boolean } {
  const next = nextAlertMode(key, shown);
  const prayerAlertModes: AlertModeMap = { ...modes, [key]: next };
  if (!notificationsEnabled && next !== 'silent') {
    return { prayerAlertModes, notificationsEnabled: true };
  }
  return { prayerAlertModes };
}
