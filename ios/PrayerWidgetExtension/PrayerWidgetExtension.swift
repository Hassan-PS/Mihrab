import SwiftUI
import WidgetKit
import AppIntents

private let kSuite = "group.com.prayerapp"
private let kKey = "prayer_widget_payload_v1"
private let kHighlightDynamicKey = "widget_highlight_dynamic"
private let kHighlightIdKey = "widget_highlight_id"
private let kHighlightHexKey = "widget_highlight_hex"

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
  case "teal":  return Color(red: 78 / 255, green: 201 / 255, blue: 176 / 255)
  case "blue":  return Color(red: 107 / 255, green: 163 / 255, blue: 245 / 255)
  case "amber": return Color(red: 229 / 255, green: 192 / 255, blue: 123 / 255)
  default:      return widgetHighlightDefault
  }
}

private func resolvedWidgetHighlightColor() -> Color {
  let def = UserDefaults(suiteName: kSuite)
  if def?.bool(forKey: kHighlightDynamicKey) == true { return Color.accentColor }
  let id = def?.string(forKey: kHighlightIdKey) ?? "green"
  if id.lowercased() == "custom" {
    let hex = def?.string(forKey: kHighlightHexKey) ?? "#6BC98A"
    return Color(hexRGB: hex) ?? widgetHighlightDefault
  }
  return presetHighlightColor(id)
}

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
      if h * 60 + m > currentMinutes {
        return (row.key, row.abbr ?? row.key, row.time)
      }
    }
  }
  // All prayer times appear to be in the past for today's wall clock — this
  // means the JS layer has already rolled the payload over to tomorrow's data
  // (which it does after Isha). Return the first prayer (Fajr) as the next one.
  if let first = rows.first {
    return (first.key, first.abbr ?? first.key, first.time)
  }
  return nil
}

struct WidgetPayload: Codable {
  let dayLabel: String
  let rows: [Row]
  /// Sunrise row sent separately by the JS layer because Sunrise isn't
  /// a salāh. The medium and large widget views splice it in at display
  /// slot 1 (between Fajr and Dhuhr) so the visible order matches
  /// Android's [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha].
  let sunriseRow: Row?
  let nextKey: String?
  let nextPrayerName: String?
  let nextPrayerTime: String?
  let locationName: String?
  /// Seasonal treatment flags — task #67. Optional because older app
  /// versions push payloads without this field; absent treats as
  /// all-false.
  let seasonal: SeasonalFlags?
  struct Row: Codable {
    let key: String
    let time: String
    let abbr: String?
  }
  struct SeasonalFlags: Codable {
    let jumuah: Bool
    let ramadan: Bool
    let eid: String?
  }

