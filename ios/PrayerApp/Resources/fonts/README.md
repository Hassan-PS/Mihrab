# Bundled fonts (iOS)

These files are in the `PrayerApp` target's *Copy Bundle Resources*
build phase and declared in `UIAppFonts` (`ios/PrayerApp/Info.plist`).
`UIAppFonts` lists **filenames**; `fontFamily` at runtime uses the
font's internal **PostScript family name**. The two are not the same
string, and on Android neither of them is — Android resolves by
filename. See `android/app/src/main/assets/fonts/README.md`.

Bundled files
-------------

| File | `fontFamily` | Used by |
|---|---|---|
| `Amiri-Regular.ttf` | `'Amiri'` | `FONTS.arabicBody` — dua text, surah names, general Arabic |
| `AmiriQuran.ttf` | `'Amiri Quran'` | `FONTS.arabicQuran` — ayah text only |
| `SurahNames.ttf` | `'SurahNames'` | `src/quran/surahHeaderGlyph.ts` — the 114 name glyphs |

Take these strings from `FONTS` in `src/theme/typography.ts` rather
than spelling them at the call site — that module is where the
per-platform difference is resolved once.

Sources
-------

- **Amiri** / **Amiri Quran** — https://github.com/aliftype/amiri (SIL
  Open Font License 1.1).
- **SurahNames** — KFGQPC surah-name calligraphy. Provenance and terms
  in `docs/data-sources.md`.

SIL OFL 1.1 asks that the license text ship with the fonts — place
`OFL.txt` in this directory and add it to the target.

Verifying
---------

```tsx
<Text style={{ fontFamily: FONTS.arabicBody, fontSize: 24 }}>بِسْمِ ٱللَّٰهِ</Text>
```

A fall back to the system face usually means the *family* name is wrong
rather than the file: open the `.ttf` in Font Book and check the
"Family" attribute. `node scripts/font-check.js` cross-checks the
filenames here against `UIAppFonts`.
