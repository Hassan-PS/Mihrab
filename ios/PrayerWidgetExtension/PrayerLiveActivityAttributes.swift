// Shared ActivityAttributes — task #128.
//
// Defines the wire format between the React Native side (which packs a
// JSON payload via `setContentState`) and the SwiftUI Live Activity
// widget (which renders it). The file is a member of BOTH targets:
//   • PrayerApp (main app) — uses ActivityKit's Activity<…>.request /
//     update / end to drive the Activity from the JS bridge.
//   • PrayerWidgetExtension — declares ActivityConfiguration<…> in
//     PrayerLiveActivityWidget.swift so the OS knows how to render.
// Both targets must see the SAME type identity, hence the dual
// membership recorded in PrayerApp.xcodeproj/project.pbxproj.
//
// Decoding strategy: the JS side serialises a flat object whose keys
// match the property names below. We use the synthesised `Codable`
// conformance so a small JS-side payload change doesn't require a
// hand-written init.

import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
public struct PrayerLiveActivityAttributes: ActivityAttributes {
  /// Mutable state pushed via `activity.update(using:)`.
  public struct ContentState: Codable, Hashable {
    /// Localised name for the upcoming prayer, e.g. "Fajr" / "الفجر".
    public var nextLabel: String
    /// HH:MM display string for the upcoming prayer.
    public var nextTime: String
    /// Wall-clock target instant for the countdown, in seconds since
    /// 1970-01-01 00:00:00 UTC. Rendered client-side via
    /// Text(timerInterval:countsDown:) so the widget ticks without our
    /// pushes touching ActivityKit every second.
    public var nextEpochSeconds: Double
    /// Wall-clock instant of the PREVIOUS prayer (seconds since epoch). The
    /// start anchor for the auto-filling progress bar — the bar fills from
    /// `prevEpochSeconds` → `nextEpochSeconds` on-device, so progress advances
    /// without us pushing every minute (mirrors the Android progress bar).
    /// Defaults to 0 so older JS payloads still decode.
    public var prevEpochSeconds: Double = 0
    /// Stable row key for the upcoming prayer (matches WIDGET_ROW_KEYS).
    public var nextKey: String

    /// Full prayer-day rows, chronological order, with the FIVE salāh
    /// plus optionally Sunrise spliced in by the JS side at slot 1
    /// when `showSunrise` is true.
    public var rows: [Row]
    /// Sunrise row sent separately when the user has the sunrise toggle
    /// ON but expects the lock-screen widget to render it inline; we
    /// keep both for compatibility with the home-screen widget payload.
    public var sunriseRow: Row?

    /// Empty string → omit.
    public var hijriLabel: String
    /// Empty string → omit.
    public var locationLabel: String

    /// "#RRGGBB" — drives keyline tint + accent colour.
    public var accentHex: String

    /// Display knobs from the user's Settings → Live activity card.
    public var compactMode: Bool
    public var showSunrise: Bool
    public var showHijri: Bool
    public var showLocation: Bool
  }

  /// One prayer row. `key` is canonical ("Fajr"/"Sunrise"/…) so the
  /// SwiftUI views can compare against `ContentState.nextKey` without
  /// worrying about localisation. `abbr` is the localised short label,
  /// `time` is the HH:MM display string.
  public struct Row: Codable, Hashable {
    public var key: String
    public var abbr: String
    /// Localized full prayer name (e.g. "Dhuhr" / "الظهر"). Used by the
    /// background refresh task to rebuild the hero `nextLabel` when it rolls
    /// the activity forward, without needing localization tables in the
    /// extension. Defaults to "" so older payloads still decode (callers fall
    /// back to `abbr`).
    public var name: String = ""
    public var time: String
  }
}
#endif
