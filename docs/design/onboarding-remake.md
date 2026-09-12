# First launch — the remake

Written 2026-09-12 at Hassan's request: *"we want to remake the entire
walkthrough in design and options, plan it out properly."*

This is the **specification**. `docs/design/onboarding-plan.md` is the
direction — what is wrong today, why it is wrong, and which four settings
are load-bearing — and it stays the argument. This document is what gets
built: every screen, every control, every settings key it writes, every
string, and what a test must hold still afterwards.

Two decisions were taken before writing it, and they change the plan:

1. **The flow asks the four essential questions, then offers a
   personalisation pass.** The plan's §3 set a hard ceiling of "five
   screens, four questions" and its §11 promised the flow would not grow.
   That ceiling is lifted — deliberately, in writing, with a rule that
   replaces it (§2 below). The plan has been amended to match rather than
   left to contradict this.
2. **`FeatureTourModal` is folded in and reused.** It leaves first launch
   entirely — the final screen shows the user's real Today card instead of
   four slides describing one — and its paged-modal machinery becomes the
   version-aware what's-new screen the app has never had (§9).

Companion reading: `docs/design/principles.md` (the five rules this
applies), `docs/design/redesign-plan.md` (the visual language it inherits).

---

## 1. The shape

Six destinations. Five of them can be counted on a progress rule; the
sixth is a shelf that is not a question and is skipped with one tap.

| # | id | kind | can it be skipped? |
|---|----|------|--------------------|
| 1 | `salam` | greeting | Continue is the only way forward, and it is instant |
| 2 | `location` | **question** | no skip control — App Store 5.1.1(iv) |
| 3 | `madhab` | **question** | "I'm not sure" is a real answer, not a skip |
| 4 | `alerts` | **question** | yes — "Not now" |
| 5 | `personalise` | shelf | yes — "Skip" in the corner, one tap |
| 6 | `ready` | proof | Start |

Today's flow is three screens on iOS and four on Android 12+, of which
exactly one contains a decision, followed by Home and then four more
slides. The remake is six screens of which four contain decisions, and
nothing follows it.

Net page count is unchanged. What changes is that every page now does
something.

---

## 2. The rule that replaces the four-question ceiling

The plan's test still stands for **questions**:

> The app cannot work it out on its own, AND being wrong about it makes
> the app wrong — not merely less pretty.

Four settings pass it: location, madhab/school, `notificationsEnabled`,
`notificationSound`. Nothing else does, and nothing else gets a screen.

The ceiling is lifted by separating that from a second, weaker thing the
flow may contain:

> **A question gets a screen. A preference gets a row on a shelf, and the
> shelf is optional in one tap.**

A preference qualifies for the shelf only if all three hold:

1. **It is off or neutral by default**, so skipping the shelf costs the
   user nothing.
2. **It is discoverable nowhere obvious.** A setting the user will trip
   over in the tab that owns it does not need a row here. Widgets and
   reciters are discovered in use; `lastThirdEnabled` is not.
3. **It can be decided in one glance** — a switch or a short segmented
   choice. Anything needing a modal, a time picker, or an explanation
   belongs in Settings.

That is why the shelf holds seven rows and not seventy, and it is the
sentence to quote the next time something wants to be added to first
launch. The failure mode this guards against is not "too many screens" —
it is a settings dump wearing a progress bar, where nothing is emphasised
because everything is present.

The consequence for design is structural, not decorative: **questions are
one-per-screen with the question as the headline and the consequence
visible; preferences are rows in a list.** A user who has answered four
things and is then handed a list understands, without being told, that
the important part is over.

### What is on the shelf, and why each earns it

| row | key(s) | default | why not Settings-only |
|---|---|---|---|
| Pre-prayer reminder | `prePrayerReminderMinutes` | `0` | The single most-wanted feature nobody finds; meaningless *after* you have missed a prayer. **Rendered on the alerts screen, not the shelf** — it passes the shelf's test but lives beside the permission it depends on, and offering it on two consecutive screens is the redundancy the shelf exists to avoid |
| Sunrise | `sunriseEnabled` | `true` | Shown by default, so this is the row that lets someone turn it **off** — the only off-by-default-inverted row here |
| Islamic midnight | `islamicMidnightEnabled` | `false` | Invisible until enabled; a user who wants it does not know the app has it |
| Last third of the night | `lastThirdEnabled` | `false` | Same, and it is the one people ask for by name (qiyām) |
| Morning & evening adhkār | `morningDuaReminderEnabled`, `eveningDuaReminderEnabled` | `false`, `false` | Window-derived, needs no time picker — one switch writes both |
| Theme | `appearance` | `'system'` | One segmented control, live |
| Accent | `appAccentId` | `'green'` | Six swatches, live, and it is the one thing people change first |

Seven rows, four of which are switches. `firstThirdEnabled` is
deliberately absent — it is the subtlest of the night marks and the one
that needs the explanation Settings gives it. `clockFormat` is absent for
the same reason it is absent from the questions: `'auto'` follows the
phone and is right.

**Language is not on the shelf.** It is on screen 1, in the corner,
because the shelf is at the *end* and a person who cannot read the flow
cannot reach it. See §3.1.

---

## 3. Screen by screen

Common chrome, on every screen: a **progress rule** — a 2px hairline
across the top under the safe-area inset, `palette.accentSolid` at the
filled width over `palette.border` — replacing the string "Step 2 of 4".
It is absent on screen 1 and full on screen 6. No header, no back arrow,
no swipe (§6.5).

### 3.1 Salam — the greeting

Kept, because it is the best thing in the current flow and the only part
of first launch that sets a tone no other prayer app sets.

```
┌─────────────────────────────────┐
│                      [ English ]│  ← language chip, top-trailing
│                                 │
│      السلام عليكم ورحمة الله      │  ← SalamHero, Amiri, animated
│         تعالى وبركاته            │
│   Peace be upon you, and the    │  ← translation, muted, italic
│      mercy of Allah…            │
│                                 │
│         Welcome to Mihrab       │  ← title1
│   Prayer times and the Qur'an,  │  ← ONE line, not a paragraph
│   with nothing watching you.    │
│                                 │
│          [  Continue  ]         │
└─────────────────────────────────┘
```

