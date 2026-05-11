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

      // If there are already running activities, update them in place.
      // Do NOT stop-then-restart: that pattern races when called concurrently
      // and causes the card to flash off the lock screen.
      let existing = Activity<PrayerLiveActivityAttributes>.activities

      if !existing.isEmpty {
        Task {
          // Update all running activities with fresh state.
          for act in existing {
            await act.update(using: state)
          }
          self.queue.sync { self.isStarting = false }
          resolve(nil)
        }
        return
      }

      // No existing activity — request a fresh one.
      do {
        let _ = try Activity<PrayerLiveActivityAttributes>.request(
          attributes: PrayerLiveActivityAttributes(),
          contentState: state,
          pushType: nil
        )
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
      Task {
        for activity in Activity<PrayerLiveActivityAttributes>.activities {
          await activity.update(using: state)
        }
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - stop

  @objc
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
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
