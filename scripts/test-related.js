#!/usr/bin/env node
/**
 * /test-related backing script.
 *
 * Usage: node scripts/test-related.js <path/to/source/file.ts>
 *
 * Finds tests related to the given source file:
 *   1. Direct match: __tests__/<basename>.test.ts
 *   2. Substring match: __tests__/<basename>.*.test.ts
 *   3. Import grep: tests that import from the source file's path
 *
 * Runs `npx jest` on the union of matches.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, '__tests__');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/test-related.js <source-file>');
  process.exit(1);
}

const targetFull = path.isAbsolute(target) ? target : path.join(ROOT, target);
const base = path.basename(target).replace(/\.(ts|tsx)$/, '');

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.test\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const allTests = walk(TESTS);
const matches = new Set();

// 1 + 2: name match
for (const t of allTests) {
  const tbase = path.basename(t);
  if (tbase.startsWith(base + '.test') || tbase.startsWith(base + '.')) {
    matches.add(t);
  }
}

// 3: import grep
const moduleName = base; // Node import suffix is stripped
for (const t of allTests) {
  const content = fs.readFileSync(t, 'utf-8');
  if (content.includes(`/${moduleName}'`) || content.includes(`/${moduleName}"`)) {
    matches.add(t);
  }
}

if (matches.size === 0) {
  console.error(`No tests related to ${target} found.`);
  console.error(`Suggested test file: __tests__/${base}.test.ts`);
  process.exit(1);
}

const patterns = [...matches].map(t => path.relative(ROOT, t)).join('|');
console.log(`Running tests matching: ${patterns}`);
console.log('');

const result = spawnSync('npx', ['jest', '--testPathPattern', patterns], {
  stdio: 'inherit',
  cwd: ROOT,
});
process.exit(result.status || 0);
