# The 45° latitude substitute — issue #20, CLOSED 2026-09-08

*The Guiding Helper*, Song 11, footnote 653, quoted in full in issue #19:
where the sun does not behave regularly — months without a sunrise or a
sunset — one follows the customary timings of one's local Islamic
authority, and failing that "the prayer timings for the 45° latitude
mark at their longitude".

#20 asked for that as a feature. It was built, measured, and not
shipped. This is what the measurement said, so that the next person to
raise it starts from a number instead of from the idea.

## What was built

Scoped deliberately narrowly, and the scope was the whole question. The
five daily prayer times were left alone: they come from the reader's
provider — AlAdhan, Islamiska Förbundet, Habous — which *is* the local
authority fn. 653 asks for first, and overriding it would make this a
second calculation method rather than a fallback. What the substitute
filled was the gap the app leaves behind: the Mālikī second-time
boundaries that `src/prayer/daruriTimes.ts` works out for itself from
solar geometry, on the days when the sun never reaches the angle and the
app currently prints a blank.

Off by default, offered only above 45°, labelled wherever it appeared,
fn. 653 under the switch, thirteen locales. The work is on the branch
`issue-20-lat45-substitute`.

## What the measurement said

Simulated across **4,283 place-days** — thirteen latitudes from 46°N to
75°N, every day of 2026, provider rows from the app's own offline engine,
minus 462 days where the provider itself produces no usable times:

| | blank days | fillable |
|---|---|---|
| *Isfār* (Fajr's boundary) | 403 | **0** |
| *Iṣfirār* (ʿAṣr's boundary) | 414 | **13** |

817 blank boundary-days; 13 of them can be filled. 1.6%.

Relaxing the rule — substituting also where the sky DID answer but the
answer contradicts the card's own rows — adds 37 more candidate days and
fills none of them.

## Why, and why it is not a bug

Two structural reasons, and neither is an implementation fault.

**Where the sun does not rise, the window has no end either.** Fajr's
ḍarūrī runs to sunrise. In the polar night there is no sunrise, so there
is no window to put a boundary inside of. That is the whole of *isfār*'s
zero.

**Where the sun does rise but never reaches the angle, the 45° answer
lands outside the reader's own window** — because that window is bounded
by *their* sunrise and sunset, and a boundary computed 20° south is not.
At 68°N in January the 45° *iṣfirār* is 15:48 and the local Maghrib is
13:12. Printing it would be a boundary after the window it is supposed
to sit in, which this module already refuses to do for good reasons
written down in its own header.

So a 45° clock time cannot be inserted into a card whose surrounding
times come from the reader's own latitude. The two are different skies,
and the app would be splicing them.

## What would change the answer

- **Taking fn. 653 at its word**, which says "for all five prayers": at
  those latitudes, on those days, the whole day comes from 45° — the five
  times and the boundaries together, coherent among themselves, clearly
  labelled as a substitute. This is what the footnote actually
  prescribes, and it is a real option. It was not taken because it moves
  the five daily times, which is a much larger claim than filling a
  blank, and it deserves a decision rather than a default.
- **A local authority publishing boundaries** for a high-latitude city,
  which is fn. 653's first step and the one this app is not.

Neither is a coding problem.

## What a reader at 68°N has today

The five daily times from their provider, which applies its own
high-latitude rule; the Mālikī second times on every day the sky
supports them; and a blank on the days it does not. A blank they can ask
their imam about is what `daruriTimes.ts` chose over a number the sky
does not support, and 13 days out of 817 is not enough to change that.
