import SwiftUI
import WidgetKit
import AppIntents

/// Which App Group to read through. Must stay in lockstep with
/// MihrabAppGroup.m, which is the same rule on the app's side of the group —
/// if these two ever disagree, the widget quietly renders an empty card.
///
/// iOS keeps the plain identifier it has always used. Mac Catalyst takes the
/// Team-ID-prefixed form: with the plain one this extension faulted on every
/// preferences read under chronod, and with the prefixed one it does not.
/// MihrabAppGroup.m carries the evidence, and is honest about the part of it
/// that is still unexplained.
///
/// Worth remembering if this ever regresses: `UserDefaults(suiteName:)`
/// returns a live-looking object for a group the process is not entitled to
/// and silently drops every write, so nil is not the test — round-tripping a
/// value is.
///
/// Module-internal rather than file-private: there is more than one widget
/// kind in this extension now, and every one of them reads the same payload
/// out of the same group. Two copies of an App Group identifier is exactly
/// the bug this file's own comment warns about.
#if targetEnvironment(macCatalyst)
let kSuite = "GAW23HT439.group.com.prayerapp"
#else
let kSuite = "group.com.prayerapp"
#endif
let kKey = "prayer_widget_payload_v1"

/// Has this payload's schedule run out?
///
/// The payload is only ever written from the foreground — there is no
/// background refresh on any platform — so it describes a window that
/// eventually ends. On a phone that is invisible; a Mac app installed from
/// Homebrew can sit unopened for weeks, which is where the blank-widget bug
/// was reported (see the long note in the Prayer Times timeline).
///
/// Every widget kind in this extension needs this, and for different reasons:
/// Log Today would otherwise offer a month-old day's prayers as today's and
/// queue a write against that date; Hijri Date would state the wrong date,
/// which is the only way that widget can be wrong; Streak would claim a
/// streak that stopped weeks ago; and Tasbih's "Today" would be some other
/// day's total. A schedule that has run out is worth no more than no
/// schedule, and the empty state names the one thing that fixes it.
///
/// True when there is no `days[]` at all, because a payload from a build
/// older than the multi-day window cannot be checked and is by now certainly
/// older than this problem.
func payloadHasExpired(_ p: WidgetPayload, now: Date = Date(), calendar: Calendar = .current) -> Bool {
  guard let days = p.days, !days.isEmpty else { return true }
  let fmt = DateFormatter()
  fmt.calendar = calendar
  fmt.locale = Locale(identifier: "en_US_POSIX")
  fmt.timeZone = calendar.timeZone
  fmt.dateFormat = "yyyy-MM-dd"
  let today = fmt.string(from: now)
  // Lexicographic works on yyyy-MM-dd and avoids parsing 30 dates to answer
  // "is any of them today or later".
  return !days.contains { $0.dateKey >= today }
}
private let kHighlightDynamicKey = "widget_highlight_dynamic"
private let kHighlightIdKey = "widget_highlight_id"
private let kHighlightHexKey = "widget_highlight_hex"

// The extension's palette. Module-internal for the same reason as the App
// Group keys above — every widget kind in here has to look like the same app.
let widgetBg = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255).opacity(0.88)
let widgetText = Color(red: 232 / 255, green: 234 / 255, blue: 237 / 255)
let widgetMuted = Color(red: 154 / 255, green: 160 / 255, blue: 166 / 255)
let widgetHighlightDefault = Color(red: 107 / 255, green: 201 / 255, blue: 138 / 255)

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

