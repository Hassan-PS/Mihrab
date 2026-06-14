// Prayer Live Activity widget — task #128 (redesigned).
//
// Lives in the PrayerWidgetExtension target only. Declares the
// ActivityConfiguration<…> the OS reads to render the Live Activity on the
// Lock Screen and the Dynamic Island variants (compact / minimal / expanded).
// The host app starts/updates/ends the activity from PrayerLiveActivity.swift
// (main app target) — this file is purely presentation.
//
// Design goals (mirrors the Android Live Activity feature set):
//   • Live countdown to the next prayer via Text(timerInterval:) — ticks
//     every second on-device with no per-second pushes from the app.
//   • Auto-filling progress bar via ProgressView(timerInterval:) spanning the
//     previous → next prayer, so the bar advances on its own (the iOS analogue
//     of the Android foreground-service progress bar).
//   • A compact strip of the day's prayers with the upcoming one accented.
//
// Visual language: dark frosted card, a single accent colour (the user's app
// accent) used sparingly for the next-prayer name, countdown, progress bar and
// the highlighted strip cell. Everything else is white at graded opacity so it
// stays legible on the system's lock-screen material in any appearance.

import Foundation
import SwiftUI
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct PrayerLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PrayerLiveActivityAttributes.self) { context in
      LockScreenLiveActivityView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.45))
        .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          DynamicIslandLeading(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          DynamicIslandTrailing(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          DynamicIslandBottom(state: context.state)
        }
      } compactLeading: {
        DynamicIslandCompactLeading(state: context.state)
      } compactTrailing: {
        DynamicIslandCompactTrailing(state: context.state)
      } minimal: {
        DynamicIslandMinimal(state: context.state)
      }
      .keylineTint(liveActivityAccent(state: context.state))
    }
  }
}

// MARK: - Shared date helpers

@available(iOS 16.1, *)
private func nextPrayerDate(_ s: PrayerLiveActivityAttributes.ContentState) -> Date {
  Date(timeIntervalSince1970: s.nextEpochSeconds)
}

/// now…next range for the live countdown. nil once the prayer time has passed
/// (an invalid range would crash the extension).
@available(iOS 16.1, *)
private func countdownRange(
  _ s: PrayerLiveActivityAttributes.ContentState
) -> ClosedRange<Date>? {
  let end = nextPrayerDate(s)
  let now = Date()
  guard end > now else { return nil }
  return now...end
}

/// prev…next range for the auto-filling progress bar. Falls back to a 1-hour
/// window ending at the next prayer when no valid previous anchor was sent.
@available(iOS 16.1, *)
private func progressRange(
  _ s: PrayerLiveActivityAttributes.ContentState
) -> ClosedRange<Date>? {
  let end = nextPrayerDate(s)
  var start = Date(timeIntervalSince1970: s.prevEpochSeconds)
  if start >= end {
    start = end.addingTimeInterval(-3600)
  }
  guard start < end else { return nil }
  return start...end
}

@available(iOS 16.1, *)
private func displayRows(
  _ s: PrayerLiveActivityAttributes.ContentState
) -> [PrayerLiveActivityAttributes.Row] {
  var out = s.rows
  if let sun = s.sunriseRow {
    if out.isEmpty { out.append(sun) } else { out.insert(sun, at: 1) }
  }
  return out
}

// MARK: - Reusable pieces

/// Live countdown text. Shows the running timer until the prayer time, then a
/// neutral "now" glyph-time once it has elapsed (until the app pushes the next
/// prayer).
@available(iOS 16.1, *)
private struct CountdownText: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var font: Font
  var color: Color

  var body: some View {
    Group {
      if let range = countdownRange(state) {
        Text(timerInterval: range, countsDown: true)
          .font(font)
          .monospacedDigit()
          .foregroundColor(color)
          .fixedSize()
      } else {
        Text(state.nextTime)
          .font(font)
          .monospacedDigit()
          .foregroundColor(color)
          .fixedSize()
      }
    }
  }
}

/// Auto-filling linear progress bar from the previous → next prayer.
@available(iOS 16.1, *)
private struct PrayerProgressBar: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var height: CGFloat = 5

  var body: some View {
    if let range = progressRange(state) {
      ProgressView(timerInterval: range, countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .progressViewStyle(.linear)
      .tint(liveActivityAccent(state: state))
      .frame(height: height)
    } else {
      Capsule()
        .fill(Color.white.opacity(0.18))
        .frame(height: height)
    }
  }
}

