#!/usr/bin/env python3
"""
The cases that decide whether `warsh_tajweed.py` can be trusted.

    python3 scripts/mushaf/test_warsh_tajweed.py

The W-* fixtures are the ones posted on issue #58, each cited to *Uṣūl
riwāyat Warsh min ṭarīq al-Shāṭibiyyah — suʾāl wa-jawāb* (Muḥammad Aḥmad
ʿAbd al-Jalīl) by question and page. The rest pin the shared rules to what
the KFGQPC text writes.

A fixture names its word by TEXT (vowels and marks stripped), searched for
in the fetched muṣḥaf (`.qr-data/warsh.json`), so a case cannot silently
point at the wrong word, and the test checks the data the app will ship,
never a string typed here. Warsh numbers its āyāt differently from Ḥafṣ;
where a case gives a Ḥafṣ reference the search finds the Warsh one.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from warsh_tajweed import MARKS, NOISE, analyse_ayah  # noqa: E402

TATWEEL = "ـ"
_DATA = None


def data():
    global _DATA
    if _DATA is None:
        with open(os.path.join(ROOT, ".qr-data", "warsh.json"), encoding="utf-8") as f:
            _DATA = json.load(f)
    return _DATA


def bare(t: str) -> str:
    return "".join(c for c in t if c not in MARKS and c not in NOISE and c != TATWEEL)


def find_word(skeleton: str, surah: int | None = None, needs: str = ""):
    """The first word in the muṣḥaf (or in one surah) whose letters are
    `skeleton` and whose text carries `needs` (a mark the case is about)."""
    for si, s in enumerate(data()["surahs"], start=1):
        if surah is not None and si != surah:
            continue
        A = s["ayahs"]
        for i, a in enumerate(A):
            ws = a["text"].split()
            for j, w in enumerate(ws):
                if bare(w) == skeleton and needs in w:
                    words = analyse_ayah(
                        a["text"],
                        A[i + 1]["text"] if i + 1 < len(A) else None,
                        A[i - 1]["text"] if i > 0 else None,
                    )
                    return f"{si}:{a['number']}", [x for x in words if bare(x.text) == skeleton][0]
    raise LookupError(f"no word {skeleton} in the muṣḥaf")


def basmalah_words():
    return analyse_ayah(data()["bismillah"].strip())


def rules_at(word, letter: str, nth: int = 1) -> set[str]:
    pos = -1
    for _ in range(nth):
        pos = word.text.index(letter, pos + 1)
    return {r for r, s, e in word.spans if s <= pos < e}


RESULTS: list[bool] = []


def expect(label, where, word, letter, has=(), lacks=(), nth=1):
    got = rules_at(word, letter, nth)
    ok = all(h in got for h in has) and not any(x in got for x in lacks)
    RESULTS.append(ok)
    want = "".join([f" has {list(has)}" if has else "", f" lacks {list(lacks)}" if lacks else ""])
    print(f"{'ok  ' if ok else 'FAIL'} {label:12} {where:7} {word.text}  {letter}#{nth} → {sorted(got)} ;{want}")


def case(label, skeleton, letter, has=(), lacks=(), nth=1, surah=None):
    where, w = find_word(skeleton, surah, letter)
    expect(label, where, w, letter, has, lacks, nth)


def main() -> int:
    # ── The fixtures from issue #58 ──────────────────────────────────
    b = basmalah_words()
    # W-RAA-01 · the basmalah's two rāʾs are thick: the kasra under hamzat
    # al-waṣl is ʿāriḍah, and tarqīq needs an aṣliyyah one. Q28, p.15.
    expect("W-RAA-01a", "basm.", b[2], "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    expect("W-RAA-01b", "basm.", b[3], "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    # W-RAA-02 · خَيْرٌ · after a permanent yāʾ sākinah: thin. Q28 §3.
    case("W-RAA-02", "خير", "ر", has=["raa_tarqeeq"])
    # W-RAA-03 · مِصْرَ · the ṣād between is istiʿlāʾ: thick. Q28 §4, p.16.
    case("W-RAA-03", "بمصر", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    # W-RAA-04 · ذِكْراً · one of the six nouns: thick. Q29 §4, p.16.
    case("W-RAA-04", "ذكرا", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    # W-RAA-05 · إِبْرَٰهِيمَ · a foreign name: thick. Q28 exc. 1, p.15.
    case("W-RAA-05", "إبرهيم", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    # W-RAA-06 · فِرَاراً · a rāʾ repeated in the word: the first is thick. Q28 exc. 3.
    case("W-RAA-06", "فرارا", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    # W-LAM-01 · الصَّلَاةَ · open lām after an open ṣād: heavy. Q30 §2, p.16.
    case("W-LAM-01", "الصلوة", "ل", has=["laam_taghleedh"], nth=2)
    # W-LAM-02 · أَظْلَمُ · open lām after a sākin ẓāʾ: heavy. Q30 §2.
    case("W-LAM-02", "أظلم", "ل", has=["laam_taghleedh"])
    # W-LAM-03 · فَصَلَّىٰ at the head of an āyah with taqlīl: the lām is thin. Q31, p.17.
    case("W-LAM-03", "فصلى", "ل", has=["taqleel"], lacks=["laam_taghleedh"], surah=87)
    # W-NAQL-01 · قَدَ اَفْلَحَ · naql gives the dāl a vowel, so it cannot bounce. Q18, Q20.
    case("W-NAQL-01a", "قد", "د", lacks=["qalaqah"], surah=23)
    case("W-NAQL-01b", "افلح", "ا", has=["naql"], surah=23)
    # W-BADAL-01 · ءَامَنُواْ · a hamza before a madd letter in one word. Q13, p.4.
    case("W-BADAL-01", "ءامنوا", "ا", has=["madd_badal"])
    # W-LEEN-01 · شَيْءٍ · a līn letter before a hamza. Q14 §2, p.5.
    case("W-LEEN-01", "شےء", "ے", has=["leen_mahmooz"])

    # ── Shared rules, as the KFGQPC text writes them ─────────────────
    case("wasl", "الله", "ا", has=["ham_wasl"], surah=2)
    case("shamsiyah", "الرحمن", "ل", has=["laam_shamsiyah"], surah=1)
    case("allah-lam", "الله", "ل", lacks=["laam_shamsiyah"], surah=2)
    case("ghunnah", "إن", "ن", has=["ghunnah"], surah=2)
    case("ikhfa-in", "أنزل", "ن", has=["ikhafa"])
    case("iqlab", "اليم", "ۢ", has=["iqlab"])
    case("shaf-ikh", "ترميهم", "م", has=["ikhafa_shafawi"], nth=2)
    case("naql-al", "الاخرة", "ل", has=["naql"])
    case("naql-alw", "وبالاخرة", "ل", has=["naql"])
    case("taqleel", "النصرى", "ر", has=["taqleel"], lacks=["tafkheem", "raa_tarqeeq"])
    case("raa-kasra", "المشرق", "ر", has=["raa_tarqeeq"])
    case("raa-sakin", "فرعون", "ر", has=["raa_tarqeeq"])
    case("raa-istila", "قرطاس", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"])
    case("raa-rabb", "رب", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"], surah=1)
    case("raa-sirat", "صرط", "ر", has=["tafkheem"], lacks=["raa_tarqeeq"], surah=1)
    case("raa-yaa", "حيران", "ر", has=["raa_tarqeeq"])
    case("raa-open", "خبيرا", "ر", has=["raa_tarqeeq"])
    case("qalq-sukun", "قبلك", "ب", has=["qalaqah"], surah=2)
    case("qalq-stop", "أحد", "د", has=["qalaqah"], surah=112)
    case("mottasel", "جاء", "ا", has=["madda_obligatory_mottasel"], surah=110)
    case("monfasel", "بما", "ا", has=["madda_obligatory_monfasel"], surah=2)
    case("lazim", "الضالين", "ا", has=["madda_necessary"], nth=2, surah=1)
    case("small-madd", "العلمين", "ٰ", has=["madda_normal"], surah=1)
    case("slnt", "كفروا", "ا", has=["slnt"], surah=2)
    case("istila", "قبلك", "ق", has=["tafkheem"], surah=2)
    case("allah-thick", "والله", "ل", has=["tafkheem"], nth=2, surah=2)
    case("allah-thin", "بالله", "ل", lacks=["tafkheem"], nth=2, surah=2)
    case("allah-lillah", "لله", "ل", lacks=["tafkheem"], nth=2, surah=2)
    expect("allah-basm", "basm.", b[1], "ل", lacks=["tafkheem"], nth=2)

    bad = RESULTS.count(False)
    print(f"\n{len(RESULTS) - bad} passed, {bad} failed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
