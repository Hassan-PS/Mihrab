/**
 * What happens when there is no Keychain at all.
 *
 * Not a hypothetical: the Homebrew macOS build cannot claim
 * `keychain-access-groups` — it is a restricted entitlement and a
 * Developer ID build signed outside Xcode embeds no profile to authorise
 * it, and claiming it anyway makes the app unlaunchable rather than
 * degraded. So on that one channel every encrypted read and write fails,
 * permanently, and retrying is not a strategy.
 *
 * These pin the two things that follow: a value still lands somewhere,
 * and the module says out loud that it had to.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import {
  durableEncryptedGet,
  durableEncryptedSet,
  encryptedStoreDegraded,
  resetEncryptedStoreDegraded,
} from '../src/storage/durableWrite';

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const enc = EncryptedStorage as jest.Mocked<typeof EncryptedStorage>;
const REFUSED = new Error('RNEncryptedStorageError: -34018');

beforeEach(async () => {
  jest.clearAllMocks();
  resetEncryptedStoreDegraded();
  await AsyncStorage.clear();
});

describe('with no keychain', () => {
  it('keeps the value rather than losing it, and says it is degraded', async () => {
    enc.setItem.mockRejectedValue(REFUSED);
    enc.getItem.mockRejectedValue(REFUSED);

    // No throw: the alternative to a worse store is no store.
    await durableEncryptedSet('prayerapp.sync.secret.v1', 'aGVsbG8=');
    expect(encryptedStoreDegraded()).toBe(true);
    expect(await AsyncStorage.getItem('prayerapp.unprotected.prayerapp.sync.secret.v1'))
      .toBe('aGVsbG8=');
  });

  it('reads back what it wrote, so an identity survives a restart', async () => {
    enc.setItem.mockRejectedValue(REFUSED);
    enc.getItem.mockRejectedValue(REFUSED);

    await durableEncryptedSet('prayerapp.sync.secret.v1', 'aGVsbG8=');
    expect(await durableEncryptedGet('prayerapp.sync.secret.v1')).toBe('aGVsbG8=');
  });

  it('reports a key nobody has ever written as absent, not as an error', async () => {
    // Throwing here is what left sync unable to start: getDeviceIdentity
    // rejected on first launch and there was no first launch to get past.
    enc.getItem.mockRejectedValue(REFUSED);
    await expect(durableEncryptedGet('prayerapp.sync.peers.v1')).resolves.toBeNull();
  });
});

describe('with a working keychain', () => {
  it('writes nothing in plaintext and stays undegraded', async () => {
    enc.setItem.mockResolvedValue(undefined);
    enc.getItem.mockResolvedValue('kept');

    await durableEncryptedSet('prayerapp.journal.v1', 'kept');
    expect(encryptedStoreDegraded()).toBe(false);
    expect(await AsyncStorage.getItem('prayerapp.unprotected.prayerapp.journal.v1'))
      .toBeNull();
    expect(await durableEncryptedGet('prayerapp.journal.v1')).toBe('kept');
  });

  it('picks up what the fallback holds when the store comes back empty', async () => {
    // A device that spent a release without a Keychain has its whole
    // history in the plaintext copy. Answering "nothing here" would read
    // as a first launch and start the user over.
    await AsyncStorage.setItem('prayerapp.unprotected.prayerapp.journal.v1', 'older');
    enc.getItem.mockResolvedValue(null);

    expect(await durableEncryptedGet('prayerapp.journal.v1')).toBe('older');
  });

  it('drains the plaintext copy once a real write lands', async () => {
    await AsyncStorage.setItem('prayerapp.unprotected.prayerapp.journal.v1', 'older');
    enc.setItem.mockResolvedValue(undefined);

    await durableEncryptedSet('prayerapp.journal.v1', 'newer');
    expect(await AsyncStorage.getItem('prayerapp.unprotected.prayerapp.journal.v1'))
      .toBeNull();
  });

  it('still retries a flaky write before giving up on the store', async () => {
    enc.setItem
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce(undefined);

    await durableEncryptedSet('prayerapp.journal.v1', 'kept');
    expect(enc.setItem).toHaveBeenCalledTimes(2);
    expect(encryptedStoreDegraded()).toBe(false);
  });
});
