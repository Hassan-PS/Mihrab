/**
 * PrayerSettingsContext slice isolation — task #11.
 *
 * Verifies the headline win of the context split: a consumer subscribed via a
 * narrow slice hook does NOT re-render when an unrelated slice changes.
 * Without slice contexts, every settings change re-renders every subscriber
 * — the "context bloat" the task addresses.
 *
 * Also confirms that `loadSettings()` continues to read the same
 * `prayerapp.settings.v1` AsyncStorage key it always has — the context split
 * is purely a React-tree refactor, not a storage migration.
 */

import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PrayerSettingsProvider,
  useAppearanceSettings,
  useLocationSettings,
  usePrayerSettings,
  useWidgetSettings,
} from '../src/context/PrayerSettingsContext';

beforeEach(async () => {
  if (typeof (AsyncStorage as { clear?: () => Promise<void> }).clear === 'function') {
    await AsyncStorage.clear();
  }
});

/** Renders a child that increments its internal counter on each render. */
function makeCountingConsumer(useHook: () => unknown) {
  const renders = { count: 0 };
  function Consumer() {
    renders.count += 1;
    useHook();
    return <Text>consumer</Text>;
  }
  return { Consumer, renders };
}

/** Test harness exposing imperative `updateSettings` to the test body. */
function makeHarness() {
  let updateSettingsRef: ((p: Record<string, unknown>) => void) | null = null;
  function Setter() {
    const { updateSettings } = usePrayerSettings();
    updateSettingsRef = updateSettings;
    return null;
  }
  return {
    Setter,
    update: (patch: Record<string, unknown>) => {
      if (!updateSettingsRef) throw new Error('Setter not yet rendered');
      updateSettingsRef(patch);
    },
  };
}

async function flush() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
}

type Renderer = ReturnType<typeof create>;

describe('PrayerSettingsContext slice isolation', () => {
  test('useAppearanceSettings does not re-render on widget change', async () => {
    const appearance = makeCountingConsumer(useAppearanceSettings);
    const widget = makeCountingConsumer(useWidgetSettings);
    const harness = makeHarness();

    let root!: Renderer;
    await act(async () => {
      root = create(
        <PrayerSettingsProvider>
          <harness.Setter />
          <appearance.Consumer />
          <widget.Consumer />
        </PrayerSettingsProvider>,
      );
    });
    await flush();

    const appearanceBaseline = appearance.renders.count;
    const widgetBaseline = widget.renders.count;

    // Trigger a widget-only change. The appearance consumer's slice value
    // identity must remain stable, so React skips the re-render.
    await act(async () => {
      harness.update({ androidWidgetBackgroundOpacity: 50 });
    });

    expect(widget.renders.count).toBeGreaterThan(widgetBaseline);
    expect(appearance.renders.count).toBe(appearanceBaseline);

    root.unmount();
  });

  test('useWidgetSettings does not re-render on appearance change', async () => {
    const appearance = makeCountingConsumer(useAppearanceSettings);
    const widget = makeCountingConsumer(useWidgetSettings);
    const harness = makeHarness();

    let root!: Renderer;
    await act(async () => {
      root = create(
        <PrayerSettingsProvider>
          <harness.Setter />
          <appearance.Consumer />
          <widget.Consumer />
        </PrayerSettingsProvider>,
      );
    });
    await flush();

    const appearanceBaseline = appearance.renders.count;
    const widgetBaseline = widget.renders.count;

    await act(async () => {
      harness.update({ appearance: 'dark' });
    });

    expect(appearance.renders.count).toBeGreaterThan(appearanceBaseline);
    expect(widget.renders.count).toBe(widgetBaseline);

    root.unmount();
  });

  test('legacy usePrayerSettings facade still re-renders on any change', async () => {
    const facade = makeCountingConsumer(usePrayerSettings);
    const harness = makeHarness();

    let root!: Renderer;
    await act(async () => {
      root = create(
        <PrayerSettingsProvider>
          <harness.Setter />
          <facade.Consumer />
        </PrayerSettingsProvider>,
      );
    });
    await flush();

    const before = facade.renders.count;
    await act(async () => {
      harness.update({ androidWidgetBackgroundOpacity: 60 });
    });
    expect(facade.renders.count).toBeGreaterThan(before);

    root.unmount();
  });

  test('storage shape is unchanged: loadSettings reads prayerapp.settings.v1', async () => {
    // Pre-seed AsyncStorage with a synthetic blob using the existing key.
    // Then mount the provider and confirm the appearance slice reflects it.
    await AsyncStorage.setItem(
      'prayerapp.settings.v1',
      JSON.stringify({
        appearance: 'dark',
        useSystemDynamicTheme: true,
        pureBlackDark: true,
        language: 'sv',
        locationOnboardingComplete: true,
      }),
    );

    let observed: { appearance?: string; pureBlackDark?: boolean } | null =
      null;
    function Observer() {
      const { slice, hydrated } = useAppearanceSettings();
      if (hydrated) observed = slice;
      return null;
    }

    let root!: Renderer;
    await act(async () => {
      root = create(
        <PrayerSettingsProvider>
          <Observer />
        </PrayerSettingsProvider>,
      );
    });
    await flush();

    expect(observed).not.toBeNull();
    expect(observed!.appearance).toBe('dark');
    expect(observed!.pureBlackDark).toBe(true);

    root.unmount();
  });

  test('changing locationMode clears lastFetched coords (preserved behavior)', async () => {
    let observed: {
      locationMode?: string;
      lastFetchedLatitude?: number;
      lastFetchedLongitude?: number;
    } | null = null;
    function Observer() {
      const { slice } = useLocationSettings();
      observed = slice;
      return null;
    }

    const harness = makeHarness();
    let root!: Renderer;
    await act(async () => {
      root = create(
        <PrayerSettingsProvider>
          <harness.Setter />
          <Observer />
        </PrayerSettingsProvider>,
      );
    });
    await flush();

    // Default locationMode is 'manual'. Switch to 'automatic' first so the
    // mode change actually fires in the next step. Then seed last-fetched
    // coords. Then switch BACK to 'manual' — that's the change that must
    // clear them.
    await act(async () => {
      harness.update({ locationMode: 'automatic' });
    });
    await act(async () => {
      harness.update({
        lastFetchedLatitude: 59.33,
        lastFetchedLongitude: 18.07,
      });
    });
    expect(observed!.lastFetchedLatitude).toBeCloseTo(59.33);

    await act(async () => {
      harness.update({ locationMode: 'manual' });
    });
    expect(observed!.lastFetchedLatitude).toBeUndefined();
    expect(observed!.lastFetchedLongitude).toBeUndefined();

    root.unmount();
  });
});
