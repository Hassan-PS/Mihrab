/**
 * The step that improves the cycle rather than the release.
 *
 * Every other check in release.sh stops a bad release. This one stops a
 * bad *cycle*: the same mistake being paid for twice because nobody wrote
 * down what the first one cost.
 *
 * A release that changed the cycle, or that had to be aborted and
 * restarted, leaves `**Lesson:** _(unfilled)_` in docs/release-log.md, and
 * the next release refuses to start until it says something. A clean run
 * that touched none of the machinery writes "none needed" by itself.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const script = readFileSync(path.join(ROOT, 'scripts', 'release.sh'), 'utf8');
const journal = readFileSync(path.join(ROOT, 'docs', 'release-log.md'), 'utf8');
const ignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

describe('the lesson gate', () => {
  it('matches a whole line, not a substring anywhere in the file', () => {
    // It matched a substring once, and the journal quotes the marker in
    // its own header to explain itself — so the gate matched the
    // documentation and would have refused every release for ever. A gate
    // nobody can satisfy teaches people to delete it.
    expect(script).toContain("grep -n '^\\*\\*Lesson:\\*\\* _(unfilled)_$'");
    expect(script).not.toMatch(/has "\$JOURNAL_SRC" "_\(unfilled\)_"/);
  });

  it('the journal that exists today satisfies its own gate', () => {
    // The same anchored test the script runs. If this fails, no release
    // can be cut, which is worth knowing from the test suite rather than
    // from a release attempt.
    const unfilled = journal
      .split('\n')
      .filter(l => l === '**Lesson:** _(unfilled)_');
    expect(unfilled).toEqual([]);
  });

  it('every entry carries a Lesson line', () => {
    const entries = journal.split('\n').filter(l => /^## /.test(l)).length;
    const lessons = journal.split('\n').filter(l => /^\*\*Lesson:\*\*/.test(l)).length;
    expect(entries).toBeGreaterThan(0);
    expect(lessons).toBe(entries);
  });
});

describe('what counts as changing the cycle', () => {
  const paths = script.match(/CYCLE_PATHS="([^"]*)"/)?.[1].split(/\s+/) ?? [];

  it.each([
    'scripts/release.sh',
    'scripts/verify-release.sh',
    'scripts/build-catalyst.sh',
    'scripts/sync-version.js',
    'scripts/xcode-cloud.py',
    '.github/workflows',
    'docs/DISTRIBUTION.md',
  ])('%s is machinery', p => {
    expect(paths).toContain(p);
  });

  it('release notes are not machinery', () => {
    // They change every single release by definition. Flagging them would
    // mark every release as cycle-changing, and a signal that is always
    // on is not a signal.
    expect(paths).not.toContain('fastlane');
  });
});

describe('the retrospective cannot break the release it reflects on', () => {
  it('writes the journal before the release commit, not after the push', () => {
    // A second push to main starts a second Xcode Cloud run, and a newer
    // run cancels the one before it — which is how 2.13.0's iOS build was
    // lost. So the entry rides in the release commit.
    const journalWrite = script.indexOf('>>"$JOURNAL"');
    const add = script.indexOf('git add "$GRADLE_FILE"');
    const push = script.indexOf('git push -q origin main');
    expect(journalWrite).toBeGreaterThan(-1);
    expect(journalWrite).toBeLessThan(add);
    expect(add).toBeLessThan(push);
    expect(script).toContain('$JOURNAL');
  });

  it('records aborts as evidence, outside the repo', () => {
    // Where the cycle actually stops people is the only thing worth
    // improving it from, and nobody remembers the third failed attempt
    // from two weeks ago.
    expect(script).toContain('.release-attempts.log');
    expect(ignore).toContain('.release-attempts.log');
  });
});
