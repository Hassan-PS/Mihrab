/**
 * Today is home, and every other tab says so.
 *
 * `decideAndroidBack` has always sent hardware back from Quran, Tasbih,
 * Duas, the Log and Settings to Today, and treated Today as the one screen
 * you cannot leave. That rule was only ever a gesture: the tabs looked
 * like six peers, so landing on Today read as a bug rather than the model.
 * The arrow in each of those five title bars is the same rule, visible.
 *
 * What this pins is that the two cannot drift apart — the arrow goes where
 * the button goes, it is on exactly the tabs the button acts on, and it is
 * NOT on Today, which would offer a way out of the one screen that has
 * none.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { decideAndroidBack, HOME_TAB } from '../src/navigation/useAndroidSubScreenBack';

const src = (p: string) =>
  readFileSync(join(__dirname, '..', 'src', 'navigation', p), 'utf8');

const TABS = src('MainTabs.tsx');
const BUTTON = src('TabBackButton.tsx');

/** The five tabs that are not Today. */
const AWAY_FROM_HOME = [
  'QuranTab',
  'TasbihTab',
  'DuasTab',
  'LogTab',
  'SettingsTab',
];

describe('the arrow is on every tab the hardware button acts on', () => {
  for (const tab of AWAY_FROM_HOME) {
    it(`${tab} sends back to Today, and shows it`, () => {
      // The gesture...
      expect(
        decideAndroidBack({ type: 'tab', index: 0, routes: [{ name: tab }] }, false),
      ).toBe('home');
      // ...and the control, on the same screen.
      const block = TABS.split(`name="${tab}"`)[1]?.split('<Tab.Screen')[0] ?? '';
      expect(block).toContain('headerLeft: tabBackButton');
    });
  }

  it('leaves Today alone', () => {
    // Today is where back GOES. An arrow there would be a way out of the
    // screen the whole rule exists to arrive at.
    expect(
      decideAndroidBack(
        { type: 'tab', index: 0, routes: [{ name: HOME_TAB }] },
        false,
      ),
    ).toBe('system');
    const block = TABS.split(`name="${HOME_TAB}"`)[1]?.split('<Tab.Screen')[0] ?? '';
    expect(block).not.toContain('headerLeft');
  });

  it('puts it on five tabs and no more', () => {
    expect((TABS.match(/headerLeft: tabBackButton/g) ?? []).length).toBe(
      AWAY_FROM_HOME.length,
    );
  });
});

describe('the arrow and the gesture share one destination', () => {
  it('navigates to the same constant the back handler uses', () => {
    // Not a string of its own: two spellings of "Today" is how the button
    // and the gesture end up going to different places.
    expect(BUTTON).toContain("import { HOME_TAB } from './useAndroidSubScreenBack'");
    expect(BUTTON).toMatch(/navigation\.navigate\(HOME_TAB/);
  });

  it('navigates rather than popping', () => {
    // There is no stack under a tab to pop — a pop here would either do
    // nothing or leave the tab navigator.
    expect(BUTTON).not.toMatch(/StackActions|goBack\(\)/);
  });
});

describe('the arrow itself', () => {
  it('mirrors under RTL', () => {
    // A chevron is a direction, not a letter: in Arabic and Urdu "back" is
    // the trailing edge, so the glyph has to point the other way.
    expect(BUTTON).toMatch(/I18nManager\.isRTL/);
    expect(BUTTON).toMatch(/scaleX: -1/);
  });

  it('uses the shared label rather than a new string', () => {
    // 13 locales stay in parity; `common.back` is already in all of them.
    expect(BUTTON).toMatch(/t\('common\.back'/);
  });

  it('lays out with start/end padding, never left/right', () => {
    expect(BUTTON).toMatch(/paddingStart/);
    expect(BUTTON).not.toMatch(/paddingLeft|paddingRight/);
  });
});

describe('common.back is a navigation word in every locale', () => {
  const LOCALES = [
    'ar', 'bn', 'de', 'en', 'es', 'fr', 'hi',
    'id', 'ru', 'sv', 'tr', 'ur', 'zh',
  ];

  it('is present in all thirteen', () => {
    for (const code of LOCALES) {
      const json = JSON.parse(
        readFileSync(
          join(__dirname, '..', 'src', 'i18n', 'locales', `${code}.json`),
          'utf8',
        ),
      );
      expect(typeof json.common?.back).toBe('string');
      expect(json.common.back.length).toBeGreaterThan(0);
    }
  });

  it('is not the French word for the body part', () => {
    // "Dos" is the anatomical back (and the Spanish "two"). The control is
    // "Retour". It was only ever read by a screen reader on a modal
    // backdrop before this; now it is on five title bars.
    const fr = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'src', 'i18n', 'locales', 'fr.json'),
        'utf8',
      ),
    );
    expect(fr.common.back).toBe('Retour');
  });
});
