#!/usr/bin/env python3
"""Measure how far the QPC v2 page fonts' INK reaches past their metrics.

The reader lays a line out from the font's advances and the platform draws
only what falls inside the text view (Android clips a TextView to its
bounds, iOS rasterises `drawRect:` into a layer the size of the view). A
swash that starts before the first glyph's origin, or ends past the last
glyph's advance, is therefore cut at the page margin unless the view is
given room for it. `mushafLayout.ts` carries that room as constants —
`MUSHAF_INK_ABOVE_EM` / `MUSHAF_INK_BELOW_EM` for the vertical case,
`MUSHAF_INK_START_EM` / `MUSHAF_INK_END_EM` for the sides — and this
script is where the numbers come from.

Two horizontal figures per page, in ems, over the lines the layout puts on
the page (`mushafLayoutV2.json`, the reader's source of truth):

  right  the ink of a line's FIRST glyph (the rightmost, the text is RTL)
         past its advance:  xMax − advance
  left   the ink of a line's LAST glyph (the leftmost) before its origin:
         −xMin

Every glyph on the page is measured too (`right_any` / `left_any`), as a
ceiling: the line-end figures are what the margins need, the any-glyph
figures are what a line would need if the layout ever moved a word. The
vertical reach (`above` / `below`) and the drift between the layout's
per-word advances and the font's (`adv_drift`, expected 0) come out too.

Last full run (604 pages): right 0.3504 (p146), left 0.1956 (p12),
above 1.6172 (p556), below 0.7968 (p519), adv_drift 0.0000.

    python3 scripts/mushaf/measure_ink_overshoot.py            # all pages
    python3 scripts/mushaf/measure_ink_overshoot.py --pages 49,125

Requires: fonttools  (pip install fonttools)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_qcf_assets import FONT_BASE, PAGES, _get  # noqa: E402

LAYOUT = "src/quran/data/mushafLayoutV2.json"


def raw_font(page: int, raw_dir: str):
    from fontTools.ttLib import TTFont

    name = f"QCF2{page:03d}.ttf"
    path = os.path.join(raw_dir, name)
    if not os.path.exists(path):
        os.makedirs(raw_dir, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(_get(f"{FONT_BASE}/{name}"))
    return TTFont(path)


def measure(page: dict, font) -> dict:
    from fontTools.pens.boundsPen import BoundsPen

    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    cache: dict[str, tuple[float, float, float, float, float]] = {}

    def box(cp: int):
        """(xMin, xMax, yMin, yMax, advance) of a codepoint, in ems."""
        if cp == 0x20:
            # A space inside a word — before a hizb or sajdah symbol — is
            # budgeted by the layout at the nominal word space, whatever the
            # font says (WORD_SPACE_EM in mushafLayout.ts), and has no ink.
            return (0.0, 0.0, 0.0, 0.0, 0.25)
        name = cmap[cp]
        if name not in cache:
            pen = BoundsPen(glyphs)
            glyphs[name].draw(pen)
            adv = hmtx[name][0]
            b = pen.bounds or (0, 0, 0, 0)
            cache[name] = tuple(v / upem for v in (b[0], b[2], b[1], b[3], adv))
        return cache[name]

    out = {"right": 0.0, "left": 0.0, "right_any": 0.0, "left_any": 0.0,
           "above": 0.0, "below": 0.0, "adv_drift": 0.0}
    for line in page["l"]:
        if line["t"] != "a":
            continue
        words = line["x"].split("|")
        cps = [ord(c) for c in line["x"] if c not in "| "]
        if not cps:
            continue
        for cp in cps:
            x0, x1, y0, y1, adv = box(cp)
            out["right_any"] = max(out["right_any"], x1 - adv)
            out["left_any"] = max(out["left_any"], -x0)
            out["above"] = max(out["above"], y1)
            out["below"] = max(out["below"], -y0)
        x0, x1, _, _, adv = box(cps[0])
        out["right"] = max(out["right"], x1 - adv)
        x0, x1, _, _, adv = box(cps[-1])
        out["left"] = max(out["left"], -x0)
        # The layout's per-word advances are the font's; prove it.
        for word, said in zip(words, line.get("a", [])):
            have = sum(box(ord(c))[4] for c in word)
            out["adv_drift"] = max(out["adv_drift"], abs(have - said))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", default=LAYOUT)
    ap.add_argument("--raw", default="/tmp/qcf/raw")
    ap.add_argument("--pages", default="", help="comma-separated; default all")
    ap.add_argument("--json", default="", help="write per-page figures here")
    args = ap.parse_args()

    with open(args.layout, encoding="utf-8") as fh:
        layout = json.load(fh)
    by_page = {p["p"]: p for p in layout}
    pages = (
        [int(x) for x in args.pages.split(",") if x]
        if args.pages
        else list(range(1, PAGES + 1))
    )

    per_page: dict[int, dict] = {}
    worst: dict[str, tuple[float, int]] = {}
    for i, page in enumerate(pages, 1):
        m = measure(by_page[page], raw_font(page, args.raw))
        per_page[page] = m
        for k, v in m.items():
            if v > worst.get(k, (-1.0, 0))[0]:
                worst[k] = (v, page)
        if i % 50 == 0 or i == len(pages):
            print(f"  {i}/{len(pages)}", file=sys.stderr)

    for k in ("right", "left", "right_any", "left_any", "above", "below", "adv_drift"):
        v, p = worst.get(k, (0.0, 0))
        print(f"{k:10s} {v:7.4f} em  (page {p})")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(per_page, fh, indent=0, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