**Changes from today.** The privacy paragraph becomes one line — the
current body is three clauses that say "no analytics, no trackers" twice.
The step counter goes.

**And the greeting loses its entrance.** It used to fade in over 1.1
seconds while scaling from 0.92 and sliding twenty points sideways, with
the translation coming up behind it — three effects at once on the first
thing anybody sees. It read as a splash screen: the scale is the stock
app-launch zoom, and the slide was a hardcoded `translateX` that pushed
right-to-left text in whichever direction the number said rather than the
language did. Phase 0 had fixed the Reduce Motion branch the docblock
falsely promised; the better answer turned out to be that there is
nothing to reduce. The flow's own cross-fade and the modal presentation
already bring the screen in, and a second animation on top of those is
one too many. Typography and space carry it (principle 4).

**The composition is one centred block**, not a stack under the top row.
The mark, then the salām, then — after the screen's one real gap — the
app's name and what it does, in `title2` and `body` rather than `title1`:
the salām has already done the welcoming, and a title at the same weight
would be a second greeting arguing with the first. Top-aligning this left
two thirds of a phone empty between the last line and the button, which
reads as a layout that broke rather than as calm.

**The language chip.** Label is `languageLabel(i18n.language)` from
`src/i18n/languages.ts` — the language named in itself, never translated,
which is the existing rule and the only one that works for someone hunting
for their own. Tapping it opens the existing `LanguageModal` with the
thirteen `APP_LANGUAGES`. Selecting writes `language` and
`languagePicked: true`, exactly as `LanguageCard` does.

Direction changes live: `layoutDirectionFor()` derives `'rtl'` from the
language at `AppNavigationRoot`, so choosing Arabic or Urdu re-lays the
flow out in place. **No restart, no `I18nManager.forceRTL`** — which is
why this affordance can exist at all, and is worth knowing before anyone
tries to "fix" it with a reload.

Skipping this screen is Continue; there is no second button, because a
greeting with a Skip next to it is two buttons that do the same thing —
the flaw the current welcome step has.

### 3.2 Where you are — location

Substance unchanged: `LocationSetup` embedded, GPS or city search or
manual coordinates, **no skip control**. App Store guideline 5.1.1(iv)
requires a location pre-permission screen to lead to the prompt with no
exit or delay affordance; the manual city path is the escape hatch and is
inside the widget, not beside it. This contract is pinned by a test
(§13) precisely because a redesign is how it would get broken.

**What changes is the eighty milliseconds after the coordinates land.**
Today `OnboardingScreen`'s effect auto-advances on a 80ms timer the
moment `locationOnboardingComplete` flips. Instead: the widget collapses
to the resolved city name, and today's five times fade in beneath it,
computed, in tabular numerals — then the screen advances after **1400ms**,
or immediately if the user taps Continue.

This is the first moment the app proves it works, and it currently passes
it by faster than the eye. It is also the setup for screen 3, which can
only show a real ʿaṣr because this screen just established where.

If the user is re-running onboarding from Settings and location is already
set, this screen is skipped entirely, as today.

### 3.3 How you pray — madhab  ·  **new**

The question the app has never asked, and the one that changes the numbers
on the main screen.

```
┌─────────────────────────────────┐
│ ▁▁▁▁▁▁▁▁▁░░░░░░░░░░░░░░░░░░░░░░ │
│                                 │
│        How do you pray?         │  ← title1, the question IS the headline
│                                 │
│                     ʿAṣr today  │  ← column label
│  ┌───────────────────────────┐  │
│  │ ○  Hanafi           17:02 │  │
│  │ ○  Maliki           16:08 │  │
│  │ ●  Shafii           16:08 │  │
│  │ ○  Hanbali          16:08 │  │
│  │ ○  I'm not sure     16:08 │  │
│  └───────────────────────────┘  │
│  Only the Hanafi reckoning      │
│  moves ʿaṣr — the other schools │
│  share the majority time.       │
│          [  Continue  ]         │
└─────────────────────────────────┘
```

**The design point is the column of times.** Each row carries the ʿaṣr
that choosing it produces, computed for today at the user's own
coordinates. Nobody has to know what a shadow ratio is to see what the
choice does — which is the entire argument for asking this question here
rather than leaving `madhab: null` to render as "Custom" in Settings
forever.

> **It was one animated line, and that was wrong.** The first build put
> a single "ʿAṣr today" row under the list which animated `16:12 → 17:38`
> for a second when the choice changed, then settled on the new value.
> It was a riddle. The old time flashed and vanished, so anyone not
> watching at that moment was left with a bare number and no reason
> attached; anyone who did catch it saw two numbers and an arrow with
> nothing saying what had moved; and on first arrival there was no
> "from" at all, so the line opened as a time with no context whatever.
>
> A column needs none of it: the consequence is permanently on screen,
> comparable at a glance rather than from memory, and it tells the truth
> the picker has always encoded — four names, two answers. Nothing
> animates, so nothing has to be caught. The sentence under the card is
> there because three rows showing the same time reads as a bug until
> something says it is not.

**"I'm not sure" is the fifth row**, not a text button beside the list.
It is a real answer — somebody may genuinely not claim a school — so it
belongs in the group, selectable, carrying its own time like the rest.
Selected, it shows what it means as a second line rather than leaving
the user to infer it from the word "Custom" in Settings later.

**Writes**, on each tap, immediately (§6.6):

```ts
updateAllSettings({
  madhab,                        // 'hanafi' | 'maliki' | 'shafii' | 'hanbali'
  school: asrSchoolFor(madhab),  // 1 for hanafi, 0 for the rest
});
```

`asrSchoolFor` already exists in `src/prayer/madhab.ts`; do not re-derive
it. The pair must be written together or `selectedMadhab()` falls back to
Custom and the answer is silently discarded.

