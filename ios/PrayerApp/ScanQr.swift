import AVFoundation
import Foundation
import React
import UIKit

/**
 Point the camera at another device's pairing code.

 ── NO DEPENDENCY AT ALL ─────────────────────────────────────────────────

 iOS decodes QR codes in the capture pipeline itself: an
 `AVCaptureMetadataOutput` asked for `.qr` hands back the decoded string,
 already de-skewed and error-corrected, with no image processing here and no
 library to install. Android needs ZXing for the same job; this side needs
 nothing, which is the whole reason the two implementations look so
 different.

 ── A MODAL, NOT A REACT VIEW ────────────────────────────────────────────

 A camera preview inside the React tree means a native view manager, a
 lifecycle to keep in step with a JS component, and a surface that has to
 survive navigation — all to show a rectangle for four seconds. Presenting a
 view controller means the camera is created when it appears and gone when
 it is dismissed, which is the property that matters for a permission people
 are right to be careful about.

 ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────

 No torch, no zoom, no gallery import. A pairing code fills a phone screen
 held thirty centimetres away in a room light enough to read it, and every
 control here is one more thing between someone and a feature they use twice.
 */
@objc(ScanQr)
class ScanQr: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  private var presented: ScannerViewController?

  /// Whether there is a camera to point at anything.
  @objc(isAvailable:rejecter:)
  func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(AVCaptureDevice.default(for: .video) != nil)
  }

  /**
   Resolves `{text}` on a scan and `{cancelled: true}` when the user backs
   out. Rejects only when there is no camera or the user refused it — three
   situations that read as "nothing was scanned" and need different things
   said about them.
   */
  @objc(scan:cancel:resolver:rejecter:)
  func scan(
    _ hint: NSString,
    cancel: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard presented == nil else {
      reject("busy", "the scanner is already open", nil)
      return
    }
    guard AVCaptureDevice.default(for: .video) != nil else {
      reject("no_camera", "this device has no usable camera", nil)
      return
    }

    let start = { [weak self] in
      guard let self else { return }
      guard let presenter = Self.topViewController() else {
        reject("no_window", "there is no view controller to present from", nil)
        return
      }
      let controller = ScannerViewController(
        hint: hint as String,
        cancelTitle: cancel as String
      )
      controller.onFinish = { [weak self] text in
        self?.presented = nil
        controller.dismiss(animated: true) {
          if let text, !text.isEmpty {
            resolve(["text": text])
          } else {
            resolve(["cancelled": true])
          }
        }
      }
      controller.modalPresentationStyle = .fullScreen
      self.presented = controller
      presenter.present(controller, animated: true)
    }

    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      start()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          if granted {
            start()
          } else {
            reject("denied", "the camera permission was refused", nil)
          }
        }
      }
    default:
      // Refused earlier, or restricted by policy. Asking again does nothing
      // — iOS will not show the prompt twice — so the JS side says where to
      // turn it back on.
      reject("denied", "the camera permission was refused", nil)
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let next = top?.presentedViewController {
      top = next
    }
    return top
  }
}

/// The camera screen itself.
private final class ScannerViewController: UIViewController,
  AVCaptureMetadataOutputObjectsDelegate
{
  /// Called once, with the decoded string or nil for a cancel.
  var onFinish: ((String?) -> Void)?

  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "mihrab.scanqr.session")
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private let hintText: String
  private let cancelTitle: String
  /// A QR fills many frames; without this the promise resolves repeatedly.
  private var finished = false

  init(hint: String, cancelTitle: String) {
    self.hintText = hint
    self.cancelTitle = cancelTitle
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not from a nib") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    guard configureSession() else {
      finish(with: nil)
      return
    }

    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    view.layer.addSublayer(layer)
    previewLayer = layer

    let label = UILabel()
    label.text = hintText
    label.textColor = .white
    label.textAlignment = .center
    label.numberOfLines = 0
    label.font = .systemFont(ofSize: 16)
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)

    let button = UIButton(type: .system)
    button.setTitle(cancelTitle, for: .normal)
    button.setTitleColor(.white, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    button.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    button.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(button)

    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      label.bottomAnchor.constraint(equalTo: button.topAnchor, constant: -16),
      button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      button.bottomAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.bottomAnchor,
        constant: -32
      ),
    ])
  }

  private func configureSession() -> Bool {
    guard let device = AVCaptureDevice.default(for: .video),
          let input = try? AVCaptureDeviceInput(device: device),
          session.canAddInput(input)
    else {
      return false
    }
    session.beginConfiguration()
    session.addInput(input)

    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else {
      session.commitConfiguration()
      return false
    }
    session.addOutput(output)
    // Set AFTER adding to the session: the available types depend on the
    // output being attached, and assigning `.qr` before it is a crash.
    output.setMetadataObjectsDelegate(self, queue: .main)
    output.metadataObjectTypes = output.availableMetadataObjectTypes.contains(.qr)
      ? [.qr]
      : []
    session.commitConfiguration()
    return !output.metadataObjectTypes.isEmpty
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    // `startRunning` blocks until the camera is up, which on the main thread
    // is a visible stall before the sheet has finished animating in.
    sessionQueue.async { [weak self] in
      guard let self, !self.session.isRunning else { return }
      self.session.startRunning()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard !finished else { return }
    let text = metadataObjects
      .compactMap { $0 as? AVMetadataMachineReadableCodeObject }
      .first(where: { $0.type == .qr })?
      .stringValue
    guard let text, !text.isEmpty else { return }
    finish(with: text)
  }

  @objc private func cancelTapped() {
    finish(with: nil)
  }

  private func finish(with text: String?) {
    guard !finished else { return }
    finished = true
    onFinish?(text)
  }
}
