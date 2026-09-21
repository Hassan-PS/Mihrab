/**
 * THE UI FACE ON ANDROID IS THE APP'S OWN — issue #16.
 *
 * `FONTS.primary` is undefined on purpose: the Latin UI has always been
 * set in whatever the platform calls sans-serif, which on stock Android
 * is Roboto. On a Huawei running EMUI it is the user's THEME font. A
 * themed nova drew every label, number and button in a cursive serif,
 * wider than the layouts were drawn for — the prayer times truncated to
 * "04:…", the tabs to "Du…", the header title to "Al-M…" — and switching
 * the theme off and on did not put it back. The bundled Arabic faces on
 * the same screens were untouched: a font the app loads from its own
 * resources is not the system's to replace.
 *
 * So on Android every Text asks for the bundled Roboto by name
 * (res/font/roboto.xml, registered in MainApplication). The family lacks
 * Arabic, Urdu and the rest, and for those glyphs Android falls back to
 * the system as it always did; what changes is that the app's Latin is
 * the app's on every phone.
 *
 * ── HOW ───────────────────────────────────────────────────────────────
 *
 * React Native has no default-font setting. Text is a plain function
 * component and `react-native`'s `Text` is a getter that reads the
 * module's default export at every use, so replacing that export with a
 * wrapper that puts the family FIRST in the style — every explicit
 * `fontFamily` in the app still wins, Amiri and the muṣḥaf faces above
 * all — reaches every Text in the app and its libraries. Loaded first in
 * index.js, before anything has taken a reference to the original.
 * TextInput the same, so a search field matches the labels around it.
 */
import React from 'react';
import { Platform } from 'react-native';

/** The family name res/font/roboto.xml is registered under. */
export const ANDROID_UI_FONT = 'Roboto';

type Wrappable = React.ComponentType<{ style?: unknown }>;

/**
 * A Text nested inside another Text inherits its parent's family — that
 * is how the muṣḥaf sets the riwayah face once on the line and colours
 * each word in a span. Forcing Roboto on those spans would override the
 * inheritance and drop the whole line to the system's Arabic fallback,
 * so the default is applied to ROOT texts only; a nested one is left as
 * written. `React.use` reads the context the same way Text itself does.
 */
function withDefaultFamily<T extends Wrappable>(
  Original: T,
  name: string,
  nestedIn?: React.Context<boolean>,
): T {
  const style = { fontFamily: ANDROID_UI_FONT };
  const Wrapped = (props: { style?: unknown }) => {
    const nested = nestedIn ? React.use(nestedIn) : false;
    return React.createElement(
      Original,
      nested ? props : { ...props, style: props.style == null ? style : [style, props.style] },
    );
  };
  Wrapped.displayName = name;
  // The statics ride along: `TextInput.State.currentlyFocusedInput()` is
  // the app's, and a wrapper without it would crash the first focused field.
  for (const key of Object.keys(Original)) {
    if (!(key in Wrapped)) {
      (Wrapped as unknown as Record<string, unknown>)[key] = (Original as unknown as Record<string, unknown>)[key];
    }
  }
  return Wrapped as unknown as T;
}

export function installAndroidUiFont(): void {
  if (Platform.OS !== 'android') return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const text = require('react-native/Libraries/Text/Text') as { default: Wrappable };
  const input = require('react-native/Libraries/Components/TextInput/TextInput') as {
    default: Wrappable;
  };
  const ancestor = require('react-native/Libraries/Text/TextAncestorContext') as {
    default: React.Context<boolean>;
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
  text.default = withDefaultFamily(text.default, 'Text', ancestor.default);
  input.default = withDefaultFamily(input.default, 'TextInput');
}

installAndroidUiFont();
