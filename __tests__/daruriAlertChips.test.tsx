/**
 * Settings → the second-time alert chips — issue #19.
 *
 * What is pinned here is restraint made visible. The chips only exist
 * once the times themselves are on, none of them are lit to begin with,
 * and "how much warning" only appears once something is actually going
 * to fire — a question about nothing is worse than no question.
 *
 * Also the Ḥanafī warning, because it is the one place this feature can
 * make a card contradict itself and the copy is the only thing standing
 * between a user and thinking it a bug.
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
      accentSolid: '#0F5132',
      accentBg: '#E7F0EA',
      overlay: 'rgba(0,0,0,0.4)',
      danger: '#B91C1C',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `mock`-prefixed so the factory below may close over them: jest hoists
// `jest.mock` above the declarations and guards against uninitialised
// captures by name.
const mockUpdateSettings = jest.fn();
let mockSettings: Record<string, unknown>;

jest.mock('../src/context/PrayerSettingsContext', () => ({
  usePrayerSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
  }),
}));

import { Text } from 'react-native';
import { CalculationCard } from '../src/screens/settings/CalculationCard';

/**
 * The chips, by role rather than by component type — under the RN jest
 * preset a `Pressable` is not the type it was written as, and a search
 * for one finds nothing. Deduped by label because the composite and its
 * host node both carry the role.
 */
function chipsOf(tree: ReactTestRenderer) {
  const seen = new Set<string>();
  return tree.root
    .findAll(
      n =>
        n.props?.accessibilityRole === 'checkbox' &&
        typeof n.props?.onPress === 'function',
      { deep: true },
    )
    .filter(n => {
      const label = String(n.props.accessibilityLabel);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

const BASE = {
  calculationMethod: 'auto' as const,
  school: 0,
  dataProvider: 'aladhan',
  dataProviderAuto: true,
  manualLatitude: 33.57,
  manualLongitude: -7.58,
  locationMode: 'manual',
  prayerOffsets: {},
  malikiSecondTimesEnabled: false,
  malikiSecondTimeAlerts: [] as string[],
  malikiSecondTimeAlertMinutes: 15,
};

function render(settings: Partial<typeof BASE> = {}) {
  mockSettings = { ...BASE, ...settings };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <CalculationCard
        onOpenMethodPicker={jest.fn()}
        onOpenOffsetsModal={jest.fn()}
        onOpenDaruriLeadPicker={jest.fn()}
      />,
    );
  });
  return tree;
}

/** Every string the card is currently putting on screen. */
function textsOf(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') return void out.push(node);
    if (Array.isArray(node)) return void node.forEach(walk);
    const n = node as { children?: unknown[] } | null;
    n?.children?.forEach(walk);
  };
  walk(tree.toJSON());
  return out;
}

beforeEach(() => {
  mockUpdateSettings.mockClear();
});

describe('the alert chips', () => {
  it('are absent until the second times are on', () => {
    const texts = textsOf(render({ malikiSecondTimesEnabled: false }));
    expect(texts).not.toContain('settings.malikiAlerts');
  });

  it('appear once they are, with none of them lit', () => {
    const tree = render({ malikiSecondTimesEnabled: true });
    expect(textsOf(tree)).toContain('settings.malikiAlerts');
    const checkboxes = chipsOf(tree);
    expect(checkboxes).toHaveLength(5);
    expect(checkboxes.every(c => c.props.accessibilityState.checked === false)).toBe(true);
  });

  /**
   * "How much warning" with nothing chosen is a question about nothing,
   * and a settings screen that asks those is how a settings screen gets
   * long enough to be frightening.
   */
  it('hide the lead-time row until something will actually fire', () => {
    expect(textsOf(render({ malikiSecondTimesEnabled: true }))).not.toContain(
      'settings.malikiAlertsLead',
    );
    expect(
      textsOf(
        render({
          malikiSecondTimesEnabled: true,
          malikiSecondTimeAlerts: ['AsrDaruri'],
        }),
      ),
    ).toContain('settings.malikiAlertsLead');
  });

  it('adds one to the list when tapped, and takes it away again', () => {
    const tree = render({ malikiSecondTimesEnabled: true });
    const asr = chipsOf(tree)[2];
    act(() => asr.props.onPress());
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      malikiSecondTimeAlerts: ['AsrDaruri'],
    });

    mockUpdateSettings.mockClear();
    const on = render({
      malikiSecondTimesEnabled: true,
      malikiSecondTimeAlerts: ['AsrDaruri'],
    });
    const asrOn = chipsOf(on)[2];
    expect(asrOn.props.accessibilityState.checked).toBe(true);
    act(() => asrOn.props.onPress());
    expect(mockUpdateSettings).toHaveBeenCalledWith({ malikiSecondTimeAlerts: [] });
  });

  /**
   * The stored order follows `DARURI_KEYS`, not the order they were
   * tapped, so the same set is always the same string — otherwise the
   * notification fingerprint sees a change that is not one and rewrites
   * forty alarms for nothing.
   */
  it('keeps the list in a stable order however it was built', () => {
    const tree = render({
      malikiSecondTimesEnabled: true,
      malikiSecondTimeAlerts: ['AsrDaruri'],
    });
    const fajr = chipsOf(tree)[0];
    act(() => fajr.props.onPress());
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      malikiSecondTimeAlerts: ['FajrDaruri', 'AsrDaruri'],
    });
  });
});

describe('the Ḥanafī warning', () => {
  it('replaces the help text when Ḥanafī ʿAṣr is on', () => {
    expect(textsOf(render({ school: 0 }))).toContain(
      'settings.malikiSecondTimesHelp',
    );
    const hanafi = textsOf(render({ school: 1 }));
    expect(hanafi).toContain('settings.malikiSecondTimesHanafiWarning');
    expect(hanafi).not.toContain('settings.malikiSecondTimesHelp');
  });

  it('is drawn in the danger colour, not the muted one', () => {
    const tree = render({ school: 1 });
    const warning = tree.root
      .findAllByType(Text)
      .find(n =>
        JSON.stringify(n.props.children).includes(
          'malikiSecondTimesHanafiWarning',
        ),
      );
    expect(JSON.stringify(warning?.props.style)).toContain('#B91C1C');
  });
});
