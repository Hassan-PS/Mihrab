#!/usr/bin/env node
/**
 * PostToolUse hook for PrayerApp.
 *
 * Prints a contextual reminder after Edit/Write/MultiEdit, based on which
 * file was touched. Reminders are advisory — they don't block.
 *
 *  - src/theme/tokens.ts → run /design-qa
 *  - src/i18n/locales/*.json → run /locale-audit
 *  - src/providers/* → run /provider-snapshot and /dst-test
 *  - src/notifications/* → run /test-related src/notifications/<file>
 *  - src/widget/* → run /dst-test
 *  - any *.tsx → run /perf-scan and /a11y-scan
 *  - any source file with no test edited in same session → soft nudge
 */

const path = require('path');

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const tool = payload.tool_name || payload.toolName;
  const input = payload.tool_input || payload.toolInput || {};
  if (!tool || !['Edit', 'Write', 'MultiEdit'].includes(tool)) {
    process.exit(0);
  }

  const filePath = input.file_path || input.filePath || '';
  const reminders = [];

  if (filePath.endsWith('src/theme/tokens.ts')) {
    reminders.push('Tokens changed → run /design-qa to verify contrast and token coverage across all themes.');
  }
  if (filePath.includes('src/i18n/locales/')) {
    reminders.push('Locale file changed → run /locale-audit to verify all 13 files stay in parity.');
  }
  if (filePath.includes('src/providers/')) {
    reminders.push('Provider changed → run /provider-snapshot and /dst-test before committing.');
  }
  if (filePath.includes('src/notifications/')) {
    const base = path.basename(filePath);
    reminders.push(`Notification logic changed → run /test-related src/notifications/${base}.`);
  }
  if (filePath.includes('src/widget/')) {
    reminders.push('Widget logic changed → run /dst-test (rollover/midnight is sensitive to DST).');
  }
  if (filePath.endsWith('.tsx')) {
    reminders.push('Component changed → /perf-scan and /a11y-scan should pass.');
  }
  if (filePath.endsWith('build.gradle') || filePath.includes('.pbxproj')) {
    reminders.push('Version-bearing file changed — verify all four (package.json, build.gradle, pbxproj, fdroid YAML) are in sync.');
  }

  if (reminders.length > 0) {
    console.error('');
    console.error('🪶 PrayerApp post-edit reminders:');
    reminders.forEach(r => console.error('   • ' + r));
    console.error('');
  }

  process.exit(0);
});
