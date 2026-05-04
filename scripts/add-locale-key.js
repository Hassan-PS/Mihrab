#!/usr/bin/env node
/**
 * /locale-add backing script.
 *
 * Usage: node scripts/add-locale-key.js <key.path> "<english value>"
 *
 * Adds the key to all 13 locale files at once:
 *   - en.json gets the actual English value.
 *   - All 12 non-English files get "TODO_TRANSLATE: <english value>" as a placeholder.
 *
 * Refuses to overwrite an existing key.
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const ALL_LOCALES = [
  'en.json', 'sv.json', 'ar.json', 'bn.json', 'de.json', 'es.json',
  'fr.json', 'hi.json', 'id.json', 'ru.json', 'tr.json', 'ur.json', 'zh.json'
];

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/add-locale-key.js <key.path> "<english value>"');
  console.error('Example: node scripts/add-locale-key.js home.nextPrayer "Next prayer"');
  process.exit(1);
}

const keyPath = args[0];
const enValue = args.slice(1).join(' ');
const placeholder = `TODO_TRANSLATE: ${enValue}`;

function setNested(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] !== undefined) {
    return false; // already exists
  }
  cur[leaf] = value;
  return true;
}

let allOk = true;
for (const filename of ALL_LOCALES) {
  const filePath = path.join(LOCALES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`✗ ${filename} not found`);
    allOk = false;
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const value = filename === 'en.json' ? enValue : placeholder;
  const added = setNested(data, keyPath, value);
  if (!added) {
    console.error(`✗ ${filename} — key "${keyPath}" already exists. Use Edit to update it.`);
    allOk = false;
    continue;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ ${filename} — added "${keyPath}"`);
}

if (!allOk) {
  console.error('');
  console.error('Some files were not modified. Run /locale-audit to see drift, fix manually, and re-run.');
  process.exit(1);
}

console.log('');
console.log(`Added "${keyPath}" to all 13 locales.`);
console.log(`Now invoke the locale-translator subagent to fill TODO_TRANSLATE markers in the 12 non-English files.`);
