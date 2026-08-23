/**
 * What a Mac calls itself when it pairs.
 *
 * The Homebrew build is Mac Catalyst, and `UIDevice.name` there answers
 * "iPad" — the model, not the machine. That name travels in the envelope
 * header in the clear and is what the other device shows in its paired
 * list, so a Mac was introducing itself to every phone in the house as an
 * iPad. Confirmed on a real pairing: the envelope read
 * `sender: {name: 'iPad'}`.
 *
 * deviceName.ts had a Catalyst branch for exactly this and it never ran,
 * because the native answer arrived first and a non-empty string looked
 * like a real name.
 */
import { NativeModules, Platform } from 'react-native';
import { defaultDeviceName } from '../src/sync/deviceName';

const setNative = (deviceName?: string) => {
  (NativeModules as Record<string, unknown>).PrayerBuildInfo = { deviceName };
};

describe('the name a Mac Catalyst build pairs under', () => {
  const realOS = Platform.OS;

  // defineProperty, not assignment: React Native's Platform exposes these as
  // getters, and a plain `Platform.isMacCatalyst = true` is swallowed — which
  // made the first version of this file fail against a fix that works.
  const set = (key: string, value: unknown) =>
    Object.defineProperty(Platform, key, { value, configurable: true });

  afterEach(() => {
    set('OS', realOS);
    set('isMacCatalyst', false);
    set('isPad', false);
  });

  const asCatalyst = () => {
    set('OS', 'ios');
    set('isMacCatalyst', true);
  };

  it('refuses the model word iOS hands back on a Mac', () => {
    asCatalyst();
    setNative('iPad');
    expect(defaultDeviceName()).toBe('Mac');
  });

  it('refuses it whatever the case', () => {
    asCatalyst();
    setNative('iphone');
    expect(defaultDeviceName()).toBe('Mac');
  });

  it('keeps a real name when the platform gives one', () => {
    // If Apple ever hands back the machine's own name, that beats "Mac" —
    // the point is to be recognisable in someone else's list.
    asCatalyst();
    setNative("Hassan's MacBook Pro");
    expect(defaultDeviceName()).toBe("Hassan's MacBook Pro");
  });

  it('leaves a real iPad alone', () => {
    // The same word from a device that IS one. Only Catalyst distrusts it.
    set('OS', 'ios');
    set('isMacCatalyst', false);
    setNative('iPad');
    expect(defaultDeviceName()).toBe('iPad');
  });

  it('still names a Mac with nothing from the platform at all', () => {
    asCatalyst();
    setNative(undefined);
    expect(defaultDeviceName()).toBe('Mac');
  });
});
