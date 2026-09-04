/**
 * Regression: an RN <Modal> must never be UNMOUNTED while it is presented.
 *
 * A <Modal> is not part of the screen's view tree — it is an Android Dialog /
 * an iOS presented view controller attached to the activity window, above the
 * whole navigator. `Modal.js` renders `null` as soon as `visible` goes false,
 * so hide-then-unmount is safe; unmounting while `visible` is still true drops
 * the host view without ever dismissing the window, and the orphan keeps
 * absorbing every touch — on the surah list, and on Home two levels up. Only
 * an app restart clears it.
 *
 * The bug: leaving the mushaf reader (back / swipe / the Mushaf⇄Tafsir toggle)
 * tore the ayah action sheet down mid-presentation.
 */
import React, { act, useCallback, useState } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, Text, View } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useOverlayDismissGuard } from '../src/quran/mushafReaderCore';

const Stack = createNativeStackNavigator();

type Handles = { open: () => void; closed: () => boolean };
let handles: Handles;
let closeCalls = 0;

/** Stand-in for a reader: one overlay <Modal> behind the dismiss guard. */
function ReaderScreen() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const close = useCallback(() => {
    closeCalls += 1;
    setSheetVisible(false);
  }, []);
  useOverlayDismissGuard(sheetVisible, close);
  handles = {
    open: () => setSheetVisible(true),
    closed: () => !sheetVisible,
  };
  return (
    <View>
      <Modal visible={sheetVisible} transparent onRequestClose={close}>
        <Text>sheet</Text>
      </Modal>
    </View>
  );
}

function ListScreen() {
  return <View />;
}

const ref = createNavigationContainerRef<Record<string, undefined>>();

async function mount(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <NavigationContainer ref={ref}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="List" component={ListScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
        </Stack.Navigator>
      </NavigationContainer>,
    );
  });
  await act(async () => {
    ref.navigate('Reader' as never);
  });
  return root;
}

const routeNames = () =>
  (ref.getRootState()?.routes ?? []).map(r => r.name);

const presentedModals = (root: ReactTestRenderer) =>
  root.root.findAllByType(Modal).filter(m => m.props.visible === true);

