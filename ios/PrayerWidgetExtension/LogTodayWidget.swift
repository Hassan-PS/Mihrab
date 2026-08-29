// Log Today — the widget that changes what the app is on a home screen.
//
// Five targets, one per prayer. Tap Dhuhr and it is logged: no launch, no
// navigation. Prayers whose time has not come are not offered, which is the
// same rule the sunnah rows already follow in-app.
//
// ONE TAP MEANS "ON TIME". In the app a prayer can be on time, late, missed
// or made up; a single tap can only mean one of those, and on time is the
// overwhelmingly common case. The widget is a shortcut, not a replacement —
// anything else is a tap into the app.
//
// A TAP MUST BE REVERSIBLE. Tapping a filled cell within a minute clears it.
// Without that the widget is a trap: a mis-tap would put a status on a day
// that the user then has to go and find.
//
// iOS 17 is where Button(intent:) exists. On 16 the buttons are not drawn at
// all — a row of controls that silently do nothing is worse than a card that
// says what it is — and the whole widget deep-links into the Log instead.

import AppIntents
import SwiftUI
import WidgetKit

// MARK: - The intent

/// Writes one tap into the queue and asks WidgetKit to redraw.
///
/// It does NOT write the journal. See WidgetLogQueue.swift: the journal is
/// encrypted and its one writer lives in JS, so this records the intent and
/// the app performs it. The tick appears immediately because the view merges
/// the queue over the payload, not because anything has been persisted yet.
@available(iOS 17.0, *)
struct LogPrayerIntent: AppIntent {
  static var title: LocalizedStringResource = "widget_intent_log_prayer"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Date")
  var dateKey: String

  @Parameter(title: "Prayer")
  var prayer: String

  init() {}

  init(dateKey: String, prayer: String) {
    self.dateKey = dateKey
    self.prayer = prayer
  }

  func perform() async throws -> some IntentResult {
    WidgetLogQueue.tap(date: dateKey, prayer: prayer)
    WidgetCenter.shared.reloadTimelines(ofKind: "MihrabLogToday")
    return .result()
  }
}

// MARK: - Timeline

struct LogTodayEntry: TimelineEntry {
  let date: Date
  let today: WidgetPayload.Today?
  let streak: Int?
  /// Prayers this device has queued but the app has not yet written.
  let queued: Set<String>
}

// MARK: - Whose clock decides

/// Minutes since local midnight for a payload time, or nil.
///
/// The payload's `time` is always 24-hour `HH:mm` — `formatDisplayTime`
/// zero-pads and never localises — so this is a comparison, not a guess at
/// whatever clock format the device is set to.
func logMinutesOfDay(_ hhmm: String) -> Int? {
  let parts = hhmm.split(separator: ":")
  guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
        h >= 0, m >= 0 else { return nil }
  return h * 60 + m
}

private let logDayKeyFormatter: DateFormatter = {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.dateFormat = "yyyy-MM-dd"
  return f
}()

/// Has this prayer's time arrived, as of `when`?
///
/// NOT `p.due`. That flag is stamped by the app at the moment it writes the
/// payload, so it answers a different question — "was this prayer due when
/// the app was last open" — and the widget was reading it as though it
/// answered this one. An adhan that passed while the phone sat in a pocket
/// left the prayer un-offered until the app was opened, on every platform,
/// because every renderer trusted the same frozen boolean. The widget wakes
/// at the boundary; it has to decide for itself when it gets there.
///
/// Falls back to the flag when the time is unreadable, or when the block
/// describes some other day: dueness derived from today's clock is a claim
/// about today, and asserting it over a stale day would offer prayers for
/// logging against a date the user never touched.
func logIsDue(
  _ p: WidgetPayload.TodayPrayer,
  in today: WidgetPayload.Today,
  at when: Date,
  calendar: Calendar = .current
) -> Bool {
  guard today.dateKey == logDayKeyFormatter.string(from: when),
        let at = logMinutesOfDay(p.time)
  else { return p.due }
  let c = calendar.dateComponents([.hour, .minute], from: when)
  return at <= (c.hour ?? 0) * 60 + (c.minute ?? 0)
}

struct LogTodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> LogTodayEntry {
    LogTodayEntry(date: Date(), today: Self.sample, streak: 12, queued: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (LogTodayEntry) -> Void) {
    completion(entry(at: Date(), fallback: true))
  }

  /// An entry now, and one at each remaining prayer time today.
  ///
  /// `due` is baked into the payload by the app, which computed it at the
  /// moment the payload was written — so without a boundary entry a prayer
  /// whose time arrives while the phone is in a pocket stays un-offered.
  func getTimeline(in context: Context, completion: @escaping (Timeline<LogTodayEntry>) -> Void) {
    let now = Date()
    let cal = Calendar.current
    let nextMidnight =
      cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime)
      ?? now.addingTimeInterval(3600)

