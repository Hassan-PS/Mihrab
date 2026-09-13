#!/usr/bin/env node
/**
 * The release notes the app shows, built from the ones the stores already get.
 *
 * ── WHY THESE NOTES AND NOT CHANGELOG.md ──────────────────────────────
 *
 * There were three candidates for "what changed", and only one of them is
 * already written in the register a reader wants.
 *
 * CHANGELOG.md is written for whoever maintains this app: entries run to a
 * couple of hundred words, they explain the fault as well as the fix, and
 * everything since 2.15.1 still sits under `[Unreleased]` because the
 * section is cut by hand. It is the better document and the wrong one to
 * open over somebody's prayer times.
 *
 * The slide copy in `whatsNew.ts` was written for the reader, but only for
 * whichever release somebody remembered to write slides for — two entries
 * in the whole history.
 *
 * `fastlane/metadata/android/<locale>/changelogs/<code>.txt` is the third:
 * fifty-eight releases of it, each already inside Play's 500-character
 * limit, each already checked by `release.sh` before a tag can exist, and
 * Arabic and Swedish already translated beside the English. It cannot go
 * stale, because a release that forgets it cannot be cut.
 *
 * ── WHY THIS IS GENERATED AND COMMITTED ───────────────────────────────
 *
 * Those files are named by versionCode — `265.txt` — and a reader has
 * never heard of versionCode. The name and the date live in git: the tag
 * `v2.18.1` and the `build.gradle` under it. Metro cannot read git, and
 * neither can an F-Droid builder working from a tarball, so the join is
 * done here, once, and the result is committed.
 *
 * `--check` re-runs the join and fails if the committed file does not
 * match, which is what `releaseNotesGenerated.test.ts` calls. It does NOT
 * need git for a release already in the table: the version and date it
 * found last time are read back out of the generated file and reused. Git
 * is consulted only for a versionCode that has appeared since — which is
 * exactly the moment somebody is cutting a release, on a machine that has
 * the tags.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FASTLANE = path.join(ROOT, 'fastlane', 'metadata', 'android');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');
const OUT = path.join(ROOT, 'src', 'polish', 'releaseNotes.generated.ts');

/**
 * Play's folder names to the app's own locale codes.
 *
 * Only these three have notes. The other ten Play folders exist for the
 * store listing and carry no changelogs, and the app falls back to English
 * for them — see `noteFor` in releaseNotes.ts. Adding a language here is
 * adding a folder of .txt files and nothing else.
 */
const LOCALES = [
  { play: 'en-US', app: 'en' },
  { play: 'ar', app: 'ar' },
  { play: 'sv-SE', app: 'sv' },
];

/** The one that must exist for a release to be in the table at all. */
const BASE = 'en';

// ------------------------------------------------------------- inputs

/** Every versionCode that has an English note, oldest first. */
function codesWithNotes() {
  const dir = path.join(FASTLANE, 'en-US', 'changelogs');
  return fs
    .readdirSync(dir)
    .filter(f => /^\d+\.txt$/.test(f))
    .map(f => Number.parseInt(f, 10))
    .sort((a, b) => a - b);
}

/**
 * A note, trimmed to what the renderer needs.
 *
 * Play's files end with a newline and some carry a trailing blank line;
 * neither means anything to a reader, and left in they draw an empty row
 * under the last bullet.
 */
function noteText(playLocale, code) {
  const file = path.join(FASTLANE, playLocale, 'changelogs', `${code}.txt`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  return raw.length > 0 ? raw : null;
}

/** What `build.gradle` says this working tree is. */
function workingTreeVersion() {
  const gradle = fs.readFileSync(GRADLE, 'utf8');
  const code = /versionCode\s+(\d+)/.exec(gradle);
  const name = /versionName\s+"([^"]+)"/.exec(gradle);
  if (!code || !name) {
    throw new Error('build.gradle has no versionCode/versionName');
  }
  return { code: Number.parseInt(code[1], 10), version: name[1] };
}

/**
 * versionCode → { version, date } for every tag git can still see.
 *
 * Built lazily and only when something is missing from the committed
 * table, because it shells out once per tag and there are two hundred of
 * them. A tag whose `build.gradle` cannot be read is skipped rather than
 * fatal: the history goes back further than the Android project does.
 */
