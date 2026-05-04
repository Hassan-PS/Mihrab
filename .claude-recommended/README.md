# PrayerApp Claude Code tooling layer

This is the **staging directory** for task #1 — the Claude Code tooling layer. Contents need to be moved to `.claude/` to take effect, because Claude Code protects `.claude/` from agent modification (hooks execute arbitrary code; the user must consent).

## Install

```bash
# From repo root, after reviewing the contents:
cp -r .claude-recommended/agents       .claude/agents
cp -r .claude-recommended/commands     .claude/commands
cp -r .claude-recommended/hooks        .claude/hooks
cp .claude-recommended/settings.recommended.json .claude/settings.json   # ⚠ overwrites
chmod +x .claude/hooks/*.js
```

After install, your `.claude/` will contain:

```
.claude/
├── settings.json          # Permissions + hook configuration
├── agents/                # Subagent definitions
│   ├── reviewer.md        # Code review enforcer
│   ├── designer.md        # Design authority
│   ├── locale-translator.md
│   └── provider-doctor.md
├── commands/              # Slash command definitions
│   ├── locale-audit.md
│   ├── locale-add.md
│   ├── test-related.md
│   ├── test-gaps.md
│   ├── dst-test.md
│   ├── perf-scan.md
│   ├── a11y-scan.md
│   ├── responsive-scan.md
│   ├── provider-snapshot.md
│   ├── tokens-audit.md
│   ├── component-coverage.md
│   ├── icon-audit.md
│   ├── state-coverage.md
│   └── design-qa.md
└── hooks/                 # Hook scripts
    ├── locale-parity-guard.js   # PreToolUse: warn on partial locale edits
    ├── post-edit-reminders.js   # PostToolUse: contextual reminders
    ├── task-context-primer.js   # UserPromptSubmit: belt-and-suspenders context
    └── stop-checks.js           # Stop: end-of-session audit reminders
```

The audit scripts that back the slash commands live under `scripts/` (not staged here — they're already in the repo at the standard location).

## Slash commands at a glance

| Command | What it does |
|---|---|
| `/locale-audit` | Diff all 13 locale files vs en.json. |
| `/locale-add KEY EN_VALUE` | Add a key to all 13 atomically. |
| `/test-related FILE` | Run only Jest tests related to FILE. |
| `/test-gaps` | List source files without a test. |
| `/dst-test` | Run only DST tests. |
| `/perf-scan` | Flag god components, missing memoization, leaks. |
| `/a11y-scan` | Flag missing labels/roles, hardcoded Left/Right. |
| `/responsive-scan` | Flag hardcoded widths, missing useWindowDimensions. |
| `/provider-snapshot` | Fetch and diff provider responses (use --ramadan for Ramadan checks). |
| `/tokens-audit` | Flag raw hex / magic numbers outside tokens.ts. |
| `/component-coverage` | Flag screens not using src/components/ui/. |
| `/icon-audit` | Catch mixed icon libraries. |
| `/state-coverage` | Flag undesigned empty/error/loading states. |
| `/design-qa` | Run the full design QA sweep. |

## Subagents

Invoke via the Agent tool:

- **`reviewer`** — code-review gate, enforces all rules in CLAUDE.md plus the 25 invariants in `agents/reviewer.md`.
- **`designer`** — design authority, owns tokens / theme / typography / motion / components / IA / seasonal treatments / states / sound.
- **`locale-translator`** — fills TODO_TRANSLATE markers across 12 non-English locales using the canonical Islamic terminology table.
- **`provider-doctor`** — diagnoses broken providers, owns Ramadan-format detection long-term, writes regression tests.

## Hooks

| Hook | Triggers | Purpose |
|---|---|---|
| `locale-parity-guard.js` | PreToolUse on Edit/Write of locale files | Reminds when editing a non-English locale alone; suggests `/locale-add`. |
| `post-edit-reminders.js` | PostToolUse on Edit/Write | Contextual reminders based on which file changed (e.g., "tokens changed → run /design-qa"). |
| `task-context-primer.js` | UserPromptSubmit | When the user mentions a task by number, injects the context-priming reminder ("read CLAUDE.md, the roadmap, the relevant subagent..."). The belt-and-suspenders piece. |
| `stop-checks.js` | Stop (end of session) | Reads the session transcript and reminds you to run audits matching the kinds of files touched. |

## Why staging instead of direct install

Claude Code protects `.claude/` from agent writes because hooks run arbitrary code on your machine. The user explicitly installs hooks after reviewing them. This is the right security posture — please skim each `hooks/*.js` file before copying to `.claude/`.
