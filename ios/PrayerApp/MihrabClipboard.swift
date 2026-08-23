import Foundation
// RCTPromiseResolveBlock/RejectBlock live here — without it the module
// compiles as far as the signature and then cannot find the types.
import React
import UIKit

/**
 Copy and paste, for the pairing code.

 WHY NOT `Clipboard` FROM REACT NATIVE. It is still present in 0.83 and it
 still works, behind a deprecation warning that says it will be removed. A
 headline feature resting on an API whose own runtime warns it is leaving is
 a fault waiting for an upgrade to trigger.

 WHY NOT `@react-native-clipboard/clipboard`. It is the recommended
 replacement and there is nothing wrong with it — but it is native code in
 node_modules, which means another `scanignore` line in the F-Droid recipe,
 which lives in `fdroiddata` and needs its own merge request and review. The
 whole pairing design was arranged so the first release needs none of that.

 `UIPasteboard` is available on Mac Catalyst and bridges to the Mac
 pasteboard there, so the Homebrew build copies its code like any other
 device.

 MAIN QUEUE. `UIPasteboard` is UIKit and must be touched on the main thread;
 `requiresMainQueueSetup` covers construction, and `methodQueue` puts the
 calls there too rather than hoping.
 */
@objc(MihrabClipboard)
class MihrabClipboard: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  /**
   Put `text` on the pasteboard.

   Resolves `true` to mean "say something to the user": iOS shows no
   confirmation of its own, so the app has to. Android 13 does show one, and
   its module answers `false` there. The screen asks rather than deciding by
   platform, so the answer stays in one place per platform.
   */
  @objc(setString:resolver:rejecter:)
  func setString(
    _ text: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    UIPasteboard.general.string = text as String
    resolve(true)
  }

  /**
   What is on the pasteboard, or an empty string.

   Empty rather than an error when there is nothing: a paste button pressed
   with an empty pasteboard should do nothing, not raise. Reading the
   pasteboard shows the system's paste banner, which is why this is only
   called from an explicit tap.
   */
  @objc(getString:rejecter:)
  func getString(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(UIPasteboard.general.string ?? "")
  }
}
