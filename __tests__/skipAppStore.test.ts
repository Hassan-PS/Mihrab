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

  it('pauses the workflow BEFORE the push, because the push starts the run', () => {
    // The flag was written when the workflow was paused between releases,
    // where skipping meant simply not arming it. Since 2026-09-11 it is
    // left enabled, so a skip acted on at the App Store step — which comes
    // after Publishing — would skip this script's own upload while Xcode
    // Cloud built the pushed commit and uploaded it anyway. Someone holding
    // a build back would find out when it turned up in App Store Connect.
    const beforePush = script.slice(0, script.indexOf('git push -q origin main'));
    const guard = beforePush.lastIndexOf('if [ "${SKIP_APP_STORE:-0}" = "1" ]; then');
    expect(guard).toBeGreaterThan(-1);
    expect(beforePush.slice(guard)).toContain('$XC pause');
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
  it('still gets a run for the release commit when the flag is not set', () => {
    // The workflow is enabled now, so the release's own push starts the
    // run and `ensure` confirms it — starting one blindly next to it
    // kills both. See releaseIosGate.test.ts for that contract.
    expect(step).toContain('$XC ensure "$RELEASE_SHA"');
  });

  it('falls back to building on this Mac when the cloud has no run', () => {
    // Added after 2026-09-11, when POST /v1/ciBuildRuns answered HTTP 500
    // for an hour: before this, "Apple is down" meant the iOS channel of
    // a release simply did not happen.
    expect(step).toContain('ios_local_build');
    expect(step).toContain('NO_IOS_LOCAL');
    expect(script).toContain('scripts/build-ios-appstore.sh');
  });

  it('is still a warning rather than a failure', () => {
    // Everything above this step is already public by the time it runs.
    expect(step).toContain('warn "Xcode Cloud has no run for this release"');
    expect(step).not.toContain('die "Xcode Cloud');
  });
});
