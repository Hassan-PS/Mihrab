#!/usr/bin/env python3
"""Measure the print's word spacing off the KFGQPC page scans.

The QPC v2 page fonts carry the print's glyphs and their advances, but not
the space between two words — the fonts have no space glyph, so the reader
has to add whatever the print adds. For a long time a nominal quarter em
was assumed. This script measures it instead.

For a page it takes the scan (GovarJabbar/Quran-PNG, 2600×4206, the same
images the reader drew before it drew fonts), splits the text block into
its lines by the layout's line count, measures each line's ink width in
pixels, and fits

    width_px = em_px × (natural_em + gaps × space_em)

across the page's uncentred lines by least squares, where `natural` and
`gaps` come from `mushafLayoutV2.json`. It also lists the visible gaps on
each line (the widest runs of empty columns, one per gap), in pixels and
in ems of the fitted size.

    python3 scripts/mushaf/measure_print_spacing.py 125
    python3 scripts/mushaf/measure_print_spacing.py 125 290 --scans /tmp/qcf/scans

Last run (2026-09-23): page 125 — em 149 px, space 0.014 em, the widest
line's words touching (gaps of 1–2 px), visible gaps median 0.114 em;
page 290 — em 155 px, space −0.03 em, visible gaps median 0.129 em. So
`QPC_WORD_SPACE_EM` is 0 and an ordinary page's measure is its widest
line's advances. Pages with surah headers split their lines unevenly
under the uniform pitch used here and fit worse; read those by hand.

Requires: Pillow, numpy.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_qcf_assets import _get  # noqa: E402

LAYOUT = "src/quran/data/mushafLayoutV2.json"
SCAN_BASE = "https://cdn.jsdelivr.net/gh/GovarJabbar/Quran-PNG@master"


def scan(page: int, scans: str):
    from PIL import Image

    path = os.path.join(scans, f"{page}.png")
    if not os.path.exists(path):
        os.makedirs(scans, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(_get(f"{SCAN_BASE}/{page}.png"))
    return Image.open(path).convert("L")


def measure(page: int, layout: dict, scans: str) -> None:
    import numpy as np

    a = np.array(scan(page, scans))
    ink = a < 128
    rows = ink.sum(1)
    ys = np.where(rows > 20)[0]
    top, bot = int(ys.min()), int(ys.max())
    lines = layout["l"]
    pitch = (bot - top) / len(lines)
    print(f"page {page}: block rows {top}–{bot}, {len(lines)} lines, pitch {pitch:.1f} px")
    rows_fit: list[tuple[float, int]] = []
    widths: list[float] = []
    gaps_all: list[int] = []
    for i, line in enumerate(lines):
        if line["t"] != "a":
            continue
        y0, y1 = int(top + i * pitch), int(top + (i + 1) * pitch)
        cols = ink[y0:y1].any(0)
        xs = np.where(cols)[0]
        width = int(xs.max() - xs.min())
        runs: list[int] = []
        run = 0
        for v in cols[xs.min() : xs.max()]:
            if not v:
                run += 1
            elif run:
                runs.append(run)
                run = 0
        gaps = len(line["x"].split("|")) - 1
        biggest = sorted(runs)[-gaps:] if gaps else []
        gaps_all += biggest
        centered = line.get("c") == 1
        if not centered:
            rows_fit.append((line["n"], gaps))
            widths.append(width)
        print(
            f"  line {i + 1:2d}: {width} px, {line['n']:.3f} em, {gaps} gaps, "
            f"gap px median {np.median(biggest) if biggest else 0:.0f} "
            f"min {biggest[:2] if biggest else '-'}{'  (centred)' if centered else ''}"
        )
    A = np.array(rows_fit)
    b = np.array(widths)
    em, em_space = np.linalg.lstsq(A, b, rcond=None)[0]
    print(f"  fit: em {em:.1f} px, space {em_space / em:.3f} em, pitch {pitch / em:.3f} em")
    g = np.array(gaps_all) / em
    print(
        f"  visible gaps: median {np.median(g):.3f} em, "
        f"p10 {np.percentile(g, 10):.3f}, p90 {np.percentile(g, 90):.3f}"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", nargs="+", type=int)
    ap.add_argument("--layout", default=LAYOUT)
    ap.add_argument("--scans", default="/tmp/qcf/scans")
    args = ap.parse_args()
    with open(args.layout, encoding="utf-8") as fh:
        by_page = {p["p"]: p for p in json.load(fh)}
    for page in args.pages:
        measure(page, by_page[page], args.scans)
    return 0


if __name__ == "__main__":
    sys.exit(main())
