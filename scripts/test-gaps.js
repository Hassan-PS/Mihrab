#!/usr/bin/env node
/**
 * /test-gaps backing script.
 *
 * Lists src/**.{ts,tsx} files that have no corresponding test under __tests__/.
 * Skips trivial files (pure type definitions, files with only constants/exports).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TESTS = path.join(ROOT, '__tests__');

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function listTests() {
  if (!fs.existsSync(TESTS)) return new Set();
  const files = walk(TESTS);
  const names = new Set();
  for (const f of files) {
    const base = path.basename(f).replace(/\.test\.(ts|tsx)$/, '');
    names.add(base);
  }
  return names;
}

function isTrivial(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('//'));
  if (lines.length < 8) return true;
  // Pure type files
  if (/^[\s\S]*$/.test(content) && !content.includes('function ') && !content.includes('=>') && !content.match(/\bclass\s+\w+/)) {
    if (content.includes('export type') || content.includes('export interface')) {
      return true;
    }
  }
  return false;
}

const sourceFiles = walk(SRC);
const testNames = listTests();

const gaps = [];
for (const f of sourceFiles) {
  const base = path.basename(f).replace(/\.(ts|tsx)$/, '');
  if (testNames.has(base)) continue;
  if (isTrivial(f)) continue;
  gaps.push(path.relative(ROOT, f));
}

if (gaps.length === 0) {
  console.log('All non-trivial source files have a corresponding test ✓');
  process.exit(0);
}

console.log(`Source files without tests (${gaps.length}):`);
console.log('');
const byDir = {};
for (const g of gaps) {
  const dir = path.dirname(g);
  if (!byDir[dir]) byDir[dir] = [];
  byDir[dir].push(path.basename(g));
}
for (const dir of Object.keys(byDir).sort()) {
  console.log(`  ${dir}/`);
  for (const f of byDir[dir]) {
    console.log(`    - ${f}`);
  }
}
console.log('');
console.log('Use /test-related <file> when adding tests, and the verification step in CLAUDE.md.');
process.exit(0);
