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
  /// The next prayer, carried only for the Lock Screen's rectangular family.
  ///
  /// The plan's mock for that slot is "25 Ṣafar · Asr in 37 min" over
  /// "Asr · 16:57" — the date AND what is next, because a rectangular slot on
  /// a Lock Screen is prime real estate and a date alone does not earn it.
  /// The home-screen small stays purely about the date: it is a whole card,
  /// and the prayer-times widget is right there for the other question.
  var nextName: String? = nil
  var nextTime: String? = nil
  /// Today's rows, so the countdown has an interval end to aim at.
  var rows: [WidgetPayload.Row] = []
}

struct HijriProvider: TimelineProvider {
  func placeholder(in context: Context) -> HijriEntry {
    HijriEntry(date: Date(), hijri: Self.sample, nextName: "Asr", nextTime: "16:57", rows: Self.sampleRows)
  }

  func getSnapshot(in context: Context, completion: @escaping (HijriEntry) -> Void) {
    let now = Date()
    if let p = loadPayload() {
      completion(entry(from: p, at: now))
    } else {
      completion(HijriEntry(date: now, hijri: Self.sample, nextName: "Asr", nextTime: "16:57", rows: Self.sampleRows))
    }
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
    let cal = Calendar.current
    let nextMidnight =
      cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime)
      ?? now.addingTimeInterval(3600)

    guard let p = loadPayload() else {
      completion(Timeline(entries: [HijriEntry(date: now, hijri: nil)], policy: .after(nextMidnight)))
      return
    }

    // now, plus every prayer still to come before the date rolls over. The
    // date alone would be one entry a day; the rectangular family also names
    // what is next, and that changes five times.
    var boundaries: [Date] = [now]
    for r in p.rows {
      if let d = Self.time(r.time, on: now, cal), d > now, d < nextMidnight {
        boundaries.append(d)
      }
    }
    boundaries.sort()
    completion(Timeline(entries: boundaries.map { entry(from: p, at: $0) }, policy: .after(nextMidnight)))
  }

  /// The entry as of `when` — the same payload, a different "next".
  private func entry(from p: WidgetPayload, at when: Date) -> HijriEntry {
    let cal = Calendar.current
    let dated = p.rows.compactMap { r -> (Date, WidgetPayload.Row)? in
      guard let d = Self.time(r.time, on: when, cal) else { return nil }
      return (d, r)
    }.sorted { $0.0 < $1.0 }
    // After Isha the answer is tomorrow's Fajr: the same row, a day later.
    // The countdown resolves the date on its own; only the label is needed.
    let next = dated.first { $0.0 > when }?.1 ?? dated.first?.1
    return HijriEntry(
      date: when,
      hijri: p.hijri,
      nextName: next?.name ?? next?.key,
      nextTime: next?.time,
      rows: p.rows
    )
  }

  private static func time(_ hhmm: String, on reference: Date, _ cal: Calendar) -> Date? {
    let parts = hhmm.split(separator: ":")
    guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
    return cal.date(bySettingHour: h, minute: m, second: 0, of: reference)
  }

  private func loadPayload() -> WidgetPayload? {
    guard let json = UserDefaults(suiteName: kSuite)?.string(forKey: kKey),
          let data = json.data(using: .utf8),
          let p = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else { return nil }
    return p
  }

  static let sample = WidgetPayload.Hijri(
    day: 25, month: 2, year: 1448, monthName: "Safar",
    label: "25 Safar 1448", nextMonthName: "Rabi I", nextMonthInDays: 5
  )

  static let sampleRows: [WidgetPayload.Row] = [
    .init(key: "Fajr",    time: "05:10", abbr: "Fajr",  name: "Fajr"),
    .init(key: "Dhuhr",   time: "13:12", abbr: "Dhuhr", name: "Dhuhr"),
    .init(key: "Asr",     time: "16:57", abbr: "Asr",   name: "Asr"),
    .init(key: "Maghrib", time: "19:56", abbr: "Magh",  name: "Maghrib"),
    .init(key: "Isha",    time: "21:13", abbr: "Isha",  name: "Isha"),
  ]
}

struct HijriEntryView: View {
  var entry: HijriEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryInline:
      Text(entry.hijri?.label ?? "—")
    case .accessoryRectangular:
      rectangularBody
    default:
      smallBody
    }
  }

  /// The Lock Screen rectangle, per the plan's mock: the Hijri date, then
  /// what is next and how long is left.
  ///
  /// It used to be the date, the year, and how far off the next Hijri month
  /// was — three facts about the calendar, on the one Lock Screen slot a
  /// person glances at between prayers. The month countdown moves once a day
  /// and is the least urgent thing this app knows; the prayer countdown is
  /// the most. The next month keeps the whole systemSmall card to itself.
  ///
  /// Rendered monochrome by the system on the Lock Screen, so the hierarchy
  /// has to come from weight and size alone — no accent colour to lean on.
  @ViewBuilder
  private var rectangularBody: some View {
    VStack(alignment: .leading, spacing: 1) {
      if let h = entry.hijri {
        // verbatim: a Hijri year is a label, not a quantity — see below.
        Text(verbatim: "\(h.day) \(h.monthName) \(h.year)")
          .font(.system(size: 12, weight: .medium))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      if let name = entry.nextName, let time = entry.nextTime {
        Text(verbatim: "\(name) · \(time)")
          .font(.system(size: 16, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        HStack(spacing: 4) {
          Text("in")
            .font(.system(size: 11))
          CountdownLabel(
            target: PrayerInterval.around(entry.date, rows: entry.rows, calendar: .current)?.end,
            fallback: nil,
            size: 12,
            weight: .medium,
            inheritsForeground: true
          )
        }
      } else if entry.hijri == nil {
        Text("Open Mihrab").font(.system(size: 12))
      }
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
    .description("Today's Hijri date. On the Lock Screen, with the next prayer.")
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
