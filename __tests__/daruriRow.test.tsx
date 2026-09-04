/**
 * What the Today card actually says about a second time — issue #19.
 *
 * The row is the only surface these boundaries reach, so this is where
 * the two promises made in the issue thread are kept: that the modelled
 * ones are not printed in the same confident type as the computed ones,
 * and that a boundary the sky does not produce leaves the row exactly as
 * it was rather than showing a guess.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      bg: '#FFFFFF',
      card: '#F5F5F5',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#0F5132',
      accentBg: '#E7F0EB',
      accentSolid: '#0F5132',
      controlBg: '#EEEEEE',
    },
  }),
}));

jest.mock('../src/hooks/useClockFormatter', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeClockFormatter } = require('../src/utils/clockFormat');
  const formatter = makeClockFormatter(false, 'en');
  return {
    useClockFormatter: () => formatter,
    useSystemIs24Hour: () => true,
  };
});

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'prayer.firstTimeUntil') {
        return `First time until ${(vars as { time: string }).time}`;
      }
      if (key === 'prayer.approx') return 'approx.';
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

import { PrayerRow } from '../src/screens/home/PrayerRow';

/** Every run of text the row actually put on screen, in order. */
function render(props: Record<string, unknown>): string[] {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <PrayerRow
        prayerKey="Asr"
        rawTime="17:04"
        isNext={false}
        isSecondary={false}
        isLast={false}
        {...props}
      />,
    );
  });
  // A <Text> with an interpolated string renders as adjacent runs, so
  // each element's own string children are joined — that way an assertion
  // can name a whole line rather than its fragments.
  const joined: string[] = [];
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    const n = node as { children?: unknown[]; type?: string } | null;
    if (!n || !n.children) return;
    const own = n.children.filter(c => typeof c === 'string') as string[];
    if (own.length > 0) joined.push(own.join(''));
    n.children.forEach(collect);
  };
  collect(tree.toJSON());
  return joined;
}

describe('the second-time line', () => {
  it('is absent when the feature is off', () => {
    const lines = render({});
    expect(lines).toContain('17:04');
    expect(lines.some(l => l.includes('First time until'))).toBe(false);
  });

  it('says when the preferred window closes', () => {
    const lines = render({ daruriAt: '19:44' });
    expect(lines).toContain('First time until 19:44');
  });

  /**
   * "The sun has a deep yellow view" is not a solar position, and a row
   * that printed it to the minute alongside the shadow boundary would be
   * claiming more than the app knows.
   */
  it('marks a modelled boundary as approximate', () => {
    const lines = render({ daruriAt: '19:44', daruriApprox: true });
    expect(lines).toContain('First time until approx. 19:44');
  });

  it('leaves the row alone where the sky produced no boundary', () => {
    // What `daruriTimesForDay` returns in Malmö in June: nothing.
    const lines = render({ daruriAt: undefined, daruriApprox: true });
    expect(lines.some(l => l.includes('First time until'))).toBe(false);
  });

  it('formats it the way the user reads a clock', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hook = require('../src/hooks/useClockFormatter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { makeClockFormatter } = require('../src/utils/clockFormat');
    const twelve = makeClockFormatter(true, 'en');
    const spy = jest
      .spyOn(hook, 'useClockFormatter')
      .mockReturnValue(twelve);
    try {
      expect(render({ daruriAt: '19:44' })).toContain(
        'First time until 7:44 PM',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
