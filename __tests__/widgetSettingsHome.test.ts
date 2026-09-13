/**
 * The widget's one control, and the two ways in.
 *
 * It had a section of its own until #127 unified its colour picker with
 * the app accent and left a single slider behind a row, an icon and a
 * tap. The section is gone and the card sits on Appearance.
 *
 * `settingsSubpages.test.ts` already refuses to let a settings card go
 * unrendered, which is what stops the slider from simply vanishing in a
 * move like this. What that cannot see is the other end: the links that
 * pointed AT the page that went away. The onboarding Ready screen had
 * one, and on iOS it had been pointing at a route that was never
 * registered — the section was Android-only, the row was not — so a
 * first-run tap on "Widgets" did nothing at all on an iPhone. A page
 * that stops existing is exactly when that kind of link is found, so it
 * is pinned here.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const SUBPAGES = read('src/screens/settings/subpages.tsx');
const TYPES = read('src/navigation/types.ts');
const APPEARANCE = read(
  'src/screens/settings/pages/AppearanceSettingsScreen.tsx',
);
const CARD = read('src/screens/settings/WidgetCard.tsx');
const READY = read('src/onboarding/screens/ReadyScreen.tsx');

describe('the widget has no section of its own', () => {
  it('is not on the index, and not on the stack', () => {
    expect(SUBPAGES).not.toContain('SettingsWidgets');
    expect(TYPES).not.toContain('SettingsWidgets');
  });

  it('left no page file behind for the navigator to register', () => {
    // `settingsSubpages.test.ts` counts pages against routes, so a file
    // left here would fail there too — but it would fail as an off-by-one
    // rather than as this.
    expect(
      fs.existsSync(
        path.join(REPO, 'src/screens/settings/pages/WidgetSettingsScreen.tsx'),
      ),
    ).toBe(false);
  });
});

describe('the control it kept lives on Appearance', () => {
  it('is rendered there', () => {
    expect(APPEARANCE).toContain('<WidgetCard />');
  });

  it('draws nothing off Android, so Appearance is unchanged there', () => {
    // The card is on every platform's Appearance page; only Android has
    // anything for it to say. Without this, iOS gets an empty titled
    // group under Language.
    expect(CARD).toMatch(/Platform\.OS !== 'android'[\s\S]{0,60}return null/);
  });

  it('names itself now that it is not the whole page', () => {
    // It was untitled when the page was called "Home screen". Under
    // "Language" on a shared page, an untitled group of controls reads as
    // more language settings.
    expect(CARD).toMatch(/title=\{t\('settings\.sectionWidgets'\)\}/);
  });

  it('stops telling people to go to Appearance, being Appearance', () => {
    expect(CARD).not.toContain('widgetColorFollowsAccentHelp');
  });

  it("says so on the index, where someone hunting for it looks", () => {
    // The section title is "Appearance & language"; nothing in it says
    // widget. The blurb is the only line that can, and only Android's,
    // because only Android has the control.
    expect(SUBPAGES).toMatch(
      /Platform\.OS === 'android'\s*\?\s*'settings\.sectionAppearanceBlurbAndroid'\s*:\s*'settings\.sectionAppearanceBlurb'/,
    );
  });
});

describe('the onboarding links land somewhere', () => {
  /** Every settings route the Ready screen offers to open. */
  const linked = [...READY.matchAll(/goTo\('(Settings\w+)'\)/g)].map(m => m[1]);

  it('offers at least the three it promises', () => {
    expect(linked.length).toBeGreaterThanOrEqual(3);
  });

  it('opens only routes the stack actually registers', () => {
    // The bug this exists for: the row said Widgets and navigated to a
    // section that was filtered out on the platform it was tapped on.
    for (const route of linked) {
      expect(SUBPAGES).toContain(`route: '${route}'`);
      expect(TYPES).toMatch(new RegExp(`\\b${route}:`));
    }
  });

  it('shows the widgets row only where the widget has settings', () => {
    expect(READY).toMatch(
      /Platform\.OS === 'android' \? \([\s\S]{0,300}?onboarding-ready-widgets/,
    );
  });
});
