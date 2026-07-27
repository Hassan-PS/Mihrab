/**
 * Companion-mode migration (v2.7.40) — the app-wide translation⇄tafsir
 * preference seeds from the legacy votd-only toggle so an existing "tafsir"
 * choice on the verse-of-the-day card carries over.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetQuranStateForTests,
  getQuranState,
  hydrateQuranState,
} from '../src/quran/quranState';

const STORAGE_KEY = 'mihrab.quran.v1';

describe('quranState companionMode migration', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    (AsyncStorage.getItem as jest.Mock).mockReset();
  });

  it('seeds companionMode from legacy votdMode when absent', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) =>
      k === STORAGE_KEY
        ? JSON.stringify({
            version: 1,
            prefs: { votdMode: 'tafsir', tafsirEditionId: 'ar-tafsir-muyassar' },
          })
        : null,
    );
    await hydrateQuranState();
    const prefs = getQuranState().prefs;
    expect(prefs.companionMode).toBe('tafsir');
    expect(prefs.tafsirEditionId).toBe('ar-tafsir-muyassar');
  });

  it('honours an explicit companionMode over votdMode', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (k: string) =>
      k === STORAGE_KEY
        ? JSON.stringify({
            version: 1,
            prefs: { votdMode: 'tafsir', companionMode: 'translation' },
          })
        : null,
    );
    await hydrateQuranState();
    expect(getQuranState().prefs.companionMode).toBe('translation');
  });

  it('defaults to translation on fresh installs', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => null);
    await hydrateQuranState();
    expect(getQuranState().prefs.companionMode).toBe('translation');
  });
});
