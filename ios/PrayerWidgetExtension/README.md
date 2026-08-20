# iOS extensions

Two of them, and which code lives in which is not arbitrary.

| Target | Bundle id | Min iOS | Ships |
|---|---|---|---|
| `PrayerWidgetExtension` | `com.hassan.prayerapp.PrayerWidgetExtension` | **17.0** | Home-screen + Lock-Screen-accessory widgets |
| `MihrabLiveActivity` | `com.hassan.prayerapp.MihrabLiveActivity` | **16.1** | Live Activity (Lock Screen + Dynamic Island) |

## Why they are split, and why this way round

The widgets want iOS 17 so an interactive control can be a real
`Button(intent:)` rather than a tap that opens the app. The Live Activity has
to keep reaching 16.1, where the Dynamic Island lives. One target cannot hold
two deployment targets, so one of them had to move to a new bundle.

**It had to be the Live Activity that moved.** WidgetKit ties a widget the
user has *placed* to the extension bundle that vends it. Move the widgets to a
new bundle identifier and every Mihrab widget already sitting on someone's
home screen becomes a dead placeholder they have to notice, delete and re-add.
Nobody places a Live Activity by hand — the app requests one per prayer and it
ends hours later — so moving that half costs nothing at all.

**Do not rename `PrayerWidgetExtension` or change its bundle id.** That is the
whole point of the arrangement above.

The consequence that remains, and it is deliberate: home-screen widgets now
require iOS 17. iOS 16 users keep the app and keep Live Activities.

## Mac Catalyst

`MihrabLiveActivity` is excluded from the Catalyst build
(`SUPPORTS_MACCATALYST = NO`, and the app target's dependency on it is
`ios`-filtered). A Mac has no Lock Screen and no Dynamic Island, so
`PrayerLiveActivityWidget` is compiled out there anyway — and a WidgetKit
extension whose bundle declares no widgets is not worth shipping. The Homebrew
app embeds `PrayerWidgetExtension.appex` only.

`PrayerLiveActivityAttributes.swift` is a member of BOTH the app target and
`MihrabLiveActivity`: the app drives ActivityKit from
`PrayerApp/PrayerLiveActivity.swift`, the extension renders it, and the two
must see the same type identity.

## App Group

Both extensions read `group.com.prayerapp` (Team-ID-prefixed on Catalyst — see
`MihrabAppGroup.m`, which carries the evidence for why). The app writes the
payload and reloads timelines via `PrayerApp/PrayerWidget.m`.

Android needs no extra steps: add the **Mihrab** widget from the system widget
picker after installing the app.