    var boundaries: [Date] = [now]
    if let t = loadPayload()?.today {
      for p in t.prayers {
        if let d = Self.time(p.time, on: now, cal), d > now, d < nextMidnight {
          boundaries.append(d)
        }
      }
    }
    boundaries.sort()
    completion(Timeline(
      entries: boundaries.map { entry(at: $0, fallback: false) },
      policy: .after(nextMidnight)
    ))
  }

  private func entry(at when: Date, fallback: Bool) -> LogTodayEntry {
    let p = loadPayload()
    let today = p?.today ?? (fallback ? Self.sample : nil)
    return LogTodayEntry(
      date: when,
      today: today,
      streak: p?.practice?.streak ?? (fallback ? 12 : nil),
      queued: today.map { WidgetLogQueue.pending(for: $0.dateKey) } ?? []
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
    // The most important of the four. A payload whose schedule has run out
    // still carries a `today` block, dated whenever the app was last opened
    // — so a stale one would offer a month-old day's prayers as today's, and
    // a tap would queue a log against THAT date. Not a cosmetic bug: it puts
    // a status on a day the user never touched. See payloadHasExpired.
    guard !payloadHasExpired(p) else { return nil }
    return p
  }

  static let sample = WidgetPayload.Today(
    dateKey: "2026-08-19",
    logged: 2,
    loggable: 5,
    owed: 0,
    prayers: [
      .init(key: "Fajr", name: "Fajr", time: "05:10", status: "on-time", due: true),
      .init(key: "Dhuhr", name: "Dhuhr", time: "13:12", status: "on-time", due: true),
      .init(key: "Asr", name: "Asr", time: "16:57", status: nil, due: true),
      .init(key: "Maghrib", name: "Maghrib", time: "19:56", status: nil, due: false),
      .init(key: "Isha", name: "Isha", time: "21:13", status: nil, due: false),
    ]
  )
}

// MARK: - View

struct LogTodayEntryView: View {
  var entry: LogTodayEntry
  @Environment(\.widgetFamily) var family

  /// What a cell is showing. The four states are the whole design: there is
  /// no fifth, and every prayer is in exactly one of them.
  private enum CellState {
    /// Logged — by the app, or by a tap this widget has queued.
    case done
    /// Its time has come and nothing is recorded. This is the tappable one.
    case due
    /// Recorded as missed. Offered for make-up in the app, not here: a
    /// make-up is a different status and one tap cannot mean two things.
    case missed
    /// Its time has not come. Shown so the day has a shape, never tappable.
    case waiting
  }

