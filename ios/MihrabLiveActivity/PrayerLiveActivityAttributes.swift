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
#if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
import ActivityKit

@available(iOS 16.1, *)
public struct PrayerLiveActivityAttributes: ActivityAttributes {
  /// Mutable state pushed via `activity.update(using:)`.
  public struct ContentState: Codable, Hashable {
    /// Localised name for the upcoming prayer, e.g. "Fajr" / "الفجر".
    public var nextLabel: String
    /// CANONICAL 24-hour `HH:mm` for the upcoming prayer.
    ///
    /// `computeNext` and the on-device roll-forward split this on ":" —
    /// it is arithmetic. What the card draws is `nextTimeText`.
    public var nextTime: String
    /// The same instant written the way the user reads a clock (issue #18).
    /// Defaults to "" so payloads from older app builds still decode.
    public var nextTimeDisplay: String = ""
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

    /// The night marks — First Third / Islamic Midnight / the Last Third —
    /// present only when the user has turned them on. The JS side has always
    /// sent them; this field is what stops them being dropped on decode, and
    /// what lets the on-device roll-forward land on one and leave it again
    /// instead of counting past it to the next salāh.
    ///
    /// Optional, not an empty-array default: synthesized `Decodable` does not
    /// fall back to a property's default value, it throws on a missing key —
    /// and an activity already running when this build installs was archived
    /// by the previous one, which never wrote this field. Only an Optional
    /// decodes as absent.
    public var extraRows: [Row]?

    /// Empty string → omit.
    public var hijriLabel: String
    /// Empty string → omit.
    public var locationLabel: String

    /// "#RRGGBB" — drives keyline tint + accent colour. Ignored when
    /// `systemTinted` is true.
    public var accentHex: String

    /// When true (iOS Liquid Glass / system colours active in-app) the views
    /// ignore `accentHex` and use the dynamic iOS system tint, so the Live
    /// Activity matches the system theme and adapts to light/dark by itself.
    /// Defaults to false so older JS payloads still decode.
    public var systemTinted: Bool = false

    /// Display knobs from the user's Settings → Live activity card.
    public var compactMode: Bool
    public var showSunrise: Bool
    public var showHijri: Bool
    public var showLocation: Bool

    /// The next prayer's time as it should be drawn. Never parsed.
    public var nextTimeText: String {
      nextTimeDisplay.isEmpty ? nextTime : nextTimeDisplay
    }
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
    /// CANONICAL 24-hour `HH:mm` — the roll-forward parses it. Draw `text`.
    public var time: String
    /// The same instant written the way the user reads a clock (issue #18).
    public var display: String = ""

    /// What to put on screen. Never feed this to a parser.
    public var text: String { display.isEmpty ? time : display }
  }
}
#endif
