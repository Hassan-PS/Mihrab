/**
 * The macOS half of release verification, pinned.
 *
 * `build-catalyst.sh` proves the widget will have data by deleting the App
 * Group payload, launching the app, and requiring it back with today's
 * date. On 2026-09-13 that gate failed the 2.19.0 release on an app that
 * was fine: it launches hidden (`open -g -j`), and a hidden scene never
 * becomes foreground-active, so the screen that writes the payload never
 * runs its data effect. On a Mac somebody is using, it resolves anyway. On
 * one whose display has gone to sleep, it does not.
 *
 * Measured that day on the SHIPPED 2.18.5 from /Applications, so the build
 * could not be blamed: hidden, nothing after ninety seconds; visible,
 * today's payload in under ten.
 *
 * So the shape below is the fix, and the reason it is a test rather than a
 * comment: the hidden launch stays the default, because a build should not
 * throw a window onto whatever you are doing — but it can no longer be the
 * only evidence a release is rejected on.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const sh = readFileSync(path.join(ROOT, 'scripts', 'build-catalyst.sh'), 'utf8');

/** The payload gate, from its helper to the failure it guards. */
const gate = (() => {
  const from = sh.indexOf('payload_landed()');
  const to = sh.indexOf('has no payload for today');
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return sh.slice(from, to);
})();

describe('the polite launch stays the default', () => {
  it('launches hidden first', () => {
    // Once per build, on a machine someone is working at. Visible-always
    // would fix the bug and make every build rude, which is a trade the
    // 2.19.0 failure does not justify on its own.
    expect(sh).toContain('open -g -j "$APP"');
  });
});

describe('a build is not failed on the hidden launch alone', () => {
  it('retries visibly before giving up', () => {
    // A plain `open "$APP"` — no -g, no -j — inside the branch that the
    // empty first minute leads to.
    expect(gate).toMatch(/\n\s*open "\$APP"/);
  });

  it('the visible retry comes before the failure it would prevent', () => {
    const visible = sh.search(/\n\s*open "\$APP"/);
    const fails = sh.indexOf('has no payload for today');
    expect(visible).toBeGreaterThan(-1);
    expect(visible).toBeLessThan(fails);
  });

  it('says which of the two launches was empty when it does fail', () => {
    // "no payload" was the message that sent a whole afternoon after the
    // app group entitlement. The answer it should have given is that the
    // app was never allowed to run properly.
    expect(sh).toContain('has no payload for today, hidden or visible');
  });

  it('looks again after the visible launch rather than assuming', () => {
    // Two waits, not one: the first decides whether a window is warranted,
    // the second decides the build.
    const looks = gate.match(/payload_landed \d+/g) ?? [];
    expect(looks.length).toBeGreaterThanOrEqual(2);
  });

  it('picks the relaunched PID back up', () => {
    // Or the window this gate opened outlives the build — the same class
    // of orphan as the extension that outlived its own bundle.
    const after = gate.slice(gate.search(/\n\s*open "\$APP"/));
    expect(after).toMatch(/LAUNCH_PID=\$\(pgrep/);
  });
});

describe('the payload is waited for, not glanced at', () => {
  it('polls in a loop', () => {
    expect(gate).toMatch(/for _ in \$\(seq 1 "\$1"\)/);
    expect(gate).toContain('sleep 5');
  });
});

describe('the App Group is read by path', () => {
  it('never as a bare domain', () => {
    // A bare domain does not fail — it quietly creates and reads a shadow
    // plist in ~/Library/Preferences, which answers every question about a
    // container the app never wrote to.
    expect(sh).toMatch(
      /GROUP_DOMAIN="\$HOME\/Library\/Group Containers\/\$GROUP_NAME\//,
    );
    const reads = sh.match(/defaults (read|delete) [^\n]*/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r).toContain('"$GROUP_DOMAIN"');
  });
});
