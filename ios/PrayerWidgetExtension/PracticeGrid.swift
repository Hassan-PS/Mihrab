// The practice grid, as a widget can draw it.
//
// The in-app heatmap encodes six things on an 18pt square — fill depth,
// fasting, sunnah, missed, qiyam, selection — which needed a two-row legend
// to read. A widget has no legend and no tap, so it gets THREE states and
// nothing more: how many of the five were kept, whether something is still
// owed, and nothing recorded. Anything past that is a mark nobody can
// decode from a home screen.
//
// The ramp is the app's own — alpha = 0.42 + 0.58 × (kept/5) on the accent
// — so the widget and the Log screen describe the same week the same way.
// A widget that used its own scale would quietly disagree with the app.

import SwiftUI
import WidgetKit

struct PracticeGrid: View {
  let days: [WidgetPayload.PracticeDay]
  /// Weeks to draw, newest last.
  let weeks: Int
  let cell: CGFloat
  let spacing: CGFloat
  let accent: Color

  /// Danger red for a day still carrying an unmade-up prayer. Deliberately
  /// not the accent at low alpha: "owed" is a different KIND of day, not a
  /// weaker version of a kept one, and encoding it as less-of-the-same is
  /// how the in-app version became unreadable.
  private let owedColor = Color(red: 248 / 255, green: 113 / 255, blue: 113 / 255)

  var body: some View {
    let byDate = Dictionary(days.map { ($0.d, $0) }, uniquingKeysWith: { a, _ in a })
    let columns = buildColumns()

    HStack(spacing: spacing) {
      ForEach(Array(columns.enumerated()), id: \.offset) { _, week in
        VStack(spacing: spacing) {
          ForEach(Array(week.enumerated()), id: \.offset) { _, key in
            let day = key.flatMap { byDate[$0] }
            RoundedRectangle(cornerRadius: cell * 0.28, style: .continuous)
              .fill(key == nil ? Color.clear : color(for: day))
              .overlay {
                // The hairline the Log screen gives an empty square. An empty
                // cell cannot carry enough contrast at a lightness that still
                // reads as empty, so the ring carries it — without it the
                // untouched end of the current week is invisible.
                if key != nil, weight(of: day) <= 0, logged(of: day) <= 0 {
                  RoundedRectangle(cornerRadius: cell * 0.28, style: .continuous)
                    .strokeBorder(accent.opacity(0.22), lineWidth: max(1, cell * 0.09))
                }
              }
              .overlay {
                // Today, ringed, as the app rings it. A grid whose last
                // squares are empty says nothing about where now is.
                if let key, key == todayKey {
                  RoundedRectangle(cornerRadius: cell * 0.28, style: .continuous)
                    .strokeBorder(accent.opacity(0.85), lineWidth: max(1.5, cell * 0.14))
                }
              }
              .frame(width: cell, height: cell)
          }
        }
      }
    }
  }

  /// Weeks as columns, each column a MONDAY-first run of seven day keys.
  ///
  /// Monday rather than the locale's own first weekday, and rather than the
  /// Sunday this used to hard-code: the in-app heatmap starts its weeks on
  /// Monday deliberately, so the two sunnah fast days land in the first and
  /// fourth rows instead of straddling a column boundary. A widget whose
  /// columns are offset by a day or two from the Log screen's draws the same
  /// record as a different shape, which is the one thing this grid must not
  /// do.
  ///
  /// `nil` marks a day past today — the current week is usually partial,
  /// and drawing its remaining days as "nothing recorded" would claim the
  /// user has already missed days that have not happened yet.
  private func buildColumns() -> [[String?]] {
    var cal = Calendar.current
    cal.firstWeekday = 2
    let today = Date()
    guard let thisWeekStart = cal.dateInterval(of: .weekOfYear, for: today)?.start
    else { return [] }

    var out: [[String?]] = []
    for w in stride(from: weeks - 1, through: 0, by: -1) {
      guard let weekStart = cal.date(byAdding: .day, value: -7 * w, to: thisWeekStart)
      else { continue }
      var column: [String?] = []
      for d in 0..<7 {
        guard let date = cal.date(byAdding: .day, value: d, to: weekStart) else {
          column.append(nil)
          continue
        }
        column.append(cal.startOfDay(for: date) > cal.startOfDay(for: today) ? nil : key(date, cal))
      }
      out.append(column)
    }
    return out
  }

  private func key(_ date: Date, _ cal: Calendar) -> String {
    let c = cal.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// Today's key, in the same shape the payload uses.
  private var todayKey: String {
    var cal = Calendar.current
    cal.firstWeekday = 2
    return key(Date(), cal)
  }

  /// The Log screen's `fillFor`, with the names changed.
  ///
  /// ORDER MATTERS, and it used to be wrong here: `m` was tested first, so a
  /// day of four prayers on time and one marked missed — the ordinary shape
  /// of a day still in progress — drew red on the home screen and strong
  /// green in the app. The app treats `missed` as a MARK on a day, not as
  /// the day's colour; red is what a day looks like when something was
  /// recorded and none of it was kept.
  private func color(for day: WidgetPayload.PracticeDay?) -> Color {
    guard let day else { return accent.opacity(0.10) }
    let w = weight(of: day)
    if w > 0 { return accent.opacity(0.42 + 0.58 * (Double(w) / 500.0)) }
    if logged(of: day) > 0 { return owedColor.opacity(0.30) }
    return accent.opacity(0.10)
  }

  /// The day's weighted score, 0…500, as the Log screen computes it: on-time
  /// 100, late 70, qadha 45, missed 0. `k` is the older count and only a
  /// fallback — it credits a late prayer in full and a made-up one not at
  /// all, which is why it stopped being what the fill is drawn from.
  private func weight(of day: WidgetPayload.PracticeDay?) -> Int {
    guard let day else { return 0 }
    if let kw = day.kw { return min(max(kw, 0), 500) }
    return min(max(day.k, 0), 5) * 100
  }

  /// Entries recorded that day, whatever they say. Absent on old payloads,
  /// where the missed flag was the only sign anything had been recorded.
  private func logged(of day: WidgetPayload.PracticeDay?) -> Int {
    guard let day else { return 0 }
    if let l = day.l { return max(l, 0) }
    return day.m == true ? 1 : 0
  }
}
