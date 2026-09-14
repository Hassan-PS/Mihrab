/**
 * The search banner tells the truth about what a tap did.
 *
 * `PlaceSearchSection` lives in two kinds of host: ones where tapping a
 * result applies the location immediately (LocationCard, LocationSetup) and
 * ones where the tap only stages a draft to be named and saved
 * (SavedLocationsCard). The banner must not say "Location applied" in the
 * second kind — that lie sent people back to an unchanged home screen. The
 * `confirmVariant` prop picks the honest copy.
 *
 * i18n is not initialised under test, so `t('x')` returns the key `x`; the
 * assertions check which key the banner reaches for.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { PlaceSearchSection } from '../src/components/PlaceSearchSection';

const mockPlace = {
  latitude: 57.7089,
  longitude: 11.9746,
  displayName: 'Göteborg, Västra Götaland County, Sweden',
};

jest.mock('../src/geocoding/nominatim', () => ({
  searchPlaces: jest.fn(() => Promise.resolve([mockPlace])),
}));

const PAL = {
  bg: '#fff', text: '#000', muted: '#888', border: '#ddd', accent: '#0a0',
  accentBg: '#efe', card: '#fff', danger: '#a00', flatChrome: false,
} as const;

const flatten = (c: unknown): string =>
  Array.isArray(c) ? c.map(flatten).join('') : c == null ? '' : String(c);

/** Drive query → debounced search → tap the one result row. */
const pickAResult = async (variant?: 'applied' | 'selected') => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <PlaceSearchSection
        palette={PAL}
        onSelectPlace={() => {}}
        confirmVariant={variant}
      />,
    );
  });
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText('Goteborg');
  });
  // Let the 350ms debounce fire and the mocked search resolve.
  await act(async () => {
    await new Promise(r => setTimeout(r, 450));
  });
  const row = tree.root.find(
    n =>
      typeof n.props?.onPress === 'function' &&
      n.props?.accessibilityLabel === mockPlace.displayName,
  );
  await act(async () => {
    row.props.onPress();
  });
  return tree.root.findAllByType(Text).map(n => flatten(n.props.children));
};

describe('PlaceSearchSection confirmation banner', () => {
  it('says "selected" (not "applied") when confirmVariant=selected', async () => {
    const texts = await pickAResult('selected');
    expect(texts).toContain('placeSearch.selectedTitle');
    expect(texts).not.toContain('placeSearch.appliedTitle');
  });

  it('still says "applied" by default (immediate-apply hosts)', async () => {
    const texts = await pickAResult();
    expect(texts).toContain('placeSearch.appliedTitle');
    expect(texts).not.toContain('placeSearch.selectedTitle');
  });
});
