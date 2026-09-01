# Warsh — the muṣḥaf this build does not have yet

The two JSON files beside this one are **empty placeholders**, and they are
committed on purpose.

Metro resolves `require()` when it builds the bundle, not when the code
runs, so a `require('./data/warsh/pages.json')` for a file that is not
there is a **build failure** — not something the `try/catch` in
`../../riwayahData.ts` can rescue. Every checkout therefore needs
something at these paths. Empty is the honest answer: `loadRiwayahPages`
reads an empty table as *absent*, `riwayahAvailable('warsh')` returns
false, and the riwayah toggle never appears. The app offers Hafs, exactly
as it did before any of this existed.

```
pages.json   {"pages":[],"surahs":[]}     ← this muṣḥaf's own pagination
text.json    {}                           ← ayah text, keyed "surah:ayah"
```

## Filling them

`tools/riwayat/import.ts` writes both from a dataset in QUL's schema, and
refuses anything that is not the whole Qur'an — 6236 ayahs, 114 surahs,
the exact ayah count of every surah, no duplicates, no empty text, page
numbers that never go backwards. Run `tools/riwayat/check-refusals.sh` to
watch it refuse.

```
npx tsx tools/riwayat/import.ts warsh path/to/warsh.json
```

## Before committing what it writes — read this

**Do not commit the output while the licence question is open.**
`docs/design/riwayat-plan.md` §1 has the detail; the short version is that
QUL's *code* is MIT but its *resources* carry no stated licence, and the
credits name KFGQPC and Tanzil, who have terms of their own. Mihrab is
AGPL-3.0-or-later and ships on three stores. It cannot bundle scripture of
unclear provenance and hope.

Two failure modes are worse than not shipping the feature at all, and both
end with real readers reading something that is not the Qur'an:

1. **Placeholder text that escapes.** A synthetic fixture is invaluable for
   testing the renderer and worthless as scripture. If these files are not
   empty and did not come from the importer, they are not the Qur'an.
2. **A half-imported file.** The importer's checks exist so this cannot
   happen quietly; `riwayahIntegrity.test.ts` re-checks it in CI, because
   the muṣḥaf that ships is the one in the repo, not the one on the
   machine where the import ran.

When the terms are settled, record them here — who granted what, in
writing, and where that is kept — and then commit the data.
