import Foundation
import UIKit
import React

/**
 Hardware-keyboard paging, for the platforms that have one.

 React Native has no API for hardware keys on iOS: `onKeyPress` fires only
 for text input and only for text keys, so an arrow key reaches JS through
 nothing at all. On a Mac window and an iPad with a keyboard that leaves
 the reader with no way to turn a page except reaching for the screen.

 The keys are declared on `AppDelegate`, which is a `UIResponder` sitting at
 the END of the responder chain — so anything with focus gets them first.
 That is the behaviour worth having: typing "d" into the surah search must
 type a "d", not turn a page, and it does, because the text field consumes
 the press before it ever reaches the delegate.
 */
@objc(MihrabKeyCommands)
class MihrabKeyCommands: RCTEventEmitter {
  /// Posted by `AppDelegate` when one of its key commands fires.
  static let notification = Notification.Name("MihrabKeyCommand")

  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { ["MihrabKeyCommand"] }

  override func startObserving() {
    hasListeners = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(onKey(_:)),
      name: MihrabKeyCommands.notification,
      object: nil
    )
  }

  override func stopObserving() {
    hasListeners = false
    NotificationCenter.default.removeObserver(
      self, name: MihrabKeyCommands.notification, object: nil
    )
  }

  @objc private func onKey(_ note: Notification) {
    guard hasListeners, let action = note.userInfo?["action"] as? String else {
      return
    }
    sendEvent(withName: "MihrabKeyCommand", body: ["action": action])
  }
}

/**
 The keys themselves.

 LEFT TURNS FORWARD, because the mushaf is a right-to-left book. Its pages
 advance leftwards — that is what the page images do, what a swipe does,
 and which chevron is the "next" one: the LEFT one. A keyboard that
 disagreed with all three would be the odd one out.

   forward (next page):  ←   A   H
   back    (previous):   →   D   L

 Three ways to say the same direction, because three sets of people reach
 for three different things: the arrows, WASD, and vim's HJKL. Note they
 agree — A and H are both "left" in their own convention, D and L are both
 "right" — so the rule is one rule, not three mappings to remember.

 UP AND DOWN ARE NOT BOUND. An earlier draft had them, on the theory that
 a page turn is "next" in the abstract and any forward-ish key would do.
 A book does not move up and down, and leaving them free means they still
 scroll a page that is taller than the window, which on a phone in
 landscape is most of them.

 `wantsPriorityOverSystemBehavior` is deliberately NOT set. These are
 plain letters and arrows, and claiming priority would take them from every
 text field in the app.
 */
extension AppDelegate {
  override var keyCommands: [UIKeyCommand]? {
    let forward = [UIKeyCommand.inputLeftArrow, "a", "h"]
    let back = [UIKeyCommand.inputRightArrow, "d", "l"]
    return forward.map {
      UIKeyCommand(input: $0, modifierFlags: [], action: #selector(mihrabForward(_:)))
    } + back.map {
      UIKeyCommand(input: $0, modifierFlags: [], action: #selector(mihrabBack(_:)))
    }
  }

  @objc func mihrabForward(_ sender: UIKeyCommand) {
    NotificationCenter.default.post(
      name: MihrabKeyCommands.notification,
      object: nil,
      userInfo: ["action": "forward"]
    )
  }

  @objc func mihrabBack(_ sender: UIKeyCommand) {
    NotificationCenter.default.post(
      name: MihrabKeyCommands.notification,
      object: nil,
      userInfo: ["action": "back"]
    )
  }
}
