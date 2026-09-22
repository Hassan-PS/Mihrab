# What sync does with a disagreement

Every device holds the whole record and no server arbitrates, so the merge
has to be an algebra: **commutative, idempotent, associative**. Two devices
that have met converge whatever order they met in, and a snapshot merged
with itself is itself. `src/sync/merge.ts` is the whole of it.

That shape has one blind spot, and this file exists because the project has
now walked into it five times.

## The blind spot: an absence loses

A union only grows and a max only rises. Neither can express **"this is
gone"** — a deleted row is simply absent from the snapshot, and absent is
indistinguishable from *not made yet*. So the device that still holds the
row wins by default, and the removal undoes itself on the next round.

Every occurrence, and what fixed it:

| Reported as | Where | The dated fact that fixed it |
|---|---|---|
| "removing a device un-removes itself within two minutes" | peers | `removedPeers.ts` — `{pk, at}`, 90-day TTL |
| a cleared sunnah day came back | sunnah | an emptied day kept, with its `at` |
| a cleared prayer came back | journal | `status: 'cleared'` — a clear is a WRITE |
| an abandoned khatmah came back | khatmah plan | `abandonedAt` tombstone |
| an un-marked page came back | khatmah pages | `AyahMark` — dated claims replayed over the union |
| **a khatmah pin came back, and dragged progress back to it** | khatmah pin | `positionAt` |
| **a deleted bookmark came back** | bookmarks | `bookmarksRemoved` |
| **an un-starred ayah came back** | stars | `starsRemoved` + `starsAt` |
| **a deleted fast came back** | fasting | `FastEntry.cleared` |

The rule, stated once: **anything a reader can take away has to be able to
say so, with a date on it.** A removal is a write.

## The second blind spot: an undated fact loses to a dated one

`done` — which ayahs a khatmah has read — merges by union and carries no
times. The un-marks beside it carry times. So a stretch un-marked on the
phone on Monday and *read* on the Mac on Tuesday merged as Monday's denial
replayed over Tuesday's reading: the progress fell back to the first gap,
every round, until the claim aged out at ninety days. Two facts can only be
ordered if both are dated, so **reading is a dated claim now too**
(`recordKhatmahProgress`), and the log stays small because `compactMarks`
resolves it into the verdicts it amounts to instead of appending for ever.

Neighbouring claims that agree are joined at the **earlier** time, never the
later one: joining at the later time would let a page turn made today
re-assert ground claimed days ago and quietly undo another device's un-mark
— the first blind spot, arriving through the compaction.

But never **down past an un-mark the reading overrode** (2026-09-22). A
"continue from here" pin is two claims — read before it at *T*, unread
after it at *T+1* — and reading on from the pin is a claim at *T+2* that
beats the denial. Joined to the pin's reading at *T*, the whole run
carried *T*, and the peer that still held the pin's denial at its full
width replayed it on top: twenty pages read on the phone, undone on both
devices after every round. So a read keeps its own time when a denial
dated between it and its neighbour overlaps it, and — because the trimmed
denial was the only record that one had ever stood there — **reading
never cuts an un-mark**; only a later un-mark does. The log is the same
size for it: denials are made by hand, and there are never many. The test
that walks both devices through it is `syncTwoDeviceProgress.test.ts`.

## The third: a field nobody decided

`mergeKhatmah` built its result with `{...mine, ...incoming}` and then
reconciled the fields it had thought about. Everything else took the
incoming side's value unconditionally — which is not commutative, and which
handed `dayStartDate` and the two numbers beside it to whichever device
happened to be read second. A phone that had not been opened for a week
reset the Mac's "today" to last week's baseline.

Day-start state is **per-device** and never travels. `fromPage` is set once
and never edited, so it is merged by a rule that reads the same on both
devices (min) rather than by spread order. `targetDays` used to be in that
sentence too; it is edited now (a khatmah can be re-paced mid-way, in
either direction), so it travels with the date as one dated decision —
see the pacing row below.

## The table

