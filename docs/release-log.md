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
