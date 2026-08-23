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
  useTranslation: () => ({
    // Enough to tell strings apart without pulling in the locale bundles.
    t: (key: string, vars?: Record<string, unknown>) =>
      vars && typeof vars === 'object' && !Array.isArray(vars)
        ? `${key}:${Object.values(vars).join(',')}`
        : key,
  }),
}));

import { Alert, Text, TextInput } from 'react-native';
import { SyncScreen } from '../src/screens/SyncScreen';
import {
  forgetCachedIdentity,
  myPairingCode,
} from '../src/sync/deviceIdentity';
import { forgetCachedPeers, listPeers } from '../src/sync/peers';
import { isValid } from '../src/sync/pairingCode';

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
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render();

    const input = tree.root.findByProps({ testID: 'sync-code-input' });
    await act(async () => {
      input.props.onChangeText('MHRB-NOPE');
    });
    await act(async () => {
      tree.root.findByProps({ testID: 'sync-pair' }).props.onPress();
    });

    // One alert, and it is the error rather than the confirmation — the
    // difference between telling the user and asking them to approve
    // something that cannot work.
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('sync.errorBadCodeTitle');
    expect(await listPeers()).toEqual([]);
  });

  it('asks before pairing, and names the fingerprint it is about to trust', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

    expect(alert).toHaveBeenCalledTimes(1);
    expect(String(alert.mock.calls[0][0])).toMatch(/^sync\.pairWarnTitle:\d{6}$/);
    // Nothing is written until the user says yes.
    expect(await listPeers()).toEqual([]);
  });

  it('refuses this device’s own code with its own message', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
    const confirm = alert.mock.calls[0][2]?.[1];
    expect(confirm?.text).toBe('sync.pairConfirm');
    await act(async () => {
      confirm?.onPress?.();
    });
    await act(async () => {});

    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[1][1]).toBe('sync.errorThisDevice');
    expect(await listPeers()).toEqual([]);
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
