import Foundation
// RCTPromiseResolveBlock/RejectBlock live here — without it the module
// compiles as far as the signature and then cannot find the types.
import React
import Security

/**
 Cryptographically secure random bytes, for the sync keypair.

 WHY THIS EXISTS AT ALL. React Native ships no WebCrypto: there is no
 `crypto.getRandomValues` in Hermes, and `Math.random` is a PRNG seeded from
 things an attacker can often guess. A keypair generated from `Math.random`
 is not a weak keypair, it is a public one — so this cannot be skipped or
 shimmed with something plausible-looking.

 WHY NOT A LIBRARY. `react-native-get-random-values` does exactly this in
 forty lines of native code. Taking it means a new entry in node_modules,
 which means a new `scanignore` line in the F-Droid recipe, which since the
 merge lives in `fdroiddata` and needs a fresh MR and a review. App source
 needs none of that, and this app already carries eight hand-written native
 modules. The dependency is not worth the process.

 `SecRandomCopyBytes` is the platform's answer and is available on Mac
 Catalyst unchanged, which matters — the Homebrew build has to be able to
 pair like any other device.

 Base64 on the way out because the React Native bridge has no byte-array
 type: an array of numbers would be JSON, one element per byte, and this is
 called for 32 bytes at a time so the difference is academic — but base64 is
 what every other module here does with binary and consistency is cheap.
 */
@objc(SecureRandom)
class SecureRandom: NSObject {

  /// No UIKit, no main-thread requirement.
  @objc static func requiresMainQueueSetup() -> Bool { false }

  /**
   `count` random bytes, base64-encoded.

   Rejects rather than returning a weaker source on failure. `SecRandomCopy-
   Bytes` failing is close to impossible, but "close to impossible" is not a
   licence to fall back to `arc4random` and say nothing: the caller is
   generating an identity, and it is entitled to know it could not be done
   properly rather than to receive something that looks the same.
   */
  @objc(bytes:resolver:rejecter:)
  func bytes(
    _ count: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let n = count.intValue
    guard n > 0, n <= 4096 else {
      reject("bad_count", "asked for \(n) bytes, which is outside 1...4096", nil)
      return
    }
    var buffer = [UInt8](repeating: 0, count: n)
    let status = SecRandomCopyBytes(kSecRandomDefault, n, &buffer)
    guard status == errSecSuccess else {
      reject("unavailable", "SecRandomCopyBytes failed with \(status)", nil)
      return
    }
    resolve(Data(buffer).base64EncodedString())
  }
}