| Kind | Rule | Can a removal travel? |
|---|---|---|
| prayers (journal) | LWW per `(date, prayer)` on `loggedAt` | yes — `status: 'cleared'` |
| fasting | LWW per `(date, type)` on `loggedAt`; a clear wins a tie | yes — `cleared`, 90-day TTL |
| dhikr (tasbih) | `Math.max` per day | **no** — see below |
| sunnah | whole-day LWW on `at`; per-field max for undated days | yes — dated empty day, 90-day TTL |
| quran · bookmarks | LWW by id on `updatedAt ?? createdAt` | yes — `bookmarksRemoved`, 90-day TTL |
| quran · stars | union, minus removals newer than the star | yes — `starsRemoved` + `starsAt` |
| quran · lastRead | whole-object LWW on `updatedAt` | n/a — one value |
| quran · prefs | whole-object LWW on `prefsUpdatedAt` | n/a — one value |
| quran · khatmah plans | per-id; union of `done`, dated claims replayed over it | yes — `abandonedAt`, `AyahMark`, `positionAt` |
| quran · khatmah pacing (`targetDays` + `deadline` + `pacedDay` + `pacedFrom`) | newest `pacedAt` wins and takes the whole set; equal stamps → a duration wins, then the later date, then the longer length | yes — the stamp survives the date, so "no deadline" travels |
| quran · khatmah day cut (`pace`) | goes with the date it was cut for; between two cuts for the same date, later `day` wins and within a day the EARLIEST cut (smallest `from`) | n/a — one value, replaced daily |
| settings, location | incoming wins per top-level field | **no** — see below |

### Two left as they are, on purpose

**Dhikr counts** merge with `Math.max` per day, so a count can never be
*lowered* across devices. Summing would double every day on every re-sync
(the idempotence the cycle rests on), and a per-day dated claim would make
a tap counter carry a log. Somebody who over-counts a day can still correct
it on the device they over-counted it on; what they cannot do is correct it
on a second device and have the lower number win. That is a real limitation
and a cheap one: the failure is a number that is too high, not a record
that disappears.

**Settings and location** have no timestamps anywhere in the store, so
there is nothing honest to compare and the incoming device's fields win.
Unlike the record, a preference is not a fact about the past that can be
lost — and a field the snapshot does not mention is left alone, so an older
build cannot erase a setting it has never heard of. If a stale device ever
starts talking over newer settings in practice, the fix is the one
`prefsUpdatedAt` already demonstrates: give the blob a write time.

### Why the pacing is one row and not three

`targetDays` and `deadline` are two ways of saying the same thing — "in
thirty days" and "by the 30th" — and the reader switches between them
mid-khatmah. Settled separately, "in 14 days" from the phone and "by 3
October" from the Mac merge into a plan that is neither: the phone's
length with the Mac's date, which nobody chose and which the card would
then report as a date. So the pair is picked from ONE side, with
`pacedFrom` and `pacedDay` (where the reader stood and which day the
store was on when the decision was taken — what the schedule is measured
from) coming along with it, and with today's cut when the two sides had
cut it for different dates: a cut is "what is left over the days that
remain", so it belongs to the date it was made for.

### Why the day's cut is synced and the day's baseline is not

They look like the same kind of thing and they are not. `dayStartDate` and
the numbers beside it answer *"how much has happened since MY day began"* —
a fact about one device's morning, which is why they stay local. A deadline
plan's `pace` answers *"how much is due today"*, which is a fact about the
PLAN: two devices that disagree about it show the reader two different
quotas for the same day. So the cut travels, and within a day the earliest
one wins — the first device to open the day pinned it, and a later device
must not re-cut it against reading that has happened since, or today's
portion would shrink as it was read.

## If you add a field to a synced blob

1. Can the user remove it, or lower it? If so it needs a **date**, and the
   merge has to read that date — `absent` will not do.
2. Does the merge decide it explicitly, or is it riding on a spread? Write
   the rule down; a field nobody decided is a field that depends on which
   device asked.
3. Add it to the table above, and to `__tests__/syncRemovalsTravel.test.ts`
   if it can be taken away.
