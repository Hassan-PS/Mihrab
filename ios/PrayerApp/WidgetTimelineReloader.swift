import Foundation
import WidgetKit

/**
 Ask WidgetKit to redraw — but not more often than it will listen.

 ── WHY THIS IS NOT A ONE-LINER ───────────────────────────────────────

 Every write to the App Group used to call `reloadAllTimelines()` straight
 away: the payload, the UI hints, the highlight colour, and both tap
 queues. The payload alone is republished on a practice change, a reading
 change, a bead counted, a language change, every foreground and every
 launch — and each of those is one call that reloads all five widget
 kinds. Counting a round of dhikr produced a burst of them.

 WidgetKit does not queue that up. It drops it, and says so:

   Follow-on reload from completion needed: [scheduledRetry(
     externalRequestThrottledRetry(externalRequest([source:unknown],
     reason: ExternalRequestTimelineReloadFilter - throttled reload)))]

 A throttled reload is retried later, on WidgetKit's schedule rather than
 ours, so the card that prompted the write is not the card that gets
 redrawn. Asking five times in a second is a good way to be heard zero
 times.

 So the calls coalesce here instead. The first one goes straight through —
 a reload that is actually prompt is the whole point — and anything within
 the window after it is folded into a single trailing call. Bursts become
 two reloads: one now, one when the burst settles.
 */
@objc final class WidgetTimelineReloader: NSObject {
  /// Long enough to swallow a launch burst, short enough that a tap still
  /// feels immediate. The JS side coalesces republishes on a similar scale.
  private static let window: TimeInterval = 2.0

  private static let lock = NSLock()
  private static var lastReload: Date?
  private static var trailingScheduled = false

  @objc static func reloadAllTimelinesIfAvailable() {
    guard #available(iOS 14.0, *) else { return }

    lock.lock()
    let now = Date()
    let since = lastReload.map { now.timeIntervalSince($0) } ?? .greatestFiniteMagnitude
    if since >= window {
      lastReload = now
      lock.unlock()
      WidgetCenter.shared.reloadAllTimelines()
      return
    }
    // Inside the window. One trailing call covers every request in it —
    // they all mean the same thing, "the App Group changed".
    if trailingScheduled {
      lock.unlock()
      return
    }
    trailingScheduled = true
    let delay = window - since
    lock.unlock()

    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
      lock.lock()
      trailingScheduled = false
      lastReload = Date()
      lock.unlock()
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  /// For the one caller that must not be coalesced: a tap the user just
  /// made, where a second of lag is the difference between the widget
  /// feeling responsive and feeling broken.
  @objc static func reloadAllTimelinesNow() {
    guard #available(iOS 14.0, *) else { return }
    lock.lock()
    lastReload = Date()
    lock.unlock()
    WidgetCenter.shared.reloadAllTimelines()
  }
}