**"I'm not sure"** writes `school: 0` and `madhab: null`, and says so
plainly in a caption that appears under it once tapped: *"We'll use the
majority ʿaṣr — you can change this any time in Settings."* This is
honest about what Custom means instead of hiding it, and it is a real
answer rather than a skip: the user has been asked and has declined to
claim a school, which is a thing a person may genuinely be.

**Mālikī reveals one row, inline, defaulted on:**

> Also show the second prayer times (ikhtiyārī and ḍarūrī)

writing `malikiSecondTimesEnabled: true`. It appears only under Mālikī and
disappears if the user changes their mind — and when it disappears the key
is written back to `false`, so a Mālikī-then-Shāfiʿī user is not left with
a setting they can no longer see. No other school sees this row at all.

### 3.4 Alerts — the permission, and what it will sound like

One screen that finally does the whole job, and the screen where §2.1 of
the plan is already half-fixed (Phase 0 shipped the write; this rebuilds
what surrounds it).

```
┌─────────────────────────────────┐
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁░░░░░░░░░░░░░░ │
│                                 │
│  Notify you at prayer times?    │
│   A notification when each       │
│   prayer comes in — with the     │
│   adhan, or your phone's own     │
│   tone. This device only.        │
│                                 │
│          [  Yes, notify me  ]   │  ← triggers the OS prompt
│                                 │
│  ── after a grant ──────────────│
│   Adhan                         │
│   ● Adhan · Makkah      ▶       │
│   ○ Adhan · Madina      ▶       │
│   ○ Adhan · Abdul Basit ▶       │
│   ○ Default notification        │
│                                 │
│   Remind me before      [ Off ▾]│
│   Exact timing          [ Fix ] │  ← Android 12+ only
│                                 │
│              Not now            │
└─────────────────────────────────┘
```

> **It says "notify", not "call".** The first draft asked *"Should we
> call you?"*, which reads as a promise of the adhan — and the adhan is
> one of four choices on this very screen, the default being the phone's
> own tone. A screen that asks for permission to do one thing and then
> offers to do a quieter thing instead has mis-sold itself in its own
> headline. The body now names both outcomes, so the question and the
> rows under it agree.

**The permission, and what it writes.** `requestNotificationPermission()`
(`src/notifications/requestNotificationAccess.ts`, added in Phase 0) is
the only path — it handles the iOS notifee request and the Android 13+
`POST_NOTIFICATIONS` request behind one boolean. On `true`:
`updateAllSettings({ notificationsEnabled: true })`. On `false`, nothing
is written, ever: a settings key claiming the app may notify while the OS
forbids it is a lie the Home banner then has to untangle, and it makes the
Settings switch read as on while nothing arrives.

**Denied is not a dead end.** The screen redraws to say so in one line —
*"Your phone is set to block notifications from Mihrab. You can turn them
on later in Settings → Notifications."* — keeps Continue, and hides the
adhan and reminder rows, because choosing a sound for alerts that cannot
fire is furniture.

**The adhan, here, not in Settings.** Seventeen adhans ship in
`src/notifications/notificationSounds.ts` and the default is
`'default'` — the system tone — which is how a large share of people
conclude a prayer app has no adhan. Four rows only: `adhan_makkah`,
`adhan_madina`, `adhan_abdul_basit`, `default`. Each has a play control
using the existing `previewAdhanSound(id)` /`stopAdhanPreview()` from
`src/notifications/prayerNotifications.ts`; preview stops on unmount and
on advance. Selecting writes `notificationSound`. Labels come off each
option's own `labelKey`, so this list is a filter over the registry
rather than a second copy of four names.

> **Built as a caption, not a modal.** The first draft of this section
> gave the remaining thirteen a "More adhans" row opening
> `SoundPickerModal`. That modal also owns the import-your-own path —
> `customAdhan`, `importingCustom`, `onImportCustom`, `onRemoveCustom`,
> and the native `pickCustomAdhan` / `removeCustomAdhan` / `syncCustomAdhan`
> plumbing behind them. Opening it here means either wiring all of that
> into first launch, or passing no-ops and rendering an Import row that
> does nothing. Neither is worth it on a screen whose question is whether
> the app speaks at all, so "More adhans in Settings" is a muted caption
> under the four rows, and `SoundPickerModal` keeps one call site.

Volume and per-prayer alert modes are not here. They are per-prayer
decisions made in context, and this screen is about whether the app
speaks at all.

**Remind me before** is `prePrayerReminderMinutes` — the same eight
options as Settings (`PRE_PRAYER_REMINDER_OPTIONS`: 0, 5, 10, 15, 20, 30,
45, 60), default `0` = Off. Shown only after a grant. This row is on the
shelf in spirit but lives here in practice, because its subject is alerts
and it is meaningless to someone who just declined them.

**Exact timing** replaces the entire fourth screen on Android 12+. Today
`exactAlarms` is a whole page whose content is a paragraph about a system
dialog. Here it is one row, shown only when
`notifee.getNotificationSettings()` reports
`android.alarm !== AndroidNotificationSetting.ENABLED`, with a Fix button
calling `openAlarmPermissionSettings()`. The user leaves to system
settings and comes back to this same screen, which re-checks on focus and
shows the row as resolved. That is strictly better than today, where
returning drops you onto whatever came next.

**"Not now"** advances without writing anything.

### 3.5 Make it yours — the shelf

The new part, and the one that must not read as another question.

```
┌─────────────────────────────────┐
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁░░░░░░░░ │
│                            Skip │  ← top-trailing, quiet
│       Make it yours             │
│   None of this is required.     │
│                                 │
│  TIMES                          │
│   Sunrise                   [●] │
│   Islamic midnight          [○] │
│   Last third of the night   [○] │
│  DAILY                          │
│   Morning & evening adhkār  [○] │
│  LOOK                           │
│   Theme    [System][Light][Dark]│
│   Accent    ● ● ● ● ● ●         │
│                                 │
│          [  Done  ]             │
└─────────────────────────────────┘
```

