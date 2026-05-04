---
description: Flag accessibility issues — missing accessibilityLabel/Role/Hint, hardcoded Left/Right styles, hit targets <44pt, missing live regions on dynamic content.
allowed-tools: Bash(node scripts/a11y-scan.js)
---

Run the accessibility audit:

```bash
node scripts/a11y-scan.js
```

Reports:
- **Missing `accessibilityLabel`** on `Pressable`/`TouchableOpacity`/`Button`/`Image`.
- **Missing `accessibilityRole`** on interactive elements.
- **Hardcoded `Left`/`Right`** in StyleSheet (use `Start`/`End` for RTL — Arabic and Urdu break otherwise).
- **Suspected small hit targets** — `Pressable` with style heights < 44pt and no `hitSlop`.
- **Missing live regions** on countdown text, prayer name displays, and other dynamic content.
- **`Text` without `allowFontScaling`** declaration (after the dynamic type pass — task #15).

Use before merging any UI change. Pair with VoiceOver/TalkBack manual testing for full coverage.
