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

  test('PrayerOffsetsModal exists and is imported by SettingsScreen', () => {
    expect(
      fs.existsSync(path.join(REPO, 'src/screens/settings/PrayerOffsetsModal.tsx')),
    ).toBe(true);
    const settings = fs.readFileSync(
      path.join(REPO, 'src/screens/SettingsScreen.tsx'),
      'utf-8',
    );
    expect(settings).toMatch(/PrayerOffsetsModal/);
  });

  test('QuickActionsGrid surfaces the Fasting tile', () => {
    const grid = fs.readFileSync(
      path.join(REPO, 'src/screens/home/QuickActionsGrid.tsx'),
      'utf-8',
    );
    expect(grid).toMatch(/'Fasting'/);
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
    expect(plist).toMatch(/ScheherazadeNew-Regular\.ttf/);
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