**It is a list, not a sequence.** One scrolling screen with four small
section headers in `label` type, `palette.muted`, built from the existing
`SettingsGroup` + `SettingsToggleRow` components in
`src/screens/settings/SettingsGroup.tsx` — not a lookalike — so it *is*
the Settings idiom rather than resembling it. The visual rhyme is the
teaching: *this is where these things live.* It also means the shelf
inherits the row components' accessibility and RTL behaviour for free,
which is most of §6.4 and §7 already done.

**Every row is live.** Theme and accent re-paint the screen under the
user's finger — including the progress rule and the Done button, which is
the cheapest possible demonstration that the choice took. The night-time
switches show the resulting time inline once on (`Islamic midnight ·
00:47`), computed from the location taken on screen 2, because a switch
labelled with a concept is worth less than one labelled with a time.

**Skip is one tap, top-trailing, and writes nothing.** It does not
confirm. A shelf that asks "are you sure you want to skip?" is a question,
and this is explicitly not one.

**Adhkār** is one switch writing two keys —
`morningDuaReminderEnabled` and `eveningDuaReminderEnabled` — because
they are one habit and both are window-derived (after Fajr/before
sunrise; after ʿAṣr/before sunset), so neither needs a time picker. The
row is hidden entirely when notification permission was denied, for the
same reason the adhan list is.

**Accent** writes `appAccentId` from the six named values in
`AppAccentId` — `green`, `teal`, `blue`, `amber`, `rose`, `violet`. The
seventh, `'custom'`, is not offered: it needs a hex field. If
`useSystemDynamicTheme` is on, the accent row is hidden, matching
`AppearanceCard`'s existing rule that the picker disappears in dynamic
mode.

### 3.6 Ready — the proof

Not a summary of what was chosen. The user's own day: their city, their
times, and the prayer that is actually next, picked by
`getNextPrayerDisplay` — the very function Home's watchdog calls.

> **Built without instantiating `TodayCard`,** and §11.3 is the reason.
> The promise this screen has to keep is that the user sees their own
> data rather than a description of it, and it keeps that promise. What
> it does not do is assemble a second, subtly different version of Home's
> prop bag. When `useTodayCardProps()` exists, this screen calls it and
> the card appears here for real.

Under it, one line and three links — the three things people change next,
each a deep link into the page that owns it:

- **Calculation method** → `SettingsPrayerTimes`
- **Per-prayer alerts** → `SettingsNotifications`
- **Widgets** → `SettingsWidgets`

Then **Start**, which is where `onboardingComplete` and
`locationOnboardingComplete` are written and the modal dismisses onto
Home — which now shows the card the user has just been looking at, in the
same place, at the same size. The flow ends by handing the user the app
rather than a door to it.

This screen replaces `FeatureTourModal` entirely (§9).

---

## 4. Everything the flow writes

The complete list. If a key is not in this table, onboarding does not
touch it.

| key | type | default | screen | written when | value |
|---|---|---|---|---|---|
| `language` | `AppLanguage` | `'en'` | 1 | language chosen in the chip | chosen |
| `languagePicked` | `boolean` | `false` | 1 | same | `true` |
| *(coordinates)* | — | — | 2 | `LocationSetup` on its own behalf | — |
| `locationOnboardingComplete` | `boolean` | `false` | 2 / 6 | location committed, or at Start | `true` |
| `madhab` | `Madhab \| null` | `null` | 3 | school tapped | chosen, or `null` for "not sure" |
| `school` | `number` | `0` | 3 | same tap, same write | `asrSchoolFor(madhab)` |
| `malikiSecondTimesEnabled` | `boolean` | `false` | 3 | Mālikī chosen / unchosen | `true` / `false` |
| `notificationsEnabled` | `boolean` | `false` | 4 | permission **granted** | `true` — never on deny |
| `notificationSound` | `NotificationSoundId` | `'default'` | 4 | adhan row tapped | chosen id |
| `prePrayerReminderMinutes` | `PrePrayerReminderMinutes` | `0` | 4 | picker changed | chosen |
| `sunriseEnabled` | `boolean` | `true` | 5 | switch toggled | as set |
| `islamicMidnightEnabled` | `boolean` | `false` | 5 | switch toggled | as set |
| `lastThirdEnabled` | `boolean` | `false` | 5 | switch toggled | as set |
| `morningDuaReminderEnabled` | `boolean` | `false` | 5 | adhkār switch | as set |
| `eveningDuaReminderEnabled` | `boolean` | `false` | 5 | same switch, same write | as set |
| `appearance` | `AppearancePreference` | `'system'` | 5 | segment tapped | chosen |
| `appAccentId` | `AppAccentId` | `'green'` | 5 | swatch tapped | chosen |
| `onboardingComplete` | `boolean` | `false` | 6 | **Start** | `true` |

Eighteen keys, against today's two. Twelve of them are only written if the
user actually chose something — a skipped shelf writes nothing at all,
and that is the contract that makes the shelf safe to offer.

**No key is written on exit-without-answering.** Abandonment is not an
answer; see §8.2.

---

## 5. The strings

All under `onboarding.*`, all thirteen locales, English source below.
Keys that exist today and survive are marked *(kept)*; the four removed
keys are listed at the end.

