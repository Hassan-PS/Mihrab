/**
 * Which way the back arrow points, mounted.
 *
 * There was a test for this and it read the source for `I18nManager.isRTL`.
 * It was green for as long as the Duas bar was wrong: the app mirrors itself
 * with a Yoga `direction` rather than `forceRTL`, so that flag answers for
 * the PHONE, and an English phone with the app in Arabic left it `false`
 * while the row around the arrow had already swapped ends. The arrow sat on
 * the right, pointing left, and a source regex can never see that.
 *
 * So this mounts the thing. The pair of cases that matter are the two
 * containers: a row of ours, which mirrors with the app's language, and a
 * native stack's header slot, which the platform's toolbar places by the
 * device's direction and therefore does not.
 */
let mockLang = 'en';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) =>
      typeof second === 'string' ? second : key,
    i18n: { language: mockLang },
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: { isDark: false, textSolid: '#111111' },
  }),
}));

import * as React from 'react';
import { act } from 'react';
import { I18nManager } from 'react-native';
import Svg from 'react-native-svg';
import { create } from 'react-test-renderer';
import { TabBackButton } from '../src/navigation/TabBackButton';

/**
 * The transform the glyph is drawn with — `undefined` when it points the
 * way it was drawn, a mirror when it has been turned around.
 */
function arrowTransform(props: { inNativeHeader?: boolean } = {}) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<TabBackButton {...props} />);
  });
  const style = tree.root.findByType(Svg).props.style as
    | { transform?: unknown }
    | undefined;
  return style?.transform;
}

const MIRRORED = [{ scaleX: -1 }];

afterEach(() => {
  mockLang = 'en';
  I18nManager.isRTL = false;
});

describe('an arrow in a row of ours follows the app', () => {
  it('points the way it is drawn in English', () => {
    expect(arrowTransform()).toBeUndefined();
  });

  it('turns around in Arabic', () => {
    mockLang = 'ar';
    expect(arrowTransform()).toEqual(MIRRORED);
  });

  it('turns around in Urdu, which is the one that gets forgotten', () => {
    // Urdu is right-to-left and Arabic-script, and the app ships it. A rule
    // written as `language === 'ar'` leaves it pointing the wrong way.
    mockLang = 'ur';
    expect(arrowTransform()).toEqual(MIRRORED);
  });

  it('does not ask the phone — this is the bug', () => {
    // An Arabic app on an English phone: `I18nManager.isRTL` is false and
    // the row is mirrored anyway. This is the exact configuration that
    // shipped with the arrow on the trailing edge pointing away from it.
    mockLang = 'ar';
    expect(I18nManager.isRTL).toBe(false);
    expect(arrowTransform()).toEqual(MIRRORED);
  });

  it('stays put for an English app on an Arabic phone', () => {
    // The mirror image of the same mistake: the tree is NOT mirrored here,
    // because the app's language decides that, so neither is the arrow.
    I18nManager.isRTL = true;
    expect(arrowTransform()).toBeUndefined();
  });
});

describe('an arrow in a native header follows the phone', () => {
  it('stays on the left in Arabic, and points there', () => {
    // `react-native-screens` gives `headerLeft` to the platform's toolbar,
    // which places it by the device's direction. With `forceRTL` off that
    // is left-to-right for everyone, so the arrow is physically on the left
    // and a flip here would have it pointing away from its own edge.
    mockLang = 'ar';
    expect(arrowTransform({ inNativeHeader: true })).toBeUndefined();
  });

  it('mirrors once the phone itself is right-to-left', () => {
    mockLang = 'ar';
    I18nManager.isRTL = true;
    expect(arrowTransform({ inNativeHeader: true })).toEqual(MIRRORED);
  });
});
