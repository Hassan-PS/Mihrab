# First launch — plan

Written 2026-09-12 at Hassan's request: *"the welcoming message when
installing the app and the walkthrough could be better improved, both in
design but also customizing the user experience from the first launch, look
at the settings and restructure the things that can be set from the first
walkthrough."*

Companion documents: `docs/design/principles.md` (the five rules, which this
applies rather than changes), `docs/design/redesign-plan.md` (the visual
language this inherits), `docs/DISTRIBUTION.md` (where the permission prompts
actually land).

> **This document is the direction — what is wrong and why.
> `docs/design/onboarding-remake.md` is the specification — what gets
> built.** It was written later the same day, after Hassan asked for the
> whole walkthrough to be remade in design *and* options, and it changes
> two things here: the flow now offers an optional personalisation pass
> after the essential questions (§3 and §11 below are amended for it), and
> the feature tour is folded in rather than merely retired (§7 stands, with
> the reuse specified in detail there).

---

## 0. The one-paragraph version

Mihrab's first launch asks the user almost nothing and then gets the one
thing it *did* ask wrong. There are seven to eight full-screen pages before a
prayer time is visible — a three-to-four-step welcome flow, then Home, then a
four-slide feature tour — and across all of them the user makes exactly **one**
real decision: their location. Everything else is a paragraph with a button
under it. Meanwhile the two settings that decide whether the app is *correct
for this person* — which school they follow, and whether it may notify them —
are never raised, and the notification step asks the operating system for
permission and then **never writes the setting**, so a user who taps "Enable
alerts" and grants it gets a silent app. The plan is to ask four real
questions instead of none, show the consequence of each answer in the user's
own times rather than describing it, cut the page count from eight to five,
and repurpose the orphaned feature tour as the "what's new" screen the app has
never had.

---

## 1. What happens today

Walked through the code on 2026-09-12, not from memory.

**The route.** `useOnboardingAutoRoute` (`RootNavigator.tsx:44-57`) pushes
`Onboarding` over an already-mounted tab navigator when `onboardingComplete`
is false. It is an ordinary stack push with a header, so the back arrow and
the swipe gesture both leave the flow at any point; a `firedRef` one-shot stops
it re-firing this launch, so a user who backs out lands on a Home that may be
nothing but a full-screen location wall.

**The steps** come from `buildOnboardingSteps()` (`src/onboarding/steps.ts`):

| # | id | what it is | the user's choice |
|---|----|----|----|
| 1 | `welcome` | the salam, animated, and a sentence about privacy | none — Continue or Skip, identical |
| 2 | `location` | embeds the whole `LocationSetup` widget | **real**: GPS, city search, or coordinates |
| 3 | `notifications` | a paragraph, then the OS permission prompt | none — grant or skip, identical |
| 4 | `exactAlarms` | Android 12+ only; sends you to system settings | none |

Three steps on iOS, four on Android 12+, one fewer if location was already
set. **One of them contains a decision.**

**What it writes**, in full (`OnboardingScreen.tsx:177-196`):

```ts
if (!settings.locationOnboardingComplete) {
  updateSettings({ locationOnboardingComplete: true });
}
updateAllSettings({ onboardingComplete: true });
```

Two booleans. Everything else the user "chose" was written by `LocationSetup`
on its own behalf. `onPrimary` contains **zero** calls to `updateSettings`
— verified by counting them.

**Then it happens again.** `HomeScreen.tsx:290-299` opens `FeatureTourModal`
on first focus after onboarding completes: four more full-screen slides
("Welcome to Mihrab", "Prayer times at a glance", "The Quran, beautifully",
"Make it yours"). So the real sequence is **welcome flow → Home → a second
welcome flow**, in two different visual idioms — a scrolling page with a text
step counter, then a paged carousel with dots.

---

## 2. The five things wrong

### 2.1 The app is silent after you agree to be notified

This is the one to fix first and it is not a design problem.

`notificationsEnabled` defaults to `false` (`types.ts:556`). The onboarding
notifications step calls `notifee.requestPermission()` and
`PermissionsAndroid.request(POST_NOTIFICATIONS)` — and writes nothing. The
result is not even read. And `alertModes.ts:129` is unambiguous about what
that means:

```ts
if (!notificationsEnabled) return 'silent';
```