func resolvedWidgetHighlightColor() -> Color {
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
  /// Islamic Midnight / the Last Third for the day being shown. Absent
  /// unless the user turned them on; they are rows, never the headline.
  var extraRows: [Row]? = nil
  let nextKey: String?
  let nextPrayerName: String?
  let nextPrayerTime: String?
  let locationName: String?
  /// Seasonal treatment flags — task #67. Optional because older app
  /// versions push payloads without this field; absent treats as
  /// all-false.
  let seasonal: SeasonalFlags?
  /// Multi-day schedule (index 0 = today). When present, the timeline
  /// provider builds entries spanning every supplied day, each rendering
  /// that day's own times — so the widget rolls onto the correct day on its
  /// own and never goes stale ~24h after the app was last opened. Optional:
  /// when absent the provider falls back to the legacy single-day timeline.
  let days: [Day]?
  struct Row: Codable {
    let key: String
    let time: String
    let abbr: String?
    /// The full localized label ("Islamic Midnight"). Only the night rows
    /// use it — a five-letter abbreviation is right in a six-column strip
    /// and wrong on a full-width row that has the space to say the thing.
    var name: String? = nil
  }
  struct Day: Codable {
    /// Local calendar date these times apply to (yyyy-MM-dd).
    let dateKey: String
    let dayLabel: String
    let rows: [Row]
    let sunriseRow: Row?
    /// Islamic Midnight / the Last Third, when the user has turned them on.
    /// Never a "next prayer" target — see `nightCanBeNext` on the JS side.
    var extraRows: [Row]? = nil
  }
  struct SeasonalFlags: Codable {
    let jumuah: Bool
    let ramadan: Bool
    let eid: String?
  }

  // ── The blocks beyond prayer times ─────────────────────────────────
  //
  // Every one of these is OPTIONAL, and absent has to mean "the app has
  // not told us" — never zero. A `practice` block missing and a practice
  // block full of zeroes look identical on a home screen and mean
  // opposite things: one is "we don't know yet", the other is "you have
  // prayed nothing". Views draw the section only when the block is there.
  //
  // They also arrive absent from any app version older than this one, so
  // the same rule is what makes the payload backward-compatible.

  let practice: Practice?
  let today: Today?
  let reading: Reading?
  let hijri: Hijri?
  let tasbih: Tasbih?

  struct Practice: Codable {
    let streak: Int
    let bestStreak: Int
    let loggedToday: Int
    let owed: Int
    let sunnahRate: Double?
    let fastsThisMonth: Int
    let days: [PracticeDay]
  }

  /// Deliberately short keys — this is 98 of them and the whole payload
  /// is read on the main thread of a process with milliseconds to live.
  struct PracticeDay: Codable {
    /// yyyy-MM-dd
    let d: String
    /// Salāh kept, 0…5.
    let k: Int
    /// Something was missed and not made up.
    let m: Bool?
    /// A completed fast.
    let f: Bool?
    /// Sunnah units kept.
    let s: Int?
  }

  struct Today: Codable {
    let dateKey: String
    let logged: Int
    let loggable: Int
    let owed: Int
    let prayers: [TodayPrayer]
  }

  struct TodayPrayer: Codable {
    let key: String
    let name: String
    let time: String
    /// on-time / late / missed / qadha, or nil when nothing is recorded.
    let status: String?
    let due: Bool
  }

  struct Reading: Codable {
    let surah: Int
    let surahName: String
    let ayah: Int
    let page: Int
    let juz: Int
    let pagesRead: Int
    let totalPages: Int
    let bookmarks: Int
    let lastReadAt: Double?
    /// "mushaf" or "translation" — which reader a tap opens. Resolved by the
    /// app, which is the only side that knows both what the user last had
    /// open and whether the mushaf is actually on disk. Optional because a
    /// payload written by an older build does not carry it.
    var mode: String? = nil
    let khatmah: Khatmah?
  }

  struct Khatmah: Codable {
    let day: Int
    let targetDays: Int
    let pagesToday: Int
    let doneToday: Int
    let behindBy: Int
    let daysLeft: Int
  }

  struct Hijri: Codable {
    let day: Int
    let month: Int
    let year: Int
    let monthName: String
    let label: String
    let nextMonthName: String
    let nextMonthInDays: Int
  }

  struct Tasbih: Codable {
    let presetId: String
    let label: String
    let arabic: String
    let count: Int
    let target: Int
    let unbounded: Bool
    let index: Int
    let total: Int
    let counts: [Int]
    /// Every preset's label, target and unbounded flag, in the same order.
    ///
    /// Needed because the widget's own Next moves through the cycle in THIS
    /// process, before the app has run — so after one press the widget is
    /// standing on a preset the singular fields above know nothing about.
    /// Optional: a payload written by an older build does not carry them,
    /// and the views fall back to the singular fields.
    var labels: [String]? = nil
    var targets: [Int]? = nil
    var unboundedFlags: [Bool]? = nil
    let todayTotal: Int
    let todayRounds: Int
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

    let now = Date(); let cal = Calendar.current

    // ── Multi-day path ───────────────────────────────────────────────
    // When the app pushes a `days[]` schedule, build a timeline spanning
    // every supplied day so the widget rolls onto the correct day's times by
    // itself. This is the fix for the widget going stale ~24h after the app
    // was last opened (it previously only ever held a single day's snapshot).
    if let days = payload.days, !days.isEmpty {
      buildMultiDayTimeline(payload: payload, days: days, now: now, cal: cal, completion: completion)
      return
    }

    // ── Legacy single-day path (no `days[]` in payload) ──────────────
    var entries: [Entry] = []
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

  /// Build a timeline spanning every day in `days[]`. Produces one entry at
  /// each content-change boundary (the start of each day, and each prayer
  /// time), each carrying a per-day payload so the rendered rows, day label
  /// and "next prayer" highlight always match the wall clock. The next-prayer
  /// computation rolls across day boundaries (e.g. after Isha → tomorrow's
  /// Fajr) because it scans the flattened, absolutely-dated prayer list.
  private func buildMultiDayTimeline(
    payload: WidgetPayload,
    days: [WidgetPayload.Day],
    now: Date,
    cal: Calendar,
    completion: @escaping (Timeline<Entry>) -> Void
  ) {
    let fmt = DateFormatter()
    fmt.calendar = cal
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = cal.timeZone
    fmt.dateFormat = "yyyy-MM-dd"

    struct DayInfo { let date: Date; let day: WidgetPayload.Day }
    var dayInfos: [DayInfo] = []
    for d in days {
      if let dd = fmt.date(from: d.dateKey) {
        dayInfos.append(DayInfo(date: cal.startOfDay(for: dd), day: d))
      }
    }
    // Couldn't parse any dateKey — degrade to a single immediate entry rather
    // than producing an empty timeline.
    guard !dayInfos.isEmpty else {
      let next = computeDynamicNext(after: now, rows: payload.rows, calendar: cal)
      let e = Entry(date: now, payload: payload, dynamicNextKey: next?.key, dynamicNextName: next?.name, dynamicNextTime: next?.time)
      let refresh = cal.date(byAdding: .minute, value: 30, to: now) ?? now.addingTimeInterval(1800)
      completion(Timeline(entries: [e], policy: .after(refresh)))
      return
    }
    dayInfos.sort { $0.date < $1.date }

    // The window has a HORIZON, and past it this data is not merely old, it is
    // wrong. The app writes a handful of days and can only rewrite them when
    // someone opens it — there is no background refresh for this payload on
    // any platform. On a phone that is invisible, because the app is opened
    // constantly. A Mac app installed from Homebrew can sit unopened for
    // weeks, which is exactly where this was reported.
    //
    // What the provider did once the last day had passed was the bug.
    // `activeDay(at:)` pins to the newest day it holds, which by then is in
    // the past; `nextPrayer(after:)` finds nothing after now and returns nil.
    // So the card drew its "NEXT" heading with no prayer name under it, no
    // time, and a days-old date — a blank box, in other words — and it never
    // recovered, because the policy below re-ran it every two hours against
    // the same dead JSON.
    //
    // A schedule that has run out is worth no more than no schedule at all, so
    // it should say the same thing. `payload: nil` is what the views already
    // treat as empty, and their empty state — "Open Prayer Times" — happens to
    // name the only action that fixes it. Retry hourly rather than in two
    // hours: the moment the app is opened it rewrites the payload and reloads
    // the timeline itself, so this is only the floor for the case where the
    // reload notification is missed.
    if let lastDay = dayInfos.last?.date,
       let windowEnd = cal.date(byAdding: .day, value: 1, to: lastDay),
       now >= windowEnd {
      let e = Entry(
        date: now,
        payload: nil,
        dynamicNextKey: nil,
        dynamicNextName: nil,
        dynamicNextTime: nil
      )
      let refresh = cal.date(byAdding: .hour, value: 1, to: now)
        ?? now.addingTimeInterval(3600)
      completion(Timeline(entries: [e], policy: .after(refresh)))
      return
    }

    // Flatten the five salāh of every day into one chronological list of
    // absolutely-dated prayer events. Sunrise is intentionally excluded from
    // the "next prayer" target set, matching the single-day behaviour.
    struct PrayerEvent { let date: Date; let key: String; let name: String; let time: String }
    var prayers: [PrayerEvent] = []
    for info in dayInfos {
      for r in info.day.rows {
        let parts = r.time.split(separator: ":")
        if parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
           let pd = cal.date(bySettingHour: h, minute: m, second: 0, of: info.date) {
          // Full name first. `abbr` exists so six prayers fit across an
          // Android strip; the headline of a widget has room to say
          // "Maghrib", and "Magh" up there reads as a truncation bug.
          prayers.append(PrayerEvent(date: pd, key: r.key, name: r.name ?? r.key, time: r.time))
        }
      }
    }
    prayers.sort { $0.date < $1.date }

    func nextPrayer(after t: Date) -> PrayerEvent? { prayers.first { $0.date > t } }
    func activeDay(at t: Date) -> DayInfo {
      var chosen = dayInfos[0]
      for info in dayInfos where info.date <= t { chosen = info }
      return chosen
    }
    /// One timeline entry's payload.
    ///
    /// `isToday` decides which of the extra blocks come along. Two of them
    /// are stamped with the day they describe — `today` carries a `dateKey`
    /// and `hijri` is one specific Hijri date — so forwarding them onto a
    /// future entry would draw today's logged ticks and today's Hijri date
    /// underneath tomorrow's prayer times. Absent is the honest answer
    /// there; the app pushes a fresh payload the next time it is opened.
    ///
    /// The rest are not date-stamped in a way that can go wrong: the
    /// practice grid carries an explicit date per day, reading is a
    /// position in the mushaf, and the tasbih count is a count.
    func perDayPayload(_ info: DayInfo, _ np: PrayerEvent?, isToday: Bool) -> WidgetPayload {
      WidgetPayload(
        dayLabel: info.day.dayLabel,
        rows: info.day.rows,
        sunriseRow: info.day.sunriseRow,
        extraRows: info.day.extraRows,
        nextKey: np?.key,
        nextPrayerName: np?.name,
        nextPrayerTime: np?.time,
        locationName: payload.locationName,
        seasonal: payload.seasonal,
        days: nil,
        practice: payload.practice,
        today: isToday ? payload.today : nil,
        reading: payload.reading,
        hijri: isToday ? payload.hijri : nil,
        tasbih: payload.tasbih
      )
    }

    // Entry boundaries: now, the start of each future day (so the rows roll at
    // midnight), and each future prayer time (so the highlight advances).
    var boundarySet: Set<Date> = [now]
    for info in dayInfos where info.date > now { boundarySet.insert(info.date) }
    for p in prayers where p.date > now { boundarySet.insert(p.date) }
    var boundaries = boundarySet.sorted()
    // WidgetKit tolerates large timelines, but keep it bounded.
    if boundaries.count > 60 { boundaries = Array(boundaries.prefix(60)) }

    let todayInfo = activeDay(at: now)
    var entries: [Entry] = []
    for b in boundaries {
      let info = activeDay(at: b)
      let np = nextPrayer(after: b)
      entries.append(Entry(
        date: b,
        payload: perDayPayload(info, np, isToday: info.day.dateKey == todayInfo.day.dateKey),
        dynamicNextKey: np?.key,
        dynamicNextName: np?.name,
        dynamicNextTime: np?.time
      ))
    }

    // Refresh a couple of hours after the final entry. By then the app has
    // usually been opened and pushed a fresh window; if not, the provider
    // re-runs against the same stored schedule (still correct until the last
    // day in the window elapses).
    let last = boundaries.last ?? now
    let refresh = cal.date(byAdding: .hour, value: 2, to: last) ?? last.addingTimeInterval(7200)
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
    extraRows: [
      .init(key: "Midnight",  time: "00:34", abbr: "Mid",   name: "Islamic Midnight"),
      .init(key: "Lastthird", time: "02:22", abbr: "Qiyam", name: "Last Third"),
    ],
    nextKey: "Dhuhr", nextPrayerName: "Dhuhr", nextPrayerTime: "12:10",
    locationName: "London",
    seasonal: nil,
    days: nil,
    // The gallery preview deliberately shows the extra blocks: a widget
    // whose preview is emptier than the real thing is a widget people
    // scroll past.
    practice: .init(
      streak: 12, bestStreak: 31, loggedToday: 2, owed: 1,
      sunnahRate: 0.68, fastsThisMonth: 6,
      days: []
    ),
    today: nil,
    reading: nil,
    hijri: .init(
      day: 25, month: 2, year: 1448, monthName: "Safar",
      label: "25 Safar 1448", nextMonthName: "Rabi I", nextMonthInDays: 5
    ),
    tasbih: nil
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

/// The stretch of time the user is currently inside: the prayer just past,
/// and the one coming up.
///
/// Built from the payload's `HH:mm` strings against a REFERENCE DATE rather
/// than against `Date()`. The difference matters: WidgetKit renders an entry
/// at a moment of its choosing, sometimes hours after the provider built it
/// and sometimes on the other side of midnight, and an interval anchored to
/// "now" would then measure from the wrong day and draw a ring that is
/// complete, empty, or negative.
struct PrayerInterval {
  let start: Date
  let end: Date

  /// Fraction elapsed at `date`, clamped. A zero-length or inverted
  /// interval reports 0 rather than dividing by it.
  func fraction(at date: Date) -> Double {
    let total = end.timeIntervalSince(start)
    guard total > 0 else { return 0 }
    return min(1, max(0, date.timeIntervalSince(start) / total))
  }

  /// Resolve `HH:mm` against the calendar day containing `reference`.
  private static func date(_ hhmm: String, on reference: Date, _ cal: Calendar) -> Date? {
    let parts = hhmm.split(separator: ":")
    guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
    return cal.date(bySettingHour: h, minute: m, second: 0, of: reference)
  }

  /// The interval surrounding `reference`.
  ///
  /// Before the day's first prayer the interval runs from yesterday's LAST
  /// prayer; after the day's last it runs to tomorrow's first. Both wrap
  /// cases matter — without them the ring sits empty all night, which is
  /// exactly when someone is most likely to be waiting for Fajr.
  static func around(_ reference: Date, rows: [WidgetPayload.Row], calendar cal: Calendar) -> PrayerInterval? {
    let times = rows.compactMap { date($0.time, on: reference, cal) }.sorted()
    guard let first = times.first, let last = times.last else { return nil }

    if reference < first {
      guard let prevDay = cal.date(byAdding: .day, value: -1, to: last) else { return nil }
      return PrayerInterval(start: prevDay, end: first)
    }
    if reference >= last {
      guard let nextDay = cal.date(byAdding: .day, value: 1, to: first) else { return nil }
      return PrayerInterval(start: last, end: nextDay)
    }
    var start = first
    for t in times {
      if t <= reference { start = t } else { return PrayerInterval(start: start, end: t) }
    }
    return nil
  }
}

/// Live countdown to the next prayer.
///
/// The system ticks this on-device, so the number keeps moving without the
/// extension being woken — which is the only way a widget can show a
/// countdown at all, since WidgetKit will not re-render one per minute.
///
/// `.relative` rather than `Text(timerInterval:)`, and that is not a style
/// preference. `timerInterval` renders a bare `20:54`, which sits directly
/// under the prayer's clock time `12:51` in the same column — two
/// colon-separated numbers stacked, one a time of day and one a duration,
/// with nothing to tell them apart. Seen on a simulator it reads as a
/// second clock time. `.relative` says "20 min", which cannot be misread.
///
/// Past the target the label would start counting up ("2 min ago"), so it
/// falls back to the clock time until the next timeline entry takes over.
struct CountdownLabel: View {
  let target: Date?
  let fallback: String?
  var size: CGFloat = 17
  var weight: Font.Weight = .semibold
  /// Lock Screen accessory views are rendered monochrome by the system and
  /// must inherit its foreground style. Forcing `widgetText` there paints a
  /// colour chosen for a home-screen card onto a vibrancy-tinted overlay.
  var inheritsForeground: Bool = false

  var body: some View {
    Group {
      if let target, target > Date() {
        Text(target, style: .relative)
      } else if let fallback, !fallback.isEmpty {
        Text(fallback)
      }
    }
    .font(.system(size: size, weight: weight))
    .monospacedDigit()
    .foregroundStyle(inheritsForeground ? AnyShapeStyle(.foreground) : AnyShapeStyle(widgetText))
    .lineLimit(1)
    .minimumScaleFactor(0.5)
  }
}

/// How far through the current interval we are, as a ring.
///
/// Evaluated once per entry rather than animated: WidgetKit does not run a
/// render loop, so a ring that claimed to sweep would simply be wrong
/// between entries. It is redrawn at every prayer boundary, which is when
/// the number it shows actually jumps.
private struct IntervalRing: View {
  let interval: PrayerInterval
  let tint: Color

  var body: some View {
    let f = interval.fraction(at: Date())
    ZStack {
      Circle()
        .stroke(widgetMuted.opacity(0.25), lineWidth: 4)
      Circle()
        .trim(from: 0, to: max(0.01, f))
        .stroke(tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
        .rotationEffect(.degrees(-90))
      Text(verbatim: "\(Int((f * 100).rounded()))%")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(widgetText)
        .minimumScaleFactor(0.7)
    }
  }
}

struct PrayerWidgetEntryView: View {
  var entry: Entry
  @Environment(\.widgetFamily) var widgetFamily

  /// `secondary` is the treatment for a row that belongs on the card but is
  /// not a salāh — Sunrise, Islamic Midnight, the Last Third.
  private func rowColor(highlight: Bool, secondary: Bool) -> Color {
    if highlight { return resolvedWidgetHighlightColor() }
    return secondary ? widgetMuted : widgetText
  }

  // MARK: - Small widget — Next Prayer

  /// The small family answers one question — when is the next prayer — and
  /// it used to answer it with a static clock time, so the widget looked
  /// identical at 05:11 and at 12:09. Two things fix that without asking
  /// WidgetKit to re-render every minute, which it will not do:
  ///
  ///   • `Text(timerInterval:)` ticks on-device for free. The countdown is
  ///     live even though the entry behind it is hours old.
  ///   • A ring showing how much of the CURRENT interval has elapsed, so
  ///     there is something to read at a glance from across a room.
  ///
  /// Both need real `Date`s, and the payload carries clock strings. They
  /// are resolved against the entry's own day rather than "today", so an
  /// entry the system renders after midnight does not measure to yesterday.
  @ViewBuilder
  private var smallWidgetContent: some View {
    if let p = entry.payload {
      let name = entry.dynamicNextName ?? p.nextPrayerName ?? p.nextKey
      let time = entry.dynamicNextTime ?? p.nextPrayerTime
      let interval = currentInterval(p)

      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top) {
          Text("NEXT")
            .kerning(1.0)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(widgetMuted)
          Spacer(minLength: 4)
          if let loc = p.locationName, !loc.isEmpty {
            Text(loc.uppercased())
              .kerning(0.5)
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
              .truncationMode(.tail)
          }
        }

        Spacer(minLength: 6)

        // The ring sits beside the name rather than beside the countdown.
        // Putting it next to the countdown left that label about 70pt of
        // width, and "18 min, 32 sec" truncated to "18 min…" — a countdown
        // with an ellipsis where the seconds should be reads as broken.
        HStack(alignment: .center, spacing: 8) {
          VStack(alignment: .leading, spacing: 0) {
            if let name, !name.isEmpty {
              Text(name)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(widgetText)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            }
            if let time, !time.isEmpty {
              Text(time)
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(resolvedWidgetHighlightColor())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            }
          }
          Spacer(minLength: 0)
          if let interval {
            IntervalRing(interval: interval, tint: resolvedWidgetHighlightColor())
              .frame(width: 38, height: 38)
          }
        }

        Spacer(minLength: 6)

        // Full width, so the countdown never has to be abbreviated.
        VStack(alignment: .leading, spacing: 0) {
          Text("in")
            .font(.system(size: 11))
            .foregroundStyle(widgetMuted)
          CountdownLabel(target: interval?.end, fallback: time)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

  /// Previous → next prayer around the entry's moment, as real dates.
  private func currentInterval(_ p: WidgetPayload) -> PrayerInterval? {
    PrayerInterval.around(entry.date, rows: p.rows, calendar: .current)
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

          // The countdown the small family already has. Same reasoning:
          // without it this column states a time and nothing about how far
          // away it is, which is the question being asked.
          CountdownLabel(
            target: PrayerInterval.around(entry.date, rows: p.rows, calendar: .current)?.end,
            fallback: nil
          )
          .padding(.top, 1)

          Spacer()

          // Day label at the bottom, with the Hijri date under it when the
          // app has sent one. This column used to end at the date and leave
          // a gap below it.
          VStack(alignment: .leading, spacing: 1) {
            Text(p.dayLabel)
              .font(.system(size: 9))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
            if let h = p.hijri {
              Text(verbatim: "\(h.day) \(h.monthName) \(h.year)")
                .font(.system(size: 9))
                .foregroundStyle(widgetMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
          }
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
            let col = rowColor(highlight: highlight, secondary: isSunrise)

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

  // MARK: - Large widget

  /// systemLarge is NOT the medium layout stretched.
  ///
  /// It was, and on a real device the left column had roughly 150pt of
  /// nothing between the countdown and the date — the two-column split has
  /// only ever had one column's worth of content, and at four cells tall the
  /// spacers holding it apart become a void you can see across a room.
  ///
  /// Single column instead: the rows go full width, which makes them bigger
  /// and more legible rather than merely wider, and they fill the height by
  /// construction instead of by padding. The practice strip then has a real
  /// section to sit under rather than being tacked below a gap.
  @ViewBuilder
  private var largeContent: some View {
    if let p = entry.payload {
      let currentNextKey = entry.dynamicNextKey ?? p.nextKey
      let name = entry.dynamicNextName ?? p.nextPrayerName ?? p.nextKey
      let time = entry.dynamicNextTime ?? p.nextPrayerTime

      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline) {
          Text(verbatim: headerLine(p))
            .kerning(0.4)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(widgetMuted)
            .lineLimit(1)
          Spacer(minLength: 6)
          if let h = p.hijri {
            Text(verbatim: "\(h.day) \(h.monthName) \(h.year)")
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
          }
        }
        // The refresh button lives in the enclosing ZStack's top-trailing
        // corner, over this row. Without the reserve the Hijri year runs
        // underneath it and reads as "1448⟳".
        .padding(.trailing, 20)

        // The countdown gets its OWN line, with "in" inline beside it.
        //
        // It was in a trailing column opposite the prayer name, and the word
        // "in" ended up alone in the top-right corner of the card with the
        // number nowhere near it. The cause is that `Text(_, style: .relative)`
        // reserves a frame wide enough for the longest string it might ever
        // render — far wider than "3 hr, 50 min" draws — so right-aligning
        // the column right-aligned the RESERVED box, not the glyphs. Putting
        // the label and the number in one HStack means the reserved slack can
        // only ever trail off to the right of a phrase that already reads.
        VStack(alignment: .leading, spacing: 0) {
          Text("NEXT")
            .kerning(1.0)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(widgetMuted)
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let name, !name.isEmpty {
              Text(name)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(widgetText)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            }
            if let time, !time.isEmpty {
              Text(time)
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(resolvedWidgetHighlightColor())
                .lineLimit(1)
            }
          }
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("in")
              .font(.system(size: 11))
              .foregroundStyle(widgetMuted)
            CountdownLabel(
              target: PrayerInterval.around(entry.date, rows: p.rows, calendar: .current)?.end,
              fallback: nil
            )
          }
          .padding(.top, 1)
        }
        .padding(.top, 8)

        VStack(spacing: 0) {
          ForEach(Array(p.displayRows.enumerated()), id: \.offset) { _, r in
            largeRow(r, highlight: currentNextKey == r.key)
          }
          // Islamic Midnight and the Last Third, when the user has asked
          // for them. Never highlighted: they are on this card because the
          // night matters, not because either is what comes next.
          ForEach(Array((p.extraRows ?? []).enumerated()), id: \.offset) { _, r in
            largeRow(r, highlight: false, secondary: true)
          }
        }
        .padding(.top, 8)

        practiceStrip
          .padding(.top, 8)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      Text("Open Mihrab")
        .font(.caption)
        .foregroundStyle(widgetMuted)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /// "Thu, Aug 20 · Stockholm" — one line, because two muted lines stacked
  /// at the top of a card read as a paragraph nobody asked for.
  private func headerLine(_ p: WidgetPayload) -> String {
    let loc = (p.locationName ?? "").trimmingCharacters(in: .whitespaces)
    return loc.isEmpty ? p.dayLabel : "\(p.dayLabel) · \(loc)"
  }

  /// One full-width row of the large widget's table.
  ///
  /// `secondary` is what Sunrise has always been — a line that belongs on the
  /// card without competing with the salāh — and it is what the two night
  /// rows are too, so they share the treatment rather than inventing a third.
  @ViewBuilder
  private func largeRow(
    _ r: WidgetPayload.Row,
    highlight: Bool,
    secondary: Bool = false
  ) -> some View {
    let isSunrise = r.key == "Sunrise"
    let muted = isSunrise || secondary
    let col = rowColor(highlight: highlight, secondary: muted)
    ZStack(alignment: .leading) {
      if highlight {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
          .fill(resolvedWidgetHighlightColor().opacity(0.15))
        Rectangle()
          .fill(resolvedWidgetHighlightColor())
          .frame(width: 3)
          .cornerRadius(1.5)
      }
      HStack(spacing: 0) {
        // Sunrise keeps its abbreviation ("Sun") because it sits inside the
        // salāh list and a long word there breaks the rhythm. The night rows
        // sit under it with a full-width line to themselves, so they get the
        // real name — "Qiyam" alone would not tell you what it is the time of.
        Text(isSunrise ? (r.abbr ?? r.key) : (secondary ? (r.name ?? r.key) : r.key))
          .font(.system(size: secondary ? 12 : 14, weight: highlight ? .semibold : .regular))
          .foregroundStyle(col)
          .frame(maxWidth: .infinity, alignment: .leading)
          .lineLimit(1)
          .minimumScaleFactor(0.85)
          .padding(.leading, highlight ? 9 : 6)
        Text(r.time)
          .font(.system(size: secondary ? 12 : 14, weight: highlight ? .semibold : .medium))
          .monospacedDigit()
          .foregroundStyle(col)
          .padding(.trailing, 6)
      }
    }
    .frame(maxHeight: .infinity)
  }

  /// The practice strip, drawn under the prayer table at systemLarge.
  ///
  /// This is the merge: at four cells tall there is room for the whole day
  /// AND the record of it, which is the pair people check together — what is
  /// next, and whether this week has held. It is the same widget kind with
  /// one more section, not a tenth entry in the picker.
  ///
  /// Drawn only when the app has actually sent a `practice` block. An absent
  /// block is not a zero streak: those look identical on a home screen and
  /// mean opposite things.
  @ViewBuilder
  private var practiceStrip: some View {
    if let pr = entry.payload?.practice {
      VStack(spacing: 6) {
        Rectangle()
          .fill(Color.white.opacity(0.12))
          .frame(height: 1)

        HStack(alignment: .bottom, spacing: 10) {
          VStack(alignment: .leading, spacing: 1) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
              Text(verbatim: "\(pr.streak)")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(widgetText)
              Text("day streak")
                .font(.system(size: 11))
                .foregroundStyle(widgetMuted)
            }
            Text(verbatim: practiceFooter(pr))
              .font(.system(size: 10))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          Spacer(minLength: 4)
          PracticeGrid(
            days: pr.days,
            weeks: 10,
            cell: 6,
            spacing: 2,
            accent: resolvedWidgetHighlightColor()
          )
        }
      }
    }
  }

  /// "Best 31 · 2 of 5 logged", dropping the parts there is nothing to say
  /// about — a best of 0 is not a personal best worth printing.
  ///
  /// `owed` is the whole journal's unmade-up prayers, not today's, while the
  /// segment beside it counts today — so "2 owed" next to "2 of 5 logged"
  /// reads as two owed TODAY, which it is not. The Log screen calls the same
  /// number a thing you tap a day to make up, so the widget says that too.
  private func practiceFooter(_ pr: WidgetPayload.Practice) -> String {
    var parts: [String] = []
    if pr.bestStreak > 0 { parts.append("Best \(pr.bestStreak)") }
    parts.append("\(pr.loggedToday) of 5 logged")
    if pr.owed > 0 { parts.append("\(pr.owed) to make up") }
    return parts.joined(separator: " · ")
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
        case .systemLarge:
          largeContent
            .padding(EdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14))
          if #available(iOS 17.0, *) {
            Button(intent: RefreshIntent()) {
              Image(systemName: "arrow.clockwise")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(widgetMuted)
                .padding(8)
            }
            .buttonStyle(.plain)
          }
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

struct WidgetBackgroundCompatModifier: ViewModifier {
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

  /// Mac Catalyst: the Lock Screen accessory families (`accessoryInline`,
  /// `accessoryCircular`, `accessoryRectangular`) do not exist on macOS — the
  /// Mac has no Lock Screen. WidgetKit still surfaces the `system*` families in
  /// Notification Center / on the desktop, so we compile only those into the
  /// Catalyst binary. The guard is compile-time, so the iOS/iPadOS build keeps
  /// the full accessory set unchanged.
  ///
  /// The `#available(16.0)` check this used to carry is gone: the target now
  /// deploys to iOS 17, so it was a branch the compiler could prove could not
  /// be taken, which reads as a supported configuration to the next person.
  private func supportedFamilies() -> [WidgetFamily] {
    #if targetEnvironment(macCatalyst)
    return [.systemSmall, .systemMedium, .systemLarge]
    #else
    return [
      .systemSmall, .systemMedium, .systemLarge,
      .accessoryInline, .accessoryCircular, .accessoryRectangular,
    ]
    #endif
  }
}

/// This bundle vends the home-screen and Lock-Screen-accessory widgets, and
/// nothing else.
///
/// The Live Activity used to be here too, behind an `#available(16.1)` check,
/// because one extension had to serve both. It now has its own target —
/// `MihrabLiveActivity` — so that this one can deploy to iOS 17 and use
/// `Button(intent:)` without guarding every interactive control.
///
/// THIS BUNDLE IDENTIFIER MUST NOT CHANGE. WidgetKit ties a widget a user has
/// placed to the extension that vends it, so renaming this target or its
/// bundle id turns every already-placed Mihrab widget into a dead
/// placeholder. That is the reason the Live Activity moved out rather than
/// the widgets: nobody places a Live Activity by hand.
@main
struct PrayerWidgetExtensionBundle: WidgetBundle {
  @WidgetBundleBuilder
  var body: some Widget {
    PrayerTimesHomeWidget()
    HijriDateWidget()
    StreakWidget()
    ReadingWidget()
    LogTodayWidget()
    TasbihWidget()
  }
}
