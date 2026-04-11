import SwiftUI
import WidgetKit

private let kSuite = "group.com.prayerapp"
private let kKey = "prayer_widget_payload_v1"
private let kHighlightDynamicKey = "widget_highlight_dynamic"

/// Neutral dark shell; only the next prayer uses accent (same green as Android default).
private let widgetBg = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255).opacity(0.88)
private let widgetText = Color(red: 232 / 255, green: 234 / 255, blue: 237 / 255)
private let widgetMuted = Color(red: 154 / 255, green: 160 / 255, blue: 166 / 255)
private let widgetHighlightAccent = Color(red: 107 / 255, green: 201 / 255, blue: 138 / 255)

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

  private var useDynamicHighlight: Bool {
    UserDefaults(suiteName: kSuite)?.bool(forKey: kHighlightDynamicKey) ?? false
  }

  private func rowColor(highlight: Bool) -> Color {
    if highlight {
      return useDynamicHighlight ? Color.accentColor : widgetHighlightAccent
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
    Group {
      if #available(iOSApplicationExtension 17.0, *) {
        prayerContent
          .containerBackground(for: .widget) {
            widgetBg
          }
      } else {
        prayerContent
      }
    }
  }
}

@main
struct PrayerWidgetExtensionBundle: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerTimesWidget", provider: Provider()) { entry in
      PrayerWidgetEntryView(entry: entry)
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 8, trailing: 8))
    }
    .configurationDisplayName("Prayer times")
    .description("Today’s five daily prayers (Fajr–Isha). After Isha, shows tomorrow.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
