#!/usr/bin/env node
/**
 * UserPromptSubmit hook for PrayerApp — the "belt-and-suspenders" layer.
 *
 * When the user mentions a task by number ("task #34", "#7", "tasks 1 and 6"),
 * inject a context-priming reminder into the agent's input so it knows to read
 * CLAUDE.md → IMPROVEMENT_ROADMAP.md → the task description → docs/design/ →
 * the relevant subagent BEFORE diving in.
 *
 * Without this, an agent picking up "do task #7" might dive straight in and
 * miss the dependency on #6, the Ramadan-format detection requirement, the
 * provider-doctor subagent that owns the long-term workflow, etc.
 *
 * This hook ensures the vision and dependency graph travel forward into every
 * task-pickup prompt automatically.
 */

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const prompt = payload.prompt || payload.user_message || '';
  if (typeof prompt !== 'string' || prompt.length === 0) {
    process.exit(0);
  }

  // Match patterns: "task #N", "#N", "tasks #N and #M", "task N", etc.
  const taskNumberRegex = /\b(?:task[s]?\s+)?#?(\d{1,2})\b/gi;
  const taskKeywords = /\b(task|tasks|implement|build|do|tackle|pick\s*up)\b/i;

  if (!taskKeywords.test(prompt)) {
    process.exit(0);
  }

  const matches = [...prompt.matchAll(taskNumberRegex)];
  const taskNumbers = matches
    .map(m => parseInt(m[1], 10))
    .filter(n => n >= 1 && n <= 44);

  if (taskNumbers.length === 0) {
    process.exit(0);
  }

  const unique = [...new Set(taskNumbers)];
  const taskList = unique.map(n => `#${n}`).join(', ');

  const reminder = [
    '',
    '─── PrayerApp context primer ───',
    `Detected task reference: ${taskList}.`,
    'Before starting any non-trivial work on these tasks, load context in this order:',
    '  1. CLAUDE.md → "Context priming" and "Vision" sections (already in your context).',
    '  2. IMPROVEMENT_ROADMAP.md → the section the task references.',
    '  3. The task description in TaskList → file:line refs and Claude Code workflow.',
    '  4. docs/design/ → principles.md, plus any task-specific design docs.',
    '  5. Related tasks → check blockedBy / blocks via TaskGet for cross-cuts.',
    '  6. The relevant subagent for this domain:',
    '     • Provider work → consult `provider-doctor` subagent.',
    '     • Visual / motion / typography work → consult `designer` subagent.',
    '     • Locale work → consult `locale-translator` subagent.',
    '     • Cross-cutting code review → consult `reviewer` subagent.',
    '',
    'The task description is intentionally not self-sufficient. Skipping context priming is how the work drifts.',
    '─── end primer ───',
    ''
  ].join('\n');

  // additionalContext is the documented field for UserPromptSubmit hooks to
  // append to the agent's input. We emit JSON to stdout for Claude Code to
  // merge into the next agent turn.
  const out = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: reminder
    }
  });
  process.stdout.write(out);
  process.exit(0);
});