```
onboarding.skip                     Skip                      (kept, retitled from "Skip for now")
onboarding.notNow                   Not now
onboarding.start                    Start
common.continue                     Continue                  (exists — reused, not duplicated)
common.done                         Done                      (exists — reused, not duplicated)

onboarding.salamA11y                As-salāmu ʿalaykum…       (kept)
onboarding.welcome.salam            Peace be upon you…        (kept)
onboarding.welcome.title            Welcome to Mihrab
onboarding.welcome.body             Prayer times and the Qur'an, with nothing watching you.
onboarding.welcome.language         Language

onboarding.location.title           Where are you?            (retitled)
onboarding.location.body            Prayer times depend on where you stand. Your coordinates are encrypted on this device and never leave it.
onboarding.location.cta             Use my location           (kept)
onboarding.location.ready           Today in {{city}}

onboarding.madhab.title             How do you pray?
onboarding.madhab.body              This sets when ʿaṣr begins for you.
onboarding.madhab.asr               ʿAṣr today
onboarding.madhab.unsure            I'm not sure
onboarding.madhab.unsureNote        We'll use the majority ʿaṣr — you can change this any time in Settings.
onboarding.madhab.malikiSecond      Also show the second prayer times (ikhtiyārī and ḍarūrī)

onboarding.alerts.title             Notify you at prayer times?
onboarding.alerts.body              A notification when each prayer comes in — with the adhan, or your phone's own tone. This device only.
onboarding.alerts.cta               Yes, notify me
onboarding.alerts.denied            Your phone is set to block notifications from Mihrab. You can turn them on later in Settings → Notifications.
onboarding.alerts.adhan             Adhan
onboarding.alerts.adhanMore         More adhans
onboarding.alerts.preReminder       Remind me before
onboarding.alerts.exact             Exact timing
onboarding.alerts.exactFix          Fix
onboarding.alerts.exactWhy          Android needs one more permission so alerts fire on the minute, not minutes late.

onboarding.personalise.title        Make it yours
onboarding.personalise.body         None of this is required.
onboarding.personalise.groupTimes   Times
onboarding.personalise.groupDaily   Daily
onboarding.personalise.groupLook    Look
onboarding.personalise.adhkar       Morning & evening adhkār
onboarding.personalise.theme        Theme
onboarding.personalise.accent       Accent

onboarding.ready.title              You're ready
onboarding.ready.body               Most people change one of these next.
onboarding.ready.method             Calculation method
onboarding.ready.alerts             Per-prayer alerts
onboarding.ready.widgets            Widgets
```

Reused rather than re-translated — the exact keys, checked against
`en.json` rather than guessed:

- school names — `settings.madhab_hanafi` / `_maliki` / `_shafii` /
  `_hanbali`
- adhan names — **each sound's own `labelKey`** from
  `NOTIFICATION_SOUND_OPTIONS` (`settings.notificationSoundMakkah`,
  `…Madina`, `…AbdulBasit`, `…Default`). The list on screen 4 reads them
  off the same registry `SoundPickerModal` does; it does not carry its
  own copy of four names.
- extra times — `settings.sunriseTime`, `settings.islamicMidnight`,
  `settings.lastThird`
- appearance — `settings.appearance` and its option labels
- the `PRE_PRAYER_REMINDER_OPTIONS` labels as Settings renders them

A second translation of a string the app already has is a second thing to
keep in sync and a chance for them to disagree. That is also why
`onboarding.alerts.adhanSystem` above is struck: it would have been a
thirteen-locale retranslation of `settings.notificationSoundDefault`.

**Removed:** `onboarding.stepLabel` (the progress rule replaces it),
`onboarding.exactAlarms.title` / `.body` / `.cta` (folded into
`onboarding.alerts.exact*`), `onboarding.welcome.body` is rewritten in
place, and the entire `tour.*` namespace moves to `whatsNew.*` (§9).
`onboarding.next` / `onboarding.done` were already deleted in Phase 0 and
are **not** revived — the shelf's button uses `common.done`, which the app
already has in all thirteen locales, and the greeting's uses
`common.continue`, which the welcome step already uses today.

---

## 6. Design

Applying `principles.md`, not inventing a second visual language.

### 6.1 Type and colour

`typeStyle('title1')` for the question, weight 700, centred — the
question is the headline and there is no second heading under it.
`typeStyle('body')` `palette.muted` for the one line beneath, where a line
is needed at all. Rows use the Settings idiom so the shelf rhymes with
where these settings live.

Tokens only: `SPACING`, `RADIUS.md` for the primary button, `RADIUS.lg`
for grouped cards, `palette.accent` for the one primary action per screen,
`palette.muted` for every secondary. `node scripts/tokens-audit.js
--summary` must still print `audit findings 0` — the Arabic salām's
hand-set 30/50 is the existing `tokens-ok-line` exception and stays the
only one.

**Tabular numerals everywhere a time appears** — the ʿaṣr line, the
computed times on screen 2, the night marks on the shelf, the Today card.
These screens show times now, which they never did before, and a
proportional digit that shifts as the value changes undoes the whole
point of showing it change.

### 6.2 The progress rule

2px, full width, under the top safe-area inset. Filled portion
`palette.accentSolid`, track `palette.border` — and `palette.muted` at
0.25 where border is transparent under the iOS Liquid Glass palette, the
same trap the feature tour's dots already fell into and fixed.

Width animates over 240ms `Easing.out(Easing.quad)` on advance. Absent on
screen 1, 1/5 through 5/5 on screens 2–6. It replaces
`onboarding.stepLabel` — text the user must read to learn something a line
can show (principle 4).

### 6.3 Motion

Screens cross-fade over 220ms, and that is the only entrance anything in
this flow gets — no screen animates its own contents on top of it (§3.1).

Under Reduce Motion — `isReduceMotion()` from `src/theme/motion.ts`, the
cached read, not the hook that starts false and corrects itself a frame
later — the cross-fade becomes an instant swap and the progress rule
jumps. The ʿaṣr value still changes; only its animation stops.
**Nothing that carries information may be animation-only.**

### 6.4 RTL

`paddingStart` / `paddingEnd` and the Start/End radius props throughout —
the RTL-audit test enforces this and will fail a `paddingLeft` on sight.
Specifics worth stating because they are where this breaks:

- The language chip and the Skip control sit **top-trailing**, which is
  the left in Arabic. Position them with `alignItems: 'flex-end'` inside a
  `row`, never `justifyContent: 'flex-end'` on an explicitly reversed row.
- The progress rule fills **from the leading edge** — right to left in
  Arabic. It is a `flexDirection: 'row'` container with the filled view
  first; the direction does the mirroring.
- The ʿaṣr `16:12 → 17:38` arrow must point in the reading direction. Use
  `→` in LTR and `←` in RTL, chosen from `i18n.dir()`, not a glyph that
  happens to mirror in one font and not another.
