/**
 * Choosing a school — issues #21 and #22.
 *
 * The app asked one madhab-shaped question, the Ḥanafī ʿaṣr shadow, and
 * hung everything else that varies by school off its own toggle beside
 * it — so a Ḥanafī ʿaṣr and a Mālikī second time could be chosen together
 * and then had to be explained in red.
 *
 * What these pin is the promise that made the change safe to make: NO
 * EXISTING INSTALL MOVES. A school is a thing you go and pick; until you
 * do, the settings you had are the settings you have, to the minute.
 */
import i18n from '../src/i18n';
import {
  applyMadhabNaming,
  asrSchoolFor,
  MADHABS,
  madhabMatches,
  selectedMadhab,
  type Madhab,
} from '../src/prayer/madhab';
import { DEFAULT_SETTINGS } from '../src/settings/types';

describe('nobody is moved by an upgrade', () => {
  it('starts with no school claimed', () => {
    expect(DEFAULT_SETTINGS.madhab).toBeNull();
  });

  it('leaves the shadow exactly as it was', () => {
    // `school` is still the number the calculator is given; `madhab` sets
    // it rather than replacing it. A default that changed this would move
    // ʿaṣr for every existing install on the day they updated.
    expect(DEFAULT_SETTINGS.school).toBe(0);
  });

  it('shows Custom rather than guessing which school someone follows', () => {
    // 1:1 is shared by three schools, so a stored shadow cannot say which
    // one a person follows. Inferring one would put a name they never
    // chose on their settings screen.
    expect(selectedMadhab(null, 0)).toBeNull();
    expect(selectedMadhab(null, 1)).toBeNull();
  });
});

describe('a school sets what it implies, and nothing else', () => {
  it('maps four names onto the two shadows the app computes', () => {
    expect(asrSchoolFor('hanafi')).toBe(1);
    for (const m of ['maliki', 'shafii', 'hanbali'] as Madhab[]) {
      expect(asrSchoolFor(m)).toBe(0);
    }
  });

  it('offers exactly the four', () => {
    expect([...MADHABS].sort()).toEqual(
      ['hanafi', 'hanbali', 'maliki', 'shafii'].sort(),
    );
  });

  it('falls back to Custom when the shadow no longer matches', () => {
    // The shadow switch stays reachable on its own; turning it off under
    // Ḥanafī must not leave "Ḥanafī" showing on a 1:1 shadow.
    expect(madhabMatches('hanafi', 1)).toBe(true);
    expect(madhabMatches('hanafi', 0)).toBe(false);
    expect(selectedMadhab('hanafi', 0)).toBeNull();
    expect(selectedMadhab('maliki', 0)).toBe('maliki');
    expect(selectedMadhab('maliki', 1)).toBeNull();
  });
});

/**
 * #22 — "in maliki the farida is called Subh not Fajr, Fajr is the sunnah
 * before". The key stays `prayer.Fajr`, because it is used in twenty-nine
 * places and threading a second one through all of them is twenty-nine
 * chances to miss the one somebody screenshots. What moves is the string
 * that key resolves to.
 */
describe('the farḍ at dawn is Ṣubḥ under Mālikī', () => {
  const LOCALES = [
    'ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ru', 'sv', 'tr', 'ur', 'zh',
  ];

  afterEach(() => {
    for (const l of LOCALES) applyMadhabNaming(i18n, null, l);
  });

  it('renames it in every one of the thirteen languages', () => {
    for (const l of LOCALES) {
      const subh = i18n.getResource(l, 'translation', 'prayer.Subh');
      expect(typeof subh).toBe('string');
      expect(subh.length).toBeGreaterThan(0);
      // NOT asserting that it differs from Fajr: Indonesian already calls
      // the dawn prayer Subuh, so in that language the two names coincide
      // and the Mālikī setting changes nothing on screen. That is the
      // right answer there, not a missing translation.
      applyMadhabNaming(i18n, 'maliki', l);
      expect(i18n.getResource(l, 'translation', 'prayer.Fajr')).toBe(subh);
    }
  });

  it('puts the name back for every other school, and for Custom', () => {
    for (const m of [null, 'hanafi', 'shafii', 'hanbali'] as (Madhab | null)[]) {
      applyMadhabNaming(i18n, 'maliki', 'en');
      applyMadhabNaming(i18n, m, 'en');
      expect(i18n.getResource('en', 'translation', 'prayer.Fajr')).toBe('Fajr');
    }
  });

  it('does not compound when applied twice', () => {
    // It is re-applied on every language change and every settings change,
    // so the original has to survive being overwritten by itself.
    applyMadhabNaming(i18n, 'maliki', 'en');
    applyMadhabNaming(i18n, 'maliki', 'en');
    applyMadhabNaming(i18n, null, 'en');
    expect(i18n.getResource('en', 'translation', 'prayer.Fajr')).toBe('Fajr');
  });

  it('renames the short form too, which is what the widgets draw', () => {
    applyMadhabNaming(i18n, 'maliki', 'en');
    expect(i18n.getResource('en', 'translation', 'prayer.Fajr_abbr')).toBe(
      i18n.getResource('en', 'translation', 'prayer.Subh_abbr'),
    );
  });
});
