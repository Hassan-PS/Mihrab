---
description: Run only the DST-related tests. Use after any change to date arithmetic or time-zone-sensitive code.
allowed-tools: Bash(npx jest:*)
---

Run the DST test suite:

```bash
npx jest --testPathPattern='dst|timezone'
```

Covers:
- `__tests__/dst.spring.test.ts` (spring-forward day in Europe/Stockholm).
- `__tests__/dst.fall.test.ts` (fall-back day).
- `__tests__/prayerNotifications.timezone.test.ts` (existing TZ tests).
- Any other test file matching `dst` or `timezone`.

Add to the release checklist. Run this whenever you touch:
- `src/providers/*` (provider response parsing).
- `src/widget/buildWidgetPayload.ts` (rollover logic).
- `src/notifications/prayerNotifications.ts` (scheduling).
- `src/utils/prayerTimes.ts` or `src/utils/date.ts`.

DST bugs hide everywhere date arithmetic is done. Two days a year matter the most: spring forward (last Sunday of March in Europe) and fall back (last Sunday of October).
