/**
 * Addressing the user's own adhan.
 *
 * The failure this pins down is a silent prayer. 'custom' is a persisted
 * setting but the recording behind it is a file, and files go away — a
 * reinstall drops it, and the picker lets the user delete it outright. If the
 * notification is scheduled against a channel that was never created, Android
 * does not complain and does not fall back; it just arrives without a sound,
 * which the user experiences as having missed Fajr.
 */
import {
  coerceNotificationSoundId,
  getNotificationSoundOption,
  getRegisteredCustomAdhan,
  isCustomAdhanReady,
  NOTIFICATION_SOUND_OPTIONS,
  registerCustomAdhan,
  resolveSoundTargets,
} from '../src/notifications/notificationSounds';

const DEFAULT = getNotificationSoundOption('default');

afterEach(() => registerCustomAdhan(null));

describe('the custom entry', () => {
  it('is a real option the picker can show and the settings can store', () => {
    expect(NOTIFICATION_SOUND_OPTIONS.some(o => o.id === 'custom')).toBe(true);
    expect(coerceNotificationSoundId('custom')).toBe('custom');
  });

  it('rejects an id that is not a sound at all', () => {
    expect(coerceNotificationSoundId('adhan_from_somewhere')).toBe('default');
    expect(coerceNotificationSoundId(undefined)).toBe('default');
  });
});

describe('resolveSoundTargets', () => {
  it('leaves every built-in sound exactly as the table declares it', () => {
    for (const option of NOTIFICATION_SOUND_OPTIONS) {
      if (option.id === 'custom') continue;
      expect(resolveSoundTargets(option.id)).toEqual({
        androidChannelId: option.androidChannelId,
        iosSound: option.iosSound,
      });
    }
  });

  it('falls back to the default sound when nothing has been imported', () => {
    // The setting survives a reinstall; the file does not.
    expect(resolveSoundTargets('custom')).toEqual({
      androidChannelId: DEFAULT.androidChannelId,
      iosSound: DEFAULT.iosSound,
    });
    expect(isCustomAdhanReady()).toBe(false);
  });

  it('points at the imported recording once it is registered', () => {
    registerCustomAdhan({
      name: 'makkah-fajr.mp3',
      token: 'a1b2c3d4e5f6',
      channelId: 'prayer-times-adhan-custom-a1b2c3d4e5f6',
      soundName: 'custom_adhan_a1b2c3d4e5f6.caf',
      path: '/data/custom_adhan/a1b2c3d4e5f6.mp3',
      durationMs: 92_000,
      trimmed: true,
    });
    expect(resolveSoundTargets('custom')).toEqual({
      androidChannelId: 'prayer-times-adhan-custom-a1b2c3d4e5f6',
      iosSound: 'custom_adhan_a1b2c3d4e5f6.caf',
    });
    expect(isCustomAdhanReady()).toBe(true);
  });

  it('falls back per-platform when only one side of the import landed', () => {
    // iOS resolves a sound file and no channel; Android the reverse. Each must
    // fall back on the side it has nothing for rather than emitting undefined.
    registerCustomAdhan({
      name: 'adhan.caf',
      token: 'deadbeefcafe',
      soundName: 'custom_adhan_deadbeefcafe.caf',
      durationMs: 30_000,
      trimmed: false,
    });
    expect(resolveSoundTargets('custom')).toEqual({
      androidChannelId: DEFAULT.androidChannelId,
      iosSound: 'custom_adhan_deadbeefcafe.caf',
    });

    registerCustomAdhan({
      name: 'adhan.mp3',
      token: 'deadbeefcafe',
      channelId: 'prayer-times-adhan-custom-deadbeefcafe',
      durationMs: 30_000,
      trimmed: false,
    });
    expect(resolveSoundTargets('custom')).toEqual({
      androidChannelId: 'prayer-times-adhan-custom-deadbeefcafe',
      iosSound: DEFAULT.iosSound,
    });
  });

  it('sends a different recording to a different channel', () => {
    // A channel's sound cannot be changed after it is created, so importing a
    // second adhan under the first one's channel id would go on playing the
    // first. The token is what keeps them apart, and it comes from the bytes.
    registerCustomAdhan({
      name: 'first.mp3',
      token: 'aaaaaaaaaaaa',
      channelId: 'prayer-times-adhan-custom-aaaaaaaaaaaa',
      durationMs: 1,
      trimmed: false,
    });
    const first = resolveSoundTargets('custom').androidChannelId;
    registerCustomAdhan({
      name: 'second.mp3',
      token: 'bbbbbbbbbbbb',
      channelId: 'prayer-times-adhan-custom-bbbbbbbbbbbb',
      durationMs: 1,
      trimmed: false,
    });
    expect(resolveSoundTargets('custom').androidChannelId).not.toBe(first);
  });

  it('never hands back the placeholder ids from the table', () => {
    // The custom row carries the default option's values so a caller reaching
    // past the resolver still gets something audible — but the resolver itself
    // must never be the reason a prayer plays the wrong sound.
    registerCustomAdhan({
      name: 'mine.mp3',
      token: 'ffffffffffff',
      channelId: 'prayer-times-adhan-custom-ffffffffffff',
      soundName: 'custom_adhan_ffffffffffff.caf',
      durationMs: 1,
      trimmed: false,
    });
    const targets = resolveSoundTargets('custom');
    expect(targets.androidChannelId).not.toBe(DEFAULT.androidChannelId);
    expect(targets.iosSound).not.toBe(DEFAULT.iosSound);
  });
});

describe('registerCustomAdhan', () => {
  it('clears back to nothing, so removing really removes', () => {
    registerCustomAdhan({
      name: 'mine.mp3',
      token: 'ffffffffffff',
      channelId: 'prayer-times-adhan-custom-ffffffffffff',
      durationMs: 1,
      trimmed: false,
    });
    expect(getRegisteredCustomAdhan()).not.toBeNull();
    registerCustomAdhan(null);
    expect(getRegisteredCustomAdhan()).toBeNull();
    expect(resolveSoundTargets('custom').androidChannelId).toBe(
      DEFAULT.androidChannelId,
    );
  });
});
