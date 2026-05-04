#!/usr/bin/env node
/**
 * /state-coverage backing script.
 *
 * Flags raw "Loading..." / "Error" strings that should be designed empty/error/loading states.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.tsx$/.test(entry.name)) results.push(full);
  }
  return results;
}

const findings = [];
const files = walk(SRC);

const loadingRe = /['"`](Loading|Loading\.\.\.|Loading…|Please\s+wait)['"`]/i;
const errorRe = /['"`](Error|Failed|Something\s+went\s+wrong|Try\s+again)['"`]/i;
const activityIndicatorRe = /<ActivityIndicator\b/;

// Files that ARE the design-library targets are themselves allowed to
// reference these primitives — they're the wrappers everything else
// uses. The other ones are exempt via per-line `// activity-indicator-allowed:`
// (small inline progress, not full-screen) or per-file `// tokens-ok:`
// when they're share-image / branded surfaces.
const LIBRARY_FILES = new Set([
  path.join('src', 'components', 'ui', 'AsyncBoundary.tsx'),
  path.join('src', 'components', 'ui', 'Skeleton.tsx'),
  path.join('src', 'components', 'ui', 'Banner.tsx'),
  path.join('src', 'components', 'ui', 'Button.tsx'),
  path.join('src', 'components', 'ui', 'EmptyState.tsx'),
]);

for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (LIBRARY_FILES.has(rel)) continue;
  const content = fs.readFileSync(f, 'utf-8');
  const fileActivityOk = /activity-indicator-allowed:/i.test(content);
  const fileTokensOk = /\/\/\s*tokens-ok:/i.test(content);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip translation calls (`t('foo')`) and i18n wrappers
    if (line.includes("t('") || line.includes('t("') || line.includes('i18n.t')) continue;
    // Skip TypeScript discriminator-string-literal lines like:
    //   kind: 'loading'  |  kind: 'error'  |  if (x === 'loading')
    // Those are union-type identifiers, not user copy.
    if (/\bkind:\s*['"](loading|error|idle)['"]/i.test(line)) continue;
    if (/===\s*['"](loading|error|idle)['"]/i.test(line)) continue;

    // Per-line skip: when an `activity-indicator-allowed` comment appears
    // on the same or previous line, the spinner is intentional inline
    // progress (not a layout-stability concern).
    const prevLine = i > 0 ? lines[i - 1] : '';
    const lineActivityOk =
      /activity-indicator-allowed/i.test(line) ||
      /activity-indicator-allowed/i.test(prevLine);

    if (loadingRe.test(line) && !fileTokensOk) {
      findings.push({ file: rel, line: i + 1, issue: 'Raw "Loading…" string — use Skeleton or breathing crescent loader' });
    }
    if (errorRe.test(line) && !fileTokensOk) {
      findings.push({ file: rel, line: i + 1, issue: 'Raw "Error" string — use EmptyState with illustration + actionable CTA' });
    }
    if (
      activityIndicatorRe.test(line) &&
      !fileActivityOk &&
      !lineActivityOk &&
      !fileTokensOk
    ) {
      findings.push({ file: rel, line: i + 1, issue: 'ActivityIndicator — replace with library Skeleton for layout stability' });
    }
  }
}

if (findings.length === 0) {
  console.log('No undesigned empty/error/loading states detected ✓');
  process.exit(0);
}

console.log(`State coverage — ${findings.length} undesigned state${findings.length === 1 ? '' : 's'} found:`);
console.log('');
findings.slice(0, 50).forEach(f => console.log(`  ${f.file}:${f.line} — ${f.issue}`));
if (findings.length > 50) console.log(`  … and ${findings.length - 50} more`);
console.log('');
console.log('After task #42, every async boundary should have a designed empty/error/loading state.');
process.exit(1);
