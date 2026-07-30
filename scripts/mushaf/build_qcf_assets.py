#!/usr/bin/env python3
"""Build the QPC v2 font-rendered mushaf assets.

Produces two things from public sources:

1. **Per-page fonts** — the KFGQPC QPC v2 page fonts (`QCF2001`…`QCF2604`),
   subset to exactly the glyphs the page uses and stripped of hinting//legacy
   tables. One font per page, one glyph per word.
2. **Layout data** — for every page: its 15 lines, each line's type
   (surah header / basmalah / ayah text), whether it is centred, and the
   ayah segments that make it up. Word codepoints are *derived*: QPC v2
   numbers a page's words consecutively from a per-page start codepoint, so
   the layout only stores the start and each line's word counts.

Sources (both public, no auth):
  fonts   https://github.com/nuqayah/qpc-fonts  (mirror of qurancomplex.gov.sa/TTF)
  layout  https://api.quran.com/api/v4  (word line_number + verse mapping)

Usage:
    python3 scripts/mushaf/build_qcf_assets.py --out build/qcf
    python3 scripts/mushaf/build_qcf_assets.py --out build/qcf --pages 1,2,255,604

Requires: fonttools, brotli  (pip install fonttools brotli)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

FONT_BASE = "https://raw.githubusercontent.com/nuqayah/qpc-fonts/master/mushaf-v2"
API = "https://api.quran.com/api/v4"
PAGES = 604
LINES_PER_PAGE = 15

# Surahs whose header is NOT followed by a basmalah line:
#   9  At-Tawbah — has no basmalah at all
#   1  Al-Fatihah — the basmalah is ayah 1, so it is ordinary ayah text
NO_BASMALAH = {1, 9}

# Pages 1 and 2 are typographically special in the print (fewer, larger,
# centred lines inside a decorative frame). They get their own treatment in
# the renderer; the layout still describes them faithfully.
FRAMED_PAGES = {1, 2}

# Width budgeted for the space inside a two-glyph word, in ems.
INTERNAL_SPACE_EM = 0.25


def _ssl_context():
    """python.org builds ship without the system roots; use certifi's."""
    import ssl

    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


_SSL = None


def _get(url: str, tries: int = 4, timeout: int = 40) -> bytes:
    global _SSL
    if _SSL is None:
        _SSL = _ssl_context()
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mihrab-asset-build"})
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:  # noqa: PERF203
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last}")


# --------------------------------------------------------------------------
# layout
# --------------------------------------------------------------------------


@dataclass
class Segment:
    """A run of consecutive words of one ayah sitting on one line."""

    surah: int
    ayah: int
    first_word: int  # 1-based position within the ayah
    count: int
    # `end` marks the ayah-number glyph, which QPC treats as a word of its own
    has_end: bool = False


@dataclass
class Line:
    number: int
    kind: str  # 'surah' | 'basmalah' | 'ayah'
    centered: bool = False
    surah: int = 0  # for 'surah'/'basmalah' lines
    segments: list[Segment] = field(default_factory=list)
    # The line's words as the codepoints to draw, in order.
    tokens: list[str] = field(default_factory=list)

    @property
    def word_count(self) -> int:
        return sum(s.count for s in self.segments)


