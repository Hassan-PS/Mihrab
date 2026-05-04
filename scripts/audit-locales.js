#!/usr/bin/env node
/**
 * /locale-audit backing script.
 *
 * Compares every locale file in src/i18n/locales/ against en.json and reports:
 *   - Missing keys per locale.
 *   - Extra keys per locale.
 *   - Suspected English fallbacks (locale value identical to English for non-trivial strings).
 *
 * Exit code: 0 = parity, 1 = drift detected.
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const ALL_LOCALES = [
  'en.json', 'sv.json', 'ar.json', 'bn.json', 'de.json', 'es.json',
  'fr.json', 'hi.json', 'id.json', 'ru.json', 'tr.json', 'ur.json', 'zh.json'
];

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function loadLocale(filename) {
  const filePath = path.join(LOCALES_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`✗ ${filename} — invalid JSON: ${e.message}`);
    return null;
  }
}

const en = loadLocale('en.json');
if (!en) {
  console.error('✗ en.json missing or invalid; cannot audit.');
  process.exit(1);
}
const enFlat = flatten(en);
const enKeys = new Set(Object.keys(enFlat));

let driftCount = 0;
let fallbackCount = 0;
const report = [];

for (const filename of ALL_LOCALES) {
  if (filename === 'en.json') continue;
  const locale = loadLocale(filename);
  if (!locale) continue;
  const localeFlat = flatten(locale);
  const localeKeys = new Set(Object.keys(localeFlat));

  const missing = [...enKeys].filter(k => !localeKeys.has(k));
  const extra = [...localeKeys].filter(k => !enKeys.has(k));

  // Suspected English fallbacks — non-trivial strings (>3 chars, contains a space
  // or letter) that are byte-identical between en.json and the locale.
  const fallbacks = [];
  for (const k of localeKeys) {
    if (!enFlat[k]) continue;
    const enVal = enFlat[k];
    const locVal = localeFlat[k];
    if (typeof enVal !== 'string' || typeof locVal !== 'string') continue;
    if (enVal.length < 4) continue;          // skip very short strings
    if (!/[a-zA-Z]/.test(enVal)) continue;   // skip pure punctuation/numbers
    if (enVal === locVal) {
      // For some locales (e.g., proper nouns "Adhan", "Iftar"), identical is fine.
      // We only flag if the string contains a space (likely an actual sentence).
      if (enVal.includes(' ')) fallbacks.push({ key: k, value: enVal });
    }
  }

  if (missing.length === 0 && extra.length === 0 && fallbacks.length === 0) {
    report.push(`✓ ${filename} — in parity (${localeKeys.size} keys)`);
    continue;
  }

  driftCount += missing.length + extra.length;
  fallbackCount += fallbacks.length;
  report.push(`✗ ${filename} — drift detected:`);
  if (missing.length) {
    report.push(`    Missing (${missing.length}):`);
    missing.slice(0, 20).forEach(k => report.push(`      - ${k}`));
    if (missing.length > 20) report.push(`      … and ${missing.length - 20} more`);
  }
  if (extra.length) {
    report.push(`    Extra (${extra.length}):`);
    extra.slice(0, 10).forEach(k => report.push(`      + ${k}`));
    if (extra.length > 10) report.push(`      … and ${extra.length - 10} more`);
  }
  if (fallbacks.length) {
    report.push(`    Suspected English fallbacks (${fallbacks.length}):`);
    fallbacks.slice(0, 10).forEach(({key, value}) =>
      report.push(`      ⚠ ${key} = "${value.slice(0, 60)}${value.length > 60 ? '…' : ''}"`));
    if (fallbacks.length > 10) report.push(`      … and ${fallbacks.length - 10} more`);
  }
}

console.log(report.join('\n'));
console.log('');

if (driftCount === 0 && fallbackCount === 0) {
  console.log('All 13 locales in parity ✓');
  process.exit(0);
} else {
  console.log(`Locale drift: ${driftCount} key mismatch${driftCount === 1 ? '' : 'es'}, ${fallbackCount} suspected fallback${fallbackCount === 1 ? '' : 's'}.`);
  console.log('Use /locale-add KEY EN_VALUE to scaffold new keys, then invoke the locale-translator subagent.');
  process.exit(1);
}
