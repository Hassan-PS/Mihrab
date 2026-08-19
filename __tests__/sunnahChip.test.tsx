/**
 * The sunnah chip, as a control rather than as arithmetic.
 *
 * `sunnah.test.ts` proves the cycle. This proves what the cycle cannot: that
 * the chip SHOWS where it is — a button that goes 0→1→2→0 with nothing on it
 * is a guessing game — and that Asr, which carries no sunnah, renders NOTHING.
 *
 * That last one is the change from the tile it replaces. The tile stayed on
 * Asr's row and said "None": a control whose entire content is a reason it
 * does nothing, which is worse than an absence. Every other row carrying a
 * gold chip makes Asr's silence self-explanatory.
 */
// i18n is not initialised under jest, so the real `t` hands back the default
// string with its {{placeholders}} intact — which would let the assertions
// below pass on a label that never actually names a number.
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
import { SunnahChip } from '../src/screens/log/SunnahChip';
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
  prayer: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha',
  count: number,
  notYet?: boolean,
) {
  const onPress = jest.fn();
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <SunnahChip
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

/** The chip itself — the one node carrying an accessibility state. */
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
      JSON.stringify(n.props.style).includes('"borderRadius":99') &&
      JSON.stringify(n.props.style).includes('"width":7'),
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
    .findAll(
      n => typeof n.type === 'string' && typeof n.props?.children === 'string',
    )
    .map(n => String(n.props.children))
    .join(' ');
}

describe('the chip shows its own state', () => {
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

  it('names the prayer for a one-unit sunnah, and counts for a two', async () => {
    // "Sunnah" says everything there is to say when there is only one of
    // them; with two, which of the two is the whole question.
    expect(text((await render('Maghrib', 0)).tree)).toContain('Sunnah');
    expect(text((await render('Isha', 1)).tree)).toContain('1/2');
    expect(text((await render('Isha', 2)).tree)).toContain('2/2');
  });
});

describe('Asr', () => {
  it('renders nothing at all — no dead control to explain', async () => {
    const { tree } = await render('Asr', 0);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders nothing even if a count somehow reached it', async () => {
    // Defence in depth: a corrupt store or an old blob cannot conjure a
    // control onto a prayer that carries no sunnah.
    const { tree } = await render('Asr', 2);
    expect(tree.toJSON()).toBeNull();
  });
});

describe('a prayer whose time has not come', () => {
  it('is inert, exactly as the status chips beside it are', async () => {
    const { tree } = await render('Dhuhr', 0, true);
    expect(control(tree).props.accessibilityState.disabled).toBe(true);
  });

  it('is dimmed, and still says what it is', async () => {
    const { tree } = await render('Dhuhr', 0, true);
    expect(text(tree)).toContain('0/2');
    expect(JSON.stringify(control(tree).props.style)).toContain('"opacity":0.4');
  });

  it('stays live once something is already logged against it', async () => {
    // The screen only passes `notYet` while the count is zero, so this is
    // the state a mis-tap leaves behind: it has to remain undoable.
    const { tree } = await render('Dhuhr', 1, false);
    expect(control(tree).props.accessibilityState.disabled).toBe(false);
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
