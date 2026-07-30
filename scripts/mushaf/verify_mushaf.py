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

2. **Wrong rendering** — words colliding on screen. NOTE: the bbox check
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

# Must match WORD_SPACE_EM in MushafTextPage.tsx — the check is only
# meaningful if it replays what the reader actually draws.
WORD_SPACE_EM = 0.25

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

        for line_no, ln in enumerate(page["l"], 1):
            if ln["t"] != "a":
                continue
            tokens = ln["x"].split("|")
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
                pen += adv + WORD_SPACE_EM
        font.close()
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", default=LAYOUT)
    ap.add_argument("--fonts", default="/tmp/qcfbuild/raw-fonts")
    ap.add_argument("--source-txt", default="/tmp/qcf/mushaf-v2.txt")
    ap.add_argument("--skip-render", action="store_true")
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
