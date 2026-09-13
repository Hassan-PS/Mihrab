#!/usr/bin/env node
/**
 * /font-check — the bundled faces, on both platforms, under the names
 * each platform actually resolves.
 *
 * The two platforms do NOT agree on what a font is called:
 *
 *   • iOS resolves `fontFamily` by the font's internal PostScript /
 *     family name, and `UIAppFonts` in Info.plist lists FILENAMES. So
 *     `Amiri-Regular.ttf` is addressed as 'Amiri'.
 *   • Android resolves `fontFamily` by the asset FILENAME. So the same
 *     face has to sit at `assets/fonts/Amiri.ttf` to answer to 'Amiri'.
 *
 * That asymmetry is the whole reason this script checks each platform
 * against its own list rather than one list twice. It is also how the
 * repo ended up shipping Amiri twice on Android — `Amiri.ttf` and a
 * byte-identical `Amiri-Regular.ttf`, 431 KB each, because one screen
 * asked for the iOS-shaped name on Android. Hence the duplicate check
 * below: two files with the same bytes in the Android font directory
 * means somebody is addressing a face by the wrong platform's name
 * again.
 *
 * Exits 0 when:
 *   - Every face is present under its own platform's filename.
 *   - No two Android font files are byte-identical.
 *   - `UIAppFonts` lists exactly the iOS filenames on disk.
 *   - The OFL license file sits alongside the `.ttf`s (warning only).
 *
 * Exits 1 with a list of findings otherwise.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

const IOS_DIR = path.join(ROOT, 'ios', 'PrayerApp', 'Resources', 'fonts');
const ANDROID_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'fonts');
const PLIST = path.join(ROOT, 'ios', 'PrayerApp', 'Info.plist');

/**
 * The faces the app actually ships, and what each platform calls them.
 * `family` is the string `src/theme/typography.ts` hands to `fontFamily`
 * on that platform — keep the two in step.
 */
const FACES = [
  {
    label: 'Amiri (Naskh body)',
    ios: { file: 'Amiri-Regular.ttf', family: 'Amiri' },
    android: { file: 'Amiri.ttf', family: 'Amiri' },
    usedBy: 'FONTS.arabicBody — dua text, surah names, general Arabic',
  },
  {
    label: 'Amiri Quran (ayah face)',
    ios: { file: 'AmiriQuran.ttf', family: 'Amiri Quran' },
    android: { file: 'AmiriQuran.ttf', family: 'AmiriQuran' },
    usedBy: 'FONTS.arabicQuran — ayah text only',
  },
  {
    label: 'KFGQPC surah names',
    ios: { file: 'SurahNames.ttf', family: 'SurahNames' },
    android: { file: 'SurahNames.ttf', family: 'SurahNames' },
    usedBy: 'src/quran/surahHeaderGlyph.ts — the 114 name glyphs',
  },
];

const findings = [];

function readDir(dir, label) {
  if (!fs.existsSync(dir)) {
    findings.push(`✗ ${label} directory missing: ${path.relative(ROOT, dir)}`);
    return null;
  }
  return new Set(fs.readdirSync(dir));
}

const iosPresent = readDir(IOS_DIR, 'iOS');
const androidPresent = readDir(ANDROID_DIR, 'Android');

for (const face of FACES) {
  if (iosPresent && !iosPresent.has(face.ios.file)) {
    findings.push(
      `✗ iOS: missing ${face.ios.file} (${face.label}) in ${path.relative(ROOT, IOS_DIR)}`,
    );
  }
  if (androidPresent && !androidPresent.has(face.android.file)) {
    findings.push(
      `✗ Android: missing ${face.android.file} (${face.label}) in ` +
        `${path.relative(ROOT, ANDROID_DIR)} — Android resolves by FILENAME, ` +
        `so this must match fontFamily '${face.android.family}'`,
    );
  }
}

// SIL OFL requires the license to ship alongside the font.
const LICENSE_ALIASES = ['OFL.txt', 'OFL-1.1.txt', 'LICENSE.txt', 'LICENSE'];
for (const [present, dir, label] of [
  [iosPresent, IOS_DIR, 'iOS'],
  [androidPresent, ANDROID_DIR, 'Android'],
]) {
  if (present && !LICENSE_ALIASES.some(name => present.has(name))) {
    findings.push(
      `⚠ ${label}: no OFL license file in ${path.relative(ROOT, dir)} ` +
        `(SIL OFL 1.1 requires distributing the license alongside the .ttf)`,
    );
  }
}

/**
 * Two byte-identical fonts in one directory is the duplicate-name bug.
 * Android pays for every copy on every download, so catch it here rather
 * than in an APK four releases later.
 */
if (androidPresent) {
  const byHash = new Map();
  for (const name of androidPresent) {
    if (!name.endsWith('.ttf') && !name.endsWith('.otf')) continue;
    const hash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(ANDROID_DIR, name)))
      .digest('hex');
    const seen = byHash.get(hash);
    if (seen) {
      const bytes = fs.statSync(path.join(ANDROID_DIR, name)).size;
      findings.push(
        `✗ Android: ${name} and ${seen} are the same font, byte for byte ` +
          `(${Math.round(bytes / 1024)} KB shipped twice). Address the face ` +
          `by one name — see FONTS in src/theme/typography.ts — and delete ` +
          `the other file.`,
      );
    } else {
      byHash.set(hash, name);
    }
  }
}

// `UIAppFonts` must list exactly the iOS filenames — no more, no fewer.
if (fs.existsSync(PLIST)) {
  const plist = fs.readFileSync(PLIST, 'utf-8');
  const block = plist.match(/<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const declared = block
    ? [...block[1].matchAll(/<string>(.*?)<\/string>/g)].map(m => m[1])
    : [];
  const wanted = FACES.map(f => f.ios.file);
  for (const file of wanted) {
    if (!declared.includes(file)) {
      findings.push(`✗ Info.plist UIAppFonts is missing entry: ${file}`);
    }
  }
  for (const file of declared) {
    if (!wanted.includes(file)) {
      findings.push(
        `✗ Info.plist UIAppFonts declares ${file}, which this script does ` +
          `not know about — add it to FACES or remove it from the plist.`,
      );
    }
  }
}

if (findings.length === 0) {
  console.log(
    `Fonts ✓ — ${FACES.length} faces present on iOS + Android under each ` +
      `platform's own name, no duplicates, UIAppFonts in step.`,
  );
  process.exit(0);
}

console.log(`Font check — ${findings.length} issue${findings.length === 1 ? '' : 's'} found:`);
console.log('');
findings.forEach(f => console.log(`  ${f}`));
console.log('');
console.log('Font provenance and download URLs: docs/data-sources.md.');
process.exit(1);
