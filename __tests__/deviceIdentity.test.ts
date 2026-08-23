/**
 * The device identity — generated once, never handed out, and the source of
 * the pairing code the other device will accept.
 */
import nacl from 'tweetnacl';

const mockStore = new Map<string, string>();
let mockRandomCalls = 0;
let mockRandomFails = false;

jest.mock('../src/storage/durableWrite', () => ({
  durableEncryptedGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
}));

jest.mock('../src/sync/secureRandom', () => {
  const actual = jest.requireActual('../src/sync/secureRandom');
  return {
    ...actual,
    randomBytes: jest.fn(async (n: number) => {
      mockRandomCalls++;
      if (mockRandomFails) throw new actual.NoSecureRandom('test');
      // Distinct per call so a second generation is detectable.
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = (mockRandomCalls * 40 + i) & 0xff;
      return out;
    }),
  };
});

import { decode } from '../src/sync/pairingCode';
import {
  fingerprintOf,
  forgetCachedIdentity,
  getDeviceIdentity,
  myFingerprint,
  myPairingCode,
} from '../src/sync/deviceIdentity';

beforeEach(() => {
  mockStore.clear();
  mockRandomCalls = 0;
  mockRandomFails = false;
  forgetCachedIdentity();
});

describe('generating once', () => {
  it('makes a real X25519 pair and keeps the secret out of the public half', async () => {
    const id = await getDeviceIdentity();
    expect(id.publicKey.length).toBe(nacl.box.publicKeyLength);
    expect(id.secretKey.length).toBe(nacl.box.secretKeyLength);
    expect(Array.from(id.publicKey)).not.toEqual(Array.from(id.secretKey));
  });

  it('reuses the stored key instead of generating a second identity', async () => {
    const first = await getDeviceIdentity();
    forgetCachedIdentity();
    const second = await getDeviceIdentity();
    expect(Array.from(second.publicKey)).toEqual(Array.from(first.publicKey));
    expect(mockRandomCalls).toBe(1);
  });

  it('does not generate twice when two callers race on first launch', async () => {
    const [a, b] = await Promise.all([getDeviceIdentity(), getDeviceIdentity()]);
    expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey));
    expect(mockRandomCalls).toBe(1);
  });

  it('treats a corrupted stored key as absent rather than building a stranger', async () => {
    // Half a key. `fromSecretKey` would accept plenty of wrong things and
    // produce an identity no peer has ever seen — which reads as "sync
    // stopped working" rather than "this device re-paired".
    mockStore.set('prayerapp.sync.secret.v1', 'AAAA');
    const id = await getDeviceIdentity();
    expect(id.secretKey.length).toBe(nacl.box.secretKeyLength);
    expect(mockRandomCalls).toBe(1);
  });

  it('throws rather than falling back when the platform has no CSPRNG', async () => {
    mockRandomFails = true;
    await expect(getDeviceIdentity()).rejects.toThrow(/secure random/i);
  });
});

describe('what the user sees', () => {
  it('shows a code that decodes back to this device public key', async () => {
    const id = await getDeviceIdentity();
    const code = await myPairingCode();
    const parsed = decode(code);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(Array.from(parsed.key)).toEqual(Array.from(id.publicKey));
    }
  });

  it('gives a six-digit fingerprint that differs between devices', async () => {
    const mine = await myFingerprint();
    expect(mine).toMatch(/^\d{6}$/);
    const other = fingerprintOf(nacl.box.keyPair.fromSecretKey(
      new Uint8Array(32).fill(9),
    ).publicKey);
    expect(other).toMatch(/^\d{6}$/);
    expect(other).not.toBe(mine);
  });

  it('does not pretend to fingerprint something that is not a key', () => {
    expect(fingerprintOf(new Uint8Array(8))).toBe('------');
  });
});
