---
description: Flag performance issues — components >500 lines, missing React.memo, inline object props, setInterval without cleanup, expensive recomputes per render.
allowed-tools: Bash(node scripts/perf-scan.js)
---

Run the performance audit:

```bash
node scripts/perf-scan.js
```

Reports:
- **God components** — `.tsx` files exceeding 400 lines (HomeScreen, SettingsScreen, CompassScreen are known offenders before tasks #8–#10 land).
- **Missing memoization** — components rendering inline arrow functions or object literals as props to children that look like they should be memoized.
- **`setInterval` / `setTimeout` without cleanup** — effects that don't return a cleanup function.
- **Inline `StyleSheet.create()` inside a component body** — should be hoisted to module scope.
- **Re-render hot paths** — components that subscribe to `now`-style state without isolation (HomeScreen's 30s tick is the canonical example).

Output is a punch list. Run before/after refactors (tasks #8–#12) to prove the regression budget.
