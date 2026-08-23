// Streak & Practice — the Log screen's stat tiles, minus three.
//
// A SEPARATE KIND rather than another family of the prayer-times widget.
// The large prayer-times card already carries a practice strip, and that is
// the right thing for someone who wants both facts in one place. This is for
// someone who wants only this one: a person keeping a streak should not have
// to put a prayer table on their home screen to see it, and WidgetKit's unit
// of choice is the kind.
//
// Everything here is drawn from the `practice` block. If the app has never
// written one the widget says so rather than drawing zeroes — an absent block
// and a zero streak look identical on a home screen and mean opposite things.

import SwiftUI
import WidgetKit

struct StreakEntry: TimelineEntry {
  let date: Date
  let practice: WidgetPayload.Practice?
}

struct StreakProvider: TimelineProvider {
  func placeholder(in context: Context) -> StreakEntry {
    StreakEntry(date: Date(), practice: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
    completion(StreakEntry(date: Date(), practice: loadPractice() ?? Self.sample))
  }

  /// One entry, until just after midnight.
  ///
  /// A streak does not move on its own — it moves when a prayer is logged,
  /// and every path that logs one already reloads the timelines. The only
  /// unattended change is the date rolling over, which retires today's column
  /// from "not yet" to part of the record.
  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
    let now = Date()
    let cal = Calendar.current
    let nextMidnight =
      cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime)
      ?? now.addingTimeInterval(3600)
    completion(Timeline(
      entries: [StreakEntry(date: now, practice: loadPractice())],
      policy: .after(nextMidnight)
    ))
  }

  private func loadPractice() -> WidgetPayload.Practice? {
    guard let json = UserDefaults(suiteName: kSuite)?.string(forKey: kKey),
          let data = json.data(using: .utf8),
          let p = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else { return nil }
    // A streak from a payload whose schedule ran out is a claim about weeks
    // the app has not seen. See payloadHasExpired.
    guard !payloadHasExpired(p) else { return nil }
    return p.practice
  }

  static let sample = WidgetPayload.Practice(
    streak: 12, bestStreak: 31, loggedToday: 2, owed: 3,
    sunnahRate: 0.68, fastsThisMonth: 6,
    days: []
  )
}