  /// Display-ordered rows: [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha]
  /// when `sunriseRow` is present, otherwise just `rows`. The medium
  /// and large widgets use this; the next-prayer computation still
  /// uses `rows` alone since Sunrise isn't a "next prayer" target.
  var displayRows: [Row] {
    guard let sr = sunriseRow else { return rows }
    var out = rows
    // Splice Sunrise at index 1 (after Fajr) — matches the JS spec
    // and the Android layout. If Fajr happens to be missing for any
    // reason, fall back to prepending so Sunrise is at least visible.
    if !out.isEmpty {
      out.insert(sr, at: 1)
    } else {
      out.insert(sr, at: 0)
    }
    return out
  }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), payload: Self.sample, dynamicNextKey: "Dhuhr", dynamicNextName: "Dhuhr", dynamicNextTime: "12:10")
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    let payload = loadPayload()
    var key: String? = nil; var name: String? = nil; var time: String? = nil
    if let p = payload {
      let r = computeDynamicNext(after: Date(), rows: p.rows, calendar: .current)
      key = r?.key; name = r?.name; time = r?.time
    }
    completion(Entry(date: Date(), payload: payload ?? Self.sample, dynamicNextKey: key, dynamicNextName: name, dynamicNextTime: time))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    guard let payload = loadPayload() else {
      let e = Entry(date: Date(), payload: nil, dynamicNextKey: nil, dynamicNextName: nil, dynamicNextTime: nil)
      let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
      completion(Timeline(entries: [e], policy: .after(refresh)))
      return
    }

    var entries: [Entry] = []
    let now = Date(); let cal = Calendar.current
    let currentNext = computeDynamicNext(after: now, rows: payload.rows, calendar: cal)
    entries.append(Entry(date: now, payload: payload, dynamicNextKey: currentNext?.key, dynamicNextName: currentNext?.name, dynamicNextTime: currentNext?.time))

    // Detect whether the payload contains tomorrow's data. This happens when
    // all prayer times in the payload are earlier than the current wall-clock
    // hour:minute (e.g. payload has Fajr 05:02 but it's currently 21:30 after
    // Isha). In that case we must schedule the per-prayer entries against
    // tomorrow's calendar date, otherwise they all resolve to today's past and
    // no future timeline entries are produced.
    let allTimesInPast = payload.rows.allSatisfy { row in
      let parts = row.time.split(separator: ":")
      guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
            let d = cal.date(bySettingHour: h, minute: m, second: 0, of: now)
      else { return true }
      return d <= now
    }
    let baseDate: Date
    if allTimesInPast {
      // Use the start of tomorrow as the anchor for scheduling entries.
      baseDate = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) ?? now
    } else {
      baseDate = now
    }

    var lastDate = now
    for row in payload.rows {
      let parts = row.time.split(separator: ":")
      if parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
         let prayerDate = cal.date(bySettingHour: h, minute: m, second: 0, of: baseDate),
         prayerDate > now {
        let next = computeDynamicNext(after: prayerDate, rows: payload.rows, calendar: cal)
        entries.append(Entry(date: prayerDate, payload: payload, dynamicNextKey: next?.key, dynamicNextName: next?.name, dynamicNextTime: next?.time))
        lastDate = prayerDate
      }
    }

    // Ask WidgetKit to refresh 15 min after the last prayer in the timeline.
    // If we are in the overnight window (all-times-in-past), the app will push
    // fresh data on next launch; the 15-min policy is a safety net.
    let refresh = cal.date(byAdding: .minute, value: 15, to: lastDate) ?? lastDate.addingTimeInterval(900)
    completion(Timeline(entries: entries, policy: .after(refresh)))
  }

  private func loadPayload() -> WidgetPayload? {
    guard let json = UserDefaults(suiteName: kSuite)?.string(forKey: kKey),
          let data = json.data(using: .utf8),
          let p = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else { return nil }
    return p
  }

  private static let sample = WidgetPayload(
    dayLabel: "Wed, Apr 9",
    rows: [
      .init(key: "Fajr",    time: "05:12", abbr: "Fajr"),
      .init(key: "Dhuhr",   time: "12:10", abbr: "Dhuhr"),
      .init(key: "Asr",     time: "15:20", abbr: "Asr"),
      .init(key: "Maghrib", time: "18:05", abbr: "Magh"),
      .init(key: "Isha",    time: "19:30", abbr: "Isha"),
    ],
    sunriseRow: .init(key: "Sunrise", time: "06:30", abbr: "Sun"),
    nextKey: "Dhuhr", nextPrayerName: "Dhuhr", nextPrayerTime: "12:10",
    locationName: "London",
    seasonal: nil
  )
}

struct Entry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
  let dynamicNextKey: String?
  let dynamicNextName: String?
  let dynamicNextTime: String?
}

// AppIntent requires iOS 16+; the widget extension minimum deployment target is 16.0.
// Button(intent:) requires iOS 17+, so the button itself is still guarded below.
struct RefreshIntent: AppIntent {
  static var title: LocalizedStringResource = "Refresh Widget"
  static var isDiscoverable: Bool = false
  func perform() async throws -> some IntentResult { .result() }
}

struct PrayerWidgetEntryView: View {
  var entry: Entry
  @Environment(\.widgetFamily) var widgetFamily

  private func rowColor(highlight: Bool, isSunrise: Bool) -> Color {
    if highlight { return resolvedWidgetHighlightColor() }
    return isSunrise ? widgetMuted : widgetText
  }

  // MARK: - Small widget

