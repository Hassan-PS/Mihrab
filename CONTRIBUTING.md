# Contributing to Mihrab

Thanks for your interest. Mihrab is a privacy-respecting, FOSS-friendly prayer-times app. Contributions are welcome but the bar is high — the app is opened in moments of intention and should reward that with calm, not noise.

## Before you start

Read these in order. Later items assume earlier.

1. **[CLAUDE.md](CLAUDE.md)** — the canonical project guide (architecture, stack, source layout, native modules, patterns). Both human contributors and Claude Code agents read it first.
2. **[docs/design/principles.md](docs/design/principles.md)** — the five design principles. Every visual decision routes through these.
3. **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)** — how releases reach the App Store, Play Store, and F-Droid. Skip if you're not touching the release pipeline.
4. **[IMPROVEMENT_ROADMAP.md](IMPROVEMENT_ROADMAP.md)** — the numbered task list every commit references. If your change overlaps with a planned task, mention the number in your PR description.

## Hard rules

These are **non-negotiable**. The `reviewer` subagent in `.claude/agents/reviewer.md` enforces them mechanically.

### Privacy

- **No analytics, no trackers, no telemetry. Ever.**
- Location coordinates are PII. They live in encrypted storage, never plain AsyncStorage (task #16).
- The HTTP `User-Agent` never includes device-identifying information.

### F-Droid compatibility

- The app ships in two flavors: `fdroid` (no Google Play Services, no IAP) and `play` (with `react-native-iap` for the tip jar).
- **Every new dependency must be FOSS-compatible.** Anything that transitively pulls Google Play Services or proprietary code breaks the F-Droid build.
- Bundled fonts, icon libraries, and any other assets must be OFL / MIT / Apache-2.0 or similar.

### Internationalization

- The app ships in 13 locales: `en sv ar bn de es fr hi id ru tr ur zh`.
- **All 13 must stay in parity.** Adding a translation key requires editing all 13 files in `src/i18n/locales/`. The `PreToolUse` hook reminds you. The `/locale-add KEY EN_VALUE` slash command scaffolds the new key in all 13 at once.
- Religious terminology follows the canonical table in `.claude/agents/locale-translator.md`.

### Design system (after task #34 lands)

- **No raw hex codes** outside `src/theme/tokens.ts`.
- **No magic spacing/radius numbers** — every padding/margin/radius is a token.
- **Every `Text` uses a type token** — no raw `fontSize` in `StyleSheet.create`.
- **Every animation uses motion tokens AND has a Reduce Motion fallback.**
- **No raw `<Pressable>` / `<Modal>` in screens** (after task #39) — use the wrappers in `src/components/ui/`.

### Accessibility

- **Every interactive element has `accessibilityLabel` AND `accessibilityRole`.**
- **Use `paddingStart/End` and `marginStart/End`, never `Left/Right`.** Arabic and Urdu break otherwise.
- **Hit targets ≥ 44pt.**
- **Live regions on dynamic content** (countdown, status updates).

### Architecture

- **Never use raw `(0, 0)` coordinates.** This sends prayer times for the coast of Ghana. Always check `!= null` and show a loading state.
- **Never bypass `_writeMutex` in `src/prayer/prayerStorage.ts`.** All cache writes serialize through it; bypassing causes intermittent data loss.
- **Every network provider response goes through `validateTimings()`.** Local adhan (on-device math) is the only exempt path.
- **Re-check exact-alarm permission immediately before scheduling**, not just at boot.
- **Schema migrations are additive only.** Removing or repurposing fields in `prayerapp.settings.v1` breaks upgraders.

### Religious content

- **Every dua, ayah, or Islamic event must have a `source` field.** Religious content needs attribution.
- **Bundled Quran text must match the Tanzil canonical source.** No silent edits.

### Commits

- **No `Co-Authored-By` or AI-tool attribution lines.** History was cleaned; keep it clean.
- One concise commit per logical change.
- Reference the task number from `IMPROVEMENT_ROADMAP.md` when the change implements one (e.g. `task #128: …`).

## Workflow

1. Pick a task from `IMPROVEMENT_ROADMAP.md` (or open an issue first to discuss). Mention the task number in your PR description.
2. Run the relevant `.claude/commands/*` slash commands before pushing — `/locale-audit`, `/a11y-scan`, `/tokens-audit` are the common ones; `/design-qa` for visual changes; `/provider-snapshot --ramadan` for prayer-time work that may touch Imsak handling.
3. Add tests under `__tests__/`. Use `/test-related <file>` to run only the relevant tests.
4. Bump versions only as part of a release (see **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)** for the per-channel flow).

## Tools that help you

- **Slash commands** — `.claude/commands/*.md`.
- **Subagents** — `.claude/agents/`. The `designer` subagent is the source of truth for visual decisions; the `reviewer` subagent is your pre-merge gate; `locale-translator` handles religious-terminology translation; `provider-doctor` diagnoses scraper / API drift on the four data providers.
- **Hooks** — `.claude/hooks/`. Run automatically on edit, prompt submit, and session end.

## Reporting bugs

- **Security issues** — read [SECURITY.md](SECURITY.md) first; do not file public issues.
- **Anything else** — open a GitHub issue with the device + OS version + build number (`com.prayer_times` → About → Build).

## When in doubt

Choose the calmer, quieter option. The app shouldn't shout.
