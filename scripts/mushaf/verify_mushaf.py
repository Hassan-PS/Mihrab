#!/usr/bin/env python3
"""Verify the font-rendered mushaf against independent sources.

Two classes of fault can reach a reader, and they need different checks:

1. **Wrong content** — a missing, duplicated or misplaced word. Caught by
   comparing our layout against a SECOND, independent copy of the same QPC v2
   word codes (nuqayah/qpc-fonts `mushaf-v2.txt`, which is derived from the
   KFGQPC fonts, not from the quran.com API our layout is built from). If two
   independent sources agree on every glyph of every page, a content error
   would have to exist identically in both.

   Compare the mushaf as ONE glyph stream, not page by page: the two sources
   attribute a page-straddling ayah to different pages, which is a difference
   in bookkeeping, not in content.

   Known defects in the comparison source (2026-07-30): it contains the
   literal string "None" in 20 places where a glyph should be, and it drops
   the ayah-1 medallion of Al-Baqarah. Those are ITS faults, not ours.

2. **Wrong spacing** — a line drawn wider than the box it was given. This one
   does not look like a rendering fault at all: the platform lays a single
   line out by breaking it, so an overflowing line loses the whole word after
   the last gap that fits, and the page reads as a page of the Quran with a
   word missing from every line (page 49, 2026-07-30). `check_spacing` replays
   the reader's own justification over all 604 pages, and `check_gap_font`
   ties the constant the reader sizes its gaps from to the font we ship.

3. **Wrong rendering** — words colliding on screen. NOTE: the bbox check
   below over-reports. QPC calligraphy interlocks on purpose — a kashida
   sweeping under the next word overlaps its box without touching a
   letterform — so treat hits as candidates for a human look, not failures.
   The real visual gate is diffing a rendered page against the official
   KFGQPC page image, which this repo already ships. Several QPC glyphs draw
   ink far past their advance so they interlock with a neighbour; if the ink
   of one word runs into the ink of the next by more than a hair, the page is
   unreadable even though its content is right. This replays the reader's own
   layout model (advance + word space) over all 604 pages and measures it.

    python3 scripts/mushaf/verify_mushaf.py --fonts /tmp/qcfbuild/raw-fonts

Exits non-zero if anything needs a human eye.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

# Must match src/quran/mushafLayout.ts — these checks are only meaningful if
# they replay what the reader actually draws.
WORD_SPACE_EM = 0.25
WORD_SPACE_MIN_EM = 0.2
WORD_SPACE_MAX_EM = 0.75
# Reserved out of the page block so a line's box always fits inside it. A line
# wider than its box does not clip on Android, it loses its last word.
MUSHAF_LINE_BOX_SLACK_EM = 0.5
MUSHAF_SPACE_ADVANCE_EM = 0.292

# The font the reader draws the gap between two words in. The QPC page fonts
# have no space glyph, so the gap is whatever face the platform falls back to
# unless we supply one — and an unmeasured gap is how every line of page 49
# came to lose its last word.
GAP_FONT = "android/app/src/main/assets/fonts/AmiriQuran.ttf"

# Ink may overlap a neighbour by this much of an em before it looks wrong.
# QPC calligraphy interlocks on purpose (a kashida sweeping under the next
# word is normal); a collision is when the letterforms themselves merge.
OVERLAP_TOLERANCE_EM = 0.28

LAYOUT = "src/quran/data/mushafLayoutV2.json"
SOURCE_TXT = "https://raw.githubusercontent.com/nuqayah/qpc-fonts/master/mushaf-v2.txt"


def load_layout(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def check_content(pages: list[dict], txt_path: str) -> list[str]:
    """Compare every page's glyph sequence against the independent source."""
    problems: list[str] = []
    by_page: dict[int, list[str]] = collections.defaultdict(list)
    with open(txt_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            page, rest = line.split(",", 1)
            # The source separates every GLYPH; our layout groups glyphs into
            # words (a long word is two glyphs). Compare glyph sequences, or
            # the two tokenisations disagree on every multi-glyph word.
            by_page[int(page)].extend(ch for ch in rest if ch != " ")

    for page in pages:
        ours: list[str] = []
        for ln in page["l"]:
            if ln["t"] != "a":
                continue
            ours.extend(
                ch for tok in ln["x"].split("|") for ch in tok if ch != " "
            )
        theirs = by_page.get(page["p"], [])
        if ours != theirs:
            # Report precisely where they diverge — a count mismatch and a
            # single swapped word are very different problems.
            if len(ours) != len(theirs):
                problems.append(
                    f"page {page['p']}: {len(ours)} glyphs, source has {len(theirs)}"
                )
            for i, (a, b) in enumerate(zip(ours, theirs)):
                if a != b:
                    problems.append(
                        f"page {page['p']}: glyph {i + 1} is {hex(ord(a))}, "
                        f"source says {hex(ord(b))}"
                    )
                    break
    return problems


def line_space_em(natural: float, gaps: int, centered: bool, measure: float) -> float:
    """The space the reader sets this line at — `lineSpaceEm` in TypeScript."""
    if gaps == 0 or centered:
        return WORD_SPACE_EM
    required = (measure - natural) / gaps
    if required > WORD_SPACE_MAX_EM:
        return WORD_SPACE_EM
    return max(required, WORD_SPACE_MIN_EM)


def page_measure_em(page: dict) -> float:
    """The page's measure as DRAWN — `pageMeasureEm` in TypeScript."""
    widest = 0.0
    for ln in page["l"]:
        if ln["t"] != "a":
            continue
        gaps = len(ln["x"].split("|")) - 1
        widest = max(widest, ln["n"] + WORD_SPACE_EM * gaps)
    return widest


def check_spacing(pages: list[dict]) -> list[str]:
    """Replay the reader's justification over all 604 pages.

    Two things must hold on every line, and the first one is the whole reason
    this check exists: a line drawn wider than the measure does not overflow
    the margin, it silently loses the word after the last gap that fits. The
    second keeps the fidelity rules honest — the space may only move inside
    the documented band, and a line that cannot reach the measure inside it is
    left at the nominal space to be centred, not stretched further.
    """
    problems: list[str] = []
    for page in pages:
        measure = page_measure_em(page)
        if measure <= 0:
            continue
        flush = False
        for line_no, ln in enumerate(page["l"], 1):
            if ln["t"] != "a":
                continue
            gaps = len(ln["x"].split("|")) - 1
            space = line_space_em(ln["n"], gaps, ln.get("c") == 1, measure)
            width = ln["n"] + space * gaps
            if width > measure + 1e-9:
                problems.append(
                    f"page {page['p']} line {line_no}: drawn {width:.4f} em into "
                    f"a {measure:.4f} em measure — its last word would be dropped"
                )
            if abs(width - measure) < 1e-9:
                flush = True
            box = width + MUSHAF_LINE_BOX_SLACK_EM
            if box > measure + MUSHAF_LINE_BOX_SLACK_EM + 1e-9:
                problems.append(
                    f"page {page['p']} line {line_no}: box {box:.4f} em overflows "
                    f"the page block"
                )
            in_band = WORD_SPACE_MIN_EM - 1e-9 <= space <= WORD_SPACE_MAX_EM + 1e-9
            if not in_band and space != WORD_SPACE_EM:
                problems.append(
                    f"page {page['p']} line {line_no}: word space {space:.4f} em "
                    "is neither inside the band nor the nominal space"
                )
        if not flush:
            problems.append(f"page {page['p']}: no line reaches the measure")
    return problems


def check_gap_font(path: str) -> list[str]:
    """The constant the reader sizes its gaps from must match the shipped font."""
    from fontTools.ttLib import TTFont

    if not os.path.exists(path):
        return [f"gap font missing at {path}"]
    problems: list[str] = []
    font = TTFont(path, lazy=True)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    for name, codepoint in (("space", 0x20), ("no-break space", 0xA0)):
        glyph = cmap.get(codepoint)
        if glyph is None:
            problems.append(f"{path}: no {name} glyph")
            continue
        advance = hmtx[glyph][0] / upem
        if abs(advance - MUSHAF_SPACE_ADVANCE_EM) > 1e-6:
            problems.append(
                f"{path}: {name} advances {advance:.4f} em, but "
                f"MUSHAF_SPACE_ADVANCE_EM says {MUSHAF_SPACE_ADVANCE_EM}"
            )
    font.close()
    return problems


def check_coverage(pages: list[dict], font_dir: str, manifest: str | None) -> list[str]:
    """Every glyph the layout draws must be in THE FONT THE APP WILL LOAD.

    Point `font_dir` at the subset fonts — the ones on the release, or a
    fresh cut of them — not at the raw KFGQPC files, which have every glyph
    of the page and prove nothing. Twenty of the release's fonts were cut
    short of their pages (2026-09-03): the reader drew the missing words in
    the platform's fallback face, and since the codepoints are Arabic
    Presentation Forms they read as a row of letter pairs ("له مج مح مخ").
    `check_rendering` used to shrug at a missing glyph; this does not.

    With the manifest (`src/quran/data/mushafFontManifest.json`) the font's
    size is checked too: the app treats any other size as a stale font and
    fetches it again, so a font that is right but not what the manifest
    says would be re-fetched for ever.
    """
    from fontTools.ttLib import TTFont

    sizes: list[int] = []
    if manifest and os.path.exists(manifest):
        with open(manifest, encoding="utf-8") as fh:
            sizes = json.load(fh).get("bytes", [])
    problems: list[str] = []
    for page in pages:
        path = os.path.join(font_dir, f"QCF2{page['p']:03d}.ttf")
        if not os.path.exists(path):
            problems.append(f"page {page['p']}: font missing at {path}")
            continue
        cmap = TTFont(path, lazy=True).getBestCmap()
        used = sorted(
            {ord(ch) for ln in page["l"] if ln["t"] == "a" for ch in ln["x"] if ch not in "| "}
        )
        missing = [hex(c) for c in used if c not in cmap]
        if missing:
            problems.append(
                f"page {page['p']}: font lacks {len(missing)} of the layout's glyphs "
                f"({', '.join(missing[:6])}{'…' if len(missing) > 6 else ''})"
            )
        if sizes:
            expected = sizes[page["p"] - 1] if page["p"] - 1 < len(sizes) else 0
            actual = os.path.getsize(path)
            if expected != actual:
                problems.append(
                    f"page {page['p']}: font is {actual} bytes, manifest says {expected}"
                )
    return problems


def check_rendering(pages: list[dict], font_dir: str) -> list[str]:
    """Replay the reader's layout and find words whose ink collides."""
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.ttLib import TTFont

    problems: list[str] = []
    for page in pages:
        path = os.path.join(font_dir, f"QCF2{page['p']:03d}.ttf")
        if not os.path.exists(path):
            problems.append(f"page {page['p']}: font missing at {path}")
            continue
        font = TTFont(path, lazy=True)
        upem = font["head"].unitsPerEm
        hmtx = font["hmtx"]
        cmap = font.getBestCmap()
        glyphs = font.getGlyphSet()
        bounds_cache: dict[str, tuple[float, float] | None] = {}

        def ink(token: str) -> tuple[float, float, float]:
            """(advance, inkStart, inkEnd) for a word, in ems."""
            adv = 0.0
            lo = None
            hi = None
            for ch in token:
                if ch == " ":
                    adv += WORD_SPACE_EM * upem
                    continue
                g = cmap.get(ord(ch))
                if g is None:
                    # Not this check's problem — `check_coverage` reports it —
                    # but not something to measure around either.
                    problems.append(
                        f"page {page['p']}: {hex(ord(ch))} is not in the font"
                    )
                    return (adv / upem, 0.0, 0.0)
                if g not in bounds_cache:
                    bp = BoundsPen(glyphs)
                    glyphs[g].draw(bp)
                    bounds_cache[g] = (bp.bounds[0], bp.bounds[2]) if bp.bounds else None
                b = bounds_cache[g]
                if b is not None:
                    lo = adv + b[0] if lo is None else min(lo, adv + b[0])
                    hi = adv + b[1] if hi is None else max(hi, adv + b[1])
                adv += hmtx[g][0]
            if lo is None:
                lo = hi = 0.0
            return (adv / upem, lo / upem, hi / upem)

        measure = page_measure_em(page)
        for line_no, ln in enumerate(page["l"], 1):
            if ln["t"] != "a":
                continue
            tokens = ln["x"].split("|")
            # The gap the reader will actually set this line at — a justified
            # line is spaced wider than the nominal, which only ever pulls
            # neighbouring ink further apart.
            space = line_space_em(ln["n"], len(tokens) - 1, ln.get("c") == 1, measure)
            pen = 0.0
            previous_end = None
            for i, tok in enumerate(tokens):
                adv, lo, hi = ink(tok)
                start, end = pen + lo, pen + hi
                if previous_end is not None:
                    overlap = previous_end - start
                    if overlap > OVERLAP_TOLERANCE_EM:
                        problems.append(
                            f"page {page['p']} line {line_no}: words {i} and {i + 1} "
                            f"overlap by {overlap:.2f} em"
                        )
                previous_end = end
                pen += adv + space
        font.close()
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", default=LAYOUT)
    ap.add_argument("--fonts", default="/tmp/qcfbuild/raw-fonts")
    ap.add_argument("--source-txt", default="/tmp/qcf/mushaf-v2.txt")
    ap.add_argument("--gap-font", default=GAP_FONT)
    ap.add_argument("--skip-render", action="store_true")
    ap.add_argument(
        "--subset-fonts",
        default="",
        help="the SUBSET fonts the app loads (release or fresh cut): checks that "
        "every glyph the layout draws is in them, and their sizes against the manifest",
    )
    ap.add_argument("--manifest", default="src/quran/data/mushafFontManifest.json")
    args = ap.parse_args()

    pages = load_layout(args.layout)
    print(f"checking {len(pages)} pages")

    failures = 0

    if os.path.exists(args.source_txt):
        problems = check_content(pages, args.source_txt)
        print(f"\ncontent vs independent source: {len(problems)} problems")
        for p in problems[:30]:
            print("  ", p)
        failures += len(problems)
    else:
        print(f"\n!! no independent source at {args.source_txt} — content NOT verified")
        print(f"   fetch it: curl -o {args.source_txt} {SOURCE_TXT}")
        failures += 1

    problems = check_spacing(pages)
    print(f"\nspacing (line fits the measure, space in band): {len(problems)} problems")
    for p in problems[:30]:
        print("  ", p)
    failures += len(problems)

    problems = check_gap_font(args.gap_font)
    print(f"\ngap font advance: {len(problems)} problems")
    for p in problems[:30]:
        print("  ", p)
    failures += len(problems)

    if args.subset_fonts:
        problems = check_coverage(pages, args.subset_fonts, args.manifest)
        print(f"\nglyph coverage of the subset fonts: {len(problems)} problems")
        for p in problems[:30]:
            print("  ", p)
        failures += len(problems)
    else:
        print("\n!! no --subset-fonts — the fonts the app loads are NOT checked against the layout")
        failures += 1

    if not args.skip_render:
        problems = check_rendering(pages, args.fonts)
        print(f"\nrendering (ink collisions): {len(problems)} problems")
        for p in problems[:30]:
            print("  ", p)
        failures += len(problems)

    print("\nOK — nothing to look at." if failures == 0 else f"\n{failures} to review.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
