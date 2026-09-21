/**
 * The GitHub/Obtainium APK is its own flavor. What it must get right:
 * it is recognised as itself, and "Rate Mihrab" does not send a phone
 * that may have no Play Store to a market:// link.
 */
import { readFileSync } from 'fs';
import path from 'path';

const load = (distribution: string | undefined) => {
  jest.resetModules();
  const openURL = jest.fn(() => Promise.resolve());
  jest.doMock('react-native', () => ({
    Platform: { OS: 'android' },
    NativeModules: {
      PrayerBuildInfo: distribution === undefined ? undefined : { distribution },
    },
    Linking: { openURL },
  }));
  const { getAndroidDistribution } = require('../src/distribution');
  const { rateApp } = require('../src/polish/rateApp');
  return { getAndroidDistribution, rateApp, openURL };
};

describe('distribution', () => {
  it.each([
    ['play', 'play'],
    ['fdroid', 'fdroid'],
    ['github', 'github'],
    [undefined, 'play'],
    ['something-else', 'play'],
  ])('%s → %s', (native, expected) => {
    expect(load(native).getAndroidDistribution()).toBe(expected);
  });
});

describe('Rate Mihrab', () => {
  it('opens GitHub from the GitHub build', async () => {
    const { rateApp, openURL } = load('github');
    await rateApp();
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://github.com/Hassan-PS/Mihrab');
  });

  it('opens GitHub from the F-Droid build', async () => {
    const { rateApp, openURL } = load('fdroid');
    await rateApp();
    expect(openURL).toHaveBeenCalledWith('https://github.com/Hassan-PS/Mihrab');
  });

  it('opens the Play listing from the Play build', async () => {
    const { rateApp, openURL } = load('play');
    await rateApp();
    expect(openURL).toHaveBeenCalledWith('market://details?id=com.prayer_times');
  });
});

describe('the github flavor in gradle', () => {
  const gradle = readFileSync(
    path.join(__dirname, '..', 'android', 'app', 'build.gradle'),
    'utf8',
  );
  const flavor = gradle.match(/\n\s+github \{[\s\S]*?\n {8}\}/)?.[0] ?? '';

  it('packages ARM only', () => {
    expect(flavor).toContain('abiFilters "arm64-v8a", "armeabi-v7a"');
  });

  it('is never debug-signed', () => {
    expect(gradle).toMatch(/\(wantsPlayRelease \|\| wantsGithubRelease\) && !hasReleaseSigningConfig/);
  });

  it('cannot share an invocation with fdroid, which would turn its R8 off', () => {
    expect(gradle).toMatch(/wantsFdroid && \(wantsPlayAny \|\| wantsGithubAny\)/);
  });
});
