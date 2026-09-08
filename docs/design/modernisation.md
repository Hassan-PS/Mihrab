# Making it look 2026 — without Material, without Liquid Glass

Question asked 2026-09-08 (Hassan), after ruling out Material 3 Expressive
(`docs/material-direction.md`): *"the UI definitively needs to become more
modern, is there potential to upgrade the look for both android and ios?"*

**Yes — and the good news is that essentially all of it is platform-neutral.**
Nothing below is Material, nothing below is Liquid Glass, and every item is the
same work on both platforms. "Modern" in 2026 is not a style you apply; it is
mostly *space instead of lines*, *one container level instead of three*, and
*consistency*.

Assessed against the actual shipped screenshots at v2.18.0
(`fastlane/metadata/android/en-US/images/phoneScreenshots/`, captured
2026-09-03): Today, Log, Duas, Month.

---

## What is already good, and must not be touched

Saying this first because three of these are better than what the paid
competitors ship, and a modernisation pass is exactly how good things get
accidentally thrown out.

- **The countdown hero.** `2h 56m` at display size with `42s` and `17:06`
  trailing it small is genuinely excellent hierarchy — one number carries the
  screen and the supporting facts sit under it without competing. This is the
  app's single best design idea. Everything below is arguably just "make the
  rest of the app as confident as this card already is."
- **The month table.** Tabular numerals, three-letter column heads, secondary
  times (Islamic midnight, last third, sunrise, first third) in italic grey,
  today's row marked with a tinted fill and a left rule. That is real
  information design and it is better than any competitor's month view. Do not
  restyle it.
- **The Arabic typography.** Amiri at a generous size and leading in the Duas
  reader, with transliteration in italic grey and translation in the body face.
  Correct, and hard-won.
- **The practice heatmap.** Reads instantly.
- **The overall restraint.** One green, warm paper background, no gradients, no
  shadows shouting. The bones are good.

The app does not need a redesign. It needs a **finishing pass**.

---

## P0 — The floating tab bar collides with content. This is a bug.

**Visible in three of the four screenshots.** On Today, "Today's reading done"
and "Khatmah day 1 of 20" show through the bar as broken half-legible text. On
Log, an entire row — "Dhuhr 13:35", "On time / Late / Missed / Make-up" —
ghosts through it. On Duas, four lines of the translation are visible *through*
the tab bar, overlapping the labels.

The cause is `translucentSurface(palette.card)` at 88% alpha
(`MainTabs.tsx`) over content that keeps scrolling underneath with no
treatment. Translucency without a gradient behind it does not read as depth; it
reads as a rendering fault.

**This single item does more damage to "does this app look finished" than
every style question below.** A user does not think "dated"; they think
"broken".

**The fix**, in order of preference:

1. A bottom **fade scrim** — a short vertical gradient from `transparent` to
   the surface colour, behind the bar, sized to the bar plus ~24 dp. Content
   dissolves into the chrome instead of colliding with it. Cheap, no new
   dependency, identical on both platforms.
2. Ensure every scroll container's `contentContainerStyle.paddingBottom`
   clears the bar's real height — `tabBarInset.ts` exists for this and the
   screenshots say at least three screens are not honouring it.
3. Optionally raise the bar's opacity, but 1 and 2 are the real fixes; opacity
   alone just trades one problem for a heavier bar.

Do this first, on its own, before any styling work.

---

## P1 — Kill the ALL-CAPS letterspaced labels

Counted in the screenshots: `ASR IN`, `PRACTICE`, `AYAT AL-KURSI`,
`TIMES SOURCE`, `ON-TIME STREAK`, `SUNNAH KEPT`, `FASTED`, `NOTHING OWED`,
`DAY / ISL / LAS / FAJ / SUN / DHU / ASR / MAG / ISH / FIR`.

Uppercase-plus-letterspacing as a section-header idiom is Material 2's
"overline" and the iOS grouped-table header, and it dates a screen to roughly
2015–2019 faster than any other single choice. In 2026 the same job is done by
**sentence case at a smaller size in the muted colour**, or by nothing at all
where the content is self-evident.

- `ASR IN` → `Asr in` — or drop it entirely; `2h 56m` above `Dhuhr ——— Asr`
  already says it.
- `PRACTICE` → the card needs no header at all.
- `ON-TIME STREAK` → `On-time streak`.
- `AYAT AL-KURSI` → title case at title size; it is a title, not a label.
- **Exception: the month table's column heads stay uppercase.** Three-letter
  abbreviations in a dense numeric grid are a different thing — that is a
  table, and tables use caps.

This is the highest style-change-per-line-of-code item in the document. It is a
handful of `textTransform: 'uppercase'` and `letterSpacing` declarations.

---

## P2 — Space instead of lines

Today's prayer list separates seven rows with **full-bleed edge-to-edge
hairlines**. That is the `UITableView` idiom from iOS 7, and it is the second
loudest dated signal.

Modern treatment, in ascending order of ambition:

1. **Inset the dividers** to the text's left edge instead of running them to
   the card wall. Smallest possible change, noticeably more current.
2. **Remove them** and increase row padding by ~6–8 dp. The tabular alignment
   already groups the rows; the lines are redundant with the grid.
3. Keep a line only where it separates *kinds* of thing — e.g. above
   "Prayer times for the whole month", which is a different class of row.

