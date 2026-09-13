/**
 * Which releases to show a reader, and in which language.
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────
 *
 * `whatsNew.ts` held a hand-written table of one-to-three slides per
 * release and a rule that a release with no slides showed nothing. Two
 * releases ever got slides, so "nothing" was the answer for fifty-six of
 * them, and the surface could only ever be as complete as somebody's
 * memory on release day.
 *
 * The notes the stores get are written for every release without fail —
 * `release.sh` will not cut a tag without them — so they are the table
 * now, joined to version names and dates in `releaseNotes.generated.ts`.
 * What is left here is the part that is still a decision: which of those
 * releases this particular reader has not seen, and which language to
 * read them in.
 *
 * ── THE RULES ─────────────────────────────────────────────────────────
 *
 *  1. **Never on a fresh install.** `lastSeenVersion` absent means the
 *     user has just been through setup; release notes for a version they
 *     have never not had are nonsense.
 *  2. **Everything since, not just the last one.** Someone who skipped
 *     three releases is told about all three, newest first.
 *  3. **A release with no note shows nothing** — and cannot happen for a
 *     tagged release, but can for a build made between releases.
 *  4. **The whole history is always there**, under whatever is new, and
 *     from Settings when nothing is new at all.
 */
import { RELEASE_NOTES, type ReleaseNote } from './releaseNotes.generated';

export type { ReleaseNote };

/** Every release with notes, newest first. Already sorted by the generator. */
export const CHANGELOG: readonly ReleaseNote[] = RELEASE_NOTES;

/** The language every note exists in, and the fallback for the other ten. */
export const BASE_LANGUAGE = 'en';

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
 * The releases someone who last ran `from` has not been told about.
 *
 * Newest first, capped at `to` so a beta tester on 2.19.0-beta is not
 * shown notes for a 2.19.1 that only exists in the table because the
 * build they are running was made after it was written.
 *
 * `from` of `null` — a fresh install — returns nothing, which is rule 1.
 */
export function unseenReleases(
  from: string | null | undefined,
  to: string,
): ReleaseNote[] {
  if (!from) return [];
  if (compareVersions(from, to) >= 0) return [];
  return CHANGELOG.filter(
    r => compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0,
  );
}

/**
 * Whether a release is one of the ones this reader has not seen.
 *
 * Taken as a set of version strings rather than re-comparing per row:
 * the sheet asks this once per release and there are fifty-eight of them.
 */
export function unseenVersionSet(
  from: string | null | undefined,
  to: string,
): Set<string> {
  return new Set(unseenReleases(from, to).map(r => r.version));
}

/**
 * The note to show, and the language it is actually in.
 *
 * Ten of the app's thirteen languages have no translated notes, and the
 * honest answer for those is the English one rather than nothing — but
 * the caller has to know, because an English paragraph laid out by an
 * Arabic reader's right-to-left rules is unreadable in a different way.
 * Hence the pair: `text` to draw, `language` to draw it by.
 */
export function noteFor(
  release: ReleaseNote,
  language: string | null | undefined,
): { text: string; language: string } {
  // 'en-US', 'zh-Hans', 'sv' → 'en', 'zh', 'sv'. i18next hands back
  // whatever the device reported, which is not always the bare code.
  const base = (language ?? '').split(/[-_]/)[0].toLowerCase();
  const text = base ? release.notes[base] : undefined;
  if (text) return { text, language: base };
  return {
    text: release.notes[BASE_LANGUAGE] ?? '',
    language: BASE_LANGUAGE,
  };
}
