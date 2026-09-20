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

**Corrected the same day.** That line was written by the script and left
alone, and it was wrong within hours. The cut was clean; the *release* was
not, and neither failure was reachable from anything this cycle checks:

  - Upgrading on macOS REMOVED every placed widget, and had done on every
    upgrade. Replacing the app drops the extension's PlugInKit record and
    nothing re-registers it, so WidgetKit discards the placement. Found
    because a user said "after every update the widgets are removed" — not
    by a gate, and not by the person cutting the release, whose own Mac
    looked fine because he launches the app.
  - This was the eighth consecutive release to ship UNNOTARIZED. Gatekeeper
    had been blocking the first launch of every Mac install since 2.11.0,
    and the cask carried a caveat apologising for it. The notary service's
    history is what says so: last accepted submission, 2.10.1.

Both are now gates (`pluginkit` in the cask; a stapled ticket on the zip,
checked before publishing and again on what is served), and notarization
happens inside `build-catalyst.sh` rather than in a comment asking a human
to run it afterwards.

The reason this note is appended rather than the "none needed" line being
edited: a clean *cut* is not a clean *release*, and this file is the only
place that distinction gets recorded. A release that publishes something
broken and reports success is the failure this log exists to catch, so the
entry has to show both what the script knew and what it could not know.

## 2.13.4 (249) — 2026-08-29

Ran clean on the first attempt.

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/build-catalyst.sh`
  - `scripts/release.sh`
  - `scripts/verify-release.sh`

**Lesson:** both of the failures this release fixes were invisible to the
cycle for the same reason, and it is not the one that looks obvious.

Neither was a missing check. Notarization *was* written down — four
commented-out lines at the top of `build-catalyst.sh`, with the exact
commands. The widget re-registration had no comment, but nothing about it
was hard either. What both had in common is that the only evidence they
were needed lived on a machine the release never looks at: a Mac that had
*upgraded*, some time later. The release process only ever sees a Mac that
just built the thing, where the app is registered because the build
launched it and Gatekeeper is quiet because the developer approved the
bundle himself months ago. Eight releases went out with Gatekeeper blocking
every install, from a machine on which nothing was blocked.

So the useful generalisation is not "add a gate for notarization". It is
that a check run on the build machine answers a different question from
the one users are asking, and for anything that only manifests on a second
install, the artifact has to be interrogated as a stranger would: unpacked
somewhere else and asked what it is. That is why the new checks are
`stapler validate` on the downloaded zip rather than "we ran notarytool",
and why the cask's registration loop verifies that the record *stayed*
rather than that the command succeeded.

**It cost something to learn that, too.** The first version of the
verification unpacked the app and ran `spctl` on it, which handed the
bundle to App Translocation, registered the translocated path, and took the
installed app's widget registration down with it — the exact failure the
release was fixing, caused by the check for it. Both release scripts turned
out to have been leaving registered copies of unpacked zips behind on every
run, which is very likely where some of this cycle's earlier blank-widget
reports came from.

**Held back, deliberately:** committed while run #568 was still building
and pushed only afterwards, per the rule from 2.13.1.

## 2.13.5 (250) — 2026-08-29

Ran clean on the first attempt.

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/build-catalyst.sh`
  - `scripts/release.sh`
  - `scripts/verify-release.sh`

**Lesson:** the two phases added in 2.13.4 both fired for the first time
here, and both did what they were built for. "Installing it the way a user
does" installed the published cask, and reported the extension registered
*with the app never launched* — the exact property whose absence removed
every Mac user's widgets for three releases, now asserted on a real install
rather than reasoned about. Cleanup stopped the Gradle daemon and found
nothing else running. Neither line was reachable a release ago.

What is worth writing down is the shape of the night that produced them.
The bug that started it — a widget tap never reaching the journal — took
four wrong diagnoses before the right one, and every wrong one came from
treating an absence as evidence:

  - `pluginkit` empty ⇒ "the registration is broken". It was, sometimes,
    but not then.
  - the App Group missing a key ⇒ "every extension write is dropped". The
    reading was taken while the widget was frozen and nothing had run.
  - no log lines from the extension ⇒ "the intent never fires". `log` is a
    zsh builtin; the command had never run `/usr/bin/log` at all, and
    `2>/dev/null` hid the error. Hours of reasoning rested on that.
  - a tap producing nothing ⇒ "the button does not exist". The extension
    had been idle for seventeen minutes; the test was run against a dead
    widget.