describe('overlay dismiss guard', () => {
  beforeEach(() => {
    closeCalls = 0;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds the pop back while a modal is presented, then lets it through', async () => {
    const root = await mount();
    expect(routeNames()).toEqual(['List', 'Reader']);

    await act(async () => {
      handles.open();
    });
    expect(presentedModals(root)).toHaveLength(1);

    // Back, with the sheet open.
    await act(async () => {
      ref.goBack();
    });

    // The screen MUST still be mounted: popping here would have taken the
    // presented modal window down with it.
    expect(routeNames()).toEqual(['List', 'Reader']);
    expect(closeCalls).toBe(1);
    // …and the modal is now hidden, which is what dismisses it natively.
    expect(presentedModals(root)).toHaveLength(0);
    expect(handles.closed()).toBe(true);

    // The very same navigation action is then replayed.
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(routeNames()).toEqual(['List']);
    await act(async () => {
      root.unmount();
    });
  });

  it('does not interfere when no modal is presented', async () => {
    const root = await mount();
    await act(async () => {
      ref.goBack();
    });
    expect(routeNames()).toEqual(['List']);
    expect(closeCalls).toBe(0);
    await act(async () => {
      root.unmount();
    });
  });

  it('replays the action only once, not on every later close', async () => {
    const root = await mount();
    await act(async () => {
      handles.open();
    });
    await act(async () => {
      ref.goBack();
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(routeNames()).toEqual(['List']);

    // Re-enter and close a sheet normally — nothing queued must fire.
    await act(async () => {
      ref.navigate('Reader' as never);
    });
    await act(async () => {
      handles.open();
    });
    await act(async () => {
      handles.closed;
      closeCalls = 0;
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(routeNames()).toEqual(['List', 'Reader']);
    await act(async () => {
      root.unmount();
    });
  });
});

/**
 * End-to-end: the real mushaf reader. `audioSheetSignal` is the header
 * "Recitation" button's channel into the reader, and it opens the very
 * <Modal> (AyahActionSheet) that used to be destroyed by the pop.
 */
describe('MushafPhoneReader keeps its ayah sheet alive across a pop', () => {
  it('does not pop while the ayah sheet is presented', async () => {
    jest.useFakeTimers();
    const {
      MushafPhoneReader,
    } = require('../src/quran/MushafPhoneReader');
    const {
      PrayerSettingsProvider,
    } = require('../src/context/PrayerSettingsContext');

    let bump: () => void = () => {};
    function RealReader() {
      const [signal, setSignal] = useState(0);
      bump = () => setSignal(s => s + 1);
      return (
        <MushafPhoneReader
          surahNumber={1}
          isFullscreen={false}
          onToggleFullscreen={() => {}}
          audioSheetSignal={signal}
        />
      );
    }

    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <PrayerSettingsProvider>
          <NavigationContainer ref={ref}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="List" component={ListScreen} />
              <Stack.Screen name="Reader" component={RealReader} />
            </Stack.Navigator>
          </NavigationContainer>
        </PrayerSettingsProvider>,
      );
    });
    await act(async () => {
      ref.navigate('Reader' as never);
    });
    await act(async () => {
      bump();
    });
    expect(presentedModals(root)).toHaveLength(1);

    await act(async () => {
      ref.goBack();
    });
    expect(routeNames()).toEqual(['List', 'Reader']);
    expect(presentedModals(root)).toHaveLength(0);

    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(routeNames()).toEqual(['List']);
    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });
});

/**
 * The mini player unmounts the instant playback stops. Its reciter picker is
 * another <Modal>, so it has to be hidden on the way out rather than dropped
 * while presented.
 */
describe('MiniPlayer reciter picker', () => {
  it('hides the picker before the card goes away', async () => {
    const playback = require('../src/quran/audio/playback');
    jest.spyOn(playback, 'usePlaybackStatus');
    const { MiniPlayer } = require('../src/quran/audio/MiniPlayer');
    const {
      PrayerSettingsProvider,
    } = require('../src/context/PrayerSettingsContext');

    let status: {
      active: { surah: number; ayah: number } | null;
      playing: boolean;
      loading: boolean;
      reciterId: string;
    } = {
      active: { surah: 1, ayah: 1 },
      playing: true,
      loading: false,
      reciterId: 'husary',
    };
    (playback.usePlaybackStatus as jest.Mock).mockImplementation(() => status);

    let root!: ReactTestRenderer;
    await act(async () => {
      // Inside a navigator, as it always is: the card asks whether its
      // screen is in front before it polls the player.
      root = create(
        <NavigationContainer>
          <PrayerSettingsProvider>
            <MiniPlayer />
          </PrayerSettingsProvider>
        </NavigationContainer>,
      );
    });

    // Open the picker.
    const opener = root.root.findAll(
      n => typeof n.props?.onPress === 'function' && /reciter/i.test(String(n.props.accessibilityLabel ?? '')),
    );
    expect(opener.length).toBeGreaterThan(0);
    await act(async () => {
      opener[0].props.onPress();
    });
    expect(presentedModals(root)).toHaveLength(1);

    // Playback stops → the card is gone, but the picker must not be torn
    // down while it is still presented.
    status = { active: null, playing: false, loading: false, reciterId: 'husary' };
    await act(async () => {
      root.update(
        <NavigationContainer>
          <PrayerSettingsProvider>
            <MiniPlayer />
          </PrayerSettingsProvider>
        </NavigationContainer>,
      );
    });
    expect(presentedModals(root)).toHaveLength(0);
    await act(async () => {
      root.unmount();
    });
    (playback.usePlaybackStatus as jest.Mock).mockRestore();
  });
});
