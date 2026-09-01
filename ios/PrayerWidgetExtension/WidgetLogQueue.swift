// Taps on the Log Today widget, waiting for the app to write them.
//
// The journal is an encrypted blob whose key lives on the JS side, so a
// widget extension cannot write it — and should not want to. `logPrayerOnTime`
// in `prayerLogAction.ts` already owns that write, including the rule that an
// existing status is never overwritten, and a second implementation of that
// rule in Swift is one that can drift from the first.
//
// So a tap lands here, in the same App Group defaults the payload already
// uses, and the app drains it through the real writer when it next runs. The
// widget renders this queue over the payload, so the tick appears on the tap
// rather than on the next launch.
//
// THE RULES BELOW MUST MATCH `src/widget/widgetLogQueue.ts` AND
// `WidgetLogQueue.kt`. That TypeScript file's tests are what say what the
// rules are; these are the second and third implementations of a three-case
// rule, and the only defence against the three disagreeing is that the cases
// are few enough to state in one place each.

import Foundation
import os

/// WHY THIS FILE LOGS AT ALL.
///
/// On 2026-08-29 a user reported that tapping a prayer on the Mac widget did
/// nothing, and tapping it twice — the obvious thing to do when a button
/// appears dead — silently took the log back, because a second tap inside the
/// undo window is the undo. Reading the App Group afterwards showed why: the
/// `widget_log_queue` key was not there, and neither was any other key this
/// extension had ever written. The container held six keys and the app had
/// written all six. Every write from this process had been dropped.
///
/// Nothing could say more than that, because the extension emitted NOTHING to
/// the unified log — 20 minutes of taps produced zero lines — so from outside
/// there was no way to tell a failed write from an intent that never ran.
/// `tap()` has always returned whether the write reads back, and the comment
/// under it said in as many words that nothing acts on the result. That is the
/// bug behind the bug: the one process that knew was the one staying quiet.
///
/// ── AND WHY THESE ARE `notice`, NOT `info` (2026-09-01) ───────────────
///
/// The lines added on 2026-08-29 were `.info`, which was the second way to
/// lose the same evidence. `Logger.info` goes to the MEMORY store, and
/// `log show` does not display it without `--info` — so an investigator who
/// runs the obvious query
///
///   log show --predicate 'subsystem == "com.hassan.prayerapp.widget"'
///
/// sees an empty table and concludes the code never ran. That is exactly
/// what happened here: chronod's own log shows `LogPrayerIntent.perform()`
/// invoked and finished at 18:04:29 on 2026-08-31, in this extension's
/// process, while our subsystem appeared to have said nothing at all.
///
/// `.notice` is the lowest level the unified log PERSISTS by default. These
/// lines are written a handful of times a day, by a button, about whether
/// someone's worship was recorded. That is worth a persisted line. If the
/// volume ever becomes a problem, the fix is a signpost profile, not a
/// quieter level.
let widgetLogLog = Logger(subsystem: "com.hassan.prayerapp.widget", category: "logqueue")

/// The Darwin notification that tells the app a widget queue has changed.
///
/// WHY THIS EXISTS. The queue drains on exactly two events — the app
/// mounting, and `AppState` going `active` — and a widget tap is neither.
/// On iPhone that is invisible: you cannot see a Home Screen widget while
/// the app is in front of you, so a tap always happens with the app in the
/// background, and opening it afterwards fires `active`. On a Mac,
/// Notification Center opens OVER an app that stays active, which is the
/// normal way to use the widget and therefore the normal way to strand a
/// tap. Measured 2026-08-29: two taps sat in the queue with the app open
/// the whole time, and only a relaunch wrote them.
///
/// That is worse than a delay. `MAX_QUEUE_AGE_MS` discards entries after a
/// fortnight, on the reasoning that a queue undrained for two weeks means
/// the app has not been opened for two weeks — an assumption that is simply
/// false on macOS, where the app can be open throughout. Left alone, a
/// fortnight of prayers logged from the widget would be dropped while the
/// widget showed the ticks the entire time.
///
/// A Darwin notification is the documented channel between an extension and
/// its container app, and it is the only one available here: the extension
/// cannot write the journal, and the app cannot observe another process's
/// UserDefaults reliably. It carries no payload — it only says "look again",
/// and the app re-reads the queue through the same drain it already had.
let widgetQueueChangedNotification = "com.hassan.prayerapp.widgetQueueChanged"

/// Tell the app to drain. Safe to call from any queue and from either
/// widget; posting when nobody is listening is a no-op.
func postWidgetQueueChanged() {
  CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName(widgetQueueChangedNotification as CFString),
    nil, nil, true)
}

enum WidgetLogQueue {
  static let key = "widget_log_queue"

  /// Tapping the same prayer again within this takes the tap back.
  static let undoWindowMs: Double = 60_000

