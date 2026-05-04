---
description: List source files under src/ that have no corresponding test under __tests__/. Keeps coverage gaps visible.
allowed-tools: Bash(node scripts/test-gaps.js)
---

Find source files without tests:

```bash
node scripts/test-gaps.js
```

The script lists `src/**/*.{ts,tsx}` files where:
- No `__tests__/<basename>.test.{ts,tsx}` exists, AND
- The file is not a pure type definition (`.d.ts`, files containing only `export type`/`export interface`).

Files with only constants, types, or trivial passthroughs are not flagged.

Use this output to prioritize which task #17 tests to write first.
