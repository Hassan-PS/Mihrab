#!/usr/bin/env python3
"""Rewrite `src/quran/data/pages.json`'s ranges from the layout the app draws.

WHY THIS EXISTS

The app carried two page indexes that did not agree.

  * `data/pages.json` — alquran.cloud /v1/meta, Tanzil-derived. Every page's
    start and end. This is what `findPageForAyah()` searches, and so what
    decides which page the reader turns to.
  * `data/mushafLayoutV2.json` — the QPC v2 layout. This is what is drawn on
    the screen, line by line, glyph by glyph.

Both call themselves "the 604-page Madinah mushaf". They disagree about
where 36 of those pages begin or end, and it was reported as a bug in Quran
audio playback (issue #12): "the app stays stuck on the same page while the
audio continues", and "the grey band does not move correctly".

Measured before this script first ran: 56 ayahs resolved to a page they are
not drawn on, 43 of them in juz 30 — the short surahs people play on repeat.
Playing Al-'Alaq, the audio reaches 96:13; the index answers 597, the reader
is already on 597, so it does not turn the page, while 96:13 is printed on
598. The same instant page 597 holds no glyph tagged 96:13, so the highlight
matches nothing and the band disappears. One disagreement, both halves of
the report.

THE RULE: the layout is the truth. It is what the reader draws and what the
user sees. A page index describing some other pagination is not a second
opinion, it is wrong. `juz` and the surah table are untouched — only `start`
and `end` are rewritten.

    python3 scripts/mushaf/rebuild_page_ranges.py [--check]

`--check` exits non-zero instead of writing, which is how CI asks whether
the two files still agree.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
LAYOUT = ROOT / "src/quran/data/mushafLayoutV2.json"
PAGES = ROOT / "src/quran/data/pages.json"


def first_drawn(layout):
    """The first (surah, ayah) each page actually draws, in page order."""
    out = {}
    for page in layout:
        for line in page.get("l", []):
            runs = line.get("w", [])
            if runs:
                out[page["p"]] = {"surah": runs[0][0], "ayah": runs[0][1]}
                break
        # `break` above only leaves the line loop; guard the page loop too.
        if page["p"] in out:
            continue
    return out


def main() -> int:
    check = "--check" in sys.argv
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    meta = json.loads(PAGES.read_text(encoding="utf-8"))
    first = first_drawn(layout)

    moved = []
    for p in meta["pages"]:
        start = first.get(p["page"])
        if start is None:
            # A page drawing no ayah runs at all. Leave it exactly as found
            # rather than inventing a range for it.
            continue
        # `end` is exclusive: the next page's first drawn ayah. The last page
        # keeps null, which the binary search reads as "runs to the end".
        end = first.get(p["page"] + 1)
        if p["start"] != start or p["end"] != end:
            moved.append((p["page"], p["start"], start))
        p["start"] = start
        p["end"] = end

    print(f"pages whose range moved: {len(moved)} / {len(meta['pages'])}")
    for page, was, now in moved[:40]:
        print(f"  page {page:>3}  {was['surah']}:{was['ayah']} → {now['surah']}:{now['ayah']}")
    if len(moved) > 40:
        print(f"  … and {len(moved) - 40} more")

    if check:
        if moved:
            print("\npages.json disagrees with the drawn layout.", file=sys.stderr)
            print("Run without --check to rebuild it.", file=sys.stderr)
            return 1
        print("pages.json agrees with the drawn layout.")
        return 0

    if moved:
        # Same encoder settings the file was written with, so an unchanged
        # run is a byte-identical no-op and the diff shows only real moves.
        PAGES.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        print(f"\nwrote {PAGES.relative_to(ROOT)}")
    else:
        print("nothing to do.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
