# Making it look 2026 — without Material, without Liquid Glass

Question asked 2026-09-08 (Hassan), after ruling out Material 3 Expressive
(`docs/material-direction.md`): *"the UI definitively needs to become more
modern, is there potential to upgrade the look for both android and ios?"*
Then: *"expand it and look through every detail that can be improved."*

**Yes — and essentially all of it is platform-neutral.** Nothing below is
Material, nothing is Liquid Glass, and every item is the same work on both
platforms. "Modern" in 2026 is not a style you apply; it is mostly *space
instead of lines*, *one container level instead of three*, *fewer words in
the chrome*, and *consistency*.

Assessed 2026-09-08 against the installed build — **v2.18.0 (264) on a Pixel
10 Pro**, driven over adb — through every tab, the reader, the month table,
Qibla, Fasting, Sync, every Settings page, a dua category page, and the main
screens again in dark mode. About thirty captures. The store screenshots
(`fastlane/metadata/android/en-US/images/phoneScreenshots/`) were the first
pass; the device pass changed several conclusions and added the whole of §B.

**Status (2.18.1, branch `redesign`):** everything below that made it into
`redesign-plan.md` has been built — P0 through P7 and the per-screen items in
§B, with the exceptions the plan records (B.4.4's gold withdrawn, D1–D5 as
recommended). P8 (density) was not taken into the plan and is still open.
The plan's §7 table carries the measured before/after.

---

## What is already good, and must not be touched

Said first because a finishing pass is exactly how good things get thrown
out, and four of these are better than what the paid competitors ship.

- **The countdown hero.** `1h 27m` at display size with `24s` and `19:39`
  trailing small is genuinely excellent hierarchy. It is the app's single best
  design idea, and the rest of the app should be as confident as this card.
- **The month table.** Tabular numerals, three-letter column heads, secondary
  times in italic grey, today's row tinted with a left rule, and — new in this
  build — the Maliki boundary times as a quiet second line under Fajr, Asr and
  Isha. Denser than before and still the best month view in the category.
- **The mushaf page.** Dark paper, framed, ornamental surah header, QPC font,
  ayah markers. Beautiful, and the one screen that already looks like 2026.
- **The Arabic typography** in Duas and Tasbih. Amiri at a generous size and
  leading. Correct and hard-won.
- **The practice heatmap.** Reads instantly.
- **Dark mode.** Consistent, nothing broken, cards read as cards.
- **The Settings index.** Icon tiles, one-line descriptions, chevrons. This
  screen is already right and is the model the sub-pages should follow (§B.10).
- **The overall restraint.** One green, warm paper, no gradients.

The app does not need a redesign. It needs a **finishing pass** — and the
device walk found that the pass is larger than the store screenshots
suggested, because the newest features (Maliki times, per-row alert modes,
the Live Activity) each added a layer without anything being taken away.

---

# A. The cross-cutting problems

Eight patterns account for most of what reads as dated. Each appears on
several screens; §B says where.

## P0 — The floating tab bar collides with content. This is a bug.

**Seen on the device in every scrolling tab: Today, Quran, Duas, Log, and the
dua category page.** The bar is `translucentSurface(palette.card)` at 88%
(`MainTabs.tsx:187`) over content that keeps scrolling underneath with no
treatment. On Log the entire `On time / Late / Missed / Make-up` pill row
ghosts through the bar and overlaps its labels; on Quran it is the At-Tawbah
row; on Duas the `Weather` row and, on a category page, the next dua's title.

Translucency without a fade does not read as depth; it reads as a rendering
fault. A user does not think "dated", they think "broken". **This single item
does more damage to "does this app look finished" than everything else in
this document combined.**

The fix, in order:

1. A **bottom fade scrim** behind the bar — a short vertical gradient from
   transparent to `palette.bg`, bar height + ~24 dp, mounted once in
   `MainTabs`. Content dissolves into the chrome instead of colliding with it.
   No dependency; `react-native-svg` is already there if a native gradient is
   unwanted.
