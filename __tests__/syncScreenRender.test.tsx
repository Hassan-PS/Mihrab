/**
 * The Sync screen renders, shows the code, and refuses the obvious mistakes.
 *
 * This is a smoke test with teeth rather than a snapshot. What it pins is
 * the handful of things that would ship broken and only show up on a real
 * device: that the pairing code reaches the screen at all, that the QR is
 * drawn from it, and that pairing with this device's own code is refused
 * before anything is written.
 */
import * as React from 'react';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockSecure = new Map<string, string>();

jest.mock('../src/storage/durableWrite', () => ({
  // The store announces writes; `recordChanged` subscribes on import.
  // A mock without it makes every module that saves anything fail to load.
  onDurableWrite: jest.fn(() => () => {}),
  durableEncryptedGet: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockSecure.set(k, v);
  }),
}));

jest.mock('../src/sync/secureRandom', () => {
  const actual = jest.requireActual('../src/sync/secureRandom');
  const { randomBytes: nodeBytes } = require('crypto');
  return {
    ...actual,
    hasSecureRandom: () => true,
    randomBytes: jest.fn(async (n: number) => new Uint8Array(nodeBytes(n))),
  };
});

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
      danger: '#B91C1C',
    },
  }),
}));

jest.mock('react-i18next', () => ({
  // Spread the real module: the screen now reaches i18n transitively through
  // the sync stack, and a mock that replaces the whole module leaves
  // `initReactI18next` undefined at import time.
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({
    // Enough to tell strings apart without pulling in the locale bundles.
    t: (key: string, vars?: Record<string, unknown>) =>
      vars && typeof vars === 'object' && !Array.isArray(vars)
        ? `${key}:${Object.values(vars).join(',')}`
        : key,
  }),
}));

// The picker is native, so in a test it is simply absent — and a screen that
// asks `hasFolderPicker()` first would never reach the code under test.
jest.mock('../src/sync/folderAccess', () => ({
  ...jest.requireActual('../src/sync/folderAccess'),
  hasFolderPicker: () => true,
  pickSyncFolder: jest.fn(),
}));

import { Text, TextInput } from 'react-native';
import { ConfirmModal } from '../src/components/ConfirmModal';
import { SyncScreen } from '../src/screens/SyncScreen';
import {
  forgetCachedIdentity,
  myPairingCode,
} from '../src/sync/deviceIdentity';
import { forgetCachedPeers, listPeers } from '../src/sync/peers';
import {
  forgetCachedSyncSettings,
  getSyncSettings,
} from '../src/sync/syncSettings';
import { isValid } from '../src/sync/pairingCode';
import { pickSyncFolder } from '../src/sync/folderAccess';

/**
 * What the screen is currently saying.
 *
 * The dialog is the app's own `ConfirmModal`, not `Alert.alert` — the
 * stock one drew a Material box in the middle of a screen that has none of
 * that. Read through its props rather than its markup, so a change to how
 * the sheet is drawn does not fail a test about what it says.
 */
function dialogOf(tree: ReactTestRenderer) {
  return tree.root.findByType(ConfirmModal).props;
}

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<SyncScreen />);
  });
  // The identity, name and peer list all resolve after the first paint.
  await act(async () => {});
  return tree;
}

beforeEach(() => {
  mockSecure.clear();
  forgetCachedIdentity();
  forgetCachedPeers();
  forgetCachedSyncSettings();
  jest.restoreAllMocks();
});

describe('the screen', () => {
  it('shows this device’s code, and it is a code that decodes', async () => {
    const tree = await render();
    const shown = tree.root.findByProps({ testID: 'sync-code' });
    const code = shown.props.children as string;

    expect(typeof code).toBe('string');
    expect(isValid(code)).toBe(true);
    expect(code).toBe(await myPairingCode());
  });

  it('draws the QR from the same code, not from something else', async () => {
    const tree = await render();
    const code = tree.root.findByProps({ testID: 'sync-code' }).props
      .children as string;
    // Matched by prop rather than by component type: PairingQr is wrapped in
    // memo(), and the test renderer looks through the wrapper for the inner
    // function. What matters is that something was handed this exact code.
    expect(tree.root.findAllByProps({ code }).length).toBeGreaterThan(0);
  });

  it('says there are no paired devices before any are added', async () => {
    const tree = await render();
    const texts = tree.root
      .findAllByType(Text)
      .map(n => n.props.children)
      .filter(c => typeof c === 'string');
    expect(texts).toContain('sync.noneYet');
  });
});

