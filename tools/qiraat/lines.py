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
page, CC0, and with it the centre of every ayah's medallion. That is
enough to lay a page out as the print does at the granularity of an ayah,
which is the granularity the reader actually sees.

── WHAT THE PAGE IS READ FROM ────────────────────────────────────────

The medallions, not the rectangles.

That is the whole of it, and it took a reader's bug report to see. The
rectangles are an approximation of the ink and the export draws them
badly: on Shuʿbah page 294 the box for 18:5 runs from y 20.5 to 56.5,
which is on no line of that page — the page's rows sit at 6.0 + 35.78k,
so the box straddles two of them and omits the first entirely. Page 602
gives 106:4 two boxes four units tall. On page 551 two ayahs claimed
196% of one row between them. Every one of those put a hole on the page
or crushed one line into another, and every fix for one of them was a
heuristic that then had to be swept and tuned against the rest.

The medallions have none of that. Each ayah carries `x, y`, the centre
of the marker that closes it, and:

  * `y` falls on the centre of the row the ayah ENDS on. The worst case
    in either edition, against that page's own grid, is a quarter of a
    row.
  * `x - marker/2` is exactly where the next ayah begins. Not roughly:
    the same number, to the hundredth, as the rectangle edge wherever
    the rectangles are sound.
  * an ayah begins on the row where the one before it ended, because
    the order of the Qur'an is not in question.

Three facts, and the page follows. The rectangles are still asked one
question — whether a marker sitting at the end of a line leaves room for
the next ayah to start there — and for that one question they are right
4,554 times out of 4,556 on Shuʿbah and 4,564 out of 4,564 on Warsh,
because it asks where a box BEGINS, and it is the running-down that the
export gets wrong.

── HOW IT IS CHECKED ─────────────────────────────────────────────────

`ink.py` walks the page's own glyph path and reports where the text
really starts and stops on each of the fifteen rows; `verify.py` holds
the table against it. That is ground truth rather than a model of one,
and it is what says this file is right: 12 rows out of 8,792 on Shuʿbah
and 12 out of 8,807 on Warsh end anywhere but where the print puts them.

The output is geometry, not scripture: line counts and widths. It carries
no Qur'anic text and is CC0 where the polygons are.
"""
import json
import math
import os
import re
import statistics
import sys

import grid as G

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
# This is the ANCHOR, not the last word: each page then fits its own top
# and pitch around it, within a fraction of a row. See `grid.fit`.
#
# The ayah medallion, in the same units — measured as twice the distance
# from the marker's own centre to the left end of the row it closes, over
# 500 ayahs. Remarkably constant within an edition, and not at all
# constant between them: 19.96 in Warsh against 23.74 in Shuʿbah.
#
# It has to come OUT of the share, and that is one reason this file was
# wrong: the polygon for an ayah's last row covers its words AND its
# medallion, so handing the whole share to the words gave every line one
# word too few and pushed the rest onto the next. The medallion is drawn
# by the renderer, not set as text, so what the table records is the room
# the WORDS take.
MARKER_UNITS = 20.17

BLOCK_TOP = 1.75
BLOCK_BOTTOM = 540.14
LINES_PER_PAGE = 15

# ── Whether a marker at the end of a line leaves room for what follows ─
#
# Below eight units there is no room for a word, whatever a box claims.
# Above a third of the measure there is too much room for a line simply
# to stop — a justified page does not leave that much white — so text
# follows however the box is drawn. The widest gap the publisher does
# leave on purpose, on the tapered closing line of a surah, measures 83
# units in Shuʿbah and 45 in Warsh; the narrowest genuine one that a box
# denies is 121. Between the two guards, the boxes decide.
ROOM_CERTAIN = 100.0
ROOM_NEVER = 8.0


def measure_block(pages):
    """The text block and the medallion, read off THIS edition.

    ── WHY THESE ARE NOT CONSTANTS ───────────────────────────────────

    They were, and they were the Warsh edition's. Running the same
    numbers over Qālūn and Shuʿbah is what would have gone wrong
    silently: the three editions share a coordinate system almost
    exactly — left 0, right 345 — but Shuʿbah's block runs to y=547.6
    where Warsh's stops at 540.7, seven units lower. Snapping Shuʿbah's
    rows to Warsh's grid puts a pitch of 35.5 against a real pitch of
    36.0, which is under half a line at the top of the page and most of
    a line by the bottom: the last rows of every page would take their
    ayahs from the row above.

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
            if not rs or a.get('x') is None:
                continue  # Four ayahs in the Warsh export carry no marker.
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


