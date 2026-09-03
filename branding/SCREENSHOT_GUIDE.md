# App Store screenshot guide — Mihrab

The app store wants 6.9″ (iPhone 16/17 Pro Max) and optionally 6.5″ shots. The iPhone 17 Pro Max simulator is already booted — every Cmd+S inside the simulator window saves a PNG to your desktop at the device's native resolution (1320×2868), which is exactly what App Store Connect expects for the 6.9″ slot.

You only need 3 screenshots minimum and can submit up to 10 per device class. I'd ship six — they tell a complete story without being filler.

## Before you shoot

In the simulator, go to the OS-level **Settings** app first and set:

- **Display & Brightness → Light** (most of the shots) — Apple's listing reviewers prefer light mode for hero screenshots; it reads cleaner against their store template.
- **General → Language & Region → English** for the first language pass; we'll do an Arabic pass after.
- **Status bar**: open the simulator menu **Features → Toggle In-Call Status Bar** isn't needed, but **Device → Erase All Content and Settings** before the first shot gives you a clean status bar with full battery and full signal.
- The status-bar override (clean 9:41 / full battery / no notch icons) comes from `xcrun simctl status_bar … override --time '9:41' --batteryLevel 100 --batteryState charged --cellularBars 4 --wifiBars 3` — run that once before the screenshot session.

In Mihrab itself, complete the onboarding (location: pick "Sweden — Stockholm" or your real city) so every shot has real prayer times to display.

## The six shots

### 1 — Home, next prayer hero (light, English)

Mihrab's strongest screen: 64pt tabular time, three-letter prayer name above it, a calm rounded card. The launcher icon's deep teal is reflected in the accent.

- Open the app fresh.
- Make sure the home tab title says **Mihrab**, the location pin and Settings gear are in the header.
- Frame: title bar visible, NextPrayerCard centred, the day's prayer carousel just peeking under it.
- Cmd+S in the simulator.

### 2 — Quran reader (dark, English with translation)

Mushaf-style Arabic Uthmani text alongside the chosen translation reads beautifully in dark mode and shows off the typography work.

