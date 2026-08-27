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
const { useKeyPaging, hasKeyPaging, useRegisterKeyPaging } = keyPaging;
type PageTurner = import('../src/quran/useKeyPaging').PageTurner;
type KeyPagingTarget = import('../src/quran/useKeyPaging').KeyPagingTarget;

function Register({
  target,
  turn,
}: {
  target: KeyPagingTarget;
  turn: PageTurner;
}) {
  useRegisterKeyPaging(target, turn);
  return null;
}

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

describe('the reader publishes its page turn', () => {
  it('drives whichever reader registered, and its own when none has', () => {
    const target: { current: PageTurner | null } = { current: null };
    const own = jest.fn();
    const forward = () => (target.current ?? own)(1);

    forward();
    expect(own).toHaveBeenCalledWith(1);

    const text = jest.fn();
    target.current = text;
    forward();
    expect(text).toHaveBeenCalledWith(1);
    expect(own).toHaveBeenCalledTimes(1);
  });

  it('a reader registers on mount and clears on unmount', () => {
    const target: KeyPagingTarget = { current: null };
    const turn = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Register target={target} turn={turn} />);
    });
    expect(target.current).toBe(turn);
    act(() => {
      tree.unmount();
    });
    expect(target.current).toBeNull();
  });

  it('a departing reader cannot wipe its successor', () => {
    // Two readers overlapping for a frame — the one leaving must not clear
    // a registration that is no longer its own.
    const target: KeyPagingTarget = { current: null };
    const leaving = jest.fn();
    const arriving = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Register target={target} turn={leaving} />);
    });
    target.current = arriving;
    act(() => {
      tree.unmount();
    });
    expect(target.current).toBe(arriving);
  });
});

describe('the keys are bound in one place', () => {
  it('MushafReader owns the binding, ungated', () => {
    const text = src('MushafReader.tsx');
    expect(text).toMatch(/useKeyPaging\(turnForward,\s*turnBack\)/);
    // No `enabled` argument: the Quran reader IS MushafReader, in either
    // render mode, and the split readers publish INTO it.
    expect(text).not.toMatch(/useKeyPaging\([^)]*textMode/);
    expect(text).toContain('keyTurn: keyTurnRef');
  });

  it.each(['MushafSpreadReader.tsx', 'MushafPhoneReader.tsx'])(
    '%s registers rather than binding',
    (file) => {
      const text = src(file);
      expect(text).toMatch(/useRegisterKeyPaging\(props\.keyTurn,\s*turnPage\)/);
      // A second subscription in text mode would turn two pages per press.
      expect(text).not.toMatch(/\buseKeyPaging\(/);
    },
  );
});