def fetch_page_words(page: int, cache_dir: str) -> list[dict]:
    """Words of a page in reading order, each with line_number + verse key."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"page-{page:03d}.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    url = (
        f"{API}/verses/by_page/{page}?words=true&per_page=all"
        "&word_fields=code_v2,line_number,char_type_name,page_number"
    )
    data = json.loads(_get(url))
    words: list[dict] = []
    for verse in data["verses"]:
        surah, ayah = (int(x) for x in verse["verse_key"].split(":"))
        for w in verse["words"]:
            # A verse that straddles a page break is returned in full under
            # BOTH pages, so trust the word's own page, never the request's.
            words.append(
                {
                    "surah": surah,
                    "ayah": ayah,
                    "position": w["position"],
                    "page": w["page_number"],
                    "line": w["line_number"],
                    "type": w["char_type_name"],
                    "code": w["code_v2"],
                }
            )
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(words, fh, ensure_ascii=False)
    return words


def build_page_layout(page: int, words: list[dict]) -> tuple[list[Line], int, list[str]]:
    """Group a page's words into lines and fill in the header lines.

    Returns (lines, start_codepoint, warnings).
    """
    warnings: list[str] = []

    # Words are in reading order, so a line number may never go backwards.
    # One word in the whole mushaf breaks this upstream — the medallion of
    # 84:21 is tagged to the line above the ayah it closes — and left alone it
    # would print an ayah number in the middle of the previous line.
    previous_line = 0
    for w in words:
        if w["line"] < previous_line:
            warnings.append(
                f"page {page}: {w['surah']}:{w['ayah']}#{w['position']} claims line "
                f"{w['line']} after line {previous_line} — snapped forward"
            )
            w["line"] = previous_line
        previous_line = w["line"]

    by_line: dict[int, list[dict]] = {}
    for w in words:
        by_line.setdefault(w["line"], []).append(w)

    lines: list[Line] = []
    present = sorted(by_line)
    if not present:
        raise RuntimeError(f"page {page}: no words returned")

    # Ayah lines first, so we know which line numbers are gaps.
    for n in present:
        ws = by_line[n]
        line = Line(number=n, kind="ayah")
        for w in ws:
            line.tokens.append(w["code"])
            seg = line.segments[-1] if line.segments else None
            if seg and seg.surah == w["surah"] and seg.ayah == w["ayah"]:
                seg.count += 1
            else:
                seg = Segment(w["surah"], w["ayah"], w["position"], 1)
                line.segments.append(seg)
            if w["type"] == "end":
                seg.has_end = True
        lines.append(line)

    # Gaps inside the page are the decoration lines of a surah that starts
    # here: its name plate, and (except Al-Fatihah and At-Tawbah) the basmalah.
    filled: list[Line] = []
    last_seen = 0
    for line in lines:
        gap = list(range(last_seen + 1, line.number))
        if gap and last_seen > 0:
            surah = line.segments[0].surah
            kinds = decoration_kinds(surah)
            if len(gap) != len(kinds):
                warnings.append(
                    f"page {page}: gap {gap} but expected {kinds} for surah {surah}"
                )
            for n, kind in zip(gap, kinds):
                filled.append(Line(number=n, kind=kind, centered=True, surah=surah))
        filled.append(line)
        last_seen = line.number

    filled.sort(key=lambda x: x.number)

    # Sanity: the tokens we draw must match the segments we hit-test against.
    for line in filled:
        if line.kind == "ayah" and len(line.tokens) != line.word_count:
            warnings.append(
                f"page {page} line {line.number}: {len(line.tokens)} tokens vs "
                f"{line.word_count} segment words"
            )
    return filled, warnings


def decoration_kinds(surah: int) -> list[str]:
    """The non-text lines the print puts above a surah's first ayah."""
    if surah == 1:
        return ["surah"]  # its basmalah is ayah 1, so it is ordinary text
    if surah == 9:
        return ["surah"]  # At-Tawbah has no basmalah
    return ["surah", "basmalah"]


def place_straddling_headers(
    pages: dict[int, list[Line]], warnings: list[str]
) -> None:
    """Attach the decoration lines that sit above each page's first surah.

    A surah plate and its basmalah are often split by the page break — the
    plate closing out one page and the basmalah opening the next. Those lines
    are invisible to a single page's word list (they carry no words), so they
    can only be placed once every page is grouped.
    """
    for page in sorted(pages):
        lines = pages[page]
        if not lines:
            continue
        first = lines[0]
        if first.kind != "ayah":
            continue
        seg = first.segments[0]
        if not (seg.ayah == 1 and seg.first_word == 1):
            continue  # page opens mid-surah: nothing to place
        kinds = decoration_kinds(seg.surah)
        here = first.number - 1  # blank lines available at the top of this page
        take_here = min(here, len(kinds))
        overflow = kinds[: len(kinds) - take_here]
        mine = kinds[len(kinds) - take_here :]
        for i, kind in enumerate(mine):
            lines.insert(i, Line(number=i + 1, kind=kind, centered=True, surah=seg.surah))
        if not overflow:
            continue
        prev = pages.get(page - 1)
        if prev is None:
            warnings.append(f"page {page}: {overflow} has nowhere to go")
            continue
        base = prev[-1].number
        room = LINES_PER_PAGE - base
        if room < len(overflow):
            warnings.append(
                f"page {page - 1}: no room for {overflow} (ends at line {base})"
            )
        for i, kind in enumerate(overflow):
            prev.append(
                Line(number=base + i + 1, kind=kind, centered=True, surah=seg.surah)
            )


