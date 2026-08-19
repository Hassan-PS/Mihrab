/**
 * The four numbers above the graph.
 *
 * `practiceStats.test.ts` proves the arithmetic. This proves the part the
 * arithmetic cannot: that every tile SAYS what it counts. The caption this
 * row replaces read "5-day streak (best 12) · 0-day sunnah · 1 fasts", and
 * Hassan's question about it — "best for a day, a streak or what" — was a
 * design bug, not a misreading. So the assertions here are about labels and
 * units as much as values.
 *
 * The owed tile gets the most coverage because it is the only one that is a
 * control: it has two states, a disabled state, and a screen-reader label
 * that has to carry a number.
 */
// i18n is not initialised under jest, so the real `t` hands back the default
// string with its {{placeholders}} intact — which would let a label pass
// while naming no number at all.
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
import { PracticeStatsRow } from '../src/screens/log/PracticeStatsRow';
import type { PracticeStats } from '../src/practice/practiceStats';
import type { AppPalette } from '../src/theme/appPalette';

const palette = {
  isDark: false,
  text: '#1A1814',
  muted: '#6B6660',
  controlBg: '#F4F0E9',
  accent: '#1F5F4A',
  accentBg: '#E8F0EC',
  danger: '#B3261E',
} as unknown as AppPalette;

type Renderer = ReturnType<typeof create>;

const BASE: PracticeStats = {
  streak: 5,
  bestStreak: 12,
  sunnahRate: 0.68,
  fastsThisMonth: 3,
  owed: [],
};

async function render(over: Partial<PracticeStats> = {}, showingOwed = false) {
  const onToggleOwed = jest.fn();
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <PracticeStatsRow
        stats={{ ...BASE, ...over }}
        palette={palette}
        showingOwed={showingOwed}
        onToggleOwed={onToggleOwed}
      />,
    );
  });
  return { tree, onToggleOwed };
}

/** Every string the row renders, in order, whitespace collapsed. */
function text(tree: Renderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** The owed tile's rendered view — the only node in the row that is a button. */
function owedTile(tree: Renderer) {
  return tree.root.find(
    n => typeof n.type === 'string' && n.props?.accessibilityRole === 'button',
  );
}

/**
 * The `Pressable` itself, one level up from the view it renders.
 *
 * The host node carries the accessibility props but not `onPress` — RN turns
 * that into responder handlers on the way down — so state is read off the
 * view above and the press is fired from the element here.
 */
function owedPressable(tree: Renderer) {
  return tree.root.find(
    n =>
      typeof n.type !== 'string' &&
      n.props?.accessibilityRole === 'button' &&
      typeof n.props?.onPress === 'function',
  );
}

describe('every tile names its own unit', () => {
  it('puts the unit in the value, not beside the label', async () => {
    const { tree } = await render();
    const s = text(tree);
    // "5 days", not "5" next to a bare word — the ambiguity the caption had.
    expect(s).toContain('5 days');
    // The labels are upper-cased by `textTransform`, so the STRING is still
    // sentence case — asserting the rendered caps here would be asserting a
    // stylesheet, and would break the day someone translates the row.
    expect(s).toContain('On-time streak');
    expect(s).toContain('68%');
    expect(s).toContain('Sunnah kept');
    expect(s).toContain('3 days');
    expect(s).toContain('Fasted');
  });

  it('shows the best streak only once there is one', async () => {
    expect(text((await render()).tree)).toContain('best 12');
    expect(text((await render({ bestStreak: 0 })).tree)).not.toContain('best');
  });

  it('dates the two monthly figures, so 68% cannot mean "ever"', async () => {
    // Both the sunnah rate and the fast count are month-to-date; a rate with
    // no window on it is a number you cannot act on.
    const s = text((await render()).tree);
    expect(s.match(/this month/g)).toHaveLength(2);
  });
});

describe('a rate with no days behind it is not zero', () => {
  it('shows an em-dash rather than 0% before the month has begun', async () => {
    const s = text((await render({ sunnahRate: null })).tree);
    expect(s).toContain('—');
    // A fresh install reading "0% SUNNAH KEPT" is the app calling someone a
    // failure on the strength of no evidence.
    expect(s).not.toContain('0%');
  });

  it('rounds rather than truncating', async () => {
    expect(text((await render({ sunnahRate: 0.666 })).tree)).toContain('67%');
  });
});

describe('the owed tile', () => {
  const owed = [
    { date: '2026-08-17', prayer: 'Asr' as const },
    { date: '2026-08-14', prayer: 'Fajr' as const },
  ];

  it('goes quiet and unpressable when nothing is owed', async () => {
    const { tree } = await render({ owed: [] });
    expect(owedTile(tree).props.accessibilityState.disabled).toBe(true);
    expect(owedPressable(tree).props.disabled).toBe(true);
    expect(text(tree)).toContain('Nothing owed');
    // No call to action, because there is no action.
    expect(text(tree)).not.toContain('tap to see');
  });

  it('asks to be tapped when something is owed, and toggles', async () => {
    const { tree, onToggleOwed } = await render({ owed });
    expect(text(tree)).toContain('Prayers owed');
    expect(text(tree)).toContain('tap to see');
    expect(owedPressable(tree).props.disabled).toBe(false);
    await act(async () => owedPressable(tree).props.onPress());
    expect(onToggleOwed).toHaveBeenCalledTimes(1);
  });

  it('says it is showing, and reports expanded, once open', async () => {
    const { tree } = await render({ owed }, true);
    expect(text(tree)).toContain('showing');
    expect(owedTile(tree).props.accessibilityState.expanded).toBe(true);
  });

  it('carries the number into the screen-reader label', async () => {
    // Regression guard: this string used `{{count}}`, which i18next reads as
    // a plural SELECTOR rather than an interpolation — so Arabic would have
    // needed six forms, and any locale missing them would have announced the
    // raw placeholder. It is `{{owed}}` for that reason.
    const { tree } = await render({ owed });
    const label = owedTile(tree).props.accessibilityLabel;
    expect(label).toContain('2');
    expect(label).not.toContain('{{');
  });
});
