/**
 * Saved locations and automatic location are not alternatives.
 *
 * Reported as "multiple city gets disabled if the user selects auto
 * location". The card returned null unless the mode was manual, so on
 * automatic there was no list to see, nothing to add to it, and no way to
 * save the city you were standing in without leaving automatic first — and
 * once you left, the home chip's sheet had no row to bring you back.
 *
 * Automatic is where you live. The saved list is the other places you look
 * in on.
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
      overlay: '#0008', danger: '#a00',
    },
  }),
}));
// The place search reaches a geocoder; this test is about the card around it.
// Capture the card's onSelectPlace so a test can hand it a picked city.
const search: { onSelect: ((p: unknown) => void) | null } = { onSelect: null };
jest.mock('../src/components/PlaceSearchSection', () => ({
  PlaceSearchSection: (props: { onSelectPlace?: (p: unknown) => void }) => {
    search.onSelect = props.onSelectPlace ?? null;
    return null;
  },
}));

import { SavedLocationsCard } from '../src/screens/settings/SavedLocationsCard';
import { LocationChip } from '../src/screens/home/LocationChip';

const PRESETS = [
  { id: 'p1', name: 'Malmö', latitude: 55.6, longitude: 13.0, label: 'Malmö' },
  { id: 'p2', name: 'Cairo', latitude: 30.0, longitude: 31.2, label: 'Cairo' },
];

const onAuto = {
  locationMode: 'automatic',
  locationPresets: PRESETS,
  activeLocationPresetId: 'p1',
  manualLatitude: 0,
  manualLongitude: 0,
  lastFetchedLatitude: 59.33,
  lastFetchedLongitude: 18.07,
  autoLocationLabel: 'Stockholm',
};

const render = (el: React.ReactElement): ReactTestRenderer => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(el);
  });
  return tree;
};

/**
 * Every pressable node whose accessibility label contains `label`.
 *
 * Host nodes included: a Pressable renders down to a plain View that
 * carries the label and the handler, and the labels themselves come from
 * i18n, so a substring is the stable thing to match on.
 */
const byLabel = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    n =>
      typeof n.props?.onPress === 'function' &&
      typeof n.props?.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.includes(label),
    { deep: true },
  );

beforeEach(() => {
  mockUpdate.mockClear();
  mockSlice = { ...onAuto };
  search.onSelect = null;
});

describe('the saved-locations card on automatic', () => {
  it('is there at all', () => {
    const tree = render(<SavedLocationsCard />);
    expect(tree.toJSON()).not.toBeNull();
  });

  it('lists the saved places', () => {
    const tree = render(<SavedLocationsCard />);
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Malmö');
    expect(text).toContain('Cairo');
  });

  it('switches to a saved place when one is used', () => {
    const tree = render(<SavedLocationsCard />);
    // i18n hands back raw keys under test, so the key is what to match.
    const use = byLabel(tree, 'locations.use')[0];
    expect(use).toBeTruthy();
    act(() => use.props.onPress());
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        locationMode: 'manual',
        manualLatitude: 55.6,
        activeLocationPresetId: 'p1',
      }),
    );
  });

  it('still renders in manual mode, as it always did', () => {
    mockSlice = { ...onAuto, locationMode: 'manual' };
    expect(render(<SavedLocationsCard />).toJSON()).not.toBeNull();
  });
});

describe('the home chip can bring you back', () => {
  it('offers My location, and it returns to the GPS', () => {
    const tree = render(<LocationChip />);
    const chip = byLabel(tree, 'home.switchLocation')[0];
    act(() => chip.props.onPress());
    // This row passes a defaultValue, so under test i18n hands back the
    // English rather than the key.
    const auto = byLabel(tree, 'My location')[0];
    expect(auto).toBeTruthy();
    act(() => auto.props.onPress());
    expect(mockUpdate).toHaveBeenCalledWith({
      locationMode: 'automatic',
      activeLocationPresetId: undefined,
    });
  });

  it('picking a saved place still switches to it', () => {
    const tree = render(<LocationChip />);
    act(() => byLabel(tree, 'home.switchLocation')[0].props.onPress());
    act(() => byLabel(tree, 'Cairo')[0].props.onPress());
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ locationMode: 'manual', manualLatitude: 30 }),
    );
  });
});


describe('adding a searched city while on automatic', () => {
  // A city not already in the list, and not the GPS fix, so the only preset
  // produced is the one under test.
  const KHARTOUM = {
    latitude: 12.5,
    longitude: 34.5,
    displayName: 'Khartoum, Khartoum State, Sudan',
  };

  const addAndPick = (tree: ReactTestRenderer) => {
    act(() => byLabel(tree, 'locations.add')[0].props.onPress());
    act(() => search.onSelect?.(KHARTOUM));
  };

  it('from Settings browsing: adds the row but stays on GPS', () => {
    const tree = render(<SavedLocationsCard />);
    addAndPick(tree);
    act(() => byLabel(tree, 'locations.save')[0].props.onPress());
    const arg = mockUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(arg).toHaveProperty('locationPresets');
    // The app is still following the phone: no mode change, nothing activated.
    expect(arg).not.toHaveProperty('locationMode');
    expect(arg).not.toHaveProperty('activeLocationPresetId');
  });

  it('from the chip\'s "Add new location": switches to it, leaving GPS', () => {
    // activateOnAdd is set only by the home chip's Add flow. The reported bug:
    // add a city there and it never became the location — the app stayed on
    // GPS. Now the save switches to the new place.
    const tree = render(<SavedLocationsCard activateOnAdd />);
    addAndPick(tree);
    act(() => byLabel(tree, 'locations.save')[0].props.onPress());
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        locationMode: 'manual',
        manualLatitude: 12.5,
        manualLongitude: 34.5,
        manualLocationLabel: 'Khartoum, Khartoum State, Sudan',
        activeLocationPresetId: expect.any(String),
      }),
    );
  });
});