  /// The five that can be logged, in the order they are prayed.
  static let prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]

  struct Entry: Codable, Equatable {
    /// yyyy-MM-dd
    let d: String
    let p: String
    /// Epoch milliseconds, to match the other two implementations.
    let t: Double
  }

  private static func defaults() -> UserDefaults? {
    UserDefaults(suiteName: kSuite)
  }

  private static func isDateKey(_ s: String) -> Bool {
    s.count == 10 && s.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil
  }

  /// Read the queue back, dropping anything that could not have come from a
  /// real tap. The same discipline the JS side applies, for the same reason:
  /// this string is written by another process and its contents end up in
  /// someone's record of their own worship.
  static func read() -> [Entry] {
    guard let raw = defaults()?.string(forKey: key),
          let data = raw.data(using: .utf8),
          let decoded = try? JSONDecoder().decode([Entry].self, from: data)
    else { return [] }
    return decoded.filter { isDateKey($0.d) && prayers.contains($0.p) && $0.t > 0 }
  }

  static func serialize(_ entries: [Entry]) -> String {
    guard let data = try? JSONEncoder().encode(entries),
          let s = String(data: data, encoding: .utf8)
    else { return "[]" }
    return s
  }

  /// Apply one tap. Mirrors `applyTap` in widgetLogQueue.ts:
  ///
  ///   • queued, inside the undo window  → remove it (this is the undo)
  ///   • queued, outside the window      → leave it; a tap an hour later is
  ///                                       someone confirming, and silently
  ///                                       un-logging a prayer they believe
  ///                                       they logged is the worst outcome
  ///                                       available here
  ///   • not queued                      → add it
  static func applyTap(
    _ queue: [Entry],
    date: String,
    prayer: String,
    now: Double,
    undoWindowMs: Double = WidgetLogQueue.undoWindowMs
  ) -> [Entry] {
    if let existing = queue.first(where: { $0.d == date && $0.p == prayer }) {
      guard now - existing.t <= undoWindowMs else { return queue }
      return queue.filter { !($0.d == date && $0.p == prayer) }
    }
    return queue + [Entry(d: date, p: prayer, t: now)]
  }

  /// Record a tap and persist it.
  ///
  /// `synchronize()` is nominally unnecessary on modern OS versions and is
  /// here anyway, because this is the first code in the app to WRITE to the
  /// App Group from an extension rather than read from it — and the app's own
  /// bridge does the same thing for the same reason (see PrayerWidget.m).
  /// The failure this guards against is not theoretical: on Catalyst a
  /// UserDefaults for a group the process is not entitled to looks alive and
  /// silently drops every write. Cheap insurance against a dead button.
  ///
  /// Returns whether the write can be read back. Nothing acts on it today —
  /// the widget's tick comes from the same read, so a dropped write shows as
  /// a button that does nothing rather than a lie — but a caller that wants
  /// to say something about it now can.
  @discardableResult
  static func tap(
    date: String,
    prayer: String,
    now: Double = Date().timeIntervalSince1970 * 1000
  ) -> Bool {
    let before = read()
    let next = applyTap(before, date: date, prayer: prayer, now: now)
    let undoing = next.count < before.count
    guard let store = defaults() else {
      // Distinguishable from a refused write on purpose: a nil suite means
      // this process is not entitled to the group at all, and no amount of
      // retrying changes that.
      widgetLogLog.error(
        "tap \(prayer, privacy: .public) \(date, privacy: .public): no UserDefaults for suite \(kSuite, privacy: .public)")
      return false
    }
    store.set(serialize(next), forKey: key)
    store.synchronize()
    let ok = read() == next
    if ok {
      // Only on a write that read back. Waking the app to drain a queue that
      // did not change is the one way this can be worse than doing nothing.
      postWidgetQueueChanged()
      widgetLogLog.notice(
        "tap \(prayer, privacy: .public) \(date, privacy: .public) \(undoing ? "undone" : "queued", privacy: .public), queue now \(next.count, privacy: .public)")
    } else {
      // The failure the user saw: set() and synchronize() both "succeed" and
      // the value is not there afterwards. Logged with what was attempted so
      // the next question — entitlement, container, or sandbox — can be asked
      // against evidence rather than guessed at.
      widgetLogLog.error(
        "tap \(prayer, privacy: .public) \(date, privacy: .public): WRITE DROPPED — suite \(kSuite, privacy: .public) accepted \(next.count, privacy: .public) entr(ies) and read back \(self.read().count, privacy: .public)")
    }
    return ok
  }

  /// Which prayers are queued for `date` — what the widget draws as ticked.
  static func pending(for date: String) -> Set<String> {
    Set(read().filter { $0.d == date }.map { $0.p })
  }
}
