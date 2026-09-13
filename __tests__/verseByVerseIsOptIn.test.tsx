/**
 * The muṣḥaf is the reader; the verse-by-verse list is a setting.
 *
 * Opening a surah has landed on the muṣḥaf since v2.7.27, but the other
 * reader was always one tap away in the header — so the app still
 * shipped two answers to "what does the Qur'an look like" and asked
 * everybody to pick. It is one answer now, and
 * `settings.quranVerseByVerseEnabled` (Settings → Quran) is how somebody
 * asks for the second.
 *
 * Two things have to hold, and they pull in opposite directions.
 *
 * The muṣḥaf must win by DERIVING, never by writing: if turning the
 * setting off rewrote `quranReadingMode` to 'mushaf', the reader someone
 * had been using would be forgotten the moment they looked away, and
 * turning the setting back on would drop them somewhere they did not
 * leave. So the pref is read past, not overwritten.
 *
 * And nobody who was actually USING the list should lose it to an
 * update. That is the migration, and its condition is narrower than it
 * looks — see the storage tests at the bottom.
 */
import * as React from 'react';
import { act } from 'react';
import { create } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';

import AsyncStorage from '@react-native-async-storage/async-storage';

type ReaderProps = Record<string, unknown>;

const mockMushafProps: ReaderProps[] = [];
const mockListProps: ReaderProps[] = [];
const mockUpdateSettings = jest.fn();
let mockSettings: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useRoute: () => ({ params: { surahNumber: 2 }, key: 'QuranSurah-test' }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: { bg: '#fff', muted: '#666' },
  }),
}));

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
  }),
}));

// Neither reader is under test, and each drags in the page renderer, the
// font store and the audio sheet. They stand in as prop recorders: which
// one was chosen, and what it was handed.
jest.mock('../src/screens/quran/MushafSurahScreen', () => ({
  MushafSurahScreen: (props: ReaderProps) => {
    mockMushafProps.push(props);
    return null;
  },
}));
jest.mock('../src/screens/quran/TranslationSurahScreen', () => ({
  TranslationSurahScreen: (props: ReaderProps) => {
    mockListProps.push(props);
    return null;
  },
}));
jest.mock('../src/quran/riwayahData', () => ({
  hydrateRiwayahData: jest.fn(async () => {}),
}));
jest.mock('../src/navigation/useAndroidSubScreenBack', () => ({
  useAndroidSubScreenBack: () => {},
}));

import { QuranSurahScreen } from '../src/screens/QuranSurahScreen';
import { activeReaderMode } from '../src/quran/readerMode';
import { loadSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';

function render() {
  act(() => {
    create(<QuranSurahScreen />);
  });
}

beforeEach(() => {
  mockMushafProps.length = 0;
  mockListProps.length = 0;
  mockUpdateSettings.mockClear();
});

describe('with the verse-by-verse reader switched off', () => {
  it('opens the muṣḥaf even though the pref still says otherwise', () => {
    // The state an update leaves behind for somebody the migration below
    // decided not to grandfather: the old pref is still sitting there
    // saying 'withTranslation', and it must not be obeyed.
    mockSettings = {
      quranVerseByVerseEnabled: false,
      quranReadingMode: 'withTranslation',
    };
    render();
    expect(mockMushafProps).toHaveLength(1);
    expect(mockListProps).toHaveLength(0);
  });

  it('leaves the pref alone rather than correcting it', () => {
    // The temptation is to write 'mushaf' here and be done. It would cost
    // the reader their place: switch the setting back on a month later
    // and they land in the muṣḥaf, not where they left off.
    mockSettings = {
      quranVerseByVerseEnabled: false,
      quranReadingMode: 'withTranslation',
    };
    render();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('hands the muṣḥaf no way to switch', () => {
    // Undefined, not a no-op function: the header draws the control only
    // when the prop is there, so this is what makes it disappear.
    mockSettings = {
      quranVerseByVerseEnabled: false,
      quranReadingMode: 'mushaf',
    };
    render();
    expect(mockMushafProps[0].onToggleMode).toBeUndefined();
  });
});

describe('with it switched on', () => {
  it('obeys the remembered reader', () => {
    mockSettings = {
      quranVerseByVerseEnabled: true,
      quranReadingMode: 'withTranslation',
    };
    render();
    expect(mockListProps).toHaveLength(1);
    expect(mockMushafProps).toHaveLength(0);
  });

  it('still opens the muṣḥaf when that is the remembered one', () => {
    mockSettings = {
      quranVerseByVerseEnabled: true,
      quranReadingMode: 'mushaf',
    };
    render();
    expect(mockMushafProps).toHaveLength(1);
    expect(typeof mockMushafProps[0].onToggleMode).toBe('function');
  });

  it('gives the list reader a way back regardless', () => {
    // The muṣḥaf's control is conditional; this one never is. A reader
    // that could be entered and not left would be a trap.
    mockSettings = {
      quranVerseByVerseEnabled: true,
      quranReadingMode: 'withTranslation',
    };
    render();
    expect(typeof mockListProps[0].onToggleMode).toBe('function');
  });
});

describe('the muṣḥaf header', () => {
  // A source assertion, deliberately: the header is built inside a
  // `navigation.setOptions` effect that wants a real navigator above it,
  // and what is worth holding here is small and structural — the control
  // is INSIDE the guard rather than beside it.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src/screens/quran/MushafSurahScreen.tsx'),
    'utf8',
  );

  it('draws the switch only when there is one to draw', () => {
    const icon = source.indexOf('<TranslationIcon');
    const guard = source.indexOf('{onToggleMode ? (');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(icon);
    expect(source.slice(guard, icon)).toContain('onPress={onToggleMode}');
  });

  it('has only the one', () => {
    // Two would mean a second, unguarded entry point into a reader that
    // is supposed to be off.
    expect(source.match(/<TranslationIcon/g)).toHaveLength(1);
  });
});

describe('what gets written down about a reading position', () => {
  // `AyahActionSheet` is open in BOTH readers, so it asks which one it is
  // in before recording a position. It used to ask `quranReadingMode`
  // directly, which stops being the same question the moment the list is
  // switched off: a muṣḥaf reader carrying an old 'withTranslation' pref
  // would file muṣḥaf positions under the other reader, and `lastRead.mode`
  // is what the home card and the daily-ayah notification route on.
  it('is the reader on screen, not the one remembered', () => {
    expect(
      activeReaderMode({
        quranVerseByVerseEnabled: false,
        quranReadingMode: 'withTranslation',
      }),
    ).toBe('mushaf');
  });

  it('is the remembered one while there are two readers', () => {
    expect(
      activeReaderMode({
        quranVerseByVerseEnabled: true,
        quranReadingMode: 'withTranslation',
      }),
    ).toBe('withTranslation');
    expect(
      activeReaderMode({
        quranVerseByVerseEnabled: true,
        quranReadingMode: 'mushaf',
      }),
    ).toBe('mushaf');
  });

  it('is the only derivation of it in the app', () => {
    // Two copies of this rule is how the sheet and the screen come to
    // disagree about which reader somebody is in.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src/quran/mushaf/AyahActionSheet.tsx'),
      'utf8',
    );
    expect(src).toContain('activeReaderMode(settings)');
    expect(src).not.toContain("settings.quranReadingMode === 'mushaf'");
  });
});

// ── the update ──────────────────────────────────────────────────────────

const KEY = 'prayerapp.settings.v1';

/**
 * A blob as the build before this one wrote it: everything current except
 * the new key, which is what the migration keys on. `delete` rather than
 * `undefined`, so the absence survives any change of serializer.
 */
function blobWithoutTheKey(mode: 'withTranslation' | 'mushaf') {
  const blob: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    quranModeMushafDefault: true,
    quranReadingMode: mode,
  };
  delete blob.quranVerseByVerseEnabled;
  return blob;
}

