/**
 * The sunnah tile, as a control rather than as arithmetic.
 *
 * `sunnah.test.ts` proves the cycle. This proves the two things the cycle
 * cannot: that the tile SHOWS where it is — a button that goes 0→1→2→0 with
 * nothing on it is a guessing game — and that Asr, which carries no sunnah, is
 * drawn and inert rather than missing.
 */
// i18n is not initialised under jest, so the real `t` hands back the
// default string with its {{placeholders}} intact — which would let the
// assertions below pass on a label that never actually names a number.
// Interpolate here so "1 of 2" has to be really produced.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, second?: unknown, third?: unknown) => {
      const isOpts = (v: unknown) => v != null && typeof v === 'object';
      const fallback = typeof second === 'string' ? second : '';
      const opts = (isOpts(second) ? second : isOpts(third) ? third : {}) as Record<
        string,
        unknown
      >;
      const template =
        typeof opts.defaultValue === 'string' ? opts.defaultValue : fallback;
      return template.replace(/{{(\w+)}}/g, (_m, name) =>
        opts[name] === undefined ? `{{${name}}}` : String(opts[name]),
      );
    },
    i18n: { language: 'en' },
  }),
}));

import * as React from 'react';
import { create } from 'react-test-renderer';
import { act } from 'react';
import { SunnahTile } from '../src/screens/log/SunnahTile';
import type { AppPalette } from '../src/theme/appPalette';

const palette = {
  isDark: false,
  text: '#1A1814',
  muted: '#6B6660',
  controlBg: '#F4F0E9',
  accentSolid: '#1F5F4A',
  onAccent: '#FFFFFF',
} as unknown as AppPalette;

type Renderer = ReturnType<typeof create>;

async function render(
  prayer: 'Fajr' | 'Dhuhr' | 'Asr' | 'Isha',
  count: number,
  notYet?: boolean,
) {
  const onPress = jest.fn();
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <SunnahTile
        prayer={prayer}
        count={count}
        palette={palette}
        notYet={notYet}
        onPress={onPress}
      />,
    );
  });
  return { tree, onPress };
}

/** The tile itself — the one node carrying an accessibility state. */
function control(tree: Renderer) {
  return tree.root.find(
    n => typeof n.type === 'string' && n.props?.accessibilityState != null,
  );
}

/** Every pip — the little circles that carry the count. */
function pips(tree: Renderer) {
  return tree.root.findAll(
    n =>
      typeof n.type === 'string' &&
      Array.isArray(n.props?.style) &&
      JSON.stringify(n.props.style).includes('"width":8'),
  );
}

/** A pip counts as filled when it has been given a background. */
function filled(tree: Renderer) {
  return pips(tree).filter(p =>
    JSON.stringify(p.props.style).includes('backgroundColor'),
  );
}

function text(tree: Renderer): string {
  return tree.root
    .findAll(n => typeof n.type === 'string' && typeof n.props?.children === 'string')
    .map(n => String(n.props.children))
    .join(' ');
}

describe('the tile shows its own state', () => {
  it('draws one pip for Fajr and fills it when logged', async () => {
    const empty = await render('Fajr', 0);
    expect(pips(empty.tree)).toHaveLength(1);
    expect(filled(empty.tree)).toHaveLength(0);

    const done = await render('Fajr', 1);
    expect(filled(done.tree)).toHaveLength(1);
  });

  it('draws two pips for Dhuhr and fills them one at a time', async () => {
    for (const [count, lit] of [
      [0, 0],
      [1, 1],
      [2, 2],
    ] as const) {
      const { tree } = await render('Dhuhr', count);
      expect(pips(tree)).toHaveLength(2);
      expect(filled(tree)).toHaveLength(lit);
    }
  });

  it('says how far along it is, so the next tap is predictable', async () => {
    const { tree } = await render('Isha', 1);
    expect(text(tree)).toContain('1 of 2');
  });
});

describe('Asr', () => {
  it('is drawn rather than left as a hole in the row', async () => {
    const { tree } = await render('Asr', 0);
    expect(pips(tree)).toHaveLength(1);
    expect(text(tree)).toContain('None');
  });

  it('is not pressable, and says why to a screen reader', async () => {
    const { tree, onPress } = await render('Asr', 0);
    const pressable = tree.root.find(
      n => typeof n.type === 'string' && n.props?.accessibilityState != null,
    );
    expect(pressable.props.accessibilityState.disabled).toBe(true);
    expect(String(pressable.props.accessibilityLabel)).toContain('no sunnah');
    // Even if something did fire it, the handler must not be reachable.
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('a prayer whose time has not come', () => {
  it('is inert, exactly as the status chips beside it are', async () => {
    // `disabled` is consumed by Pressable and never reaches the host node,
    // so the accessibility state is what there is to assert on — which is
    // also the half of it a screen-reader user actually meets.
    const { tree } = await render('Dhuhr', 0, true);
    expect(control(tree).props.accessibilityState.disabled).toBe(true);
  });

  it('is dimmed, but still says what it is rather than "None"', async () => {
    // The Asr wording is a permanent fact about Asr. A prayer that simply
    // has not happened yet must not borrow it — nothing is being claimed
    // about whether it carries a sunnah, only about the clock.
    const { tree } = await render('Dhuhr', 0, true);
    expect(text(tree)).toContain('0 of 2');
    expect(text(tree)).not.toContain('None');
    expect(JSON.stringify(control(tree).props.style)).toContain('"opacity":0.4');
  });

  it('stays live once something is already logged against it', async () => {
    // The screen only passes `notYet` while the count is zero, so this is
    // the state a mis-tap leaves behind: it has to remain undoable.
    const { tree } = await render('Dhuhr', 1, false);
    expect(control(tree).props.accessibilityState.disabled).toBe(false);
  });

  it('cannot resurrect Asr, which has no sunnah at any hour', async () => {
    const { tree } = await render('Asr', 0, false);
    expect(control(tree).props.accessibilityState.disabled).toBe(true);
  });
});

describe('accessibility', () => {
  it('reads the count out, not just the prayer name', async () => {
    const { tree } = await render('Dhuhr', 1);
    const label = String(control(tree).props.accessibilityLabel);
    expect(label).toContain('1');
    expect(label).toContain('2');
  });
});
