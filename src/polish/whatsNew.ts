/**
 * What changed, per release.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The app had a four-slide feature tour shown once, on the first launch
 * after onboarding — a second welcome, in a second visual idiom,
 * immediately after the first one. And it had no what's-new surface at
 * all: greps for `whatsNew`, `lastSeenVersion` and `releaseNotes` in
 * `src/` returned nothing, and CHANGELOG.md was linked only from the
 * marketing site. Existing users learned what changed by noticing.
 *
 * So the tour's machinery — a paged, RTL-aware, skippable full-screen
 * modal with a persisted flag — was pointed at the problem it actually
 * fits, and this is the content it shows.
 *
 * ── THE RULES THAT KEEP IT HONEST ─────────────────────────────────────
 *
 *  1. **A release with nothing worth a slide gets no entry, and shows
 *     nothing.** That is the default, not a thing somebody remembers to
 *     do: a version absent from the table below produces an empty list.
 *     Four slides by habit is how this becomes the tour again.
 *  2. **One to three slides.** If a release needs four screens of
 *     explanation, the release needs a blog post.
 *  3. **Never on a fresh install.** `lastSeenVersion` absent means the
 *     user has just finished onboarding; handing them release notes for
 *     a version they have never not had is nonsense. See `slidesForUpgrade`.
 */
import type { ComponentType } from 'react';
import { CrescentIcon, MihrabLogoIcon } from '../theme/icons';

export type WhatsNewSlide = {
  key: string;
  Icon: ComponentType<{ size?: number; color: string }>;
  titleKey: string;
  bodyKey: string;
};

/**
 * Keyed by the version the slides belong TO — the version that
 * introduced them. Newest anywhere in the object; order is decided by
 * the comparison below, not by position.
 */
export const WHATS_NEW: Record<string, WhatsNewSlide[]> = {
  '2.18.6': [
    {
      key: 'setup',
      Icon: MihrabLogoIcon,
      titleKey: 'whatsNew.v2186.setupTitle',
      bodyKey: 'whatsNew.v2186.setupBody',
    },
    {
      key: 'alerts',
      Icon: CrescentIcon,
      titleKey: 'whatsNew.v2186.alertsTitle',
      bodyKey: 'whatsNew.v2186.alertsBody',
    },
  ],
};

/**
 * `2.18.5`, `2.18.5-beta`, `2.18` → comparable tuple.
 *
 * The beta channel appends `-beta` to `versionName`, so anything after
 * the numeric part is dropped rather than parsed: a beta of 2.18.6 has
 * seen what 2.18.6 has to say.
 */
function parts(version: string): number[] {
  const numeric = (version.match(/^[0-9.]+/) ?? [''])[0];
  return numeric
    .split('.')
    .map(n => Number.parseInt(n, 10))
    .map(n => (Number.isFinite(n) ? n : 0));
}

/** Negative when `a` is older, 0 when equal, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The last version a build BEFORE this feature could have been.
 *
 * `lastSeenVersion` did not exist until 2.18.6, so on the first launch
 * after that update every existing user has no stored version — which is
 * exactly what a fresh install looks like, and a fresh install is shown
 * nothing. Left there, the release that introduced release notes could
 * never announce itself, and neither could the one after it for anyone
 * who skipped 2.18.6.
 *
 * What an existing install DOES have is the feature tour's flag: written
 * the first time Home appeared after onboarding, by every build since the
 * tour shipped. Its presence means "this phone ran a build before
 * release notes existed", and the honest value for such a phone's last
 * seen version is the last version without them.
 */
export const LEGACY_BASELINE_VERSION = '2.18.5';

/**
 * The version to treat as last seen, from what storage actually holds.
 *
 * `stored` is the value under `mihrab.lastSeenVersion`; `legacyTourSeen`
 * is whether `mihrab.featureTour.v1` was ever written. Pure, so the
 * three cases can be pinned without a storage mock.
 */
export function lastSeenFrom(
  stored: string | null | undefined,
  legacyTourSeen: boolean,
): string | null {
  if (stored) return stored;
  return legacyTourSeen ? LEGACY_BASELINE_VERSION : null;
}

/**
 * The slides to show someone who last ran `from` and is now on `to`.
 *
 * Everything newer than `from` and no newer than `to`, oldest first — so
 * a user who skipped three releases is told about all three rather than
 * only the last. `from` of `null` (a fresh install) returns nothing.
 */
export function slidesForUpgrade(
  from: string | null | undefined,
  to: string,
): WhatsNewSlide[] {
  if (!from) return [];
  if (compareVersions(from, to) >= 0) return [];
  return Object.keys(WHATS_NEW)
    .filter(
      v => compareVersions(v, from) > 0 && compareVersions(v, to) <= 0,
    )
    .sort(compareVersions)
    .flatMap(v => WHATS_NEW[v]);
}