let tagCache = null;
function fromTags() {
  if (tagCache) return tagCache;
  tagCache = new Map();
  let tags;
  try {
    tags = git(['tag', '--list', 'v*']).trim();
  } catch {
    return tagCache; // no git, or no repository — the caller degrades.
  }
  if (!tags) return tagCache;
  for (const tag of tags.split('\n')) {
    let gradle;
    try {
      gradle = git(['show', `${tag}:android/app/build.gradle`]);
    } catch {
      continue;
    }
    const code = /versionCode\s+(\d+)/.exec(gradle);
    const name = /versionName\s+"([^"]+)"/.exec(gradle);
    if (!code || !name) continue;
    const key = Number.parseInt(code[1], 10);
    // The FIRST tag carrying a code is the release of it; a later tag that
    // forgot to bump is a mistake, not a second release.
    if (tagCache.has(key)) continue;
    let date = null;
    try {
      date = git(['log', '-1', '--format=%ad', '--date=short', tag]).trim();
    } catch {
      /* a tag with no reachable commit — the name is still worth having */
    }
    tagCache.set(key, { version: name[1], date: date || null });
  }
  return tagCache;
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * What the committed file already worked out, so `--check` needs no git.
 *
 * Parsed out of the generated source rather than imported: this is a
 * plain Node script and that file is TypeScript. The shape it reads is
 * the shape this script writes, and a file it cannot parse simply yields
 * nothing known — which falls back to git, which is the safe direction.
 */
function previouslyResolved() {
  const known = new Map();
  if (!fs.existsSync(OUT)) return known;
  const src = fs.readFileSync(OUT, 'utf8');
  const re = /code:\s*(\d+),\s*version:\s*'([^']+)',\s*date:\s*(?:'([^']+)'|null)/g;
  for (const m of src.matchAll(re)) {
    known.set(Number.parseInt(m[1], 10), {
      version: m[2],
      date: m[3] ?? null,
    });
  }
  return known;
}

// ------------------------------------------------------------- build

function build() {
  const known = previouslyResolved();
  const tree = workingTreeVersion();
  const entries = [];

  for (const code of codesWithNotes()) {
    const notes = {};
    for (const { play, app } of LOCALES) {
      const text = noteText(play, code);
      if (text) notes[app] = text;
    }
    // No English note is a release this table cannot describe at all, and
    // a fallback chain that lands on Arabic for a German reader is worse
    // than an absence.
    if (!notes[BASE]) continue;

    let resolved = known.get(code);
    if (!resolved) resolved = fromTags().get(code);
    if (!resolved && code === tree.code) {
      // Written ahead of the tag, which is the order release.sh enforces.
      resolved = { version: tree.version, date: null };
    }
    if (!resolved) {
      throw new Error(
        `versionCode ${code} has release notes but no tag and no entry in ` +
          `${path.relative(ROOT, OUT)}. Run this script on a clone with tags.`,
      );
    }
    entries.push({ code, ...resolved, notes });
  }

  // Newest first: the release just installed is what the sheet opens on,
  // and reversing a 58-entry array at render time to get there is work
  // done on every launch for a fact that is fixed at build time.
  entries.sort((a, b) => b.code - a.code);
  return entries;
}

// ------------------------------------------------------------- output

/** A TS string literal that survives apostrophes, newlines and RTL marks. */
function lit(s) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function render(entries) {
  const locales = LOCALES.map(l => l.app);
  const body = entries
    .map(e => {
      const notes = locales
        .filter(l => e.notes[l])
        .map(l => `      ${l}: ${lit(e.notes[l])},`)
        .join('\n');
      return [
        '  {',
        `    code: ${e.code},`,
        `    version: '${e.version}',`,
        `    date: ${e.date ? `'${e.date}'` : 'null'},`,
        '    notes: {',
        notes,
        '    },',
        '  },',
      ].join('\n');
    })
    .join('\n');

  return `/**
 * GENERATED by scripts/build-release-notes.js — do not edit.
 *
 * The store's own release notes, joined to the version name and date they
 * shipped under. Newest first. Run \`npm run build-release-notes\` after
 * adding a note under fastlane/metadata/android/<locale>/changelogs/.
 */

export type ReleaseNote = {
  /** Android versionCode — the key the note files are named by. */
  code: number;
  /** The name a reader knows it as, e.g. '2.18.5'. */
  version: string;
  /** ISO date of the release tag, or null for one not yet tagged. */
  date: string | null;
  /** Locale code to the note's raw text. 'en' is always present. */
  notes: Record<string, string>;
};

export const RELEASE_NOTES: ReleaseNote[] = [
${body}
];
`;
}

// ------------------------------------------------------------- main

/** The file's exact contents, as this script would write them today. */
function generate() {
  return render(build());
}

function main() {
  const check = process.argv.includes('--check');
  const next = generate();

  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== next) {
      console.error(
        `${path.relative(ROOT, OUT)} is out of date.\n` +
          'Run: npm run build-release-notes',
      );
      process.exit(1);
    }
    const count = (next.match(/^  \{$/gm) || []).length;
    console.log(`release notes are current (${count} releases)`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, next);
  const count = (next.match(/^  \{$/gm) || []).length;
  console.log(
    `wrote ${path.relative(ROOT, OUT)} — ${count} releases, ` +
      `${(Buffer.byteLength(next) / 1024).toFixed(1)} KB`,
  );
}

// Importable so the test can regenerate in memory and compare, the same
// way widgetStringsSync.test.ts does, rather than shelling out.
module.exports = { generate, OUT };

if (require.main === module) {
  main();
}
