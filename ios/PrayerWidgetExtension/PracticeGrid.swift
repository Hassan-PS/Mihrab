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
            RoundedRectangle(cornerRadius: cell * 0.28, style: .continuous)
              .fill(color(for: key.flatMap { byDate[$0] }, isFuture: key == nil))
              .frame(width: cell, height: cell)
          }
        }
      }
    }
  }

  /// Weeks as columns, each column a Sunday-first run of seven day keys.
  ///
  /// `nil` marks a day past today — the current week is usually partial,
  /// and drawing its remaining days as "nothing recorded" would claim the
  /// user has already missed days that have not happened yet.
  private func buildColumns() -> [[String?]] {
    var cal = Calendar.current
    cal.firstWeekday = 1
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

  private func color(for day: WidgetPayload.PracticeDay?, isFuture: Bool) -> Color {
    if isFuture { return widgetMuted.opacity(0.08) }
    guard let day else { return accent.opacity(0.10) }
    if day.m == true { return owedColor.opacity(0.30) }
    if day.k <= 0 { return accent.opacity(0.10) }
    let fraction = min(1, Double(day.k) / 5.0)
    return accent.opacity(0.42 + 0.58 * fraction)
  }
}