- Screen slide direction follows `i18n.dir()`.

### 6.5 Route and dismissal

```ts
<Stack.Screen
  name="Onboarding"
  component={OnboardingScreen}
  options={{
    presentation: 'modal',
    headerShown: false,
    gestureEnabled: false,
  }}
/>
```

Today it is an ordinary push with a header, so the back arrow and the
swipe both drop the user out mid-flow onto a Home that may be nothing but
a full-screen location wall. Leaving should be a decision — Skip, Not now,
or Start — not a gesture. Android's hardware back is likewise intercepted:
it steps **back one screen** within the flow and does nothing on screen 1.

That back step is the one navigation affordance the flow gains, and it is
worth having: the answers are written as they are made, so going back to
screen 3 shows the school the user already chose, selected.

### 6.6 Write as you go

Every screen commits its answer at the moment it is made — not at Start.
A flow abandoned on screen 4 keeps the madhab chosen on screen 3, and a
user who force-quits on the shelf keeps everything before it. Only
`onboardingComplete` waits for Start, because that flag means "this
person has been through the flow", which is the one fact that is not true
until they have.

### 6.7 Tablet and large screens

`useBreakpoint()` is already subscribed. At `md` and above the content
column caps at 560pt and centres; the shelf's rows do not stretch to a
1024pt iPad width, and the Today card on screen 6 renders at its compact
size rather than filling the screen. No master-detail, no two-column
layout — this is a linear flow and splitting it would only make the
progress rule lie.

---

## 7. Accessibility

Not a section to satisfy a checklist — this flow is the first thing a
screen-reader user meets, and if it fails they never reach the app.

- **Every control has an `accessibilityRole` and a label.** The school
  rows are `radio` with `accessibilityState={{ checked }}`, grouped in a
  `radiogroup`; the shelf's switches are `switch` with `checked`; the
  theme segments are `radio`, not three buttons.
- **The ʿaṣr line is announced on change.** It is the consequence the
  sighted user sees; the screen-reader user must hear it. An
  `accessibilityLiveRegion="polite"` (Android) plus an
  `AccessibilityInfo.announceForAccessibility` on change (iOS) saying
  *"ʿAṣr today, 17:38"*.
- **The progress rule is not announced as a decoration.** It carries
  `accessibilityRole="progressbar"` with `accessibilityValue={{ min: 1,
  max: 5, now }}`, which is the one place the removed "Step 2 of 4"
  string genuinely said something — and this says it without putting it
  on screen.
- **The salām hero keeps its `accessibilityLabel`** —
  `onboarding.salamA11y`, transliterated, so a non-Arabic screen reader
  says it rather than spelling it.
- **Reduce Motion** as §6.3. **Bold Text and Dynamic Type**: no fixed
  heights on rows containing text; the shelf scrolls.
- **Contrast**: the muted secondary labels must clear 4.5:1 against
  `palette.bg` in both themes — the accent swatch row is the risk, since a
  selected swatch's checkmark sits on the accent itself.
- **Focus order** follows the visual order, and moving to a new screen
  sets focus to its title.

---

## 8. Edge cases and state

### 8.1 The permission was already granted

Re-running from Settings, or an OS that pre-grants: screen 4 opens in its
granted state, with the adhan list showing the current `notificationSound`
selected, and does not re-ask — `notifee.getNotificationSettings()` on
mount and on every return to the foreground decides which face the screen
wears.

**"Granted" means both halves.** The face is derived, not stored: the OS
allows it *and* `notificationsEnabled` is on. Somebody re-running setup
who turned alerts off in Settings still holds the OS permission; showing
them the adhan list as if alerts were on — while the shelf, which reads
the switch, hides its alert rows — would be two screens disagreeing about
one fact. Such a user sees the CTA again, and pressing it (which returns
at once, the permission being held) is what turns the switch back on.
Nothing is flipped behind their back. A refusal clears the moment the OS
reports the permission granted, so the exact-alarm row's trip to system
settings can bring the user back with it fixed.

### 8.2 Abandonment

Force-quit, or backgrounded and never returned to. Everything answered so
far is already written (§6.6); `onboardingComplete` is not. Next launch
routes back into the flow, which **restarts at screen 1** rather than
resuming mid-flight — and every screen it passes shows the answer already
given, so re-walking it is four taps, not four decisions. Resumption
state is a fourth persisted flag for a case that costs eight seconds; it
is not worth the key.

### 8.3 Location denied at the OS level

`LocationSetup` already handles this — the city search and manual
coordinate paths complete the step without the OS permission, and the
step's completion is `locationOnboardingComplete`, not a granted
permission. Screen 2's computed-times pause simply does not happen if no
coordinates were committed; the screen keeps its Continue and moves on.
Screens 3 and 5 then have no times to show: the ʿaṣr line and the night
marks render as `—` rather than a zero. **Never `(0,0)`** — the sentinel
is not a location and must never be treated as one.

### 8.4 Re-running from Settings

`SettingsAbout` sets `onboardingComplete: false`, which the auto-router
picks up. The flow runs identically, except screen 2 is skipped when
location is already set. Every screen shows current values as its
selected state — this is what makes re-running useful rather than
destructive, and it is why the "Show onboarding again" row gets renamed
(§10.3) to say what it now is.

### 8.5 Upgraders

Phase 0 added the missing `onboardingComplete` migration (absent ⇒
`true`) in `src/settings/storage.ts`, so an existing user updating into
this build is **not** shown the new-user flow. They get the what's-new
screen instead (§9), which is what they should have been getting all
along.

### 8.6 The device is offline

Nothing in the flow needs the network. City search does; GPS and manual
coordinates do not, and the times are computed locally. Screen 2's search
field surfaces its own error, as it does today.

### 8.7 Language changed mid-flow

Live re-layout, no restart (§3.1). The screen index is preserved, answers
are preserved, and the direction flips under the user. The one thing to
watch is that a screen mid-transition does not flip while animating —
commit the language change on modal dismiss, not during.

