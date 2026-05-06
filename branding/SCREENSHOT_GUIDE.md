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

You don't need to do a separate iPad pass — App Store Connect lets you reuse iPhone 6.9″ screenshots for iPad if you don't have iPad-specific assets, and reviewers don't penalise that for a non-iPad-first app.

Localised App Store listings (Arabic, Swedish, French, etc.) can reuse the same screenshots — App Store Connect doesn't require localised images for each language.

## Where the simulator saves screenshots

By default `~/Desktop/Simulator Screenshot - <device> - <date>.png`. If your desktop is busy, change it via simulator menu **File → Save Screen As…** and pick a folder.
