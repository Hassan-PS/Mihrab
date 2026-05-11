// Prayer Live Activity widget — task #128.
//
// Lives in the PrayerWidgetExtension target only. Declares the
// ActivityConfiguration<…> the OS reads to render the Live Activity on
// the Lock Screen and the Dynamic Island variants (compact / minimal /
// expanded). The host app starts/updates/ends the activity from
// PrayerLiveActivity.swift (main app target) — this file is purely
// presentation.
//
// Design follows Apple's Live Activity HIG:
//   • Lock Screen view: full-width "rich" card. We use the accent dot
//     + prayer name + monospaced countdown so the eye finds the
//     duration instantly; the row list sits below, with the upcoming
//     prayer marked by a leading "›" glyph in the accent colour. A
//     thin caption footer carries the Hijri date and short location
//     when the user has those toggles ON.
//   • Dynamic Island compact: minimal text, the accent-tinted moon
//     glyph on the left, the live countdown on the right.
//   • Dynamic Island minimal: just the countdown — this is the state
//     used when another Live Activity is sharing the island.
//   • Dynamic Island expanded: leading carries the prayer name + HH:MM,
//     trailing carries the live countdown, the bottom region lists the
//     upcoming prayers (when not in compact mode).
//
// All countdowns are rendered with Text(timerInterval:countsDown:) so
// they update on-device every second without us pushing ActivityKit
// content updates each second.

import Foundation
import SwiftUI
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct PrayerLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PrayerLiveActivityAttributes.self) { context in
      // Lock-screen / banner presentation.
      LockScreenLiveActivityView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.15))
        .activitySystemActionForegroundColor(Color.primary)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          DynamicIslandLeading(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          DynamicIslandTrailing(state: context.state)
        }
        DynamicIslandExpandedRegion(.center) { EmptyView() }
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

// MARK: - Lock-screen card

@available(iOS 16.1, *)
private struct LockScreenLiveActivityView: View {
  let state: PrayerLiveActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      // Headline row — accent dot + prayer name (+ HH:MM as subtitle)
      // on the left, monospaced countdown on the right.
      HStack(alignment: .center, spacing: 10) {
        Circle()
          .fill(liveActivityAccent(state: state))
          .frame(width: 8, height: 8)
        VStack(alignment: .leading, spacing: 1) {
          Text(state.nextLabel)
            .font(.system(size: 17, weight: .semibold))
            .lineLimit(1)
          Text(state.nextTime)
            .font(.system(size: 13, design: .monospaced))
            .foregroundColor(.secondary)
        }
        Spacer(minLength: 8)
        Text(
          timerInterval:
            Date()...Date(timeIntervalSince1970: state.nextEpochSeconds),
          countsDown: true
        )
        .font(.system(.title3, design: .rounded).monospacedDigit())
        .foregroundColor(liveActivityAccent(state: state))
        .fixedSize()
      }

      // Prayer list — chronological, "›" marks the next prayer in the
      // accent colour. Hidden when the user has compact mode ON.
      if !state.compactMode {
        Divider().opacity(0.5)
        VStack(alignment: .leading, spacing: 5) {
          ForEach(displayRows(), id: \.key) { row in
            HStack {
              Text(row.key == state.nextKey ? "›" : " ")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(
                  row.key == state.nextKey
                    ? liveActivityAccent(state: state)
                    : .clear
                )
                .frame(width: 10, alignment: .center)
              Text(row.abbr)
                .font(.system(
                  size: 14,
                  weight: row.key == state.nextKey ? .semibold : .regular
                ))
                .foregroundColor(
                  row.key == state.nextKey ? .primary : .secondary
                )
              Spacer()
              Text(row.time)
                .font(.system(size: 14, design: .monospaced))
                .foregroundColor(
                  row.key == state.nextKey ? .primary : .secondary
                )
            }
          }
        }
      }

