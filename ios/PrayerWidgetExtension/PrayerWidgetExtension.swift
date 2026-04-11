import SwiftUI
import WidgetKit

private let kSuite = "group.com.prayerapp"
private let kKey = "prayer_widget_payload_v1"

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
    let hints = Self.readHints()
    return Entry(date: Date(), payload: Self.sample, uiDynamic: hints.dynamic, uiOled: hints.oled)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    let hints = Self.readHints()
    completion(Entry(date: Date(), payload: loadPayload(), uiDynamic: hints.dynamic, uiOled: hints.oled))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let hints = Self.readHints()
    let entry = Entry(date: Date(), payload: loadPayload(), uiDynamic: hints.dynamic, uiOled: hints.oled)
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

  private static func readHints() -> (dynamic: Bool, oled: Bool) {
    guard let d = UserDefaults(suiteName: kSuite) else {
      return (false, false)
    }
    let dynamic = (d.string(forKey: "widget_ui_style") ?? "fixed") == "dynamic"
    let oled = d.bool(forKey: "widget_oled")
    return (dynamic, oled)
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
  let uiDynamic: Bool
  let uiOled: Bool
}

struct PrayerWidgetEntryView: View {
  @Environment(\.colorScheme) private var colorScheme
  var entry: Entry

  private var highlightColor: Color {
    if entry.uiDynamic {
      return Color.accentColor
    }
    return Color(red: 0.36, green: 0.62, blue: 0.83)
  }

  @ViewBuilder
  private var prayerContent: some View {
    if let p = entry.payload {
      VStack(alignment: .leading, spacing: 0) {
        Text(p.dayLabel)
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(entry.uiDynamic ? Color.secondary : Color(red: 0.55, green: 0.58, blue: 0.65))
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
                .foregroundStyle(highlight ? highlightColor : Color.primary)
              Text(r.time)
                .font(.system(size: 22, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .multilineTextAlignment(.center)
                .foregroundStyle(highlight ? highlightColor : Color.primary)
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
        .foregroundStyle(.secondary)
    }
  }

  var body: some View {
    Group {
      if #available(iOSApplicationExtension 17.0, *) {
        prayerContent
          .containerBackground(for: .widget) {
            if entry.uiDynamic {
              if entry.uiOled && colorScheme == .dark {
                Color.black
              } else {
                Color(uiColor: .systemBackground)
              }
            } else {
              Color.clear
            }
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
