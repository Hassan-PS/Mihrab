# Quran data — directory contract

This directory carries the bundled Quran corpus consumed by
`src/quran/quran.ts::loadSurah()`.

```
data/
├── README.md              ← this file
├── source/                ← raw Tanzil downloads (gitignored, transient)
│   ├── quran-uthmani.json
│   └── en.sahih.json
└── surahs/                ← committed per-surah JSON files
    ├── 001.json
    ├── 002.json
    ├── …
    └── 114.json
```

## How to populate it

1. Download from https://tanzil.net/download/:
   - Arabic: **Quran Text → Uthmani simple-clean → JSON**.
     Save as `data/source/quran-uthmani.json`.
   - Translation: **Translations → English → Sahih International → JSON**.
     Save as `data/source/en.sahih.json`.
2. Run the importer from the repo root:

   ```sh
   node scripts/quran-import.js
   ```

3. The script writes 114 per-surah files into `surahs/` and patches the
   `loadSurahDataFile()` switch in `src/quran/quran.ts` so Metro can
   tree-shake on a per-surah basis.
4. Verify:

   ```sh
   npx tsc --noEmit
   npx jest --testPathPattern=quranIntegrity
   ```

## Per-surah file shape

Each `surahs/{NNN}.json` is:

```json
{
  "number": 1,
  "arabic": ["ayah 1 text…", "ayah 2 text…", "…"],
  "translation": ["ayah 1 translation…", "ayah 2 translation…", "…"]
}
```

`number` is redundant with the filename but lets the loader sanity-check
the import. `translation` may be empty `[]` if a surah's English
translation hasn't been verified yet — `loadSurah()` falls back to the
inline `SURAH_TRANSLATION_EN` map for those entries.

## License

- **Arabic text:** Tanzil simple-clean Uthmani — Creative Commons
  Attribution 3.0. Verbatim copies + attribution required.
- **English translation:** Sahih International — public domain.

The combined attribution string is exported from `src/quran/quran.ts`
as `QURAN_ATTRIBUTION` and surfaced on the QuranScreen About row.

## Why `source/` is gitignored

The raw Tanzil downloads are ~1.6 MB Arabic + ~1.9 MB translation
(~3.5 MB combined). They're reproducible — anyone with the repo can
re-download them from the same source and re-run the importer, so
checking them in would be wasted bytes. Only the per-surah `surahs/`
files are committed since they're the artifact the app actually loads.
