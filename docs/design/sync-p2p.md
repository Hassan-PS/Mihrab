# Peer-to-peer sync — the options, and what they cost

Status: **design, nothing built.** Written 2026-08-23.

## Decisions taken

| | Chosen | |
|---|---|---|
| Transport | **Folder first, LAN direct second** | Both eventually; folder is what ships first |
| Confidentiality | **Per-device X25519 keypairs** | Private half never leaves its device |
| Pairing | **One code, two representations** | QR *and* text, either accepted, both always viewable and copyable |

The pairing decision is the one that changed the design, and for the better —
see §3. Because the code **is the device's public key**, it is not a secret:
it can sit on a screen permanently, be copied, screenshotted, pasted into a
message, and none of that weakens anything. A shared secret could not have
been treated that way, so the two decisions reinforce each other.

It also takes the camera off the critical path. Text is a first-class way in,
so the first release needs **no camera dependency and therefore no F-Droid
recipe MR at all**; QR scanning is an ergonomic upgrade that can land later
without changing the protocol.

## The good news first: two thirds of this already exists

`src/sync/` was written with this in mind and says so out loud:

> ONE FORMAT FOR TWO FEATURES. Exporting to a file and syncing to another
> phone are the same problem twice.

- **`snapshot.ts`** — the portable document, one per category the user picked.
  A category left out is *absent*, not empty, which is the difference between
  "don't touch my prayers" and "I have none."
- **`merge.ts`** — every rule is a union, a max, or a newest-wins on a
  timestamp the writer had already stored. That makes merging **commutative,
  idempotent and associative**.
- **`snapshotStore.ts` / `exportFile.ts`** — reading every store and writing
  the thing out.

Those three properties are the whole ballgame, and they are already paid for.
They mean sync needs **no server to arbitrate, no primary device, no vector
clocks, no agreement about whose clock is right, and no ordering guarantee
from the transport.** Three phones can sync in any pairing, in any order, as
often as they like, and land on the same record.

So what is missing is not "sync". It is **a way to hand a JSON document to
another device**, plus whatever protects it on the way.

## The framing to correct before anything else

> "The clear problem here is the encryption, so enabling this feature should
> either use a common key from each device, or not being encrypted at all"

The at-rest key is **not** the thing that has to move, and moving it would be
the one genuinely bad outcome here.

`snapshot.ts` already explains why: the journal, fasting, dhikr and sunnah
stores are encrypted with a key in the Android Keystore / iOS Keychain. That
key is device-bound *and that is the entire point of it*. A byte copy of the
ciphertext is worthless elsewhere, so the snapshot already carries decrypted
values — the export file on disk today is plain JSON.

A "common key across devices" would mean exporting a Keystore key into
something transportable. Then every device's at-rest protection is only as
strong as the weakest place that key has ever been, one compromised phone
compromises the record on all of them, and there is no way to revoke a device
short of re-keying everything. It buys nothing, because:

**The snapshot is already plaintext at the boundary. Confidentiality is the
transport's job, not storage's.** That is the seam, and it is already there.

So the real questions are three, in order:

1. **How does the document get from A to B?** (transport)
2. **What stops anyone else reading it on the way?** (confidentiality)
3. **How do two devices learn they are a pair?** (pairing)

---

## 1. Transport

### The constraints that actually bind

- **F-Droid.** Every native module needs a `scanignore` entry in the recipe,
  and since the merge the recipe lives in `fdroiddata` — changing it is a
  fresh MR and a review, not a commit. A **pure-JS dependency costs nothing**;
  a native one costs an MR and a reproducibility argument.
- **No Google Play Services**, so Nearby Connections is out.
- **Three platforms**: Android, iOS/iPad, and Mac Catalyst. A Mac in the mix
  makes anything file-shaped more attractive and anything BLE-shaped worse.
- **Today's dependency list has no networking server, no camera, no BLE and
  no crypto.** Everything below is measured from that starting line.

### A. Shared folder — the app writes and reads snapshots in a directory

Each device writes `mihrab-<deviceId>.json` into a folder the user picks, and
on open merges every *other* file it finds there. Whatever keeps that folder
in step — Syncthing, Nextcloud, iCloud Drive, a USB stick — is somebody
else's problem, already installed, already trusted with the user's files.

