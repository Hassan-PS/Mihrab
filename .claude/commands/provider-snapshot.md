---
description: Fetch today's prayer times from each provider for fixed reference coords. Diff against the last snapshot to flag breaking API/HTML changes early.
argument-hint: [--ramadan]
allowed-tools: Bash(node scripts/provider-snapshot.js:*)
---

Snapshot every provider's response and diff against the last good snapshot:

```bash
node scripts/provider-snapshot.js $ARGUMENTS
```

Without arguments: uses today's date and Stockholm coords.
With `--ramadan`: uses a known Ramadan reference date for the current Hijri year (or last year's Ramadan if outside Ramadan).

The script:
1. Fetches AlAdhan, PrayTimes.dev, Islamiska Förbundet, and computes local adhan for Stockholm.
2. Diffs each response against `__tests__/fixtures/snapshots/<provider>-<date>.json|html`.
3. Reports any change in shape, missing fields, or sanity-check failures.
4. Updates the snapshot if `--update` is passed.

If a provider has changed its response shape, invoke the `provider-doctor` subagent to investigate, propose a fix, and write a regression test.

Run before any release. Run during Ramadan especially — Islamiska Förbundet's Ramadan timetable format is the riskiest moving target.