def page_lines(entries, block, counts):
    """[(surah, ayah, share)] per line, right to left, or None.

    `counts` is the highest ayah number of each surah, which is how a
    line that closes a surah is known — and a closing line is short on
    purpose, where any other short line is a fault.
    """
    block_top, block_bottom, marker = block
    rects = [rectangles(a['polygon']) for a in entries]
    boxes = [r for rs in rects for r in rs]
    if not boxes:
        return None

    # The page's own grid, not the book's — see `grid.fit`.
    top, pitch = G.fit(
        sorted({round(v, 2) for r in boxes for v in (r[2], r[3])}),
        [a['y'] for a in entries if a.get('y') is not None],
        block_top, (block_bottom - block_top) / LINES_PER_PAGE)

    # The measure, on the other hand, IS the page's own: a framed page is
    # inset, and its lines are genuinely shorter.
    left = min(r[0] for r in boxes)
    right = max(r[1] for r in boxes)
    if right - left <= 0:
        return None
    half = marker / 2.0
    count = LINES_PER_PAGE
    n = len(entries)

    # ── WHICH ROW EACH AYAH ENDS ON ───────────────────────────────────
    #
    # Its medallion's row, and nothing else is consulted. An ayah is
    # listed on the page where it ends — except in the Warsh export,
    # which lists four of them on the page BEFORE as well, with no `x`
    # or `y` at all. Those rows carry no medallion and run to the
    # margin, and the two numbers are read back off the rectangles,
    # which for that handful are sound.
    closes = [a.get('y') is not None for a in entries]
    end = []
    edges = []
    for i, a in enumerate(entries):
        if closes[i]:
            row = min(count - 1,
                      max(0, int(round((a['y'] - top) / pitch - 0.5))))
        else:
            low = max(r[3] for r in rects[i])
            row = max(0, min(count - 1,
                             math.ceil((low - top) / pitch - 0.45) - 1))
        # Non-decreasing, because the ayahs are.
        end.append(max(row, end[-1]) if end else row)
        if a.get('x') is None:
            low = max(r[3] for r in rects[i])
            edges.append(min(r[0] for r in rects[i] if r[3] == low))
        else:
            edges.append(a['x'] - half)

    def band_of(a):
        """The rows a surah's opening takes: its title and its basmalah.

        One for at-Tawbah, which has no basmalah.
        """
        return 1 if a['surahNumber'] == 9 else 2

    def begins_on(i, row):
        """Does ayah i start on the row where the one before it ended?

        Usually. Not when that medallion sits at the very end of the
        line: then there is nothing after it and the ayah starts below.
        Getting this wrong costs a word — the sliver is given 2% of a
        row that has no text on it at all, and the word that should be
        there is pushed down. It was wrong on 864 rows of Shuʿbah.
        """
        room = edges[i - 1] - left
        if room >= ROOM_CERTAIN:
            return True
        if room <= ROOM_NEVER:
            return False
        return min(math.floor((r[2] - top) / pitch + 0.45)
                   for r in rects[i]) <= row

    # ── WHICH ROW EACH AYAH STARTS ON ─────────────────────────────────
    #
    # The row the one before it ended on, with a surah's opening band
    # between them where a surah opens. The page's first ayah is the
    # only one with nothing before it, and the only one whose rectangle
    # has to be asked: it starts at the top of the page unless the band
    # is on THIS page rather than at the foot of the last, and the box
    # says which. Clamped to the band's own width, so a bad box can put
    # it on row 0, 1 or 2 and nowhere else.
    start = [0] * n
    if entries[0]['ayahNumber'] == 1:
        first = min(r[2] for r in rects[0])
        start[0] = min(max(0, math.floor((first - top) / pitch + 0.45)),
                       band_of(entries[0]), end[0])
    for i in range(1, n):
        if entries[i]['ayahNumber'] == 1:
            start[i] = min(end[i - 1] + 1 + band_of(entries[i]), end[i])
        else:
            start[i] = end[i - 1]
            if end[i] > start[i] and not begins_on(i, start[i]):
                start[i] += 1

    # ── AND HOW MUCH OF EACH ──────────────────────────────────────────
    #
    # A row runs from the right margin, or from the medallion of the
    # ayah that ended on it, to the left margin, or to the ayah's own
    # medallion. The one case that is neither: a row an ayah ENDS on
    # where the next ayah begins on the row BELOW is still a full line,
    # with the medallion at its end — the words fill it. Reading that as
    # a short line lost 3% of the measure on 177 rows of Warsh.
    out = [[] for _ in range(count)]
    for i in range(n):
        for row in range(start[i], end[i] + 1):
            x1 = right
            if row == start[i] and i > 0 and end[i - 1] == row:
                x1 = edges[i - 1]
            if row != end[i] or not closes[i]:
                x0 = left
            elif (entries[i]['ayahNumber'] == counts.get(entries[i]['surahNumber'])
                  or (i + 1 < n and start[i + 1] == row)):
                x0 = edges[i]
            else:
                x0 = left
            x0 = min(max(x0, left), right)
            x1 = min(max(x1, left), right)
            if x1 - x0 > 0:
                out[row].append((i, x0, x1))

    measure = right - left
    lines = []
    for row, spans in enumerate(out):
        line = []
        for i, x0, x1 in spans:
            worn = marker if end[i] == row and closes[i] else 0.0
            share = round(max(0.0, (x1 - x0) - worn) / measure, 4)
            if share > 0:
                line.append((entries[i]['surahNumber'],
                             entries[i]['ayahNumber'], share))
        lines.append(line)
    return lines


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


