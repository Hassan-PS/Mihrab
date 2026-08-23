#!/usr/bin/env node
/**
 * One native widget vocabulary, two platform formats.
 *
 * Android's res/values-XX/strings.xml tables are the source. This script writes the iOS
 * widget extension's Localizable.strings and Localizable.stringsdict from it,
 * one .lproj per locale.
 *
 * Why generate rather than keep two tables: the widgets say the same forty-odd
 * things on both platforms, and a phrase translated twice is a phrase that
 * drifts. Android already carries all thirteen languages; iOS carried none.
 * Deriving one from the other means a new widget label is translated once, and
 * the two platforms cannot disagree about what a streak line says.
 *
 * Run `npm run sync-widget-strings`. `--check` verifies the generated files
 * match the XML without writing, which is what the jest test uses — so an
 * edited strings.xml that was never regenerated fails the suite rather than
 * shipping an English iPhone.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const OUT = path.join(ROOT, 'ios', 'PrayerWidgetExtension');

/**
 * Android's folder name to iOS's.
 *
 * Only Indonesian differs, and it differs because Android froze the ISO code
 * as it stood in 1989: `in`, not `id`. iOS uses the modern one. Everything
 * else is the same two letters on both sides.
 */
const LOCALES = [
  { android: 'values', ios: 'en' },
  { android: 'values-ar', ios: 'ar' },
  { android: 'values-bn', ios: 'bn' },
  { android: 'values-de', ios: 'de' },
  { android: 'values-es', ios: 'es' },
  { android: 'values-fr', ios: 'fr' },
  { android: 'values-hi', ios: 'hi' },
  { android: 'values-in', ios: 'id' },
  { android: 'values-ru', ios: 'ru' },
  { android: 'values-sv', ios: 'sv' },
  { android: 'values-tr', ios: 'tr' },
  { android: 'values-ur', ios: 'ur' },
  { android: 'values-zh', ios: 'zh-Hans' },
];

/**
 * Entries iOS has no use for, kept out of the bundle rather than translated
 * into a table nobody reads. These are Android's own furniture: the
 * configuration activity, the notification channels behind the Live Activity,
 * and the picker descriptions, which iOS spells out in its own
 * `.description()` strings.
 */
const IOS_SKIP = /^(widget_configure_|live_activity_)/;

// ---------------------------------------------------------------- XML

/**
 * A deliberately small reader rather than a dependency.
 *
 * strings.xml is a flat list of two element kinds with no attributes beyond
 * `name` and `quantity`, and the repo has no XML parser already. Anything
 * this file cannot cope with — nesting, CDATA, an <xliff:g> — is something
 * the string table should not contain either, so it throws instead of
 * guessing.
 */
function parseStrings(xml) {
  const strings = new Map();
  const plurals = new Map();

  const stringRe = /<string\s+name="([^"]+)"\s*>([\s\S]*?)<\/string>/g;
  let m;
  while ((m = stringRe.exec(xml)) !== null) strings.set(m[1], m[2]);

  const pluralRe = /<plurals\s+name="([^"]+)"\s*>([\s\S]*?)<\/plurals>/g;
  while ((m = pluralRe.exec(xml)) !== null) {
    const items = new Map();
    const itemRe = /<item\s+quantity="([^"]+)"\s*>([\s\S]*?)<\/item>/g;
    let i;
    while ((i = itemRe.exec(m[2])) !== null) items.set(i[1], i[2]);
    plurals.set(m[1], items);
  }

  if (/<string-array|<xliff:g|<!\[CDATA\[/.test(xml)) {
    throw new Error(
      'strings.xml grew a construct this generator does not read (string-array, xliff:g or CDATA). ' +
        'Teach scripts/sync-widget-strings.js about it before using it.',
    );
  }
  return { strings, plurals };
}

/** Android's on-disk text to the actual characters. */
function decodeAndroid(raw) {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\@/g, '@')
    .trim();
}

/**
 * Android's `%1$s` is iOS's `%1$@`.
 *
 * Both take `%1$d` for an integer, so only the string specifier moves. A bare
 * `%s` would be ambiguous about ordering and Android's own lint rejects it in
 * a translatable string, so it is an error here rather than a silent guess.
 */
function androidFormatToIOS(text) {
  // A bare `%s` or `%d` is the one thing to catch. Android's own lint rejects
  // it in a translatable string because the argument order is then the
  // translator's to preserve by luck, and iOS would read it the same way. A
  // lone `%` that is not a conversion at all — "Sunnah 68%" — is left alone:
  // it is a percent sign, and neither platform formats these preview lines.
  const stripped = text.replace(/%%/g, '').replace(/%\d+\$[sd@]/g, '');
  if (/%[sd@]/.test(stripped)) {
    throw new Error(`unpositioned format specifier in: ${text}`);
  }
  return text.replace(/%(\d+)\$s/g, '%$1$@');
}

