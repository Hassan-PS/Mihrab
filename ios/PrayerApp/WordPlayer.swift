import AVFoundation
import Foundation
import React

/**
 Plays one slice of an ayah recording — a word — and stops.

 A second player beside the recitation's queue, on purpose: see the
 Android module for why a queue is the wrong instrument for a half-second
 clip. `AVAudioPlayer` seeks by setting `currentTime` and plays; a 15 ms
 poll stops it at the slice's end, asking the player where it is rather
 than trusting a timer.

 `play` resolves `true` once the slice has been heard, `false` when it
 could not be or when a later `play`/`stop` cut it short.
 */
@objc(WordPlayer)
class WordPlayer: NSObject, AVAudioPlayerDelegate {
  private var player: AVAudioPlayer?
  private var pending: RCTPromiseResolveBlock?
  private var ticker: Timer?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func play(
    _ path: String,
    startMs: NSNumber,
    endMs: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.finish(false)
      do {
        let p = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: path))
        p.delegate = self
        p.prepareToPlay()
        p.currentTime = startMs.doubleValue / 1000
        self.player = p
        self.pending = resolve
        guard p.play() else {
          self.finish(false)
          return
        }
        let end = endMs.doubleValue / 1000
        self.ticker = Timer.scheduledTimer(withTimeInterval: 0.015, repeats: true) { [weak self] _ in
          guard let self, let current = self.player, current === p else { return }
          if !current.isPlaying || current.currentTime >= end {
            self.finish(true)
          }
        }
      } catch {
        self.finish(false)
      }
    }
  }

  @objc func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.finish(false)
      resolve(true)
    }
  }

  func audioPlayerDidFinishPlaying(_ p: AVAudioPlayer, successfully _: Bool) {
    if player === p { finish(true) }
  }

  /// Main thread only. Ends whatever is in flight and answers its promise.
  private func finish(_ heard: Bool) {
    ticker?.invalidate()
    ticker = nil
    player?.stop()
    player = nil
    pending?(heard)
    pending = nil
  }
}
