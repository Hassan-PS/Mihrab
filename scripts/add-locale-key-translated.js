#!/usr/bin/env node
/**
 * Add one key to all 13 locale files with a translation for each — the
 * sibling of `add-locale-key.js` for when the translations are in hand,
 * so no `TODO_TRANSLATE:` placeholder ever lands (localeParity rejects
 * them).
 *
 *   node scripts/add-locale-key-translated.js quran.khatmahMore \
 *     '{"en":"More","sv":"Mer","ar":"المزيد", ...}'
 *
 * Refuses to overwrite an existing key, and refuses a map that is missing
 * a locale — parity is the whole point.
 */
const fs = require('fs');
const path = require('path');
const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const ALL = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];

const [keyPath, mapJson] = process.argv.slice(2);
if (!keyPath || !mapJson) {
  console.error('Usage: add-locale-key-translated.js <key.path> <json map of locale→value>');
  process.exit(1);
}
const map = JSON.parse(mapJson);
const missing = ALL.filter(l => typeof map[l] !== 'string' || !map[l].trim());
if (missing.length) {
  console.error(`Missing translations for: ${missing.join(', ')}`);
  process.exit(1);
}
const segs = keyPath.split('.');
for (const locale of ALL) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let node = json;
  for (const s of segs.slice(0, -1)) {
    if (typeof node[s] !== 'object' || node[s] === null) node[s] = {};
    node = node[s];
  }
  const leaf = segs[segs.length - 1];
  if (leaf in node) {
    console.error(`${locale}: ${keyPath} already exists`);
    process.exit(1);
  }
  node[leaf] = map[locale];
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}
console.log(`Added ${keyPath} to ${ALL.length} locales`);
