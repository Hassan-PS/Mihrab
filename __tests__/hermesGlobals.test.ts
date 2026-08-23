/**
 * Globals Hermes does not have, and jest does.
 *
 * `new TextDecoder()` shipped in the sync code, passed every test, and threw
 * "Property 'TextDecoder' doesn't exist" the first time a real device opened
 * an envelope. That is the shape of bug this file exists to stop: node has
 * these, Hermes does not, so a unit test is not evidence and only reading
 * the source is.
 *
 * If you need one of these, write it out — `secureRandom.ts` has base64 and
 * UTF-8 done by hand, with the reasoning at the top.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');

/** Each with the reason it is not available, so the failure explains itself. */
const ABSENT: Array<{ pattern: RegExp; name: string; instead: string }> = [
  {
    name: 'TextDecoder',
    pattern: /\bnew\s+TextDecoder\b|\bTextDecoder\s*\(/,
    instead: 'utf8Decode from src/sync/secureRandom.ts',
  },
  {
    name: 'TextEncoder',
    pattern: /\bnew\s+TextEncoder\b|\bTextEncoder\s*\(/,
    instead: 'utf8Encode from src/sync/secureRandom.ts',
  },
  {
    name: 'atob',
    pattern: /(^|[^.\w])atob\s*\(/,
    instead: 'fromBase64 from src/sync/secureRandom.ts',
  },
  {
    name: 'btoa',
    pattern: /(^|[^.\w])btoa\s*\(/,
    instead: 'toBase64 from src/sync/secureRandom.ts',
  },
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Comments are where these get *explained*, so they must not count. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('the app runs on Hermes, not on node', () => {
  const files = sourceFiles(SRC);

  it('is looking at the source it thinks it is', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(ABSENT)('does not use $name', ({ pattern, instead }) => {
    const used: string[] = [];
    for (const file of files) {
      const code = withoutComments(fs.readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (pattern.test(line)) {
          used.push(`${path.relative(SRC, file)}:${i + 1} — ${line.trim()}`);
        }
      });
    }
    // If this fails: the global exists in jest and not on a device, so the
    // test suite cannot see the bug. Use ${instead}.
    expect({ used, instead }).toEqual({ used: [], instead });
  });
});
