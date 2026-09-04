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

/**
 * The Ḥanafī conflict, which is the one place this feature can make a
 * card contradict itself.
 *
 * Ẓuhr's ḍarūrī boundary is the 1:1 shadow whatever the app's ʿAṣr
 * setting says — it has to be, it is a Mālikī boundary. On Ḥanafī ʿAṣr
 * that lands roughly half an hour before the ʿAṣr drawn on the row
 * underneath it. Nothing is wrong with either number; they are two
 * madhāhib in one table. But it reads as a bug unless somebody says so,
 * and the place to say it is beside the switch, before it is touched.
 */
describe('the boundary a Hanafi user would find surprising', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { solarDaruriBoundaries } = require('../src/prayer/daruriTimes');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adhan = jest.requireActual('adhan');

  it('sits well before the Hanafi Asr on the row below it', () => {
    const at = new Date(2026, 8, 4, 12, 0, 0);
    const boundary = solarDaruriBoundaries(at, 33.5731, -7.5898).DhuhrDaruri;

    const params = adhan.CalculationMethod.Other();
    params.fajrAngle = 19;
    params.ishaAngle = 17;
    params.madhab = adhan.Madhab.Hanafi;
    const hanafi = new adhan.PrayerTimes(
      new (require('adhan/lib/cjs/Coordinates').default)(33.5731, -7.5898),
      at,
      params,
    );
    const asrMinutes = hanafi.asr.getHours() * 60 + hanafi.asr.getMinutes();
    const [h, m] = boundary.split(':').map(Number);

    // Not a rounding difference — a whole madhhab apart.
    expect(asrMinutes - (h * 60 + m)).toBeGreaterThan(20);
  });
});
