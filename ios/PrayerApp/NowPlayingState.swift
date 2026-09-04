import Foundation
import MediaPlayer

/**
 The one thing `MPNowPlayingInfoCenter` will not infer for us.

 The recitation player is react-native-track-player, whose iOS half is
 SwiftAudioEx, and SwiftAudioEx fills `MPNowPlayingInfoCenter.nowPlayingInfo`
 — title, artist, artwork, elapsed time — but never touches
 `playbackState`. On iOS that is survivable: the system reads the app's
 audio session and infers whether it is playing.

 On macOS it is not. `playbackState` is REQUIRED there, and a Mac Catalyst
 app is a macOS app for this purpose: without it the whole entry is ignored,
 so Mihrab put a full set of now-playing metadata into a Control Center
 panel that showed nothing, took no media keys, and left the Mac's
 idea of "what is playing" on whatever had played before it.

 Hence this module: the smallest possible bridge for the one property the
 audio library does not set. Everything else about the lock screen and
 Control Center still belongs to track-player.

 Called from `playback.ts`'s `setStatus`, which is the single funnel every
 state change already passes through, so the system's idea of the
 playback state cannot drift from the app's.
 */
@objc(NowPlayingState)
class NowPlayingState: NSObject {

  /// Touches MPNowPlayingInfoCenter, which wants the main thread.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  /**
   `state` is one of "playing", "paused", "stopped".

   An unrecognised value maps to `.unknown` rather than to a guess: the
   states are the reason this module exists and inventing one would be
   the same bug in a different place.
   */
  @objc func setState(_ state: NSString) {
    let next: MPNowPlayingPlaybackState
    switch state as String {
    case "playing": next = .playing
    case "paused": next = .paused
    case "stopped": next = .stopped
    default: next = .unknown
    }
    DispatchQueue.main.async {
      MPNowPlayingInfoCenter.default().playbackState = next
    }
  }
}
