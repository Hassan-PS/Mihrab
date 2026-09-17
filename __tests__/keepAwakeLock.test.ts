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

describe('it is answerable from Settings, not only Tilawah', () => {
  it('Settings → Quran carries the row', () => {
    const card = read('src/screens/settings/QuranCard.tsx');
    expect(card).toContain('testID="settings-keep-awake"');
    expect(card).toMatch(/value=\{quran\.prefs\.keepAwake\}/);
    expect(card).toMatch(/setQuranPrefs\(\{ keepAwake: next \}\)/);
  });

  it('over the SAME preference the coffee button holds', () => {
    // Two switches over one lock would let each claim the other is
    // wrong, depending on which was touched last.
    const tilawah = read('src/screens/quran/TilawahScreen.tsx');
    expect(tilawah).toMatch(/setQuranPrefs\(\{ keepAwake: !keepAwake \}\)/);
  });

  it('and is on until somebody turns it off', () => {
    const state = read('src/quran/quranState.ts');
    expect(state).toMatch(/keepAwake: true,/);
    // Stored prefs are spread OVER the defaults, so a blob written before
    // this key existed still reads as on rather than as missing.
    expect(state).toMatch(/\.\.\.DEFAULT_QURAN_STATE\.prefs,\s*\n\s*\.\.\.\(r\.prefs \?\? \{\}\),/);
  });
});
