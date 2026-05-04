---
description: Diff all 13 locale JSON files against en.json. Reports missing/extra keys per language so locale drift is visible.
allowed-tools: Bash(node scripts/audit-locales.js)
---

Run the locale parity audit:

```bash
node scripts/audit-locales.js
```

The script compares every locale file in `src/i18n/locales/` against `en.json` and reports:
- Missing keys per locale (English present, locale missing).
- Extra keys per locale (locale has keys not in English).
- Suspected English fallbacks (locale value identical to English value for non-trivial strings).

Exit code 0 = all locales in parity. Non-zero = drift detected.

If drift is found, invoke the `locale-translator` subagent to fill missing keys with consistent Islamic religious terminology.
