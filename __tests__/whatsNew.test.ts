/**
 * What's new — when it appears, and the two cases where it must not.
 *
 * The surface it replaced was a four-slide feature tour shown once per
 * install, behind a flag that held `'1'` and was never compared against
 * anything. Making it version-aware is the whole point, so the
 * comparison is what gets pinned — including the case that has no UI at
 * all and is therefore the easiest to get wrong: a FRESH INSTALL, which
 * has just been walked through onboarding and must not then be handed
 * release notes for a version it has never not had.
 */
import {
  compareVersions,
  slidesForUpgrade,
  WHATS_NEW,
} from '../src/polish/whatsNew';

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

describe('what to show on launch', () => {
  it('shows nothing on a fresh install', () => {
    // No stored version. They have just finished onboarding.
    expect(slidesForUpgrade(null, '2.18.6')).toEqual([]);
    expect(slidesForUpgrade(undefined, '2.18.6')).toEqual([]);
    expect(slidesForUpgrade('', '2.18.6')).toEqual([]);
  });

  it('shows the slides for a version the user has not seen', () => {
    expect(slidesForUpgrade('2.18.5', '2.18.6').length).toBeGreaterThan(0);
  });

  it('shows nothing when the stored version is current or newer', () => {
    expect(slidesForUpgrade('2.18.6', '2.18.6')).toEqual([]);
    expect(slidesForUpgrade('2.19.0', '2.18.6')).toEqual([]);
  });

  it('shows nothing for a release that declared no slides', () => {
    // The default, deliberately: a release with nothing worth a slide
    // gets no entry and interrupts nobody. Four slides by habit is how
    // this becomes the feature tour again.
    expect(slidesForUpgrade('2.18.6', '2.18.7')).toEqual([]);
  });

  it('catches a user up across several releases, oldest first', () => {
    const versions = Object.keys(WHATS_NEW).sort(compareVersions);
    const all = slidesForUpgrade('0.0.1', versions[versions.length - 1]);
    expect(all.length).toBeGreaterThanOrEqual(
      WHATS_NEW[versions[0]]?.length ?? 0,
    );
  });
});

describe('the slide table', () => {
  it('never runs longer than three slides for one release', () => {
    // If a release needs four screens of explanation it needs a blog
    // post. This is the rule that stops the what's-new screen drifting
    // back into being a product tour.
    for (const [version, slides] of Object.entries(WHATS_NEW)) {
      expect({ version, length: slides.length }).toEqual({
        version,
        length: Math.min(slides.length, 3),
      });
      expect(slides.length).toBeGreaterThan(0);
    }
  });

  it('names keys that exist in en.json', () => {
    const en = require('../src/i18n/locales/en.json') as Record<
      string,
      unknown
    >;
    const at = (path: string): unknown =>
      path.split('.').reduce<unknown>(
        (cur, part) =>
          cur && typeof cur === 'object'
            ? (cur as Record<string, unknown>)[part]
            : undefined,
        en,
      );
    for (const slides of Object.values(WHATS_NEW)) {
      for (const slide of slides) {
        expect(typeof at(slide.titleKey)).toBe('string');
        expect(typeof at(slide.bodyKey)).toBe('string');
      }
    }
  });
});
