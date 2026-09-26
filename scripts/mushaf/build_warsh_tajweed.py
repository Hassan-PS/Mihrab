#!/usr/bin/env python3
"""
Build `assets/quran/tajweed-warsh/{NNN}.json` — the Warsh muṣḥaf's tajwīd
spans — from the KFGQPC Warsh text, with `warsh_tajweed.py`.

    python3 scripts/mushaf/build_warsh_tajweed.py [path/to/warsh.json]

The text is Quranpedia's `mushafs/4` (the same one the app fetches onto
the device; `.qr-data/warsh.json` by default, fetched if missing). The
fixtures in `test_warsh_tajweed.py` must pass first — this refuses to
write a muṣḥaf's worth of colour from rules that fail their own cases.

── THE SHAPE ────────────────────────────────────────────────────────────

The Ḥafṣ files' shape, `{ v, rules: [id…], ayahs: [[word…]…] }`, with one
difference: a word carries a HASH of its text rather than the text.
Mihrab does not ship the Warsh text (it has no right to redistribute it;
see `src/quran/riwayahStore.ts`) — the device fetches it from the
publisher — and a file of every word would be that text by another
name. So a word is `"h"` (8 hex chars, FNV-1a over its UTF-16 code
units) or `["h", [[ruleIndex, start, end]…]]`, and the app checks each
hash against the word it drew before it colours a letter of it: the spans
are UTF-16 offsets into THAT word, and on text that has changed they
would colour the wrong letters.

Words are the āyah's text split on whitespace, exactly as the reader
splits it, so the n-th entry is the n-th word on screen. A token that is
only a sign (۞ on its own) is `null`.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from warsh_tajweed import RULE_IDS, analyse_ayah, fnv1a, split_words  # noqa: E402

SOURCE_URL = "https://api.quranpedia.net/v1/mushafs/4"
OUT = os.path.join(ROOT, "assets", "quran", "tajweed-warsh")
VERSION = 1


def load(path: str) -> dict:
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"fetching {SOURCE_URL}")
        urllib.request.urlretrieve(SOURCE_URL, path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".qr-data", "warsh.json")
    data = load(src)
    test = subprocess.run([sys.executable, os.path.join(HERE, "test_warsh_tajweed.py")],
                          capture_output=True, text=True)
    if test.returncode != 0:
        print(test.stdout[-2000:])
        print("refusing to build: the fixtures fail")
        return 1
    print(test.stdout.strip().splitlines()[-1])

    os.makedirs(OUT, exist_ok=True)
    index = {r: i for i, r in enumerate(RULE_IDS)}
    total = 0
    for si, surah in enumerate(data["surahs"], start=1):
        texts = [a["text"] for a in surah["ayahs"]]
        ayahs_out = []
        for ai, text in enumerate(texts):
            analysed = analyse_ayah(
                text,
                texts[ai + 1] if ai + 1 < len(texts) else None,
                texts[ai - 1] if ai > 0 else None,
            )
            by_token = iter(analysed)
            words_out = []
            ruled = set(id(w) for w in analysed)
            kept = split_words(text)
            for token in text.split():
                if token not in kept or not kept:
                    words_out.append(None)
                    continue
                w = next(by_token)
                kept = kept[1:]
                assert w.text == token and id(w) in ruled
                spans = [[index[r], a, b] for r, a, b in w.spans]
                words_out.append([fnv1a(token), spans] if spans else fnv1a(token))
                total += len(spans)
            ayahs_out.append(words_out)
        doc = {
            "v": VERSION,
            "source": "KFGQPC Warsh (Quranpedia mushafs/4)",
            "rules": RULE_IDS,
            "ayahs": ayahs_out,
        }
        with open(os.path.join(OUT, f"{si:03d}.json"), "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f"wrote {len(data['surahs'])} files, {total} spans, {size / 1e6:.2f} MB to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
