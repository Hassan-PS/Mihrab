// The Live Activity's own extension.
//
// WHY IT IS SEPARATE, AND WHY THIS HALF IS THE ONE THAT MOVED.
//
// The home-screen widgets need iOS 17 so their buttons can be real buttons
// (`Button(intent:)`) instead of taps that open the app. The Live Activity
// needs to keep working on 16.1, where the Dynamic Island lives. One target
// cannot have two deployment targets, so something had to move out.
//
// It had to be THIS half. WidgetKit ties a widget a user has placed to the
// extension bundle that vends it: move `PrayerTimesWidget` to a new bundle
// identifier and every widget already sitting on someone's home screen turns
// into a dead placeholder they have to notice, delete and re-add. Nobody
// places a Live Activity — the app requests it, per prayer, and it ends
// hours later — so moving it costs exactly nothing. The plan originally had
// this the other way round.
//
// The consequence that remains: home-screen widgets now require iOS 17.
// Live Activities still reach 16.1, which is this target's whole job.
//
// NOT BUILT FOR MAC CATALYST. A Mac has no Lock Screen and no Dynamic
// Island, so `PrayerLiveActivityWidget` is compiled out there — and a
// WidgetKit extension whose bundle declares no widgets is not a thing worth
// shipping. The target is excluded from the Catalyst build instead, and the
// Homebrew app simply has one fewer appex.

import SwiftUI
import WidgetKit

@main
struct MihrabLiveActivityBundle: WidgetBundle {
  @WidgetBundleBuilder
  var body: some Widget {
    // ActivityKit is 16.1+, and this target deploys to exactly that — so the
    // availability check is a formality rather than the load-bearing guard it
    // was when this lived alongside a 16.0 widget.
    if #available(iOSApplicationExtension 16.1, *) {
      PrayerLiveActivityWidget()
    }
  }
}