- **New dependencies: none.** `react-native-blob-util` already does file I/O;
  Android SAF and iOS security-scoped bookmarks are the only new native
  surface, and on Android a `ACTION_OPEN_DOCUMENT_TREE` intent covers it.
- Works when the two devices are **never awake at the same time**, which is
  the common case for a phone and a tablet.
- Works on Catalyst unchanged.
- Genuinely p2p **if the folder is Syncthing**; not p2p if it is iCloud. That
  distinction is the user's to make, and the screen should not pretend
  otherwise.
- Cost: the user must already have a sync tool. Nothing to configure if they
  do; a dead end if they don't.

### B. Direct over the local network

A shows a code, B connects to it over Wi-Fi, they exchange snapshots.

- Needs a **TCP/HTTP server on-device** — `react-native-tcp-socket` or a small
  native module. Native ⇒ an F-Droid recipe MR.
- Discovery: mDNS/NSD, or skip it and put `ip:port` in the pairing code.
- iOS 14+ needs `NSLocalNetworkUsageDescription` and declared
  `NSBonjourServices`, and shows a permission prompt.
- Both devices must be awake, on the same network, with the app open. Hotel
  and corporate Wi-Fi with client isolation will silently fail.
- This is the literal reading of "p2p" and needs no third-party tool. It is
  also the most new surface by a distance.

### C. QR chain, no network at all

Rejected as a data transport, kept as a *pairing* mechanism. A QR code holds
**2,953 bytes** at its absolute largest. A year of journal with notes is
hundreds of kilobytes, so this is an animated-QR-for-two-minutes design.
Fine for a 32-byte key. Not fine for a record.

### D. Bluetooth / BLE

Practical BLE throughput is single-digit KB/s, RN has no dependency for it,
Android's runtime permissions read as alarming, and iOS↔Android pairing is
where this kind of feature goes to die. **No.**

### E. Relay server, end-to-end encrypted

A ~100-line service: A `PUT`s ciphertext under a pairing id, B `GET`s it, the
server holds bytes it cannot read and drops them after a day.

- The only option that works **across different networks**, which is the case
  A and B both fail (phone on mobile data, tablet at home).
- Costs hosting, uptime, and a privacy claim to defend forever. It also earns
  a second `NonFreeNet`/`TetheredNet`-shaped conversation on F-Droid unless
  the server is published too.
- Worth keeping in the back pocket as an explicitly opt-in escape hatch, not
  as the first thing built.

---

## 2. Confidentiality

### Option 1 — nothing, and say so

Defensible only where the channel is already the user's own: a folder they
chose, on a tool they installed. It is what the export file does today, and
`exportFile.ts` is careful to state it rather than imply protection that is
not there.

It is **not** defensible for transport B: a plaintext record of someone's
worship crossing a café LAN is a different act of consent from a file they
deliberately placed in their own Nextcloud.

### Option 2 — one shared secret, established at pairing

A random 256-bit key generated on the first device, carried to the second by
QR or typed code, stored on both, used with AEAD from then on.

- Simple, offline, no PKI, easy to explain.
- One secret for the whole set: leak it once and every device is exposed, and
  there is no way to remove a single device without re-keying all of them.
- This is the "common key" from the question — but note it is a **transport**
  key, generated for this purpose, never the at-rest key.

### Option 3 — per-device keypairs *(recommended)*

Each device generates an X25519 keypair on first run and never exports the
private half. Pairing exchanges *public* keys. Every sync derives a fresh
shared secret and encrypts with it.

- Devices are individually revocable — forget one public key, that device is
  out, and nothing else has to change.
- Scales past two devices without a shared secret sitting in three places.
- The identity is stable, so a device can be *recognised* on later syncs
  rather than re-paired.
- **`tweetnacl` is pure JS**, MIT, audited (Cure53, 2017), ~30 KB, and gives
  exactly `box` = X25519 + XSalsa20-Poly1305. No native module, therefore **no
  F-Droid recipe change**. A few hundred kilobytes of JSON is well within what
  it can chew in JS.

This is Syncthing's model, and it is the right one for the same reasons.

---

## 3. Pairing — one code, two representations

**The code is the public key.** Not a pointer to it, not a session token: the
32 bytes themselves, rendered two ways, and the two are interchangeable.

