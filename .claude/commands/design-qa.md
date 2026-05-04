---
description: Run the full design quality assurance sweep — tokens, components, icons, accessibility, locales, states. Single report. Gates release readiness for design refresh.
allowed-tools: Bash(node scripts/design-qa.js)
---

Run the full design QA sweep:

```bash
node scripts/design-qa.js
```

Orchestrates and combines the output of:
- `/tokens-audit` — raw hex / magic numbers outside tokens.ts.
- `/component-coverage` — raw RN primitives where library components exist.
- `/icon-audit` — icon library consistency.
- `/a11y-scan` — accessibility violations.
- `/responsive-scan` — responsive layout issues.
- `/locale-audit` — locale drift and English fallbacks.
- `/state-coverage` — undesigned empty/error/loading states.

Returns a single report with violation counts per category and an overall PASS/FAIL verdict.

This audit **gates** release readiness for the design refresh. When it's green, the app is ready to ship its design system + theme makeover.

The `Stop` hook reminds you to run this if any design-touching file was changed in the session.
