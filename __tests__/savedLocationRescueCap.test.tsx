/**
 * Adding a location near the preset cap must not drop it.
 *
 * `onSaveCurrent` can auto-save ("rescue") the current unsaved manual
 * location as a preset before adding the new one (task #136). `addPreset`
 * silently returns the list unchanged at MAX_LOCATION_PRESETS, so at exactly
 * MAX-1 presets the rescue took the last slot and the NEW location — the one
 * the user actually asked for — was dropped, while the switch pointed at the
 * rescued preset with the new location's coordinates. The explicit add must
 * win: the new location is saved and switched to, and the rescue is skipped
 * when there is no room for both.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MAX_LOCATION_PRESETS } from '../src/settings/locationPresets';

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
      overlay: '#0008', danger: '#a00', onAccent: '#fff', flatChrome: false,
    },
  }),
}));
const mockSearch: { onSelect: ((p: unknown) => void) | null } = { onSelect: null };
jest.mock('../src/components/PlaceSearchSection', () => ({
  PlaceSearchSection: (props: { onSelectPlace: (p: unknown) => void }) => {
    mockSearch.onSelect = props.onSelectPlace;
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

const press = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    n =>
      typeof n.props?.onPress === 'function' &&
      typeof n.props?.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.includes(label),
    { deep: true },
  )[0];

// MAX-1 presets, none at the coords below.
const fullMinusOne = Array.from({ length: MAX_LOCATION_PRESETS - 1 }, (_, i) => ({
  id: `p${i}`,
  name: `City ${i}`,
  latitude: 10 + i,
  longitude: 20 + i,
  label: `City ${i}`,
}));

const NEWPLACE = {
  latitude: 1.5,
  longitude: 2.5,
  displayName: 'Reykjavík, Capital Region, Iceland',
};

beforeEach(() => {
  mockUpdate.mockClear();
  mockSearch.onSelect = null;
  // Manual mode, an UNSAVED current location (44,55) not in the list, so a
  // rescue would be wanted — and the list is one below the cap.
  mockSlice = {
    locationMode: 'manual',
    locationPresets: fullMinusOne,
    manualLatitude: 44,
    manualLongitude: 55,
    manualLocationLabel: 'Somewhere',
    activeLocationPresetId: undefined,
    lastFetchedLatitude: undefined,
    lastFetchedLongitude: undefined,
  };
});

describe('adding a location at MAX-1 presets in manual mode', () => {
  it('saves and switches to the NEW location, dropping the rescue not the add', () => {
    const tree = render();
    act(() => press(tree, 'locations.add').props.onPress());
    act(() => mockSearch.onSelect?.(NEWPLACE));
    act(() => press(tree, 'locations.save').props.onPress());

    const call = mockUpdate.mock.calls
      .map(c => c[0])
      .find(a => Array.isArray(a.locationPresets));
    expect(call).toBeTruthy();

    const presets = call.locationPresets as Array<{
      id: string;
      latitude: number;
      longitude: number;
    }>;
    // Filled exactly to the cap: MAX-1 existing + the new one, rescue skipped.
    expect(presets).toHaveLength(MAX_LOCATION_PRESETS);
    // The new location is actually in the list…
    const saved = presets.find(
      p => p.latitude === 1.5 && p.longitude === 2.5,
    );
    expect(saved).toBeTruthy();
    // …the rescued "Somewhere" (44,55) is NOT — no room, so it was skipped…
    expect(presets.some(p => p.latitude === 44 && p.longitude === 55)).toBe(
      false,
    );
    // …and the app switched to the NEW location, coords and active id agreeing.
    expect(call.locationMode).toBe('manual');
    expect(call.manualLatitude).toBe(1.5);
    expect(call.manualLongitude).toBe(2.5);
    expect(call.activeLocationPresetId).toBe(saved!.id);
  });
});
