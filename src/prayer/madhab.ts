/**
 * Which school, and what follows from it — issues #21 and #22.
 *
 * ── WHY A SCHOOL AND NOT A SHADOW ─────────────────────────────────────
 *
 * The app asked one madhab-shaped question — the Ḥanafī 2:1 ʿaṣr shadow —
 * as a switch inside Calculation, and everything else that varies by
 * school hung off its own toggle beside it. A Ḥanafī ʿaṣr plus the Mālikī
 * second times drew a card that disagreed with itself, which the settings
 * screen had to explain in red. Asking for the school instead lets the
 * app answer the questions that follow from it, and stops that
 * combination being reachable by accident.
 *
 * ── WHAT A SCHOOL DECIDES HERE, AND WHAT IT DOES NOT ──────────────────
 *
 * It decides what the times ARE and what they are CALLED: the ʿaṣr
 * shadow, and — under Mālikī — that the farḍ at dawn is Ṣubḥ rather than
 * Fajr, which is the whole of #22.
 *
 * It does NOT turn anything on. The Mālikī second times add rows and fire
 * alerts, and picking a school should not quietly start interrupting
 * somebody; that stays its own toggle, offered under Mālikī. This is the
 * line the whole design rests on: a school changes what is true, not what
 * happens.
 *
 * ── FOUR NAMES, TWO COMPUTED ANSWERS ──────────────────────────────────
 *
 * Shāfiʿī, Mālikī and Ḥanbalī take the same 1:1 shadow, so choosing
 * between them changes nothing the calculator does — except the name at
 * dawn under Mālikī. The picker says so rather than implying four
 * different sets of times: an app that pretends to know more fiqh than it
 * does is worse than one that says what it computes.
 *
 * ── AND NOBODY IS MOVED ───────────────────────────────────────────────
 *
 * `null` is Custom, and it is what every existing install upgrades into:
 * their toggles as they stand, no school claimed, not a minute different.
 * Changing the ʿaṣr shadow by hand afterwards returns to Custom rather
 * than silently leaving a school's name on a combination it does not
 * describe.
 */
import type i18nType from 'i18next';

export type Madhab = 'hanafi' | 'maliki' | 'shafii' | 'hanbali';

/** In the order the picker lists them. */
export const MADHABS: readonly Madhab[] = [
  'hanafi',
  'maliki',
  'shafii',
  'hanbali',
];

/**
 * `school` as the calculator wants it: 1 is the Ḥanafī 2:1 shadow, 0 the
 * 1:1 the rest take.
 */
export function asrSchoolFor(madhab: Madhab): number {
  return madhab === 'hanafi' ? 1 : 0;
}

/**
 * Does the stored school still describe the stored settings?
 *
 * The ʿaṣr toggle stays reachable on its own, so somebody can pick Ḥanafī
 * and then turn the shadow off. Rather than leave "Ḥanafī" showing on a
 * 1:1 shadow, the picker falls back to Custom — the honest label for a
 * combination no school claims.
 */
export function madhabMatches(
  madhab: Madhab | null | undefined,
  school: number,
): boolean {
  if (!madhab) return false;
  return asrSchoolFor(madhab) === school;
}

/** What the picker should show as selected, Custom being `null`. */
export function selectedMadhab(
  madhab: Madhab | null | undefined,
  school: number,
): Madhab | null {
  return madhabMatches(madhab, school) ? (madhab as Madhab) : null;
}

/**
 * The farḍ at dawn — Ṣubḥ under the Mālikī reckoning, Fajr otherwise.
 *
 * ── WHY THIS OVERRIDES A STRING INSTEAD OF ADDING A KEY ───────────────
 *
 * `prayer.Fajr` is used in twenty-nine places: the day's rows, the month
 * table, the Log, the share sheet, notification titles and bodies, both
 * platforms' widgets, the Live Activity, and the settings screens that
 * list prayers. Threading a second key through all of them is twenty-nine
 * chances to miss one, and the one missed is the one somebody screenshots.
 *
 * So the KEY is unchanged and the STRING it resolves to is what moves,
 * which is also the honest statement of the feature: the prayer that key
 * denotes is called Ṣubḥ under this reckoning, and Fajr is the sunnah
 * before it. Every surface follows without knowing anything about madhāhib.
 *
 * Re-applied on a language change as well as a school change: the
 * override lives in one language's resource bundle, and switching
 * language loads the untouched one.
 */
export function applyMadhabNaming(
  i18n: typeof i18nType,
  madhab: Madhab | null | undefined,
  language: string = i18n.language,
): void {
  const lng = language || 'en';
  const ns = 'translation';
  const subh = madhab === 'maliki';
  for (const [key, fallbackKey] of [
    ['prayer.Fajr', 'prayer.Subh'],
    ['prayer.Fajr_abbr', 'prayer.Subh_abbr'],
  ] as const) {
    // The untouched value for this language, read before anything is
    // written over it — `getResource` bypasses the override we may have
    // added on a previous call.
    const original = i18n.getResource(lng, ns, `${key}_original`);
    const shown = i18n.getResource(lng, ns, key);
    if (original === undefined && shown !== undefined) {
      i18n.addResource(lng, ns, `${key}_original`, shown, {
        silent: true,
      } as never);
    }
    const base = i18n.getResource(lng, ns, `${key}_original`) ?? shown;
    const replacement = subh
      ? (i18n.getResource(lng, ns, fallbackKey) ?? base)
      : base;
    if (replacement !== undefined) {
      i18n.addResource(lng, ns, key, replacement, { silent: true } as never);
    }
  }
}
