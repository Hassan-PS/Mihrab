"""Every row of a line table, against the ink the publisher actually set.

  python3 tools/qiraat/verify.py <table.json> <svg dir> <json dir> <label>

The table says where each row's text stops. The page path says where it
really stops. Anywhere those disagree by more than a glyph's tail, the
table is wrong — and unlike counting characters against a row's width,
this cannot be fooled by a page of short surahs, where a line holds four
ayahs and three markers and no density model means anything.

This is what the medallion rewrite was checked against. It stands at 12
bad row-ends out of 8,792 on Shuʿbah and 12 out of 8,807 on Warsh, and
every one of the survivors has been read: a page whose left margin the
rectangles put eleven units out, and a handful of markers at the end of
a line where the export's box and the ink do not agree about whether a
word follows.

The second count is not a fault at all. A row that does not start at the
right margin is a line the print CENTRES — the closing line of a surah,
and the tapered last lines of the muṣḥaf. There are seventeen in Shuʿbah
and fifteen in Warsh, and the renderer centres a short line by itself.
"""
import json
import os
import re
import sys

import grid as G
import ink as INK
import lines as L

# A glyph's tail overshoots a marker by two or three units, and the ink
# stops short of the block by a side bearing which is measured below.
TOL = 10.0
INSET = 25.0


def unpack(rows):
    out, surah = [], 0
    for row in rows:
        line = []
        for span in row:
            if len(span) == 3:
                surah, a, p = span[0], span[1], span[2]
            else:
                a, p = span[0], span[1]
            line.append((surah, a, p / 100.0))
        out.append(line)
    return out


def main(table_path, svg_dir, json_dir, label):
    with open(table_path, encoding='utf-8') as f:
        doc = json.load(f)
    packed = doc['lines'] if 'lines' in doc else doc
    table = {int(p): unpack(r) for p, r in packed.items()}

    raw = L.load(json_dir)
    top, bottom, marker = L.measure_block(raw.values())
    pitch = (bottom - top) / L.LINES_PER_PAGE
    half = marker / 2

    def page_grid(entries):
        rs = [r for a in entries for r in L.rectangles(a['polygon'])]
        return G.fit(sorted({round(v, 2) for r in rs for v in (r[2], r[3])}),
                     [a['y'] for a in entries if a.get('y') is not None],
                     top, pitch)

    def pages():
        for page in sorted(table):
            svg = os.path.join(svg_dir, '%03d.svg' % page)
            entries = raw.get(page) or []
            boxes = [r for a in entries for r in L.rectangles(a['polygon'])]
            if os.path.exists(svg) and boxes:
                yield page, entries, boxes, svg

    # ── THE INK SITS INSIDE THE BLOCK ────────────────────────────────
    #
    # A rectangle is drawn to the text block; the glyphs stop short of it
    # by a side bearing, and by a different one on each side. Both are
    # constant for an edition, so they are measured before anything is
    # called wrong.
    samples = []
    for page, entries, boxes, svg in pages():
        edge = (min(b[0] for b in boxes), max(b[1] for b in boxes))
        gt, gp = page_grid(entries)
        for i, b in enumerate(INK.rows(svg, gt, gp)):
            if b and i < len(table[page]) and table[page][i]:
                samples.append((b[0] - edge[0], edge[1] - b[1]))
        if len(samples) > 900:
            break
    bear_l = sorted(s[0] for s in samples)[len(samples) // 2]
    bear_r = sorted(s[1] for s in samples)[len(samples) // 2]
    print('  side bearings: left %.1f  right %.1f (from %d rows)'
          % (bear_l, bear_r, len(samples)))

    bad, centred, checked = [], [], 0
    for page, entries, boxes, svg in pages():
        left = min(b[0] for b in boxes)
        right = max(b[1] for b in boxes)
        by_key = {(a['surahNumber'], a['ayahNumber']): a for a in entries}
        gt, gp = page_grid(entries)
        band = INK.rows(svg, gt, gp)
        for i, row in enumerate(table[page]):
            got = band[i]
            if not row or got is None:
                continue
            checked += 1
            closer = by_key.get((row[-1][0], row[-1][1]))
            ends_here = (closer is not None and closer.get('y') is not None
                         and int(round((closer['y'] - gt) / gp - 0.5)) == i)
            want = ((closer['x'] + half) if ends_here and closer.get('x')
                    is not None else left + bear_l)
            if abs(got[0] - want) > TOL:
                bad.append((round(got[0] - want, 1), page, i,
                            'ink stops short' if got[0] > want
                            else 'ink runs past'))
            if right - bear_r - got[1] > INSET:
                centred.append((round(right - bear_r - got[1], 1), page, i))

    print('=== %s: %d rows checked against the ink' % (label, checked))
    print('  row ends wrong by more than %.0f units: %d' % (TOL, len(bad)))
    for d, p, i, why in sorted(bad, key=lambda r: -abs(r[0]))[:12]:
        print('     page %d row %d  %+.1f  (%s)' % (p, i, d, why))
    print('  rows the print centres: %d' % len(centred))
    for d, p, i in sorted(centred, reverse=True)[:8]:
        print('     page %d row %d  inset %.1f' % (p, i, d))


if __name__ == '__main__':
    main(*sys.argv[1:5])
