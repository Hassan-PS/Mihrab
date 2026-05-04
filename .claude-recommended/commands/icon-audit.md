---
description: List every icon used in the codebase grouped by source library. Catches accidental mixing of icon libraries (e.g., Phosphor + Lucide).
allowed-tools: Bash(node scripts/icon-audit.js)
---

Run the icon library consistency audit:

```bash
node scripts/icon-audit.js
```

Reports:
- Imports from icon libraries (Phosphor, Lucide, FontAwesome, MaterialIcons, etc.).
- Per-library icon usage count.
- Icons that exist in multiple libraries used in the codebase (suggests consolidation).
- Custom icon components in `src/icons/` for app-specific concepts (Tasbih bead, Qibla marker, Crescent, Mosque pin).

Goal after task #37: a single icon library is used consistently. Mixing libraries inflates bundle size and produces visual inconsistency.
