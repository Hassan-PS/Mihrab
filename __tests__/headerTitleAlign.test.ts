/**
 * Where a title sits, decided rather than inherited.
 *
 * React Navigation centres a header title on iOS and leads it on Android.
 * The app had never chosen, so the same screen — Notifications, Quran,
 * Duas — read as two different designs depending on which phone it was
 * opened on. Both navigators now say what they want.
 *
 * The one exception is Today, and it is an exception with a reason: that
 * row is a wordmark beside a location chip, not the name of a pushed
 * screen, and a centred title reserves the middle third of the bar and
 * left the city name running off the right edge. It says so itself.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const ROOT = read('src/navigation/RootNavigator.tsx');
const TABS = read('src/navigation/MainTabs.tsx');

describe('the pushed subpages', () => {
  it('centre their titles on both platforms', () => {
    // In the stack's screenOptions, so a new subpage inherits it rather
    // than needing anyone to remember.
    expect(ROOT).toMatch(
      /screenOptions=\{\{[\s\S]*?headerTitleAlign: 'center'/,
    );
  });

  it('do not leave it to the platform anywhere else', () => {
    expect(ROOT).not.toMatch(/headerTitleAlign: 'left'/);
  });
});

describe('the tabs', () => {
  it('centre theirs too', () => {
    expect(TABS).toMatch(/screenOptions=\{\{[\s\S]*?headerTitleAlign: 'center'/);
  });

  it('let Today keep its wordmark at the leading edge', () => {
    // One override, and only one: the Home tab's own options.
    const overrides = TABS.match(/headerTitleAlign: 'left'/g) ?? [];
    expect(overrides).toHaveLength(1);
    // And it is still explained rather than just set.
    expect(TABS).toMatch(
      /wordmark sits at the LEADING EDGE[\s\S]{0,900}?headerTitleAlign: 'left'/,
    );
  });
});