  @ViewBuilder
  private var smallWidgetContent: some View {
    if let p = entry.payload {
      VStack(alignment: .leading, spacing: 0) {
        // Location + date at top
        if let loc = p.locationName, !loc.isEmpty {
          Text(loc.uppercased())
            .kerning(0.5)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(widgetMuted)
            .lineLimit(1)
        }
        Spacer()
        // Label
        Text("NEXT")
          .kerning(1.0)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(widgetMuted)
        // Prayer name
        if let name = entry.dynamicNextName ?? p.nextPrayerName, !name.isEmpty {
          Text(name)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(widgetText)
            .lineLimit(1)
        }
        // Time — large, light weight for elegance
        if let time = entry.dynamicNextTime ?? p.nextPrayerTime, !time.isEmpty {
          Text(time)
            .font(.system(size: 34, weight: .light))
            .foregroundStyle(resolvedWidgetHighlightColor())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
        }
        Spacer()
        Text(p.dayLabel)
          .font(.system(size: 9))
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
    }
  }

  // MARK: - Medium / Large widget

  @ViewBuilder
  private var mediumLargeContent: some View {
    if let p = entry.payload {
      HStack(spacing: 0) {

        // ── Left: next prayer ──
        VStack(alignment: .leading, spacing: 0) {
          // Location at top
          if let loc = p.locationName, !loc.isEmpty {
            Text(loc.uppercased())
              .kerning(0.5)
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
          }

          Spacer()

          // "NEXT" micro-label
          Text("NEXT")
            .kerning(1.0)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(widgetMuted)
            .padding(.bottom, 2)

          // Prayer name — semibold, prominent
          if let name = entry.dynamicNextName ?? p.nextPrayerName ?? p.nextKey, !name.isEmpty {
            Text(name.uppercased())
              .kerning(0.5)
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(widgetText)
              .lineLimit(1)
          }

          // Time — large, light weight
          if let time = entry.dynamicNextTime ?? p.nextPrayerTime, !time.isEmpty {
            Text(time)
              .font(.system(size: 34, weight: .light))
              .foregroundStyle(resolvedWidgetHighlightColor())
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }

          Spacer()

          // Day label at bottom
          Text(p.dayLabel)
            .font(.system(size: 9))
            .foregroundStyle(widgetMuted)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)

        // Divider
        Rectangle()
          .fill(Color.white.opacity(0.12))
          .frame(width: 1)
          .padding(.vertical, 6)
          .padding(.horizontal, 8)

        // ── Right: prayer list ──
        // Use `displayRows` so Sunrise gets spliced in at slot 1 between
        // Fajr and Dhuhr. The previous code iterated `p.rows` directly
        // which omitted Sunrise on iOS (Android already merged it in).
        VStack(spacing: 0) {
          ForEach(Array(p.displayRows.enumerated()), id: \.offset) { _, r in
            let isSunrise = r.key == "Sunrise"
            let label = r.abbr ?? r.key
            let currentNextKey = entry.dynamicNextKey ?? p.nextKey
            let highlight = currentNextKey == r.key
            let col = rowColor(highlight: highlight, isSunrise: isSunrise)

            ZStack(alignment: .leading) {
              // Highlight background
              if highlight {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                  .fill(resolvedWidgetHighlightColor().opacity(0.15))
              }
              // Left accent bar for highlighted row
              if highlight {
                Rectangle()
                  .fill(resolvedWidgetHighlightColor())
                  .frame(width: 3)
                  .cornerRadius(1.5)
              }

              HStack(spacing: 0) {
                Text(label)
                  .font(.system(size: 11, weight: highlight ? .semibold : .regular))
                  .foregroundStyle(col)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .lineLimit(1)
                  .padding(.leading, highlight ? 7 : 4)

                Text(r.time)
                  .font(.system(size: 11, weight: highlight ? .semibold : .medium))
                  .foregroundStyle(col)
                  .padding(.trailing, 4)
              }
            }
            .frame(maxHeight: .infinity)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    } else {
      VStack {
        Text("Open Prayer Times")
          .font(.caption)
          .foregroundStyle(widgetMuted)
      }
    }
  }

  // MARK: - Body

  // MARK: - Lock Screen (Accessory) families — task #23
  //
  // Three families, each tuned to its real estate:
  //   • accessoryInline      — single line of text (status bar style).
  //   • accessoryCircular    — tiny circular badge (Apple Watch-like).
  //   • accessoryRectangular — wider lock-screen tile, two-line layout.
  //
  // Friday Jumu'ah accent is honored by reading the seasonal-treatment flag
  // already pushed by the JS layer. The flag is optional — fall back to the
  // standard accent when absent.

  @ViewBuilder
  private var inlineWidgetContent: some View {
    if let p = entry.payload,
       let name = entry.dynamicNextName ?? p.nextPrayerName,
       let time = entry.dynamicNextTime ?? p.nextPrayerTime {
      // Inline family is rendered by the system inside the lock-screen
      // status row — single line, system styling. Pre-format as
      // "Fajr · 05:12" so the system can lay it out compactly.
      Text("\(name) · \(time)")
    } else {
      Text("Prayer Times")
    }
  }

  @ViewBuilder
  private var circularWidgetContent: some View {
    if let p = entry.payload,
       let time = entry.dynamicNextTime ?? p.nextPrayerTime {
      // Circular: just the time with a tiny prayer-name ring above.
      // System tints the whole view in the user's chosen lock-screen color.
      VStack(spacing: 2) {
        if let name = entry.dynamicNextName ?? p.nextPrayerName {
          Text(name.prefix(4).uppercased())
            .font(.system(size: 9, weight: .semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        }
        Text(time)
          .font(.system(size: 14, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      Image(systemName: "moon.stars")
    }
  }

  @ViewBuilder
  private var rectangularWidgetContent: some View {
    if let p = entry.payload {
      VStack(alignment: .leading, spacing: 2) {
        // Seasonal eyebrow — Friday (Jumu'ah), Ramadan, or Eid. The
        // system tints lock-screen widgets a single color, so we use
        // glyphs (◇ for Jumu'ah, ☾ for Ramadan, ✦ for Eid) for visual
        // distinction within the tint.
        if let s = p.seasonal {
          if s.eid != nil {
            Text("✦ EID")
              .font(.system(size: 9, weight: .semibold))
              .lineLimit(1)
          } else if s.jumuah {
            Text("◇ JUMU'AH")
              .font(.system(size: 9, weight: .semibold))
              .lineLimit(1)
          } else if s.ramadan {
            Text("☾ RAMADAN")
              .font(.system(size: 9, weight: .semibold))
              .lineLimit(1)
          } else if let loc = p.locationName, !loc.isEmpty {
            Text(loc.uppercased())
              .font(.system(size: 9, weight: .semibold))
              .lineLimit(1)
          }
        } else if let loc = p.locationName, !loc.isEmpty {
          Text(loc.uppercased())
            .font(.system(size: 9, weight: .semibold))
            .lineLimit(1)
        }
        if let name = entry.dynamicNextName ?? p.nextPrayerName {
          Text(name)
            .font(.system(size: 13, weight: .semibold))
            .lineLimit(1)
        }
        if let time = entry.dynamicNextTime ?? p.nextPrayerTime {
          Text(time)
            .font(.system(size: 18, weight: .regular))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    } else {
      Text("Prayer Times")
    }
  }

  var body: some View {
    ZStack(alignment: .topTrailing) {
      if #available(iOSApplicationExtension 16.0, *) {
        switch widgetFamily {
        case .accessoryInline:
          inlineWidgetContent
        case .accessoryCircular:
          circularWidgetContent
        case .accessoryRectangular:
          rectangularWidgetContent
        case .systemSmall:
          smallWidgetContent
        default:
          mediumLargeContent
            .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 12))
          // iOS 17+ refresh button
          if #available(iOS 17.0, *) {
            Button(intent: RefreshIntent()) {
              Image(systemName: "arrow.clockwise")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(widgetMuted)
                .padding(8)
            }
            .buttonStyle(.plain)
          }
        }
      } else if widgetFamily == .systemSmall {
        smallWidgetContent
      } else {
        mediumLargeContent
          .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 12))
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
      content.containerBackground(for: .widget) { widgetBg }
    } else {
      content.background(widgetBg)
    }
  }
}

/// The existing home-screen + lock-screen-accessory widget. Renamed
/// from `PrayerWidgetExtensionBundle` so it can be one of two widgets
/// declared by the @main bundle below — adding the Live Activity widget
/// requires we promote the bundle's protocol from `Widget` to
/// `WidgetBundle`.
struct PrayerTimesHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PrayerTimesWidget", provider: Provider()) { entry in
      PrayerWidgetEntryView(entry: entry)
        .modifier(WidgetBackgroundCompatModifier())
    }
    .configurationDisplayName("Prayer Times")
    .description("Today's prayer times including Sunrise. After Isha, shows tomorrow.")
    .supportedFamilies(supportedFamilies())
  }

  /// iOS 16+ adds the Lock Screen accessory families. Fall back to the
  /// home-screen-only set on older deployments.
  private func supportedFamilies() -> [WidgetFamily] {
    if #available(iOSApplicationExtension 16.0, *) {
      return [
        .systemSmall, .systemMedium, .systemLarge,
        .accessoryInline, .accessoryCircular, .accessoryRectangular,
      ]
    }
    return [.systemSmall, .systemMedium, .systemLarge]
  }
}

@main
struct PrayerWidgetExtensionBundle: WidgetBundle {
  @WidgetBundleBuilder
  var body: some Widget {
    PrayerTimesHomeWidget()
    // ActivityKit only exists on iOS 16.1+. The widget is wrapped in an
    // availability check so the extension itself still compiles for the
    // 16.0 deployment target.
    if #available(iOSApplicationExtension 16.1, *) {
      PrayerLiveActivityWidget()
    }
  }
}
