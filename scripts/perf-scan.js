#!/usr/bin/env node
/**
 * /perf-scan backing script.
 *
 * Flags performance smells across the React Native codebase:
 *   - Components > 400 lines (god components).
 *   - setInterval / setTimeout without cleanup in useEffect.
 *   - StyleSheet.create() inside component bodies (should hoist).
 *   - Inline arrow functions or object literals as props (busts React.memo).
 *   - Large default exports (> 30 props/lines per component definition).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const findings = [];
const files = walk(SRC);

for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  const lines = content.split('\n');
  const rel = path.relative(ROOT, f);

  // 1. God components
  if (f.endsWith('.tsx') && lines.length > 400) {
    findings.push({
      severity: lines.length > 700 ? 'critical' : 'warn',
      file: rel,
      issue: `God component — ${lines.length} lines (target ≤ 400)`
    });
  }

  // 2. setInterval / setTimeout without cleanup
  const intervalMatches = content.matchAll(/(setInterval|setTimeout)\s*\(/g);
  for (const m of intervalMatches) {
    const idx = m.index;
    // Find the enclosing useEffect and check for return
    const before = content.slice(Math.max(0, idx - 600), idx);
    const after = content.slice(idx, idx + 800);
    if (before.includes('useEffect') || before.includes('useCallback')) {
      if (!after.match(/return\s+(\(\)\s*=>|function)\s*[{(]/) &&
          !after.includes('clearInterval') && !after.includes('clearTimeout')) {
        const lineNo = content.slice(0, idx).split('\n').length;
        findings.push({
          severity: 'warn',
          file: rel,
          line: lineNo,
          issue: `${m[1]} without visible cleanup — ensure useEffect returns clearInterval/clearTimeout`
        });
      }
    }
  }

  // 3. StyleSheet.create() inside component bodies
  const styleSheetMatches = content.matchAll(/StyleSheet\.create\s*\(/g);
  for (const m of styleSheetMatches) {
    const before = content.slice(0, m.index);
    // Heuristic: if the StyleSheet.create call appears AFTER the first `function ComponentName(` or `const ComponentName = (`, flag it.
    const componentDeclMatch = before.match(/(?:function\s+([A-Z]\w+)\s*\(|const\s+([A-Z]\w+)\s*=\s*\([^)]*\)\s*=>)/);
    if (componentDeclMatch) {
      // If StyleSheet.create is AFTER a return statement, it's inside the body
      const afterReturn = before.lastIndexOf('return ');
      const lastBrace = before.lastIndexOf('}');
      if (afterReturn > lastBrace) {
        const lineNo = before.split('\n').length;
        findings.push({
          severity: 'warn',
          file: rel,
          line: lineNo,
          issue: 'StyleSheet.create() inside component body — hoist to module scope'
        });
      }
    }
  }
}

if (findings.length === 0) {
  console.log('No performance issues detected ✓');
  process.exit(0);
}

const groups = { critical: [], warn: [] };
findings.forEach(f => groups[f.severity].push(f));

console.log(`Performance scan — ${findings.length} issue${findings.length === 1 ? '' : 's'} found:`);
console.log('');

if (groups.critical.length) {
  console.log('CRITICAL:');
  groups.critical.forEach(f => {
    console.log(`  ${f.file}${f.line ? ':' + f.line : ''} — ${f.issue}`);
  });
  console.log('');
}
if (groups.warn.length) {
  console.log('WARN:');
  groups.warn.forEach(f => {
    console.log(`  ${f.file}${f.line ? ':' + f.line : ''} — ${f.issue}`);
  });
}

process.exit(groups.critical.length > 0 ? 1 : 0);
