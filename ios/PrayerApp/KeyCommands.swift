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

  /**
   Whether the ARROW keys may be taken from the system, right now.

   Read by `AppDelegate.keyCommands` every time UIKit asks for the list.
   See the note on `keyCommands` for why the arrows need this and the
   letters do not, and `useKeyPaging.ts` for who turns it on and off.
   */
  static var arrowPriority = false

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

  /**
   Claim, or release, the arrow keys.

   Called from JS: on while the muṣḥaf reader is the screen, off the
   moment a text field in it takes focus, so that ← and → still move a
   caret in the surah search rather than turning pages under it.
   */
  @objc func setArrowPriority(_ on: NSNumber) {
    DispatchQueue.main.async {
      MihrabKeyCommands.arrowPriority = on.boolValue
    }
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

 ── THE ARROWS HAVE TO BE CLAIMED, AND THE LETTERS MUST NOT BE ────────

 On Mac Catalyst the letters worked and the arrows did not, which is the
 shape of the bug reported after 2.14.1: every other control in the reader
 turned a page and the arrow keys did nothing.

 A scroll view scrolls itself with the arrow keys — that is system
 behaviour, `UIScrollView.allowsKeyboardScrolling` is on by default, and
 the muṣḥaf reader is scroll views all the way down. System behaviour wins
 over a key command declared at the END of the responder chain, so ← and →
 were being eaten before the app delegate ever saw them. Letters have no
 system meaning in a scroll view, so they arrived fine.

 `wantsPriorityOverSystemBehavior` is what takes a key back from the
 system, and it is set HERE ON THE ARROWS ONLY, and only while
 `MihrabKeyCommands.arrowPriority` says so. Both halves matter:

   • The letters never claim priority. "d" must type a "d" in the surah
     search, and a key command that outranks a focused text field would
     take it.

   • The arrows claim it only while the reader is open and nothing in it
     is being typed into — JS turns the flag off the moment a text field
     takes focus (`useKeyPaging.ts`), because ← and → move a caret there
     and a page turn under someone's cursor is worse than no shortcut.

 UIKit asks for this list afresh each time it matches a key, so reading a
 flag here is enough; the commands do not need rebuilding.
 */
extension AppDelegate {
  override var keyCommands: [UIKeyCommand]? {
    let forward = [UIKeyCommand.inputLeftArrow, "a", "h"]
    let back = [UIKeyCommand.inputRightArrow, "d", "l"]
    let arrows = [UIKeyCommand.inputLeftArrow, UIKeyCommand.inputRightArrow]
    let claim = MihrabKeyCommands.arrowPriority
    func command(_ input: String, _ action: Selector) -> UIKeyCommand {
      let key = UIKeyCommand(input: input, modifierFlags: [], action: action)
      if claim && arrows.contains(input) {
        key.wantsPriorityOverSystemBehavior = true
      }
      return key
    }
    return forward.map { command($0, #selector(mihrabForward(_:))) }
      + back.map { command($0, #selector(mihrabBack(_:))) }
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
