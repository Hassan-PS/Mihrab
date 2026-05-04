# Bundled fonts (iOS)

Drop the following font files here, then add them to the Xcode
`PrayerApp` target's *Copy Bundle Resources* build phase. The names in
`UIAppFonts` (Info.plist) must match the **filenames** here.

Required files
--------------

- `Amiri-Regular.ttf`
- `Amiri-Bold.ttf`
- `ScheherazadeNew-Regular.ttf`

Sources
-------

- **Amiri** — https://github.com/aliftype/amiri (SIL OFL 1.1)
- **Scheherazade New** — https://software.sil.org/scheherazade/ (SIL OFL 1.1)

License files (`OFL.txt`) must accompany the .ttf files in this
directory — they ship with the app per the OFL terms.

After adding to Xcode
---------------------

The Info.plist already declares the `UIAppFonts` entries (see
`ios/PrayerApp/Info.plist`). Once the files are in this directory and
added to the target, RN can address them via:

```tsx
<Text style={{ fontFamily: 'Amiri' }}>بِسْمِ ٱللَّٰهِ</Text>
```

`fontFamily` here uses the font's PostScript family name, NOT the
filename. Verify by opening the `.ttf` in macOS Font Book and checking
the "Family" attribute.
