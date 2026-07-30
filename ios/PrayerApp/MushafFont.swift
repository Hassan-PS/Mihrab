import CoreText
import Foundation
// RCTPromiseResolveBlock/RejectBlock live here — without it the module
// compiles nowhere and the app silently keeps its previous binary.
import React
import UIKit

/**
 Runtime registration of the QPC v2 per-page mushaf fonts — v2.8.0.

 The mushaf is drawn as text: each page has its own font where one glyph is
 one word. All 604 are downloaded rather than bundled, so they cannot be
 listed in `UIAppFonts`. CoreText can register a font file at runtime, after
 which `UIFont(name:size:)` — and therefore React Native's `fontFamily` —
 resolves it like any built-in face.

 Unlike Android, iOS registers a *file* rather than a name we choose, so the
 family name comes from the font itself (the asset build stamps each file with
 `QCF2###`). We keep the slot API for symmetry and to let JS unregister the
 file it is recycling, which is how the memory stays bounded.
 */
@objc(MushafFont)
class MushafFont: NSObject {

  /// Files currently registered with CoreText, keyed by the slot JS assigned.
  private var registered: [String: URL] = [:]
  private let lock = NSLock()

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(registerFont:path:resolver:rejecter:)
  func registerFont(
    _ family: String,
    path: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
      reject("font_register_failed", "font missing: \(path)", nil)
      return
    }

    lock.lock()
    let previous = registered[family]
    lock.unlock()

    // Recycling a slot: drop the file it held so its glyph data is freed.
    if let previous = previous, previous != url {
      CTFontManagerUnregisterFontsForURL(previous as CFURL, .process, nil)
    }

    var error: Unmanaged<CFError>?
    let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
    if !ok {
      let cfError = error?.takeRetainedValue()
      let code = CFErrorGetCode(cfError)
      // kCTFontManagerErrorAlreadyRegistered (105) is success for our purposes.
      if code != 105 {
        reject(
          "font_register_failed",
          "CoreText refused \(url.lastPathComponent): \(cfError?.localizedDescription ?? "unknown")",
          nil
        )
        return
      }
    }

    lock.lock()
    registered[family] = url
    lock.unlock()

    // Report the PostScript family the font actually declares, so JS can pass
    // it straight to `fontFamily` without assuming our naming held.
    guard
      let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL)
        as? [CTFontDescriptor],
      let first = descriptors.first,
      let name = CTFontDescriptorCopyAttribute(first, kCTFontFamilyNameAttribute) as? String
    else {
      resolve(family)
      return
    }
    resolve(name)
  }

  @objc(isValidFont:resolver:rejecter:)
  func isValidFont(
    _ path: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path),
      let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
      !descriptors.isEmpty
    else {
      resolve(false)
      return
    }
    resolve(true)
  }
}
