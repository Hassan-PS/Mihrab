# Bundled fonts (Android)

Drop the following font files here. They will be auto-bundled by the
React Native asset pipeline at build time, and become available to RN
as `fontFamily: '<font-family-name>'` (the *family* name, not the
filename).

Required files
--------------

- `Amiri-Regular.ttf`
- `Amiri-Bold.ttf`
- `ScheherazadeNew-Regular.ttf`

Sources
-------

- **Amiri** — https://github.com/aliftype/amiri  (SIL Open Font License 1.1).
  Used for Quran ayahs. `FONTS.arabicQuran` in `src/theme/typography.ts`.
- **Scheherazade New** — https://software.sil.org/scheherazade/  (SIL OFL 1.1).
  Used for general Arabic body text. `FONTS.arabicBody` in the same module.

Both are permissively licensed for inclusion in a commercial app and
must ship with their respective LICENSE files (SIL OFL 1.1) — place
those next to the `.ttf` files in this directory and they will be
copied alongside the fonts.

Verifying the install
---------------------

After adding the files, run an Android build and try setting:

```tsx
<Text style={{ fontFamily: 'Amiri', fontSize: 24 }}>بِسْمِ ٱللَّٰهِ</Text>
```

The text should render in the Amiri Naskh face. If it falls back to
the system face, double-check the *family name* (open the .ttf file in
"Font Book" on macOS or `fc-query` on Linux to confirm).
