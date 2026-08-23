import Foundation
// RCTPromiseResolveBlock/RejectBlock live here.
import React
import UIKit
import UniformTypeIdentifiers

/**
 A folder the user picked, reachable across app launches.

 The iOS half of the sync transport. It lists, reads and writes text files in
 one directory and knows nothing about envelopes, peers or merging —
 `folderSync.ts` does the rest.

 ── WHY A BOOKMARK AND NOT A PATH ────────────────────────────────────────

 The whole point of this folder is that something else already syncs it: a
 Dropbox or Nextcloud folder in Files, a shared folder on a Mac, a folder on
 an external drive. Those live outside the app's container, so reaching them
 means a document picker and a SECURITY-SCOPED bookmark — a path string would
 be dead on the next launch, and often within the same one.

 Every operation therefore resolves the bookmark, starts access, does one
 thing, and stops. Holding access open across the app's lifetime would be
 simpler and is the kind of thing that leaks a scoped resource and quietly
 stops working after a while.

 On Mac Catalyst the bookmark needs `.withSecurityScope` in both directions;
 on iOS it must NOT be passed. That difference is the single most common way
 this API is got wrong, so it is compiled per platform rather than guessed at
 runtime.

 ── NSFileCoordinator, NOT BARE FileManager ──────────────────────────────

 A folder from the picker may be served by another app's file provider —
 iCloud Drive, Dropbox, Nextcloud — where a file's contents are not
 necessarily on disk when its name appears in a listing. Reading through the
 coordinator is what asks the provider to materialise it first, and writing
 through it is what tells the provider something changed so it uploads. Bare
 `FileManager` appears to work on a local folder and then behaves oddly on
 the exact setup this feature is aimed at.
 */
@objc(SyncFolder)
class SyncFolder: NSObject, UIDocumentPickerDelegate {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// The picker is UIKit; the file work is short and small enough to follow it.
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  private var pending: (resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)?

  // ── Choosing ───────────────────────────────────────────────────────────

  /**
   Ask the user for a folder.

   Resolves `{handle, label}`, or `null` if they backed out. A cancel is a
   decision rather than a failure: rejecting would make the JS side report
   "no thanks" as an error.
   */
  @objc(pick:rejecter:)
  func pick(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard pending == nil else {
      reject("busy", "a folder is already being chosen", nil)
      return
    }
    guard let presenter = Self.topViewController() else {
      reject("no_window", "there is no view controller to present the picker from", nil)
      return
    }
    pending = (resolve, reject)
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
    picker.delegate = self
    picker.allowsMultipleSelection = false
    presenter.present(picker, animated: true)
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard let waiting = pending else { return }
    pending = nil
    guard let url = urls.first else {
      waiting.resolve(nil)
      return
    }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    do {
      let data = try Self.bookmark(for: url)
      waiting.resolve([
        "handle": data.base64EncodedString(),
        "label": url.lastPathComponent,
      ])
    } catch {
      // Without a bookmark the folder works until the app is killed, which
      // is worse than not working: the user sets it up and finds it broken
      // tomorrow with no explanation.
      waiting.reject("not_persistable", "could not keep access to that folder", error)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    guard let waiting = pending else { return }
    pending = nil
    waiting.resolve(nil)
  }

  /// Whether a folder chosen earlier can still be reached.
  @objc(hasAccess:resolver:rejecter:)
  func hasAccess(
    _ handle: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let url = try? Self.resolveBookmark(handle as String) else {
      resolve(false)
      return
    }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    var isDirectory: ObjCBool = false
    let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
    resolve(exists && isDirectory.boolValue)
  }

  /**
   Give the folder back.

   There is nothing to release on iOS — the bookmark is the grant, and the
   JS side is about to forget it. This exists so both platforms have the
   same shape and the JS side needs no branch.
   */
  @objc(forget:resolver:rejecter:)
  func forget(
    _ handle: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(true)
  }

  // ── Files ──────────────────────────────────────────────────────────────

  @objc(list:resolver:rejecter:)
  func list(
    _ handle: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    withFolder(handle, reject) { folder in
      var names: [String] = []
      var failure: NSError?
      var thrown: Error?
      NSFileCoordinator().coordinate(readingItemAt: folder, options: [], error: &failure) { url in
        do {
          names = try FileManager.default
            .contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
            .map { $0.lastPathComponent }
        } catch {
          thrown = error
        }
      }
      if let error = failure ?? (thrown as? NSError) {
        reject("unreadable", "could not list that folder", error)
        return
      }
      resolve(names)
    }
  }

  @objc(read:name:resolver:rejecter:)
  func read(
    _ handle: NSString,
    name: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    withFolder(handle, reject) { folder in
      let file = folder.appendingPathComponent(name as String)
      var text: String?
      var failure: NSError?
      var thrown: Error?
      NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: &failure) { url in
        do {
          text = try String(contentsOf: url, encoding: .utf8)
        } catch {
          thrown = error
        }
      }
      guard let contents = text else {
        reject("unreadable", "could not read \(name)", failure ?? (thrown as? NSError))
        return
      }
      resolve(contents)
    }
  }

  @objc(write:name:contents:resolver:rejecter:)
  func write(
    _ handle: NSString,
    name: NSString,
    contents: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    withFolder(handle, reject) { folder in
      let file = folder.appendingPathComponent(name as String)
      var failure: NSError?
      var thrown: Error?
      NSFileCoordinator().coordinate(writingItemAt: file, options: .forReplacing, error: &failure) { url in
        do {
          // Atomically: written to a sibling temp file and renamed, so a
          // reader on the other side never sees half an envelope.
          try (contents as String).write(to: url, atomically: true, encoding: .utf8)
        } catch {
          thrown = error
        }
      }
      if let error = failure ?? (thrown as? NSError) {
        reject("unwritable", "could not write \(name)", error)
        return
      }
      resolve(true)
    }
  }

  // ── Plumbing ───────────────────────────────────────────────────────────

  /// Resolve the bookmark, start access, run `body`, stop access.
  private func withFolder(
    _ handle: NSString,
    _ reject: @escaping RCTPromiseRejectBlock,
    _ body: (URL) -> Void
  ) {
    let url: URL
    do {
      url = try Self.resolveBookmark(handle as String)
    } catch {
      reject("no_folder", "that folder can no longer be reached", error)
      return
    }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    body(url)
  }

  private static func bookmark(for url: URL) throws -> Data {
    #if targetEnvironment(macCatalyst)
      return try url.bookmarkData(
        options: [.withSecurityScope],
        includingResourceValuesForKeys: nil,
        relativeTo: nil
      )
    #else
      return try url.bookmarkData(
        options: [],
        includingResourceValuesForKeys: nil,
        relativeTo: nil
      )
    #endif
  }

  private static func resolveBookmark(_ handle: String) throws -> URL {
    guard let data = Data(base64Encoded: handle) else {
      throw NSError(
        domain: "SyncFolder",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "handle is not base64"]
      )
    }
    var stale = false
    #if targetEnvironment(macCatalyst)
      return try URL(
        resolvingBookmarkData: data,
        options: [.withSecurityScope],
        relativeTo: nil,
        bookmarkDataIsStale: &stale
      )
    #else
      return try URL(
        resolvingBookmarkData: data,
        options: [],
        relativeTo: nil,
        bookmarkDataIsStale: &stale
      )
    #endif
  }

  /// The controller to present over, including anything already presented.
  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}
