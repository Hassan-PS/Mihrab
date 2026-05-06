<div align="center">
  <img src="assets/app-icon-rounded.png" alt="Mihrab" width="120">

  # Mihrab: The Muslim Companion

  A calm, private, offline-first companion for the day's intentions. Prayer times, Qibla, the Quran, dua and tasbih, fasting + prayer journal, and home-screen widgets — no ads, no analytics, no tracking.

  <br>

  <table><tr>
    <td><a href="https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256"><img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us" alt="Download on the App Store" width="150" height="50"></a></td>
    <td><a href="https://github.com/Hassan-PS/Mihrab/releases"><img src="https://raw.githubusercontent.com/rubenpgrady/get-it-on-github/refs/heads/main/get-it-on-github.png" alt="Get it on GitHub" width="150" height="50"></a></td>
    <td><a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.prayer_times%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FHassan-PS%2FMihrab%22%2C%22author%22%3A%22Hassan-PS%22%2C%22name%22%3A%22Mihrab%22%7D"><img src="https://raw.githubusercontent.com/ImranR98/Obtainium/main/assets/graphics/badge_obtainium.png" alt="Add to Obtainium" width="150" height="50"></a></td>
  </tr></table>

</div>

---

## Features

- **Privacy by design** — No ads, no analytics, no tracking. Coordinates and prayer history are encrypted on-device; nothing is shipped off your phone.
- **Prayer times, online or off** — Daily times and a full month view up to a year ahead. Cached on-device so the app opens instantly without a connection.
- **Home-screen widgets** — Customisable iOS and Android widgets showing the next prayer at a glance, with a per-prayer accent and dynamic color support.
- **Quran reader** — All 114 surahs with Arabic Uthmani text, Madinah mushaf page images, and 14 translation editions (Sahih International, Pickthall, Bernström, Hamidullah, Diyanet, Cortés, Bubenheim, Ma Jian, Kuliev, Indonesian Ministry, Mujibur Rahman, Jalandhry, Suhel Farooq Khan, Tafsir al-Muyassar). RTL mushaf flow.
- **Dua library** — 100+ duas across 19 categories (morning, evening, after prayer, food, sleep, travel, distress, gratitude, knowledge, protection, and more) with Arabic, transliteration, translation, and Hisn al-Muslim sources.
- **Tasbih counter** — Tap-to-count for the four post-prayer dhikr plus open-ended Astaghfirullah and Salah on the Prophet ﷺ. Tabular numerals so digits don't shimmer on tick.
- **Qibla compass** — Direction to the Ka'bah using your device's sensors.
- **Fasting log** — Tracks Ramadan + voluntary Sunnah fasts (Mondays, Thursdays, Ayyam al-Bidh, Day of Arafah, Day of Ashura, Six of Shawwal). Day-before reminder. Encrypted on-device.
- **Prayer journal** — Log each daily prayer as on-time / late / missed / qadha with optional private notes. Stay-streak stats. Optional "Log prayer" action on the prayer-time notification.
- **Mosque finder** — One-tap to your maps app with a "mosque" search centred on your location.
- **Adhan & reminders** — Notifications with built-in Adhan sounds and a pre-prayer reminder window.
- **Multiple providers** — AlAdhan, PrayerTimes.dev, Islamiska Förbundet (Sweden), or on-device calculation (Adhan JS) — pick the source that matches your community.
- **13 languages** — English, Arabic, Swedish, Bengali, Urdu, Hindi, French, Spanish, German, Turkish, Indonesian, Russian, and Chinese — every screen, every notification, every dua title.
- **Open source** — Apache-2.0. F-Droid build is fully reproducible (no Play Billing, no Google Play Services).

---

## Screenshots

<div align="center">

<img src="assets/screenshots/01_prayer_times_at_a_glance.jpg" width="49%" alt="Prayer times at a glance">&nbsp;<img src="assets/screenshots/02_share_beautiful_calendars.jpg" width="49%" alt="Share beautiful calendars">

<img src="assets/screenshots/03_full_month_always_ready.jpg" width="49%" alt="Full month always ready">&nbsp;<img src="assets/screenshots/04_qibla_direction_anywhere.jpg" width="49%" alt="Qibla direction anywhere">

<img src="assets/screenshots/05_fully_customisable.jpg" width="49%" alt="Fully customisable">

</div>

---

## Install

| Platform | Link |
|---|---|
| **iOS** | [App Store](https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256) |
| **Android APK** | [GitHub Releases](https://github.com/Hassan-PS/Mihrab/releases) → `app-fdroid-release.apk` |
| **Android (Obtainium)** | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/Hassan-PS/Mihrab) — auto-updates directly from GitHub Releases |
| **Google Play** | Coming soon |
| **F-Droid** | Coming soon ([MR #36312](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/36312)) |

---

## Build

```sh
npm install
npm start
```

### Android

```sh
# F-Droid APK (no Play Billing)
npm run android:assembleFdroidRelease

# Google Play AAB
npm run android:bundlePlayRelease
```

Outputs:
- F-Droid APK: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`
- Play AAB: `android/app/build/outputs/bundle/playRelease/app-play-release.aab`

### iOS

```sh
npm run ios
```

Archive and upload via Xcode Organizer for App Store / TestFlight.

---

## License

[Apache-2.0](LICENSE)
