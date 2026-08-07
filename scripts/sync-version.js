#!/usr/bin/env node
/**
 * Stamp the shipped version into the website.
 *
 *   node scripts/sync-version.js          # rewrite docs/ to match the build
 *   node scripts/sync-version.js --check  # exit 1 if it is out of date
 *
 * WHY THIS EXISTS. The site carried the version in two hand-edited places
 * and drifted from the app on both — and from ITSELF: the hero said 2.8.3
 * (231) while the colophon two screens down said 2.8.2 (230), neither of
 * which was shipping. Anything a release checklist asks a human to retype
 * in two files eventually says three different things.
 *
 * `android/app/build.gradle` is the single source of truth, because it is
 * the file that cannot be wrong — it is what actually goes into the APK
 * that `aapt2 dump badging` reports. iOS is bumped in lockstep from it.
 *
 * `--check` is wired into the jest suite (`__tests__/siteVersion.test.ts`)
 * so a release cut with a stale site fails before it is tagged, not after
 * someone notices the number on the live page.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');
const SITE = path.join(ROOT, 'docs', 'index.html');
const RECIPE = path.join(ROOT, 'contrib', 'fdroid', 'com.prayer_times.yml');

/** The version the app actually ships, straight out of the Android build. */
function shippedVersion() {
  const gradle = fs.readFileSync(GRADLE, 'utf-8');
  const name = /versionName\s+"([^"]+)"/.exec(gradle);
  const code = /versionCode\s+(\d+)/.exec(gradle);
  if (!name || !code) {
    throw new Error('could not read versionName/versionCode from build.gradle');
  }
  return { versionName: name[1], versionCode: Number(code[1]) };
}

/**
 * Every place on the site that names a version, as a replace rule.
 *
 * Each `find` must match exactly once. A rule that stops matching — because
 * the markup was reworded — fails loudly here rather than silently leaving
 * a stale number on the page, which is the whole failure this file exists
 * to prevent.
 */
function rules({ versionName, versionCode }) {
  return [
    {
      file: SITE,
      what: 'site: hero version line',
      find: /<span>Version [\d.]+ \(\d+\)<\/span>/,
      replace: `<span>Version ${versionName} (${versionCode})</span>`,
    },
    {
      file: SITE,
      what: 'site: footer colophon',
      find: /Mihrab [\d.]+ \(\d+\), built by/,
      replace: `Mihrab ${versionName} (${versionCode}), built by`,
    },
    // The F-Droid mirror. Since the recipe merged upstream their bot adds
    // each version from the tag, so this copy is documentation — but it is
    // what `verify-release.sh` reads, and it had gone three versions stale
    // while still naming a tag that no longer exists.
    {
      file: RECIPE,
      what: 'fdroid recipe: CurrentVersion',
      find: /CurrentVersion: [\d.]+/,
      replace: `CurrentVersion: ${versionName}`,
    },
    {
      file: RECIPE,
      what: 'fdroid recipe: CurrentVersionCode',
      find: /CurrentVersionCode: \d+/,
      replace: `CurrentVersionCode: ${versionCode}`,
    },
    // The build entry as well as the Current* pair. Stamping only the latter
    // left the recipe describing one version and building another, and the
    // suite caught it mid-release rather than the script preventing it.
    // One entry is kept here, always the shipping one; upstream's bot keeps
    // the full history.
    {
      file: RECIPE,
      what: 'fdroid recipe: build versionName',
      find: /- versionName: [\d.]+/,
      replace: `- versionName: ${versionName}`,
    },
    {
      file: RECIPE,
      what: 'fdroid recipe: build versionCode',
      // Anchored on the newline rather than `^` with the `m` flag: the
      // duplicate-match check rebuilds this as `new RegExp(find, 'g')`,
      // which throws the original flags away — so a rule that needs `m`
      // silently stops matching and reports the markup as broken.
      find: /\n {4}versionCode: \d+/,
      replace: `\n    versionCode: ${versionCode}`,
    },
    {
      file: RECIPE,
      what: 'fdroid recipe: build commit tag',
      find: /commit: v[\d.]+/,
      replace: `commit: v${versionName}`,
    },
  ];
}

function run() {
  const version = shippedVersion();
  const contents = new Map();
  const stale = [];
  const broken = [];

  for (const rule of rules(version)) {
    if (!contents.has(rule.file)) {
      contents.set(rule.file, fs.readFileSync(rule.file, 'utf-8'));
    }
    const text = contents.get(rule.file);
    const found = text.match(new RegExp(rule.find, 'g'));
    if (!found) {
      broken.push(rule.what);
      continue;
    }
    if (found.length > 1) {
      broken.push(`${rule.what} (matched ${found.length} times, expected 1)`);
      continue;
    }
    if (found[0] !== rule.replace) {
      stale.push(`${rule.what}: "${found[0]}" → "${rule.replace}"`);
      contents.set(rule.file, text.replace(rule.find, rule.replace));
    }
  }

  return { version, contents, stale, broken, changed: stale.length > 0 };
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const r = run();
  const label = `${r.version.versionName} (${r.version.versionCode})`;

  if (r.broken.length) {
    console.error(`✗ markup no longer matches: ${r.broken.join(', ')}`);
    console.error('  Update the rules in scripts/sync-version.js.');
    process.exit(1);
  }
  if (!r.changed) {
    console.log(`✓ everything already says ${label}`);
    process.exit(0);
  }
  if (check) {
    console.error(`✗ stale — the shipped version is ${label}`);
    for (const s of r.stale) console.error(`  ${s}`);
    console.error('  Fix with: node scripts/sync-version.js');
    process.exit(1);
  }
  for (const [file, text] of r.contents) fs.writeFileSync(file, text);
  console.log(`✓ stamped to ${label}`);
  for (const s of r.stale) console.log(`  ${s}`);
}

module.exports = { shippedVersion, rules, SITE, RECIPE };
