/**
 * The keep-awake library is a global flag. Two screens now hold it, and
 * they are mounted together whenever Tilāwah opens the reader — so the
 * reader popping used to switch the screen off under a Tilāwah whose
 * toggle was still lit. The lock counts.
 */
import fs from 'fs';
import path from 'path';

const mockActivate = jest.fn();
const mockDeactivate = jest.fn();
jest.mock('@sayem314/react-native-keep-awake', () => ({
  activateKeepAwake: () => mockActivate(),
  deactivateKeepAwake: () => mockDeactivate(),
}));
const activate = mockActivate;
const deactivate = mockDeactivate;

import {
  _keepAwakeHolders,
  acquireKeepAwake,
} from '../src/quran/keepAwakeLock';
import { coerceQuranState } from '../src/quran/quranState';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

beforeEach(() => {
  activate.mockClear();
  deactivate.mockClear();
});

describe('the counted lock', () => {
  it('turns the flag on for the first holder and off for the last', () => {
    const tilawah = acquireKeepAwake();
    expect(activate).toHaveBeenCalledTimes(1);
    const reader = acquireKeepAwake();
    // A second holder does not touch the flag: it is already on.
    expect(activate).toHaveBeenCalledTimes(1);
    expect(_keepAwakeHolders()).toBe(2);

    // THE BUG: the reader pops while Tilāwah is still underneath.
    reader();
    expect(deactivate).not.toHaveBeenCalled();
    expect(_keepAwakeHolders()).toBe(1);

    tilawah();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(_keepAwakeHolders()).toBe(0);
  });

  it('survives a release called twice', () => {
    const a = acquireKeepAwake();
    const b = acquireKeepAwake();
    a();
    a(); // an effect cleanup that somehow ran twice must not steal b's hold
    expect(_keepAwakeHolders()).toBe(1);
    expect(deactivate).not.toHaveBeenCalled();
    b();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });
});

describe('every holder goes through it', () => {
  it.each([
    'src/screens/quran/TilawahScreen.tsx',
    'src/quran/mushafReaderCore.tsx',
    // The translation reader was the one that did NOT hold it (#52), and
    // it is the screen people read along with the recitation — which
    // read, from the outside, as the setting being broken.
    'src/screens/quran/TranslationSurahScreen.tsx',
  ])('%s', file => {
    const src = read(file);
    expect(src).toContain('useKeepAwake(');
    expect(src).not.toMatch(/activateKeepAwake|deactivateKeepAwake/);
  });

  it('nothing else calls the library directly', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
        d.isDirectory()
          ? walk(path.join(dir, d.name))
          : /\.tsx?$/.test(d.name)
            ? [path.join(dir, d.name)]
            : [],
      );
    const offenders = walk(path.join(REPO, 'src'))
      .filter(f => !f.endsWith('keepAwakeLock.ts'))
      .filter(f => /@sayem314\/react-native-keep-awake/.test(fs.readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });
});

describe('reading and listening are two questions', () => {
  // They shared one flag, which is how a muṣḥaf came to go dark: the
  // coffee cup is reached with the recitation already playing and gets
  // switched off for an evening of listening, and days later the reader
  // obeyed it. Issue #52 asked for the reading one to be answerable
  // "separate from tilawah", and this is what that means.
  it('Settings → Quran holds the READING preference', () => {
    const card = read('src/screens/settings/QuranCard.tsx');
    expect(card).toContain('testID="settings-keep-awake"');
    expect(card).toMatch(/value=\{quran\.prefs\.readerKeepAwake\}/);
    expect(card).toMatch(/setQuranPrefs\(\{ readerKeepAwake: next \}\)/);
  });

  it('and both readers obey that one', () => {
    for (const f of [
      'src/quran/mushafReaderCore.tsx',
      'src/screens/quran/TranslationSurahScreen.tsx',
    ]) {
      expect(read(f)).toContain('useKeepAwake(quran.prefs.readerKeepAwake)');
    }
  });

  it('while the coffee button keeps its own, and keeps working', () => {
    const tilawah = read('src/screens/quran/TilawahScreen.tsx');
    expect(tilawah).toMatch(/setQuranPrefs\(\{ keepAwake: !keepAwake \}\)/);
    expect(tilawah).toContain('useKeepAwake(keepAwake)');
    // And it does not hold the readers' flag (prose may name it).
    expect(tilawah).not.toContain('useKeepAwake(quran.prefs.readerKeepAwake)');
    expect(tilawah).not.toMatch(/setQuranPrefs\(\{ readerKeepAwake/);
  });

  it('both are on until somebody turns them off', () => {
    const state = read('src/quran/quranState.ts');
    expect(state).toMatch(/keepAwake: true,/);
    expect(state).toMatch(/readerKeepAwake: true,/);
    // Stored prefs are spread OVER the defaults, so a blob written before
    // these keys existed still reads as on rather than as missing.
    expect(state).toMatch(/\.\.\.DEFAULT_QURAN_STATE\.prefs,\s*\n\s*\.\.\.\(r\.prefs \?\? \{\}\),/);
  });

  it('and the reading one never inherits the cup’s answer', () => {
    // The whole point: a coffee cup switched off was never a decision
    // about the muṣḥaf, so the new key does not read the old one.
    expect(coerceQuranState({ version: 1, prefs: { keepAwake: false } }).prefs
      .readerKeepAwake).toBe(true);
    expect(coerceQuranState({ version: 1, prefs: { readerKeepAwake: false } })
      .prefs.readerKeepAwake).toBe(false);
  });
});