---

## 9. The feature tour becomes what's-new

`FeatureTourModal` is a paged, RTL-aware, skippable, full-screen modal
with a persisted seen-flag and dots. That is not a bad component. It is a
component pointed at the wrong problem: it is a **second welcome**, in a
second visual idiom, shown immediately after the first one, to a user who
has just been welcomed.

Meanwhile the app has no what's-new surface at all — greps for
`whatsNew`, `lastSeenVersion`, `releaseNotes` in `src/` return nothing,
and `CHANGELOG.md` is linked only from the marketing site.

### What changes

1. **Remove it from first launch.** Delete the `hasSeenFeatureTour()` call
   and the modal from `HomeScreen` (imports at :76-78, the effect at
   :293, the render at :1279). Screen 6 does this job with the user's own
   data.
2. **Rename the module** `src/polish/FeatureTourModal.tsx` →
   `src/polish/WhatsNewModal.tsx`, exporting `WhatsNewModal`. Keep the
   pager, the dots, the skip, the CTA, the palette handling and the RTL
   note verbatim — all of it is right, and re-deriving it would only lose
   the two bug-fixes already baked in (muted dots under Liquid Glass, the
   logical page order under RTL).
3. **Replace the flag with a version.** `'mihrab.featureTour.v1'` becomes
   `'mihrab.lastSeenVersion'`, holding the app version string rather than
   `'1'`. Shown when the stored version is **present and lower** than the
   running one. Present matters: absent means a fresh install, which has
   just finished onboarding and must not be handed release notes.

   **Except on the day this ships.** `lastSeenVersion` did not exist
   before 2.18.6, so every existing user updates into "no stored version"
   — indistinguishable from a fresh install, which is shown nothing. Left
   there, the release that introduced release notes could never announce
   itself. What an existing install *does* have is the old tour flag,
   written the first time Home appeared after onboarding on every build
   since the tour shipped. So `readLastSeenVersion` reads both keys: a
   stored version wins; otherwise a present tour flag means "ran a build
   before release notes existed" and resolves to `LEGACY_BASELINE_VERSION`
   (`2.18.5`, the last version without them); otherwise fresh. The flag
   is read, never written again, and a test holds the baseline behind
   the first version in the table. Whenever there is nothing to show the
   current version is stamped, so the next update is an upgrade from
   here rather than from the baseline.
4. **Content per release.** A small module — `src/polish/whatsNew.ts` —
   mapping a version to a short list of `{ icon, titleKey, bodyKey }`.
   One to three slides, not four by habit; a release with nothing worth a
   slide gets an empty list and shows nothing, which must be the default
   rather than a thing someone remembers to do.
5. **Strings** move `tour.*` → `whatsNew.*`, and the four current slides
   are retired with the tour — they describe the app, not a release.
6. **Settings** loses "Show the app tour" and gains nothing: a what's-new
   screen replayed on demand is a changelog, and `CHANGELOG.md` is
   already that. See §10.4.

### Why this is independent

Nothing in §§3–8 depends on it and it depends on nothing there. It could
ship before the remake, after it, or in the same release. It is listed as
Phase 3 only because it is the least urgent, not because it is blocked.

---

## 10. Settings, after this

Nothing moves **out** of Settings. A setting asked during onboarding that
could not then be found again would be worse than one never asked. What
changes is that these arrive already answered, and that two rows stop
lying.

1. **Prayer times → Calculation.** `madhab` no longer reads "Custom" on a
   fresh install, because the user will have said. Row order should put
   the school above the calculation method: it is the row people look
   for, and it currently sits below a control most users should never
   touch.
2. **Notifications.** The master switch is already on for anyone who
   granted permission. `NotificationsCard`'s existing permission path is
   unchanged and remains where a denied permission gets fixed.
3. **About → "Show onboarding again"** is renamed to **"Set up again"**
   with a caption naming what it re-asks — *location, school, alerts and
   the rest*. It is non-destructive and now genuinely useful: it is a way
   to revisit four real answers rather than re-read three paragraphs.
4. **About → "Show the app tour"** is removed with the tour, along with
   `resetFeatureTour()` and its import.
5. **Extra times** and **Daily reminders** pages are untouched in content.
   The shelf offers a subset of each; both pages remain the full,
   explained versions, and a value set on the shelf shows there as set.

---

## 11. Architecture

### 11.1 Files

| file | what happens |
|---|---|
| `src/onboarding/steps.ts` | step ids become `salam \| location \| madhab \| alerts \| personalise \| ready`; `exactAlarms` is deleted as a step and becomes a row |
| `src/onboarding/OnboardingFlow.tsx` | **new** — the container: route, progress rule, transitions, back handling, per-screen dispatch |
| `src/onboarding/screens/*.tsx` | **new** — one file per screen, each a pure component taking values + callbacks |
| `src/screens/OnboardingScreen.tsx` | shrinks to the route entry that renders `OnboardingFlow`; `SalamHero` moves to `src/onboarding/screens/SalamScreen.tsx` |
| `src/navigation/RootNavigator.tsx` | route options per §6.5 |
| `src/screens/HomeScreen.tsx` | feature-tour import, effect and render removed |
| `src/polish/FeatureTourModal.tsx` | → `src/polish/WhatsNewModal.tsx` |
| `src/polish/whatsNew.ts` | **new** — version → slides |
| `src/screens/settings/AboutCard.tsx` | tour row removed, onboarding row renamed |
| `src/i18n/locales/*.json` | thirteen files, §5 |

### 11.2 The step machine

`buildOnboardingSteps(locationDone)` keeps its shape — a pure function
returning an ordered list, which is what makes it testable — and gains
nothing platform-conditional, because the one platform-conditional step
is gone. The list is now the same six everywhere, minus `location` when
it is already done. That is a simplification worth noticing: the current
function's Android-12 branch exists only to add a screen that should
never have been one.

### 11.3 Screen 6 and `TodayCard`

