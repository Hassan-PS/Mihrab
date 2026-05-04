#!/usr/bin/env node
/**
 * /icon-audit backing script.
 *
 * Lists icon library imports across the codebase. Goal: a single library is used.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const ICON_LIBRARIES = {
  'phosphor-react-native': 'Phosphor',
  '@phosphor-icons': 'Phosphor',
  'lucide-react-native': 'Lucide',
  'react-native-vector-icons': 'Vector Icons',
  '@expo/vector-icons': 'Expo Vector Icons',
  'react-native-feather': 'Feather',
  'react-native-heroicons': 'Heroicons',
};

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const usage = {};
const files = walk(SRC);

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const content = fs.readFileSync(f, 'utf-8');

  for (const [pkg, name] of Object.entries(ICON_LIBRARIES)) {
    const re = new RegExp(`from\\s+['"]${pkg.replace(/[/@]/g, '\\$&')}[^'"]*['"]`);
    if (re.test(content)) {
      if (!usage[name]) usage[name] = new Set();
      usage[name].add(rel);
    }
  }
}

const libsUsed = Object.keys(usage);
if (libsUsed.length === 0) {
  console.log('No icon libraries imported. Custom-only or no icons yet ✓');
  process.exit(0);
}
if (libsUsed.length === 1) {
  console.log(`Single icon library: ${libsUsed[0]} (${usage[libsUsed[0]].size} files) ✓`);
  process.exit(0);
}

console.log(`Multiple icon libraries detected — task #37 should consolidate to one:`);
console.log('');
for (const lib of libsUsed) {
  console.log(`  ${lib} — ${usage[lib].size} file${usage[lib].size === 1 ? '' : 's'}:`);
  [...usage[lib]].slice(0, 10).forEach(f => console.log(`    ${f}`));
  if (usage[lib].size > 10) console.log(`    … and ${usage[lib].size - 10} more`);
}
process.exit(1);
