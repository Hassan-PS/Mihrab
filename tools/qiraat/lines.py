"""
The printed line structure of a muṣḥaf, out of its ayah polygons.

  python3 tools/qiraat/lines.py <quran-svg/mushafs/warsh/kfqc/json> <out.json>

── WHAT THIS IS FOR ──────────────────────────────────────────────────

The Unicode renderer reflows: it fits a font size to the box and lets the
text wrap where it will. That gives a page of the right ayahs and the
wrong shape — thirteen lines where the print has fifteen, and the breaks
falling nowhere near the printed ones.

The text for a second riwayah carries no line assignment; nobody publishes
one. But `quranpedia/quran-svg` publishes a per-ayah POLYGON for every
page, CC0, and a polygon is a set of horizontal bands: which lines an ayah
occupies, and how much of each. That is enough to lay a page out as the
print does at the granularity of an ayah, which is the granularity the
reader actually sees.

── HOW THE GRID IS RECOVERED ─────────────────────────────────────────

The band edges are drawn to the ink, not to a grid, so consecutive lines
measure 30, 35 or 40 units apart with no constant to read off. What IS
constant is the page: the text block runs from the top of the first line
to the bottom of the last, and a Madinah page has fifteen of them. So the
grid is the page's own extent divided by its line count, and every band is
snapped to it. An ayah running across whole lines contributes one tall
rectangle with no interior edges, which snaps to the right span anyway.

The output is geometry, not scripture: line counts and widths. It carries
no Qur'anic text and is CC0 where the polygons are.
"""
import json
import os
import re
import statistics
import sys

RECT = re.compile(
    r'M\s+(\S+)\s+(\S+)\s+L\s+(\S+)\s+(\S+)\s+L\s+(\S+)\s+(\S+)\s+L\s+(\S+)\s+(\S+)\s+Z'
)

# ── The page block, which is the same on every page ──────────────────
#
# Taken globally rather than from each page's own ayahs, and that is the
# whole trick. A page that opens a surah has a band across its first rows
# and NO ayah polygon there, so its ayah extent is two lines short: using
# it gave those pages thirteen lines and quietly dropped the band's rows.
# Against a fixed block the band's rows come out as empty lines, which is
# exactly what they are, and every page has fifteen.
#
# Medians across all 602 pages that carry geometry; the spread is the
# jitter of the ink, not disagreement about the block.
BLOCK_TOP = 1.75
BLOCK_BOTTOM = 540.14
LINES_PER_PAGE = 15


def rectangles(polygon):
    out = []
    for m in RECT.finditer(polygon):
        xs = [float(m.group(i)) for i in (1, 3, 5, 7)]
        ys = [float(m.group(i)) for i in (2, 4, 6, 8)]
        out.append((min(xs), max(xs), min(ys), max(ys)))
    return out


def page_lines(entries):
    """[(surah, ayah, share)] per line, right to left, or None."""
    boxes = []
    for i, a in enumerate(entries):
        for r in rectangles(a['polygon']):
            boxes.append((i, *r))
    if not boxes:
        return None

    top = BLOCK_TOP
    count = LINES_PER_PAGE
    pitch = (BLOCK_BOTTOM - BLOCK_TOP) / count

    # The measure, on the other hand, IS the page's own: a framed page is
    # inset, and its lines are genuinely shorter.
    left = min(b[1] for b in boxes)
    right = max(b[2] for b in boxes)
    if right - left <= 0:
        return None

    lines = [[] for _ in range(count)]
    for idx, x0, x1, y0, y1 in boxes:
        first = max(0, min(count - 1, round((y0 - top) / pitch)))
        last = max(first, min(count - 1, round((y1 - top) / pitch) - 1))
        for line in range(first, last + 1):
            # An ayah crossing a whole line occupies all of it; only the
            # line it starts on and the one it ends on are partial, and the
            # rectangle's own x range is what says how much.
            whole = line != first and line != last
            a, b = (left, right) if whole else (x0, x1)
            lines[line].append((idx, a, b))

    out = []
    for line in lines:
        # Right to left: x = right is where an Arabic line begins.
        line.sort(key=lambda s: -s[2])
        merged = []
        for idx, a, b in line:
            if merged and merged[-1][0] == idx:
                merged[-1][1] = min(merged[-1][1], a)
                merged[-1][2] = max(merged[-1][2], b)
            else:
                merged.append([idx, a, b])
        out.append([
            (entries[idx]['surahNumber'], entries[idx]['ayahNumber'],
             round((b - a) / (right - left), 4))
            for idx, a, b in merged
        ])
    return out


def main(src, dest):
    pages = {}
    widths = []
    for name in sorted(os.listdir(src)):
        m = re.match(r'^(\d+)\.json$', name)
        if not m:
            continue
        with open(os.path.join(src, name), encoding='utf-8') as f:
            entries = json.load(f)
        lines = page_lines(entries)
        if lines is None:
            continue
        pages[int(m.group(1))] = lines
        widths.append(len(lines))

    print(f'  {len(pages)} pages')
    counts = {}
    for w in widths:
        counts[w] = counts.get(w, 0) + 1
    print(f'  lines per page: {dict(sorted(counts.items()))}')
    print(f'  median {statistics.median(widths)}')

    empty = [p for p, l in pages.items() if any(len(x) == 0 for x in l)]
    print(f'  pages with an empty line: {len(empty)} {empty[:8]}')
    off = []
    for p, l in pages.items():
        for i, line in enumerate(l):
            total = sum(s for _, _, s in line)
            if line and not 0.9 <= total <= 1.1:
                off.append((p, i + 1, round(total, 3)))
    print(f'  lines whose parts do not fill the width: {len(off)} {off[:6]}')

    with open(dest, 'w', encoding='utf-8') as f:
        json.dump({'lines': {str(k): v for k, v in sorted(pages.items())}}, f,
                  ensure_ascii=False, separators=(',', ':'))
    print(f'  wrote {dest} ({os.path.getsize(dest) / 1024:.0f} KB)')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
