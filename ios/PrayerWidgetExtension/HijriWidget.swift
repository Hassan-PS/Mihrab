// The Hijri date, on its own.
//
// It is the cheapest widget in the plan and close to the most useful: the
// Hijri date is the one thing in this app people look up rather than read,
// and it was previously only available by opening Home.
//
// A SEPARATE KIND rather than another family of the prayer-times widget,
// because someone who wants the date on their home screen does not
// necessarily want a prayer table there too, and WidgetKit's unit of choice
// is the kind.
//
// The date comes from the payload rather than being computed here. There is
// a tabular Umm al-Qura conversion in the app (`hijri/convert.ts`) and
// duplicating it in Swift would mean two implementations that can disagree
// about which day it is — and disagreeing about the date is the only way
// this widget can be wrong.

import SwiftUI
import WidgetKit

struct HijriEntry: TimelineEntry {
  let date: Date
  let hijri: WidgetPayload.Hijri?
}

struct HijriProvider: TimelineProvider {
  func placeholder(in context: Context) -> HijriEntry {
    HijriEntry(date: Date(), hijri: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (HijriEntry) -> Void) {
    completion(HijriEntry(date: Date(), hijri: loadHijri() ?? Self.sample))
  }

  /// One entry, refreshed just after midnight.
  ///
  /// The Hijri day turns over at sunset rather than at midnight, which this
  /// deliberately does not model: the payload states the date the APP
  /// believes it is, and the app is the thing the user is comparing against.
  /// A widget that flipped to tomorrow at sunset while Home still said today
  /// would be a bug report, not a feature.
  func getTimeline(in context: Context, completion: @escaping (Timeline<HijriEntry>) -> Void) {
    let now = Date()
    let entry = HijriEntry(date: now, hijri: loadHijri())
    let cal = Calendar.current
    let nextMidnight =
      cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime)
      ?? now.addingTimeInterval(3600)
    completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
  }

  private func loadHijri() -> WidgetPayload.Hijri? {
    guard let json = UserDefaults(suiteName: kSuite)?.string(forKey: kKey),
          let data = json.data(using: .utf8),
          let p = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else { return nil }
    return p.hijri
  }

  static let sample = WidgetPayload.Hijri(
    day: 25, month: 2, year: 1448, monthName: "Safar",
    label: "25 Safar 1448", nextMonthName: "Rabi I", nextMonthInDays: 5
  )
}

struct HijriEntryView: View {
  var entry: HijriEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryInline:
      Text(entry.hijri?.label ?? "—")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Text("HIJRI")
          .font(.system(size: 10, weight: .semibold))
          .kerning(0.8)
        Text(verbatim: entry.hijri.map { "\($0.day) \($0.monthName)" } ?? "—")
          .font(.system(size: 17, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        if let h = entry.hijri {
          // Same reason as above: the year must not be number-formatted.
          Text(verbatim: "\(h.year) · \(h.nextMonthName) in \(h.nextMonthInDays)d")
            .font(.system(size: 11))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
    default:
      smallBody
    }
  }

  @ViewBuilder
  private var smallBody: some View {
    if let h = entry.hijri {
      VStack(alignment: .leading, spacing: 0) {
        Text("HIJRI")
          .kerning(1.0)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(widgetMuted)

        Spacer(minLength: 4)

        // The day is the number people are actually looking for, so it gets
        // the size. The month and year sit under it rather than beside it —
        // "25" next to "Safar 1448" at the same weight reads as one long
        // string and the eye has to parse it.
        //
        // `verbatim:` is load-bearing, not stylistic. A plain
        // `Text("\(h.year)")` goes through LocalizedStringKey, which formats
        // an Int as a NUMBER — so 1448 came out as "1 448" on the simulator.
        // A Hijri year is a label, not a quantity, and it has no thousands.
        Text(verbatim: "\(h.day)")
          .font(.system(size: 44, weight: .bold))
          .foregroundStyle(widgetText)
          .lineLimit(1)
          .minimumScaleFactor(0.6)
        Text(verbatim: "\(h.monthName) \(h.year)")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(widgetText)
          .lineLimit(1)
          .minimumScaleFactor(0.6)

        Spacer(minLength: 4)

        Rectangle()
          .fill(widgetMuted.opacity(0.25))
          .frame(height: 1)
          .padding(.bottom, 6)

        Text(h.nextMonthName)
          .font(.system(size: 12))
          .foregroundStyle(widgetMuted)
          .lineLimit(1)
        Text(nextMonthPhrase(h.nextMonthInDays))
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(resolvedWidgetHighlightColor())
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(14)
    } else {
      Text("Open Mihrab")
        .font(.caption)
        .foregroundStyle(widgetMuted)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /// "tomorrow" beats "in 1 days", and "today" beats "in 0 days".
  private func nextMonthPhrase(_ days: Int) -> String {
    switch days {
    case ..<1: return "begins today"
    case 1: return "begins tomorrow"
    default: return "in \(days) days"
    }
  }
}

struct HijriDateWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "MihrabHijriDate", provider: HijriProvider()) { entry in
      HijriEntryView(entry: entry)
        .modifier(WidgetBackgroundCompatModifier())
    }
    .configurationDisplayName("Hijri Date")
    .description("Today's Hijri date, and how far off the next month is.")
    .supportedFamilies(hijriFamilies())
  }

  /// A Mac has no Lock Screen, so the accessory families do not exist
  /// there — the same compile-time guard the prayer-times widget uses.
  private func hijriFamilies() -> [WidgetFamily] {
    #if targetEnvironment(macCatalyst)
    return [.systemSmall]
    #else
    return [.systemSmall, .accessoryInline, .accessoryRectangular]
    #endif
  }
}