The one that worked was the one with a control: plant a queue entry and
withhold the notification, then send it. Still queued at 10s, 20s, 30s;
drained within 6s. That is the difference between a measurement and an
observation — a measurement can come out the other way.

So the rule this release earns is narrower than "test more". It is that
**nothing-happened is not a reading until something-happened has been shown
on the same instrument.** Three of the four wrong turns above would have
been caught by one control run costing under a minute.


## 2.13.6 (251) — 2026-08-30

Took 2 aborted attempt(s) before it ran clean:

  - 1 an Xcode Cloud run is already in flight — let it finish, or it and the release build will kill each other
  - 1 missing release notes: en-US/changelogs/251.txt

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/release.sh`
  - `scripts/verify-release.sh`

**Lesson:** both aborted attempts were the cycle refusing to do something
wrong, and neither gate existed a day earlier. That is the whole return on
the CI work: a release that stops twice and then runs clean is cheaper than
one that runs first time and leaves a mess behind it.

The CI gate then did the thing it was built for, in the shape it was built
for. PHASE 4 could only print `⧗` — verification runs seconds after the tag
push, when GitHub has not started the run — and PHASE 6 waited and reported
`CI is green on the release commit`. First release in the project's history
where the cycle itself knew that.

What is worth writing down is what the release UNCOVERED rather than what it
cost. The install at 03:32 replaced the extension, chronod rebuilt every
timeline, and the widget extension burned 16 seconds of CPU and had a
resource report filed against it. That was the fifth such report on this
machine, spanning 2.10.1 to 2.13.6, and every one had been read as noise.

Chased the same afternoon, with an instrument and a control — extension
idle, 0.00s over 10s; launch the app to force one refresh, 10.46s in 13s —
it turned out to be three defects stacked on one another, none of which was
the button everyone suspected:

  - `Text("literal")` in a widget is a filesystem read. Every widget sets
    `.environment(\.locale, mihrabLocale())` so labels follow Mihrab's
    language rather than the system's, which takes SwiftUI off NSBundle's
    cached lookup and onto the localization-qualified one — re-reading and
    re-parsing 13 KB of `.strings`, per label, per render pass, and again
    per accessibility label.
  - the timeline built 60 archived entries under the comment "WidgetKit
    tolerates large timelines, but keep it bounded". It tolerates entries.
    The archive has a byte cap, and chronod had been saying so in plain
    words all along: `reload: failed with too large timeline archive
    11307528`. 11.3 MB, refused. A refused timeline is a card with nothing
    to draw, which is the blank widget and then the missing one.
  - `RefreshIntent.perform()` was `{ .result() }`.

The rule this release earns is about attention, not about SwiftUI. **Five
CPU-resource reports and sixteen "too large timeline archive" errors were
sitting in the logs the whole time, and the bug was chased for two days
through screenshots.** The failing subsystem was writing down what was wrong
with it, in English, unread. Before theorising about a symptom, read what
the system says about itself — `log show` and `/Library/Logs/Diagnostic-
Reports` before the first hypothesis, not after the fourth.

Note also the near-miss on the way to fixing it: the first attempt to
measure built with `SKIP_NOTARIZE=1` and installed that over
`/Applications`. Gatekeeper rejected it, chronod purged the descriptors, and
the developer's own widgets went — by hand, the exact failure the last three
releases were spent eliminating. Four minutes of build time is not worth
reproducing the bug you are trying to fix. A build that gets installed gets
notarized, even when it is only being measured.

## 2.13.7 (252) — 2026-08-30

Ran clean on the first attempt.

Changed the release cycle itself:

  - `.github/workflows/habous-cities.yml`
  - `.github/workflows/habous-dataset.yml`
  - `.github/workflows/habous-probe.yml`

(Those three are dataset plumbing rather than release plumbing. They count
as cycle changes only because "changed the cycle" is measured as "touched
`.github/workflows`", which is the cheap test and worth keeping — a false
positive costs one paragraph, and the alternative is a rule that has to
guess which workflows matter.)

**Lesson:** every gate this cycle has asks whether the release was BUILT
and SHIPPED correctly. None of them asks whether the app is right, and
2.13.7's headline fix was a case where nothing in the cycle could have
helped: the app had been asking AlAdhan for `2026-08-30` in a URL that
means `DD-MM-YYYY`, so it had been served times for 30-08-**2030** on
every request it ever made. Status 200, valid shape, plausible times. Tests
passed, CI was green, notarization succeeded, the release verified clean —
and the times were four years out.

What found it was comparing a stored day against an independent published
source, which happened only because a user in Morocco reported "off by
minutes" and the ministry's own tables were sitting there to check against.
That is not a gate and cannot be made into one for every provider. But it
is worth writing down what the shape of the miss was: a dependency that
answers confidently instead of erroring is invisible to every check that
looks for errors. The cheapest defence is an oracle — some second source
that was not derived from the first — and this project now has two of
them, Sweden's and Morocco's, both wired in as providers rather than as
tests. Using them as tests is the obvious next step and is not done.

## 2.13.8 (253) — 2026-09-01

Took 1 aborted attempt(s) before it ran clean:

  - 1 catalyst build failed — /tmp/release-catalyst.log

That line is misleading and the log should say so: the Catalyst build
succeeded. It was signed, the entitlements were sealed in, it smoke-launched
and found today's payload in the App Group. What failed was the submission
after all of that — `notarytool` could not resolve
`appstoreconnect.apple.com`:

    Error Domain=NSURLErrorDomain Code=-1003 "A server with the specified
    hostname could not be found." … Resolved 0 endpoints in 5004ms …
    interface: utun4

`utun4` is a VPN tunnel. DNS through it came back empty for five seconds,
notarytool gave up, and the script stopped. Four minutes later the same
name resolved to 23.49.109.248 and an identical re-run passed with nothing
changed.

**Lesson:** the first abort in this log that was not the cycle catching
something wrong with the release. It was the network, and the release was
fine — which is worth recording precisely because the log would otherwise
read as though every abort means a defect.

Two things to carry forward. First, this is the one rule paying off in its
least dramatic form: the failure landed in the DRY RUN, before the push,
the tag and the GitHub release, so the whole cost was one rebuild. An
irreversible step in the middle of the list would have made the same blip
expensive.

Second, and the actually useful part: `notarytool` failing to SUBMIT and
`notarytool` failing to NOTARIZE look alike at the top of the output and
mean opposite things — one is your network, the other is your build. The
error text is what separates them, and reading it before assuming the
build is broken saved re-signing something that was never wrong. If this
recurs, the fix is in the script rather than in the habit: retry the
submit on a resolution error rather than dying on it, the way
`fetchWithRetry` already treats a DNS failure as different from a refusal.

## 2.14.0 (254) — 2026-09-02

Took 1 aborted attempt(s) before it ran clean:

  - 1 catalyst build failed — /tmp/release-catalyst.log

Changed the release cycle itself:

  - `scripts/build-catalyst.sh`

The abort was not the build. Notarization came back **Accepted**, and
`stapler` then failed seconds later with error 73:

    Processing: .../Mihrab.app
    The staple and validate action failed! Error 73.

`stapler` does not read the verdict `notarytool` has just printed — it
fetches the ticket from Apple's CDN, and the ticket is published a little
after the submission is accepted. Asking too early gets an error that
looks exactly like a broken build, and the cost of finding that out was a
full rebuild and a second notarization.

**Lesson:** 2.13.8 ended by saying that a dependency failing because it is
not ready is not the same as one refusing, and that the fix belonged in
the script rather than in the habit. That was right, and it named the
wrong command: it said retry the SUBMIT, and the next transient landed one
step later, on the STAPLE. The specific command was the accidental part of
that lesson; the shape was the durable one.

So the retry went where it was actually needed — six attempts over two and
a half minutes — and the generalisation is worth carrying rather than the
instance. Every step of this release that talks to Apple can be early
rather than wrong: submit, staple, and the Xcode Cloud poll after it. Two
of the three now retry. The third has not failed yet, which is not the
same as being safe.

And the one rule paid again, in the same unglamorous way it did last time:
the failure landed in PHASE 2, so the whole cost of getting this wrong was
a rebuild — not a tag, a GitHub release and a cask pointing at a zip with
no ticket in it.

## 2.14.1 (255) — 2026-09-02

Took 4 aborted attempt(s) before it ran clean:

  - 2 catalyst build failed — /tmp/release-catalyst.log
  - 1 origin/main has commits main does not — pull first
  - 1 working tree has tracked changes — commit or stash them first

**Lesson:** Four aborts, and they were two different kinds. Two were the
script refusing to start — a dirty tree, and main behind origin — which
cost only the seconds it took to read them. That is the one rule working
exactly as written, and the right response to those is nothing at all.

The two Catalyst failures are the ones worth a note, because they landed
in PHASE 2 where the cost is a rebuild. The Mac build has a failure mode
that reads as a broken build and is not one: with no Apple ID signed into
Xcode, `xcodebuild` cannot generate a Mac Catalyst provisioning profile
for the widget extension and stops with "No profiles for
'maccatalyst.com.hassan.prayerapp.PrayerWidgetExtension'" — or, worse
because it looks unrelated, "No Accounts: Add a new account in Accounts
settings". Nothing about the tree is wrong when that happens.
`build-catalyst.sh` does not hit it, because it builds unsigned and signs
afterwards against the Developer ID and the embedded profile. So a
Catalyst abort during a release is worth checking against the script
BEFORE assuming the code broke: the same tree that fails a bare
`xcodebuild` builds and signs cleanly through the script.

The generalisation from 2.14.0 holds here too — the failure landed before
the irreversible line, so getting it wrong cost a rebuild rather than a
tag, a release and a cask pointing at nothing.

## 2.15.0 (259) — 2026-09-04

Took 1 aborted attempt(s) before it ran clean:

  - 1 an Xcode Cloud run is already in flight — let it finish, or it and the release build will kill each other

Changed the release cycle itself:

  - `scripts/sync-version.js`

**Lesson:** The journal's own "changed the release cycle" line named
`scripts/sync-version.js` and that was the warning, read too late. The
Swedish site page arrived this cycle, sync-version learned to stamp it,
and the list of files the release commit ADDS did not — so the stamp
happened on disk, the commit went out with a site saying 2.15.0 in
English and 2.14.4 in Swedish, and `siteVersion.test.ts` — which exists
for precisely that mismatch — went red on the release commit itself.
Local jest passed before the stamp and passed after it, because the file
was correct on disk the whole time; the only place the gap was visible
was CI, on a commit that was already tagged and published.

And it was worse than one missing file, which the first fix missed:
`npm run sync-version` is `sync-version.js && build-site.js`, and the cut
ran only the first of the two. So eleven GENERATED locale pages kept the
old version as well, and `build-site.js --check` failed on all of them.

Fixed at both ends rather than remembered. The stamp step now runs the
generator and re-checks it, and the Publishing step adds `docs/` whole
instead of naming the pages that happened to exist when the line was
typed — a list of filenames in a release script is a list that goes stale
the first time the site grows.

The cask also needed a hand. The script's own comment predicted it: the
cask's version is whatever SHIPPED last, not this repo's previous
version, and 2.14.4 never shipped to the Mac — so the version sed matched
nothing while the sha sed matched fine, leaving a cask on disk pointing
at the 2.14.3 URL with 2.15.0's checksum. It died before pushing that,
which is the gate working; the manual fix was one line. Worth doing
properly next time: sed the version by pattern rather than by the value
release.sh happens to think preceded it.

Xcode Cloud never got a build. Not a code failure — the account was out
of build minutes for the month, so #675, #676 and #677 all failed at
"Preparing build for App Store Connect" and the release went out with
Android, F-Droid and the Mac only. The iOS channel needs the workflow
rerun when the quota resets.

## 2.15.1 (260) — 2026-09-05

Took 2 aborted attempt(s) before it ran clean:

  - 1 CI on main last concluded 'failure' on "release.sh: revert the site whole, like the add does" — fix it before releasing on top of it: https://github.com/Hassan-PS/Mihrab/actions/runs/33981339332
  - 1 catalyst build failed — /tmp/release-catalyst.log

Changed the release cycle itself:

  - `scripts/release.sh`

**Lesson:** the same staleness, a third time, and then a fourth in the
test written to catch it. 2.15.0's list of files to ADD had gone stale;
this cycle found the list of files to REVERT had gone stale identically,
so a phase-2 failure left the Swedish page and the eleven generated ones
stamped and the next run refused to start on a dirty tree of thirteen
files it had written itself. Both are `docs` whole now.

The abort that cost the cycle was the fix's own CI.
`releasePublishStep.test.ts` asserted the revert string *contains*
`docs/index.html` — a test that pins a list of filenames, which goes
stale exactly the way the list does, and went red on the commit that
stopped naming files at all. The
release then refused to start on a red main, which is the preflight gate
doing its job on a failure the previous release taught it to look for.

So: when a release-script fix is "stop naming files, name the directory",
the test has to move in the same commit — and a check that asserts a
specific path inside a release script is the same bug as the path being
there. Assert the BEHAVIOUR (every file `sync-version` writes is covered)
rather than the spelling.

The catalyst abort was the ordinary one, unrelated and unremarkable.

## 2.16.0 (261) — 2026-09-05

Ran clean on the first attempt.

**Lesson:** none needed — clean run, no change to the cycle.

## 2.17.0 (262) — 2026-09-06

Took 2 aborted attempt(s) before it ran clean:

  - 1 missing release notes: en-US/changelogs/262.txt
  - 1 working tree has tracked changes — commit or stash them first

Both were the gate doing its job before anything irreversible. Every
channel then published and verified except one: `verify-release.sh` ended
on `iOS: 2.17.0 NEVER REACHED App Store Connect, and nothing is building
it`.

**Lesson:** when every run is cancelled before it starts, it is not the
trigger — check the account.

The first diagnosis here was wrong and is kept for the shape of the
mistake. Seeing run #722 cancelled right after the tag push, I concluded
the tag had cancelled the build the `main` push started, wrote that up,
and pushed the note to `main` — which is itself a trigger, with no tag
behind it. Run #723 was cancelled too. One push, nothing following it,
same result: the hypothesis was falsified by the very commit that
recorded it.

What the run list actually says, once the timestamps are read rather than
the states:

    #723  CANCELED   (no completion date)
    #722  CANCELED   (no completion date)
    #721  CANCELED   (no completion date)
    #720  CANCELED   (no completion date)
    #719  CANCELED   (no completion date)
    #718  SUCCEEDED  20:38
    #717  SUCCEEDED  20:02
    #716  CANCELED   19:54
    #715  CANCELED   19:50
    #714  SUCCEEDED  19:08

Two different cancellations wear the same word. Up to #718 the cancelled
runs all carry a completion time: they started, ran, and were superseded
by the next push — ordinary, interleaved with successes, exactly what a
busy afternoon of commits looks like. From #719 every run has **no
completion date at all**. They were never begun. Nothing about the pushes
changed at that boundary; what changed is that the product stopped running
anything, at 20:38 on 2026-09-06.

`xcode-cloud.py start` answered HTTP 500 `UNEXPECTED_ERROR` on five
consecutive attempts across half an hour, while `runs` kept answering
normally on the same credentials — read fine, the one write that would
start a build refused. Apple's system status reported Xcode Cloud healthy
throughout.

**It was rate limiting.** Not something either the run list or the error
said: a 500 `UNEXPECTED_ERROR` is what the API returns for it, the status
page stays green because nothing is down, and the cancellations look
exactly like an account-level stop from the outside. Eleven pushes to
`main` in about three hours — the fixes, the release itself, and then the
notes about the release — is what spent it.

The lesson survives the correction, and is worth more for it: read the
completion dates, not the states. Five runs cancelled with no completion
date at all say the product refused to start them, and *why* it refused is
not visible from here at all. What that rules out is everything in this
repo — the trigger fired, the runs existed, nothing about the pushes
changed at the boundary. What it cannot tell apart is quota, billing,
throttling or an outage, and guessing between them from the outside is how
this entry came to name the wrong one twice.

For the next cycle:

  - The gate is right to fail and did. Its wording is what sent me down
    the wrong path: "nothing is building it" reads as *no run exists*,
    when five did. A run in state CANCELED **with no completion date** is
    its own diagnosis and worth naming — it means the product refused to
    start, which is an account question, not a repo one.
  - Do not touch the script's push ordering on the strength of this. It
    was the obvious suspect and it was innocent.
  - A release cut is not the time to also push a run of small commits. The
    limit is shared, the release needs one build out of it, and the notes
    explaining the release can wait until the build has started.

**Second lesson: the release commit cannot pass tests that assert the
files the release stamps.**

CI went red on a7a4965 itself. `translationLoader.test.ts` pinned the
Qur'an folder reference as `path = "../assets/quran"`, quotes included —
and stamping the version rewrote `project.pbxproj`, where Xcode's own
normalisation dropped them. The published build was correct throughout:
unzipping `Mihrab-macOS-2.17.0.zip` off the release shows all thirteen
translations and all 114 surahs in place. Only the regex was wrong.

The order is what makes this structural rather than unlucky. Tests run in
phase 2, stamping happens in phase 4, and the commit is made from what
stamping produced — so any assertion about a stamped file is checked
against the version BEFORE the release touched it, and the released commit
is the one version of the tree nobody tested. It cannot be fixed by being
more careful; a test like this will always go red after the tag, never
before it.

Two ways out, neither taken yet because they deserve their own change:
re-run the suite after stamping and before committing, which costs two
minutes and closes the hole completely; or keep assertions off the files
the release rewrites, which is the 2.15.1 lesson again — assert the
behaviour, not the spelling. The test itself has been loosened either way.

Left ✗ at the end of this cycle: iOS (account, above) and CI on the
released commit (this). The Android, macOS, Homebrew, F-Droid, site and
store-notes channels all verified.
## 2.17.1 (263) — 2026-09-07

Ran clean on the first attempt.

**Lesson:** none needed — clean run, no change to the cycle.

## 2.18.0 (264) — 2026-09-08

Ran clean on the first attempt.

Changed the release cycle itself:

  - `.github/workflows/reuse-check.yml`
  - `docs/DISTRIBUTION.md`
  - `scripts/release.sh`
  - `scripts/xcode-cloud.py`

**Lesson:** Three, and the first two are now in the machinery rather than in
anyone's head.

**A hold at Apple is an ordinary condition, so it has a name.** This release
could not go to App Store Connect — the account may not take a new build until
the 12th — and everything else could ship on the day it was ready. The two ways
to do that before `SKIP_APP_STORE=1` were to comment out a step in the middle of
a release script, or to let the run fail and read the retry line off the end.
Both are how a release gets cut wrong. The flag leaves the workflow PAUSED
rather than armed, says which of three states iOS is in — built, refused,
skipped on purpose — and prints the command to build THE TAG when the hold
lifts, because by then main has moved and a run started from it would ship a
newer commit under this version's number.

**A test can be vacuously true and look like proof.** The one covering that flag
sliced the script with `indexOf('else')` measured from the start of the step,
which landed inside the comment above it — an empty slice, and three assertions
that passed on nothing. It was caught only by deliberately breaking the script
so the skip re-armed Xcode Cloud and watching the test stay green. Breaking the
thing a test watches is this repo's rule for a reason; this is the release where
it earned its keep on the release machinery itself.

**Jest inherits NODE_ENV, and a dirty shell lies.** Jest defaults it to `test`
only when it is unset. Inherit `NODE_ENV=production` — the release script exports
it, and so does the desktop tooling this repo is driven from — and every suite
gets React's production build, which has no `act`: 195 failures across 35 suites,
none of them real. `jest.config.js` pins it now, so the suite means the same
thing whatever shell starts it. Before that, an hour of this release's day went
into deciding which change had broken react-test-renderer. None had.

## 2.19.0 (270) — 2026-09-13

Took 3 aborted attempt(s) before it ran clean:

  - 1 catalyst build failed — /tmp/release-catalyst.log
  - 2 origin/main has commits main does not — pull first

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/build-catalyst.sh`
  - `scripts/build-ios-appstore.sh`
  - `scripts/release.sh`
  - `scripts/xcode-cloud.py`

