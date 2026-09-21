# Bundled fonts (Android)

These files are picked up by the React Native asset pipeline at build
time and become available to RN as `fontFamily: '<filename without
extension>'`.

**Android resolves a custom font by its FILENAME, not by the font's
internal family name.** iOS does the opposite. That asymmetry is the
only reason this directory does not simply mirror
`ios/PrayerApp/Resources/fonts/`, and it is worth reading twice before
renaming anything here.

Bundled files
-------------

| File | `fontFamily` | Used by |
|---|---|---|
| `Amiri.ttf` | `'Amiri'` | `FONTS.arabicBody` — dua text, surah names, general Arabic |
| `AmiriQuran.ttf` | `'AmiriQuran'` | `FONTS.arabicQuran` — ayah text only |
| `SurahNames.ttf` | `'SurahNames'` | `src/quran/surahHeaderGlyph.ts` — the 114 name glyphs |
| `MihrabMedallion.ttf` | `'MihrabMedallion'` | `ayahMark` in `src/quran/MushafUnicodePage.tsx` — one finished ayah medallion per number (1–286) at U+E000+n. Built from AmiriQuran's own outlines by `scripts/gen-medallion-font.py` (SIL OFL 1.1, not named Amiri). Android only — issue #16. |

The same face is `Amiri-Regular.ttf` on iOS, where RN reads the
PostScript family name ("Amiri") out of the file instead. Do not add a
second copy here under the iOS filename: this directory carried a
byte-identical `Amiri-Regular.ttf` for months — 431 KB on every Android
download — because one screen hardcoded the iOS-shaped name behind a
`Platform.select`. Ask for `FONTS.arabicBody` from
`src/theme/typography.ts` and the question does not come up.
`node scripts/font-check.js` fails if two files here are the same bytes.

Sources
-------

- **Amiri** / **Amiri Quran** — https://github.com/aliftype/amiri (SIL
  Open Font License 1.1).
- **SurahNames** — KFGQPC surah-name calligraphy. Provenance and terms
  in `docs/data-sources.md`.

All are permissively licensed for inclusion in a commercial and an
F-Droid build. SIL OFL 1.1 asks that the license text ship with the
fonts — place `OFL.txt` next to the `.ttf` files and it is copied
along with them.

Verifying
---------

```tsx
<Text style={{ fontFamily: FONTS.arabicBody, fontSize: 24 }}>بِسْمِ ٱللَّٰهِ</Text>
```

Should render in Amiri's Naskh face. A fall back to the system face
means the filename here and the string in `FONTS` have drifted apart.

The Latin UI face
-----------------

Lives in `res/font/`, not here: `roboto.xml` and its five weights, registered
as the family `Roboto` in `MainApplication.kt` and given to every `Text` on
Android by `src/theme/androidUiFont.ts`. A font XML rather than an asset
because React Native resolves an asset's weights by file-name suffix
(`_bold`) and would synthesise the rest; the XML names a real file per
weight. Why the app carries its own Roboto at all is in `roboto.xml`
(issue #16 — EMUI theme fonts). Licence: `android/fonts/OFL-Roboto.txt`.
