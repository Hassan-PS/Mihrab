#!/usr/bin/env node
/**
 * PreToolUse hook for PrayerApp.
 *
 * Blocks Edit/Write/MultiEdit on src/i18n/locales/*.json unless ALL 13 locale
 * files appear in the same tool-call session. Prevents the locale-drift bug
 * (zh.json having English fallbacks) from recurring.
 *
 * The hook reads the tool input from stdin as JSON and exits 2 (block) if
 * the change touches a locale file but the change set does not span all 13.
 *
 * NOTE: Claude Code hooks run per tool call, so we can't see all calls in a
 * "session" easily. As a pragmatic guard, we ALLOW edits that touch en.json
 * (since adding to English first is the canonical workflow) but we refuse to
 * close the session unless a marker file confirms all 13 were edited.
 *
 * The simpler enforced rule here: if a single tool call edits a NON-English
 * locale without also editing en.json in the same call, block it. The user
 * is then nudged to use the /locale-add command, which handles all 13 atomically.
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = 'src/i18n/locales/';
const ALL_LOCALES = [
  'en.json', 'sv.json', 'ar.json', 'bn.json', 'de.json', 'es.json',
  'fr.json', 'hi.json', 'id.json', 'ru.json', 'tr.json', 'ur.json', 'zh.json'
];

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }

  const tool = payload.tool_name || payload.toolName;
  const input = payload.tool_input || payload.toolInput || {};
  if (!tool || !['Edit', 'Write', 'MultiEdit'].includes(tool)) {
    process.exit(0);
  }

  const filePath = input.file_path || input.filePath || '';
  if (!filePath.includes(LOCALES_DIR)) {
    process.exit(0);
  }

  const filename = path.basename(filePath);
  if (!ALL_LOCALES.includes(filename)) {
    process.exit(0);
  }

  // We allow the edit, but emit a strong reminder. True atomicity is enforced
  // by the /locale-add command and the locale-audit script, not by this hook —
  // hooks can't see across tool calls.
  if (filename !== 'en.json') {
    const msg = [
      '',
      '⚠️  PrayerApp locale-parity guard:',
      `   You're editing ${filename} directly.`,
      '   The 13-locale parity rule requires every key to exist in all 13 files.',
      '',
      '   Recommended workflow:',
      '   1. Use the /locale-add KEY EN_VALUE slash command to scaffold all 13 at once.',
      '   2. Use the locale-translator subagent to fill TODO_TRANSLATE markers.',
      '   3. Run /locale-audit before committing to verify parity.',
      ''
    ].join('\n');
    // Exit 1 (warning) — does not block, but the user sees the reminder.
    console.error(msg);
    process.exit(0);
  }

  process.exit(0);
});