def apply_centering(
    pages: dict[int, list[Line]], last_ayah: dict[int, int]
) -> None:
    """Centre the lines the print does not stretch.

    A justified mushaf line is stretched to the full measure; the line that
    closes a surah stops where the text stops and sits centred. Pages 1–2 are
    ornamental plates whose every line is centred.
    """
    for page, lines in pages.items():
        for line in lines:
            if line.kind != "ayah":
                continue
            if page in FRAMED_PAGES:
                line.centered = True
                continue
            tail = line.segments[-1]
            line.centered = tail.has_end and tail.ayah == last_ayah.get(tail.surah, -1)


def measure_lines(page: int, lines: list[Line], raw_dir: str) -> list[float]:
    """Natural width of each ayah line, in ems of the page's own font.

    This is what lets the reader size the text like the print instead of like a
    web page: a full line of QPC v2 measures ~15.5 em, and the spread across a
    page's lines is only ~2%. The renderer picks the font size from the page's
    widest line so that line exactly spans the measure, and the remaining ~2%
    on other lines disappears into ordinary word spacing.
    """
    from fontTools.ttLib import TTFont

    name = f"QCF2{page:03d}.ttf"
    path = os.path.join(raw_dir, name)
    if not os.path.exists(path):
        os.makedirs(raw_dir, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(_get(f"{FONT_BASE}/{name}"))
    font = TTFont(path, lazy=True)
    upem = font["head"].unitsPerEm
    hmtx = font["hmtx"]
    cmap = font.getBestCmap()
    widths: list[float] = []
    for line in lines:
        if line.kind != "ayah":
            widths.append(0.0)
            continue
        total = 0.0
        for token in line.tokens:
            for ch in token:
                if ch == " ":
                    # ~200 words across the mushaf carry a hizb/sajdah symbol
                    # as a second glyph, separated by a space the page fonts
                    # have no glyph for. It falls back to the system space;
                    # budget a nominal quarter-em for it here.
                    total += INTERNAL_SPACE_EM * upem
                    continue
                glyph = cmap.get(ord(ch))
                if glyph is None:
                    raise RuntimeError(f"page {page}: {hex(ord(ch))} missing from {name}")
                total += hmtx[glyph][0]
        widths.append(round(total / upem, 4))
    font.close()
    return widths


def encode_page(page: int, lines: list[Line], widths: list[float]) -> dict:
    """Compact JSON for one page (see docs/mushaf-font-rendering-plan.md)."""
    out_lines = []
    for line, width in zip(lines, widths):
        if line.kind in ("surah", "basmalah"):
            out_lines.append({"t": line.kind[0], "s": line.surah})
            continue
        segs = [
            [s.surah, s.ayah, s.first_word, s.count] + ([1] if s.has_end else [])
            for s in line.segments
        ]
        # Words are separated by "|" because a word's own glyphs are sometimes
        # separated by a space (see INTERNAL_SPACE_EM).
        entry: dict = {"t": "a", "x": "|".join(line.tokens), "w": segs, "n": width}
        if line.centered:
            entry["c"] = 1
        out_lines.append(entry)
    return {"p": page, "m": round(max(widths), 4), "l": out_lines}


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------

DROP_TABLES = [
    "FFTM", "LTSH", "VDMX", "hdmx", "DSIG", "prop", "gasp", "kern", "post",
]


def build_font(page: int, used: set[int], raw_dir: str, out_dir: str) -> tuple[int, int]:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont

    name = f"QCF2{page:03d}.ttf"
    raw_path = os.path.join(raw_dir, name)
    if not os.path.exists(raw_path):
        os.makedirs(raw_dir, exist_ok=True)
        with open(raw_path, "wb") as fh:
            fh.write(_get(f"{FONT_BASE}/{name}"))
    raw_size = os.path.getsize(raw_path)

    font = TTFont(raw_path)
    opts = Options()
    opts.hinting = False
    opts.notdef_outline = False
    opts.name_IDs = [1, 2, 3, 4, 6]
    opts.name_legacy = False
    opts.layout_features = ["*"]
    opts.drop_tables += DROP_TABLES
    sub = Subsetter(options=opts)
    sub.populate(unicodes=used)
    sub.subset(font)
    # One family name per page so the renderer can address them individually.
    family = f"QCF2{page:03d}"
    for rec in font["name"].names:
        if rec.nameID in (1, 3, 4, 6):
            rec.string = family
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{family}.ttf")
    font.save(out_path)
    return raw_size, os.path.getsize(out_path)


# --------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/qcf")
    ap.add_argument("--pages", default="")
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--skip-fonts", action="store_true")
    args = ap.parse_args()

    pages = (
        [int(x) for x in args.pages.split(",") if x]
        if args.pages
        else list(range(1, PAGES + 1))
    )
    out = os.path.abspath(args.out)
    cache = os.path.join(out, "cache")
    raw_dir = os.path.join(out, "raw-fonts")
    font_dir = os.path.join(out, "fonts")
    os.makedirs(out, exist_ok=True)

    print(f"→ layout for {len(pages)} pages")
    warnings: list[str] = []

    # A verse that straddles a page break comes back under both pages, so
    # collect every word once and re-group by the page the word itself claims.
    fetch = sorted({p for page in pages for p in (page - 1, page, page + 1) if 1 <= p <= PAGES})
    seen: dict[tuple[int, int, int], dict] = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for i, words in enumerate(
            pool.map(lambda p: fetch_page_words(p, cache), fetch), 1
        ):
            for w in words:
                seen[(w["surah"], w["ayah"], w["position"])] = w
            if i % 50 == 0:
                print(f"   …fetched {i}/{len(fetch)}")

    by_page: dict[int, list[dict]] = {}
    last_ayah: dict[int, int] = {}
    for key in sorted(seen):
        w = seen[key]
        by_page.setdefault(w["page"], []).append(w)
        last_ayah[w["surah"]] = max(last_ayah.get(w["surah"], 0), w["ayah"])

    page_lines: dict[int, list[Line]] = {}
    used_codes: dict[int, set[int]] = {}
    for page in pages:
        words = by_page.get(page)
        if not words:
            raise RuntimeError(f"page {page}: no words")
        lines, warn = build_page_layout(page, words)
        page_lines[page] = lines
        used_codes[page] = {ord(c) for w in words for c in w["code"]}
        warnings.extend(warn)

    place_straddling_headers(page_lines, warnings)
    apply_centering(page_lines, last_ayah)

    for page, lines in page_lines.items():
        expected = LINES_PER_PAGE if page not in FRAMED_PAGES else len(lines)
        if len(lines) != expected:
            warnings.append(f"page {page}: {len(lines)} lines, expected {expected}")
        for i, line in enumerate(lines, 1):
            if line.number != i:
                warnings.append(
                    f"page {page}: line {i} numbered {line.number} — out of order"
                )
                break

    print("→ measuring lines")
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        measured = list(
            pool.map(lambda p: measure_lines(p, page_lines[p], raw_dir), pages)
        )
    layouts = {p: encode_page(p, page_lines[p], w) for p, w in zip(pages, measured)}

    layout_path = os.path.join(out, "mushaf-layout-v2.json")
    with open(layout_path, "w", encoding="utf-8") as fh:
        json.dump([layouts[p] for p in sorted(layouts)], fh, ensure_ascii=False, separators=(",", ":"))
    print(f"   layout: {os.path.getsize(layout_path) / 1024:.0f} KB → {layout_path}")

    if warnings:
        print(f"\n!! {len(warnings)} layout warnings")
        for w in warnings[:25]:
            print("   ", w)

    if not args.skip_fonts:
        print(f"\n→ fonts for {len(pages)} pages")
        totals = [0, 0]

        def do_font(page: int):
            return build_font(page, used_codes[page], raw_dir, font_dir)

        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            for i, (raw, sub) in enumerate(pool.map(do_font, pages), 1):
                totals[0] += raw
                totals[1] += sub
                if i % 50 == 0:
                    print(f"   …{i} fonts, {totals[1] / 1e6:.1f} MB so far")
        print(
            f"   raw {totals[0] / 1e6:.1f} MB → subset {totals[1] / 1e6:.1f} MB "
            f"({100 * totals[1] / max(totals[0], 1):.0f}%)"
        )

    print("\ndone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