2. Every tab's scroll container must honour the bar's real height in
   `contentContainerStyle.paddingBottom` — `tabBarInset.ts` exists for this and
   the captures show at least four screens are not using it.
3. Only then consider raising the bar's opacity. Opacity alone trades one
   problem for a heavier bar.

Ship this alone, first.

## P1 — ALL-CAPS letterspaced labels everywhere

**47 `textTransform: 'uppercase'` declarations across 38 files.** On the
device: `MAGHRIB IN`, `TODAY`, `TIMES SOURCE`, `DATA STATISTICS`, `PRACTICE`,
`ON-TIME STREAK`, `SUNNAH KEPT`, `FASTED`, `NOTHING OWED`, `AFTER ISHA`,
`FASTING`, `SET 2 OF 6`, `NEXT`, `QIBLA BEARING`, `COMPASS SIGNAL`,
`PHONE FRONT`, `UPCOMING FASTING SUNNAHS`, `CONTINUE READING`,
`VERSE OF THE DAY`, `UNDER EACH VERSE`, `THROUGH THE DAY`, `WORSHIP`,
`OUT AND ABOUT`, `WHEN IT IS HARD`, `FOLDER`, `THIS DEVICE`, `DATA SOURCE`,
`CALCULATION`, `APPEARANCE`, and every dua title (`AYAT AL-KURSI`,
`FOR A JOURNEY — FULL TEXT`, `ON RETURNING HOME`).

Uppercase-plus-tracking as a section idiom is Material 2's "overline" and the
iOS grouped-table header; it dates a screen to 2015–2019 faster than any other
single choice. In 2026 the job is done by **sentence case, smaller, muted** —
or by nothing, where the content is self-evident.

Three sub-cases, because they want different fixes:

- **Section labels** (`TODAY`, `TIMES SOURCE`, `WORSHIP`…) → sentence case
  at `caption` size in `palette.muted`. Or delete: the `PRACTICE` card and the
  `TODAY` card need no header at all.
- **Stat tile labels** (`ON-TIME STREAK`, `SUNNAH KEPT`) → sentence case
  under the number.
- **Dua titles** are *titles*, not labels — `Ayat al-Kursi` at `title3`
  weight 600. Capitalising a title and shrinking it is backwards.
- **Exception:** the month table's column heads stay uppercase. That is a
  table; tables use caps.

Highest visible change per line of code in this document.

## P2 — Lines where space would do

Today's prayer list separates seven rows with **full-bleed hairlines** — the
iOS 7 `UITableView` idiom. Same on the Log's three action rows, the Settings
sub-pages, the dua index. The tabular alignment already groups the rows; the
lines are redundant with the grid.

1. Inset the dividers to the text's left edge. Smallest change, visibly more
   current.
2. Remove them and add ~6–8 dp of row padding.
3. Keep a line only between *kinds* of thing — e.g. above "Prayer times for
   the whole month", which is a different class of row.

`chrome.ts`'s `rowDividerStyle` / `listRowBottomBorder` are called across 43
files, so this is one change — which makes it cheap and risky. Do it behind
a flag, screenshot with `theme-scenarios.sh`, then commit.

## P3 — Three levels of containment

Log: a **card** → four **stat tiles that are themselves cards** → heatmap →
divider list → another card. Quran: **six stacked cards** before the surah
list begins, and then **every surah is its own card with a shadow** — 114 of
them. Fasting: hero card + three stat cards + toggle card + five list items
each in its own card = ten cards on one screen.

Every border is a line the eye must resolve before it reads the content.
**Rule: one level of containment per screen.** If something is in a card that
is in a card, one of them is decoration.

- Stat tiles sit directly on the page: number at size, label beneath, space
  between. No tile background.
- List items (surahs, fasting sunnahs, dua categories) are **rows**, not
  cards. A card is for a thing that stands alone; a list is a list.
- A screen's hero is either *the* card or sits *on* the page — not a tinted
  panel welded to a white card that then contains three other kinds of thing.