Every prayer's effective alert mode is `silent`. So a user installs a prayer
app, is asked "We can quietly notify you at each prayer time", presses
**Enable alerts**, grants the OS permission — and hears nothing, ever, until
they find the master switch in Settings → Notifications. The OS will even show
Mihrab as a permitted notifier, which is exactly the state in which nobody
goes looking for an in-app switch.

Every other complaint in this document is about polish. This one is the app
failing at the thing it exists for.

### 2.2 It never asks the question that changes the times

`school` defaults to `0` — the 1:1 shadow ʿaṣr. A Ḥanafī user's ʿaṣr is
therefore **45 to 90 minutes early**, every day, until they discover
Settings → Prayer times → Calculation and change it. `madhab` defaults to
`null`, which the UI renders as "Custom".

In a prayer app, madhab is not a preference like a theme. It is the closest
thing the app has to *who the user is*, it changes the numbers on the main
screen, and the app has never once asked.

### 2.3 The adhan is off by default and nobody is told

`notificationSound` defaults to `'default'` — the system tone. Seventeen adhans
ship in the app. A large share of people install a prayer app *for* the adhan
and will conclude it does not have one.

### 2.4 Two onboardings, and no "what's new"

The feature tour is a second, unversioned welcome (`'mihrab.featureTour.v1'`,
a plain flag never compared against an app version). It duplicates the welcome
flow's job in a different visual language, immediately after it.

Meanwhile there is no what's-new surface at all: greps for `whatsNew`,
`lastSeenVersion`, `releaseNotes` in `src/` return nothing. `CHANGELOG.md` is
linked only from the marketing site.

And there is an accident filling that gap: `storage.ts` migrates
`locationOnboardingComplete` for upgraders (absent ⇒ true, :174-176) but has
**no equivalent migration for `onboardingComplete`**, so an install whose blob
predates that flag loads it as `false` and gets routed into the welcome flow
on update. Existing users are being shown the new-user greeting as a de-facto
release note. Nobody designed that.

### 2.5 The design describes instead of showing

Every non-welcome step is a 64px crescent, a centred title, a centred
paragraph, and two stacked buttons. The step counter is the literal string
"Step 2 of 4". Nothing on screen ever shows the user their own data, so every
claim is abstract — "we use your approximate position to calculate accurate
prayer times" rather than the times.

Two smaller things found while reading: the `SalamHero` header comment claims
Reduce Motion users get the static end state, and there is no
`AccessibilityInfo` call anywhere in the file — the animation always runs at
full length. And `onboarding.next` / `onboarding.done` are translated into all
thirteen locales and referenced nowhere.

---

## 3. The rule for what onboarding may ask

Onboarding is the most expensive screen real estate in the app: it is spent
before the user has any reason to trust it, and every question is a chance to
abandon. So a setting earns a place in the flow only if it passes **both**
halves of one test:

> **The app cannot work it out on its own, AND being wrong about it makes the
> app wrong — not merely less pretty.**

A setting that fails either half has a good default and belongs in Settings,
where the user will meet it in context, with the app already working.

That rule is what keeps this from becoming a settings dump with a progress
bar. The hard limit that followed from it, as first written: **five screens,
four questions.**

**Amended, 2026-09-12.** The four-question ceiling is lifted, deliberately
and in writing. The test above still decides what may be a *question* —
four settings pass it and nothing else gets a screen — but the flow may
now also carry a second, weaker kind of thing:

> **A question gets a screen. A preference gets a row on a shelf, and the
> shelf is optional in one tap.**

A preference qualifies for the shelf only if it is off or neutral by
default (so skipping costs nothing), is discoverable nowhere obvious, and
can be decided in one glance. Seven rows pass; the full list, the
reasoning, and why language is *not* among them are in
`onboarding-remake.md` §2.

What this preserves is the thing the original ceiling was protecting: the
user still answers four questions and no more, and the emphasis of the
flow is unchanged. What it buys is that the eleven genuinely useful
off-by-default settings — the night times, the adhkār reminders, the
pre-prayer reminder — stop being invisible to everyone who does not go
looking.

---

## 4. Every setting, against that rule

The full inventory is roughly ninety keys across `src/settings/types.ts` and
`quranState.prefs`. Triaged:

### Asks — passes both halves

