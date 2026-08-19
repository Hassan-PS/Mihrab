import AVFoundation
import CryptoKit
import Foundation
import React
import UIKit
import UniformTypeIdentifiers

/// The user's own adhan recording — picking it, converting it, and keeping it
/// where the notification system can find it.
///
/// WHY THERE IS A CONVERSION STEP AT ALL. `UNNotificationSound` will not play an
/// mp3. It reads Linear PCM, MA4, µ-law and a-law wrapped in aiff, wav or caf,
/// from the app bundle or from `Library/Sounds`, and it caps the sound at 30
/// seconds. Hand it anything else and it does not fail — it quietly substitutes
/// the default notification sound, which would look exactly like the feature
/// not working. So an imported file is decoded and rewritten as a CAF, and
/// trimmed to fit under the cap.
///
/// The full-length original is kept alongside it, because the 30-second clip is
/// only what the notification plays; `AdhanPlayer` plays the whole recording
/// when the app is in the foreground.
@objc(CustomAdhan)
final class CustomAdhan: NSObject {

  /// Comfortably under the 30s ceiling. A file that lands exactly on the limit
  /// is a file that depends on how the encoder rounded.
  private static let maxSeconds: Double = 29

  private static let dirName = "custom_adhan"
  private static let soundPrefix = "custom_adhan_"

  private var pendingResolve: RCTPromiseResolveBlock?
  private var pendingReject: RCTPromiseRejectBlock?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  // MARK: - Locations

