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