struct StreakEntryView: View {
  var entry: StreakEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryInline:
      Text(verbatim: entry.practice
        .map { widgetString("widget_streak_inline", $0.streak) }
        ?? widgetString("app_name"))
    case .accessoryRectangular:
      rectangularBody
    case .systemMedium:
      mediumBody
    default:
      smallBody
    }
  }

  // MARK: - systemSmall

  /// One number, big. Everything else on this card exists to say what the
  /// number is and whether it is any good.
  @ViewBuilder
  private var smallBody: some View {
    if let pr = entry.practice {
      VStack(alignment: .leading, spacing: 0) {
        Text("widget_streak_title")
          .kerning(1.0)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(widgetMuted)

        Spacer(minLength: 2)

        // verbatim: a streak is a count, but LocalizedStringKey would put a
        // thousands separator in it the day someone reaches 1,000 days —
        // and that person has earned an un-mangled number.
        Text(verbatim: "\(pr.streak)")
          .font(.system(size: 46, weight: .bold))
          .foregroundStyle(widgetText)
          .lineLimit(1)
          .minimumScaleFactor(0.5)
        Text(widgetString("widget_streak_days", pr.streak))
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(widgetMuted)

        Spacer(minLength: 4)

        if pr.bestStreak > 0 {
          Text(verbatim: widgetString("widget_streak_best", pr.bestStreak))
            .font(.system(size: 12))
            .foregroundStyle(widgetMuted)
            .lineLimit(1)
        }
        if pr.owed > 0 {
          Text(verbatim: owedPhrase(pr.owed))
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(owedColor)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(14)
      .widgetURL(URL(string: "mihrab://log"))
    } else {
      emptyBody
    }
  }

  // MARK: - systemMedium

  /// The number on the left, ten weeks of the graph on the right.
  ///
  /// Ten weeks rather than the fourteen the large prayer-times card shows:
  /// this is half the width and the cells would be 4pt, which is a texture
  /// rather than a record.
  @ViewBuilder
  private var mediumBody: some View {
    if let pr = entry.practice {
      VStack(alignment: .leading, spacing: 0) {
        Text(widgetString("widget_practice_weeks_title", 10))
          .kerning(0.8)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(widgetMuted)
          .lineLimit(1)

        Spacer(minLength: 6)

        HStack(alignment: .center, spacing: 12) {
          VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
              Text(verbatim: "\(pr.streak)")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(widgetText)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
              Text(widgetString("widget_streak_day_label", pr.streak))
                .font(.system(size: 12))
                .foregroundStyle(widgetMuted)
            }
            Text(verbatim: secondLine(pr))
              .font(.system(size: 11))
              .foregroundStyle(widgetMuted)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
            if pr.owed > 0 {
              Text(verbatim: owedPhrase(pr.owed))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(owedColor)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            if pr.fastsThisMonth > 0 {
              Text(verbatim: widgetString("widget_streak_fasts", pr.fastsThisMonth))
                .font(.system(size: 11))
                .foregroundStyle(widgetMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)

          PracticeGrid(
            days: pr.days,
            since: pr.since,
            weeks: 10,
            cell: 8,
            spacing: 2,
            accent: resolvedWidgetHighlightColor()
          )
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .padding(14)
      .widgetURL(URL(string: "mihrab://log"))
    } else {
      emptyBody
    }
  }

  // MARK: - accessoryRectangular

  /// Monochrome on the Lock Screen, so hierarchy is weight and size only.
  @ViewBuilder
  private var rectangularBody: some View {
    if let pr = entry.practice {
      VStack(alignment: .leading, spacing: 1) {
        Text("widget_streak_title")
          .kerning(0.8)
          .font(.system(size: 10, weight: .semibold))
        Text(verbatim: "\(pr.streak) \(widgetString("widget_streak_days", pr.streak))")
          .font(.system(size: 17, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Text(verbatim: secondLine(pr))
          .font(.system(size: 11))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    } else {
      Text("widget_placeholder_open_app").font(.system(size: 12))
    }
  }

  // MARK: - Shared

  /// "Best 31 · 2 of 5 logged" — or whichever halves there is something to
  /// say about. A best of zero is not a personal best worth printing.
  private func secondLine(_ pr: WidgetPayload.Practice) -> String {
    var parts: [String] = []
    if pr.bestStreak > 0 { parts.append("Best \(pr.bestStreak)") }
    parts.append("\(pr.loggedToday) of 5 today")
    if let rate = pr.sunnahRate, rate > 0 {
      parts.append("Sunnah \(Int((rate * 100).rounded()))%")
    }
    return parts.joined(separator: " · ")
  }

  /// Deliberately not "3 owed": this number is the whole journal's unmade-up
  /// prayers, and next to a line about today "owed" reads as owed today.
  private func owedPhrase(_ n: Int) -> String {
    "\(n) to make up"
  }

  /// The same red the practice grid marks an owed day with.
  private var owedColor: Color {
    Color(red: 248 / 255, green: 113 / 255, blue: 113 / 255)
  }

  private var emptyBody: some View {
    VStack(spacing: 4) {
      Text("widget_placeholder_open_app")
        .font(.caption)
        .foregroundStyle(widgetMuted)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

struct StreakWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "MihrabStreak", provider: StreakProvider()) { entry in
      StreakEntryView(entry: entry)
        .modifier(WidgetBackgroundCompatModifier())
        // The app has its own language setting; this is what makes the
        // labels below follow it rather than the phone. See mihrabLocale().
        .environment(\.locale, mihrabLocale())
    }
    .configurationDisplayName(widgetGalleryName("widget_name_streak"))
    .description(widgetString("widget_ios_description_streak"))
    .supportedFamilies(streakFamilies())
  }

  /// A Mac has no Lock Screen, so the accessory families do not exist there —
  /// the same compile-time guard the other two widgets use.
  private func streakFamilies() -> [WidgetFamily] {
    #if targetEnvironment(macCatalyst)
    return [.systemSmall, .systemMedium]
    #else
    return [.systemSmall, .systemMedium, .accessoryInline, .accessoryRectangular]
    #endif
  }
}
