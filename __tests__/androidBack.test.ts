/**
 * Android back, one level at a time, ending at Today.
 *
 *   surah reader  →  the Quran tab  →  Today  →  out of the app
 *
 * The old version read `getState().index` and popped when it was greater
 * than zero, which is right for a pushed page and wrong for a tab —
 * `useNavigation()` returns the CLOSEST navigator, so inside the Quran tab
 * that index was the tab's own (1) and the pop was dispatched at a bottom-
 * tab navigator, which silently does nothing while reporting the press
 * handled. Back on any tab but Today did nothing at all, which is what was
 * reported on 2026-08-27.
 */
import {
  decideAndroidBack,
  type BackNavState,
} from '../src/navigation/useAndroidSubScreenBack';

const tabs = (index: number): BackNavState => ({
  type: 'tab',
  index,
  routes: [
    { name: 'TodayTab' },
    { name: 'QuranTab' },
    { name: 'TasbihTab' },
    { name: 'DuasTab' },
    { name: 'LogTab' },
    { name: 'SettingsTab' },
  ],
});

const stack = (index: number): BackNavState => ({
  type: 'stack',
  index,
  routes: [{ name: 'Home' }, { name: 'QuranSurah' }],
});

describe('from a tab’s own root', () => {
  it.each([
    ['Quran', 1],
    ['Tasbih', 2],
    ['Duas', 3],
    ['Log', 4],
    ['Settings', 5],
  ])('goes to Today from the %s tab', (_name, index) => {
    expect(decideAndroidBack(tabs(index), false)).toBe('home');
  });

  it('leaves the app from Today rather than trapping the user', () => {
    // The one screen back cannot go anywhere sensible from. Handling it
    // would mean a button that does nothing, for ever.
    expect(decideAndroidBack(tabs(0), false)).toBe('system');
  });
});

describe('from a pushed page', () => {
  it('goes back one, not all the way to Today', () => {
    // The reader belongs to the Quran tab; back means the surah list, and
    // only the press after that means Today.
    expect(decideAndroidBack(stack(1), false)).toBe('pop');
  });

  it('does nothing at the stack root, which is the tab container', () => {
    // A screen inside the tabs would have seen the tab navigator, so this
    // state means there is nothing pushed and nothing to do.
    expect(decideAndroidBack(stack(0), false)).toBe('system');
  });
});

describe('the cases that are not navigation', () => {
  it('defers while an overlay is open', () => {
    // A Modal or a sheet gets the press first, whatever is underneath.
    expect(decideAndroidBack(tabs(1), true)).toBe('defer');
    expect(decideAndroidBack(stack(1), true)).toBe('defer');
  });

  it('does nothing without a navigator state', () => {
    expect(decideAndroidBack(undefined, false)).toBe('system');
  });

  it('treats an unnamed route as somewhere that is not Today', () => {
    // Rather than guessing it is Today and swallowing the press.
    expect(decideAndroidBack({ type: 'tab', index: 9 }, false)).toBe('home');
  });
});