/** .strings is a plist-ish format: quotes and backslashes must be escaped. */
function escapeStrings(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------- emit

const HEADER = (androidDir) =>
  `/* Generated by scripts/sync-widget-strings.js from android/app/src/main/res/${androidDir}/strings.xml.\n` +
  `   Do not edit by hand — translate in the Android table and re-run the script. */\n\n`;

function buildStringsFile(strings, androidDir) {
  const lines = [HEADER(androidDir)];
  for (const [key, raw] of strings) {
    if (IOS_SKIP.test(key)) continue;
    lines.push(`"${key}" = "${escapeStrings(androidFormatToIOS(decodeAndroid(raw)))}";\n`);
  }
  return lines.join('');
}

/**
 * Android's <plurals> to iOS's .stringsdict.
 *
 * The shapes agree — both name the CLDR classes (one, few, many, other) and
 * both pick by an integer — so the translation is mechanical. The one
 * adjustment: inside a stringsdict case the count is the variable's own
 * argument, so Android's `%1$d` becomes a plain `%d`. `other` is required by
 * the format and by every language, so its absence is an error rather than a
 * silently half-working plural.
 */
function buildStringsDict(plurals, androidDir) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n',
    `<!-- Generated by scripts/sync-widget-strings.js from android/app/src/main/res/${androidDir}/strings.xml. -->\n`,
    '<plist version="1.0">\n<dict>\n',
  ];
  for (const [key, items] of plurals) {
    if (IOS_SKIP.test(key)) continue;
    if (!items.has('other')) throw new Error(`plurals ${key} has no "other" class`);
    out.push(`\t<key>${key}</key>\n\t<dict>\n`);
    out.push('\t\t<key>NSStringLocalizedFormatKey</key>\n\t\t<string>%#@count@</string>\n');
    out.push('\t\t<key>count</key>\n\t\t<dict>\n');
    out.push('\t\t\t<key>NSStringFormatSpecTypeKey</key>\n\t\t\t<string>NSStringPluralRuleType</string>\n');
    out.push('\t\t\t<key>NSStringFormatValueTypeKey</key>\n\t\t\t<string>d</string>\n');
    for (const [quantity, raw] of items) {
      const text = androidFormatToIOS(decodeAndroid(raw)).replace(/%1\$d/g, '%d');
      out.push(`\t\t\t<key>${quantity}</key>\n\t\t\t<string>${escapeXml(text)}</string>\n`);
    }
    out.push('\t\t</dict>\n\t</dict>\n');
  }
  out.push('</dict>\n</plist>\n');
  return out.join('');
}

// ---------------------------------------------------------------- run

function generate() {
  const files = new Map();
  const base = parseStrings(fs.readFileSync(path.join(RES, 'values', 'strings.xml'), 'utf8'));

  for (const { android, ios } of LOCALES) {
    const xmlPath = path.join(RES, android, 'strings.xml');
    if (!fs.existsSync(xmlPath)) throw new Error(`missing ${xmlPath}`);
    const { strings, plurals } = parseStrings(fs.readFileSync(xmlPath, 'utf8'));

    // A locale short of the English table would ship an iPhone that falls
    // back to the key name — "widget_next_label" drawn where "NEXT" should
    // be — so it fails here instead.
    for (const key of base.strings.keys()) {
      if (!IOS_SKIP.test(key) && !strings.has(key)) {
        throw new Error(`${android}/strings.xml is missing "${key}"`);
      }
    }
    for (const key of base.plurals.keys()) {
      if (!IOS_SKIP.test(key) && !plurals.has(key)) {
        throw new Error(`${android}/strings.xml is missing plurals "${key}"`);
      }
    }

    // Emit in the English table's order so a diff between two locales lines
    // up and a reordered translation file produces no churn.
    const ordered = new Map();
    for (const key of base.strings.keys()) ordered.set(key, strings.get(key));
    const orderedPlurals = new Map();
    for (const key of base.plurals.keys()) orderedPlurals.set(key, plurals.get(key));

    files.set(
      path.join(OUT, `${ios}.lproj`, 'Localizable.strings'),
      buildStringsFile(ordered, android),
    );
    files.set(
      path.join(OUT, `${ios}.lproj`, 'Localizable.stringsdict'),
      buildStringsDict(orderedPlurals, android),
    );
  }
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const files = generate();
  const drifted = [];

  for (const [file, contents] of files) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === contents) continue;
    drifted.push(path.relative(ROOT, file));
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }
  }

  if (check) {
    if (drifted.length === 0) {
      console.log(`${files.size} generated files match the Android string table.`);
      return 0;
    }
    console.error('These are out of date — run `npm run sync-widget-strings`:');
    for (const f of drifted) console.error(`  ${f}`);
    return 1;
  }

  console.log(
    drifted.length === 0
      ? `${files.size} files already up to date.`
      : `Wrote ${drifted.length} of ${files.size} files.`,
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`sync-widget-strings: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { generate, parseStrings, decodeAndroid, androidFormatToIOS };
