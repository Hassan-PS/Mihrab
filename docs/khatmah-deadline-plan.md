# The deadline khatmah — plan (issue #53)

A plan is created today as **"finish in N days"**. The issue asks for the
other half: **"finish by \<date\>"**, re-pacing itself when days are
missed, because the reporter — correctly — does not want to remember which
days he missed in order to press a button about them.

The overflow marker, the second half of #53, shipped in 2.24.0. This is
the rest.

**Decided with Hassan, 2026-09-20:** the pace **re-spreads** (what is left
over the days that remain, re-cut daily), and a deadline is **editable on a
live plan** — which is also the re-pace action, and the only sane answer to
a deadline that has passed.

## Is it feasible

Yes, and more cheaply than it looks, because of one property of the
existing code: **every portion calculation goes through `planDays(plan)`
and `portionEnd(days, day, from)`.** Fourteen exported functions — the
card, the pill, the widget, the reminder, the gap report — read the cut
through those two. A second way of cutting the book reaches all of them
without touching a single call site.

What it costs is not plumbing but a rule. The code states in three places,
emphatically, that **the day number is the reader's, derived from the
portion they have reached, never from midnights elapsed**
(`quranState.ts` khatmahDaysLeft, `quranCardState.ts`). That rule is right
for a duration plan and wrong for a deadline plan, where the day number is
exactly the calendar's. The new mode has to say so out loud, or someone
will "fix" it back in six months.

## What a deadline plan is

| | duration plan (today) | deadline plan (new) |
|---|---|---|
| stored | `targetDays` | `deadline` (a date) |
| the cut | book ÷ N, fixed forever | what is LEFT ÷ days that remain, re-cut daily |
| day number | which portion you are in | which calendar day it is |
| days left | portions remaining | days to the deadline |
| missing a day | nothing changes | tomorrow's portion grows |
| existing plans | unchanged | — |

Everything already shipped keeps its meaning. A duration plan is not
re-paced, not re-labelled, and not migrated.

## The pacing rule

At the start of each day, for a plan with a deadline:

```
U = ayahs still unread (holes behind the reader included)
D = day-keys from today to the deadline, inclusive   (min 1)
quota = ceil(U / D)              ← in Ḥafṣ pages, cut like portionEnd
today's portion = [reach + 1 ... reach + quota]
```

Recomputed **once per day**, not continuously. Continuously is a trap: read
`r` ayahs and the remainder falls to `U - r`, so the quota falls to
`(U-r)/D`, and the day recedes as you walk towards it. The portion has to
be pinned when the day opens.

**Where the pin lives.** `dayStartAyahsRead` already pins "where this
device stood when the day began" — but it is deliberately per-device and
does not sync (see `docs/sync-conflict-rules.md`), so two devices that
first opened the app at different times today would compute different
quotas for the same day. A deadline plan therefore stores its own cut:

```ts
pace?: {
  day: string;    // the day-key this cut belongs to
  from: number;   // the ayah the day opened at
  quota: number;  // ayahs due that day
}
```

written on the first interaction of a new day (exactly where
`withDaySnapshot` is written today), and merged **atomically**: the later
`day` wins; the same `day` keeps the smaller `from` — the earliest opening
of that day, which both devices can agree on without a clock.

**Why not a fixed cumulative schedule** (`by end of day k you should be at
k/N of the book`), which needs no pin and no new synced field: it makes
the whole deficit due today. Miss five days of a thirty-day plan and the
app asks for six days of reading before midnight. That is a number nobody
acts on, and the issue asks for the pace to be *recalculated*, not for the
debt to be called in.

## The escape hatch, which is not optional

An automatically growing quota has a failure mode this app should not
ship: miss days, the quota grows, the growth makes it likelier to miss
more, and the plan quietly becomes a thing the reader avoids opening.

So when the required pace rises **far above what the reader has actually
been reading** (say, above their best day of the last fortnight), the card
offers — once, quietly, never as a modal and never with a number of days
missed attached — *"finishing by 30 Sep now needs 34 pages a day. Move the
date?"* One tap opens the date picker with a suggested date at their real
pace. Declining changes nothing; the plan stays exactly as it is.

A deadline that has already passed is the same idea at its limit: the card
says the date has passed and how much is left, and offers a new date. It
never abandons the plan, and it does not count the days.

## Day boundaries — settle these first

The audit found three different notions of "a day" in the khatmah code:

1. `khatmahDay` and the day snapshot use the store's day key, which is the
   **Islamic** day when the reader has opted into it (`islamicDayKey`).
2. `khatmahDayWhen` — which renders *"finish day 9 (tomorrow)"* — uses
   **civil midnight**, so after maghrib it can call a day "tomorrow" that
   the store already calls today.
3. `khatmahBehindBy` uses **neither**: a rolling 24 h from the moment the
   plan was created, so a plan started at 23:00 rolls over at 23:00.

