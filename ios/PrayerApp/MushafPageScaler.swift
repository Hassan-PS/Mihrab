//
//  MushafPageScaler.swift
//  PrayerApp
//
//  High-quality mushaf page downscaler — v2.7.28.
//
//  Produces a cached copy of a 2600×4206 page PNG at the exact pixel
//  size the reader displays, using Core Graphics with .high
//  interpolation (Lanczos-class). The reader then shows the bitmap 1:1
//  with the screen, avoiding the single-step GPU minification that
//  left thin Arabic strokes ragged.
//

import Foundation
import React
import UIKit

@objc(MushafPageScaler)
class MushafPageScaler: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private static let queue = DispatchQueue(
    label: "com.prayer_times.mushafScaler",
    qos: .utility
  )

  @objc(scaleToWidth:destPath:targetWidth:resolver:rejecter:)
  func scaleToWidth(
    _ srcPath: String,
    destPath: String,
    targetWidth: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    MushafPageScaler.queue.async {
      let target = CGFloat(truncating: targetWidth)
      guard target > 0, let img = UIImage(contentsOfFile: srcPath),
            img.size.width > 0
      else {
        reject("scale_failed", "decode failed: \(srcPath)", nil)
        return
      }
      let scale = target / (img.size.width * img.scale)
      let size = CGSize(
        width: target,
        height: (img.size.height * img.scale * scale).rounded()
      )
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let out = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
        ctx.cgContext.interpolationQuality = .high
        img.draw(in: CGRect(origin: .zero, size: size))
      }
      guard let data = out.pngData() else {
        reject("scale_failed", "encode failed", nil)
        return
      }
      do {
        let dir = (destPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(
          atPath: dir,
          withIntermediateDirectories: true
        )
        try data.write(to: URL(fileURLWithPath: destPath), options: .atomic)
        resolve(destPath)
      } catch {
        reject("scale_failed", error.localizedDescription, error)
      }
    }
  }
}
