#!/usr/bin/env node
/**
 * /component-coverage backing script.
 *
 * After task #39 (component library) lands, this audit lists screens still
 * using raw RN primitives where library components in src/components/ui/ exist.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const UI_LIB = path.join(SRC, 'components', 'ui');

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.tsx$/.test(entry.name)) results.push(full);
  }
  return results;
}

const libraryExists = fs.existsSync(UI_LIB);
if (!libraryExists) {
  console.log('Component library at src/components/ui/ does not exist yet — task #39 has not landed.');
  console.log('After #39, this audit will report raw primitives that should use library wrappers.');
  process.exit(0);
}

const libraryComponents = fs.readdirSync(UI_LIB)
  .filter(f => /\.tsx?$/.test(f))
  .map(f => f.replace(/\.tsx?$/, ''));

const screens = walk(path.join(SRC, 'screens'));
const findings = [];

for (const f of screens) {
  const rel = path.relative(ROOT, f);
  const content = fs.readFileSync(f, 'utf-8');

  // If there's a library Pressable wrapper, raw <Pressable> from react-native is a smell
  const reactNativePressableRe = /import\s*{[^}]*\bPressable\b[^}]*}\s*from\s*['"]react-native['"]/;
  if (libraryComponents.includes('Pressable') && reactNativePressableRe.test(content)) {
    findings.push({ file: rel, issue: 'Imports Pressable from react-native — use the library wrapper' });
  }
  if (libraryComponents.includes('Modal') && /import\s*{[^}]*\bModal\b[^}]*}\s*from\s*['"]react-native['"]/.test(content)) {
    findings.push({ file: rel, issue: 'Imports Modal from react-native — use the library Sheet/Modal wrapper' });
  }
  if (libraryComponents.includes('Skeleton') && /<ActivityIndicator/.test(content)) {
    // Allowlist sites that intentionally use a small inline ActivityIndicator
    // for transient (<1 s) progress — replacing with a Skeleton would harm
    // the UX. Sites must opt in with `// activity-indicator-allowed: <reason>`
    // somewhere in the file.
    // Accept both line comments (`// activity-indicator-allowed:`) and JSX
    // block comments (`{/* activity-indicator-allowed: */}`).
    const allowed = /activity-indicator-allowed:/i.test(content);
    if (!allowed) {
      findings.push({
        file: rel,
        issue: 'Uses ActivityIndicator — use library Skeleton for layout-stability',
      });
    }
  }
}

if (findings.length === 0) {
  console.log('All screens use the component library where applicable ✓');
  process.exit(0);
}

console.log(`Component coverage — ${findings.length} screen${findings.length === 1 ? '' : 's'} not using library:`);
console.log('');
findings.forEach(f => console.log(`  ${f.file} — ${f.issue}`));
process.exit(1);
