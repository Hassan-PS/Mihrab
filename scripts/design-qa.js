#!/usr/bin/env node
/**
 * /design-qa backing script.
 *
 * Orchestrates all design audits and produces a single report:
 *   /tokens-audit + /component-coverage + /icon-audit + /a11y-scan +
 *   /responsive-scan + /locale-audit + /state-coverage
 *
 * Returns PASS/FAIL verdict at the end.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const audits = [
  { name: 'Tokens',         script: 'tokens-audit.js' },
  { name: 'Components',     script: 'component-coverage.js' },
  { name: 'Icons',          script: 'icon-audit.js' },
  { name: 'Accessibility',  script: 'a11y-scan.js' },
  { name: 'Responsive',     script: 'responsive-scan.js' },
  { name: 'Locales',        script: 'audit-locales.js' },
  { name: 'States',         script: 'state-coverage.js' },
];

const results = [];
let anyFail = false;

for (const audit of audits) {
  const r = spawnSync('node', [path.join(__dirname, audit.script)], { cwd: ROOT });
  const status = r.status === 0 ? 'PASS' : 'FAIL';
  if (r.status !== 0) anyFail = true;
  results.push({
    name: audit.name,
    status,
    output: (r.stdout?.toString() || '') + (r.stderr?.toString() || ''),
  });
}

console.log('═══════════════════════════════════════════');
console.log('       PrayerApp Design QA Report');
console.log('═══════════════════════════════════════════');
console.log('');
for (const r of results) {
  const marker = r.status === 'PASS' ? '✓' : '✗';
  console.log(`${marker} ${r.name.padEnd(15)} ${r.status}`);
}
console.log('');
console.log('───────────────────────────────────────────');
console.log('Detail:');
console.log('───────────────────────────────────────────');
for (const r of results) {
  if (r.status === 'PASS') continue;
  console.log('');
  console.log(`▸ ${r.name}`);
  console.log(r.output.trim().split('\n').slice(0, 30).join('\n'));
  const totalLines = r.output.trim().split('\n').length;
  if (totalLines > 30) console.log(`  … (${totalLines - 30} more lines truncated)`);
}

console.log('');
console.log('═══════════════════════════════════════════');
console.log(anyFail ? '       Verdict: FAIL — fix issues above' : '       Verdict: PASS ✓');
console.log('═══════════════════════════════════════════');

process.exit(anyFail ? 1 : 0);
