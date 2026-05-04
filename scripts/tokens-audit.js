#!/usr/bin/env node
/**
 * /tokens-audit backing script.
 *
 * Reports raw values that should live in src/theme/tokens.ts after task #34:
 *   - Hex color codes anywhere outside tokens.ts.
 *   - Magic spacing/radius numbers (heuristic: padding/margin/borderRadius with literal numbers).
 *   - Raw fontSize values in StyleSheet.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TOKENS_FILE = 'src/theme/tokens.ts';
const APP_PALETTE = 'src/theme/appPalette.ts';

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

const findings = { hex: [], spacing: [], fontSize: [] };
const files = walk(SRC);

for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (rel === TOKENS_FILE || rel === APP_PALETTE) continue; // tokens are allowed here
  // Type definition files are pure types — no runtime tokens. Skip.
  if (rel.endsWith('.d.ts')) continue;
  // Provider catalog data and similar config-shaped files often carry
  // brand colors that are deliberate (provider logo accents); they're
  // exempt unless they shape user-facing chrome.
  const content = fs.readFileSync(f, 'utf-8');
  // File-wide opt-out via `// tokens-ok:` annotation. Used for surfaces
  // where deterministic raw values are part of the contract — e.g., the
  // share image (must look identical regardless of in-app theme), brand
  // colors in the donations section, or generated config files.
  if (/\/\/\s*tokens-ok:/i.test(content)) continue;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Hex colors. Universals (pure black/white) are theme-independent —
    // they look the same in every palette so they're allowed as raw
    // values. Lines that opt out via `// tokens-ok-line:` (or anywhere
    // in the file via `// tokens-ok:`, handled above) are skipped.
    const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
    let m;
    while ((m = hexRe.exec(line)) !== null) {
      const v = m[0].toLowerCase();
      if (v === '#fff' || v === '#ffffff' || v === '#000' || v === '#000000') continue;
      if (/\/\/\s*tokens-ok-line/i.test(line)) continue;
      findings.hex.push({ file: rel, line: i + 1, value: m[0], context: line.trim().slice(0, 80) });
    }

    // Magic spacing/radius/font numbers. Universal small values (≤2 px)
    // are typically hairline borders or 1-2 px nudges that don't warrant
    // a token. Lines that opt out via `// tokens-ok-line:` skip.
    const spacingRe = /\b(padding(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|borderRadius|borderWidth|gap):\s*(\d+)\b/g;
    while ((m = spacingRe.exec(line)) !== null) {
      const value = parseInt(m[2], 10);
      if (value <= 2) continue; // 1–2 px borders / nudges are fine
      if (/\/\/\s*tokens-ok-line/i.test(line)) continue;
      findings.spacing.push({ file: rel, line: i + 1, prop: m[1], value });
    }

    // Raw fontSize — should reference TYPE tokens. Per-line opt-out via
    // `// tokens-ok-line:` (e.g. one-off badges, A4 share-image cells).
    const fontSizeRe = /\bfontSize:\s*(\d+)\b/g;
    while ((m = fontSizeRe.exec(line)) !== null) {
      if (/\/\/\s*tokens-ok-line/i.test(line)) continue;
      findings.fontSize.push({ file: rel, line: i + 1, value: parseInt(m[1], 10) });
    }
  }
}

const total = findings.hex.length + findings.spacing.length + findings.fontSize.length;
if (total === 0) {
  console.log('All values use design tokens ✓');
  process.exit(0);
}

console.log(`Tokens audit — ${total} raw value${total === 1 ? '' : 's'} found outside tokens.ts:`);
console.log('');

if (findings.hex.length) {
  console.log(`Raw hex colors (${findings.hex.length}):`);
  findings.hex.slice(0, 30).forEach(f => {
    console.log(`  ${f.file}:${f.line} — ${f.value}`);
  });
  if (findings.hex.length > 30) console.log(`  … and ${findings.hex.length - 30} more`);
  console.log('');
}
if (findings.spacing.length) {
  console.log(`Magic spacing/radius numbers (${findings.spacing.length}):`);
  findings.spacing.slice(0, 30).forEach(f => {
    console.log(`  ${f.file}:${f.line} — ${f.prop}: ${f.value}`);
  });
  if (findings.spacing.length > 30) console.log(`  … and ${findings.spacing.length - 30} more`);
  console.log('');
}
if (findings.fontSize.length) {
  console.log(`Raw fontSize values (${findings.fontSize.length}):`);
  findings.fontSize.slice(0, 30).forEach(f => {
    console.log(`  ${f.file}:${f.line} — fontSize: ${f.value}`);
  });
  if (findings.fontSize.length > 30) console.log(`  … and ${findings.fontSize.length - 30} more`);
  console.log('');
}

console.log('After task #34 lands, every value here should reference a token from src/theme/tokens.ts.');
process.exit(1);
