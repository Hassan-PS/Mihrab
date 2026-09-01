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
# The ayah medallion, in the same units — measured as twice the distance
# from the marker's own centre to the left end of the row it closes, over
# 500 ayahs. It is remarkably constant.
#
# It has to come OUT of the share, and that is the whole reason this file
# was wrong: the polygon for an ayah's last row covers its words AND its
# medallion, so handing the whole share to the words gave every line one
# word too few and pushed the rest onto the next. The medallion is drawn
# by the renderer, not set as text, so what the table records is the room
# the WORDS take.
MARKER_UNITS = 20.17

BLOCK_TOP = 1.75
BLOCK_BOTTOM = 540.14
LINES_PER_PAGE = 15


def measure_block(pages):
    """The text block and the medallion, read off THIS edition.

    ── WHY THESE ARE NO LONGER CONSTANTS ─────────────────────────────

    They were, and they were the Warsh edition's. Running the same
    numbers over Qālūn and Shuʿbah is what would have gone wrong
    silently: the three editions share a coordinate system almost
    exactly — left 0, right 345, the medallion within a hair — but
    Shuʿbah's block runs to y=547.6 where Warsh's stops at 540.7, seven
    units lower. Snapping Shuʿbah's bands to Warsh's grid puts a pitch
    of 35.5 against a real pitch of 36.0, which is under half a line at
    the top of the page and most of a line by the bottom: the last rows
    of every page would take their ayahs from the row above.

    Nothing about that would have raised an error. The page would have
    had its fifteen rows and its full-width lines, and it would simply
    have been the wrong ayahs on them — the failure the whole table
    exists to prevent, arriving quietly.

    So the block is measured. `top` and `bottom` are the extremes the
    ink actually reaches, taken as a low and high percentile rather than
    the min and max so one stray rectangle on one page cannot set the
    grid for the book.
    """
    tops = []
    bottoms = []
    markers = []
    for entries in pages:
        boxes = [r for a in entries for r in rectangles(a['polygon'])]
        if not boxes:
            continue
        tops.append(min(b[2] for b in boxes))
        bottoms.append(max(b[3] for b in boxes))
        for a in entries:
            rs = rectangles(a['polygon'])
            if not rs:
                continue
            # The medallion sits at the END of the ayah's last row, and
            # `x` is its centre — so twice the gap from that centre to
            # the row's left edge is the room it takes. Only rows with a
            # single rectangle are used: on a row shared with the next
            # ayah the left edge is not the medallion's.
            bottom = max(r[3] for r in rs)
            row = [r for r in rs if r[3] == bottom]
            if len(row) == 1:
                markers.append(2 * (a['x'] - row[0][0]))
    if not tops:
        return BLOCK_TOP, BLOCK_BOTTOM, MARKER_UNITS
    tops.sort()
    bottoms.sort()
    markers.sort()
    return (
        tops[len(tops) // 20],
        bottoms[-max(1, len(bottoms) // 20)],
        statistics.median(markers) if markers else MARKER_UNITS,
    )


def rectangles(polygon):
    out = []
    for m in RECT.finditer(polygon):
        xs = [float(m.group(i)) for i in (1, 3, 5, 7)]
        ys = [float(m.group(i)) for i in (2, 4, 6, 8)]
        out.append((min(xs), max(xs), min(ys), max(ys)))
    return out


def page_lines(entries, block):
    """[(surah, ayah, share)] per line, right to left, or None."""
    block_top, block_bottom, marker_units = block
    boxes = []
    for i, a in enumerate(entries):
        for r in rectangles(a['polygon']):
            boxes.append((i, *r))
    if not boxes:
        return None

    top = block_top
    count = LINES_PER_PAGE
    pitch = (block_bottom - block_top) / count

    # The measure, on the other hand, IS the page's own: a framed page is
    # inset, and its lines are genuinely shorter.
    left = min(b[1] for b in boxes)
    right = max(b[2] for b in boxes)
    if right - left <= 0:
        return None

    # ── PARTIAL IS A PROPERTY OF THE AYAH, NOT OF THE RECTANGLE ───────
    #
    # Only two rows of an ayah are partial: the one it starts on, where
    # the ayah before it may have ended, and the one it finishes on,
    # where the next may begin. Every row between them is wholly its own.
    #
    # This used to be decided per RECTANGLE, and the export changed under
    # it. The older polygons gave one rectangle per row, so a rectangle's
    # first and last row were the ayah's; the current ones merge a run of
    # rows into a single tall rectangle whose x-range describes only the
    # narrowest part of it. Shuʿbah page 294 is the shape of the fault:
    # 18:6 starts at the left end of row 0 and runs through row 1, as one
    # rectangle x 0–136 — so row 1, a full line of text, was recorded at
    # 39% and would have been set as a third of a line with a hole after
    # it. Reading the span per ayah is the same rule the comment always
    # claimed, applied to the thing it was always about.
    spans = {}
    for idx, x0, x1, y0, y1 in boxes:
        first = max(0, min(count - 1, round((y0 - top) / pitch)))
        last = max(first, min(count - 1, round((y1 - top) / pitch) - 1))
        rows = spans.setdefault(idx, {})
        for line in range(first, last + 1):
            got = rows.get(line)
            rows[line] = (
                (min(got[0], x0), max(got[1], x1)) if got else (x0, x1)
            )

    lines = [[] for _ in range(count)]
    for idx, rows in spans.items():
        opens = min(rows)
        closes = max(rows)
        for line, (x0, x1) in rows.items():
            whole = line != opens and line != closes
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
        out.append(merged)

    # The last row each ayah appears on is the one carrying its medallion.
    last_row = {}
    for i, line in enumerate(out):
        for idx, _a, _b in line:
            last_row[idx] = i

    # ── THE ROWS AN AYAH CARRIES OVER A PAGE TURN ─────────────────────
    #
    # An ayah that begins on the page before continues at the TOP of this
    # one, and on 25 of Shuʿbah's pages the publisher has no polygon for
    # those rows: page 551 marks 60:12 on row 3 alone, when the printed
    # page plainly gives it rows 0 to 3 — I rendered it and counted.
    # Warsh has none of these, because its table was cut from an older
    # export that emitted a rectangle per row.
    #
    # Left alone the page opens with blank rows and the carried-over text
    # has nowhere to go, so it stays on the page before and overfills it.
    # A leading run of empty rows on a page that does NOT open a surah is
    # unambiguous — a muṣḥaf page has no blank line except under a band —
    # so the ayah that starts the first real row is extended up through
    # them at full width, which is what the print shows.
    if out and not out[0]:
        first = 0
        while first < len(out) and not out[first]:
            first += 1
        if first < len(out) and out[first]:
            carried = out[first][0][0]
            # Only when it is a continuation. A page that opens a surah
            # has its blank rows honestly: they are the band's.
            if entries[carried]['ayahNumber'] != 1:
                for row in range(first):
                    out[row] = [[carried, left, right]]

    # ── A ROW CANNOT HOLD MORE THAN A ROW ─────────────────────────────
    #
    # Two ayahs sharing a row must between them cover it once. Shuʿbah
    # page 551 has one row where they do not: the publisher's polygons
    # for 61:3 and 61:4 both run almost the full width of it, so the row
    # claims 196% of the measure. Left alone the renderer would try to
    # fit two lines of text into one and squeeze both to the floor of the
    # scale band.
    #
    # The overlap is the ambiguity and there is nothing in the file that
    # resolves it, so the shares are scaled to fit and their proportion
    # to each other — the one thing the polygons do agree on — is kept.
    # One row in 8,741, and the alternative is a page that is visibly
    # wrong with nothing to say why.
    for line in out:
        width = sum(b - a for _idx, a, b in line)
        if width > right - left:
            excess = (right - left) / width
            for span in line:
                mid = (span[1] + span[2]) / 2
                half = (span[2] - span[1]) * excess / 2
                span[1], span[2] = mid - half, mid + half

    measure = right - left
    return [
        [
            (
                entries[idx]['surahNumber'],
                entries[idx]['ayahNumber'],
                round(
                    max(0.0, (b - a) - (marker_units if last_row[idx] == i else 0.0))
                    / measure,
                    4,
                ),
            )
            for idx, a, b in line
        ]
        for i, line in enumerate(out)
    ]


def pack(pages):
    """The shipped form, which `mushafPrintedLines.unpack` reads.

    Two savings, and both matter for a table that ships in the APK:
    the share becomes a whole percent, and the surah is dropped from a
    span that repeats the one before it — which it does for all but a
    hundred or so spans in the book. Together they take the Warsh table
    from 201 KB to 132 KB.

    This used to be done by hand after running the tool, which is why
    the tool did not reproduce the file the app was shipping. It does
    now, and `linesRoundTrip` checks that it still does.
    """
    out = {}
    for page, lines in sorted(pages.items()):
        rows = []
        surah = 0
        for line in lines:
            row = []
            for s, a, share in line:
                percent = int(round(share * 100))
                if s == surah:
                    row.append([a, percent])
                else:
                    row.append([s, a, percent])
                    surah = s
            rows.append(row)
        out[str(page)] = rows
    return out


def main(src, dest, block=None):
    raw = {}
    for name in sorted(os.listdir(src)):
        m = re.match(r'^(\d+)\.json$', name)
        if not m:
            continue
        with open(os.path.join(src, name), encoding='utf-8') as f:
            raw[int(m.group(1))] = json.load(f)

    # The block first, from every page at once — see `measure_block`.
    fitted = measure_block(raw.values())
    print(
        '  fitted    top=%.2f bottom=%.2f pitch=%.2f medallion=%.2f'
        % (fitted[0], fitted[1], (fitted[1] - fitted[0]) / LINES_PER_PAGE, fitted[2])
    )
    block = block or fitted
    print(
        '  using     top=%.2f bottom=%.2f pitch=%.2f medallion=%.2f'
        % (block[0], block[1], (block[1] - block[0]) / LINES_PER_PAGE, block[2])
    )

    pages = {}
    widths = []
    for page, entries in sorted(raw.items()):
        lines = page_lines(entries, block)
        if lines is None:
            continue
        pages[page] = lines
        widths.append(len(lines))

    print(f'  {len(pages)} pages')
    counts = {}
    for w in widths:
        counts[w] = counts.get(w, 0) + 1
    print(f'  lines per page: {dict(sorted(counts.items()))}')
    print(f'  median {statistics.median(widths)}')

    empty = [p for p, l in pages.items() if any(len(x) == 0 for x in l)]
    print(f'  pages with an empty line: {len(empty)} {empty[:8]}')
    # A line's word-shares plus one medallion's worth per ayah ending on
    # it should come to the full measure. They will not come to 1 on their
    # own — that is the medallion, and it is the point.
    marker = block[2] / 345.0
    off = []
    for p, l in pages.items():
        for i, line in enumerate(l):
            if not line:
                continue
            total = sum(s for _, _, s in line)
            if not 0.85 <= total <= 1.02:
                off.append((p, i + 1, round(total, 3)))
    print(f'  lines that do not fill the width (allowing {marker:.3f} a medallion): '
          f'{len(off)} {off[:6]}')

    # The medallion's share of the measure travels WITH the table.
    # It used to be a constant in three places — this tool, the
    # renderer and its test — and the three could disagree without
    # anything noticing. An edition's table now states its own.
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump({'marker': round(block[2] / 345.0, 5), 'lines': pack(pages)}, f,
                  ensure_ascii=False, separators=(',', ':'))
    print(f'  wrote {dest} ({os.path.getsize(dest) / 1024:.0f} KB)')


if __name__ == '__main__':
    # An edition whose block is already known passes it in rather than
    # letting the fit decide: the Warsh/Qālūn numbers below were tuned
    # by hand against the rendered pages and are tighter than the fit,
    # and the table they produce is the one verified on a device.
    given = None
    if len(sys.argv) > 3:
        given = tuple(float(x) for x in sys.argv[3].split(','))
    main(sys.argv[1], sys.argv[2], given)
