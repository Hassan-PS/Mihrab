#!/usr/bin/env python3
"""Subset the QPC v2 page fonts from the COMMITTED layout, and write the
size manifest the app checks its font store against.

── WHY THIS EXISTS, NEXT TO build_qcf_assets.py ─────────────────────────

`build_qcf_assets.py` derives both the layout and the fonts from one fetch
of the quran.com API, and subsets each page font to the words that fetch
put on the page. That is fine while the two are built together. They were
not: the fonts on the `mushaf-fonts-v2` release were cut from a word list
that lacked twenty pages' worth of glyphs — the same twenty "None" holes
the comparison source is known for — and `upload_qcf_fonts.sh` skips any
asset that already exists, so a later, correct build never replaced them.

The reader then drew those words in whatever face the platform fell back
to: the codepoints are Arabic Presentation Forms, so page 564 ended in
"له مج مح مخ" and page 592 lost ayah 15 of Al-Aʿlā to "هي يج يح يخ يم يى".
Reported 2026-09-03, with screenshots.

So this script takes the layout as the source of truth — it is what the
reader draws — and cuts every page font to exactly the glyphs the layout
puts on that page. A font and the layout it serves cannot disagree,
because they are the same data.

It also writes `src/quran/data/mushafFontManifest.json`: the byte size of
every page font as uploaded. The app treats a font on disk whose size is
not the manifest's as stale and fetches it again, which is how a device
that already holds the twenty bad fonts repairs itself without being
asked to download 180 MB.

    python3 scripts/mushaf/rebuild_fonts_from_layout.py \
        --raw /tmp/qcf/raw --out /tmp/qcf/out
    python3 scripts/mushaf/rebuild_fonts_from_layout.py ... --pages 564,592

Requires: fonttools  (pip install fonttools)
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_qcf_assets import DROP_TABLES, FONT_BASE, PAGES, _get  # noqa: E402

LAYOUT = "src/quran/data/mushafLayoutV2.json"
MANIFEST = "src/quran/data/mushafFontManifest.json"


def layout_codepoints(page: dict) -> set[int]:
    """Every codepoint the reader draws on this page, in the page's font."""
    used: set[int] = set()
    for line in page["l"]:
        if line["t"] != "a":
            continue
        for ch in line["x"]:
            if ch not in "| ":
                used.add(ord(ch))
    return used


def subset(page: int, used: set[int], raw_dir: str, out_dir: str) -> int:
    """Cut one page font to `used`; returns the subset's size in bytes.

    The options are `build_qcf_assets.build_font`'s, so a page that was
    already right comes out byte-identical to what is on the release.
    """
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont

    name = f"QCF2{page:03d}.ttf"
    raw_path = os.path.join(raw_dir, name)
    if not os.path.exists(raw_path):
        os.makedirs(raw_dir, exist_ok=True)
        with open(raw_path, "wb") as fh:
            fh.write(_get(f"{FONT_BASE}/{name}"))
    font = TTFont(raw_path)
    cmap = font.getBestCmap()
    missing = sorted(c for c in used if c not in cmap)
    if missing:
        raise RuntimeError(
            f"page {page}: the raw font lacks {[hex(c) for c in missing]} — "
            "the layout names glyphs the print does not have"
        )
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
    family = f"QCF2{page:03d}"
    for rec in font["name"].names:
        if rec.nameID in (1, 3, 4, 6):
            rec.string = family
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, name)
    font.save(out_path)
    # Prove the subset carries what the layout draws before anyone ships it.
    check = TTFont(out_path, lazy=True).getBestCmap()
    lost = sorted(c for c in used if c not in check)
    if lost:
        raise RuntimeError(f"page {page}: subset lost {[hex(c) for c in lost]}")
    return os.path.getsize(out_path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", default=LAYOUT)
    ap.add_argument("--manifest", default=MANIFEST)
    ap.add_argument("--raw", default="/tmp/qcf/raw")
    ap.add_argument("--out", default="/tmp/qcf/out")
    ap.add_argument("--pages", default="", help="comma-separated; default all")
    ap.add_argument(
        "--no-manifest",
        action="store_true",
        help="build the fonts but leave the manifest alone",
    )
    args = ap.parse_args()

    with open(args.layout, encoding="utf-8") as fh:
        layout = json.load(fh)
    by_page = {p["p"]: p for p in layout}
    pages = (
        [int(x) for x in args.pages.split(",") if x]
        if args.pages
        else list(range(1, PAGES + 1))
    )

    manifest: dict = {"release": "mushaf-fonts-v2", "bytes": [0] * PAGES}
    if os.path.exists(args.manifest):
        with open(args.manifest, encoding="utf-8") as fh:
            manifest = json.load(fh)

    for i, page in enumerate(pages, 1):
        size = subset(page, layout_codepoints(by_page[page]), args.raw, args.out)
        manifest["bytes"][page - 1] = size
        if i % 50 == 0 or i == len(pages):
            print(f"   …{i}/{len(pages)}")

    if not args.no_manifest:
        with open(args.manifest, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, separators=(",", ":"))
            fh.write("\n")
        print(f"manifest → {args.manifest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