**Lesson:** three gates were wrong this cycle, all in the same direction —
each reported on the release when the thing at fault was the gate.

**A gate that launches the app hidden is not looking at the app.** The macOS
step deletes the App Group payload, launches the signed bundle with
`open -g -j` and requires it back. A hidden scene never becomes
foreground-active, so the screen that writes the payload never runs its data
effect: on a Mac somebody is sitting at it resolves anyway, on one whose
display has slept it does not. It failed this release outright, and the proof
that the build was innocent was running the same check against the shipped
2.18.5 in `/Applications` — hidden, nothing in ninety seconds; visible,
today's payload in ten. The hidden launch is still the default, because a
build should not throw a window onto whatever you are doing; it is just no
longer the only evidence a release can be rejected on.

**`shipped` had been answering no for every locally-uploaded release.** It
sorted `/v1/builds` by `version`, which is lexical, and this project has two
build-numbering schemes — Xcode Cloud rewrites the number to its run number
(the 700s), a local upload carries the real `CFBundleVersion` (270). Sorting
by `-uploadedDate` is the only question that means "the most recent one".
Worth noting that this gate was *written* against a false positive and has
now been fixed for a false negative: both directions cost a day.

**`set -u` turns a variable nobody set into a verdict.** The Xcode Cloud check
read `$RELEASE_SHA`, which nothing in the script ever assigned. Under
`set -u`, inside a command substitution, that is a fatal error whose exit
status the check read as "no run for this release" — so it announced exactly
that over run #729, which was building that very commit, and fell through to
the local upload. Silently, and for every release since the line was written:
the fallback ships, so nothing ever looked wrong. `bash -n` cannot see it —
the syntax is perfect — and the line runs once per release, in the half of
the script only a real release reaches. `releaseScript.test.ts` now checks
every variable these four scripts read against every variable they set.

