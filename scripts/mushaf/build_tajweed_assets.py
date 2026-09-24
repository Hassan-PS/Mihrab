#!/usr/bin/env python3
"""Build the tajwīd-coloured Ḥafṣ muṣḥaf — the QPC V4 tajweed page fonts,
their advances, and the per-word rule data behind the reader's guide.

── THE FONTS ──────────────────────────────────────────────────────────

The King Fahd Complex's QPC V4 "tajweed" fonts are the V2 page fonts'
successors: one font per page, one glyph per word, the same
Presentation-Forms codes the reader's layout already names — and the
tajwīd colours inside the glyphs, as COLR v0 layers over a CPAL palette
of sixteen entries. Six palettes ship: 0 light, 1 dark, 2 an alternate
light, 3–5 the same with the rule colours flattened to black or white.

The app cannot ask the platform for a palette, so each page is written
TWICE — `QCF4T{page}L.ttf` with palette 0 first and `QCF4T{page}D.ttf`
with palette 1 first — and the font store fetches whichever the page's
tone needs. Two things are edited in the process:

  • Every layer drawn in the BASE ink — the text (entry 0), the maddah
    and pause marks (14) and the āyah medallion's outline and digits
    (13) — is pointed at entry 0xFFFF, "the text's own colour". The page
    then draws its ink in whatever colour the reader chose, the reading
    marker's medallion takes its ink as before, and one file serves
    paper and sepia alike. Only the rule colours stay the font's.
  • The medallion's three fills (10–12: the print's teal, pink and pale
    green) are made transparent, so the medallion is the same outlined
    ornament V2 draws and the reader's own washes show through it.
  • The palettes are cut to the one the file is for.

`verify` the way the V2 build does: every glyph the layout draws must
be in the font, or the page would fall back to a face with no colours
and the wrong shapes.

── THE ADVANCES ───────────────────────────────────────────────────────

V4 glyphs are cut a little wider than V2's (about 3% across a line, up
to 0.45 em on a word), so the reader's line arithmetic — the measure,
the gaps, where a tap lands — needs V4's advances when V4 is drawn.
`src/quran/data/mushafLayoutV4Advances.json` carries them, per page and
line, in the layout's own units.

── THE RULES ──────────────────────────────────────────────────────────

quran.com's API marks each word's letters with the rule they carry
(`text_uthmani_tajweed`: `أَ<rule class=ikhafa>نف</rule>ُسَكُمۡ`), in
the same word order as the layout. That is what lets the reader say,
when an āyah is tapped, which letters are which rule — the font's
colours alone cannot be read back. It is written per surah to
`assets/quran/tajweed/{NNN}.json`, loaded on demand like the surah text.

    python3 scripts/mushaf/build_tajweed_assets.py fonts --pages 1,125
    python3 scripts/mushaf/build_tajweed_assets.py fonts
    python3 scripts/mushaf/build_tajweed_assets.py rules

Requires: fonttools  (pip install fonttools)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_qcf_assets import API, INTERNAL_SPACE_EM, PAGES, _get  # noqa: E402

LAYOUT = "src/quran/data/mushafLayoutV2.json"
ADVANCES = "src/quran/data/mushafLayoutV4Advances.json"
MANIFEST = "src/quran/data/mushafTajweedFontManifest.json"
RULES_DIR = "assets/quran/tajweed"
RELEASES = {"light": "mushaf-fonts-v4-tajweed-light", "dark": "mushaf-fonts-v4-tajweed-dark"}

# The QUL "QPC V4 Tajweed Font (page by page)" files, as mirrored on GitHub
# (YaseenDotDev/quran-qcf-v4 is a verbatim copy of the QUL download).
FONT_SRC = "https://raw.githubusercontent.com/YaseenDotDev/quran-qcf-v4/main"

# Palette entries drawn in the page's ink rather than a rule colour: the
# text, the pause and maddah marks, the āyah medallion's outline and digits.
INK_ENTRIES = {0, 13, 14}
# The medallion's fills, cleared: the app tints an āyah with its own washes.
CLEAR_ENTRIES = {10, 11, 12}
FOREGROUND = 0xFFFF

LIGHT, DARK = 0, 1


def raw_font_path(page: int, raw_dir: str) -> str:
    path = os.path.join(raw_dir, f"p{page}.ttf")
    if not os.path.exists(path):
        os.makedirs(raw_dir, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(_get(f"{FONT_SRC}/p{page}.ttf"))
    return path


def layout_codepoints(page: dict) -> set[int]:
    used: set[int] = set()
    for line in page["l"]:
        if line["t"] != "a":
            continue
        for ch in line["x"]:
            if ch not in "| ":
                used.add(ord(ch))
    return used


def build_fonts(page: dict, raw_dir: str, out_dir: str) -> tuple[int, int, list]:
    """Write the light and dark files for one page; return their sizes and
    the V4 advances of its lines."""
    from fontTools.ttLib import TTFont
    from fontTools.ttLib.tables.C_O_L_R_ import LayerRecord
    from fontTools.ttLib.tables.C_P_A_L_ import Color

    number = page["p"]
    path = raw_font_path(number, raw_dir)
    used = layout_codepoints(page)
    font = TTFont(path)
    cmap = font.getBestCmap()
    missing = sorted(c for c in used if c not in cmap)
    if missing:
        raise RuntimeError(f"page {number}: V4 font lacks {[hex(c) for c in missing]}")
    if "COLR" not in font or "CPAL" not in font:
        raise RuntimeError(f"page {number}: not a colour font")
    if font["COLR"].version != 0:
        raise RuntimeError(f"page {number}: COLR v{font['COLR'].version}, expected v0")

    # Advances from the raw font, before anything is touched.
    upem = font["head"].unitsPerEm
    hmtx = font["hmtx"]
    advances = []
    for line in page["l"]:
        if line["t"] != "a":
            advances.append(None)
            continue
        per_word = []
        for token in line["x"].split("|"):
            adv = 0.0
            for ch in token:
                if ch == " ":
                    adv += INTERNAL_SPACE_EM * upem
                else:
                    adv += hmtx[cmap[ord(ch)]][0]
            per_word.append(round(adv / upem, 4))
        advances.append([round(sum(per_word), 4), per_word])

    # The ink layers follow the text colour.
    colr = font["COLR"]
    for glyph, layers in colr.ColorLayers.items():
        colr.ColorLayers[glyph] = [
            LayerRecord(name=layer.name, colorID=FOREGROUND if layer.colorID in INK_ENTRIES else layer.colorID)
            for layer in layers
        ]

    cpal = font["CPAL"]
    palettes = [list(p) for p in cpal.palettes]
    for palette in palettes:
        for i in CLEAR_ENTRIES:
            if i < len(palette):
                palette[i] = Color(red=0, green=0, blue=0, alpha=0)
    if len(palettes) < 2:
        raise RuntimeError(f"page {number}: {len(palettes)} palettes, expected the light and dark pair")
    sizes = []
    os.makedirs(out_dir, exist_ok=True)
    for tag, which in (("L", LIGHT), ("D", DARK)):
        cpal.palettes = [palettes[which]]
        cpal.numPaletteEntries = len(palettes[which])
        if hasattr(cpal, "paletteTypes"):
            cpal.paletteTypes = cpal.paletteTypes[:1] if cpal.paletteTypes else cpal.paletteTypes
        if hasattr(cpal, "paletteLabels"):
            cpal.paletteLabels = cpal.paletteLabels[:1] if cpal.paletteLabels else cpal.paletteLabels
        family = f"QCF4T{number:03d}{tag}"
        for rec in font["name"].names:
            if rec.nameID in (1, 3, 4, 6):
                rec.string = family
        out = os.path.join(out_dir, f"{family}.ttf")
        font.save(out)
        sizes.append(os.path.getsize(out))
    return sizes[0], sizes[1], advances


def cmd_fonts(args: argparse.Namespace) -> int:
    with open(args.layout, encoding="utf-8") as fh:
        layout = json.load(fh)
    by_page = {p["p"]: p for p in layout}
    pages = [int(x) for x in args.pages.split(",") if x] if args.pages else list(range(1, PAGES + 1))

    manifest = {"releases": RELEASES, "light": [0] * PAGES, "dark": [0] * PAGES}
    if os.path.exists(args.manifest):
        with open(args.manifest, encoding="utf-8") as fh:
            prev = json.load(fh)
        for key in ("light", "dark"):
            got = list(prev.get(key) or [])
            manifest[key] = (got + [0] * PAGES)[:PAGES]
    advances: list = [None] * PAGES
    if os.path.exists(args.advances):
        with open(args.advances, encoding="utf-8") as fh:
            got = json.load(fh) or []
        advances = (list(got) + [None] * PAGES)[:PAGES]

    for i, page in enumerate(pages, 1):
        light, dark, adv = build_fonts(by_page[page], args.raw, args.out)
        manifest["light"][page - 1] = light
        manifest["dark"][page - 1] = dark
        advances[page - 1] = adv
        if i % 25 == 0 or i == len(pages):
            print(f"  {i}/{len(pages)}  page {page}: {light} / {dark} bytes", file=sys.stderr)

    with open(args.manifest, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
        fh.write("\n")
    with open(args.advances, "w", encoding="utf-8") as fh:
        json.dump(advances, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"wrote {args.manifest} and {args.advances}")
    return 0


RULE_TAG = re.compile(r"<rule class=([a-z_]+)>([^<]*)</rule>")
ANY_TAG = re.compile(r"<[^>]+>")


def word_rules(markup: str) -> tuple[str, list[list]]:
    """Plain text of a word and its `[rule, start, end]` spans over it."""
    text = ""
    spans: list[list] = []
    pos = 0
    for m in re.finditer(r"<rule class=([a-z_]+)>([^<]*)</rule>|([^<]+)|<[^>]+>", markup):
        if m.group(1):
            piece = m.group(2)
            spans.append([m.group(1), len(text), len(text) + len(piece)])
            text += piece
        elif m.group(3):
            text += m.group(3)
        pos = m.end()
    return text, spans


# The palette entry the fonts paint tafkhīm in — the heavy letters, the
# heavy rā, the lām of Allah's name. quran.com's markup has no rule for it,
# so the fonts themselves say which words carry it (`font_tafkheem`).
TAFKHEEM_ENTRY = 7
TAFKHEEM = "tafkheem"


def font_tafkheem(page: dict, raw_dir: str) -> set[tuple[int, int, int]]:
    """The (surah, āyah, position) of every word on the page whose glyph
    has a layer in the tafkhīm ink."""
    from fontTools.ttLib import TTFont

    font = TTFont(raw_font_path(page["p"], raw_dir))
    cmap = font.getBestCmap()
    layers = font["COLR"].ColorLayers
    out: set[tuple[int, int, int]] = set()
    for line in page["l"]:
        if line["t"] != "a":
            continue
        tokens = [t for t in line["x"].split("|") if t]
        i = 0
        for seg in line["w"]:
            surah, ayah, first, count = seg[0], seg[1], seg[2], seg[3]
            for k in range(count):
                if i >= len(tokens):
                    break
                token = tokens[i]
                i += 1
                heavy = False
                for ch in token:
                    name = cmap.get(ord(ch))
                    if name and any(l.colorID == TAFKHEEM_ENTRY for l in layers.get(name, [])):
                        heavy = True
                        break
                if heavy:
                    out.add((surah, ayah, first + k))
    return out


def cmd_rules(args: argparse.Namespace) -> int:
    with open(args.layout, encoding="utf-8") as fh:
        layout = json.load(fh)
    by_page = {p["p"]: p for p in layout}
    # How many words the layout puts on each āyah, to prove the API agrees.
    layout_words: dict[str, int] = {}
    for page in layout:
        for line in page["l"]:
            if line["t"] != "a":
                continue
            for seg in line["w"]:
                surah, ayah, _first, count = seg[0], seg[1], seg[2], seg[3]
                layout_words[f"{surah}:{ayah}"] = layout_words.get(f"{surah}:{ayah}", 0) + count

    rule_ids: list[str] = []
    per_surah: dict[int, dict[int, list]] = {}
    pages = [int(x) for x in args.pages.split(",") if x] if args.pages else list(range(1, PAGES + 1))
    for i, page in enumerate(pages, 1):
        url = f"{API}/verses/by_page/{page}?words=true&word_fields=text_uthmani_tajweed,char_type_name&per_page=50"
        data = json.loads(_get(url))
        heavy = font_tafkheem(by_page[page], args.raw) if os.path.exists(raw_font_path(page, args.raw)) else set()
        for verse in data["verses"]:
            surah, ayah = (int(x) for x in verse["verse_key"].split(":"))
            words = []
            for w in verse["words"]:
                if w.get("char_type_name") != "word":
                    continue
                text, spans = word_rules(w.get("text_uthmani_tajweed") or "")
                position = int(w.get("position") or len(words) + 1)
                if (surah, ayah, position) in heavy:
                    # The whole word: the font knows the word, not the letter.
                    spans.append([TAFKHEEM, 0, len(text)])
                packed = []
                for rule, start, end in spans:
                    if rule not in rule_ids:
                        rule_ids.append(rule)
                    packed.append([rule_ids.index(rule), start, end])
                words.append([text, packed] if packed else [text])
            per_surah.setdefault(surah, {})[ayah] = words
        if i % 50 == 0 or i == len(pages):
            print(f"  {i}/{len(pages)}", file=sys.stderr)

    # After the walk, not per page: an āyah that straddles a page is only
    # whole once its second page has been read. The layout counts the
    # āyah's medallion as a word; the API calls it an `end` and it was
    # skipped above, hence the one.
    mismatched = []
    for surah, ayahs in per_surah.items():
        for ayah, words in ayahs.items():
            expected = layout_words.get(f"{surah}:{ayah}")
            if expected is not None and expected - 1 != len(words):
                mismatched.append((surah, ayah, expected - 1, len(words)))
    if mismatched:
        print(f"{len(mismatched)} āyāt whose word count differs from the layout:", mismatched[:10], file=sys.stderr)

    os.makedirs(args.rules_dir, exist_ok=True)
    for surah, ayahs in sorted(per_surah.items()):
        count = max(ayahs)
        out = {"v": 1, "rules": rule_ids, "ayahs": [ayahs.get(n, []) for n in range(1, count + 1)]}
        with open(os.path.join(args.rules_dir, f"{surah:03d}.json"), "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {len(per_surah)} surahs to {args.rules_dir}; rules: {rule_ids}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fonts")
    f.add_argument("--layout", default=LAYOUT)
    f.add_argument("--manifest", default=MANIFEST)
    f.add_argument("--advances", default=ADVANCES)
    f.add_argument("--raw", default="/tmp/qcf4/raw")
    f.add_argument("--out", default="/tmp/qcf4/out")
    f.add_argument("--pages", default="")
    r = sub.add_parser("rules")
    r.add_argument("--layout", default=LAYOUT)
    r.add_argument("--rules-dir", default=RULES_DIR)
    r.add_argument("--pages", default="")
    r.add_argument("--raw", default="/tmp/qcf4/raw", help="the raw V4 fonts, for the tafkhīm words")
    args = ap.parse_args()
    return cmd_fonts(args) if args.cmd == "fonts" else cmd_rules(args)


if __name__ == "__main__":
    sys.exit(main())
