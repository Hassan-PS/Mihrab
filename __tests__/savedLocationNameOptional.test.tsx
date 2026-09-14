/**
 * A searched location saves without being named.
 *
 * Reported as: search a city, press the button to add it, and nothing
 * happens — the button was greyed out until you typed a name, and a place
 * you just searched for already has one. So the name is optional now: an
 * empty name takes the place's own name (the first part of its label), and
 * the button enables on having a place to save, not on the name field.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockUpdate = jest.fn();
let mockSlice: Record<string, unknown> = {};

jest.mock('../src/context/PrayerSettingsContext', () => ({
  useLocationSettings: () => ({ slice: mockSlice, update: mockUpdate }),
}));
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      card: '#fff', text: '#000', muted: '#888', accent: '#0a0',
      accentBg: '#efe', accentSolid: '#0a0', border: '#ddd', bg: '#fff',
      overlay: '#0008', danger: '#a00', onAccent: '#fff', flatChrome: '#eee',
    },
  }),
}));
// The real search reaches a geocoder. This mock captures the card's
// onSelectPlace so the test can hand it a picked place, the way the search
// list would.
const mockSearch: {
  onSelect: ((p: unknown) => void) | null;
  confirmVariant: string | undefined;
} = { onSelect: null, confirmVariant: undefined };
jest.mock('../src/components/PlaceSearchSection', () => ({
  PlaceSearchSection: (props: {
    onSelectPlace: (p: unknown) => void;
    confirmVariant?: string;
  }) => {
    mockSearch.onSelect = props.onSelectPlace;
    mockSearch.confirmVariant = props.confirmVariant;
    return null;
  },
}));

import { SavedLocationsCard } from '../src/screens/settings/SavedLocationsCard';

const render = (): ReactTestRenderer => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<SavedLocationsCard />);
  });
  return tree;
};

/** Pressable host node whose accessibility label contains `label`. */
const press = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    n =>
      typeof n.props?.onPress === 'function' &&
      typeof n.props?.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.includes(label),
  );

const GOTHENBURG = {
  latitude: 57.7089,
  longitude: 11.9746,
  displayName: 'Göteborg, Västra Götaland County, Sweden',
};

beforeEach(() => {
  mockUpdate.mockClear();
  mockSearch.onSelect = null;
  mockSearch.confirmVariant = undefined;
  // Manual mode, empty list, no current location — so nothing is rescued
  // and the only preset produced is the one under test.
  mockSlice = {
    locationMode: 'manual',
    locationPresets: [],
    manualLatitude: 0,
    manualLongitude: 0,
    manualLocationLabel: undefined,
    activeLocationPresetId: undefined,
    lastFetchedLatitude: undefined,
    lastFetchedLongitude: undefined,
  };
});

describe('saving a searched location with no name', () => {
  it('leaves Save disabled with nothing picked and no name', () => {
    const tree = render();
    act(() => press(tree, 'locations.add').props.onPress());
    // The bug: this was the ONLY way to enable the button — a typed name.
    expect(press(tree, 'locations.save').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('enables Save the moment a place is picked, name still empty', () => {
    const tree = render();
    act(() => press(tree, 'locations.add').props.onPress());
    act(() => mockSearch.onSelect?.(GOTHENBURG));
    expect(press(tree, 'locations.save').props.accessibilityState).toEqual({
      disabled: false,
    });
  });

  it('applies nothing on select — it only stages a draft to be saved', () => {
    const tree = render();
    act(() => press(tree, 'locations.add').props.onPress());
    mockUpdate.mockClear();
    act(() => mockSearch.onSelect?.(GOTHENBURG));
    // The reported bug: the search banner said "Location applied", so the
    // user went home expecting a change — but selecting only fills the draft
    // below, and nothing reaches the live location until Save.
    expect(mockUpdate).not.toHaveBeenCalled();
    // So the card must tell the search to confirm "selected", not "applied".
    expect(mockSearch.confirmVariant).toBe('selected');
  });

  it('saves it under the place’s own name', () => {
    const tree = render();
    act(() => press(tree, 'locations.add').props.onPress());
    act(() => mockSearch.onSelect?.(GOTHENBURG));
    act(() => press(tree, 'locations.save').props.onPress());

    const call = mockUpdate.mock.calls
      .map(c => c[0])
      .find(a => Array.isArray(a.locationPresets));
    expect(call).toBeTruthy();
    const presets = call.locationPresets as Array<{
      name: string;
      latitude: number;
      longitude: number;
    }>;
    expect(presets).toHaveLength(1);
    // "Göteborg" out of "Göteborg, Västra Götaland County, Sweden" — not a
    // name the user had to invent.
    expect(presets[0].name).toBe('Göteborg');
    expect(presets[0].latitude).toBeCloseTo(57.7089, 3);
  });
});
