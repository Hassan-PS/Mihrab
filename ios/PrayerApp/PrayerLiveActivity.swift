// PrayerLiveActivity native module — task #128.
//
// Bridges the JS-side syncLiveActivity orchestrator to ActivityKit on
// iOS 16.1+. Methods are idempotent and async-safe:
//
//   • start(json)      — decode ContentState, start a new Activity. If
//                        one is already running, update it in place.
//   • update(json)     — push fresh content to every running activity.
//   • stop()           — end every running activity with .immediate
//                        dismissal so the lock-screen card disappears
//                        as soon as the user toggles the feature off.
//   • isAvailable()    — true when ActivityKit is available *and* the
//                        user hasn't disabled Live Activities for the
//                        app in Settings.
//
// We don't take a push token here — the activity is driven entirely by
// in-app updates from the React Native bridge. That's sufficient
// because the JS layer re-fires on AppState 'active', on focus, and
// when the underlying prayer-day payload changes; iOS keeps the
// previous content state pinned in between.
//
// On older OS versions the methods either no-op (start/update/stop) or
// resolve `false` (isAvailable) so the JS layer can probe and route.

import Foundation
import React
import BackgroundTasks
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(PrayerLiveActivity)
final class PrayerLiveActivity: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Serial queue — prevents concurrent start() calls from racing each other
  // into a create/destroy spiral when multiple React effects fire at once.
  private let queue = DispatchQueue(label: "com.hassan.prayerapp.liveactivity", qos: .userInitiated)
  private var isStarting = false

  // Last content pushed while the feature was enabled. Used by `reassert()` to
  // revive the card after the user swipes it away / clears it. Cleared by
  // `stop()` so a disabled feature never revives. iOS forbids starting a Live
  // Activity from the background, so revival only happens on app foreground.
  private static var cachedStateJSON: String?

  // MARK: - start

  @objc
  func start(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      // Coalesce rapid concurrent calls: if a start is already in flight,
      // resolve immediately. The in-flight call will apply the same (or
      // newer) state. This prevents the create/dismiss race when the state,
      // nextInfo, and focusEffect all fire simultaneously at app launch.
      queue.sync {
        if isStarting {
          resolve(nil)
          return
        }
        isStarting = true
      }

      guard let data = json.data(using: .utf8) else {
        queue.sync { isStarting = false }
        reject("BAD_JSON", "ContentState JSON could not be encoded as UTF-8", nil)
        return
      }
      let state: PrayerLiveActivityAttributes.ContentState
      do {
        state = try JSONDecoder().decode(
          PrayerLiveActivityAttributes.ContentState.self,
          from: data
        )
      } catch {
        queue.sync { isStarting = false }
        reject("DECODE_FAILED", error.localizedDescription, error)
        return
      }

      // Remember the latest content so `reassert()` can revive the card if the
      // user dismisses it while the feature is still enabled.
      Self.cachedStateJSON = json

      // staleDate = just after the next prayer, so once the countdown elapses
      // the system knows the content is out of date (and dims/refreshes it)
      // rather than showing a frozen 0:00 indefinitely. nil when we don't have
      // a valid future target.
      let staleDate = Self.staleDate(for: state)

      // If there are already running activities, update them in place.
      // Do NOT stop-then-restart: that pattern races when called concurrently
      // and causes the card to flash off the lock screen.
      let existing = Activity<PrayerLiveActivityAttributes>.activities

      if !existing.isEmpty {
        Task {
          // Update all running activities with fresh state.
          for act in existing {
            if #available(iOS 16.2, *) {
              await act.update(ActivityContent(state: state, staleDate: staleDate))
            } else {
              await act.update(using: state)
            }
          }
          LiveActivityRefresher.scheduleRefresh()
          self.queue.sync { self.isStarting = false }
          resolve(nil)
        }
        return
      }

      // No existing activity — request a fresh one.
      // Local-first: pushType is nil (no APNs / no server). The next-prayer
      // pointer advances via (a) the always-live on-device countdown/progress
      // views, (b) foreground updates, and (c) a BGTaskScheduler background
      // refresh — see LiveActivityRefresher below and docs/ios-live-activity-push.md.
      do {
        if #available(iOS 16.2, *) {
          let _ = try Activity<PrayerLiveActivityAttributes>.request(
            attributes: PrayerLiveActivityAttributes(),
            content: ActivityContent(state: state, staleDate: staleDate),
            pushType: nil
          )
        } else {
          let _ = try Activity<PrayerLiveActivityAttributes>.request(
            attributes: PrayerLiveActivityAttributes(),
            contentState: state,
            pushType: nil
          )
        }
        LiveActivityRefresher.scheduleRefresh()
        queue.sync { isStarting = false }
        resolve(nil)
      } catch {
        queue.sync { isStarting = false }
        reject("REQUEST_FAILED", error.localizedDescription, error)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - update

  @objc
  func update(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      guard let data = json.data(using: .utf8) else {
        reject("BAD_JSON", "ContentState JSON could not be encoded as UTF-8", nil)
        return
      }
      let state: PrayerLiveActivityAttributes.ContentState
      do {
        state = try JSONDecoder().decode(
          PrayerLiveActivityAttributes.ContentState.self,
          from: data
        )
      } catch {
        reject("DECODE_FAILED", error.localizedDescription, error)
        return
      }
      Self.cachedStateJSON = json
      let staleDate = Self.staleDate(for: state)
      Task {
        for activity in Activity<PrayerLiveActivityAttributes>.activities {
          if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: state, staleDate: staleDate))
          } else {
            await activity.update(using: state)
          }
        }
        LiveActivityRefresher.scheduleRefresh()
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - staleDate helper

  #if canImport(ActivityKit)
  /// Just after the next prayer instant, or nil when there is no valid future
  /// target (so we don't mark fresh content immediately stale).
  @available(iOS 16.1, *)
  private static func staleDate(
    for state: PrayerLiveActivityAttributes.ContentState
  ) -> Date? {
    let target = Date(timeIntervalSince1970: state.nextEpochSeconds)
    return target > Date() ? target.addingTimeInterval(60) : nil
  }
  #endif

  // MARK: - stop

  @objc
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Feature turned off — forget the cached content so `reassert()` won't
    // revive the card.
    Self.cachedStateJSON = nil
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      LiveActivityRefresher.cancelScheduledRefresh()
      Task {
        for activity in Activity<PrayerLiveActivityAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
        }
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - reassert
  //
  // Re-show the Live Activity if it was dismissed (swiped away / "Clear all")
  // while the feature is still enabled. Called from JS whenever the app comes
  // to the foreground. iOS does NOT allow apps to start a Live Activity from
  // the background or to prevent the user from dismissing one, so this is the
  // closest we can get to "always shown while enabled": it reappears every time
  // the app is opened. No-op when the feature is off (no cached content), when a
  // card is already showing, or when there's no remaining prayer today.
  @objc
  func reassert(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let json = Self.cachedStateJSON,
            let data = json.data(using: .utf8),
            var state = try? JSONDecoder().decode(
              PrayerLiveActivityAttributes.ContentState.self, from: data)
      else { resolve(nil); return }

      // Already showing → nothing to do.
      guard Activity<PrayerLiveActivityAttributes>.activities.isEmpty else {
        resolve(nil)
        return
      }

      // Re-point to the current next prayer so the revived card isn't stale.
      let now = Date()
      guard let next = LiveActivityRefresher.computeNext(state: state, now: now) else {
        // No remaining event today — let the foreground sync re-arm with
        // tomorrow's data instead of reviving a past countdown.
        resolve(nil)
        return
      }
      state.nextKey = next.key
      state.nextLabel = next.label
      state.nextTime = next.time
      state.nextEpochSeconds = next.epoch
      state.prevEpochSeconds = next.prevEpoch
      let stale = Date(timeIntervalSince1970: next.epoch + 60)
      do {
        let _ = try Activity<PrayerLiveActivityAttributes>.request(
          attributes: PrayerLiveActivityAttributes(),
          content: ActivityContent(state: state, staleDate: stale),
          pushType: nil
        )
        LiveActivityRefresher.scheduleRefresh()
      } catch {
        NSLog("[PrayerLiveActivity] reassert request failed: \(error.localizedDescription)")
      }
      resolve(nil)
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - isAvailable

  @objc
  func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
      return
    }
    #endif
    resolve(false)
  }
}