describe('updating into a build where the list is opt-in', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps it for somebody who had chosen it', async () => {
    // `quranModeMushafDefault` present means this install has already
    // seen the muṣḥaf become the default, so a stored 'withTranslation'
    // is a toggle somebody pressed. They keep both readers and the
    // update is invisible to them.
    await AsyncStorage.setItem(KEY, JSON.stringify(blobWithoutTheKey('withTranslation')));
    const loaded = await loadSettings();
    expect(loaded.quranVerseByVerseEnabled).toBe(true);
    // And their reader is still the one they left.
    expect(loaded.quranReadingMode).toBe('withTranslation');
  });

  it('does not switch it on for the muṣḥaf readers', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(blobWithoutTheKey('mushaf')));
    const loaded = await loadSettings();
    expect(loaded.quranVerseByVerseEnabled).toBe(false);
  });

  it('does not mistake the OLD default for a choice', async () => {
    // THE ONE THAT MATTERS. Before v2.7.27 every install carried
    // 'withTranslation' because that was the default, not because anyone
    // picked it — which is exactly why the migration above it exists. A
    // blob with no `quranModeMushafDefault` is one of those, and
    // grandfathering on the value alone would switch this on for a large
    // number of people who have never seen the reader it refers to.
    const old: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete old.quranModeMushafDefault;
    delete old.quranVerseByVerseEnabled;
    old.quranReadingMode = 'withTranslation';
    await AsyncStorage.setItem(KEY, JSON.stringify(old));

    const loaded = await loadSettings();
    expect(loaded.quranVerseByVerseEnabled).toBe(false);
    // The v2.7.27 migration still runs and still wins.
    expect(loaded.quranReadingMode).toBe('mushaf');
  });

  it('never reconsiders once the key is written', async () => {
    // Somebody who was grandfathered in and then switched it off. The key
    // is present, so the migration must not look at their reading mode
    // and hand it back.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        quranModeMushafDefault: true,
        quranReadingMode: 'withTranslation',
        quranVerseByVerseEnabled: false,
      }),
    );
    const loaded = await loadSettings();
    expect(loaded.quranVerseByVerseEnabled).toBe(false);
  });

  it('starts a fresh install with one reader', async () => {
    // No blob at all — loadSettings returns DEFAULT_SETTINGS without ever
    // reaching the migrations.
    const loaded = await loadSettings();
    expect(loaded.quranVerseByVerseEnabled).toBe(false);
  });
});
