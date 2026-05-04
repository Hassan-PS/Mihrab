/**
 * RTL audit regression — task #14.
 *
 * Locks in the rule "no Left/Right directional CSS in src/" so future code
 * additions don't silently break Arabic/Urdu layout. The lone exceptions are:
 *
 *   • `// rtl-safe` comments — explicit suppressions for geometric tricks
 *     (the 0×0-with-transparent-borders triangle hack used for the Qibla
 *     compass arrowhead) and geographic positions (East/West cardinal
 *     labels on the compass dial, which mark physical directions and must
 *     not flip with text direction).
 *
 *   • `left: 0, right: 0` / `top: 0, bottom: 0` symmetric "stretch fully"
 *     patterns — these are direction-agnostic.
 *
 * If this test fails, someone has added a `paddingLeft`, `marginRight`,
 * `borderLeftColor`, etc. without an `// rtl-safe` justification. Either:
 *   1. Convert it to the Start/End equivalent (`paddingStart`, `marginEnd`,
 *      `borderTopStartRadius`, `borderEndWidth`, ...).
 *   2. If the value is genuinely direction-independent (geometric or
 *      geographic), add an `// rtl-safe: <reason>` comment on the same line
 *      or the line above.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');

const RTL_BREAKING = [
  'paddingLeft',
  'paddingRight',
  'marginLeft',
  'marginRight',
  'borderLeftWidth',
  'borderRightWidth',
  'borderLeftColor',
  'borderRightColor',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
];

function walk(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

describe('RTL audit', () => {
  test('no directional CSS without an rtl-safe suppression', () => {
    const re = new RegExp(`\\b(${RTL_BREAKING.join('|')})\\b`);
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!re.test(line)) continue;
        // Skip line and block comments (// or JSDoc * prefix).
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (/rtl-safe/i.test(line)) continue;
        let j = i - 1;
        while (j >= 0 && lines[j].trim() === '') j -= 1;
        if (j >= 0 && /^\s*\/\/.*rtl-safe/i.test(lines[j])) continue;
        violations.push(
          `${path.relative(path.join(__dirname, '..'), file)}:${i + 1} — ${line.trim()}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