/// Horizontal strip of the day's prayers; the upcoming one is accented.
@available(iOS 16.1, *)
private struct PrayerStrip: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var nameSize: CGFloat = 10
  var timeSize: CGFloat = 11

  var body: some View {
    let rows = displayRows(state)
    if !rows.isEmpty {
      HStack(spacing: 0) {
        ForEach(rows, id: \.key) { row in
          VStack(spacing: 2) {
            Text(row.abbr)
              .font(.system(size: nameSize, weight: .medium))
              .foregroundColor(
                row.key == state.nextKey
                  ? liveActivityAccent(state: state)
                  : Color.white.opacity(0.5)
              )
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            Text(row.time)
              .font(.system(size: timeSize, design: .monospaced))
              .fontWeight(row.key == state.nextKey ? .semibold : .regular)
              .foregroundColor(
                row.key == state.nextKey
                  ? Color.white
                  : Color.white.opacity(0.6)
              )
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
  }
}

// MARK: - Lock-screen card

@available(iOS 16.1, *)
private struct LockScreenLiveActivityView: View {
  let state: PrayerLiveActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      // Headline: accent dot · prayer name · time, with the live countdown
      // pinned to the trailing edge.
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Circle()
          .fill(liveActivityAccent(state: state))
          .frame(width: 8, height: 8)
          .alignmentGuide(.firstTextBaseline) { d in d[.bottom] - 1 }

        Text(state.nextLabel)
          .font(.system(size: 17, weight: .semibold))
          .foregroundColor(.white)
          .lineLimit(1)

        Text(state.nextTime)
          .font(.system(size: 13, design: .monospaced))
          .foregroundColor(Color.white.opacity(0.6))

        Spacer(minLength: 6)

        CountdownText(
          state: state,
          font: .system(.title3, design: .rounded).weight(.semibold),
          color: liveActivityAccent(state: state)
        )
      }

      // Auto-filling progress toward the next prayer.
      PrayerProgressBar(state: state)

      // The day's prayer strip with the next one accented.
      PrayerStrip(state: state)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }
}

// MARK: - Dynamic Island regions

@available(iOS 16.1, *)
private struct DynamicIslandCompactLeading: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    Image(systemName: "moon.stars.fill")
      .imageScale(.medium)
      .foregroundColor(liveActivityAccent(state: state))
      .padding(.leading, 2)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandCompactTrailing: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    CountdownText(
      state: state,
      font: .system(.body, design: .rounded).weight(.semibold),
      color: liveActivityAccent(state: state)
    )
    .padding(.trailing, 2)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandMinimal: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    CountdownText(
      state: state,
      font: .system(.caption, design: .rounded).weight(.semibold),
      color: liveActivityAccent(state: state)
    )
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandLeading: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "moon.stars.fill")
        .font(.system(size: 18))
        .foregroundColor(liveActivityAccent(state: state))
      VStack(alignment: .leading, spacing: 1) {
        Text(state.nextLabel)
          .font(.system(size: 16, weight: .semibold))
          .lineLimit(1)
        Text(state.nextTime)
          .font(.system(size: 12, design: .monospaced))
          .foregroundColor(.secondary)
      }
    }
    .padding(.leading, 6)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandTrailing: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    CountdownText(
      state: state,
      font: .system(.title2, design: .rounded).weight(.semibold),
      color: liveActivityAccent(state: state)
    )
    .padding(.trailing, 6)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandBottom: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    VStack(spacing: 8) {
      PrayerProgressBar(state: state, height: 6)
      PrayerStrip(state: state, nameSize: 11, timeSize: 12)
    }
    .padding(.horizontal, 4)
    .padding(.top, 6)
  }
}

// MARK: - Helpers

@available(iOS 16.1, *)
private func liveActivityAccent(
  state: PrayerLiveActivityAttributes.ContentState
) -> Color {
  Color(hex: state.accentHex) ?? Color(red: 0.13, green: 0.77, blue: 0.37) // green-500
}

extension Color {
  init?(hex: String) {
    let trimmed = hex.trimmingCharacters(in: .whitespaces)
    let body = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
    guard body.count == 6, let v = UInt32(body, radix: 16) else { return nil }
    self = Color(
      red: Double((v >> 16) & 0xff) / 255.0,
      green: Double((v >> 8) & 0xff) / 255.0,
      blue: Double(v & 0xff) / 255.0
    )
  }
}
#endif