// MARK: - LiveActivityRefresher (BGTaskScheduler — local, no server)
//
// Advances the Live Activity's highlighted prayer while the app is
// backgrounded, with no push / no server. A BGAppRefreshTask recomputes the
// next prayer from the activity's OWN rows (each carries HH:MM + a localized
// name) and calls `Activity.update`. iOS runs these opportunistically (timing
// is best-effort), which is fine: the on-device countdown/progress views stay
// live regardless, and the foreground path covers the rest. Lives in this file
// (already in the main app target) so no new file / pbxproj entry is needed.
//
// Registration MUST happen before the app finishes launching — see
// AppDelegate.registerLiveActivityRefresh(). The identifier must also be listed
// under BGTaskSchedulerPermittedIdentifiers in Info.plist.

enum LiveActivityRefresher {
  static let taskIdentifier = "com.hassan.prayerapp.liveactivity.refresh"

  /// Register the BG task handler. Call once from AppDelegate before launch
  /// finishes. Safe to call when ActivityKit is unavailable (handler no-ops).
  static func registerTask() {
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: taskIdentifier,
      using: nil
    ) { task in
      guard let refresh = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }
      handle(refresh)
    }
  }

  /// Queue the next background refresh (no-op when no activity is running).
  /// earliestBeginDate is the next prayer instant when known, else +15 min.
  static func scheduleRefresh() {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard !Activity<PrayerLiveActivityAttributes>.activities.isEmpty else { return }
      let earliest = soonestNextPrayerDate() ?? Date().addingTimeInterval(15 * 60)
      let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
      request.earliestBeginDate = earliest
      do {
        try BGTaskScheduler.shared.submit(request)
      } catch {
        NSLog("[LiveActivityRefresher] submit failed: \(error.localizedDescription)")
      }
    }
    #endif
  }

  static func cancelScheduledRefresh() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
  }

  private static func handle(_ task: BGAppRefreshTask) {
    // Reschedule first so the chain continues even if the work below is cut off.
    scheduleRefresh()
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      let work = Task {
        await refreshRunningActivities()
        task.setTaskCompleted(success: true)
      }
      task.expirationHandler = { work.cancel() }
      return
    }
    #endif
    task.setTaskCompleted(success: true)
  }

  #if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private static func refreshRunningActivities() async {
    let now = Date()
    for activity in Activity<PrayerLiveActivityAttributes>.activities {
      let state = activity.content.state
      guard let next = computeNext(state: state, now: now) else { continue }
      // Nothing to do if the activity already points at the same future prayer.
      if next.key == state.nextKey && next.epoch == state.nextEpochSeconds { continue }
      var newState = state
      newState.nextKey = next.key
      newState.nextLabel = next.label
      newState.nextTime = next.time
      newState.nextEpochSeconds = next.epoch
      newState.prevEpochSeconds = next.prevEpoch
      let stale = Date(timeIntervalSince1970: next.epoch + 60)
      await activity.update(ActivityContent(state: newState, staleDate: stale))
    }
  }

  @available(iOS 16.2, *)
  private static func soonestNextPrayerDate() -> Date? {
    let now = Date()
    var soonest: Date?
    for activity in Activity<PrayerLiveActivityAttributes>.activities {
      if let n = computeNext(state: activity.content.state, now: now) {
        let d = Date(timeIntervalSince1970: n.epoch)
        if soonest == nil || d < soonest! { soonest = d }
      }
    }
    return soonest
  }

  fileprivate struct NextInfo {
    let key: String
    let label: String
    let time: String
    let epoch: Double
    let prevEpoch: Double
  }

  /// Next prayer (and previous, for the progress bar) computed from the
  /// activity's own rows by wall clock. Self-contained — needs no app data.
  /// Returns nil after the day's last event (the activity is short-lived and
  /// gets re-armed from the foreground next time the app opens).
  @available(iOS 16.1, *)
  fileprivate static func computeNext(
    state: PrayerLiveActivityAttributes.ContentState,
    now: Date
  ) -> NextInfo? {
    var rows = state.rows
    if let sun = state.sunriseRow {
      if rows.isEmpty { rows.append(sun) } else { rows.insert(sun, at: 1) }
    }
    let cal = Calendar.current
    var events: [(date: Date, row: PrayerLiveActivityAttributes.Row)] = []
    for row in rows {
      let parts = row.time.split(separator: ":")
      guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
            let d = cal.date(bySettingHour: h, minute: m, second: 0, of: now)
      else { continue }
      events.append((d, row))
    }
    guard !events.isEmpty else { return nil }
    events.sort { $0.date < $1.date }
    guard let next = events.first(where: { $0.date > now }) else { return nil }
    let prev = events.last(where: { $0.date <= now })
    let prevEpoch = (prev?.date ?? next.date.addingTimeInterval(-3600)).timeIntervalSince1970
    let label = next.row.name.isEmpty ? next.row.abbr : next.row.name
    return NextInfo(
      key: next.row.key,
      label: label,
      time: next.row.time,
      epoch: next.date.timeIntervalSince1970,
      prevEpoch: prevEpoch
    )
  }
  #endif
}
