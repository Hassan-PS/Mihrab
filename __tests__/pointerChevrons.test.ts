/**
 * The mushaf's page-turn arrows, and who gets them.
 *
 * The bug this guards: on macOS every other control in the reader worked
 * and the arrows did not, because the gate asked how WIDE the window was
 * to decide whether the thing pointing at it could swipe.
 */
import { showsPointerChevrons } from '../src/quran/pointerChevrons';

const env = (over: Partial<Parameters<typeof showsPointerChevrons>[0]> = {}) =>
  showsPointerChevrons({
    os: 'ios',
    isMacCatalyst: false,
    isPhoneDevice: false,
    isPad: false,
    windowWidth: 1024,
    ...over,
  });

describe('who needs page-turn arrows', () => {
  it('gives them to a Mac at any window size', () => {
    // The regression. A Mac reports idiom 'mac', so `isPad` is false, and
    // the window opens well under 900pt — it satisfied no clause.
    expect(env({ isMacCatalyst: true, windowWidth: 520 })).toBe(true);
    expect(env({ isMacCatalyst: true, windowWidth: 380, isPhoneDevice: true }))
      .toBe(true);
  });

  it('gives them to an iPad', () => {
    expect(env({ isPad: true, windowWidth: 700 })).toBe(true);
  });

  it('gives them to a large window without an iPad idiom', () => {
    expect(env({ windowWidth: 900 })).toBe(true);
    expect(env({ windowWidth: 899 })).toBe(false);
  });

  it('withholds them from a phone, which has a finger', () => {
    expect(env({ isPhoneDevice: true, windowWidth: 1024 })).toBe(false);
    expect(env({ isPhoneDevice: true, isPad: true })).toBe(false);
  });

  it('withholds them on Android, where the pager is a different thing', () => {
    expect(env({ os: 'android' })).toBe(false);
    expect(env({ os: 'android', isMacCatalyst: true })).toBe(false);
  });
});
