import SwiftUI
import WidgetKit

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

struct WidgetPayload: Codable {
  let dayLabel: String
  let rows: [Row]
  let nextKey: String?
  struct Row: Codable {
    let key: String
    let time: String
    let abbr: String?
  }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), payload: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), payload: loadPayload()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let entry = Entry(date: Date(), payload: loadPayload())
    let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date())
      ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(refresh)))
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
      .init(key: "Dhuhr", time: "12:10", abbr: "Dhuhr"),
      .init(key: "Asr", time: "15:20", abbr: "Asr"),
      .init(key: "Maghrib", time: "18:05", abbr: "Magh"),
      .init(key: "Isha", time: "19:30", abbr: "Isha"),
    ],
    nextKey: "Dhuhr",
  )
}

struct Entry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
}

struct PrayerWidgetEntryView: View {
  var entry: Entry

  private func rowColor(highlight: Bool) -> Color {
    if highlight {
      return resolvedWidgetHighlightColor()
    }
    return widgetText
  }

  @ViewBuilder
  private var prayerContent: some View {
    if let p = entry.payload {
      VStack(alignment: .leading, spacing: 0) {
        Text(p.dayLabel)
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(widgetMuted)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.bottom, 4)
        Spacer(minLength: 0)
        HStack(spacing: 0) {
          ForEach(Array(p.rows.enumerated()), id: \.offset) { _, r in
            let label = r.abbr ?? r.key
            let highlight = p.nextKey == r.key
            VStack(spacing: 2) {
              Text(label)
                .font(.system(size: 12))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .multilineTextAlignment(.center)
                .foregroundStyle(rowColor(highlight: highlight))
              Text(r.time)
                .font(.system(size: 22, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .multilineTextAlignment(.center)
                .foregroundStyle(rowColor(highlight: highlight))
            }
            .frame(maxWidth: .infinity)
          }
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    } else {
      Text("Open Prayer Times to load times")
        .font(.caption)
        .foregroundStyle(widgetMuted)
    }
  }

  var body: some View {
    ZStack(alignment: .topLeading) {
      prayerContent
        .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .clipped()
  }
}

@main
struct PrayerWidgetExtensionBundle: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerTimesWidget", provider: Provider()) { entry in
      PrayerWidgetEntryView(entry: entry)
        .containerBackground(for: .widget) {
          widgetBg
        }
    }
    .configurationDisplayName("Prayer times")
    .description("Today’s five daily prayers (Fajr–Isha). After Isha, shows tomorrow.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
