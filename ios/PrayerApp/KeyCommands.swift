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

 Three sets, because three sets of people reach for three different things
 and none of them is wrong: the arrows, WASD, and vim's HJKL. Forward is
 right/down/D/S/L/J and back is left/up/A/W/H/K, which is what each of
 those conventions already means on its own terms.

 NOT bound to the mushaf's visual direction. The page images advance
 leftwards because the book is read right-to-left, and an earlier draft
 mapped the left arrow to "next" for that reason. It is defensible and it
 is wrong for a keyboard: "forward" is the next page of the book, and a
 reader pressing right expects to move forward through what they are
 reading, not leftward across a spread.

 `wantsPriorityOverSystemBehavior` is deliberately NOT set. These are
 plain letters and arrows, and claiming priority would take them from every
 text field in the app.
 */
extension AppDelegate {
  override var keyCommands: [UIKeyCommand]? {
    let forward = [
      UIKeyCommand.inputRightArrow, UIKeyCommand.inputDownArrow,
      "d", "s", "l", "j",
    ]
    let back = [
      UIKeyCommand.inputLeftArrow, UIKeyCommand.inputUpArrow,
      "a", "w", "h", "k",
    ]
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
