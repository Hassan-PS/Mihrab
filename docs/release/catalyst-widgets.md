# Widgets in the Homebrew (Mac Catalyst) build

The Homebrew cask ships a Mac Catalyst build signed with a Developer ID
certificate and notarized. As of 2026-08-07 that build also carries the
widget extension, so the prayer-times widget can be placed in Notification
Centre on macOS. This is the write-up of what it took, because almost none of
it fails in a way you would notice.

Build it with:

    SIGN_IDENTITY="Developer ID Application: Hassan El Ghamri (GAW23HT439)" \
      ./scripts/build-catalyst.sh

The Keychain half of the same build — the other restricted entitlement, the
provisioning profile it needs and the trap that costs a build — is in
`catalyst-keychain.md`.

## The four things that were wrong, in the order they were found

**1. The extension was not embedded at all.** `SUPPORTS_MACCATALYST = YES` on
the widget target is necessary but not sufficient: two `platformFilter = ios`
entries in the pbxproj (the embed build file and the target dependency) kept
it out of the Catalyst product. Both are now `platformFilters = (ios,
maccatalyst)`.

**2. The bundle identifier was rejected.** "Embedded binary's bundle
identifier is not prefixed with the parent app's" — the Catalyst app becomes
`maccatalyst.com.hassan.prayerapp`, so the extension has to follow.
`DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = YES` on the widget target does
that.

**3. `keychain-access-groups` made the app unlaunchable.** It is a restricted
entitlement: macOS honours it only if the bundle embeds a provisioning profile
that authorises it, and a Developer ID build signed outside Xcode has no
profile. AMFI then SIGKILLs the process before `main()`:

    maccatalyst.com.hassan.prayerapp: Unsatisfied entitlements: keychain-access-groups
    Restricted entitlements not validated, bailing out. Error … Code=-413
      "No matching profile found"
    AMFI: bailing out because of restricted entitlements.

It is gone from `Catalyst.entitlements`. The cost is that
react-native-encrypted-storage cannot reach a shared Keychain group on this
channel, so the journal, the fasting log and the coordinates fall back to
AsyncStorage — which is what they did before the app was signed at all, so
nothing regressed. Doing it properly means generating a Developer ID
provisioning profile for the Catalyst App ID with Keychain Sharing enabled and
embedding it as `Contents/embedded.provisionprofile` before signing.

**4. The extension has to be sandboxed.** macOS refuses to host an app
extension without `com.apple.security.app-sandbox`, and refuses it late:

    Failed to create extensionProcess … Code=16
      "Extension must have `com.apple.security.app-sandbox` entitlement."

Everything up to that point succeeds — the bundle installs, `pluginkit`
registers it, the widget appears in the gallery — and every timeline query
fails. Hence `ios/PrayerWidgetExtension/CatalystExtension.entitlements`,
separate from the app's, because the app must NOT be sandboxed and the
extension must be.

## The App Group name

Catalyst uses `GAW23HT439.group.com.prayerapp`; iOS keeps the plain
`group.com.prayerapp` it has always used. `MihrabAppGroup.h/.m` and
`PrayerWidgetExtension.swift` resolve this by the same rule so the writer and
the reader cannot drift apart.

Apple's guidance contradicts itself — DTS says Catalyst keeps the plain
identifier; macOS logs that group container identifiers must be prefixed by
the team ID — so the choice came from observation. With the plain name the
extension faulted on every read under chronod ("Container: (null)): accessing
preferences outside an application's container requires user-preference-read
or file-read-data sandbox access"). With the prefixed name it does not.

Being honest about the limits of that: a probe binary signed with the
extension's exact entitlements, plain group and all, reads the plain container
fine from a shell. So this is not the blanket "sandboxed processes need the
prefix" rule it appears to be; something narrower about ExtensionKit hosting
is involved and remains unexplained. The prefixed name is the one that has
never failed.

Two traps around the container, both of which cost time:

- `defaults read group.com.prayerapp` from a normal shell does NOT read the
  group container. It reads — and on write, CREATES —
  `~/Library/Preferences/group.com.prayerapp.plist`, which then masks the real
  container for every later read. Always address it by path:
  `defaults read "$HOME/Library/Group Containers/<group>/Library/Preferences/<group>"`.
- `initWithSuiteName:` / `UserDefaults(suiteName:)` returns a live-looking
  object for a group the process is not entitled to and silently drops every
  write. Non-nil proves nothing; round-tripping a value is the only test.

## What the build script now gates on

`scripts/build-catalyst.sh` fails the build rather than shipping a broken
bundle. After signing it asserts, against the SIGNED bundles (not the source
entitlement files):

- the extension carries `com.apple.security.app-sandbox`;
- the app and the extension name the same App Group.

Then it launches the app for real, because a signature that verifies is not a
bundle that runs — `codesign` verification and notarization both pass a bundle
AMFI will kill on sight. It requires the app to survive 15 seconds, and it
deletes `prayer_widget_payload_v1` from the group container beforehand and
requires the app to write it back with today's date.

## The one check that is still manual

None of the above proves the widget DRAWS. Place it — Notification Centre →
Edit Widgets → Mihrab — and look at it. If it shows prayer times, the whole
chain works. If it shows an empty card, the reader and the writer are looking
at different containers, and `MihrabAppGroup.m` is where to start.