```
  MHRB-7QK4-2WFN-XT9A-...        ← 52 chars, Crockford base32, grouped in 4
  ▐▀▀▐ ▄▀▐▌ ...                   ← the same 32 bytes, as a QR
```

Because it carries no secret, everything the answer asked for is safe:

- it **lives on a screen** in Settings → Sync, permanently, not behind a
  countdown or a one-time reveal
- it can be **copied to the clipboard**, screenshotted, AirDropped, sent in a
  message, read aloud over the phone
- **both paths are equal**: scan the QR, or paste the text. Neither is the
  "real" one and the fallback.

### Why this removes the man-in-the-middle problem rather than papering over it

Fingerprint confirmation exists because keys exchanged *over the channel* can
be substituted in flight. Here they are not exchanged over the channel at
all — they cross by the user's own hands, eyes and clipboard, out of band.
There is no flight to intercept.

A fingerprint is still worth showing, but for a different job: **recognising a
device you already paired.** Six digits under each entry in the paired list,
so "is this still my tablet?" has an answer a year later.

### Format

- **Alphabet: Crockford base32.** No `I`, `L`, `O` or `U`, and it decodes
  `0/O` and `1/I/L` interchangeably — so a code read off a screen and typed by
  hand survives the confusions people actually make.
- **52 characters** for 32 bytes, in 13 groups of four, with an `MHRB` prefix
  so a code pasted into a chat is recognisable as one.
- **A 2-character checksum** on the end, because the failure to design for is
  a user who mistypes one character and gets "pairing failed" with nothing to
  act on. A checksum turns that into "this code has a typo in it."
- **The QR carries the same string**, not a different encoding — so a device
  that scans and a device that pastes end up at exactly the same code path,
  and there is one thing to test rather than two.
- Rendering the QR needs no dependency: `react-native-svg` is already here and
  a pure-JS QR encoder is a few kilobytes. **Scanning** is the only part that
  wants a camera module, and it can come later.

---

## The plan

Folder transport, per-device keypairs, one code in two representations. Each
stage is useful on its own and none of them strands the next.

### Stage 1 — device identity

An X25519 keypair generated on first run, private half stored beside the
existing secure values and never exported. A stable device id and a
user-editable device name ("Hassan's tablet"), because a paired list of
fingerprints is not a list anyone can act on.

Ships invisibly. Nothing in the UI changes. No dependency beyond `tweetnacl`,
which is pure JS.

### Stage 2 — the code, and the trust list

`Settings → Sync`. This device's code, shown as text and as a QR, with a copy
button, permanently. A field to paste another device's code into. A list of
paired devices with names and fingerprints, and a way to remove one.

Still no transport — this stage is just "these devices know each other." It is
independently testable and it is where the pairing format earns its checksum.

### Stage 3 — folder sync *(the release where the feature exists)*

Pick a folder. On open and on demand: write `mihrab-<deviceId>.json.enc`,
read every *other* `.enc` in the folder, decrypt whichever were sealed for us,
merge, done. `merge.ts` already guarantees order does not matter and a repeat
costs nothing.

The envelope: an unencrypted header carrying sender id and format version,
then one sealed box **per paired recipient** so any of them can open it
without any of them sharing a key. Categories the user excluded are absent
from the snapshot, exactly as in the export file.

### Stage 4 — QR scanning

The camera. Purely ergonomic: same code, same parser, one fewer paste. This
is the first stage that needs a native module, and therefore the first that
needs an F-Droid recipe MR — which is precisely why it is fourth and not
first.

### Stage 5 — LAN direct

The second transport. Everything above it is reused unchanged: same identity,
same codes, same envelope, same merge. Only the delivery differs — a socket
instead of a folder — so this is additive rather than a rewrite.

### Stage 6 — relay

Only if the cross-network case turns out to matter in practice. Ciphertext
only, opt-in, and a separate conversation about F-Droid's `TetheredNet`.

## Deliberately out of scope

- **Deletions.** `merge.ts` already argues this: a bookmark removed on one
  phone comes back from the other, and that is the correct trade against
  tombstones and a rule for whose deletion wins. Sync must not reopen it.
- **Real-time.** The merge is idempotent; syncing on app open and on demand
  is enough. Anything live is cost with no benefit.
- **The at-rest key.** It stays on its device. Always.
