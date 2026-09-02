"""The publisher's own ink, per printed row, read out of the page path.

  python3 tools/qiraat/ink.py <page.svg> <top> <pitch>

A page's glyphs are one path inside `matrix(1.3333 0 0 -1.3333 -115 640)`.
Walking its coordinates gives every on-curve point in page space, which
is ground truth for where each of the fifteen rows starts and stops — the
one thing the ayah rectangles get wrong, and therefore the one thing that
can settle whether a line table is right.

No rendering: 602 pages in about twenty seconds.
"""
import re
import sys

NUM = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
ARGS = {'m': 2, 'l': 2, 'h': 1, 'v': 1, 'c': 6, 's': 4, 'q': 4, 't': 2,
        'a': 7, 'z': 0}

VIEWBOX = re.compile(
    r'viewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"')
GROUP = re.compile(
    r'<g transform="translate\(([-\d.]+)[ ,]+([-\d.]+)\)"[^>]*>\s*'
    r'<path d="([^"]*)"'
)
MATRIX = re.compile(r'matrix\(([-\d.]+) 0 0 ([-\d.]+) ([-\d.]+) ([-\d.]+)\)')

# ── ONLY THE BODY OF THE LINE ────────────────────────────────────────
#
# A row's band catches more than the row: an alif or a shaddah from the
# line below reaches up into it, and a descender from this one drops out
# of it. Taking the extent from every point in the band therefore reads a
# stray mark from a neighbouring line as this line's text — which is how
# Shuʿbah page 328 row 11 came out running to the margin when it in fact
# stops at its ayah marker, twenty units short. So the extent is taken
# from the middle of the band only: the body of the line, where its own
# words are and nothing else's.
CORE = 0.30


def points(d):
    """Every on-curve point the path visits, in its own coordinates."""
    out = []
    x = y = sx = sy = 0.0
    i = 0
    cmd = None
    n = len(d)
    while i < n:
        ch = d[i]
        if ch.isspace() or ch == ',':
            i += 1
            continue
        if ch.isalpha():
            cmd = ch
            i += 1
            if cmd in 'zZ':
                x, y = sx, sy
                out.append((x, y))
            continue
        if cmd is None:
            i += 1
            continue
        want = ARGS[cmd.lower()]
        vals = []
        while len(vals) < want:
            m = NUM.match(d, i)
            if not m:
                break
            vals.append(float(m.group()))
            i = m.end()
            while i < n and (d[i].isspace() or d[i] == ','):
                i += 1
        if len(vals) < want:
            break
        rel = cmd.islower()
        k = cmd.lower()
        if k == 'm':
            x, y = (x + vals[0], y + vals[1]) if rel else (vals[0], vals[1])
            sx, sy = x, y
            cmd = 'l' if rel else 'L'
        elif k == 'l':
            x, y = (x + vals[0], y + vals[1]) if rel else (vals[0], vals[1])
        elif k == 'h':
            x = x + vals[0] if rel else vals[0]
        elif k == 'v':
            y = y + vals[0] if rel else vals[0]
        elif k == 'c':
            x, y = (x + vals[4], y + vals[5]) if rel else (vals[4], vals[5])
        elif k in ('s', 'q'):
            x, y = (x + vals[2], y + vals[3]) if rel else (vals[2], vals[3])
        elif k == 't':
            x, y = (x + vals[0], y + vals[1]) if rel else (vals[0], vals[1])
        elif k == 'a':
            x, y = (x + vals[5], y + vals[6]) if rel else (vals[5], vals[6])
        out.append((x, y))
    return out


def page_ink(path):
    """Every on-curve point of the page's text, in page coordinates.

    Points off the sheet are dropped: a few of these paths carry a stray
    coordinate outside the viewBox — Warsh page 300 has one at x = -76 —
    and one of them is enough to report a line as running eighty units
    past the margin.
    """
    with open(path, encoding='utf-8') as f:
        s = f.read()
    mm = MATRIX.search(s)
    a, d, e, f_ = (float(g) for g in mm.groups())
    vb = VIEWBOX.search(s)
    # Not every edition's sheet starts at the origin: Qālūn's viewBox is
    # "-6 0 345 550", and clipping that page to x >= 0 threw away the
    # first six units of every line — which read as 442 rows ending in
    # the wrong place, none of them the table's fault.
    x0, y0, w, h = ((float(vb.group(i)) for i in (1, 2, 3, 4)) if vb
                    else (0.0, 0.0, 345.0, 550.0))
    i = s.find('<g id="content">')
    if i < 0:
        return []
    out = []
    for g in GROUP.finditer(s, i):
        tx, ty = float(g.group(1)), float(g.group(2))
        for px, py in points(g.group(3)):
            x, y = a * (px + tx) + e, d * (py + ty) + f_
            if x0 <= x <= x0 + w and y0 <= y <= y0 + h:
                out.append((x, y))
    return out


def rows(path, top, pitch, count=15):
    """(leftmost, rightmost) ink on each row, or None where there is none."""
    band = [None] * count
    for x, y in page_ink(path):
        pos = (y - top) / pitch
        r = int(pos)
        if not 0 <= r < count:
            continue
        frac = pos - r
        if frac < CORE or frac > 1 - CORE:
            continue
        lo, hi = band[r] or (x, x)
        band[r] = (min(lo, x), max(hi, x))
    return band


if __name__ == '__main__':
    for n, b in enumerate(rows(sys.argv[1], float(sys.argv[2]),
                               float(sys.argv[3]))):
        print(n, None if b is None else (round(b[0], 1), round(b[1], 1)))
