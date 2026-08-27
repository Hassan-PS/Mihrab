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

## Every widget blank on the Mac, including the gallery (2026-08-26)

**Symptom.** All six widgets on macOS render empty — in Notification Centre,
on the desktop, and in the "Edit Widgets" gallery. Resizing one blanks it
again. iPhone and iPad are unaffected. The app itself is fine.

**What it is not.** Everything you would reasonably check comes back clean,
which is what makes this expensive to diagnose:

- the appex has `app-sandbox` and the prefixed App Group
- the group container holds a current payload with a live `days[]`
- `pluginkit` lists the extension against `com.apple.widgetkit-extension`
- app and appex are both `MACCATALYST`, both universal
- no crash reports, no AMFI kills
- every widget view has a `default:` family branch, so no size renders nothing

**What it is.** Two copies of Mihrab.app have existed on the machine, and
LaunchServices is still pointing at the one that is gone. chronod launches
the extension from the stale path, the extension returns a good timeline —
the log even says `Request ended … success` — and then the archive is
rejected on validation:

```
reload: failed with error WidgetKit.WidgetArchiver.ValidationError.bundleStubNotSupported(
  underlyingError: SimpleError.message("Bundle version did not match; LaunchServices DB may need to be rebuilt"))
```

Gallery previews are archived timelines too, which is why even they are
blank, and why "most widgets are broken" is really "all of them are".

**How the machine gets there.** On a developer's Mac, `build-catalyst.sh`
smoke-launches the app from `ios/build/catalyst-dist/` on every build; that
copy is then zipped, deleted or overwritten. The script now unregisters it
(`lsregister -u`) as its last step, so this should stop happening. On a
user's Mac the same state arrives by an ordinary route: unzip the release,
run it once from Downloads, drag it to Applications, delete the download.

**Diagnosis, in one command.** This is the fastest way from "widgets are
blank" to the actual reason:

```sh
log show --last 30m --info --debug --style compact \
  --predicate 'process == "chronod"' \
  | grep -i prayerapp | grep -iE "reload: (begin|failed)|bundleStub|Reload (fail|succ)"
```

`Reload success` means the widget host is happy and the problem is elsewhere.
`bundleStubNotSupported` means this.

Confirm the stale bundle directly:

```sh
pgrep -fl PrayerWidgetExtension   # is it running from a path you deleted?
```

**Repair.** Surgical, in this order — no full database rebuild needed:

```sh
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
pkill -f "PrayerWidgetExtension"          # drop the stale extension process
"$LSR" -u /path/to/the/old/Mihrab.app     # and any copy in ~/.Trash
"$LSR" -f /Applications/Mihrab.app        # re-register the real one
killall chronod                           # it comes straight back
open -g /Applications/Mihrab.app          # gives the widgets something to reload
```

Then re-run the `log show` above: every widget should report `Reload success`.

**Do not `lsregister -u` an `.appex` path.** `-u` takes a path, but the
record it drops is keyed by bundle identifier — and every copy of the widget
extension, build product and installed app alike, carries the same one.
Unregistering the build tree's `.appex` on 2026-08-27 took the INSTALLED
app's plugin registration with it: `pluginkit -m -i
maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension` returned nothing at
all, which is the same blank widgets, reached from the opposite direction.
Unregister the `.app`; the plugin inside it goes with it. `build-catalyst.sh`
now also re-runs `lsregister -f /Applications/Mihrab.app` afterwards, which
is the repair above and costs nothing when it was not needed.

The authoritative check is by identifier, not `pluginkit -mA | grep`:

```sh
pluginkit -m -i maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension -v
```

It should print one line, at the version you expect, with the path under
`/Applications`. `-mA` does not reliably list it and is not evidence either
way — it was `-mA` coming up empty that made the breakage above look worse
than it was, and then look fixed before it was checked properly.

## No widget in the gallery at all (2026-08-27)

Different symptom, different cause, and the one that actually shipped.
`bundleStubNotSupported` above is widgets that appear and go blank. This is
Mihrab not being offered in the widget gallery in the first place, no
extension process ever starting, and the App Group payload frozen at
whatever the last good build wrote.

One command settles it:

```sh
codesign -dv /Applications/Mihrab.app 2>&1 | grep -E "flags|TeamIdentifier"
#   flags=0x2(adhoc)          ← this
#   TeamIdentifier=not set    ← and this
```

An ad-hoc signature has no team identifier, and `codesign` cannot scope an
App Group to a team that does not exist — so it **drops every entitlement
and reports success**. `codesign --verify --strict` passes. Notarization is
not involved. The app simply has no App Group, cannot host its WidgetKit
extension, and cannot read Keychain items a Developer ID-signed build
created — so it silently generates a new sync identity too, orphaning the
old device's file in the shared folder. Three unrelated-looking failures,
one missing environment variable.

`build-catalyst.sh` used to default to `SIGN_IDENTITY=-`, and the App Group
gate that would have caught it was written `if [ "$SIGN_IDENTITY" != "-" ]`
— a check that switches itself off in precisely the case that needs it.
2.11.0 shipped to macOS that way. The script now finds a Developer ID
identity itself, fails if there is none, requires `SIGN_IDENTITY=-` to be
asked for by name, and asserts `TeamIdentifier` on the signed bundle before
any of the other checks.

**Repair:** rebuild signed and replace the bundle. Then confirm all three:

```sh
codesign -dv /Applications/Mihrab.app 2>&1 | grep TeamIdentifier   # = GAW23HT439
pluginkit -m -i maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension -v
defaults read "$HOME/Library/Group Containers/GAW23HT439.group.com.prayerapp/\
Library/Preferences/GAW23HT439.group.com.prayerapp" prayer_widget_payload_v1 \
  | head -c 40            # dayLabel must be TODAY
```

**Why iOS and iPadOS cannot hit it.** There is no LaunchServices, and an
installed app exists at exactly one path — there is no second copy for a
registration to point at, and no way for a user to run one from elsewhere.
This is a macOS-only failure by construction.