## P4 — Chips that all shout at the same volume

- **Day chips** (`TUE 8 … MON 14`): seven filled rounded rectangles, one
  selected. Unselected days become **plain text on the background**; only the
  selected day gets the pill. Same information, a quarter of the ink.
- **`On time / Late / Missed / Make-up`**: on the Log's day view that is
  **twenty pill buttons on one screen** (five prayers × four), plus five
  `Sunnah`/`0/2` outline chips and five pencil icons. "On time" is the
  overwhelmingly common answer. Give it the accent treatment and let the other
  three be text-weight until chosen. Future prayers (Maghrib, Isha before
  their time) should not render four pills at all — one quiet "not yet" row.
- **Dua categories** in the old store screenshot and the `Surah / Juz /
  Bookmarks` segment: the selected option is filled, fine; the unselected ones
  are white pills with borders and shadows, which is too much.
- **Theme / Time format** in Appearance: three separate outlined buttons is
  not a segmented control. Use one.

This is a usability win as much as a visual one: the common tap gets the
clearest affordance.

## P5 — One radius scale, actually enforced

Visible in a single capture: day chips, stat tiles, heatmap cells, outer cards,
the `Qibla 148°` pill, the `Refresh stored data` pill, the dua `▸ Pronunciation`
chips and the mushaf frame all use visibly different corner radii. The numbers
behind that impression:

- `RADIUS.` used **38×**; raw `borderRadius:` **244×** across **26 distinct
  values** plus 53 expression-valued.
- `typeStyle()` used **102×**; raw `fontSize:` **505×** across **30 distinct
  values**, some fractional (9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5).
- `scripts/tokens-audit.js` reports **1,483 findings**; `design-qa.js` fails.

**This is the real reason the app reads as dated, and it is worth stating
plainly: the datedness is mostly inconsistency, not style.** Thirty font sizes
and twenty-six radii is visual noise no restyle fixes. Assign every radius to
`RADIUS` and every size to the type scale, let `tokens-audit` go green, and
*keep* it green. Largest job here; the one that makes everything else stick.

## P6 — More than one accent

The Log shows green, **gold** (`7%`, the `Sunnah` chips, heatmap outlines),
**orange** (`0 days`, fasted outlines), **red** (`Reset the prayer log`, the
Missed legend), black, plus the heatmap ramp — six colours competing. The
Quran tab has a **cyan-blue** `✓ Today's reading done` button, a different hue
from the app's emerald and the loudest element on the screen. The reader
highlights the target ayah in **gold-brown**. `Juz ١٥` in the reader is gold.

`principles.md` §4: one accent. Keep the green, one danger colour, and the
heatmap's own ramp (that is data). Drop the gold, the orange and the cyan.
A `0 days` streak in orange reads as an alarm; the number is already the
largest thing in its tile.

## P7 — Prose in the chrome

The device walk's biggest new finding. The app's honesty instinct — every
setting documented, every source cited — is a virtue in `docs/` and a cost in
the UI:

- Settings → Prayer times: the `Maliki second times` row carries an
  **eight-line** description, followed by a **six-line paragraph plus a
  two-line source citation rendered as a row**.
- Appearance: a card, then a four-line paragraph, then a card, then a two-line
  paragraph, then a card, then a one-line note.
- Sync: two long paragraphs that say the same thing — one as the intro, one
  inside the Folder card.
- Qibla: three explanatory paragraphs around a compass.
- The Today hero carries `Updated 00:08 · 365 days stored` — diagnostic
  information in the most prominent card in the app.

**Rule: one line under a setting, and an affordance for the rest.** A `ⓘ` or
"Learn more" that opens the full explanation in a sheet keeps every word the
app currently says, without the settings page reading like documentation.
Diagnostics move to the Data statistics panel where they already live.

## P8 — Density never varies

