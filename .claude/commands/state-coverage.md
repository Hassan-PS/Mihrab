---
description: Scan for raw "Loading..." / "Error" strings and unhandled empty/error/loading states in async boundaries. Reports cases that need illustration-led EmptyState components.
allowed-tools: Bash(node scripts/state-coverage.js)
---

Run the empty/error/loading state coverage audit:

```bash
node scripts/state-coverage.js
```

Reports:
- **Raw "Loading..." / "Loading…"** strings in JSX (should be a `Skeleton` or breathing crescent loader).
- **Raw "Error" / "Failed" / "Something went wrong"** strings (should be an `EmptyState` with illustration + actionable CTA).
- **`ActivityIndicator`** usage (replace with library `Skeleton` for layout-stability).
- **Async boundaries without three-state coverage** — `useEffect` patterns that fetch but only render success or null.

Pre-task-#42 (empty states), most async boundaries will fail. Use the audit to prioritize which states to design.

Pair with the `designer` subagent: each flagged case needs an illustration (#37) and a designed copy line (`docs/design/states.md`).