- iOS Settings → Light to **Dark**.
- In Mihrab → Quran tab → Surah Al-Mulk (#67). It's mid-length, recognisable, and the screen will show ~3 ayahs of Arabic + English.
- Make sure the translation toggle shows **Sahih International** (or Tafsir al-Muyassar if you want to highlight the Arabic exegesis).
- Frame: surah header (الملك / Al-Mulk / 30 ayahs · Meccan) at top, two ayah cards visible.
- Cmd+S.

### 3 — Dua library — Ayat al-Kursi (light, English)

The category chips along the top with the Arabic, transliteration, translation and source attribution show off the i18n + Arabic typography.

- Switch back to Light mode.
- Mihrab → Duas → **Morning** category → scroll to **Ayat al-Kursi** at the top.
- Frame: the category chip row + the full Ayat al-Kursi card (Arabic, transliteration, translation, source line).
- Cmd+S.

### 4 — Tasbih counter (dark, Arabic)

The tasbih screen is visually quiet — the big tabular 33-count number in the centre, the Arabic dhikr above it. Switching the simulator's language to Arabic for this single shot shows off the RTL polish.

- iOS Settings → General → Language → Arabic (or Mihrab → Settings → Language → Arabic if you don't want to flip the OS).
- Switch to dark mode if not already.
- Mihrab → Tasbih → **Subhanallah**. Tap the counter ~5 times so the screenshot shows "5 / 33" rather than "0 / 33" — proves it's interactive.
- Frame: Arabic dhikr at top, big "5 / 33" centred, Prev/Reset/Next row at bottom in Arabic.
- Cmd+S.

### 5 — Fasting tracker — upcoming Sunnahs (light, Arabic)

Demonstrates the Hijri awareness and the fasting/journal feature set. Looks particularly compelling in Arabic.

- Keep Arabic locale, switch back to Light mode.
- Mihrab → Fasting tab.
- Frame: TODAY hero card at top (showing "لم يُسجَّل صيام اليوم." / "سجّل صيام اليوم"), the three stat tiles, the upcoming-Sunnahs list (يوم عرفة, الأيام البيض, يوم عاشوراء visible).
- Cmd+S.

### 6 — Qibla compass (dark, English)

A wide hero shot with the dial, accent-tinted needle, and the bearing in degrees. Final shot in the carousel; closes strong.

- iOS Settings → Language → English, dark mode.
- Mihrab → Compass tile in QuickActionsGrid.
- Hold the device steady so the needle points at the Ka'bah; if the simulator can't simulate the magnetometer, drag the simulator itself to a stable position and the visual reads cleanly anyway.
- Frame: the full compass dial centred, the bearing readout below.
- Cmd+S.

## Optional 7th — widget preview

If you have time, the home-screen widget on iOS is a strong differentiator. Pin the medium widget to the simulator's home screen (long-press → + → Mihrab → medium → Done), then Cmd+S the home screen with the widget visible. Recommend this only if you have one screenshot slot left over — Apple shows the first 3 in the search results and the rest in the listing.

## Theme rotation summary

| # | Screen | Mode | Locale |
|---|---|---|---|
| 1 | Home — next prayer | Light | English |
| 2 | Quran reader | Dark | English |
| 3 | Dua — Ayat al-Kursi | Light | English |
| 4 | Tasbih counter | Dark | Arabic |
| 5 | Fasting — upcoming | Light | Arabic |
| 6 | Qibla compass | Dark | English |

Three light / three dark; four English / two Arabic. Shows the i18n surface without making half the carousel inaccessible to non-Arabic readers.

## After Cmd+S

Each screenshot lands on your **Desktop** as `Simulator Screenshot - iPhone 17 Pro Max - …png` at 1320×2868. Drag them straight into App Store Connect → My Apps → Mihrab → 1.0 (or the in-prep version) → Screenshots → 6.9-inch iPhone.

An app that ships an iPad build needs its own iPad pass: App Store Connect will not accept iPhone screenshots for the iPad slots. See "The store sets" below for the sizes and the folders they live in.

Localised App Store listings (Arabic, Swedish, French, etc.) can reuse the same screenshots — App Store Connect doesn't require localised images for each language.

## Where the simulator saves screenshots

By default `~/Desktop/Simulator Screenshot - <device> - <date>.png`. If your desktop is busy, change it via simulator menu **File → Save Screen As…** and pick a folder.

---

## The 2.14 set (2026-09-03)

`branding/screenshots-2.14/` holds the raw captures the current README and
website imagery is built from, and `branding/tools/build_shots.py` is what
builds it:

```sh
python3 branding/tools/build_shots.py
```

Phone captures go in at their own resolution (Android 1080×2400, iPhone
1206×2622); the script scales each to 1800 tall and centre-crops to 810
wide, which is the 9:20 box the site's gallery declares. The Mac capture is
a whole desktop — the script finds the app window by scanning for the light
rectangle inside the wallpaper, so a differently-placed window still crops
correctly.

Only the files the script names are kept here. To refresh the set, replace
a capture under the same name and run the script again; the hero and the
Play feature graphic come from `compose_wide.py` and are regenerated with:

```sh
python3 -c "import sys; sys.path.insert(0,'branding/tools'); from compose_wide import hero, feature_graphic; S='branding/screenshots-2.14/'; hero('branding/github-hero.png', S+'ios-home.png', S+'ios-mushaf.png', S+'ios-duas.png'); feature_graphic('branding/play-feature-graphic.png', S+'ios-home.png')"
cp branding/github-hero.png docs/assets/img/og-hero.png
```

The script also stamps `?v=<today>` onto every screenshot URL in
`docs/index.html`. The filenames stay the same from one set to the next, so
without it a returning visitor is served the OLD images out of their browser
cache with nothing to tell them — which is exactly what happened when the
2.14 set went live: correct bytes on the server, August's screenshots on the
screen. The stamp is written by the same command that writes the images, so
the two cannot drift apart.

---

## The store sets (2026-09-03)

Two sizes, and only two, because they are the two Apple actually requires.
App Store Connect scales them down for every smaller class on its own, so a
6.5″ or 6.3″ set buys nothing and is one more thing to let go stale.

| Slot | Pixels | Raw shots | Captioned panels | Upload from |
|---|---|---|---|---|
| iPhone 6.9″ | 1320 × 2868 | `branding/store/ios-6.9` | `branding/store-previews` | `fastlane/screenshots/ios/6.9` |
| iPad 13″ | 2064 × 2752 | `branding/store/ipad-13` | `branding/store-previews-ipad` | `fastlane/screenshots/ipad/13` |

Raw shots are the untouched simulator captures. The captioned panels are what
goes on the product page. Both are built by one script:

```sh
python3 branding/tools/build_store.py
```

It refuses to run on a shot that is the wrong size or that still carries an
alpha channel — `simctl io … screenshot` writes RGBA, and App Store Connect
rejects any PNG with alpha, so flatten before committing:

```python
from PIL import Image
im = Image.open(path)
bg = Image.new("RGB", im.size, (255, 255, 255))
bg.paste(im, mask=im.split()[-1])
bg.save(path)
```

The caption for each panel lives in `CAPTIONS` in `build_store.py`, keyed by
the raw file's name — so the numbering in the file name is also the order the
panels appear in on the product page.

### The seven panels

| # | Screen | Why it's in |
|---|---|---|
| 1 | Home — next prayer | The hero. Countdown, today's times, the ayah of the day. |
| 2 | Mushaf — Al-Baqarah, playing | The reader *with the mini player up and a word lit*, which is the one thing a static list of features can't convey. |
| 3 | Month | The whole table filled in — proof of the offline year. |
| 4 | Duas | Ayat al-Kursi with Arabic, transliteration, translation, source. |
| 5 | Tasbih | Counter part-way through a set, so it reads as used rather than empty. |
| 6 | Log | The practice grid and today's row — the journal nobody expects. |
| 7 | Qibla | iPhone only. |

Qibla is left out of the iPad set: a simulator has no magnetometer, so the
dial sits on "Starting compass…", and on a 13″ canvas that is mostly empty
page. On the iPhone it still reads, because the bearing is the whole top of
the screen.

### Capturing

Both simulators take synthetic taps, so the whole pass runs headless:

```sh
IPHONE=$(xcrun simctl list devices | grep 'iPhone 17 Pro Max' | grep -o '[0-9A-F-]\{36\}')
xcrun simctl status_bar $IPHONE override --time '9:41' \
  --batteryLevel 100 --batteryState charged --cellularBars 4 --wifiBars 3
idb ui tap --udid $IPHONE <x> <y>        # device POINTS, i.e. pixels ÷ 3
xcrun simctl io $IPHONE screenshot shot.png
```

`idb ui describe-all --udid <udid> --json` gives every element's label and
frame, which is how the taps are aimed — never guess from a screenshot's
pixels. Filter it hard; on the Log screen it prints a row per day of the year.

Two things that cost time last pass:

- A fresh simulator has no muṣḥaf pages, so the reader renders blank. Copy the
  `Documents/quran` folder across from a simulator that has already downloaded
  it (`xcrun simctl get_app_container <udid> com.hassan.prayerapp data`) —
  185 MB, and much faster than downloading again inside each device.
- Neither `simctl` nor `idb` can rotate a device. The iPad set is therefore
  portrait, where the spread reader shows one page plus the surah sidebar.
  Landscape needs the Simulator GUI and `cmd+left` / `cmd+right`.
