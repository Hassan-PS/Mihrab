/**
 * The changelog — when it appears, what it says, and in whose language.
 *
 * Two of these tests exist because of cases with no UI at all, which are
 * therefore the easiest to get wrong:
 *
 *   • a FRESH INSTALL, which has just been walked through onboarding and
 *     must not then be handed release notes for a version it has never
 *     not had;
 *   • an install from BEFORE `mihrab.lastSeenVersion` existed, which
 *     looks exactly like a fresh one and must not be mistaken for it, or
 *     the release that introduced this surface can never announce it.
 *
 * The rest pin the table itself. It is generated, so nobody reviews it
 * line by line; a generator that quietly dropped Arabic, or emitted the
 * releases in the wrong order, would ship a plausible-looking file.
 */
import { existsSync, readFileSync } from 'fs';
import {
  BASE_LANGUAGE,
  CHANGELOG,
  compareVersions,
  lastSeenFrom,
  LEGACY_BASELINE_VERSION,
  noteFor,
  unseenReleases,
  unseenVersionSet,
} from '../src/polish/releaseNotes';
const { generate, OUT } = require('../scripts/build-release-notes.js');

const NEWEST = CHANGELOG[0];
const OLDEST = CHANGELOG[CHANGELOG.length - 1];

describe('the generated table', () => {
  it('matches what is checked in — run `npm run build-release-notes`', () => {
    // The join it does needs git tags, and neither Metro nor an F-Droid
    // builder has those. So the file is committed, and this is what stops
    // it drifting from the notes it was built out of.
    const current: string = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    expect(current).toBe(generate());
  });

  it('covers every release the stores were given notes for', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(58);
  });

  it('runs newest first, with no two releases claiming one version', () => {
    const versions = CHANGELOG.map(r => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < CHANGELOG.length; i += 1) {
      expect(CHANGELOG[i - 1].code).toBeGreaterThan(CHANGELOG[i].code);
      // Codes and names must agree about which way time runs — they are
      // joined through git, and a mismatch means the join picked the
      // wrong tag for a code.
      expect(
        compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('always has an English note, because everything falls back to it', () => {
    for (const r of CHANGELOG) {
      expect(typeof r.notes[BASE_LANGUAGE]).toBe('string');
      expect(r.notes[BASE_LANGUAGE].length).toBeGreaterThan(0);
    }
  });

  it('carries the translations that exist rather than dropping them', () => {
    // Arabic and Swedish are written for every release alongside the
    // English one. If the generator ever stops finding them the sheet
    // silently turns English for two of the app's languages, and nothing
    // else in the suite would notice.
    const translated = CHANGELOG.filter(r => r.notes.ar && r.notes.sv);
    expect(translated.length).toBe(CHANGELOG.length);
  });

  it('dates a release with an ISO date or with nothing', () => {
    for (const r of CHANGELOG) {
      if (r.date === null) continue;
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${r.date}T00:00:00`))).toBe(false);
    }
  });
});

describe('what counts as the last seen version', () => {
  it('is the stored one when there is one', () => {
    expect(lastSeenFrom('2.18.6', true)).toBe('2.18.6');
    expect(lastSeenFrom('2.18.6', false)).toBe('2.18.6');
  });

  it('is nothing on a fresh install', () => {
    // No stamp and no tour flag: this phone has never run the app before.
    expect(lastSeenFrom(null, false)).toBeNull();
    expect(lastSeenFrom('', false)).toBeNull();
    expect(lastSeenFrom(undefined, false)).toBeNull();
  });

  it('is the legacy baseline for an install that predates the stamp', () => {
    // THE CASE THAT MATTERS ON RELEASE DAY. `lastSeenVersion` did not
    // exist before 2.18.6, so every existing user updates into "no stored
    // version" — indistinguishable from a fresh install, which is shown
    // nothing. The feature tour's flag is what such an install has, and
    // it means "ran a build before release notes existed".
    expect(lastSeenFrom(null, true)).toBe(LEGACY_BASELINE_VERSION);
  });

  it('names a release the table actually knows about', () => {
    // A baseline no release matches cannot be compared against
    // meaningfully — and one that drifted PAST the newest release would
    // silently hide the notes of every release before it.
    expect(CHANGELOG.some(r => r.version === LEGACY_BASELINE_VERSION)).toBe(
      true,
    );
    expect(
      compareVersions(LEGACY_BASELINE_VERSION, NEWEST.version),
    ).toBeLessThanOrEqual(0);
  });

  it('so the release after it announces itself to an upgrader', () => {
    const from = lastSeenFrom(null, true);
    const next = `${LEGACY_BASELINE_VERSION}.1`;
    // Simulated rather than read off the table: the release that ships
    // this feature is by definition not in the table yet when it is
    // written, and a test that waited for it would pass for the wrong
    // reason today and never be looked at again.
    expect(unseenReleases(from, next)).toEqual(
      CHANGELOG.filter(
        r =>
          compareVersions(r.version, LEGACY_BASELINE_VERSION) > 0 &&
          compareVersions(r.version, next) <= 0,
      ),
    );
    // …and a fresh install still sees nothing, whatever the version.
    expect(unseenReleases(lastSeenFrom(null, false), next)).toEqual([]);
  });
});

describe('version comparison', () => {
  it('orders by numeric part', () => {
    expect(compareVersions('2.18.5', '2.18.6')).toBeLessThan(0);
    expect(compareVersions('2.18.6', '2.18.5')).toBeGreaterThan(0);
    expect(compareVersions('2.18.6', '2.18.6')).toBe(0);
    expect(compareVersions('2.9.0', '2.18.0')).toBeLessThan(0);
  });

  it('ignores a channel suffix', () => {
    // The beta channel appends `-beta` to versionName. A beta of a
    // release has seen what that release has to say.
    expect(compareVersions('2.18.6-beta', '2.18.6')).toBe(0);
  });

  it('treats a missing segment as zero', () => {
    expect(compareVersions('2.18', '2.18.0')).toBe(0);
    expect(compareVersions('2.18', '2.18.1')).toBeLessThan(0);
  });
});

describe('what is marked new', () => {
  it('is nothing on a fresh install', () => {
    expect(unseenReleases(null, NEWEST.version)).toEqual([]);
    expect(unseenReleases(undefined, NEWEST.version)).toEqual([]);
    expect(unseenReleases('', NEWEST.version)).toEqual([]);
  });

  it('is nothing when the stored version is current or newer', () => {
    expect(unseenReleases(NEWEST.version, NEWEST.version)).toEqual([]);
    expect(unseenReleases('9.9.9', NEWEST.version)).toEqual([]);
  });

  it('catches a reader up across several releases, newest first', () => {
    const all = unseenReleases(OLDEST.version, NEWEST.version);
    expect(all.length).toBe(CHANGELOG.length - 1);
    expect(all[0].version).toBe(NEWEST.version);
    expect(all).not.toContainEqual(OLDEST);
  });

  it('never reaches past the version actually installed', () => {
    // The table is committed ahead of the tag — release.sh writes the
    // notes, then rebuilds this file, then tags — so a build made in
    // between would otherwise announce a version that is not on the
    // phone.
    const middle = CHANGELOG[3];
    const shown = unseenReleases(OLDEST.version, middle.version);
    for (const r of shown) {
      expect(compareVersions(r.version, middle.version)).toBeLessThanOrEqual(0);
    }
    expect(shown[0].version).toBe(middle.version);
  });

  it('answers as a set for the row that asks fifty-eight times', () => {
    const set = unseenVersionSet(CHANGELOG[2].version, NEWEST.version);
    expect(set.has(NEWEST.version)).toBe(true);
    expect(set.has(CHANGELOG[2].version)).toBe(false);
    expect(set.size).toBe(2);
  });
});

describe('which language a note is read in', () => {
  const release = CHANGELOG.find(r => r.notes.ar && r.notes.sv)!;

  it('uses the reader’s own when it exists', () => {
    expect(noteFor(release, 'sv')).toEqual({
      text: release.notes.sv,
      language: 'sv',
    });
    expect(noteFor(release, 'ar').language).toBe('ar');
  });

  it('takes the bare code out of a regional one', () => {
    // i18next hands back whatever the device reported, which is not
    // always the two-letter code the notes are filed under.
    expect(noteFor(release, 'en-US').language).toBe('en');
    expect(noteFor(release, 'sv_SE').language).toBe('sv');
  });

  it('falls back to English, and says that it did', () => {
    // Ten of the thirteen languages have no translated notes. The pair
    // matters: the sheet lays the text out by the language it is IN, not
    // the language the reader chose, or an English paragraph inside an
    // Arabic layout comes out with its full stop on the wrong side.
    const fallback = noteFor(release, 'de');
    expect(fallback.language).toBe('en');
    expect(fallback.text).toBe(release.notes.en);
  });

  it('falls back for nonsense rather than throwing', () => {
    expect(noteFor(release, undefined).language).toBe('en');
    expect(noteFor(release, '').language).toBe('en');
    expect(noteFor(release, 'zz-ZZ').text).toBe(release.notes.en);
  });
});
