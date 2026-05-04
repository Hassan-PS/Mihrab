#!/usr/bin/env node
/**
 * /responsive-scan backing script (for iPad/macOS task #33).
 *
 * Flags responsive layout smells:
 *   - Hardcoded widths > 600 without maxWidth cap.
 *   - Screens that don't import useWindowDimensions.
 *   - Pressable without ({hovered}) hover style for Mac/iPad pointers.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCREENS = path.join(ROOT, 'src', 'screens');

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.tsx$/.test(entry.name)) results.push(full);
  }
  return results;
}

const findings = [];
const files = walk(SCREENS);

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const content = fs.readFileSync(f, 'utf-8');
  const lines = content.split('\n');
  // Only top-level screen files own their own layout. Child components
  // under src/screens/<sub>/ are presentational primitives that receive
  // dimensions / palettes from their orchestrator screen — flagging
  // them for "missing useWindowDimensions" is a false positive.
  const isTopLevelScreen = path.dirname(rel) === path.join('src', 'screens');

  // 1. Hardcoded width > 600 without maxWidth
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/\bwidth:\s*(\d+)\b/);
    if (m) {
      const w = parseInt(m[1], 10);
      if (w > 600 && !line.includes('maxWidth')) {
        findings.push({ file: rel, line: i + 1, issue: `Hardcoded width: ${w} — cap with maxWidth for Mac windows` });
      }
    }
  }

  // 2. Screen file without responsive awareness. `useBreakpoint` from
  // src/responsive/breakpoints.ts already wraps useWindowDimensions, so it
  // counts. Container files that just orchestrate child screens and don't
  // own layout (like the navigator wrapper) opt out via `// responsive-ok`.
  const hasResponsive =
    content.includes('useWindowDimensions') ||
    content.includes('Dimensions.get') ||
    content.includes('useBreakpoint') ||
    /\/\/\s*responsive-ok/i.test(content);
  if (!hasResponsive && isTopLevelScreen) {
    findings.push({ file: rel, line: 1, issue: 'Screen file does not use useWindowDimensions — layout may not adapt to iPad/Mac widths' });
  }

  // 3. Pressable without hover style (advisory after task #33).
  // Files can opt the entire file out via `// hover-ok:` annotation when
  // their Pressables are list rows or non-interactive surfaces where a
  // hover treatment would harm the design (e.g. dense FlatList rows).
  const fileHoverOk = /\/\/\s*hover-ok:/i.test(content);
  // The audit walks character-by-character so attribute-value blocks like
  // `onPress={() => doThing()}` (which contain `>`) don't terminate the
  // attribute list prematurely. Tracks `{}` depth to find the real
  // closing `>` of the opening tag.
  const tagOpenRe = /<Pressable\b/g;
  let pm;
  while ((pm = tagOpenRe.exec(content)) !== null) {
    const lineNo = content.slice(0, pm.index).split('\n').length;
    let i = pm.index + pm[0].length;
    let depth = 0;
    const attrStart = i;
    while (i < content.length) {
      const c = content[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    const attrs = content.slice(attrStart, i);
    if (!attrs.includes('hovered') && !fileHoverOk) {
      findings.push({ file: rel, line: lineNo, issue: '<Pressable> without ({ hovered }) style — add for iPad/Mac pointer support' });
    }
  }
}

if (findings.length === 0) {
  console.log('Responsive layout looks good ✓');
  process.exit(0);
}

console.log(`Responsive scan — ${findings.length} issue${findings.length === 1 ? '' : 's'} found:`);
console.log('');
const byFile = {};
findings.forEach(f => { (byFile[f.file] = byFile[f.file] || []).push(f); });
for (const file of Object.keys(byFile).sort()) {
  console.log(`${file}:`);
  byFile[file].slice(0, 15).forEach(f => console.log(`  :${f.line} — ${f.issue}`));
  if (byFile[file].length > 15) console.log(`  … and ${byFile[file].length - 15} more`);
}
process.exit(0);