describe('pairing', () => {
  it('refuses a code that does not decode, without asking to confirm', async () => {
    const tree = await render();

    const input = tree.root.findByProps({ testID: 'sync-code-input' });
    await act(async () => {
      input.props.onChangeText('MHRB-NOPE');
    });
    await act(async () => {
      tree.root.findByProps({ testID: 'sync-pair' }).props.onPress();
    });

    // It tells rather than asks — the difference between informing the user
    // and inviting them to approve something that cannot work. `hideCancel`
    // is how that difference reaches the screen.
    const shown = dialogOf(tree);
    expect(shown.visible).toBe(true);
    expect(shown.title).toBe('sync.errorBadCodeTitle');
    expect(shown.hideCancel).toBe(true);
    expect(await listPeers()).toEqual([]);
  });

  it('asks before pairing, and names the fingerprint it is about to trust', async () => {
    const tree = await render();

    // Another device's code. Any valid one will do; what matters is that the
    // confirmation carries something the user can compare against a screen.
    const other =
      'MHRB-0C5126-0Z4RPK-8ET295-85EQK5-DHSQN0-C8HYB9-V95BPA-WW1HYE-TQE096';
    await act(async () => {
      tree.root
        .findByProps({ testID: 'sync-code-input' })
        .props.onChangeText(other);
    });
    await act(async () => {
      tree.root.findByProps({ testID: 'sync-pair' }).props.onPress();
    });

    const shown = dialogOf(tree);
    expect(shown.visible).toBe(true);
    expect(String(shown.title)).toMatch(/^sync\.pairWarnTitle:\d{6}$/);
    // A question, so it keeps its second button.
    expect(shown.hideCancel).toBe(false);
    // Nothing is written until the user says yes.
    expect(await listPeers()).toEqual([]);
  });

  it('refuses this device’s own code with its own message', async () => {
    const tree = await render();
    const mine = tree.root.findByProps({ testID: 'sync-code' }).props
      .children as string;

    await act(async () => {
      tree.root
        .findByProps({ testID: 'sync-code-input' })
        .props.onChangeText(mine);
    });
    await act(async () => {
      tree.root.findByProps({ testID: 'sync-pair' }).props.onPress();
    });

    // The code is well-formed, so the screen asks first — and the refusal
    // comes from the store, which is the layer that knows who we are.
    const asked = dialogOf(tree);
    expect(asked.confirmLabel).toBe('sync.pairConfirm');
    await act(async () => {
      asked.onConfirm();
    });
    await act(async () => {});

    // The second dialog replaced the first rather than stacking on it.
    const refused = dialogOf(tree);
    expect(refused.visible).toBe(true);
    expect(refused.message).toBe('sync.errorThisDevice');
    expect(await listPeers()).toEqual([]);
  });
});

describe('how often it syncs', () => {
  it('offers the four cadences and stores the one that is tapped', async () => {
    const tree = await render();
    const chips = tree.root
      .findAllByProps({ accessibilityRole: 'radio' })
      .filter(n => typeof n.props.accessibilityLabel === 'string');
    const labels = chips.map(n => n.props.accessibilityLabel);
    expect(labels).toEqual(
      expect.arrayContaining([
        'sync.freqOpen',
        'sync.freqHourly',
        'sync.freqDaily',
        'sync.freqOff',
      ]),
    );

    // Nothing is chosen for the user beyond the default, and the default is
    // the one that needs no explaining.
    expect((await getSyncSettings()).autoFrequency).toBe('open');

    const daily = chips.find(
      n => n.props.accessibilityLabel === 'sync.freqDaily',
    );
    await act(async () => {
      daily?.props.onPress();
    });
    await act(async () => {});
    expect((await getSyncSettings()).autoFrequency).toBe('daily');
  });
});

describe('the device name', () => {
  it('starts from the platform’s guess and is editable', async () => {
    const tree = await render();
    const named = tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'sync.deviceNameLabel');
    expect(named).toBeDefined();
    expect(typeof named?.props.value).toBe('string');
    expect(named?.props.value.length).toBeGreaterThan(0);
  });
});

describe('choosing a folder', () => {
  it('explains a folder it cannot use, rather than quoting Java at the user', async () => {
    // What shipped in 2.10.0 put "java.io.FileNotFoundException: could not
    // create a folder in there" in front of someone whose Nextcloud folder
    // was perfectly good — `String(e)` on a native rejection. The native
    // side answers with a code; the screen owes the user a sentence.
    const failure = Object.assign(new Error('could not create a folder'), {
      code: 'unwritable',
    });
    (pickSyncFolder as jest.Mock).mockRejectedValueOnce(failure);

    const tree = await render();
    await act(async () => {
      tree.root.findByProps({ testID: 'sync-choose-folder' }).props.onPress();
    });
    await act(async () => {});

    const shown = dialogOf(tree);
    expect(shown.visible).toBe(true);
    expect(shown.title).toBe('sync.errorFolderTitle');
    expect(shown.message).toBe('sync.errorFolderUnwritable');
    // Nothing about the exception, its class, or its stack.
    expect(String(shown.message)).not.toMatch(/java\.|Error|Exception/);
  });

  it('says nothing at all when the picker is dismissed', async () => {
    // A cancel is a decision. The screen used to be right about this and it
    // has to stay right about it: null is not an error.
    (pickSyncFolder as jest.Mock).mockResolvedValueOnce(null);

    const tree = await render();
    await act(async () => {
      tree.root.findByProps({ testID: 'sync-choose-folder' }).props.onPress();
    });
    await act(async () => {});

    expect(dialogOf(tree).visible).toBe(false);
  });
});
