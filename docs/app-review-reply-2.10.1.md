# Reply to App Review — Submission edb58a25-7dc9-40e4-9a05-9be55221fff6

Paste into the "Reply to App Review" box in App Store Connect.

---

Hello,

Thank you for the review.

We do not hold an Internet Publishing License (网络出版服务许可证), and as an
individual developer outside China mainland we are not eligible to apply for
one. Rather than distribute without the required permit, we have removed
China mainland from the app's territory availability in App Store Connect.

The app is no longer offered on the App Store in China mainland, so the
publication permit requirement under Guideline 2.1 no longer applies to this
submission. The Quran text the app displays remains available to users in the
other 174 territories where the app is offered.

Please let us know if anything further is needed.

Thank you,
Hassan

---

## What was actually done, for the record

- **China mainland (CHN) set to unavailable.** Confirmed through the App
  Store Connect API: `available: false`, 174 of 175 territories remaining.
  It had been available there since 2026-04-14.
- **Nothing about the app's content changed.** The Quran is the app; removing
  it is not on the table. The permit requirement is territorial, so the
  territory is what moved.

## Why the licence is not a realistic alternative

An Internet Publishing License is issued by China's National Press and
Publication Administration to a registered Chinese entity, with capital,
premises and staffing requirements, and religious content is handled under a
separate and stricter regime again. It is not something an individual
developer abroad can obtain, and Apple's own guidance is to consult legal
advisors precisely because the answer is usually "not available to you".

## What this cost, and what unblocks it

Version **2.10.1 has been REJECTED since 2026-08-18**, and the newest version
actually live on the App Store is **2.8.10**. Everything from 2.9 through 2.13
— including the sunnah-removal fix, the widget work and the sync fixes — has
never reached iPhone or iPad. Removing the territory clears the rejection
reason; a new version still has to be created, attached to a build, and
submitted before any of it ships.

`./scripts/verify-release.sh` now fails a release whose version never reached
App Store Connect, so the next time this happens it is noticed on the day
rather than a week later.