  var body: some View {
    if let t = entry.today {
      VStack(alignment: .leading, spacing: 0) {
        header(t)
        Spacer(minLength: 6)
        HStack(spacing: 6) {
          ForEach(Array(t.prayers.enumerated()), id: \.offset) { _, p in
            cell(p, dateKey: t.dateKey)
          }
        }
        Spacer(minLength: 6)
        footer(t)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .padding(12)
      // On 16 the buttons are absent, so the whole card has to lead
      // somewhere. On 17 a widgetURL still covers the gaps between cells,
      // which is the right place for "open the full row".
      .widgetURL(URL(string: "mihrab://log"))
    } else {
      Text("widget_placeholder_open_app")
        .font(.caption)
        .foregroundStyle(widgetMuted)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  @ViewBuilder
  private func header(_ t: WidgetPayload.Today) -> some View {
    HStack(alignment: .firstTextBaseline) {
      // The shared string is "Today"; this heading has always been an
      // all-caps eyebrow. Uppercasing here rather than in the table keeps one
      // entry for one word — and does it per-locale, which matters for the
      // languages that have no upper case at all and for Turkish, whose
      // capital i is not the one a naive uppercase would produce.
      Text("widget_log_today")
        .textCase(.uppercase)
        .kerning(1.0)
        .font(.system(size: 9, weight: .semibold))
        .foregroundStyle(widgetMuted)
      Spacer(minLength: 6)
      Text(verbatim: widgetString("widget_log_count", loggedCount(t), t.loggable))
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(widgetMuted)
    }
    // Reserve the refresh button's corner, as the large prayer card does.
    .padding(.trailing, 2)
  }

  @ViewBuilder
  private func footer(_ t: WidgetPayload.Today) -> some View {
    HStack(spacing: 6) {
      if let next = t.prayers.first(where: { !isDue($0, t) }) {
        Text(verbatim: "\(next.name) \(next.time)")
          .font(.system(size: 11))
          .foregroundStyle(widgetMuted)
          .lineLimit(1)
      } else if t.owed > 0 {
        Text(verbatim: widgetString("widget_log_owed", t.owed))
          .font(.system(size: 11))
          .foregroundStyle(dangerColor)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      if let streak = entry.streak, streak > 0 {
        Text(verbatim: widgetString("widget_streak_inline", streak))
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(widgetMuted)
          .lineLimit(1)
      }
    }
  }

  /// One prayer. A Button on 17, a plain card on 16.
  ///
  /// Tappable when it is due — that is the log — or when THIS widget queued
  /// it and the app has not written it yet, which is the undo. A prayer the
  /// app has already recorded is not tappable: the undo window has long
  /// passed, and a widget is not where someone changes a status they have
  /// deliberately set. Tapping it would also queue a write that
  /// `logPrayerOnTime` correctly refuses, which is a round trip to nothing.
  @ViewBuilder
  private func cell(_ p: WidgetPayload.TodayPrayer, dateKey: String) -> some View {
    let state = stateOf(p)
    let tappable = state == .due || (state == .done && entry.queued.contains(p.key))
    if #available(iOSApplicationExtension 17.0, *), tappable {
      Button(intent: LogPrayerIntent(dateKey: dateKey, prayer: p.key)) {
        cellBody(p, state)
      }
      .buttonStyle(.plain)
    } else {
      cellBody(p, state)
    }
  }

  @ViewBuilder
  private func cellBody(_ p: WidgetPayload.TodayPrayer, _ state: CellState) -> some View {
    VStack(spacing: 1) {
      Text(glyph(state))
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(glyphColor(state))
      Text(p.name)
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(state == .waiting ? widgetMuted.opacity(0.6) : widgetMuted)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(p.time)
        .font(.system(size: 9))
        .monospacedDigit()
        .foregroundStyle(widgetMuted.opacity(state == .waiting ? 0.5 : 0.85))
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 7)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(background(state))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .strokeBorder(border(state), lineWidth: 1)
    )
  }

  // MARK: - The four states

  private func stateOf(_ p: WidgetPayload.TodayPrayer) -> CellState {
    if entry.queued.contains(p.key) { return .done }
    switch p.status {
    case "on-time", "late", "qadha": return .done
    case "missed": return .missed
    default: return isDue(p) ? .due : .waiting
    }
  }

  /// Due as of the moment THIS entry is for, not as of the last payload
  /// write. WidgetKit renders one entry per prayer boundary, so asking the
  /// entry's own date is what turns those wake-ups into a card that
  /// changes.
  private func isDue(_ p: WidgetPayload.TodayPrayer, _ today: WidgetPayload.Today? = nil) -> Bool {
    guard let t = today ?? entry.today else { return p.due }
    return logIsDue(p, in: t, at: entry.date)
  }

  /// A tick, a plus, an exclamation, or a dot for "not yet". The plus is the
  /// only one that looks like an invitation, which is the point: it is the
  /// only cell a tap does anything to.
  private func glyph(_ state: CellState) -> String {
    switch state {
    case .done: return "✓"
    case .due: return "+"
    case .missed: return "!"
    case .waiting: return "·"
    }
  }

  private func glyphColor(_ state: CellState) -> Color {
    switch state {
    case .done: return resolvedWidgetHighlightColor()
    case .due: return widgetText
    case .missed: return dangerColor
    case .waiting: return widgetMuted.opacity(0.6)
    }
  }

  private func background(_ state: CellState) -> Color {
    switch state {
    case .done: return resolvedWidgetHighlightColor().opacity(0.18)
    case .due: return widgetMuted.opacity(0.16)
    case .missed: return dangerColor.opacity(0.14)
    case .waiting: return .clear
    }
  }

  private func border(_ state: CellState) -> Color {
    switch state {
    case .done: return resolvedWidgetHighlightColor().opacity(0.45)
    case .due: return widgetMuted.opacity(0.35)
    case .missed: return dangerColor.opacity(0.4)
    case .waiting: return widgetMuted.opacity(0.18)
    }
  }

  /// The payload's count plus anything queued since it was written.
  ///
  /// Counting the queue matters more than it looks: without it the tick
  /// appears on the cell and the header still says "2 of 5", and the widget
  /// contradicts itself on the same frame.
  private func loggedCount(_ t: WidgetPayload.Today) -> Int {
    let alreadyLogged = Set(
      t.prayers.filter { ["on-time", "late", "qadha"].contains($0.status ?? "") }.map { $0.key }
    )
    return alreadyLogged.union(entry.queued).count
  }

  private var dangerColor: Color {
    Color(red: 248 / 255, green: 113 / 255, blue: 113 / 255)
  }
}

struct LogTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "MihrabLogToday", provider: LogTodayProvider()) { entry in
      LogTodayEntryView(entry: entry)
        .modifier(WidgetBackgroundCompatModifier())
        // The app has its own language setting; this is what makes the
        // labels below follow it rather than the phone. See mihrabLocale().
        .environment(\.locale, mihrabLocale())
    }
    .configurationDisplayName(widgetGalleryName("widget_name_log"))
    .description(widgetString("widget_ios_description_log"))
    .supportedFamilies([.systemMedium])
  }
}
