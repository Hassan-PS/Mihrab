---
description: Run only the Jest tests related to the given source file. Speeds the inner loop.
argument-hint: <path/to/source/file.ts>
allowed-tools: Bash(npx jest:*), Bash(node scripts/test-related.js:*)
---

Run Jest tests related to `$ARGUMENTS`:

```bash
node scripts/test-related.js "$ARGUMENTS"
```

The script:
1. Looks for a direct match in `__tests__/<basename>.test.ts`.
2. Looks for partial matches by stripping the extension and globbing.
3. Greps test files for imports of the source file.
4. Runs `npx jest` on the union of matches.

If no related tests are found, suggests a `__tests__/<basename>.test.ts` file to create.