Every screen is roughly uniformly dense, so nothing leads. The month table
and the mushaf are the exceptions and they are the screens that work. Give
each screen one element that is clearly the largest and let the rest recede.
Today's hero does this; Log, Quran and Qibla do not. Falls out of P3 and P7
rather than being its own task.

---

# B. Screen by screen

Each screen: what stays, what changes, in order of impact. `[bug]` marks a
defect rather than a style call.

## B.1 Today

**Stays:** the hero countdown; the Qibla chip; tabular times on the right;
the tinted current-prayer row with the left rule.

1. `[bug]` P0 — tab bar collides with the khatmah card and the
   whole-month link.
2. **Take the diagnostics out of the hero.** `Updated 00:08 · 365 days
   stored` is the last line of the most important card in the app. It belongs
   in Data statistics, where the same facts already are.
3. **`MAGHRIB IN` → drop it.** `1h 27m` above `Asr ——— Maghrib` already says
   what is coming. If a label is wanted, `Maghrib in` sentence case.
4. **Day chips** → P4. Selected day filled, the other six plain text.
5. **The per-row `Alert` / `Adhan` column.** Every prayer row now carries an
   icon *and* a label saying which notification mode it has — seven
   icon+label pairs down the middle of the list. That is a settings state
   drawn as a pseudo-button seven times. Icon only, muted, no label; the
   current mode is one tap away in Notifications. Halves the row's visual
   weight.
6. **Row height.** With the Maliki subtitle (`First time until approx.
   05:18`) every row is now ~100 dp and seven rows no longer fit above the
   fold. Subtitle at `caption`, tighter leading, and the subtitle only on
   rows where it differs from the plain time. Or: show the boundary as a
   second small time on the right, the way the month table does — that is
   already the established pattern for the same data.
7. **The `TODAY · 3 of 5 prayers logged` card** uses a **filled green box
   with an ✕** as its icon. A crossed box reads as "error" or "close"; the
   state is "incomplete". A ring with 3/5 filled, or nothing.
8. `TIMES SOURCE` / `DATA STATISTICS` caps → P1. `Data statistics` is also
   a fold (`⌄`) — put the chevron on the left of the label as a disclosure,
   not floating at the far right.
9. **One container level** (P3): the hero, the chip row, the list and the
   link are four things in one card. Either the hero is its own card and the
   list sits on the page, or the whole thing is one flat surface with no inner
   panel.

## B.2 Month

**Stays:** everything about the table. Column caps stay.

1. `Refresh stored data` and `Shareable` as two floating pills under the
   month title look like leftover debug chrome. `Shareable` is a real
   feature — it belongs in the header as a share icon. `Refresh stored data`
   is a maintenance action — into the `⋯` menu or Data statistics.
2. `Sweden · 12 months stored` centred under the pills is diagnostics again
   (P7). One line in the footer, or in Data statistics.
3. The month stepper (`‹ September 2026 ›`) is good; the arrows are a little
   small for a thumb target.

## B.3 Quran tab

The busiest screen in the app, and the strongest case for P3. On a
Pixel 10 Pro the surah list — the point of the screen — starts at roughly 80%
of the way down.

1. `[bug]` P0 — tab bar collides with the At-Tawbah row.
2. **Two "Continue" affordances with different page numbers side by side:**
   `CONTINUE READING · Al-Kahf · Page 299` in one card and `Continue · Page
   62` in the Khatmah card directly beneath. One is the last-read position,
   the other is today's khatmah target, and nothing says so. Merge into one
   card with both facts labelled, or drop the first (the Today tab already
   has a `Continue · Al-Kahf` card).
3. **The Khatmah card has four buttons in two rows** (`Continue`, `Reset`,
   `‹ Previous day`, `✓ Today's reading done`). One primary (`Continue`), one
   secondary (`Done for today`), the rest into an overflow. The **cyan-blue**
   done button is a second accent (P6) and the loudest thing on the screen.
