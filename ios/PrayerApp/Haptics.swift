import Foundation
import UIKit

/**
 Taptic Engine access — v2.8.5.

 React Native's core `Vibration` module is the wrong instrument on iOS: it
 calls `AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)`, which is a
 single ~400 ms buzz of the whole device with no intensity control. Fine for
 "your alarm is going off", useless for a scrubber that wants to tick once
 per surah while a thumb slides across 604 pages.

 UIKit has exactly the right instruments and they cost nothing to reach:

  • `UISelectionFeedbackGenerator` — designed for a value changing under a
    moving finger (the picker wheel). Light, quick, cheap to repeat.
  • `UIImpactFeedbackGenerator` — a discrete knock with a weight. Used when
    the drag is slow and deliberate, so each surah boundary lands harder
    than the ones you skate past while ranging.

 Both want `prepare()` before the event to wake the Taptic Engine, otherwise
 the first tick of a drag arrives late. The generators are kept alive on the
 module so a drag doesn't allocate one per tick.

 Mac Catalyst compiles this (the classes exist) but almost no Mac has a
 Taptic Engine outside the trackpad, so the calls are silently ignored —
 which is the correct behaviour, not something to branch on.
 */
@objc(Haptics)
class Haptics: NSObject {

  private let selection = UISelectionFeedbackGenerator()
  private lazy var light = UIImpactFeedbackGenerator(style: .light)
  private lazy var medium = UIImpactFeedbackGenerator(style: .medium)
  private lazy var heavy = UIImpactFeedbackGenerator(style: .heavy)

  /// The generators touch UIKit, so the module has to be created on main.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// Wake the Taptic Engine ahead of a gesture. Called on drag start; the
  /// engine idles down again by itself a few seconds later.
  @objc func prepare() {
    DispatchQueue.main.async {
      self.selection.prepare()
      self.light.prepare()
      self.medium.prepare()
    }
  }

  /// One "the value under your finger changed" tick.
  @objc func selectionTick() {
    DispatchQueue.main.async {
      self.selection.selectionChanged()
      // Re-arm immediately: a scrubber fires these back to back.
      self.selection.prepare()
    }
  }

  /// A weighted knock. `style` is one of light | medium | heavy; anything
  /// else is treated as medium rather than dropped, because a haptic that
  /// silently does nothing is impossible to debug from JS.
  @objc(impact:)
  func impact(_ style: NSString) {
    DispatchQueue.main.async {
      let generator: UIImpactFeedbackGenerator
      switch style as String {
      case "light": generator = self.light
      case "heavy": generator = self.heavy
      default: generator = self.medium
      }
      generator.impactOccurred()
      generator.prepare()
    }
  }
}
