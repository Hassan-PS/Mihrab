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
  static func tap(date: String, prayer: String, now: Double = Date().timeIntervalSince1970 * 1000) {
    let next = applyTap(read(), date: date, prayer: prayer, now: now)
    defaults()?.set(serialize(next), forKey: key)
  }

  /// Which prayers are queued for `date` — what the widget draws as ticked.
  static func pending(for date: String) -> Set<String> {
    Set(read().filter { $0.d == date }.map { $0.p })
  }
}