      // Footer captions — Hijri date and / or short location, separated
      // by a middle dot. Only renders when at least one is non-empty.
      let footer = footerText(state: state)
      if !footer.isEmpty {
        Text(footer)
          .font(.system(size: 11))
          .foregroundColor(.secondary)
          .padding(.top, 2)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }

  private func displayRows() -> [PrayerLiveActivityAttributes.Row] {
    var out = state.rows
    if state.showSunrise, let sun = state.sunriseRow {
      if out.isEmpty { out.append(sun) }
      else { out.insert(sun, at: 1) }
    }
    return out
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
    Text(
      timerInterval:
        Date()...Date(timeIntervalSince1970: state.nextEpochSeconds),
      countsDown: true
    )
    .font(.system(.body, design: .rounded).monospacedDigit())
    .foregroundColor(liveActivityAccent(state: state))
    .fixedSize()
    .padding(.trailing, 2)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandMinimal: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    Text(
      timerInterval:
        Date()...Date(timeIntervalSince1970: state.nextEpochSeconds),
      countsDown: true
    )
    .font(.system(.caption, design: .rounded).monospacedDigit())
    .foregroundColor(liveActivityAccent(state: state))
    .fixedSize()
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandLeading: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "moon.stars.fill")
        .foregroundColor(liveActivityAccent(state: state))
      VStack(alignment: .leading, spacing: 0) {
        Text(state.nextLabel)
          .font(.system(size: 15, weight: .semibold))
          .lineLimit(1)
        Text(state.nextTime)
          .font(.system(size: 12, design: .monospaced))
          .foregroundColor(.secondary)
      }
    }
    .padding(.leading, 4)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandTrailing: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    Text(
      timerInterval:
        Date()...Date(timeIntervalSince1970: state.nextEpochSeconds),
      countsDown: true
    )
    .font(.system(.title3, design: .rounded).monospacedDigit())
    .foregroundColor(liveActivityAccent(state: state))
    .fixedSize()
    .padding(.trailing, 4)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandBottom: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    if state.compactMode {
      EmptyView()
    } else {
      // Show the upcoming prayers (everything after the current "next"),
      // capped so the Dynamic Island doesn't get cluttered.
      let upcoming = upcomingRows()
      if upcoming.isEmpty {
        EmptyView()
      } else {
        HStack(spacing: 14) {
          ForEach(upcoming, id: \.key) { row in
            VStack(spacing: 1) {
              Text(row.abbr)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
              Text(row.time)
                .font(.system(size: 12, design: .monospaced))
            }
          }
        }
        .padding(.horizontal, 8)
        .padding(.top, 4)
      }
    }
  }

  private func upcomingRows() -> [PrayerLiveActivityAttributes.Row] {
    var out = state.rows
    if state.showSunrise, let sun = state.sunriseRow {
      if out.isEmpty { out.append(sun) }
      else { out.insert(sun, at: 1) }
    }
    // Drop everything up to and including the current "next" row so the
    // strip shows only what's still ahead.
    if let idx = out.firstIndex(where: { $0.key == state.nextKey }) {
      out = Array(out.dropFirst(idx + 1))
    }
    return Array(out.prefix(4))
  }
}

// MARK: - Helpers

@available(iOS 16.1, *)
private func liveActivityAccent(
  state: PrayerLiveActivityAttributes.ContentState
) -> Color {
  Color(hex: state.accentHex) ?? Color(red: 0.13, green: 0.77, blue: 0.37) // green-500
}

@available(iOS 16.1, *)
private func footerText(
  state: PrayerLiveActivityAttributes.ContentState
) -> String {
  var parts: [String] = []
  if state.showHijri, !state.hijriLabel.isEmpty {
    parts.append(state.hijriLabel)
  }
  if state.showLocation, !state.locationLabel.isEmpty {
    parts.append(shortLocation(state.locationLabel))
  }
  return parts.joined(separator: " · ")
}

private func shortLocation(_ s: String) -> String {
  if let first = s.split(separator: ",").first {
    return String(first).trimmingCharacters(in: .whitespaces)
  }
  return s
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