**And the shape of all three:** a check is code that runs once per release,
under conditions nothing else reproduces, and is believed absolutely when it
speaks. That is the least-exercised, most-trusted code in the repo. It
deserves the tests the app gets, and this release is where it started
getting them.

## 2.20.0 (271) — 2026-09-13

Ran clean on the first attempt.

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/release.sh`

**Lesson:** the fix 2.19.0's entry describes was proved by this release
rather than by a test.

`$RELEASE_SHA` — the variable nothing assigned — meant every release since
that line was written took the local iOS route while reporting that Xcode
Cloud had no run for it. This one printed `run 730 is building b8e22cb5
(RUNNING)` and did not upload from this Mac at all, which is the first time
the intended path has been taken since the check was written. 2.19.0 put two
builds of itself in App Store Connect; 2.20.0 put one.

Worth recording because of what the evidence had to be. The unit test added
last release pins that every variable these scripts READ is one they set —
it would have caught the typo class — but it cannot tell you which branch a
release actually takes, because that depends on Apple answering. Only a real
cut can say. Two kinds of check, and the cheap one does not replace the
expensive one; it just means the expensive one is now confirming rather than
discovering.

The other change here is smaller and in the same family: `SKIP_APP_STORE=1`
pauses the workflow BEFORE the push now. It was written when the workflow
was paused between releases, where skipping meant not arming it; with the
workflow left enabled, a skip decided after the push would have skipped this
script's own upload while Apple built the pushed commit and uploaded it
anyway — a flag that did the opposite of its name, discoverable only by
someone holding a build back and finding it in App Store Connect. Nobody hit
it. It was found by reading the branch next to the one that was broken,
which is the cheapest time to find anything.

## 2.21.0 (272) — 2026-09-14

Took 2 aborted attempt(s) before it ran clean:

  - 1 origin/main has commits main does not — pull first
  - 1 working tree has tracked changes — commit or stash them first

**Lesson:** both aborts were a release begun from a checkout that had
drifted, and neither was the script's fault. Origin was ahead because the
dataset bot commits on its own schedule — a release has to rebase onto that
first, and meeting it at the push rather than at the start costs a full
rerun of the phase before it. The tracked-change abort was a `--dry-run`'s
own version stamp left behind: a dry run bumps `build.gradle` and stops, so
the bump has to be reverted (the revert set the script prints on exit)
before a real cut, or the next attempt trips on it. One `git fetch` and one
`git status` before starting shows both in the second before the script is
even run; the preflight is the backstop, not the routine.

## 2.21.1 (273) — 2026-09-14

Took 1 aborted attempt(s) before it ran clean:

  - 1 the last release left its lesson unwritten — fill in that '**Lesson:**' line in docs/release-log.md, commit it, and rerun

**Lesson:** the gate works, but it bills the wrong release. A lesson is
owed at the end of a cut, when the artifacts are published and the
attention that was on it has already gone somewhere else; nothing stops
you walking away, so the debt is collected at the start of the NEXT
release, which did nothing wrong and now pays a full preflight to find
out. The fix is not a better gate — it is writing the line while the cut
is still in your hands, in the same sitting that published it, because
that is also the only moment the answer is actually known. A lesson
written a fortnight later is a guess about what went wrong.

## 2.22.0 (274) — 2026-09-16

Took 1 aborted attempt(s) before it ran clean:

  - 1 catalyst build failed — /tmp/release-catalyst.log

Changed the release cycle itself:

  - `scripts/release.sh`
  - `scripts/verify-release.sh`

**Lesson:** the Mac is the only platform whose build runs nowhere but a
release. Android and iOS are compiled every day and again by CI, so a
toolchain change that breaks them is found by whoever caused it, within
hours. Catalyst is built once per version, by this script, at the moment
the tag is about to go out — so when Xcode 27 made a macOS deployment
target under 12.0 an error, the first thing to notice was the release
itself, with everything else green and ready. That is the worst possible
place to learn it, and it was avoidable: a scheduled Catalyst build, even
a weekly one that only has to compile, would have moved that discovery to
the day the Xcode upgrade landed, when it is a morning's work rather than
a release in the balance.

The second half, once it had happened: shipping nothing was not obviously
better than shipping the two platforms that worked, but nothing in the
script could express that, so the choice was between holding the release
and improvising a bypass under pressure — which is how every incident in
this file's header began. SKIP_CATALYST exists so the decision is a typed
env var with a documented blast radius instead. Note what it deliberately
does NOT do: the cask is left pointing at 2.21.1, because a cask naming a
version whose release has no zip 404s on every `brew install`, and
verify-release.sh is left to fail its five Mac checks honestly rather than
being taught to keep quiet.

For whoever picks up the Catalyst break: do not spend the afternoon on
build settings. The 10.15 it reports is not one. Every pod target, the app
target and both projects were set to 12.0 at target AND project level, and
`MACOSX_DEPLOYMENT_TARGET=12.0` was passed on the xcodebuild command line,
which outranks every scope there is — the error did not move, on the same
105 targets, every time. It is coming from platform metadata, most likely
the podspecs (hermes-engine's prebuilt macOS framework declares 10.15 in
its own Info.plist), which makes it an upstream React Native problem. The
fast way back to a shipping Mac is Xcode 26 and `DEVELOPER_DIR`.

## 2.23.0 (275) — 2026-09-17

Ran clean on the first attempt.

Changed the release cycle itself:

  - `docs/DISTRIBUTION.md`
  - `scripts/build-catalyst.sh`
  - `scripts/release.sh`

**Lesson:** the cut was clean; the publish was not, and the script's own
error message sent the recovery the wrong way.

`gh release create` uploads the APK as part of creating the release. On
this cut it stalled — 21 minutes, 228MB sent for a 136MB file, ~188k
retransmits, then nothing at all — and killing it left the release
**created as a draft with a partial asset**, because `gh` creates, then
uploads, then publishes. The recovery was therefore two commands: upload
the asset on its own, then `gh release edit --draft=false --latest`.
Nothing in the script said so. It reported `gh release failed` and exited,
which reads as "nothing happened" and invites starting over — and starting
over against an existing draft of the same tag is how a release ends up
with two assets or none.

The rule this belongs to is the one `release.sh` is already built around:
everything that can fail runs before the first irreversible step. A
136MB upload over a flaky link *is* a step that can fail, and it is
currently welded to the step that cannot be undone. Two ways out, both
cheap: create the release empty and upload the asset as its own retryable
step, or — at minimum — have the failure path say what state it left
behind. A message that names the draft is worth more than a retry that
does not know one exists.

Generalised: an error that says a command failed, without saying what it
left behind, is an error that costs more than the failure. Every
irreversible step in this script should be able to describe its own
wreckage.

## 2.24.0 (276) — 2026-09-18

Took 1 aborted attempt(s) before it ran clean:

  - 1 origin/main has commits main does not — pull first

**Lesson:** the release shipped iOS and then reported that it had not.

Xcode Cloud's push trigger did not fire for `37d8979f`. The script waited
six minutes, started a run by hand, still got nothing, and did exactly
what it is built to do: fell back to the local route, archived on this
Mac, validated, and uploaded. App Store Connect has the build. Every
other line of verification is green — both assets, the cask, the site,
the F-Droid recipe, all three Play locales, CI.

Then `verify-release.sh` failed the release, because its iOS check asks
one question — "is there an Xcode Cloud run for this sha?" — and the
answer is no and always will be. The fallback it is checking the outcome
of is invisible to it. So the run ends on a red ✗ over a release that is
complete, and the printed remedy (`resume && start`) is actively wrong
here: starting a run now would build 276 a second time and upload a build
number App Store Connect already has.

A fallback that the verifier does not know about is not a fallback, it is
a second way to fail. The check should ask whether iOS SHIPPED — an
Xcode Cloud run, or a local upload this script performed — and only then
ask by which route, reporting the local one as the warning it is rather
than as a failure. Until it does, read a red iOS line here together with
the "✓ iOS uploaded from this Mac" line above it; if both are present,
the release is fine.

Worth separating from that: the trigger itself. Two releases in a row
have now not started from the push (2.19.0 went the local way for a
different reason), and "the push trigger did not fire" has never been
investigated, only routed around. The local route is slower, depends on
this particular Mac and its signing identity, and is the only path left
if it ever breaks too.

Also, smaller: the first attempt died at preflight because a dataset-bot
commit had landed on origin/main. That gate is right and cost nothing —
but the release is now the only thing that ever notices, and it notices
after you have decided to cut one.


## 2.24.1 (277) — 2026-09-20

Ran clean on the first attempt.

**Lesson:** none needed — clean run, no change to the cycle.
