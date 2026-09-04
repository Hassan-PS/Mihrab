import Foundation
import UIKit

/**
 Keeping the screen on, on two operating systems that disagree about how.

 The coffee toggle in Tilāwah asks for one thing — do not let the display
 go dark while this is playing — and until now it asked for it through
 `@sayem314/react-native-keep-awake`, whose iOS half sets
 `UIApplication.isIdleTimerDisabled`. That is the right call ON IPHONE.

 It is not a call macOS listens to. A Mac Catalyst app can set the idle
 timer all day; the display sleeps on the schedule in Energy Saver
 regardless, because on macOS that decision belongs to the power
 management assertions, not to UIKit. Verified rather than assumed: with
 the toggle lit, `pmset -g assertions` listed no assertion owned by
 Mihrab at all. So on the Mac the coffee cup was decoration.

 `ProcessInfo.beginActivity` is the documented way to say it in a way
 macOS hears — it takes out the assertion for us and releases it when the
 token is ended. Both are done here, because a toggle that means one
 thing should not be two different mechanisms wired up in two places.

 The counting lives in `src/quran/keepAwakeLock.ts` — more than one
 screen can want this at once, and the reader unmounting under Tilāwah
 must not take the lock away from the page still holding it. This module
 is only the on/off underneath that counter, so `activate` twice is
 harmless and so is `deactivate` on something already off.
 */
@objc(MihrabKeepAwake)
class MihrabKeepAwake: NSObject {

  /// Touches UIApplication, which must be the main thread.
  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// The macOS assertion token, held for exactly as long as it is wanted.
  private var activity: NSObjectProtocol?

  @objc func activate() {
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = true
      #if targetEnvironment(macCatalyst)
      guard self.activity == nil else { return }
      self.activity = ProcessInfo.processInfo.beginActivity(
        options: [.idleDisplaySleepDisabled, .userInitiated],
        // Shown in power logs; says who is holding the display awake and
        // why, which is what someone hunting a battery drain wants.
        reason: "Mihrab is reciting with the screen kept on"
      )
      #endif
    }
  }

  @objc func deactivate() {
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = false
      #if targetEnvironment(macCatalyst)
      guard let token = self.activity else { return }
      ProcessInfo.processInfo.endActivity(token)
      self.activity = nil
      #endif
    }
  }
}
