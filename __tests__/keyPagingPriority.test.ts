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
const { setPagingKeyPriority, suspendWhileTyping, hasKeyPaging } =
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
