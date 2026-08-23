# The Keychain in the Homebrew (Mac Catalyst) build

The Homebrew build could not use the Keychain at all until 2026-08-24. This
is what was wrong, why it was invisible, and what the fix needs from you.

Companion to `catalyst-widgets.md`, which covers the App Group. Same build,
same script, a different restricted entitlement.

## What was broken

`keychain-access-groups` is a **restricted** entitlement. macOS validates it
against a provisioning profile embedded in the bundle, and an app that claims
one without a profile is not denied the Keychain — it is **SIGKILLed before
`main()`**. Exit 137, empty stderr, nothing useful in the log.

So `ios/PrayerApp/Catalyst.entitlements` deliberately did not claim it, and
that file's comment says so at length. The Homebrew build ran with no
Keychain group, which meant `react-native-encrypted-storage` failed on every
call.

The part nobody had checked: **what happened to the data instead.**

- `src/settings/secureStorage.ts` has its own plaintext fallback, so the
  coordinates survived. `prayerapp.location.fallback.v1` in that build's
  AsyncStorage is how this whole thing got found.
- `src/storage/durableWrite.ts` — which the journal, the fasting log, the
  dhikr counts and the sync identity all go through — had **no fallback**. It
  retried three times and threw.

So on macOS a logged prayer had nowhere to go, and sync could not start at
all, because `getDeviceIdentity()` rejected before it could generate one.
`Catalyst.entitlements` claimed all three fell back to AsyncStorage. Only one
did.

`durableWrite.ts` has a fallback now. It is honestly worse than a Keychain —
plaintext, in the app's own directory — and `encryptedStoreDegraded()` exists
so a screen can say so. It is there so that a build without a profile loses
nothing; it is not a reason to skip the profile.

## What the fix needs from you

One file, and the build script does the rest:

    ios/PrayerApp/embedded.provisionprofile

**Gitignored on purpose.** It carries no private key — it is a CMS-signed
plist of public certificates and entitlements — but this repository is
public, nobody else can sign with your identity anyway, and a signing asset
in a public tree is clutter that invites questions. Regenerating it takes
about three minutes, and the steps below are exact.

### Generating it

1. developer.apple.com → Certificates, Identifiers & Profiles → **Profiles**
   → **+**.
2. Under **Distribution**, choose **Developer ID**. Continue.
3. Profile Type: **Mac Catalyst** (not Mac).
4. App ID: **XC com hassan prayerapp (GAW23HT439.com.hassan.prayerapp)** —
   the *iOS* identifier. Apple derives the `maccatalyst.` prefix itself; the
   page says so in grey text above the field. Do not go looking for a
   `maccatalyst.…` entry to select.
5. Certificate: **Developer ID Application: Hassan El Ghamri (GAW23HT439)**.
6. Name it something that says what it is — `Mihrab Mac Catalyst Developer
   ID` — so it is not confused with the development profile Xcode makes.
7. Download, and save it to the path above.

### Things that look like problems and are not

**"An App ID with Identifier 'maccatalyst.com.hassan.prayerapp' is not
available."** It exists already. Xcode registered it on 2026-08-02, when it
made its own Catalyst profile. You do not register anything; step 4 above is
the whole of it.

**There is no Keychain Sharing capability to enable.** It is not in the
portal's capability list, because the allowed group is derived from the App
ID: the profile grants `keychain-access-groups` as `GAW23HT439.*`, which
already covers `GAW23HT439.maccatalyst.com.hassan.prayerapp`.

**Developer ID profiles are long-lived.** The 2026 one expires in 2044.
Nothing to plan around.

### The trap that cost a build

Xcode leaves a perfectly good Mac Catalyst profile in
`~/Library/Developer/Xcode/UserData/Provisioning Profiles/`. Right App ID,
right Keychain wildcard, right app group. It is a **development** profile,
carrying the *Apple Development* certificate.

AMFI checks that the certificate you sign with is among the profile's
`DeveloperCertificates`, and kills the app when it is not — the same silent
SIGKILL as claiming the entitlement with no profile at all, from an entirely
different cause. `codesign --verify` passes either way.

`build-catalyst.sh` now walks the profile's certificates before signing and
refuses, by name, when the signing identity is not among them.

Telling the two apart:

    security cms -D -i <profile> > /tmp/p.plist
    plutil -p /tmp/p.plist | grep -E 'application-identifier|get-task-allow'

A distribution profile has `get-task-allow => false`, no `ProvisionedDevices`,
and `application-identifier => GAW23HT439.maccatalyst.com.hassan.prayerapp`.
A development one has `get-task-allow => true` and a device list.

## What the script does with it

With the profile present and a real `SIGN_IDENTITY`, `build-catalyst.sh`:

1. checks the profile names the signing certificate, and stops if not;
2. copies it to `Contents/embedded.provisionprofile` **before** `codesign`,
   because codesign seals it and a profile added afterwards invalidates the
   signature;
3. signs against `ios/PrayerApp/Catalyst-keychain.entitlements` instead of
   `Catalyst.entitlements`;
4. asserts afterwards that the Keychain group really sealed in;
5. smoke-launches the app, which is the only check that catches an AMFI
   rejection.

With no profile it says so in plain words and signs exactly as before, so a
build never silently loses its Keychain.

## Still open

The app group is spelled `GAW23HT439.group.com.prayerapp` in our entitlements
and `group.com.prayerapp` in the profile. macOS reads them as the same group
and the prefixed form is the one arrived at by experiment (see
`catalyst-widgets.md`), so it stays. If a build ever refuses to launch, that
difference is the first thing to try changing.
