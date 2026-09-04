/**
 * Tests for tasks #50, #51, #52, #53, #57 — verify the follow-up screens
 * and modules are registered and the new keys land in every locale.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..');

describe('follow-up screen registration', () => {
  test('RootNavigator registers Onboarding, Backup, Fasting screens', () => {
    const navSrc = fs.readFileSync(
      path.join(REPO, 'src/navigation/RootNavigator.tsx'),
      'utf-8',
    );
    expect(navSrc).toMatch(/name="Onboarding"/);
    expect(navSrc).toMatch(/name="Backup"/);
    expect(navSrc).toMatch(/name="Fasting"/);
  });

  test('navigation types include the new routes', () => {
    const types = fs.readFileSync(
      path.join(REPO, 'src/navigation/types.ts'),
      'utf-8',
    );
    expect(types).toMatch(/Onboarding: undefined/);
    expect(types).toMatch(/Backup: undefined/);
    expect(types).toMatch(/Fasting: undefined/);
  });

  test('OnboardingScreen, BackupScreen, FastingScreen exist', () => {
    expect(fs.existsSync(path.join(REPO, 'src/screens/OnboardingScreen.tsx')))
      .toBe(true);
    expect(fs.existsSync(path.join(REPO, 'src/screens/BackupScreen.tsx')))
      .toBe(true);
    expect(fs.existsSync(path.join(REPO, 'src/screens/FastingScreen.tsx')))
      .toBe(true);
  });

  test('PrayerOffsetsModal exists and the page that opens it owns it', () => {
    expect(
      fs.existsSync(path.join(REPO, 'src/screens/settings/PrayerOffsetsModal.tsx')),
    ).toBe(true);
    // It moved with its card when Settings became an index of sections
    // (v2.14.5): the page that renders CalculationCard is the page that
    // has to hold the modal that card opens. SettingsScreen is a list of
    // destinations now and owns no picker state at all.
    const page = fs.readFileSync(
      path.join(REPO, 'src/screens/settings/pages/PrayerTimesSettingsScreen.tsx'),
      'utf-8',
    );
    expect(page).toMatch(/PrayerOffsetsModal/);
  });

  test("Home's Today summary reads the practice store", () => {
    // The tool tiles (with their Fasting entry) were replaced by a summary
    // that reports the day rather than routing away from it — design
    // review 2a. What must hold is that the summary is driven by recorded
    // practice, not by a hardcoded list of destinations.
    const summary = fs.readFileSync(
      path.join(REPO, 'src/screens/home/TodaySummary.tsx'),
      'utf-8',
    );
    expect(summary).toMatch(/usePracticeToday/);
  });
});

describe('locale parity for new feature keys', () => {
  const localeFiles = [
    'en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh',
  ];
  test.each(localeFiles)('%s locale has the new keys', locale => {
    const data = JSON.parse(
      fs.readFileSync(
        path.join(REPO, `src/i18n/locales/${locale}.json`),
        'utf-8',
      ),
    );
    expect(data.nav.backup).toBeTruthy();
    expect(data.nav.fasting).toBeTruthy();
    expect(data.backup).toBeTruthy();
    expect(data.fasting).toBeTruthy();
    expect(data.onboarding).toBeTruthy();
    expect(data.onboarding.welcome).toBeTruthy();
    expect(data.onboarding.notifications).toBeTruthy();
    expect(data.settings.prayerOffsets).toBeTruthy();
  });
});

describe('font scaffolding', () => {
  test('iOS Info.plist declares UIAppFonts', () => {
    const plist = fs.readFileSync(
      path.join(REPO, 'ios/PrayerApp/Info.plist'),
      'utf-8',
    );
    expect(plist).toMatch(/UIAppFonts/);
    expect(plist).toMatch(/Amiri-Regular\.ttf/);
    expect(plist).toMatch(/AmiriQuran\.ttf/);
    // Scheherazade was never bundled — the stale scaffolding note was
    // removed in v2.7.28 along with its attribution row.
    expect(plist).not.toMatch(/Scheherazade/);
  });

  test('Android fonts assets directory has README', () => {
    expect(
      fs.existsSync(
        path.join(REPO, 'android/app/src/main/assets/fonts/README.md'),
      ),
    ).toBe(true);
  });
});

describe('content expansion', () => {
  test('Dua collection covers nineteen categories with at least 60 entries', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/duas/duas');
    expect(mod.DUA_CATEGORIES).toEqual(
      expect.arrayContaining([
        // Original ten categories.
        'morning', 'evening', 'afterPrayer', 'food', 'distress',
        'sleep', 'travel', 'mosque', 'gratitude', 'forgiveness',
        // Task #70 expansion.
        'weather', 'family', 'sickness', 'funeral', 'eid',
        'beforeQuran', 'knowledge', 'protection', 'guidance',
      ]),
    );
    expect(mod.DUAS.length).toBeGreaterThanOrEqual(60);
    // Every dua must carry a non-empty source field — religious content
    // attribution is non-negotiable.
    for (const d of mod.DUAS) {
      expect(typeof d.source).toBe('string');
      expect(d.source.length).toBeGreaterThan(0);
    }
  });

  test('docs/data-sources.md exists', () => {
    expect(fs.existsSync(path.join(REPO, 'docs/data-sources.md'))).toBe(true);
  });
});
