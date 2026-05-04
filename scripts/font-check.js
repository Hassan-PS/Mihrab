#!/usr/bin/env node
/**
 * /font-check — task #69 verification.
 *
 * Confirms the Amiri + Scheherazade New `.ttf` files are present at the
 * expected locations on both platforms, and that the iOS Info.plist
 * `UIAppFonts` entries match the filenames on disk.
 *
 * Exits 0 when:
 *   - All required `.ttf` files exist on iOS + Android.
 *   - The `OFL.txt` license file is alongside the `.ttf`s on both
 *     platforms (SIL OFL 1.1 requires distributing the license).
 *   - The Info.plist `UIAppFonts` array matches the iOS filenames.
 *
 * Exits 1 with a diff when any file is missing — runnable in CI as a
 * release gate so a font regression doesn't ship.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REQUIRED_FONTS = [
  'Amiri-Regular.ttf',
  'Amiri-Bold.ttf',
  'ScheherazadeNew-Regular.ttf',
];

const IOS_DIR = path.join(ROOT, 'ios', 'PrayerApp', 'Resources', 'fonts');
const ANDROID_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'fonts');
const PLIST = path.join(ROOT, 'ios', 'PrayerApp', 'Info.plist');

const findings = [];

function checkDir(dir, label) {
  if (!fs.existsSync(dir)) {
    findings.push(`✗ ${label} directory missing: ${path.relative(ROOT, dir)}`);
    return;
  }
  const present = new Set(fs.readdirSync(dir));
  for (const font of REQUIRED_FONTS) {
    if (!present.has(font)) {
      findings.push(`✗ ${label}: missing ${font} in ${path.relative(ROOT, dir)}`);
    }
  }
  // SIL OFL requires the license to ship alongside the font.
  const licenseAliases = ['OFL.txt', 'OFL-1.1.txt', 'LICENSE.txt', 'LICENSE'];
  if (!licenseAliases.some(name => present.has(name))) {
    findings.push(
      `⚠ ${label}: no OFL license file found in ${path.relative(ROOT, dir)} ` +
        `(SIL OFL 1.1 requires distributing the license alongside the .ttf)`,
    );
  }
}

checkDir(IOS_DIR, 'iOS');
checkDir(ANDROID_DIR, 'Android');

// Verify Info.plist references match the iOS files.
if (fs.existsSync(PLIST)) {
  const plist = fs.readFileSync(PLIST, 'utf-8');
  for (const font of REQUIRED_FONTS) {
    if (!plist.includes(font)) {
      findings.push(`✗ Info.plist UIAppFonts is missing entry: ${font}`);
    }
  }
}

if (findings.length === 0) {
  console.log('Fonts ✓ — Amiri + Scheherazade New present on iOS + Android, OFL license alongside.');
  process.exit(0);
}

console.log(`Font check — ${findings.length} issue${findings.length === 1 ? '' : 's'} found:`);
console.log('');
findings.forEach(f => console.log(`  ${f}`));
console.log('');
console.log('Drop the .ttf files (and OFL.txt) into the directories above.');
console.log('See docs/data-sources.md task #69 for download URLs.');
process.exit(1);
