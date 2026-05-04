---
description: Scan for raw hex codes, magic spacing/radius numbers, and inline fontSize values outside src/theme/tokens.ts. Enforces the design system after task #34 lands.
allowed-tools: Bash(node scripts/tokens-audit.js)
---

Run the design tokens audit:

```bash
node scripts/tokens-audit.js
```

Reports:
- **Raw hex codes** anywhere outside `src/theme/tokens.ts` (e.g., `#FAF7F2`, `rgb(...)`, `rgba(...)`).
- **Magic spacing/radius numbers** in StyleSheet entries — `padding: 12`, `borderRadius: 16`, etc. should be token references.
- **Raw `fontSize` values** in StyleSheet — should use type tokens.

Pre-task-#34, this audit will report many violations (the app currently uses raw values). Run before AND after #34 to verify migration completeness.

The `reviewer` subagent has rules backing this audit. The `PostToolUse` hook on `src/theme/tokens.ts` reminds you to re-run `/design-qa` whenever tokens change.
