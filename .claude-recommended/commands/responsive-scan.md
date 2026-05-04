---
description: Flag responsive-layout issues — hardcoded widths, missing useWindowDimensions gating, single-column-only layouts, missing hover styles for iPad/Mac.
allowed-tools: Bash(node scripts/responsive-scan.js)
---

Run the responsive layout audit (for iPad/macOS task #33):

```bash
node scripts/responsive-scan.js
```

Reports:
- **Hardcoded widths > 600pt** without `maxWidth` cap (will stretch absurdly on Mac).
- **Missing `useWindowDimensions`** in screens that should adapt to width.
- **Single-column-only layouts** — no breakpoint at ~700pt for master-detail switching.
- **`Pressable` without hover style** — `({ hovered }) => ...` callback missing (iPad/Mac pointers need this).
- **Modal sheets used instead of centered popovers** for wide layouts.

The app should read well at 390pt phone, 810pt iPad portrait, and 1200pt Mac window. This audit catches drift from those targets.