4. **Six cards before the list.** Continue, Khatmah, Verse of the day, Under
   each verse, the Surah/Juz/Bookmarks segment, Often read. Order by what
   someone opening the Quran tab wants: the list, then the segment, then one
   compact khatmah strip. `Verse of the day` and `Under each verse` are
   settings and a daily card respectively — the first into the reader's own
   menu, the second collapsed to one line.
5. **114 surah cards with shadows** → rows. Number in a circle, name,
   meaning · ayahs · origin, Arabic name right-aligned. Inset dividers or
   none.
6. **The header has three controls**: back arrow (see §B.12), a `♫ Tilawah`
   pill, and a refresh icon. The refresh icon on a *tab* is diagnostic chrome
   (P7); Tilawah is a real destination and can stay, as an icon.
7. `CONTINUE READING`, `VERSE OF THE DAY`, `UNDER EACH VERSE` → P1.
8. `Reading traditions ›  Manage downloads ›` as two right-aligned text
   links floating between the chips and the list is orphaned. Both are
   settings; both are already reachable from Settings → Quran.

## B.4 The reader (mushaf)

**Stays:** the page itself. It is the best screen in the app.

1. **The light header over the dark page** is a jarring band. When the page
   is dark, the chrome should be dark — the reader should be immersive
   edge-to-edge, with the header taking the page's tone. `mushafTone.ts`
   already exists to publish exactly this; the header just is not listening.
2. **The header is crowded**: `← Al-Kahf ♫ Audio Translation ⛶` — title
   off-centre, two text buttons, an icon. `Audio` and `Translation` become
   icons; the title centres.
3. `Juz ١٥` in gold, top-left, and the `☀ Light` pill top-right are two
   ad-hoc controls in two visual languages floating over the page. Both into
   the bottom bar beside the page scrubber, or both into a tap-to-reveal
   overlay so the page is clean by default.
4. ~~The target-ayah highlight is gold-brown (P6); an accent tint at low
   alpha instead.~~ **Withdrawn 2026-09-08.** The gold is the page's own
   *ornament* colour — `mushafTone.ts` defines the mushaf as a print with
   its own three tones, and the highlight, the juz label and the page
   number all speak in it deliberately. Inside the mushaf, gold is not a
   second accent; it is the paper's language. Left alone.
5. The `#` button beside the scrubber is unlabelled; fine as an icon, but
   its radius does not match the scrubber's pill.

## B.5 Tasbih

**Stays:** the big count, the Arabic, the "tap anywhere" model. This screen
has the right bones.

1. `SET 2 OF 6` and `NEXT` → P1.
2. **The ring is decoration.** At `0 of 33` it is a faint grey circle that
   does not show progress. Make it the progress ring — accent arc filling as
   the count rises — or remove it and let the number stand alone.
3. **The gap.** Between the transliteration and the ring is roughly a third
   of the screen of nothing, and then the three actions are crammed against
   the tab bar. Centre the ring vertically in the space between the header
   block and the actions.
4. **Three actions in three styles**: `← Previous` (grey pill), `Reset set`
   (text), `Skip →` (filled). Two quiet text buttons and no filled one — the
   primary action on this screen is the tap, not a button.
5. The `NEXT` card (`La ilaha illa Allah · 33`) in a white card with a shadow
   above the actions is a fourth container on a screen that wants zero.

## B.6 Duas