| setting | default | what being wrong costs |
|---|---|---|
| location | `0,0` sentinel | no times at all |
| `school` / `madhab` | `0` / `null` | ʿaṣr wrong by 45–90 min, daily |
| `notificationsEnabled` | `false` | **no alerts, ever** |
| `notificationSound` | `'default'` | no adhan; the feature is invisible |

Four. That is the whole list, and it is not a coincidence that it is short.

### Offers in passing — cheap, and the app is better for confirming

- **`language`** — follows the phone until `languagePicked` is set, which is
  right for most. But the app speaks thirteen languages and a user whose phone
  is in English while they read Arabic will never find the picker. One tap on
  the welcome screen, not a screen of its own.
- **`prePrayerReminderMinutes`** (`0`) — genuinely useful, genuinely optional.
  Belongs *inside* the alerts screen as a secondary row, not as a question.
- **`malikiSecondTimesEnabled`** (`false`) — only meaningful to Mālikī users,
  who have just identified themselves on the madhab screen. Reveal it there,
  as a consequence of their answer, and nowhere else.

### Does not ask — fails the rule, stays in Settings

Everything else, and the reasons are worth stating so this does not get
relitigated every release. **Read this list as "does not get a screen".**
Seven of the settings below now appear as rows on the optional shelf added
by the §3 amendment — the theme and accent, three of the extra times, the
adhkār reminders — which does not make them questions and does not change
a word of the reasoning here: none of them is *asked*, all of them keep
their defaults if the shelf is skipped, and all of them stay exactly where
they are in Settings. The rest of this list is unchanged and unoffered.

- **`calculationMethod`** (`'auto'`) — auto resolves by coordinates and is
  right for the overwhelming majority. A user who knows their mosque follows
  Umm al-Qurā also knows to look in Settings. Asking everyone else to choose
  between seventeen methods they have never heard of is how a good default
  gets turned into a decision.
- **`dataProvider` / `dataProviderAuto`** — same argument, more so: the
  automatic pick already routes Swedish and Moroccan coordinates to their
  national tables.
- **Appearance** — `appearance`, `useSystemDynamicTheme`, `pureBlackDark`,
  `appAccentId`, `clockFormat`. Every one follows the system or has a default
  nobody objects to. A theme picker in onboarding is the canonical example of
  a question asked because it is easy to ask, not because it needs asking.
- **Widgets, Live Activity** — discovered on the home screen and the launcher,
  where they mean something.
- **Extra times** (sunrise, midnight, thirds), **Mālikī alerts**, **dhikr
  reminders**, **khatmah / Kahf / Mulk / ayah-of-the-day reminders**,
  **fasting reminders** — all off by default, all discovered in the tab that
  owns them. There are eleven of these. Together they would double the flow
  and none of them is wrong at its default.
- **Quran** — `reciterId` (`'husary'`), `riwayah` (`'hafs'`),
  `quranTranslationEdition` (`''` = follow language), `companionMode`. Sane
  defaults, and the reader is where they make sense. A reciter picker before
  the user has opened the Qur'an is furniture.

---

## 5. The new flow

Five screens. The first and last are not questions.

*(Amended 2026-09-12: six, the sixth being the optional shelf from §3's
amendment, which sits between the alerts screen and the last. The five
described below are unchanged in substance and in order;
`onboarding-remake.md` §3 is the built version of each, with layouts,
controls and the keys they write.)*

### Screen 1 — Salam

Keep it almost exactly as it is. It is the best thing in the current flow: the
Arabic greeting in Amiri, animated in, the translation fading under it. It
earns its place by setting a tone no other prayer app sets.

Changes: honour Reduce Motion for real (the comment already claims it);
demote the privacy sentence from a paragraph to one line; add a single
**language** affordance in the corner — the current language's name, tapping
it opens the thirteen. No step counter on this screen.

### Screen 2 — Where you are

Unchanged in substance — `LocationSetup` embedded, GPS or search or
coordinates, and **no skip button**, because App Store guideline 5.1.1(iv)
requires a location pre-permission screen to lead to the prompt with no exit
control. The manual city path remains the escape hatch, and the auto-advance
on completion stays.

What changes is what happens *after* the coordinates land: the screen does not
immediately jump. It shows the city name and **today's five times, computed**,
for about a second, then advances. That is the first moment the app proves it
works, and it currently passes it by in 80ms.

### Screen 3 — How you pray  ·  **new**

The question the app has never asked.

