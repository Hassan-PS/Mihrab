#!/usr/bin/env node
/**
 * Stop hook for PrayerApp.
 *
 * Before ending the session, remind the user to run the audits that match
 * the kinds of files they touched. Reads the transcript path from the hook
 * payload to peek at what was edited (best-effort — falls back to silence
 * if transcript can't be parsed).
 */

const fs = require('fs');

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const transcriptPath = payload.transcript_path || payload.transcriptPath;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  let transcript;
  try {
    transcript = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    process.exit(0);
  }

  const reminders = [];
  const touched = (pattern) => transcript.includes(pattern);

  if (touched('src/i18n/locales/')) {
    reminders.push('Locale files were edited → run /locale-audit before ending session.');
  }
  if (touched('src/theme/tokens.ts')) {
    reminders.push('Design tokens changed → run /design-qa.');
  }
  if (touched('src/providers/')) {
    reminders.push('Provider code changed → run /provider-snapshot and /dst-test.');
  }
  if (touched('src/notifications/')) {
    reminders.push('Notification code changed → run notification tests with /test-related.');
  }
  if (touched('src/widget/')) {
    reminders.push('Widget code changed → run /dst-test.');
  }
  if (transcript.match(/__tests__\/.*\.test\.tsx?/) && !transcript.includes('npx jest')) {
    reminders.push('Tests were edited but not run — `npx jest` before committing.');
  }
  if (touched('.tsx') && !touched('/perf-scan') && !touched('/a11y-scan')) {
    reminders.push('Components were edited — consider running /perf-scan and /a11y-scan.');
  }

  if (reminders.length > 0) {
    console.error('');
    console.error('🪶 PrayerApp end-of-session checks:');
    reminders.forEach(r => console.error('   • ' + r));
    console.error('');
  }

  process.exit(0);
});