`TodayCard` takes a large prop set — `week`, `nextInfo`, `resetKey`,
`getDayLabel`, `getDayDate`, `getWeekday`, and a dozen optional ones —
all assembled inside `HomeScreen`. Screen 6 must not hand-assemble a
second, subtly different version of that: two call sites computing
`nextInfo` two ways is exactly how the two screens end up disagreeing
about which prayer is next.

Lift the assembly into a hook — `useTodayCardProps()` — used by both.
If that proves more invasive than it looks, the fallback is to render only
the hero portion on screen 6 with the same hook's subset, and **not** to
duplicate the props. A copy is not an acceptable third option.

**It proved more invasive than it looks, and the fallback is what
shipped.** The assembly is a ~70-line memo inside `HomeScreen` that
filters the four optional non-prayer rows by their toggles, injects the
Mālikī second times across past-plus-week and splits them apart again,
plus a thirty-second watchdog holding `nextInfo` in state. Lifting that
is a refactor of the most delicate screen in the app, and riding it along
inside an onboarding change is how a release breaks. So screen 6 shows
the same real times the three screens before it computed, and calls
`getNextPrayerDisplay` — Home's own function — for what is next. No
duplicated derivations, and the promise the screen makes to the user is
unchanged. `useTodayCardProps()` remains the right next step, on its own.

---

## 12. Phases

Each ships on its own and leaves the app better than it found it.

### Phase 0 — the bugs  ·  **done, 2026-09-12**

Shipped before this document was written, and independent of it:

1. `notificationsEnabled: true` is written when the permission is granted
   — the silent-app bug.
2. The `onboardingComplete` migration, so upgraders stop being routed
   into the new-user greeting.
3. Reduce Motion honoured in `SalamHero` — since retired with the
   animation itself (§3.1).
4. `onboarding.next` / `onboarding.done` deleted from thirteen locales.

Two new test files pin the first two.

### Phase 1 — the questions  ·  **done, 2026-09-12**

Screens 3 and 4: madhab, and the rebuilt alerts screen with the adhan
list, the pre-prayer row and the folded-in exact-alarm row. `exactAlarms`
leaves `steps.ts`. New strings, thirteen locales.

The flow still looks like it does today — scrolling page, crescent,
stacked buttons. It just asks the right things. **This is where most of
the user-visible value is**, and it is deliberately first: a beautiful
flow that asks nothing is what we have now.

### Phase 2 — the design  ·  **done, 2026-09-12**

Screens 1, 2, 5 and 6, and the chrome: the language chip, the computed-
times pause, the shelf, the live Today card, the progress rule, the modal
route, the transitions, the tablet cap. Now that the flow asks real
questions, the design has something to be the design *of*.

The shelf is the largest single piece of new UI in the project and could
be split out as its own step if Phase 2 runs long — screens 1, 2 and 6
are coherent without it.

### Phase 3 — what's new  ·  **done, 2026-09-12**

§9, whole. Independent; could equally ship first.

---

## 13. Tests

Current coverage is one pure-function test on `buildOnboardingSteps`
(`__tests__/featureModulesPart2.test.ts:112-138`) plus locale parity, and
the two files Phase 0 added (`onboardingWrites.test.ts`,
`onboardingUpgradeMigration.test.ts`). Nothing renders the flow.

What must be pinned, in the repo's existing idiom:

**What it writes, per answer** — the assertions whose absence caused the
silent-app bug, extended to every key in §4:

- granting notifications sets `notificationsEnabled`; **denying writes
  nothing** (already pinned, keep)
- Ḥanafī ⇒ `school: 1` **and** `madhab: 'hanafi'` in one write; the other
  three ⇒ `school: 0`
- "I'm not sure" ⇒ `madhab: null`, `school: 0`
- Mālikī ⇒ `malikiSecondTimesEnabled: true`; changing away from Mālikī ⇒
  `false`
- the adhkār switch writes **both** `morningDuaReminderEnabled` and
  `eveningDuaReminderEnabled`
- **a skipped shelf writes nothing at all** — the contract that makes the
  shelf safe

**Structure and flow:**

- `buildOnboardingSteps` returns the six ids, and five when
  `locationDone`; no platform branch remains
- the location screen still has **no skip control** — a guideline
  compliance contract, and exactly the kind of thing a redesign breaks
  silently
- answers survive abandonment: a flow left on screen 4 keeps screen 3's
  madhab
- `onboardingComplete` is written **only** at Start, never earlier
- hardware back steps within the flow and does not dismiss it
- re-running from Settings opens each screen with current values selected

**i18n and layout:**

- locale parity for every new `onboarding.*` and `whatsNew.*` key across
  thirteen locales, as `followupScreensRegistration` already does
- removed keys are gone from all thirteen, not just `en`
- the RTL audit passes on every new file (`paddingStart`/`End`, Start/End
  radii)

**What's-new:**

- absent `lastSeenVersion` ⇒ **not** shown (fresh install)
- stored version lower than running ⇒ shown, then stored version updates
- equal or higher ⇒ not shown
- a version with an empty slide list ⇒ not shown

**Upgrade path** (already pinned, keep): a settings blob without
`onboardingComplete` does not route an existing user into the flow.

---

## 14. What this deliberately does not do

- **It does not ask a fifth question.** The shelf is not a question and
  §2's three-part test is what keeps it from becoming one. "Could we also
  ask about…" gets answered against that rule, in writing, before a row
  is added.
- **It does not move anything out of Settings.**
- **It does not infer.** No madhab guessed from country, no "recommended
  for you", no reciter chosen by language. The app asks the person,
  plainly, and believes them.
- **It does not add a dependency, an animation library, or an
  illustration set.** The salām and the crescent are the art direction.
- **It does not touch the location step's permission contract** —
  guideline 5.1.1(iv) is not a design opinion.
- **It does not add analytics of any kind.** There is no funnel, no
  completion rate, no step-drop measurement. If a screen is wrong we will
  hear it in an issue, which is the only telemetry this app has ever had
  and the only one it is going to get.
