/**
 * An existing user is not a new user.
 *
 * `locationOnboardingComplete` has had an absent-key migration since it was
 * added — no key means an install that predates the flag, which means
 * somebody already using the app, so it loads as true and they are not
 * asked for their city again.
 *
 * `onboardingComplete` never got the same treatment. So an install whose
 * blob predates THAT flag loaded it as false and was routed into the
 * new-user welcome on update: the salam, the notifications ask, the
 * exact-alarms ask, and then the feature tour. Existing users were being
 * shown the greeting as an accidental release note, which is not a thing
 * anyone chose — see docs/design/onboarding-plan.md §2.4.
 *
 * The risk in fixing it is the opposite mistake, and it is worse: a
 * migration that fires on a genuinely fresh install would mean onboarding
 * NEVER shows, for anybody, ever. The last test here is the one that
 * matters.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const KEY = 'prayerapp.settings.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('upgrading from a build that had no onboardingComplete', () => {
  it('does not show the new-user welcome', async () => {
    // A blob as an older build would have written it: real settings,
    // no onboarding flag anywhere in it.
    const old: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete old.onboardingComplete;
    delete old.locationOnboardingComplete;
    old.notificationsEnabled = true;
    old.calculationMethod = 'mwl';
    await AsyncStorage.setItem(KEY, JSON.stringify(old));

    const loaded = await loadSettings();
    expect(loaded.onboardingComplete).toBe(true);
    // And the older sibling still behaves, so they are not asked to set
    // their location a second time either.
    expect(loaded.locationOnboardingComplete).toBe(true);
    // Their actual settings survive untouched.
    expect(loaded.notificationsEnabled).toBe(true);
    expect(loaded.calculationMethod).toBe('mwl');
  });

  it('leaves a stored false alone', async () => {
    // Somebody who really has not finished onboarding — they installed a
    // build that HAS the flag and backed out of the flow. The key is
    // present, so the migration must not touch it.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, onboardingComplete: false }),
    );
    const loaded = await loadSettings();
    expect(loaded.onboardingComplete).toBe(false);
  });

  it('leaves "show onboarding again" working', async () => {
    // Settings → About writes onboardingComplete: false deliberately.
    // A migration keyed on the VALUE rather than the key's presence would
    // undo that and make the row do nothing.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        onboardingComplete: false,
        locationOnboardingComplete: true,
      }),
    );
    const loaded = await loadSettings();
    expect(loaded.onboardingComplete).toBe(false);
  });
});

describe('a genuinely fresh install still gets onboarding', () => {
  it('has no blob, so the migration never runs', async () => {
    // THE ONE THAT MATTERS. There is no plaintext blob on a first launch,
    // so loadSettings returns early with DEFAULT_SETTINGS and never
    // reaches the absent-key migrations. If that ever stops being true,
    // this test fails and the app has silently lost its entire first-run
    // experience for every new user.
    const loaded = await loadSettings();
    expect(loaded.onboardingComplete).toBe(false);
    expect(loaded.locationOnboardingComplete).toBe(false);
  });

  it('is not fooled by an unparseable blob either', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    const loaded = await loadSettings();
    expect(loaded.onboardingComplete).toBe(false);
  });
});
