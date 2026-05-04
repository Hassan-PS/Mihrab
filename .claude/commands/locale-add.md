---
description: Add a translation key to all 13 locale files at once with TODO_TRANSLATE markers in non-English files.
argument-hint: <key.path> <english-value>
allowed-tools: Bash(node scripts/add-locale-key.js:*)
---

Add a new translation key to all 13 locale files:

```bash
node scripts/add-locale-key.js "$ARGUMENTS"
```

The script:
1. Parses the key path (e.g., `home.nextPrayer` or `compass.a11y.calibrating`).
2. Adds the English value to `src/i18n/locales/en.json`.
3. Adds the key to all 12 non-English locale files with a `TODO_TRANSLATE: <english value>` placeholder.
4. Refuses to overwrite an existing key (use Edit if you intend to update).

After the script runs, invoke the `locale-translator` subagent to fill the TODO_TRANSLATE markers using the canonical religious terminology table.

The PreToolUse `locale-parity-guard.js` hook prevents partial edits to locale files, so locale drift cannot be reintroduced.
