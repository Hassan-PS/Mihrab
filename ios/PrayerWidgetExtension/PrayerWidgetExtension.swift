import SwiftUI
import WidgetKit
import AppIntents

private let kSuite = "group.com.prayerapp"
private let kKey = "prayer_widget_payload_v1"
private let kHighlightDynamicKey = "widget_highlight_dynamic"
private let kHighlightIdKey = "widget_highlight_id"
private let kHighlightHexKey = "widget_highlight_hex"

/// Neutral dark shell; only the next prayer uses accent (same green as Android default).
private let widgetBg = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255).opacity(0.88)
private let widgetText = Color(red: 232 / 255, green: 234 / 255, blue: 237 / 255)
private let widgetMuted = Color(red: 154 / 255, green: 160 / 255, blue: 166 / 255)
private let widgetHighlightDefault = Color(red: 107 / 255, green: 201 / 255, blue: 138 / 255)

private extension Color {
  init?(hexRGB: String) {
    var s = hexRGB.trimmingCharacters(in: .whitespaces)
    guard s.hasPrefix("#") else { return nil }
    s.removeFirst()
    guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
    let r = Double((n >> 16) & 0xFF) / 255
    let g = Double((n >> 8) & 0xFF) / 255
    let b = Double(n & 0xFF) / 255
    self.init(red: r, green: g, blue: b)
  }
}

private func presetHighlightColor(_ id: String) -> Color {
  switch id.lowercased() {
  case "teal":
    return Color(red: 78 / 255, green: 201 / 255, blue: 176 / 255)
  case "blue":
    return Color(red: 107 / 255, green: 163 / 255, blue: 245 / 255)
  case "amber":
    return Color(red: 229 / 255, green: 192 / 255, blue: 123 / 255)
  case "green":
    return widgetHighlightDefault
  default:
    return widgetHighlightDefault
  }
}

private func resolvedWidgetHighlightColor() -> Color {
  let def = UserDefaults(suiteName: kSuite)
  let dynamic = def?.bool(forKey: kHighlightDynamicKey) ?? false
  if dynamic {
    return Color.accentColor
  }
  let id = def?.string(forKey: kHighlightIdKey) ?? "green"
  if id.lowercased() == "custom" {
    let hex = def?.string(forKey: kHighlightHexKey) ?? "#6BC98A"
    return Color(hexRGB: hex) ?? widgetHighlightDefault
  }
  return presetHighlightColor(id)
}

// Extracted so both getSnapshot and getTimeline can use it.
private func computeDynamicNext(
  after date: Date,
  rows: [WidgetPayload.Row],
  calendar: Calendar
) -> (key: String, name: String, time: String)? {
  let currentMinutes = calendar.component(.hour, from: date) * 60
    + calendar.component(.minute, from: date)
  for row in rows {
    let parts = row.time.split(separator: ":")
    if parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) {
      let rowMinutes = h * 60 + m
      if rowMinutes > currentMinutes {
        return (row.key, row.abbr ?? row.key, row.time)
      }
    }
  }
  // All times have passed — return nil so the left panel stays blank
  // until the app syncs tomorrow's payload.
  return nil
}

struct WidgetPayload: Codable {
  let dayLabel: String
  let rows: [Row]
  let nextKey: String?
  let nextPrayerName: String?
  let nextPrayerTime: String?
  let locationName: String?
  struct Row: Codable {
    let key: String
    let time: String
    let abbr: String?
  }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), payload: Self.sample, dynamicNextKey: "Dhuhr", dynamicNextName: "Dhuhr", dynamicNextTime: "12:10")
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    let payload = loadPayload()
    var key: String? = nil
    var name: String? = nil
    var time: String? = nil
    if let p = payload {
      let result = computeDynamicNext(after: Date(), rows: p.rows, calendar: Calendar.current)
      key = result?.key
      name = result?.name
      time = result?.time
    }
    completion(Entry(date: Date(), payload: payload ?? Self.sample, dynamicNextKey: key, dynamicNextName: name, dynamicNextTime: time))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    guard let payload = loadPayload() else {
      let entry = Entry(date: Date(), payload: nil, dynamicNextKey: nil, dynamicNextName: nil, dynamicNextTime: nil)
      let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
      completion(Timeline(entries: [entry], policy: .after(refresh)))
      return
    }

    var entries: [Entry] = []
    let now = Date()
    let cal = Calendar.current

    let currentNext = computeDynamicNext(after: now, rows: payload.rows, calendar: cal)
    entries.append(Entry(date: now, payload: payload, dynamicNextKey: currentNext?.key, dynamicNextName: currentNext?.name, dynamicNextTime: currentNext?.time))

    var lastDate = now
    for row in payload.rows {
      let parts = row.time.split(separator: ":")
      if parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) {
        if let prayerDate = cal.date(bySettingHour: h, minute: m, second: 0, of: now), prayerDate > now {
          let next = computeDynamicNext(after: prayerDate, rows: payload.rows, calendar: cal)
          entries.append(Entry(date: prayerDate, payload: payload, dynamicNextKey: next?.key, dynamicNextName: next?.name, dynamicNextTime: next?.time))
          lastDate = prayerDate
        }
      }
    }

    let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: lastDate) ?? lastDate.addingTimeInterval(900)
    completion(Timeline(entries: entries, policy: .after(refresh)))
  }

  private func loadPayload() -> WidgetPayload? {
    guard let json = UserDefaults(suiteName: kSuite)?.string(forKey: kKey),
          let data = json.data(using: .utf8),
          let p = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else {
      return nil
    }
    return p
  }

  private static let sample = WidgetPayload(
    dayLabel: "Wed, Apr 9",
    rows: [
      .init(key: "Fajr", time: "05:12", abbr: "Fajr"),
      .init(key: "Sunrise", time: "06:30", abbr: "Sunrise"),
      .init(key: "Dhuhr", time: "12:10", abbr: "Dhuhr"),
      .init(key: "Asr", time: "15:20", abbr: "Asr"),
      .init(key: "Maghrib", time: "18:05", abbr: "Magh"),
      .init(key: "Isha", time: "19:30", abbr: "Isha"),
    ],
    nextKey: "Dhuhr",
    nextPrayerName: "Dhuhr",
    nextPrayerTime: "12:10",
    locationName: "London"
  )
}