  private static func storageDir() throws -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let dir = base.appendingPathComponent(dirName, isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  /// `Library/Sounds` is the only directory outside the bundle that
  /// `UNNotificationSound(named:)` will look in, and it does not exist until
  /// someone creates it.
  private static func soundsDir() throws -> URL {
    let base = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
    let dir = base.appendingPathComponent("Sounds", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private static func storedOriginal() -> URL? {
    guard let dir = try? storageDir(),
      let entries = try? FileManager.default.contentsOfDirectory(
        at: dir, includingPropertiesForKeys: nil)
    else { return nil }
    return entries.first { $0.lastPathComponent != "display-name" }
  }

  private static func nameFile() throws -> URL {
    try storageDir().appendingPathComponent("display-name")
  }

  // MARK: - Picking

  @objc(pick:rejecter:)
  func pick(_ resolve: @escaping RCTPromiseResolveBlock,
            rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let root = Self.topViewController() else {
        reject("custom_adhan_no_window", "No view controller to present from", nil)
        return
      }
      // A picker already up means the previous call never came back; let it go
      // rather than stranding its promise.
      self.pendingResolve?(nil)
      self.pendingResolve = resolve
      self.pendingReject = reject

      let picker: UIDocumentPickerViewController
      if #available(iOS 14.0, *) {
        picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.audio])
      } else {
        picker = UIDocumentPickerViewController(documentTypes: ["public.audio"], in: .open)
      }
      picker.allowsMultipleSelection = false
      picker.delegate = self
      root.present(picker, animated: true)
    }
  }

  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = (scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first)?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }

  // MARK: - Importing

  private func importFrom(_ source: URL) throws -> [String: Any] {
    // A document the user picked lives outside the sandbox; the read has to be
    // bracketed by the security scope or it fails with a permission error.
    let scoped = source.startAccessingSecurityScopedResource()
    defer { if scoped { source.stopAccessingSecurityScopedResource() } }

    let data = try Data(contentsOf: source)
    let token = SHA256.hash(data: data).prefix(6).map { String(format: "%02x", $0) }.joined()
    let displayName = source.lastPathComponent
    let ext = source.pathExtension.isEmpty ? "mp3" : source.pathExtension.lowercased()

    // One import at a time — the previous original and its clip are only of
    // use to a sound name nothing will ask for again.
    try Self.purge(exceptToken: token)

    let original = try Self.storageDir().appendingPathComponent("\(token).\(ext)")
    try data.write(to: original, options: .atomic)
    try displayName.write(to: Self.nameFile(), atomically: true, encoding: .utf8)

    let clip = try Self.soundsDir().appendingPathComponent("\(Self.soundPrefix)\(token).caf")
    let written = try Self.writeNotificationClip(from: original, to: clip)

    return [
      "name": displayName,
      "token": token,
      "soundName": clip.lastPathComponent,
      "path": original.path,
      "bytes": data.count,
      "durationMs": Int(written.sourceSeconds * 1000),
      "trimmed": written.trimmed,
    ]
  }

  /// Decode the imported file and write the first [maxSeconds] of it as a CAF.
  ///
  /// `AVAudioFile` reads through ExtAudioFile, so it decodes mp3 and m4a as
  /// well as the uncompressed formats, and writing to a `.caf` URL with Linear
  /// PCM settings produces exactly what `UNNotificationSound` wants.
  private static func writeNotificationClip(
    from source: URL, to destination: URL
  ) throws -> (trimmed: Bool, sourceSeconds: Double) {
    let input = try AVAudioFile(forReading: source)
    let format = input.processingFormat
    let sourceSeconds = Double(input.length) / format.sampleRate
    let frameLimit = AVAudioFramePosition(maxSeconds * format.sampleRate)
    let framesToWrite = min(input.length, frameLimit)

    try? FileManager.default.removeItem(at: destination)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: format.sampleRate,
      AVNumberOfChannelsKey: format.channelCount,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let output = try AVAudioFile(
      forWriting: destination,
      settings: settings,
      commonFormat: format.commonFormat,
      interleaved: format.isInterleaved)

    let chunk: AVAudioFrameCount = 32768
    var written: AVAudioFramePosition = 0
    while written < framesToWrite {
      let remaining = AVAudioFrameCount(min(AVAudioFramePosition(chunk), framesToWrite - written))
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: remaining) else {
        break
      }
      try input.read(into: buffer, frameCount: remaining)
      if buffer.frameLength == 0 { break }
      try output.write(from: buffer)
      written += AVAudioFramePosition(buffer.frameLength)
    }
    return (trimmed: input.length > frameLimit, sourceSeconds: sourceSeconds)
  }

  private static func purge(exceptToken keep: String?) throws {
    let fm = FileManager.default
    if let dir = try? storageDir(),
      let entries = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    {
      for entry in entries where entry.lastPathComponent != "display-name" {
        if keep == nil || entry.deletingPathExtension().lastPathComponent != keep {
          try? fm.removeItem(at: entry)
        }
      }
    }
    if let dir = try? soundsDir(),
      let entries = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    {
      for entry in entries where entry.lastPathComponent.hasPrefix(soundPrefix) {
        if keep == nil || entry.lastPathComponent != "\(soundPrefix)\(keep!).caf" {
          try? fm.removeItem(at: entry)
        }
      }
    }
  }

  // MARK: - Queries

  @objc(current:rejecter:)
  func current(_ resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let original = Self.storedOriginal() else {
      resolve(nil)
      return
    }
    let token = original.deletingPathExtension().lastPathComponent
    let clip = (try? Self.soundsDir().appendingPathComponent("\(Self.soundPrefix)\(token).caf"))
    guard let clip, FileManager.default.fileExists(atPath: clip.path) else {
      // The original survived but the clip did not — an import that was
      // interrupted. Report nothing rather than a sound that will not play.
      resolve(nil)
      return
    }
    let name =
      (try? String(contentsOf: Self.nameFile(), encoding: .utf8)) ?? original.lastPathComponent
    let size = (try? FileManager.default.attributesOfItem(atPath: original.path)[.size] as? Int) ?? 0
    let seconds = (try? AVAudioFile(forReading: original)).map {
      Double($0.length) / $0.processingFormat.sampleRate
    }
    resolve([
      "name": name,
      "token": token,
      "soundName": clip.lastPathComponent,
      "path": original.path,
      "bytes": size ?? 0,
      "durationMs": Int((seconds ?? 0) * 1000),
      "trimmed": (seconds ?? 0) > Self.maxSeconds,
    ])
  }

  @objc(remove:rejecter:)
  func remove(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
    try? Self.purge(exceptToken: nil)
    try? FileManager.default.removeItem(at: Self.nameFile())
    resolve(true)
  }

  /// Android needs a channel built for the imported sound; iOS does not, and
  /// this exists so the JS side can call one shape on both platforms.
  @objc(ensureChannel:resolver:rejecter:)
  func ensureChannel(_ channelName: NSString,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }
}

// MARK: - UIDocumentPickerDelegate

extension CustomAdhan: UIDocumentPickerDelegate {
  func documentPicker(
    _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
  ) {
    let resolve = pendingResolve
    let reject = pendingReject
    pendingResolve = nil
    pendingReject = nil
    guard let source = urls.first else {
      resolve?(nil)
      return
    }
    // Off the main thread: decoding and rewriting a several-megabyte recording
    // is not something to do while the picker is dismissing.
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let descriptor = try self.importFrom(source)
        DispatchQueue.main.async { resolve?(descriptor) }
      } catch {
        DispatchQueue.main.async {
          reject?("custom_adhan_import_failed", error.localizedDescription, error)
        }
      }
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    let resolve = pendingResolve
    pendingResolve = nil
    pendingReject = nil
    // Cancelling is the user changing their mind, not an error.
    resolve?(nil)
  }
}
