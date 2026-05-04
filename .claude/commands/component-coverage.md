---
description: List screens still using raw RN primitives (Pressable, Modal, View as a card, etc.) where library components from src/components/ui/ should be used instead.
allowed-tools: Bash(node scripts/component-coverage.js)
---

Run the component library coverage audit:

```bash
node scripts/component-coverage.js
```

Reports per screen:
- Raw `<Pressable>` / `<TouchableOpacity>` usage where the library `Pressable` wrapper exists.
- Raw `<Modal>` usage where `Sheet` or `Modal` library component should be used.
- View blocks that look like cards (border + radius + padding) where `Card` should be used.
- Inline list rows where `Row` should be used.
- Loading states using `ActivityIndicator` where `Skeleton` should be used.

Pre-task-#39 (component library), most screens will fail this audit. Use it during the migration to track progress and after to prevent regression.
