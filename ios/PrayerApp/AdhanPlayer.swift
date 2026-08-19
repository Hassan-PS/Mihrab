import AVFoundation
import Foundation
import React

/// Foreground-only player for the FULL adhan recording.
///
/// iOS caps notification sounds at 30s, so the notification can only play a 29s
/// clip. This module plays the complete adhan from the bundled `<name>.mp3`
/// while the app is active — used when the user taps an adhan notification (which
/// brings the app to the foreground) or when a prayer notification is delivered
/// while the app is already open. It does NOT use any background audio mode, so
/// it only plays while the app is foreground/active (App Store-compliant).
@objc(AdhanPlayer)
final class AdhanPlayer: NSObject {

  private var player: AVAudioPlayer?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// Play the full adhan bundled as `<name>.mp3`. Resolves false if not found.
  @objc(play:resolver:rejecter:)
  func play(_ name: NSString,
            resolver resolve: @escaping RCTPromiseResolveBlock,
            rejecter reject: @escaping RCTPromiseRejectBlock) {
    let base = name as String
    DispatchQueue.main.async {
      guard let url = Bundle.main.url(forResource: base, withExtension: "mp3") else {
        NSLog("AdhanPlayer: \(base).mp3 not found in bundle")
        resolve(false)
        return
      }
      do {
        // .playback so the adhan is audible even with the ringer/silent switch on.
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try AVAudioSession.sharedInstance().setActive(true)
        self.player?.stop()
        let p = try AVAudioPlayer(contentsOf: url)
        p.prepareToPlay()
        p.play()
        self.player = p
        resolve(true)
      } catch {
        reject("adhan_play_error", error.localizedDescription, error)
      }
    }
  }

  /// Play a full adhan from an absolute path rather than from the bundle.
  ///
  /// The user's imported adhan is not a bundle resource, and the clip the
  /// notification plays is capped at 30s — so when the app is in the
  /// foreground this plays the whole of the file they actually chose.
  @objc(playPath:resolver:rejecter:)
  func playPath(_ path: NSString,
                resolver resolve: @escaping RCTPromiseResolveBlock,
                rejecter reject: @escaping RCTPromiseRejectBlock) {
    let url = URL(fileURLWithPath: path as String)
    DispatchQueue.main.async {
      guard FileManager.default.fileExists(atPath: url.path) else {
        NSLog("AdhanPlayer: \(url.path) does not exist")
        resolve(false)
        return
      }
      do {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try AVAudioSession.sharedInstance().setActive(true)
        self.player?.stop()
        let p = try AVAudioPlayer(contentsOf: url)
        p.prepareToPlay()
        p.play()
        self.player = p
        resolve(true)
      } catch {
        reject("adhan_play_error", error.localizedDescription, error)
      }
    }
  }

  /// Stop the currently-playing full adhan.
  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock,
            rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      self.player?.stop()
      self.player = nil
      try? AVAudioSession.sharedInstance()
        .setActive(false, options: [.notifyOthersOnDeactivation])
      resolve(true)
    }
  }

  /// Whether a full adhan is currently playing.
  @objc(isPlaying:rejecter:)
  func isPlaying(_ resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      resolve(self.player?.isPlaying ?? false)
    }
  }
}
