/**
 * Keyboard paging in the Quran reader (arrows / WASD / vim on macOS and
 * iPad).
 *
 * Two things are worth a test and neither is the native side:
 *
 *  1. The hook subscribes only when there is a native module AND it is
 *     enabled, and it hands 'forward'/'back' to the right callback.
 *  2. Exactly ONE component binds the keys per render path. `MushafReader`
 *     returns into `MushafSpreadReader`/`MushafPhoneReader` in text mode,
 *     and hooks cannot be called conditionally, so both subscriptions are
 *     mounted at once unless the image-mode one is gated on `!textMode`.
 *     Without that gate every press turns two pages — which is what the
 *     audit found, so it gets a guard.
 */
import { readFileSync } from 'fs';
import path from 'path';
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { NativeEventEmitter, NativeModules } from 'react-native';

type Listener = (event: { action?: string }) => void;

const listeners: Listener[] = [];
const removed: number[] = [];

/**
 * Stand in for the real Swift module. `NativeModules` is a plain object in
 * the jest preset, so this is enough to make `hasKeyPaging()` true — and it
 * has to happen BEFORE the hook is required, because the hook reads the
 * module once at module scope.
 */
(
  NativeModules as unknown as Record<string, unknown>
).MihrabKeyCommands = {
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

jest
  .spyOn(NativeEventEmitter.prototype, 'addListener')
  .mockImplementation((_event: string, fn: unknown) => {
    listeners.push(fn as Listener);
    const index = listeners.length - 1;
    return { remove: () => removed.push(index) } as never;
  });

const keyPaging =
  require('../src/quran/useKeyPaging') as typeof import('../src/quran/useKeyPaging');
const { useKeyPaging, hasKeyPaging } = keyPaging;

const src = (rel: string) =>
  readFileSync(path.join(__dirname, '..', 'src', 'quran', rel), 'utf8');

type ProbeProps = {
  forward: () => void;
  back: () => void;
  enabled?: boolean;
};

function Probe({ forward, back, enabled }: ProbeProps) {
  useKeyPaging(forward, back, enabled);
  return null;
}

function mount(props: ProbeProps): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Probe {...props} />);
  });
  return tree;
}

beforeEach(() => {
  listeners.length = 0;
  removed.length = 0;
});

describe('useKeyPaging', () => {
  it('reports the capability from the native module', () => {
    expect(hasKeyPaging()).toBe(true);
  });

  it('routes forward and back to their own handlers', () => {
    const forward = jest.fn();
    const back = jest.fn();
    mount({ forward, back });

    expect(listeners).toHaveLength(1);
    act(() => {
      listeners[0]({ action: 'forward' });
      listeners[0]({ action: 'back' });
      listeners[0]({ action: 'back' });
    });

    expect(forward).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('ignores an unknown action rather than guessing a direction', () => {
    const forward = jest.fn();
    const back = jest.fn();
    mount({ forward, back });
    act(() => {
      listeners[0]({});
      listeners[0]({ action: 'sideways' });
    });
    expect(forward).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('does not subscribe at all when disabled', () => {
    mount({ forward: jest.fn(), back: jest.fn(), enabled: false });
    expect(listeners).toHaveLength(0);
  });

  it('drops the subscription when it is disabled after mounting', () => {
    const props: ProbeProps = {
      forward: jest.fn(),
      back: jest.fn(),
      enabled: true,
    };
    const tree = mount(props);
    expect(listeners).toHaveLength(1);
    act(() => {
      tree.update(<Probe {...props} enabled={false} />);
    });
    expect(removed).toEqual([0]);
  });

  it('unsubscribes on unmount', () => {
    const tree = mount({ forward: jest.fn(), back: jest.fn() });
    act(() => {
      tree.unmount();
    });
    expect(removed).toEqual([0]);
  });
});

describe('only one reader binds the keys', () => {
  it('MushafReader gates its binding on image mode', () => {
    const call = src('MushafReader.tsx').match(/useKeyPaging\(([^;]*?)\);/s);
    expect(call).not.toBeNull();
    // Three arguments, and the third is the text-mode gate.
    expect(call?.[1]).toContain('!textMode');
  });

  it.each(['MushafSpreadReader.tsx', 'MushafPhoneReader.tsx'])(
    '%s binds the keys to its own pager',
    (file) => {
      const text = src(file);
      expect(text).toMatch(/useKeyPaging\(turnForward,\s*turnBack\)/);
      expect(text).toContain("from './useKeyPaging'");
    },
  );
});
