/**
 * Today is home, and the hardware button says so.
 *
 * `decideAndroidBack` has always sent hardware back from Quran, Tasbih,
 * Duas, the Log and Settings to Today, and treated Today as the one screen
 * you cannot leave. For a while each of those five tabs also drew an arrow
 * in its title bar saying the same thing; the tabs draw NO title bar now
 * (the page runs from the status bar, Pillars-style), so the gesture is
 * the rule's only expression again and the arrow survives only inside
 * Duas, pointed one level up at the category index.
 *
 * What this pins: the gesture still goes home from the five, still leaves
 * Today alone, no tab draws a header, and the control that remains goes
 * where the gesture goes.
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

describe('the hardware button goes home from every tab but Today', () => {
  for (const tab of AWAY_FROM_HOME) {
    it(`${tab} sends back to Today, and draws no title bar`, () => {
      expect(
        decideAndroidBack({ type: 'tab', index: 0, routes: [{ name: tab }] }, false),
      ).toBe('home');
      const block = TABS.split(`name="${tab}"`)[1]?.split('<Tab.Screen')[0] ?? '';
      expect(block).toContain('headerShown: false');
      expect(block).not.toContain('headerLeft');
    });
  }

  it('leaves Today alone', () => {
    // Today is where back GOES.
    expect(
      decideAndroidBack(
        { type: 'tab', index: 0, routes: [{ name: HOME_TAB }] },
        false,
      ),
    ).toBe('system');
  });

  it('puts the arrow in no tab header at all', () => {
    expect(TABS).not.toContain('tabBackButton');
    expect(TABS).not.toMatch(/headerLeft/);
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