Four choices — Ḥanafī, Mālikī, Shāfiʿī, Ḥanbalī — plus a quiet "I'm not sure"
that picks the Shāfiʿī/majority ʿaṣr and says so plainly rather than hiding
behind "Custom".

The design point: **the user's own ʿaṣr time is on screen and changes as they
tap.** Ḥanafī reads `16:12 → 17:38` in tabular numerals. Nobody has to know
what a shadow ratio is to see what the choice does. This is only possible
because screen 2 just established where they are, which is why the order is
what it is.

Writes `madhab`, and `school` derived from it (Ḥanafī ⇒ `1`, else `0`).
Choosing Mālikī reveals one inline row — *"Also show the second prayer times
(ikhtiyārī and ḍarūrī)"* — defaulted **on** for Mālikī users, which sets
`malikiSecondTimesEnabled`. No other school sees it.

### Screen 4 — Being called

One screen that finally does the whole job.

- The OS permission request, as now.
- **`notificationsEnabled: true` written when the permission is granted**,
  which is §2.1 fixed.
- The adhan chooser, right here: a short list — Makkah, Madina, Abdul Basit,
  the system tone — with a play button on each. Not all seventeen; the rest
  live in Settings. Writes `notificationSound`.
- Android 12+: the exact-alarm request folded in as a second line rather than
  a fifth screen of its own, since it is the same subject and the current
  screen is a paragraph about a permission dialog.
- A secondary row for `prePrayerReminderMinutes`, off by default.

If the permission is **denied**, the screen says so honestly and does not
write `notificationsEnabled: true` — a setting claiming the app may notify
when the OS forbids it is a lie the Home banner then has to untangle.

### Screen 5 — Ready

Not a summary of what was chosen. **Their actual Today card**, with their real
city and their real times, rendered live — and under it, one line naming the
three things most people change next, each a deep link into the Settings page
that owns it. Then "Start".

This replaces the feature tour, which is the subject of the next section.

---

## 6. What changes in Settings

The point of asking during onboarding is not to remove anything from Settings.
Every one of these stays exactly where it is, and stays editable. What changes
is that it arrives **already answered**, and the paths in and out are honest.

1. **Prayer times → Calculation** — `madhab` will no longer read "Custom" for
   a fresh install, because the user will have said. The row order should put
   madhab above calculation method: it is the one people look for, and it is
   currently below a control most users should never touch.
2. **Notifications** — the master switch will already be on for anyone who
   granted permission, which is the whole point. The card's existing
   permission-checking path (`NotificationsCard.tsx:90-124`) is unchanged and
   remains the place where a denied permission gets fixed.
3. **About → "Show onboarding again"** already exists and is non-destructive.
   It becomes more useful, not less: re-running is now a way to revisit four
   real answers rather than re-read three paragraphs. Rename it to something
   that says so.
4. **About → "Show the app tour"** — removed along with the tour (§7).

Nothing moves out of Settings. A setting asked during onboarding that could
not then be found again would be worse than one never asked.

---

## 7. The second onboarding, and the missing one

**Delete `FeatureTourModal` from the first-run path.** Screen 5 does its job
with the user's own data instead of four slides of generic description, and
two welcomes in two visual idioms is the single most obviously unfinished
thing about first launch today.

**Then reuse the machinery it leaves behind.** The tour is a paged, RTL-aware,
skippable, full-screen modal with a persisted seen-flag — which is exactly the
shape of the what's-new screen the app has never had. Give it a version-aware
flag (`lastSeenVersion` rather than `'mihrab.featureTour.v1'`), point it at
per-release content, and show it on the first launch **after an update**, to
people who already use the app and currently learn nothing about what changed.

That also closes §2.4's accident properly: add the missing `onboardingComplete`
migration so upgraders stop being routed into the new-user greeting, and let
the what's-new screen carry that job deliberately instead.

---

## 8. Design

Applying `principles.md` rather than inventing anything.

**One question per screen, and the question is the headline.** "How do you
pray?" in `title1`, not a title plus a paragraph explaining what a madhab is.
Body copy only where it changes the decision.

**Show the consequence, never describe it.** ʿAṣr moving when the school
changes; the five times appearing when the city lands; the real Today card at
the end. This is the difference between a walkthrough and a setup, and it is
the whole argument for the new order of screens.

