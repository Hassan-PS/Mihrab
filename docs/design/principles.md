# PrayerApp — Design Principles

The app is opened in moments of intention. It should reward that with calm, not noise.

These principles are the source of truth for any visual, motion, or interaction decision. When the principles and a personal preference disagree, the principles win — preferences belong in personal forks, not in the shipped app.

---

## 1. Calm before clever

Reduce visual noise; let one thing be the focus on every screen. If the user can't tell within a second what the screen is for, the screen has too much.

The user is not browsing — they are checking a time, doing a dhikr, finding the qibla. Honor that.

**Practical rules:**
- One primary action per screen.
- One accent color, used sparingly.
- Whitespace is content. Don't fill it.
- If you're tempted to add an animation "for delight," ask whether it survives a 5 a.m. Fajr check. If not, cut it.

## 2. Reverent, not heavy

Islamic motifs (geometric patterns, calligraphy, crescents) appear as quiet accents. Never as wallpaper. Never as decoration.

A traditional Islamic geometric star at 8% opacity in a header corner on Eid is reverent. The same star tiled across the background of every screen is heavy and condescending.

**Practical rules:**
- Geometric motifs only as small accents, on contextually appropriate days (Eid, Laylat al-Qadr).
- Calligraphy reserved for Quran ayahs and dua text — never for UI labels.
- No mosque silhouettes as decorative wallpaper. They appear only in onboarding and empty states, intentionally.

## 3. Tabular precision for sacred data

Prayer times must be unambiguous. Numerals must not shimmer on tick. The grid must hold even when the device font scales.

**Practical rules:**
- Every clock numeral uses `fontVariant: ['tabular-nums']`.
- Prayer-time grid clamps font scaling at 1.3× to preserve column alignment.
- Hijri date is presented with consistent letter-spacing and never abbreviated below the month name.
- Source attribution (which provider, which calculation method, which madhab) is always one tap away.

## 4. The app shouldn't shout

Color is a tool of last resort. Use typography and space to carry the design.

**Practical rules:**
- One accent color (deep emerald in light, lifted emerald in dark). No multi-color palettes.
- Errors are friendly, not red walls of text.
- Notifications are calm: a single soft adhan voice, no flashing icon, no badge counts.
- The app does not nag. It does not gamify. It does not demand attention.

## 5. Time-of-day awareness

The app's mood softly shifts across Fajr, Dhuhr, Asr, Maghrib, and Isha. Felt, not announced.

**Practical rules:**
- A 1-pixel hairline at the top of HomeScreen takes a hue from the current prayer.
- Friday subtly highlights the Dhuhr row.
- Ramadan warms the surface tone by 1–2% saturation.
- Tahajjud window dims the screen slightly if opened in the last third of night.
- Eid greets the user once on first launch of the day — and only once.

These touches are always opt-out-able via Settings → Display → "Seasonal touches".

---

## What this is not

- Not a productivity app. We do not gamify prayer.
- Not a feed. Nothing scrolls forever.
- Not a social network. There is no leaderboard.
- Not analytics-driven. We never measure what the user does, ever.
- Not a flashlight for vendor branding. The provider is small text, never a logo.

---

## How to use this document

Before designing or implementing any new screen, color, motion, or interaction:

1. Read these principles.
2. Ask: which principle does this serve? Which does it risk violating?
3. Consult the `designer` subagent (`.claude/agents/designer.md`).
4. If you're unsure, choose the calmer, quieter option.

When the design tasks (#34–#44) ship, this file is joined by `tokens.md`, `motion.md`, `components.md`, and `seasonal-treatments.md` in this directory.
