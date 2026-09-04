/**
 * The settings rows, as one set of shapes rather than forty copies.
 *
 * Every card used to inline this, about forty times over twelve files:
 *
 *   <View style={[s.card, s.switchRow,
 *     { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
 *
 * Forty chances to use `label` where the neighbour used `valueText`, to
 * forget `cardEdgeStyle` and lose the border under Liquid Glass, or to
 * pad four points differently — which is why the pages did not look like
 * each other. What this file pins is the two things a shared primitive
 * has to get right and a copy-paste cannot: the group owns the surface,
 * and a row never paints one of its own.
 */
import { Switch, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsNavRow,
  SettingsToggleRow,
} from '../src/screens/settings/SettingsGroup';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      card: '#111111',
      text: '#ffffff',
      muted: '#888888',
      accent: '#46a081',
      accentSolid: '#46a081',
      border: '#333333',
      isDark: true,
      flatChrome: false,
    },
  }),
}));

function render(node: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(node);
  });
  return tree.root;
}

/** Every style object applied to a node, flattened. */
function stylesOf(node: TestRenderer.ReactTestInstance): object[] {
  const raw = node.props.style;
  const list = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
  return list.filter(Boolean) as object[];
}

describe('the group owns the surface', () => {
  it('paints exactly one card, whatever it holds', () => {
    const root = render(
      <SettingsGroup title="Alerts">
        <SettingsToggleRow title="A" value onValueChange={() => {}} />
        <SettingsToggleRow title="B" value={false} onValueChange={() => {}} />
        <SettingsToggleRow title="C" value onValueChange={() => {}} />
      </SettingsGroup>,
    );
    const painted = root
      .findAllByType(View)
      .filter(v =>
        stylesOf(v).some(
          st => (st as { backgroundColor?: string }).backgroundColor,
        ),
      );
    expect(painted).toHaveLength(1);
  });

  it('does not let a row paint a box inside the box', () => {
    // A row with its own background draws a card within a card, which is
    // what the first attempt at this looked like.
    const root = render(
      <SettingsToggleRow title="A" value onValueChange={() => {}} />,
    );
    for (const v of root.findAllByType(View)) {
      for (const st of stylesOf(v)) {
        expect(
          (st as { backgroundColor?: string }).backgroundColor,
        ).toBeUndefined();
        expect((st as { borderWidth?: number }).borderWidth).toBeUndefined();
      }
    }
  });

  it('shows its title and its footer', () => {
    const root = render(
      <SettingsGroup title="Alerts" footer="Explained here.">
        <SettingsToggleRow title="A" value onValueChange={() => {}} />
      </SettingsGroup>,
    );
    const text = root.findAllByType(Text).map(n => n.props.children);
    expect(text).toContain('Alerts');
    expect(text).toContain('Explained here.');
  });

  it('does not divide under a row that is not there', () => {
    // Pages hide rows by rendering null. Counting them would leave a
    // hairline under nothing, or under the last visible row.
    const root = render(
      <SettingsGroup>
        <SettingsToggleRow title="A" value onValueChange={() => {}} />
        {null}
        {false}
      </SettingsGroup>,
    );
    const divided = root
      .findAllByType(View)
      .filter(v =>
        stylesOf(v).some(
          st => (st as { borderBottomWidth?: number }).borderBottomWidth,
        ),
      );
    expect(divided).toHaveLength(0);
  });

  it('divides between rows but never after the last', () => {
    const root = render(
      <SettingsGroup>
        <SettingsToggleRow title="A" value onValueChange={() => {}} />
        <SettingsToggleRow title="B" value onValueChange={() => {}} />
        <SettingsToggleRow title="C" value onValueChange={() => {}} />
      </SettingsGroup>,
    );
    const divided = root
      .findAllByType(View)
      .filter(v =>
        stylesOf(v).some(
          st => (st as { borderBottomWidth?: number }).borderBottomWidth,
        ),
      );
    expect(divided).toHaveLength(2);
  });
});

describe('the rows', () => {
  it('a toggle row reports and forwards its switch', () => {
    const onValueChange = jest.fn();
    const root = render(
      <SettingsToggleRow
        title="Prayer alerts"
        help="Adhan at each prayer"
        value
        onValueChange={onValueChange}
      />,
    );
    const sw = root.findByType(Switch);
    expect(sw.props.value).toBe(true);
    act(() => sw.props.onValueChange(false));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('a disabled toggle cannot be flipped', () => {
    const root = render(
      <SettingsToggleRow
        title="A"
        value
        disabled
        onValueChange={() => {}}
      />,
    );
    expect(root.findByType(Switch).props.disabled).toBe(true);
  });

  it('a link row carries its answer where the eye already is', () => {
    const root = render(
      <SettingsLinkRow title="Reciter" value="Al-Husary" onPress={() => {}} />,
    );
    const text = root.findAllByType(Text).map(n => n.props.children);
    expect(text).toContain('Reciter');
    expect(text).toContain('Al-Husary');
  });

  it('a destructive row does not look like a row that opens things', () => {
    const plain = render(
      <SettingsLinkRow title="Backup" onPress={() => {}} />,
    );
    const danger = render(
      <SettingsLinkRow title="Reset app" destructive onPress={() => {}} />,
    );
    const titleColor = (r: ReturnType<typeof render>) =>
      stylesOf(r.findAllByType(Text)[0]).reduce<string | undefined>(
        (acc, st) => (st as { color?: string }).color ?? acc,
        undefined,
      );
    expect(titleColor(danger)).not.toBe(titleColor(plain));
  });

  it('an accessory replaces the chevron rather than joining it', () => {
    const root = render(
      <SettingsLinkRow
        title="Sound"
        onPress={() => {}}
        accessory={<Text>Change</Text>}
      />,
    );
    const text = root.findAllByType(Text).map(n => n.props.children);
    expect(text).toContain('Change');
    expect(text).not.toContain('›');
  });

  it('a nav row is a destination, with its subtitle', () => {
    const onPress = jest.fn();
    const root = render(
      <SettingsNavRow
        title="Prayer times"
        subtitle="Source, method, madhab"
        onPress={onPress}
      />,
    );
    const text = root.findAllByType(Text).map(n => n.props.children);
    expect(text).toContain('Prayer times');
    expect(text).toContain('Source, method, madhab');
  });
});
