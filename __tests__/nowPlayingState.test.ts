/**
 * The one now-playing property track-player does not set.
 *
 * `MPNowPlayingInfoCenter.playbackState` is optional on iOS and required on
 * macOS, and a Mac Catalyst build is macOS for that rule — so without it the
 * Mac showed no Control Center panel and took no media keys while the app
 * happily published title, artist and artwork into it.
 *
 * Two things are worth pinning. The state must be derived from the player's
 * own status and nothing else, and it must be published only when it
 * changes: `setStatus` fires on loading flags and reciter changes as well as
 * on real transitions, and a bridge call per tick on a page built to be
 * cheap while it plays would undo that.
 */
jest.mock('react-native', () => ({
  NativeModules: { NowPlayingState: { setState: jest.fn() } },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
}));

import { NativeModules } from 'react-native';
import {
  setNowPlayingState,
  _resetNowPlayingState,
  nowPlayingStateAvailable,
} from '../src/native/NowPlayingState';

/**
 * Reached through NativeModules rather than through a `mock…` variable of
 * our own: babel hoists the `import` above every `const` in this file, so a
 * factory that closes over one hands the module `undefined` for the method
 * and the calls land nowhere — which the module's own try/catch then hides.
 */
const mockSetState = (
  NativeModules as unknown as { NowPlayingState: { setState: jest.Mock } }
).NowPlayingState.setState;

beforeEach(() => {
  mockSetState.mockClear();
  _resetNowPlayingState();
});

it('is available when the native module is', () => {
  expect(nowPlayingStateAvailable).toBe(true);
});

it('publishes each state once', () => {
  setNowPlayingState('playing');
  setNowPlayingState('playing');
  setNowPlayingState('playing');
  expect(mockSetState).toHaveBeenCalledTimes(1);
  expect(mockSetState).toHaveBeenCalledWith('playing');
});

it('publishes a real transition', () => {
  setNowPlayingState('playing');
  setNowPlayingState('paused');
  setNowPlayingState('playing');
  expect(mockSetState.mock.calls.map(c => c[0])).toEqual([
    'playing',
    'paused',
    'playing',
  ]);
});

it('survives a native module that throws', () => {
  mockSetState.mockImplementationOnce(() => {
    throw new Error('bridge gone');
  });
  expect(() => setNowPlayingState('playing')).not.toThrow();
});

describe('the state the player funnel derives', () => {
  /**
   * Mirrors `setStatus` in playback.ts. Kept here rather than imported
   * because importing that module pulls in track-player and the whole
   * audio store for three ternaries.
   */
  const derive = (active: object | null, playing: boolean) =>
    active == null ? 'stopped' : playing ? 'playing' : 'paused';

  it('calls an idle player stopped, whatever the playing flag says', () => {
    expect(derive(null, false)).toBe('stopped');
    expect(derive(null, true)).toBe('stopped');
  });

  it('separates a loaded-but-paused ayah from a playing one', () => {
    expect(derive({ surah: 18, ayah: 1 }, false)).toBe('paused');
    expect(derive({ surah: 18, ayah: 1 }, true)).toBe('playing');
  });
});
