/**
 * Who holds the arrow keys, and when.
 *
 * On Mac the letters turned pages and the arrows did nothing: a scroll
 * view scrolls itself with ← and →, that is system behaviour, and system
 * behaviour beats a key command declared at the end of the responder
 * chain. Taking the arrows back is `wantsPriorityOverSystemBehavior` —
 * but a command that outranks the system also outranks a focused text
 * field, where the arrows move a caret. So the claim has to be released
 * whenever anything is being typed into, and these tests hold that.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { NativeModules } from 'react-native';

const calls: boolean[] = [];
(NativeModules as Record<string, unknown>).MihrabKeyCommands = {
  addListener: () => {},
  removeListeners: () => {},
  setArrowPriority: (on: boolean) => calls.push(on),
};

// Imported AFTER the module is stubbed in — `useKeyPaging` reads
// `NativeModules.MihrabKeyCommands` once, at import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setPagingKeyPriority, suspendWhileTyping, usePagingKeySuspension, hasKeyPaging } =
  require('../src/quran/useKeyPaging') as typeof import('../src/quran/useKeyPaging');

beforeEach(() => {
  calls.length = 0;
});

describe('claiming the arrow keys', () => {
  it('is possible at all on a build that has the native module', () => {
    expect(hasKeyPaging()).toBe(true);
  });

  it('passes the claim straight through to the native side', () => {
    setPagingKeyPriority(true);
    setPagingKeyPriority(false);
    expect(calls).toEqual([true, false]);
  });

  it('gives the arrows up while a text field has focus', () => {
    // Focus on the surah search: ← and → must move the caret again.
    suspendWhileTyping.onFocus();
    expect(calls).toEqual([false]);
  });

  it('takes them back when the field is left', () => {
    suspendWhileTyping.onBlur();
    expect(calls).toEqual([true]);
  });

  it('is a pair — every focus has its blur', () => {
    suspendWhileTyping.onFocus();
    suspendWhileTyping.onBlur();
    expect(calls).toEqual([false, true]);
  });
});


/**
 * ── A FIELD CAN LEAVE WITHOUT BLURRING ────────────────────────────────
 *
 * Reported on the Mac: the arrows stopped turning pages. A blur is the
 * only event that hands the claim back, and unmounting a focused
 * `TextInput` does not fire one — so the surah search released the arrows
 * and never took them back, twice over: it is rendered only on the Surah
 * tab, so Juz or Marks removes it mid-focus, and the whole sidebar goes
 * on the way into fullscreen. The letters went on working, which is the
 * signature of the claim being down rather than the binding being gone.
 */
describe('a focused field that disappears', () => {
  function mount() {
    let handlers!: { onFocus: () => void; onBlur: () => void };
    function Probe() {
      handlers = usePagingKeySuspension();
      return null;
    }
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Probe />);
    });
    return { get: () => handlers, unmount: () => act(() => root.unmount()) };
  }

  it('hands the arrows back when it is taken off screen still focused', () => {
    const { get, unmount } = mount();
    get().onFocus();
    expect(calls).toEqual([false]);
    unmount();
    expect(calls).toEqual([false, true]);
  });

  it('does not re-claim on unmount after an ordinary blur', () => {
    const { get, unmount } = mount();
    get().onFocus();
    get().onBlur();
    expect(calls).toEqual([false, true]);
    // Whatever has focus now keeps the arrows: this field already gave
    // them up, and claiming again on the way out would take them back.
    unmount();
    expect(calls).toEqual([false, true]);
  });

  it('does nothing at all if it was never focused', () => {
    const { unmount } = mount();
    unmount();
    expect(calls).toEqual([]);
  });
});
