# Release log

What each release cost to cut, and what it taught the cycle.

Written by `scripts/release.sh` — the facts automatically, the **Lesson**
line by hand. A release that changed the cycle, or that had to be aborted
and restarted, leaves that line as `_(unfilled)_`, and **the next release
refuses to start until it says something.**

That gate is the point of this file. Every check in `release.sh` stops a
bad release; this one stops a bad *cycle* — the same mistake being paid
for twice because nobody wrote down what the first one cost. It is cheap
when nothing happened: a clean run that did not touch the cycle records
"none needed" on its own and never asks.

Entries are appended newest-last.

---

## 2.13.0 (245) — 2026-08-27

Cut by hand, before `release.sh` existed. Recorded here because it is the
release that produced most of the reasons the script has the shape it has.

Aborted nothing — it had nothing to abort into. What went wrong instead
went wrong *after* publishing:

  - The Play release notes were over the 500-character limit in all three
    locales, found by `verify-release.sh` once the tag and the GitHub
    release were already public.
  - Every Mac that upgraded to it froze its widgets and their gallery
    previews at 2.12.0's data, because replacing the app invalidates
    chronod's archived timelines and it never recovers on its own. No
    step anywhere covered that; the checklist predated the Mac build.

**Lesson:** a checklist cannot enforce an order, and the irreversible step
sits in the middle of it. Everything that can fail has to run before the
first push, which is now the one rule `release.sh` is built around — and
the two things this release got wrong are checks in it: the notes limit in
preflight, and the cask's `chronod` postflight as a release gate.

## 2.13.1 (246) — 2026-08-28

Took 5 aborted attempt(s) before it ran clean:

  - 1 catalyst build failed — /tmp/release-catalyst.log
  - 1 the last release left its lesson unwritten — fill in the '**Lesson:**' line in docs/release-log.md, commit it, and rerun
  - 3 working tree has tracked changes — commit or stash them first

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/release.sh`
  - `scripts/verify-release.sh`
  - `scripts/xcode-cloud.py`

**Lesson:** the iOS gate written for 2.13.0 failed this release, and the
gate was the thing that was wrong: it announced that 2.13.1 had never
reached App Store Connect while run #550 was building that exact commit.
`/buildRuns` returns the *oldest* runs unless asked to sort, so the branch
that reports "still building" had never once been reachable — the check
had one answer and it was a false alarm. A verification step is not proved
by passing; it is proved by each of its verdicts having been seen to
happen for the right reason. It now sorts, is handed the release commit,
and tells "Xcode Cloud has not picked this push up yet" apart from "the
trigger never fired".

**Second lesson, learned by causing it:** pushing that fix to `main` while
run #550 was building cancelled it. #551 then built the same version from
the newer commit and reached App Store Connect as build 551, VALID — fine
here only because the fix touched scripts and tests, nothing in the app.
The rule is now in `DISTRIBUTION.md`: after a release, `main` stays still
until Xcode Cloud finishes. What ships on iOS is the commit that survived
to the end of the run, not the commit the tag names.

## 2.13.2 (247) — 2026-08-29

Ran clean on the first attempt — the first release that has.

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/release.sh`
  - `scripts/sync-version.js`
  - `scripts/verify-release.sh`
  - `scripts/xcode-cloud.py`

**Lesson:** the two gates written after 2.13.0 and 2.13.1 both fired for
the first time in this cut, and both were right. The in-flight check
refused to start the release at all, because pushing the release notes had
started a run — which is the same collision that lost 2.12.0's iOS build,
caught this time before anything was tagged; waiting eleven minutes was
the whole cost. Then verification ended on *"EVERY FINISHED CHANNEL
PASSED — iOS is still building"* rather than the old "live on every
channel", naming run #561 by number. Neither of those was reachable a
release ago: one was dead code behind an unsorted API query, the other was
a sentence that overclaimed.

So the thing worth writing down is not a new failure. It is that the cost
of a gate is paid on the release that adds it, and the value arrives one
or two releases later, on a cut where nothing goes wrong and nothing looks
like it needed the gate. That asymmetry is exactly why they get deleted.
The evidence that they work is this entry being short.

**Held back, deliberately:** this lesson was committed while run #561 was
still building and pushed only afterwards. That is the rule from 2.13.1,
now followed rather than discovered — a push to `main` mid-run cancels it,
and iOS then ships the newer commit rather than the tagged one.

## 2.13.3 (248) — 2026-08-29

Ran clean on the first attempt.

**Lesson:** none needed — clean run, no change to the cycle.