A deadline plan makes all three load-bearing — days-left is the headline
number. Fix them before building on them: one day-key function, the
store's, everywhere; `khatmahBehindBy` counting day-keys rather than
floor-divided milliseconds. This is small, and it is also the other half
of the bug the issue reports ("18 days remaining on 16 September for a
30 September target").

## The work, in order

**Phase 0 — one notion of a day** (small)
`khatmahDayWhen` and `khatmahBehindBy` move onto the store's day key.
Existing tests pin the duration behaviour; they must stay green untouched.

**Phase 1 — the model** (the bulk)
- `KhatmahPlan` gains `deadline?: string`, `pacedAt?: number` (a stamp,
  because unlike `targetDays` a deadline is editable — same pattern as
  `positionAt`), and `pace?`.
- New `src/quran/khatmahPace.ts` — the cut, in one place, two modes:
  `planTotalDays`, `dayNumber(plan, now)`, `daysLeft(plan, now)`,
  `portionFor(plan, day, now)`, `dayOfAyah(plan, ayah, now)`,
  `requiredPerDay(plan, now)`, `paceFor(plan, now)`, `withPace(plan, now)`.
- `quranState.ts` delegates `planDays`, `khatmahPortion`,
  `khatmahPortionOf`, `khatmahCurrentPortion`, `khatmahDay`,
  `khatmahDaysLeft`, `khatmahBehindBy` to it. Duration answers must be
  **byte-identical** to today's — that is what the existing suite is for.
- Writers: `startKhatmah` takes a mode; `setKhatmahDeadline(date)` works on
  a live plan (this is also the "re-pace" action, for free);
  `coerceKhatmah` validates and defaults.

**Phase 2 — sync** (small, and the pattern is fresh)
Merge rules for `deadline` (newest `pacedAt` wins) and `pace` (atomic,
later day, then smaller `from`); coercion; a row in
`docs/sync-conflict-rules.md`; tests beside the ones in
`__tests__/syncRemovalsTravel.test.ts`.

**Phase 3 — the surfaces**
- Creation: two chips — *30 / 60 / 90 days* as now, and **by a date** with
  presets that matter here (end of this month, before Ramadan — both are
  already computable: `getNextRamadanStart`) plus a small month grid. No
  new dependency; the app has no date picker and does not need one for
  this.
- Card: days-left from the calendar, *"N pages a day to finish by 30 Sep"*,
  the quota-jumped line, the passed-deadline line, the move-the-date offer.
- Day pill, widget block, reminder body: these read `khatmahPages` and
  `khatmahDay`, so they follow for free — but their COPY needs a pass, and
  the widget carries `targetDays`, which is derived in the new mode.

**Phase 4 — the rest**
Strings in thirteen locales (~8 keys), the changelog entry, and a reply on
the issue.

## Tests this needs

- The duration suite, unchanged and green — the proof that nothing moved.
- A deadline plan's quota across a missed day, two missed days, a day read
  twice over, and a deadline moved forwards and backwards.
- The Zeno case: reading inside a day never moves the day's own target.
- Two devices, one day, different opening times: same quota on both.
- A deadline in the past: a number, not a panic; no auto-abandon.
- Day-boundary: a plan whose day rolls at maghrib agrees with the pill.

## Follow-on: switching between the two, mid-khatmah

Shipped after the phases below, and it is what makes the mode a choice
rather than a fork in the road: `setKhatmahDeadline` and
`setKhatmahDuration` move a live plan either way, at any point, with the
reading untouched. Three things it had to get right.

- **A length is solved for, not assigned.** `targetDays` is the plan's
  whole length and the reader's day number follows their reading, so "ten
  more days" from two thirds of the way through is not `targetDays = 10`;
  `khatmahDurationForDaysLeft` searches for the length that leaves exactly
  the days asked for, and caps at a page a day, which is as slow as the
  model goes.
- **The schedule starts at the decision.** `pacedFrom` records the page
  the reader was on and `pacedDay` the store's own day (maghrib-aware —
  people re-pace at ten in the evening, when the khatmah is already on
  tomorrow), and `khatmahBehindBy`, `khatmahPaceOutgrown` and
  `khatmahDayAnchor` all measure from there — otherwise re-pacing would
  report three hundred pages of debt against a plan abandoned one second
  earlier, the card would offer a way out of a date just chosen, and
  tomorrow's portion would read "today". Restarting the khatmah
  re-stamps the pair from the plan's start.
- **The pair travels as one dated decision.** See the pacing row in
  `sync-conflict-rules.md`.

## What this does not do

- It does not shorten or lengthen a plan by itself; every change of pace
  is something the reader did, in the sheet.
- It does not re-pace a duration plan on its own. Nothing existing changes
  meaning.
- It does not shorten a deadline on its own, ever.
- It does not count missed days at the reader. The number that moves is
  the pace, and the only sentence about the past is the one offering a new
  date.