struct Entry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
  let dynamicNextKey: String?
  let dynamicNextName: String?
  let dynamicNextTime: String?
}

@available(iOS 16.0, *)
struct RefreshIntent: AppIntent {
  static var title: LocalizedStringResource = "Refresh Widget"

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

struct PrayerWidgetEntryView: View {
  var entry: Entry
  @Environment(\.widgetFamily) var widgetFamily

  private func rowColor(highlight: Bool, isSunrise: Bool) -> Color {
    if highlight { return resolvedWidgetHighlightColor() }
    // Sunrise is a reference time, not a salah — render it muted when idle.
    return isSunrise ? widgetMuted : widgetText
  }

  // MARK: - Small widget: focused next-prayer view

  @ViewBuilder
  private var smallWidgetContent: some View {
    if let p = entry.payload {
      VStack(alignment: .leading, spacing: 0) {
        if let loc = p.locationName, !loc.isEmpty {
          Text(loc)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(widgetMuted)
            .lineLimit(1)
        }
        Spacer()
        if let name = entry.dynamicNextName ?? p.nextPrayerName, !name.isEmpty {
          Text(name)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(widgetMuted)
            .lineLimit(1)
        }
        if let time = entry.dynamicNextTime ?? p.nextPrayerTime, !time.isEmpty {
          Text(time)
            .font(.system(size: 36, weight: .bold))
            .foregroundStyle(resolvedWidgetHighlightColor())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
        Spacer()
        Text(p.dayLabel)
          .font(.system(size: 11))
          .foregroundStyle(widgetMuted)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(14)
    } else {
      Text("Open Prayer Times")
        .font(.caption)
        .foregroundStyle(widgetMuted)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
  }

  // MARK: - Medium/Large widget: next prayer + full prayer list

  @ViewBuilder
  private var mediumLargeContent: some View {
    if let p = entry.payload {
      HStack(spacing: 0) {
        // Left Side: Next Prayer
        VStack(spacing: 2) {
          if let nextName = entry.dynamicNextName ?? p.nextPrayerName ?? p.nextKey, !nextName.isEmpty {
            Text(nextName)
              .font(.system(size: 14, weight: .bold))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
          }

          if let nextTime = entry.dynamicNextTime ?? p.nextPrayerTime, !nextTime.isEmpty {
            Text(nextTime)
              .font(.system(size: 32, weight: .bold))
              .foregroundStyle(resolvedWidgetHighlightColor())
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }

          if let loc = p.locationName, !loc.isEmpty {
            Text(loc)
              .font(.system(size: 12))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

        // Right Side: Prayer Times list
        VStack(spacing: 0) {
          ForEach(Array(p.rows.enumerated()), id: \.offset) { _, r in
            let isSunrise = r.key == "Sunrise"
            let label = r.abbr ?? r.key
            let currentNextKey = entry.dynamicNextKey ?? p.nextKey
            let highlight = currentNextKey == r.key
            let color = rowColor(highlight: highlight, isSunrise: isSunrise)

            HStack(spacing: 0) {
              Text(label)
                .font(.system(size: 11))
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)

              Text(r.time)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(color)
            }
            .padding(.horizontal, 8)
            .frame(maxHeight: .infinity)
            .background(
              highlight ? resolvedWidgetHighlightColor().opacity(0.12) : Color.clear
            )
            .cornerRadius(8)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    } else {
      Text("Open Prayer Times to load times")
        .font(.caption)
        .foregroundStyle(widgetMuted)
    }
  }

  // MARK: - Body

  var body: some View {
    ZStack(alignment: .topLeading) {
      if widgetFamily == .systemSmall {
        smallWidgetContent
      } else {
        mediumLargeContent
          .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))

        if #available(iOS 17.0, *) {
          Button(intent: RefreshIntent()) {
            Image(systemName: "arrow.clockwise")
              .font(.system(size: 10))
              .foregroundColor(widgetMuted)
              .padding(8)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .clipped()
  }
}

private struct WidgetBackgroundCompatModifier: ViewModifier {
  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) {
        widgetBg
      }
    } else {
      content.background(widgetBg)
    }
  }
}

@main
struct PrayerWidgetExtensionBundle: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerTimesWidget", provider: Provider()) { entry in
      PrayerWidgetEntryView(entry: entry)
        .modifier(WidgetBackgroundCompatModifier())
    }
    .configurationDisplayName("Prayer times")
    .description("Today's prayer times including Sunrise. After Isha, shows tomorrow.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
