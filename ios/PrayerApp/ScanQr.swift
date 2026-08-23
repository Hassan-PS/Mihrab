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
  @objc(scan:cancel:accent:resolver:rejecter:)
  func scan(
    _ hint: NSString,
    cancel: NSString,
    accent: NSString,
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
        cancelTitle: cancel as String,
        accent: UIColor(hex: accent as String) ?? Self.defaultAccent
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

  /// Mihrab's green, for when JS sends nothing usable.
  private static let defaultAccent = UIColor(
    red: 0x0F / 255, green: 0x51 / 255, blue: 0x32 / 255, alpha: 1
  )

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
  private let accent: UIColor
  /// Redrawn on rotation; see `layoutViewfinder`.
  private let scrimLayer = CAShapeLayer()
  private let bracketLayer = CAShapeLayer()
  /// A QR fills many frames; without this the promise resolves repeatedly.
  private var finished = false

  init(hint: String, cancelTitle: String, accent: UIColor) {
    self.hintText = hint
    self.cancelTitle = cancelTitle
    self.accent = accent
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

    // The frame is not decoration. A camera filling the screen gives no
    // clue how close to hold it or what part is being read, and people
    // answer that by waving the phone around until something happens. A
    // window with the rest dimmed says both things before they are asked.
    scrimLayer.fillRule = .evenOdd
    scrimLayer.fillColor = UIColor.black.withAlphaComponent(0.65).cgColor
    view.layer.addSublayer(scrimLayer)

    bracketLayer.fillColor = nil
    bracketLayer.strokeColor = accent.cgColor
    bracketLayer.lineWidth = 4
    bracketLayer.lineCap = .round
    bracketLayer.lineJoin = .round
    view.layer.addSublayer(bracketLayer)

    let label = UILabel()
    label.text = hintText
    label.textColor = .white
    label.textAlignment = .center
    label.numberOfLines = 0
    label.font = .systemFont(ofSize: 16, weight: .medium)
    // White on an unknown scene: the shadow is what keeps it readable
    // against a bright wall without putting a plate behind it.
    label.layer.shadowColor = UIColor.black.cgColor
    label.layer.shadowOpacity = 0.8
    label.layer.shadowRadius = 6
    label.layer.shadowOffset = CGSize(width: 0, height: 1)
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)

    // A pill, not a bare word on a camera. Translucent white rather than
    // the accent, because backing out is not the thing being encouraged —
    // but it is still a real target.
    let button = UIButton(type: .custom)
    button.setTitle(cancelTitle, for: .normal)
    button.setTitleColor(.white, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    button.backgroundColor = UIColor.white.withAlphaComponent(0.22)
    button.layer.cornerRadius = 26
    button.layer.borderWidth = 1
    button.layer.borderColor = UIColor.white.withAlphaComponent(0.4).cgColor
    button.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    button.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(button)

    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
      label.bottomAnchor.constraint(equalTo: button.topAnchor, constant: -20),
      button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      // Sized by constraint rather than by content insets, which are
      // deprecated from iOS 15 and would warn on every build.
      button.heightAnchor.constraint(equalToConstant: 52),
      button.widthAnchor.constraint(greaterThanOrEqualToConstant: 180),
      button.bottomAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.bottomAnchor,
        constant: -40
      ),
    ])
  }

  /**
   The dimmed screen with a window in it, and four accent corners.

   The window sits ABOVE centre, at 42% of the height. Centred looks
   balanced in a mockup and wrong in the hand: the bottom third of a phone
   held up is where the fingers and the button are, and a code framed there
   is a code held at an angle.
   */
  private func layoutViewfinder() {
    let bounds = view.bounds
    guard bounds.width > 0, bounds.height > 0 else { return }
    let side = min(bounds.width, bounds.height) * 0.68
    let window = CGRect(
      x: bounds.midX - side / 2,
      y: bounds.height * 0.42 - side / 2,
      width: side,
      height: side
    )
    let radius: CGFloat = 22

    let scrim = UIBezierPath(rect: bounds)
    scrim.append(UIBezierPath(roundedRect: window, cornerRadius: radius))
    scrimLayer.frame = bounds
    scrimLayer.path = scrim.cgPath

    bracketLayer.frame = bounds
    bracketLayer.path = Self.corners(of: window, radius: radius, arm: side * 0.16)
  }

  /// Four rounded Ls, one per corner, as a single path.
  private static func corners(
    of window: CGRect,
    radius r: CGFloat,
    arm: CGFloat
  ) -> CGPath {
    let path = UIBezierPath()
    let l = window.minX, t = window.minY, rt = window.maxX, b = window.maxY

    path.move(to: CGPoint(x: l + r + arm, y: t))
    path.addLine(to: CGPoint(x: l + r, y: t))
    path.addArc(
      withCenter: CGPoint(x: l + r, y: t + r), radius: r,
      startAngle: -.pi / 2, endAngle: .pi, clockwise: false
    )
    path.addLine(to: CGPoint(x: l, y: t + r + arm))

    path.move(to: CGPoint(x: rt - r - arm, y: t))
    path.addLine(to: CGPoint(x: rt - r, y: t))
    path.addArc(
      withCenter: CGPoint(x: rt - r, y: t + r), radius: r,
      startAngle: -.pi / 2, endAngle: 0, clockwise: true
    )
    path.addLine(to: CGPoint(x: rt, y: t + r + arm))

    path.move(to: CGPoint(x: rt, y: b - r - arm))
    path.addLine(to: CGPoint(x: rt, y: b - r))
    path.addArc(
      withCenter: CGPoint(x: rt - r, y: b - r), radius: r,
      startAngle: 0, endAngle: .pi / 2, clockwise: true
    )
    path.addLine(to: CGPoint(x: rt - r - arm, y: b))

    path.move(to: CGPoint(x: l + r + arm, y: b))
    path.addLine(to: CGPoint(x: l + r, y: b))
    path.addArc(
      withCenter: CGPoint(x: l + r, y: b - r), radius: r,
      startAngle: .pi / 2, endAngle: .pi, clockwise: false
    )
    path.addLine(to: CGPoint(x: l, y: b - r - arm))

    return path.cgPath
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
    // No implicit animation: on rotation the scrim would otherwise slide
    // its hole across the screen for a quarter of a second.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    layoutViewfinder()
    CATransaction.commit()
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

private extension UIColor {
  /**
   `#RRGGBB` as sent by the JS side.

   Nil for anything else rather than a guess: a colour that failed to parse
   should fall back to the app's own green, not to whatever `0` happens to
   mean.
   */
  convenience init?(hex: String) {
    var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.hasPrefix("#") { text.removeFirst() }
    guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
    self.init(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }
}
