/**
 * Issue #16: on Android every Text carries the bundled Roboto, so an OEM
 * theme font cannot reach the UI. Explicit families still win.
 */
import { readFileSync } from 'fs';
import path from 'path';

const read = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/**
 * Everything from ONE module registry: a renderer from another React than
 * the one Text was written against renders nothing.
 */
function load(os: 'android' | 'ios') {
  jest.resetModules();
  jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
    __esModule: true,
    default: { OS: os, select: (o: { android?: unknown; ios?: unknown; default?: unknown }) => o[os] ?? o.default },
  }));
  const RN = require('react-native') as typeof import('react-native');
  const before = RN.Text;
  require('../src/theme/androidUiFont');
  const React = require('react') as typeof import('react');
  const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer');
  const render = (style: object, text: string) => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(React.createElement(RN.Text, { style }, text));
    });
    return tree!.toJSON() as unknown as { props: { style: unknown } };
  };
  return { RN, before, render };
}

describe('the Android UI font', () => {
  it('is the first thing index.js loads', () => {
    const index = read('index.js');
    const first = index.match(/^import .*$/m)?.[0];
    expect(first).toBe("import './src/theme/androidUiFont';");
  });

  it('gives every Text the bundled family, behind whatever the style says', () => {
    const { RN, render } = load('android');
    const tree = render({ fontSize: 14 }, 'hi');
    const flat = RN.StyleSheet.flatten(tree.props.style as never) as Record<string, unknown>;
    expect(flat.fontFamily).toBe('Roboto');
    expect(flat.fontSize).toBe(14);
  });

  it('never overrides an explicit family — Amiri stays Amiri', () => {
    const { RN, render } = load('android');
    const tree = render({ fontFamily: 'AmiriQuran' }, 'ا');
    expect((RN.StyleSheet.flatten(tree.props.style as never) as Record<string, unknown>).fontFamily).toBe('AmiriQuran');
  });

  it('leaves a nested span alone so it inherits the line\'s riwayah face', () => {
    // The muṣḥaf sets UthmanicWarsh once on the line and colours each word
    // in a nested Text; forcing Roboto on the span broke the whole line.
    // Jest's Text mock does not publish the ancestor context the real one
    // does (asserted below), so the test stands in for the outer Text.
    const { RN } = load('android');
    const React = require('react') as typeof import('react');
    const Ancestor = (require('react-native/Libraries/Text/TextAncestorContext') as { default: React.Context<boolean> }).default;
    const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer');
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(
        React.createElement(
          Ancestor,
          { value: true },
          React.createElement(RN.Text, { style: { color: 'red' } }, 'كلمة'),
        ),
      );
    });
    const span = RN.StyleSheet.flatten((tree!.toJSON() as unknown as { props: { style: unknown } }).props.style as never) as Record<string, unknown>;
    expect(span.fontFamily).toBeUndefined();
    expect(span.color).toBe('red');
    const real = read('node_modules', 'react-native', 'Libraries', 'Text', 'Text.js');
    expect(real).toContain('<TextAncestorContext value={true}>');
  });

  it('keeps TextInput.State — the focused-field lookup — on the wrapper', () => {
    const { RN } = load('android');
    const TextInput = RN.TextInput as unknown as { State?: { currentlyFocusedInput: unknown }; displayName?: string };
    expect(typeof TextInput.State?.currentlyFocusedInput).toBe('function');
    expect(TextInput.displayName).toBe('TextInput');
  });

  it('is registered natively as a font XML with real weights', () => {
    const xml = read('android', 'app', 'src', 'main', 'res', 'font', 'roboto.xml');
    for (const w of ['400', '500', '600', '700']) expect(xml).toContain(`android:fontWeight="${w}"`);
    expect(xml).toContain('android:fontStyle="italic"');
    const app = read('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', 'MainApplication.kt');
    expect(app).toContain('manager.addCustomFont(this, UI_FONT, R.font.roboto)');
    expect(app).toContain('const val UI_FONT = "Roboto"');
    expect(() => read('android', 'fonts', 'OFL-Roboto.txt')).not.toThrow();
  });

  it('does nothing off Android', () => {
    const { before } = load('ios');
    expect(require('react-native').Text).toBe(before);
  });
});
