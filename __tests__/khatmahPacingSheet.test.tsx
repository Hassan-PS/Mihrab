/**
 * THE PACING SHEET, RENDERED — the switch as a finger meets it.
 *
 * The surface test next door reads the source; this one mounts it, because
 * the claim that matters here is behavioural: the two ways of saying the
 * plan are ONE number underneath, so flipping the segment cannot move the
 * reading it asks for, and whichever way the reader leaves it, what comes
 * out is what was on screen.
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
      controlBg: '#EEEEEE',
      text: '#111111',
      muted: '#666666',
      border: '#DDDDDD',
      accent: '#0F5132',
      accentSolid: '#0F5132',
      accentBg: '#E7F0EA',
      overlay: 'rgba(0,0,0,0.4)',
      danger: '#B91C1C',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    // The English fallback the call site carries, so the labels under
    // test are the ones the code actually names.
    t: (key: string, opts?: unknown) =>
      typeof opts === 'string'
        ? opts
        : ((opts as { defaultValue?: string })?.defaultValue ?? key),
    i18n: { language: 'en' },
  }),
}));

import { KhatmahPacingSheet, type PacingChoice } from '../src/quran/KhatmahPacingSheet';

const DAY = 24 * 60 * 60 * 1000;
const ymd = (at: number) => {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
};

const mounted: ReactTestRenderer[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

type Opened = {
  tree: ReactTestRenderer;
  chosen: PacingChoice[];
  press: (label: string) => Promise<void>;
  confirm: (label: string) => Promise<void>;
};

async function open(
  props: Partial<React.ComponentProps<typeof KhatmahPacingSheet>> = {},
): Promise<Opened> {
  const chosen: PacingChoice[] = [];
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <KhatmahPacingSheet
        visible
        mode="change"
        unreadPages={604}
        onClose={() => {}}
        onChoose={choice => chosen.push(choice)}
        {...props}
      />,
    );
  });
  mounted.push(tree);
  const press = async (label: string) => {
    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: label }).props.onPress();
    });
  };
  return { tree, chosen, press, confirm: press };
}

describe('the sheet a khatmah is paced from', () => {
  it('opens on a length, and reports the length', async () => {
    const { chosen, confirm } = await open();
    await confirm('Set the length');
    expect(chosen).toEqual([{ kind: 'days', days: 30 }]);
  });

  it('opens on the plan in hand when it has a date', async () => {
    const by = ymd(Date.now() + 9 * DAY);
    const { chosen, confirm } = await open({ current: by });
    await confirm('Set the date');
    expect(chosen).toEqual([{ kind: 'date', deadline: by }]);
  });

  it('carries the number across when the reader flips', async () => {
    // Thirty days IS a date thirty days out, and back again. The pace
    // under both is the same pace, which is the whole reason the two
    // live in one sheet.
    const { chosen, press, confirm } = await open({ currentDays: 12 });
    await press('By a date');
    await confirm('Set the date');
    expect(chosen).toEqual([
      { kind: 'date', deadline: ymd(Date.now() + 11 * DAY) },
    ]);
  });

  it('and back, with nothing lost on the way', async () => {
    const by = ymd(Date.now() + 19 * DAY);
    const { chosen, press, confirm } = await open({ current: by });
    await press('A number of days');
    await confirm('Set the length');
    expect(chosen).toEqual([{ kind: 'days', days: 20 }]);
  });

  it('steps the same number whichever view is open', async () => {
    const { chosen, press, confirm } = await open({ currentDays: 30 });
    await press('+ 1 week');
    await press('By a date');
    await press('− 1 day');
    await press('A number of days');
    await confirm('Set the length');
    expect(chosen).toEqual([{ kind: 'days', days: 36 }]);
  });

  it('never goes below a day of reading, however hard it is pushed', async () => {
    const { chosen, press, confirm } = await open({ currentDays: 2 });
    for (let i = 0; i < 6; i++) await press('− 1 week');
    await confirm('Set the length');
    expect(chosen).toEqual([{ kind: 'days', days: 1 }]);
  });

  it('opens where it was asked to, not where the plan is', async () => {
    // The card's "By a date…" chip on a plan that has no date: the reader
    // asked for that view, and gets it.
    const { chosen, confirm } = await open({
      mode: 'start',
      initialKind: 'date',
      currentDays: 30,
    });
    await confirm('Start');
    expect(chosen).toEqual([
      { kind: 'date', deadline: ymd(Date.now() + 29 * DAY) },
    ]);
  });
});