**Progress as a rule, not a sentence.** A hairline that fills across the top,
replacing "Step 2 of 4" — which is text the user must read to learn something
a line can show. (Principle 4: let typography and space carry it.)

**One accent, calm ground.** Same tokens as everywhere else: `SPACING`,
`RADIUS.md`, the accent for the one primary action per screen, everything else
in ink and muted. No illustrations beyond the salam and the existing crescent
— principle 2, motifs as quiet accents.

**Tabular numerals for every time shown** — principle 3, and these screens now
show times, which they never did before.

**Make it a modal route, not a pushed card.** Today it is an ordinary stack
push with a header, so the back gesture drops the user out mid-flow onto a
possibly-broken Home. `presentation: 'modal'`, `gestureEnabled: false`,
`headerShown: false`. Skip stays available on every screen except location;
leaving should be a decision, not a swipe.

**Answer once, silently.** Every screen writes its answer as it is made, not
at the end — a flow abandoned on screen 4 should keep the madhab chosen on
screen 3.

---

## 9. Phases

Four, each shippable on its own, in value order rather than dependency order.

### Phase 0 — the bugs  ·  *ship first, ship alone*

Small, and the app is measurably more correct afterwards:

1. Write `notificationsEnabled: true` when the permission is granted (§2.1).
2. Add the `onboardingComplete` migration so upgraders are not shown the
   new-user greeting (§2.4).
3. Honour Reduce Motion in `SalamHero`, so the comment stops lying.
4. Delete `onboarding.next` / `onboarding.done` from thirteen locales.

No design work, no new strings, no new screens. If nothing else in this
document is ever done, this still should be.

### Phase 1 — the questions

Screen 3 (madhab) and the rebuilt screen 4 (alerts + adhan). New strings,
thirteen locales. The flow is still the current visual design; it just asks
the right things. This is where most of the user-visible value is.

### Phase 2 — the design

Screens 1, 2 and 5 rebuilt: language affordance, the pause on computed times,
the live Today card, the progress rule, the modal route. Now that the flow
asks real questions, the design has something to be the design *of*.

### Phase 3 — what's new

Retire the feature tour from first launch, re-point it at releases, wire
`lastSeenVersion`. Independent of everything above; could equally ship first.

---

## 10. Tests

The current coverage is one pure-function test on `buildOnboardingSteps`
(`featureModulesPart2.test.ts:112-138`) plus locale parity. Nothing renders
the screen, exercises `finish()`, or asserts what it writes — which is exactly
why §2.1 survived this long.

What to pin, in the repo's existing idiom:

- **What onboarding writes, per answer.** Granting notifications sets
  `notificationsEnabled`; denying does not. Ḥanafī sets `school: 1`; the other
  three set `0`. Mālikī sets `malikiSecondTimesEnabled`. These are the
  assertions whose absence caused the bug.
- **Answers persist across abandonment** — a flow left on screen 4 keeps the
  madhab from screen 3.
- **The step list** per platform: `exactAlarms` on Android 12+ only, which is
  currently untested.
- **The location step still has no skip control** — a guideline compliance
  contract, and the kind of thing a redesign silently breaks.
- **Locale parity** for every new key across thirteen locales, as the existing
  `followupScreensRegistration` test already does for `onboarding.*`.
- **The upgrade path**: a settings blob without `onboardingComplete` does not
  route an existing user into onboarding.

---

## 11. What this plan deliberately does not do

- **It does not ask more.** Four questions is the budget and §3 is the reason.
  Every future "could we also ask about…" should be answered by that rule, in
  writing, before a screen is added. *(Amended 2026-09-12: still four
  questions, and the shelf added by §3's amendment is not a fifth — but
  "the flow contains exactly four things" is no longer true, and the
  three-part test in `onboarding-remake.md` §2 is now what a proposed row
  has to pass.)*
- **It does not move anything out of Settings.**
- **It does not add a dependency, an animation library, or an illustration
  set.** The salam and the crescent are the art direction.
- **It does not touch the location step's permission contract** — guideline
  5.1.1(iv) is not a design opinion.
- **It does not infer.** No "recommended for you", no madhab guessed from
  country, no reciter chosen by language. The app should ask the person,
  plainly, and believe them. *(This bullet originally read "does not attempt
  personalisation beyond the four answers"; the shelf is personalisation the
  user performs, not personalisation the app performs, and it is the second
  clause — never guessing — that was the point.)*
