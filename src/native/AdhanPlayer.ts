import { NativeModules, Platform } from 'react-native';

/**
 * Foreground player for the FULL adhan recording (iOS only).
 *
 * iOS caps notification sounds at 30s, so the prayer notification can only play
 * a 29s clip. This native module plays the complete adhan (bundled `<id>.mp3`)
 * while the app is active — when the user taps an adhan notification (which
 * foregrounds the app) or when a prayer notification arrives while the app is
 * open. It uses no background audio mode, so playback only happens in the
 * foreground. On Android the notification channel already plays the full adhan,
 * so every method is a no-op there.
 */
type AdhanPlayerNative = {
  play(name: string): Promise<boolean>;
  stop(): Promise<boolean>;
  isPlaying(): Promise<boolean>;
};

const native: AdhanPlayerNative | undefined =
  Platform.OS === 'ios'
    ? (NativeModules.AdhanPlayer as AdhanPlayerNative | undefined)
    : undefined;

export const AdhanPlayer = {
  /** Play the full adhan bundled as `<name>.mp3` (e.g. 'adhan_makkah'). */
  play(name: string): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    return native.play(name).catch(() => false);
  },
  /** Stop the currently-playing full adhan. */
  stop(): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    return native.stop().catch(() => false);
  },
  isPlaying(): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    return native.isPlaying().catch(() => false);
  },
};