def load(src):
    raw = {}
    for name in sorted(os.listdir(src)):
        m = re.match(r'^(\d+)\.json$', name)
        if not m:
            continue
        with open(os.path.join(src, name), encoding='utf-8') as f:
            raw[int(m.group(1))] = json.load(f)
    return raw


def ayah_counts(raw):
    """The last ayah of every surah, as this edition numbers them."""
    counts = {}
    for entries in raw.values():
        for a in entries:
            s = a['surahNumber']
            counts[s] = max(counts.get(s, 0), a['ayahNumber'])
    return counts


def main(src, dest, block=None):
    raw = load(src)
    counts = ayah_counts(raw)

    # The block first, from every page at once — see `measure_block`.
    fitted = measure_block(raw.values())
    print(
        '  fitted    top=%.2f bottom=%.2f pitch=%.2f medallion=%.2f'
        % (fitted[0], fitted[1],
           (fitted[1] - fitted[0]) / LINES_PER_PAGE, fitted[2])
    )
    block = block or fitted
    print(
        '  using     top=%.2f bottom=%.2f pitch=%.2f medallion=%.2f'
        % (block[0], block[1],
           (block[1] - block[0]) / LINES_PER_PAGE, block[2])
    )

    pages = {}
    widths = []
    measures = []
    for page, entries in sorted(raw.items()):
        lines = page_lines(entries, block, counts)
        if lines is None:
            continue
        pages[page] = lines
        widths.append(len(lines))
        boxes = [r for a in entries for r in rectangles(a['polygon'])]
        measures.append(max(r[1] for r in boxes) - min(r[0] for r in boxes))

    print(f'  {len(pages)} pages')
    tally = {}
    for w in widths:
        tally[w] = tally.get(w, 0) + 1
    print(f'  lines per page: {dict(sorted(tally.items()))}')
    print(f'  median {statistics.median(widths)}')

    empty = [p for p, l in pages.items() if any(len(x) == 0 for x in l)]
    print(f'  pages with an empty line: {len(empty)} {empty[:8]}')

    # A line's word-shares plus one medallion's worth per ayah ending on
    # it come to the full measure. They will not come to 1 on their own —
    # that is the medallion, and it is the point. A line that closes a
    # surah is short because the print sets it short.
    # Of the MEASURE, which is not the sheet. The sheet is 345 units wide
    # in both exports and a page's lines are 331 to 345 of it, so calling
    # the sheet the measure understated Warsh's medallion by 2%. Small,
    # and exactly the kind of small that this file has spent a day on.
    measure = statistics.median(measures)
    marker = block[2] / measure
    ends = {}
    for p, l in pages.items():
        for i, line in enumerate(l):
            for s, a, _ in line:
                ends[(s, a)] = (p, i)
    marks = {}
    for v in ends.values():
        marks[v] = marks.get(v, 0) + 1
    off = []
    for p, l in pages.items():
        for i, line in enumerate(l):
            if not line:
                continue
            total = sum(s for _, _, s in line) + marker * marks.get((p, i), 0)
            closing = (i + 1 < len(l) and not l[i + 1]) or i + 1 == len(l)
            if not 0.97 <= total <= 1.03 and not closing:
                off.append((p, i, round(total, 3)))
    print(f'  lines that do not come to the measure: {len(off)} {off[:6]}')

    # The medallion's share of the measure travels WITH the table.
    # It used to be a constant in three places — this tool, the
    # renderer and its test — and the three could disagree without
    # anything noticing. An edition's table now states its own.
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump({'marker': round(marker, 5), 'lines': pack(pages)},
                  f, ensure_ascii=False, separators=(',', ':'))
    print(f'  wrote {dest} ({os.path.getsize(dest) / 1024:.0f} KB)')


if __name__ == '__main__':
    # An edition whose block is already known passes it in rather than
    # letting the fit decide.
    given = None
    if len(sys.argv) > 3:
        given = tuple(float(x) for x in sys.argv[3].split(','))
    main(sys.argv[1], sys.argv[2], given)
