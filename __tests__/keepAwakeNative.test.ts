/**
 * Which mechanism the coffee toggle actually pulls.
 *
 * `@sayem314/react-native-keep-awake` sets `isIdleTimerDisabled` on iOS —
 * right on an iPhone, ignored outright by macOS, where the display sleeps
 * on the Energy Saver schedule no matter what UIKit was told. On the Mac
 * build the toggle was therefore decoration: with the cup lit,
 * `pmset -g assertions` listed nothing owned by Mihrab.
 *
 * `MihrabKeepAwake` is the app's own module and speaks both dialects —
 * the idle timer on iOS, a `ProcessInfo` activity assertion on Catalyst.
 * This pins that it is PREFERRED when present, and that the library stays
 * the fallback so Android and any build without the module are unchanged.
 */
jest.mock('react-native', () => ({
  NativeModules: {
    MihrabKeepAwake: { activate: jest.fn(), deactivate: jest.fn() },
  },
}));
jest.mock('@sayem314/react-native-keep-awake', () => ({
  activateKeepAwake: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

import { NativeModules } from 'react-native';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import { acquireKeepAwake, _keepAwakeHolders } from '../src/quran/keepAwakeLock';

const nativeModule = (
  NativeModules as unknown as {
    MihrabKeepAwake: { activate: jest.Mock; deactivate: jest.Mock };
  }
).MihrabKeepAwake;

beforeEach(() => {
  nativeModule.activate.mockClear();
  nativeModule.deactivate.mockClear();
  (activateKeepAwake as jest.Mock).mockClear();
  (deactivateKeepAwake as jest.Mock).mockClear();
});

it('starts with nothing held', () => {
  expect(_keepAwakeHolders()).toBe(0);
});

it('pulls the native module, not the library', () => {
  const release = acquireKeepAwake();
  expect(nativeModule.activate).toHaveBeenCalledTimes(1);
  expect(activateKeepAwake).not.toHaveBeenCalled();

  release();
  expect(nativeModule.deactivate).toHaveBeenCalledTimes(1);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();
});

it('still counts holders rather than toggling per screen', () => {
  // The reason the lock exists at all: Tilawah stays mounted under the
  // reader it opens, so the reader popping must not take the screen out
  // from under a page whose toggle is still lit.
  const tilawah = acquireKeepAwake();
  const reader = acquireKeepAwake();
  expect(nativeModule.activate).toHaveBeenCalledTimes(1);

  reader();
  expect(nativeModule.deactivate).not.toHaveBeenCalled();

  tilawah();
  expect(nativeModule.deactivate).toHaveBeenCalledTimes(1);
});
