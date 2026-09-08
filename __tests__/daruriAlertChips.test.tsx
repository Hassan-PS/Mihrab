/**
 * Settings → the second-time alert chips — issue #19, moved by #23.
 *
 * The chips now live on the Notifications page rather than inside the
 * Calculation card: they fire, and Prayer times is about what the times
 * ARE. The Ḥanafī warning stayed with the calculation, which is the one
 * place this feature can make a card contradict itself.
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
import { MalikiAlertsCard } from '../src/screens/settings/MalikiAlertsCard';

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
  madhab: null as null | 'hanafi' | 'maliki' | 'shafii' | 'hanbali',
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

/** The alerts, wherever they live — Notifications, since #23. */
function render(settings: Partial<typeof BASE> = {}) {
  mockSettings = { ...BASE, ...settings };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<MalikiAlertsCard onOpenDaruriLeadPicker={jest.fn()} />);
  });
  return tree;
}

/** The calculation half, which kept the switch and the warning. */
function renderCalculation(settings: Partial<typeof BASE> = {}) {
  mockSettings = { ...BASE, ...settings };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <CalculationCard
        onOpenMethodPicker={jest.fn()}
        onOpenOffsetsModal={jest.fn()}
        onOpenMadhabPicker={jest.fn()}
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
  it('are absent until the second times are on, and say why', () => {
    const texts = textsOf(render({ malikiSecondTimesEnabled: false }));
    expect(texts).not.toContain('settings.malikiAlerts');
    // Not simply gone: a card that vanishes leaves a reader hunting for a
    // control they remember, on the screen it is supposed to be on.
    expect(texts).toContain('settings.malikiAlertsDisabled');
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

/**
 * The Ḥanafī warning — and who can still see it after #21.
 *
 * Choosing a school offers the second times under Mālikī, so the
 * combination this warning explains is no longer reachable by picking
 * one. It is still reachable by having had it on before the upgrade, and
 * those installs keep the feature rather than losing it silently — so the
 * warning stays, for exactly them. Both cases below therefore start with
 * the switch already on, which is the only way it is drawn now.
 */
describe('the Ḥanafī warning', () => {
  it('replaces the help text when Ḥanafī ʿAṣr is on', () => {
    expect(
      textsOf(renderCalculation({ school: 0, malikiSecondTimesEnabled: true })),
    ).toContain('settings.malikiSecondTimesHelp');
    const hanafi = textsOf(
      renderCalculation({ school: 1, malikiSecondTimesEnabled: true }),
    );
    expect(hanafi).toContain('settings.malikiSecondTimesHanafiWarning');
    expect(hanafi).not.toContain('settings.malikiSecondTimesHelp');
  });

  it('is drawn in the danger colour, not the muted one', () => {
    const tree = renderCalculation({
      school: 1,
      malikiSecondTimesEnabled: true,
    });
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

/**
 * The split itself — issue #23.
 *
 * "Keep Settings > Prayer Times strictly focused on calculation
 * parameters and time displays; move all notification triggers into
 * Settings > Notifications."
 *
 * The line is what a control DOES, not what it is about. Whether the
 * boundaries are computed, and whether they are printed on the day's
 * card, are questions about the times. Which of them are announced, how
 * much warning, and whether the end of the window is announced too — those
 * fire, so they moved. A test rather than a comment, because the tempting
 * place to add the next alert is next to the switch that enables it.
 */
describe('what fires is on the Notifications page', () => {
  const CALCULATION_KEEPS = [
    'settings.malikiSecondTimes',
    'settings.malikiRows',
  ];
  const NOTIFICATIONS_TAKE = [
    'settings.malikiAlerts',
    'settings.malikiAlertsHelp',
    'settings.malikiEndAlerts',
  ];

  it('the calculation card no longer announces anything', () => {
    const texts = textsOf(
      renderCalculation({
        malikiSecondTimesEnabled: true,
        malikiSecondTimeAlerts: ['AsrDaruri'],
      }),
    );
    for (const key of NOTIFICATIONS_TAKE) expect(texts).not.toContain(key);
    for (const key of CALCULATION_KEEPS) expect(texts).toContain(key);
  });

  it('the alerts card announces and nothing else', () => {
    const texts = textsOf(
      render({
        malikiSecondTimesEnabled: true,
        malikiSecondTimeAlerts: ['AsrDaruri'],
      }),
    );
    for (const key of NOTIFICATIONS_TAKE) expect(texts).toContain(key);
    // The switch that computes them, and the one that prints them, stayed
    // where the times are decided.
    expect(texts).not.toContain('settings.malikiRows');
  });

  it('nothing stored changed name, so no configuration moved', () => {
    // The whole change is which screen draws the control. A settings key
    // renamed here would silently reset whatever a reader had chosen.
    const tree = render({
      malikiSecondTimesEnabled: true,
      malikiSecondTimeAlerts: [],
    });
    act(() => chipsOf(tree)[2].props.onPress());
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      malikiSecondTimeAlerts: ['AsrDaruri'],
    });
  });
});