**Stays:** the sectioned index (this week's change); the Arabic typography.

1. `[bug]` P0 — tab bar collides with the `Weather` row and, inside a
   category, with the next dua's title.
2. **Double back affordance** on a category page: the header `←` *and* a
   `‹ All duas` link under it. The header title now says `Morning`
   (fixed this week), so the link is redundant. Remove it.
3. **Dua titles in caps** (`AYAT AL-KURSI`, `SURAH AL-IKHLAS, AL-FALAQ,
   AN-NAS`, `FOR A JOURNEY — FULL TEXT`) → title case at title size (P1).
   They are the most important text on the card after the Arabic.
4. `▸ Pronunciation` / `▸ Translation` — the filled-triangle disclosure glyph
   is a 2012 idiom; a chevron, or plain text links.
5. The repeat counter (`0 / 3` in a bordered box, `Reset` beside it) is fine;
   its box radius does not match the card's.
6. Section headers `THROUGH THE DAY` etc. → P1.

## B.7 Log

The screen with the most to gain. Nearly every cross-cutting problem is here.

1. `[bug]` P0 — the pill row ghosts through the tab bar. The worst instance
   in the app.
2. **Three levels of cards** (P3): stat tiles out of the card and onto the
   page; the heatmap on the page; the three action links as a plain group.
3. **Twenty status pills** on the day view (P4). One accent-weight `On time`
   and three text-weight alternatives per prayer; future prayers show one
   quiet line, not four buttons.
4. **Colour** (P6): gold `7%`, orange `0 days`, red `Reset`, gold `Sunnah`
   chips, orange/gold heatmap outlines. Keep the heatmap ramp and one danger
   red; everything else in text colour or the accent.
5. `PRACTICE`, `ON-TIME STREAK`, `SUNNAH KEPT`, `FASTED`, `NOTHING OWED`,
   `AFTER ISHA`, `FASTING` → P1. `PRACTICE` deletes.
6. **The `Today` day-stepper** between the two cards (`‹ Today ›` with the
   date under it) floats loose on the page between two cards, with the arrows
   in faint circles. Give it the same treatment as the month stepper.
7. The `Mark all on time` pill sits alone at the top-right of the day card
   above an empty line; it is the most useful control on the screen and should
   read as the primary action, aligned with the day's title.
8. **The `Sunnah` / `0/2` outline chips** and the **pencil icons** per row
   are three secondary affordances on every prayer. Fold them: the pencil
   opens a sheet that contains the sunnah counters.
9. The refresh icon in the header is diagnostic chrome on a tab (P7).

## B.8 Qibla

The screen with the biggest gap between what it is and what it could be. A
compass is the single most visually iconic object in a prayer app, and this
one is a white circle with four letters, a thick green line and a black dot,
surrounded by three paragraphs.

1. **`148° from north` is the hero.** Make it the largest thing on the
   screen, above the dial, the way `1h 27m` is on Today.
2. **The dial.** A degree ring with tick marks at 10° and numerals at 30°; a
   thin needle rather than a 6 dp line; the Kaaba glyph at the needle's tip
   instead of the word `Qibla` rotated along it; the centre dot smaller. Keep
   it monochrome plus the accent. This is one SVG.
3. **The text** (P7): `Based on magnetic field level and stability…`,
   `Cross-check with your compass app…` (three lines), `Hold the phone flat…`
   (two lines) — five lines of instruction and a heading, on a screen whose
   bottom third is empty. One line under the dial (`Hold flat, away from
   metal`), and the rest behind `ⓘ`.
4. `QIBLA BEARING`, `COMPASS SIGNAL`, `PHONE FRONT` → P1. The signal bar can
   be a small ring segment on the dial itself rather than a full-width bar
   with a caps label and a percentage.

## B.9 Fasting

**Stays:** the hero card with one clear action. This is close to right.

1. **Ten cards** on one screen (P3). Stat tiles onto the page; the five
   upcoming sunnahs as rows in one group, not five cards.
2. `Log your first fast to start tracking.` floats loose between the hero and
   the tiles as a sentence with no container and no role. Either it is the
   hero's subtitle or it goes.
3. `in 17d` … `in 280d` bold green on every row: five equally-weighted
   accents. Muted text; the nearest one can carry the accent.
4. `UPCOMING FASTING SUNNAHS` → P1.

## B.10 Settings sub-pages

The index is right. The sub-pages are where P7 lives.

1. **Prayer times:** the eight-line `Maliki second times` description, the
   six-line paragraph and the citation row — into a `ⓘ` sheet. The row says
   `Maliki second times` and one line. `DATA SOURCE`, `CALCULATION` → P1.
2. **Appearance:** three paragraphs *between* cards. Each becomes one line
   inside the card it explains, or a `ⓘ`. `Theme` and `Time format` as real
   segmented controls (P4). The `Hex` swatch as a text circle among colour
   circles is odd — a `+` or an outlined circle with a picker icon.
3. **Notifications:** the best of the sub-pages — one-to-three lines per
   row. `Alerts may be unreliable … Change` is a status row styled as a
   setting; a banner (`Banner` exists in `components/ui`) reads better.
4. **Sync:** two paragraphs saying the same thing. One sentence at the top,
   the second paragraph deleted; the folder card starts at `Using Mihrab`.
   `FOLDER`, `THIS DEVICE` → P1.
5. Every sub-page uses full-bleed dividers (P2).

## B.11 The Live Activity notification

Captured by accident in the first Today screenshot and worth a line. The
expanded notification shows `Maghrib • 1:37:07`, the date, a segmented
progress bar with square markers, and a full-width outlined `Adhan` button.
The square markers on the bar are the one element in the whole app that looks
like a developer placeholder; the notification is otherwise clean. Round
markers, or none.

## B.12 The back arrow on every tab

Quran, Tasbih, Duas, Log and Settings all show `←` in their header;
`TabBackButton.tsx` documents why — the app's model is "Today plus five pages
you went to", hardware back has always returned to Today, and the arrow says
so out loud. That is a coherent argument and it is not a bug.

It does cost something: five of six tabs start with a control that on every
other app means "pop the stack", and it takes the leading header slot on
screens (Quran, Log) that already have too much chrome. If the model is worth
keeping, express it more quietly — a small chevron before the title, or make
the `Mihrab` wordmark the way home. If it is not, the arrow goes and hardware
back can keep its behaviour. Decision for Hassan; recorded here so it is a
decision rather than an inheritance.

---

# C. Order of work

1. **P0** — the tab-bar scrim and the four screens' bottom insets. A bug,
   small, and it removes the "unfinished" impression on its own. Ship alone.
2. **P1** — the caps. 47 declarations; highest visible change per line.
3. **B.1.2, B.1.5, B.3.2, B.3.3, B.6.2** — the five small things that are
   plainly wrong rather than merely dated: diagnostics in the hero, the
   alert-mode column, the two Continues, the four-button khatmah card, the
   double back link.
4. **P4** — chip hierarchy, Today then Log.
5. **P2** — dividers, behind a flag, verified with `theme-scenarios.sh`.
6. **P3** — de-nesting: Log, then Quran, then Fasting.
7. **P7** — the prose, Settings sub-pages then Qibla then Sync.
8. **P6** — colour discipline.
9. **B.8** — the Qibla dial. The one item here that is *design work* rather
   than cleanup, and the one with the biggest before/after.
10. **B.4** — the immersive reader header.
11. **P5** — the token sweep. Largest, least glamorous, and the one that
    keeps the other ten from decaying. `tokens-audit` green is the
    definition of done.

Steps 1–4 are roughly a week and carry most of the visible improvement.
Steps 1–8 are roughly three. Step 11 is its own month and worth every day
of it.

# D. What this deliberately does not do

- No new dependency, no component library, no design-system migration.
- No platform divergence — every item lands identically on Android, iOS,
  iPad and Mac.
- No change to the month table, the countdown hero, the mushaf page, the
  Arabic typography, the heatmap or the Settings index.
- Nothing `docs/design/principles.md` forbids. Every item is principles §1
  and §4 applied *more* strictly, not relaxed — which is worth noticing:
  **the app looks dated in exactly the places where it is not yet living up
  to its own design rules.**

# Related

- `docs/material-direction.md` — why not Material, and the tonal-colour
  engine that would sit underneath P5/P6.
- `docs/themes-plan.md` — the scene layer, which lands on top of this and
  gets easier once P3 has reduced the number of surfaces.
- `scripts/tokens-audit.js`, `scripts/design-qa.js` — the definition of done
  for P5.
- `scripts/theme-scenarios.sh` — the regression harness for P2 and P3.
