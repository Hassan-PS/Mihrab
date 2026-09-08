/**
 * Phase 3 of docs/design/redesign-plan.md — surfaces and controls. The new
 * primitives behave as specified, and the screens that hand-rolled them
 * now use them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import * as React from 'react';
import { act } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { create } from 'react-test-renderer';
import { Chip, Group, Row, SegmentedControl, Stepper, Tile } from '../src/components/ui';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      bg: '#FAF7F2',
      card: '#FFFFFF',
      text: '#1A1814',
      muted: '#6B6660',
      border: '#E5E1DA',
      accent: '#1F5F4A',
      accentSolid: '#1F5F4A',
      accentBg: '#E8F0EC',
      onAccent: '#FFFFFF',
      controlBg: '#F4F0E9',
      danger: '#B3261E',
      flatChrome: false,
    },
    isDark: false,
  }),
}));

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const render = (el: React.ReactElement) => {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(el);
  });
  return r;
};
/** The host view under a component — the one whose style is resolved. */
const host = (r: ReturnType<typeof create>, props: Record<string, unknown>) =>
  r.root.findAllByProps(props).find(n => typeof n.type === 'string')!;
const merged = (node: { props: { style?: unknown } }) =>
  Object.assign({}, ...([node.props.style].flat(Infinity).filter(Boolean) as object[])) as Record<
    string,
    unknown
  >;

describe('Chip', () => {
  it('has ink only when chosen, a tint when suggested, nothing otherwise', () => {
    const plain = render(<Chip label="Late" onPress={() => {}} />);
    const suggested = render(<Chip label="On time" suggested onPress={() => {}} />);
    const chosen = render(<Chip label="On time" selected onPress={() => {}} />);
    const bg = (r: ReturnType<typeof create>) =>
      merged(host(r, { accessibilityRole: 'button' })).backgroundColor;
    expect(bg(plain)).toBe('transparent');
    expect(bg(suggested)).toBe('#E8F0EC');
    expect(bg(chosen)).toBe('#1F5F4A');
    // No border on any of them — a quiet row, not a row of outlined pills.
    expect(merged(host(plain, { accessibilityRole: 'button' })).borderWidth).toBeUndefined();
  });
});

describe('SegmentedControl', () => {
  it('fills exactly the selected segment and reports it as checked', () => {
    const r = render(
      <SegmentedControl
        segments={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
          { key: 'c', label: 'C' },
        ]}
        value="b"
        onChange={() => {}}
      />,
    );
    const radios = r.root
      .findAllByProps({ accessibilityRole: 'radio' })
      .filter(n => typeof n.type === 'string');
    expect(radios).toHaveLength(3);
    const filled = radios.filter(n => merged(n).backgroundColor === '#E8F0EC');
    expect(filled).toHaveLength(1);
    expect(filled[0].props.accessibilityState.checked).toBe(true);
  });
});

describe('Group', () => {
  it('draws an inset hairline between rows and none after the last', () => {
    const r = render(
      <Group>
        <Row title="One" />
        <Row title="Two" />
        <Row title="Three" />
      </Group>,
    );
    const lines = r.root
      .findAllByType(View)
      .filter(v => merged(v).height === StyleSheet.hairlineWidth);
    expect(lines).toHaveLength(2);
    expect(lines.every(v => (merged(v).marginStart as number) > 0)).toBe(true);
  });
});

describe('Tile', () => {
  it('keeps the unit inside the value and has no background', () => {
    const r = render(<Tile value="5" unit=" days" label="On-time streak" />);
    // The value Text nests the unit Text, so a walk of the tree finds the
    // unit INSIDE the value node, not beside it.
    const value = r.root
      .findAllByType(Text)
      .find(t => Array.isArray(t.props.children) && t.props.children[0] === '5');
    expect(value).toBeTruthy();
    expect(value!.findAllByType(Text).some(t => t.props.children === ' days')).toBe(true);
    const outer = r.root.findAllByType(View)[0];
    expect(merged(outer).backgroundColor).toBeUndefined();
  });
});

describe('Stepper', () => {
  it('disables a side with nothing to step to, and keeps it drawn', () => {
    const r = render(
      <Stepper title="Today" prevLabel="Previous day" nextLabel="Next day" onPrev={() => {}} />,
    );
    const next = r.root
      .findAllByProps({ accessibilityLabel: 'Next day' })
      .find(n => typeof n.type !== 'string');
    expect(next).toBeTruthy();
    expect(next!.props.accessibilityState.disabled).toBe(true);
  });
});

describe('the screens use them', () => {
  it.each([
    ['src/screens/LogScreen.tsx', ['<Group>', '<Stepper', '<Chip', 'tone="danger"']],
    ['src/screens/log/PracticeStatsRow.tsx', ['<Tile']],
    ['src/screens/FastingScreen.tsx', ['<Group>', '<Tile']],
    ['src/screens/DuasScreen.tsx', ['<Group>', '<Row']],
    ['src/screens/QuranScreen.tsx', ['<SegmentedControl', 'const LIST_GAP = 0']],
    ['src/screens/settings/AppearanceCard.tsx', ['<SegmentedControl']],
    ['src/screens/settings/SettingsGroup.tsx', ['<RowDivider']],
    ['src/screens/month/MonthControls.tsx', ['<Stepper']],
  ])('%s', (file, needles) => {
    const src = read(file);
    for (const n of needles) expect(src).toContain(n);
  });

  it('the Log statistics no longer carry gold or orange', () => {
    const src = read('src/screens/log/PracticeStatsRow.tsx');
    expect(src).not.toMatch(/#E8CE7A|#9A7B1F|#FBBF24|#B45309|tone="gold"|tone="amber"/);
  });

  it('a future prayer on the Log is one quiet line, not four dead chips', () => {
    const src = read('src/screens/LogScreen.tsx');
    expect(src).toContain("t('journal.notYet'");
    expect(src).not.toContain('styles.statusChip');
  });

  it('the alert-mode control takes the accent only when a prayer differs', () => {
    expect(read('src/screens/home/PrayerRow.tsx')).toContain('emphasised={!!overrideMode}');
    const btn = read('src/screens/home/AlertModeButton.tsx');
    expect(btn).toMatch(/!emphasised[\s\S]{0,40}palette\.muted/);
  });
});
