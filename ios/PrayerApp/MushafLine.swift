import CoreText
import React
import UIKit

/**
 One line of the Ḥafṣ muṣḥaf, drawn with the pen.

 The line arrives as pieces in drawing order — right to left, the text is
 RTL — each a run of glyphs in the page font or a gap the pen skips, with
 an optional wash behind it and, for the marker's medallion, its own ink.
 The pen starts at `penRight` and walks left by each run's typographic width
 (CoreText's, the same shaper the platform's text view uses, so a word is
 exactly as wide here as it was there) or by the gap's width.

 Nothing here breaks or clips: a run a hair wider than expected lands a
 hair further left, and the ink that overshoots the line's ends and its
 metrics lands wherever the view has room for it — the view is sized by
 JS to have that room (`lineInkPadding`, `lineInkSidePadding`). See
 `src/quran/native/MushafLineView.ts` for why this exists. Catalyst draws
 through this same file.

 All positions are in points from JS.
 */
class MushafLineView: UIView {
  @objc var fontFamily: NSString = "" { didSet { setNeedsDisplay() } }
  @objc var fontSize: CGFloat = 0 { didSet { setNeedsDisplay() } }
  @objc var color: UIColor? { didSet { setNeedsDisplay() } }
  @objc var runs: NSArray? { didSet { setNeedsDisplay() } }
  @objc var penRight: CGFloat = 0 { didSet { setNeedsDisplay() } }
  @objc var penBaseline: CGFloat = 0 { didSet { setNeedsDisplay() } }
  @objc var boxTop: CGFloat = 0 { didSet { setNeedsDisplay() } }
  @objc var boxHeight: CGFloat = 0 { didSet { setNeedsDisplay() } }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isOpaque = false
    backgroundColor = .clear
    contentMode = .redraw
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  /// The page font by the family CoreText registered it under, at this size.
  private func font() -> UIFont {
    let family = fontFamily as String
    if let f = UIFont(name: family, size: fontSize) { return f }
    if let name = UIFont.fontNames(forFamilyName: family).first,
       let f = UIFont(name: name, size: fontSize) {
      return f
    }
    return UIFont.systemFont(ofSize: fontSize)
  }

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext(),
          let pieces = runs, pieces.count > 0, fontSize > 0, fontFamily.length > 0
    else { return }
    let font = font()
    let inkColor = color ?? .black
    let h = bounds.height

    // CoreText draws in a y-up space; flip once and place everything in it.
    ctx.saveGState()
    ctx.textMatrix = .identity
    ctx.translateBy(x: 0, y: h)
    ctx.scaleBy(x: 1, y: -1)

    // Two passes, washes then glyphs, so a swash that crosses into the next
    // word is drawn over its wash and not under it — which is how a
    // paragraph draws its span backgrounds too.
    var pen = penRight
    var lefts = [CGFloat](repeating: 0, count: pieces.count)
    var lines = [CTLine?](repeating: nil, count: pieces.count)
    let washTop = h - (boxTop + boxHeight)
    for i in 0..<pieces.count {
      guard let piece = pieces[i] as? NSDictionary else { continue }
      var advance: CGFloat = 0
      if let text = piece["t"] as? String {
        var attrs: [NSAttributedString.Key: Any] = [.font: font]
        if let ink = piece["i"], let c = RCTConvert.uiColor(ink) {
          attrs[.foregroundColor] = c
        } else {
          attrs[.foregroundColor] = inkColor
        }
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
        lines[i] = line
        advance = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
      } else if let gap = piece["g"] as? NSNumber {
        advance = CGFloat(gap.doubleValue)
      }
      let left = pen - advance
      lefts[i] = left
      if let wash = piece["w"], let c = RCTConvert.uiColor(wash) {
        ctx.setFillColor(c.cgColor)
        ctx.fill(CGRect(x: left, y: washTop, width: pen - left, height: boxHeight))
      }
      pen = left
    }
    for i in 0..<pieces.count {
      guard let line = lines[i] else { continue }
      ctx.textPosition = CGPoint(x: lefts[i], y: h - penBaseline)
      CTLineDraw(line, ctx)
    }
    ctx.restoreGState()
  }
}

/// `MushafLine` to JS — see `src/quran/native/MushafLineView.ts` for the props.
@objc(MushafLineManager)
class MushafLineManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! {
    MushafLineView(frame: .zero)
  }
}
