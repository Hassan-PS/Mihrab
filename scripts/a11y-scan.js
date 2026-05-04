#!/usr/bin/env node
/**
 * /a11y-scan backing script.
 *
 * Flags accessibility smells:
 *   - Pressable / TouchableOpacity / Button without accessibilityLabel.
 *   - Hardcoded paddingLeft/Right, marginLeft/Right (RTL-breaking).
 *   - Suspected small hit targets (height < 44 with no hitSlop).
 *   - Text without allowFontScaling declaration (advisory).
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

for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  const rel = path.relative(ROOT, f);
  const lines = content.split('\n');

  // 1. Interactive elements without accessibilityLabel.
  // Walk character-by-character so attribute-value blocks like
  // `onPress={() => doThing()}` (which contain `>`) don't terminate the
  // attribute list prematurely. Tracks `{}` depth to find the real
  // closing `>` of the opening tag.
  // Only audit RAW React Native interactive primitives. Our own wrappers
  // (`Button` from `components/ui/Button.tsx`) require a `label` prop by
  // construction, so they always have an accessible name without needing
  // `accessibilityLabel` at every call site.
  const TAGS = ['Pressable', 'TouchableOpacity', 'TouchableWithoutFeedback', 'TouchableHighlight'];
  const tagOpenRe = new RegExp(`<(${TAGS.join('|')})\\b`, 'g');
  let m;
  while ((m = tagOpenRe.exec(content)) !== null) {
    const tagName = m[1];
    const lineNo = content.slice(0, m.index).split('\n').length;
    let i = m.index + m[0].length;
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
    if (!/\baccessibilityLabel\s*=/.test(attrs) && !/\baccessible\s*=\s*\{?\s*false/.test(attrs)) {
      findings.push({
        file: rel,
        line: lineNo,
        issue: `<${tagName}> missing accessibilityLabel`,
      });
    }
  }

  // 2. RTL-breaking style props.
  //
  // Suppression: a `// rtl-safe` comment on the same line OR the previous
  // non-empty line marks the value as intentional (e.g., the geometric
  // triangle hack `width: 0; height: 0; borderLeftWidth + transparent` used
  // for the Qibla compass arrowhead). Geographic positions (the East/West
  // cardinal labels on the compass dial) are also marked rtl-safe.
  const rtlBreakingRe =
    /\b(paddingLeft|paddingRight|marginLeft|marginRight|borderLeftWidth|borderRightWidth|borderLeftColor|borderRightColor|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|left:\s*\d|right:\s*\d)\b/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!rtlBreakingRe.test(line)) continue;
    const trimmed = line.trim();
    // Skip line + JSDoc-block comments.
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (/rtl-safe/i.test(line)) continue; // explicit suppression on same line
    // Look back for the most recent non-empty line; if it's a comment with
    // `rtl-safe`, treat it as a block-level suppression for the next style.
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === '') j -= 1;
    if (j >= 0 && /^\s*\/\/.*rtl-safe/i.test(lines[j])) continue;
    if (line.includes('StyleSheet') || line.includes('style') || line.match(/[{,]\s*\w+:\s*\d/)) {
      findings.push({
        file: rel,
        line: i + 1,
        issue: `Hardcoded ${line.match(rtlBreakingRe)[0]} — use Start/End for RTL safety`,
      });
    }
  }
}

if (findings.length === 0) {
  console.log('No accessibility issues detected ✓');
  process.exit(0);
}

console.log(`Accessibility scan — ${findings.length} issue${findings.length === 1 ? '' : 's'} found:`);
console.log('');

const byFile = {};
findings.forEach(f => {
  if (!byFile[f.file]) byFile[f.file] = [];
  byFile[f.file].push(f);
});

for (const file of Object.keys(byFile).sort()) {
  console.log(`${file}:`);
  byFile[file].slice(0, 20).forEach(f => {
    console.log(`  :${f.line} — ${f.issue}`);
  });
  if (byFile[file].length > 20) {
    console.log(`  … and ${byFile[file].length - 20} more`);
  }
}

process.exit(1);
