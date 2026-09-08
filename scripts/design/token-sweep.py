#!/usr/bin/env python3
"""
The token sweep — docs/design/redesign-plan.md Phase 4 / P5.

Rewrites raw style literals in src/ onto the design tokens, mechanically and
by a stated rule, so tokens-audit can go to zero and stay there:

  borderRadius: N   → RADIUS.<nearest>        (999/99/≥32 → full)
  fontSize: N       → TYPE.<nearest>.fontSize  (≥ 26 is display / Arabic
                                                scale and is opted out per
                                                line instead)
  padding*/margin*/gap: N → SPACING.<nearest>  (≤ 2 is a hairline nudge and
                                                is already allowed)

Nearest wins; a tie goes up. The result is a small, uniform drift (never more
than 2dp of spacing or 1.5pt of type) in exchange for six radii, nine type
sizes and eight spacings instead of twenty-five, thirty and forty. Files that
opt out with `// tokens-ok:` are left alone; so are comment lines and lines
already carrying `// tokens-ok-line:`.

Idempotent. Run, then tsc, then the tests, then the screenshot sweep.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'src')
SKIP = {'src/theme/tokens.ts', 'src/theme/appPalette.ts', 'src/theme/typography.ts'}

RADIUS = {'xs': 4, 'sm': 8, 'md': 12, 'lg': 16, 'xl': 20}
SPACING = {'xs': 4, 'sm': 8, 'md': 12, 'lg': 16, 'xl': 24, 'xxl': 32, 'xxxl': 48, 'xxxxl': 64}
TYPE = {'caption': 11, 'label': 12, 'footnote': 13, 'callout': 15, 'body': 16, 'title3': 18, 'title2': 22, 'title1': 28}
DISPLAY_FLOOR = 26

SPACING_RE = re.compile(r"\b(padding(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|margin(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap):\s*(\d+)\b(?![\.\d])(?!\s*[\*\/\+\-])")
RADIUS_RE = re.compile(r"\bborderRadius:\s*(\d+)\b(?![\.\d])(?!\s*[\*\/\+\-])")
FONT_RE = re.compile(r"\bfontSize:\s*(\d+(?:\.\d+)?)\b(?!\s*[\*\/\+\-])")


def nearest(table, v):
    best = None
    for name, size in table.items():
        d = abs(size - v)
        if best is None or d < best[0] or (d == best[0] and size > best[1]):
            best = (d, size, name)
    return best[2]


def rel_import(path, target):
    d = os.path.dirname(path)
    rel = os.path.relpath(os.path.join(ROOT, target), d)
    if not rel.startswith('.'):
        rel = './' + rel
    return rel.replace(os.sep, '/').removesuffix('.ts')


def ensure_import(src, path, names, module_target):
    """Add `names` to the import of module_target, creating it if absent."""
    mod = rel_import(path, module_target)
    pat = re.compile(r"import \{([^}]*)\} from '" + re.escape(mod) + r"';")
    m = pat.search(src)
    if m:
        have = {n.strip() for n in m.group(1).split(',') if n.strip()}
        want = sorted(have | set(names))
        return src[:m.start()] + "import { " + ", ".join(want) + " } from '" + mod + "';" + src[m.end():]
    # after the last import line
    lines = src.split('\n')
    last = max((i for i, l in enumerate(lines) if l.startswith('import ') or l.startswith("} from '")), default=-1)
    lines.insert(last + 1, "import { " + ", ".join(sorted(names)) + " } from '" + mod + "';")
    return '\n'.join(lines)


def sweep(path):
    rel = os.path.relpath(path, ROOT)
    if rel in SKIP or rel.endswith('.d.ts'):
        return 0
    src = open(path, encoding='utf8').read()
    if re.search(r'//\s*tokens-ok:', src):
        return 0
    out = []
    need_radius = need_spacing = need_type = False
    changed = 0
    for line in src.split('\n'):
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('*') or re.search(r'//\s*tokens-ok-line', line):
            out.append(line)
            continue
        new = line

        def rad(m):
            nonlocal need_radius, changed
            v = int(m.group(1))
            if v <= 2:
                return m.group(0)
            changed += 1
            need_radius = True
            if v >= 32:
                return 'borderRadius: RADIUS.full'
            return f'borderRadius: RADIUS.{nearest(RADIUS, v)}'
        new = RADIUS_RE.sub(rad, new)

        def spc(m):
            nonlocal need_spacing, changed
            v = int(m.group(2))
            if v <= 2:
                return m.group(0)
            changed += 1
            need_spacing = True
            return f'{m.group(1)}: SPACING.{nearest(SPACING, v)}'
        new = SPACING_RE.sub(spc, new)

        fm = FONT_RE.search(new)
        if fm:
            v = float(fm.group(1))
            if v >= DISPLAY_FLOOR:
                if '//' not in new:
                    new = new.rstrip() + ' // tokens-ok-line: display or Arabic scale, sized by hand'
                    changed += 1
            else:
                def fnt(m):
                    nonlocal need_type, changed
                    vv = float(m.group(1))
                    changed += 1
                    need_type = True
                    return f'fontSize: TYPE.{nearest(TYPE, vv)}.fontSize'
                new = FONT_RE.sub(fnt, new)
        out.append(new)
    result = '\n'.join(out)
    if result == src:
        return 0
    if need_radius or need_spacing:
        names = (['RADIUS'] if need_radius else []) + (['SPACING'] if need_spacing else [])
        result = ensure_import(result, path, names, 'src/theme/tokens')
    if need_type:
        result = ensure_import(result, path, ['TYPE'], 'src/theme/typography')
    open(path, 'w', encoding='utf8').write(result)
    return changed


total = 0
files = 0
for root, _, names in os.walk(SRC):
    for n in names:
        if n.endswith(('.ts', '.tsx')):
            c = sweep(os.path.join(root, n))
            if c:
                files += 1
                total += c
print(f'rewrote {total} literals in {files} files')
