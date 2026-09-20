/**
 * CHOOSING A MUṢḤAF FROM SETTINGS.
 *
 * The choice used to live in one place: the muṣḥaf's own header chip —
 * and that chip only appears once a SECOND tradition is already on the
 * device (`riwayahChoiceExists`). So a reader who had never downloaded
 * one had no way to learn from the app that there was anything to
 * choose, and no way to manage what was installed except through
 * Settings → About → Manage downloads.
 *
 * These pin the second entry point, and the two things it must not get
 * wrong: the one-time reflow notice, and the availability cache that no
 * settings screen was filling.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const card = read('src', 'screens', 'settings', 'QuranCard.tsx');
const reader = read('src', 'screens', 'quran', 'MushafSurahScreen.tsx');
const shared = read('src', 'quran', 'useSwitchRiwayah.ts');
const en = JSON.parse(read('src', 'i18n', 'locales', 'en.json'));

describe('the settings rows', () => {
  it('names the tradition in hand and opens the picker', () => {
    expect(card).toContain('settings-riwayah-row');
    expect(card).toContain('quran.riwayahSettingsTitle');
    expect(card).toMatch(/value=\{t\(riwayahById\(riwayah\)\.nameKey/);
    expect(card).toContain('<RiwayahPicker');
  });

  it('and offers the way to add and remove them', () => {
    expect(card).toContain('settings-riwayah-manage');
    expect(card).toMatch(/riwayahManage[\s\S]{0,400}navigate\('QuranDownloads'\)/);
    // A tradition that is not installed must not be a dead row in the
    // picker either: that is what `onManage` is for.
    expect(card).toMatch(/onManage=\{[\s\S]{0,160}navigate\('QuranDownloads'\)/);
  });

  it('is shown whether or not a second tradition is installed', () => {
    // The header chip is guarded by `riwayahChoiceExists`, and that guard
    // is exactly what hid the feature from everyone who had not already
    // found it. Settings does not repeat it.
    expect(card).not.toContain('riwayahChoiceExists');
  });

  it('hydrates the availability cache, which no settings screen did', () => {
    // `riwayahAvailable` reads an in-memory cache filled by
    // `hydrateRiwayahData`. Without this the count would read 1 on a
    // device with three traditions installed.
    expect(card).toContain('hydrateRiwayahData()');
    expect(card).toContain('useRiwayahAvailability()');
  });
});

describe('the switch itself is shared, not copied', () => {
  it('lives in one module, with the notice inside it', () => {
    expect(shared).toContain('riwayahNoticeSeen');
    expect(shared).toContain('quran.riwayahReflowTitle');
    // Written before the alert: an alert is not proof anybody read it.
    expect(shared).toMatch(
      /setQuranPrefs\(\{ riwayahNoticeSeen: true \}\);[\s\S]{0,120}Alert\.alert/,
    );
  });

  it('and both entry points call it', () => {
    expect(card).toContain('useSwitchRiwayah()');
    expect(reader).toContain('useSwitchRiwayah()');
    // The reader's own copy is gone — two copies is how the notice ends
    // up firing in the reader about a muṣḥaf chosen in Settings a week
    // earlier.
    expect(reader).not.toContain('quran.riwayahReflowBody');
  });
});

describe('the strings, in every language', () => {
  const KEYS = ['riwayahSettingsTitle', 'riwayahSettingsHelp', 'riwayahManage', 'riwayahOnDevice'];
  const locales = ['en', 'ar', 'sv', 'de', 'es', 'fr', 'hi', 'bn', 'id', 'ru', 'tr', 'ur', 'zh'];

  it.each(locales)('%s has them, translated', loc => {
    const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
    for (const key of KEYS) {
      expect(json.quran[key]).toBeTruthy();
      if (loc !== 'en') expect(json.quran[key]).not.toBe(en.quran[key]);
    }
    expect(json.quran.riwayahOnDevice).toContain('{{count}}');
  });
});
