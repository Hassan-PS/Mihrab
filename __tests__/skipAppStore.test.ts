/**
 * A release that deliberately does not touch App Store Connect.
 *
 * Apple has holds that are nothing to do with this repo: a submission
 * window, a review already in flight, an account that may not take a new
 * build until a given day. The release still wants cutting — Play,
 * F-Droid, GitHub and the Homebrew tap have no such hold — and until
 * SKIP_APP_STORE existed the only ways to do that were to comment out a
 * step in the middle of a release script or to let the run fail and read
 * the retry line off the end. Both are how a release gets cut wrong.
 *
 * What this pins is the part that would be dangerous to get wrong: that
 * skipping means NOTHING IS SENT, that the workflow is left paused, and
 * that the summary says iOS did not build rather than implying it did.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const script = readFileSync(path.join(ROOT, 'scripts', 'release.sh'), 'utf8');

/** The App Store step, from its heading to the verify phase after it. */
const step = script.slice(
  script.indexOf('step "App Store build"'),
  script.indexOf('step "Verifying"'),
);

describe('the skip', () => {
  it('is a flag, not an edit', () => {
    expect(step).toContain('if [ "${SKIP_APP_STORE:-0}" = "1" ]; then');
  });

  it('sends nothing at all', () => {
    // `resume` is what un-pauses the workflow and `start` is what posts a
    // run; both must sit on the far side of the branch. A skip that still
    // resumed would leave the workflow armed, and the next push to main
    // would build and post a public commit status — the exact fault the
    // pause exists to prevent.
    // Sliced from the flag FORWARDS. `indexOf('else')` from the start of
    // the step lands inside the comment above it, which made this slice
    // empty and the assertions below vacuously true — caught by breaking
    // the script on purpose and watching this test pass anyway.
    const from = step.indexOf('SKIP_APP_STORE:-0');
    const skipped = step.slice(from, step.indexOf('\nelse\n', from));
    expect(skipped).toContain('XC_STARTED=skipped');
    expect(skipped).not.toContain('$XC resume');
    expect(skipped).not.toContain('$XC start');
    expect(skipped).not.toContain('XC_ARMED=1');
  });

  it('says which of the three states it is in', () => {
    // Built, refused by Apple, or skipped on purpose. The first two read
    // identically to a tired person unless the third has a name.
    expect(step).toContain('XC_STARTED=skipped');
    expect(script).toContain('if [ "${XC_STARTED:-0}" = "skipped" ]; then');
    expect(script).toContain('elif [ "${XC_STARTED:-0}" = "1" ]; then');
  });

  it('tells the reader to build the TAG, not main', () => {
    // The whole reason iOS builds from the release cut: by the time a
    // hold lifts, main has moved, and a run started then would ship the
    // newer commit under this version's number.
    const note = script.slice(script.indexOf('= "skipped" ]; then')).slice(0, 600);
    expect(note).toMatch(/git checkout \$TAG/);
    expect(note).toMatch(/xcode-cloud\.py resume/);
    expect(note).toMatch(/xcode-cloud\.py pause/);
  });
});

describe('the ordinary path is untouched', () => {
  it('still starts a run when the flag is not set', () => {
    expect(step).toContain('$XC resume');
    expect(step).toContain('XC_START="$($XC start 2>&1)"');
  });

  it('still pauses the workflow afterwards', () => {
    // Every run posts a PUBLIC commit status, so the workflow is paused
    // between releases. The pause has to happen on the path that armed
    // it, and only there.
    expect(step).toContain('xc_pause');
  });

  it('is still a warning rather than a failure', () => {
    // Everything above this step is already public by the time it runs.
    expect(step).toContain('warn "Xcode Cloud would not start a run');
    expect(step).not.toContain('die "Xcode Cloud');
  });
});
