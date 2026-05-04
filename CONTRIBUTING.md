# Contributing to PrayerApp

Thanks for your interest. PrayerApp is a privacy-respecting, FOSS-friendly prayer-times app. Contributions are welcome but the bar is high — the app is opened in moments of intention and should reward that with calm, not noise.

## Before you start

1. Read **`CLAUDE.md`** — architecture, build commands, and the rules every change must follow.
2. Read **`docs/design/principles.md`** — the five design principles. Every visual decision routes through these.
3. Read **`IMPROVEMENT_ROADMAP.md`** — the full plan for the v1.5+ quality and feature pass. If your contribution overlaps with a planned task, mention the task number in your PR.

## Hard rules

These are **non-negotiable**. The `reviewer` subagent in `.claude/agents/reviewer.md` enforces them mechanically.

### Privacy

- **No analytics, no trackers, no telemetry. Ever.**
- Location coordinates are PII — they live in encrypted storage, never plain AsyncStorage (after task #16).
- The `httpIdentity.ts` User-Agent never includes device-identifying information.

### F-Droid compatibility

- The app ships in two flavors: F-Droid (no Google Play Services, no IAP) and Play (with IAP for tips).
- **Every new dependency must be FOSS-compatible.** If you add a dep that pulls in non-free code, the F-Droid build will fail.
- Bundled fonts, icon libraries, and any other assets must be OFL/MIT/Apache-2.0 or similar.

### Internationalization

- The app ships in 13 locales: en, sv, ar, bn, de, es, fr, hi, id, ru, tr, ur, zh.
- **All 13 must stay in parity.** Adding a translation key requires editing all 13 files. The `PreToolUse` hook reminds you. The `/locale-add KEY EN_VALUE` slash command scaffolds all 13 at once.
- Religious terminology follows the canonical translation table in `.claude/agents/locale-translator.md`.

### Design system (after task #34 lands)

- **No raw hex codes** anywhere outside `src/theme/tokens.ts`.
- **No magic spacing/radius numbers** — every padding/margin/radius is a token.
- **Every `Text` uses a type token** — no raw `fontSize` in StyleSheet.
- **Every animation uses motion tokens AND has a Reduce Motion fallback.**
- **No raw `<Pressable>`/`<Modal>` in screens** after task #39 — use the wrappers in `src/components/ui/`.

### Accessibility

- **Every interactive element has `accessibilityLabel` AND `accessibilityRole`.**
- **Use `paddingStart/End` and `marginStart/End`, never `Left/Right`.** Arabic and Urdu break otherwise.
- **Hit targets ≥44pt.**
- **Live regions on dynamic content** (countdown, status updates).

### Architecture

- **Never use raw `(0, 0)` coordinates.** This sends prayer times for the coast of Ghana. Always check `!= null`.
- **Never bypass `_writeMutex` in `src/prayer/prayerStorage.ts`.** All cache writes serialize through it.
- **Every network provider response goes through `validateTimings()`.** Local adhan (on-device) is exempt.
- **Re-check exact-alarm permission immediately before scheduling**, not just at boot.

### Religious content

- **Every dua, ayah, or Islamic event must have a `source` field.** Religious content needs attribution.
- **Bundled Quran text must match the Tanzil canonical source.** No silent edits.

### Commits

- **No `Co-Authored-By` or AI-tool attribution lines.** History was cleaned; keep it that way.

## Workflow

1. Pick a task from the task list (or open an issue first to discuss). Mention the task number in your PR description.
2. Run `/perf-scan`, `/a11y-scan`, `/locale-audit` (and `/design-qa` for visual changes) before pushing.
3. Add tests under `__tests__/`. Use `/test-related <file>` to run only the relevant tests.
4. For Ramadan-related work, run `/provider-snapshot --ramadan` to verify Imsak handling.

## Tools that help you

- **Slash commands** — `.claude/commands/*.md`. Run `/help` to list.
- **Subagents** — `.claude/agents/`. Use them via the Agent tool. The `designer` subagent is the source of truth for visual decisions; the `reviewer` subagent is your pre-merge gate.
- **Hooks** — `.claude/hooks/`. Run automatically on edit, prompt submit, and session end.

## When in doubt

Choose the calmer, quieter option. The app shouldn't shout.