Same treatment for the Log screen's `Fill in earlier days` / `Fill the past
three months` / `Reset the prayer log` stack, and the settings rows.

`chrome.ts`'s `rowDividerStyle` and `listRowBottomBorder` are called across 43
files, so this is centralised — which makes it both cheap and risky. Change it
behind the existing flag first, screenshot with `theme-scenarios.sh`, then
commit.

---

## P3 — One container level, not three

The Log screen is: a **card**, containing four **stat tiles that are
themselves cards**, containing a heatmap, containing a divider list, followed
by another **card**. Today is: a card containing a hero panel, a chip row, a
divider list and a link row.

Nesting containers is what got Google's own M3 Expressive rollout criticised as
"over-containerisation", and it is a real perceptual cost: every border is a
line the eye has to resolve before it can read the content.

- The four Log stat tiles should sit **directly on the page background**, not
  inside a card and not each in their own card. Numbers at size, labels
  beneath, separated by space.
- Today's hero should either *be* the card or sit *on* the page — not be a
  tinted panel welded to the top of a white card containing three other kinds
  of thing.
- Rule of thumb: **one level of containment per screen.** If something is
  inside a card that is inside a card, one of them is decoration.

---

## P4 — Give chips a hierarchy

Three chip rows, all with the same problem: every option is drawn at equal
weight, when one of them is obviously the common case.

- **Day chips** (`THU 3` … `WED 9`) — seven filled rounded rectangles. Only
  one is selected. Unselected days should be **plain text on the background**,
  with the selected day getting the filled pill. Same information, a quarter of
  the ink.
- **Dua categories** (`Morning` / `Evening` / `After prayer` / `Food`) — the
  selected one is filled green, good; the unselected ones are white pills with
  borders and shadows, which is too much. Make them text-only or a very light
  tint.
- **`On time / Late / Missed / Make-up`** — four identical grey pills. "On
  time" is the overwhelmingly common answer. Give it the accent-tinted
  treatment and let the other three be quieter. This is a usability win as much
  as a visual one: the common tap gets the biggest target and the clearest
  affordance.

---

## P5 — One radius scale, actually enforced

Visible in a single screenshot: the day chips, the stat tiles, the heatmap
cells, the outer cards, the "Refresh stored data" pill and the dua category
pills all use **visibly different corner radii**. Individually every one is
defensible; together it reads unresolved.

The audit numbers behind that impression:

- `RADIUS.` tokens used **38 times**; raw `borderRadius:` used **244 times**
  across **26 distinct hardcoded values** (12, 10, 999, 14, 3, 16, 2, 18, 22,
  8, 9, 7, 6, 4, 20, 13, 11, 1, 99, 56, 5, 32, 24, 23, 17, 0) plus 53
  expression-valued.
- `typeStyle()` used **102 times**; raw `fontSize:` used **505 times** across
  **30 distinct values**, including fractional ones (11.5, 13.5, 12.5, 10.5,
  14.5, 9.5, 15.5).
- `scripts/tokens-audit.js` currently reports **1,483 findings** and
  `design-qa.js` **fails**.

**This is the real reason the app reads as dated, and it is worth stating
plainly: the datedness is mostly inconsistency, not style.** Thirty font sizes
and twenty-six corner radii is visual noise that no amount of restyling fixes.
Conversely, a consistent app with modest styling reads as considered.

Assign every radius to `RADIUS` (adding at most one new step if genuinely
needed) and every size to the type scale, then let `tokens-audit` go green and
**keep** it green. This is the largest single job in the document and the one
that makes everything else stick.

---

## P6 — Fewer semantic colours

The Log screen shows green, gold/amber (`24%`), red (`0 days` and `Reset the
prayer log`), black, plus orange and gold outlines in the heatmap legend —
six colours competing on one screen. `docs/design/principles.md` §4 asks for
one accent.

Keep: the accent (green), one danger colour, and the heatmap's own ramp, which
is data and earns its colours. Drop the amber. Statistics do not need to be
colour-coded when they are already the biggest thing in their tile.

---

## P7 — Let density vary

Every screen is roughly uniformly dense, so nothing leads. The month table is
the exception and it is the screen that works best. Give each screen one
element that is clearly the largest, and let the rest recede — the Today hero
already does this; Log and Duas do not.

---

## Order of work

1. **P0** — the tab-bar scrim. A bug, small, and it removes the "unfinished"
   impression immediately. Do this alone and ship it.
2. **P1** — the caps. Highest visible change per line changed.
3. **P4** — chip hierarchy. Small, and it is a usability win too.
4. **P2** — dividers to space. Centralised in `chrome.ts`, verify with
   `theme-scenarios.sh`.
5. **P3** — de-nesting, screen by screen, Log first.
6. **P6** — colour discipline.
7. **P5** — the token sweep. Largest, least glamorous, and the one that keeps
   the other six from decaying. `tokens-audit` green is the definition of done.
8. **P7** — falls out of 3 and 5 rather than being its own task.

P0–P4 are roughly a week and would carry most of the visible improvement.

## What this deliberately does not do

- No new dependency, no component library, no design-system migration.
- No platform divergence — every item lands identically on Android, iOS, iPad
  and Mac.
- No change to the month table, the countdown hero, the mushaf, the Arabic
  typography or the heatmap.
- Nothing that `docs/design/principles.md` forbids. This whole document is
  principles §1 and §4 applied more strictly, not relaxed — which is worth
  noticing: **the app looks dated in the places where it is not yet living up
  to its own design rules.**

## Related

- `docs/material-direction.md` — why not Material, and the tonal-colour idea
  that would sit underneath P5/P6.
- `docs/themes-plan.md` — the scene layer, which lands on top of this and gets
  easier once P3 has reduced the number of surfaces.
- `scripts/tokens-audit.js`, `scripts/design-qa.js` — the definition of done
  for P5.
