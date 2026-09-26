#!/usr/bin/env python3
"""
Tajwīd rules for the Warsh muṣḥaf — which letters of each word carry which
rule, computed from the King Fahd Complex's Warsh text (the one Mihrab
draws, fetched from Quranpedia: `mushafs/4`).

── WHY THE TEXT ITSELF IS THE FIRST WITNESS ────────────────────────────

The KFGQPC Warsh text is not bare letters and vowels: the Complex writes
the recitation into the orthography, the way its printed muṣḥaf does. A
nūn or mīm that is assimilated is written BARE (no sukūn); one that is
pronounced clearly carries the sukūn. Tanwīn that is assimilated or hidden
is written with the two marks side by side (U+0657, U+065E, U+0656); one
that is pronounced clearly is written stacked (U+064B/C/D). Iqlāb carries
the small mīm (U+06E2). Naql is written into the letters: قَدَ اَفْلَحَ has
the fatḥa on the dāl and a bare alif where the hamza was. Badal is اٰ.
Taqlīl is the low dot (U+06EA) under the letter. The hamzat al-waṣl of ال
is the filled dot (U+06EC). So most of what this script decides, the text
already says; the script reads it, and adds the rules the text does not
write — where the rāʾ is thinned and where it is thick, where the lām is
heavy, where a līn letter meets a hamza — from the reference below.

── THE REFERENCE ────────────────────────────────────────────────────────

The Warsh-specific rules follow *Uṣūl riwāyat Warsh min ṭarīq
al-Shāṭibiyyah — suʾāl wa-jawāb* (Muḥammad Aḥmad ʿAbd al-Jalīl), the
reference proposed on issue #58, question numbers cited at each rule.
The fixtures in `test_warsh_tajweed.py` are the cases from that thread,
each with its citation. Anything this script gets wrong is a bug in a
rule below, not in the data, and the fixture that catches it should be
added first.

── WHAT IT PRODUCES ─────────────────────────────────────────────────────

For each āyah, a list of words; for each word, a list of spans
`[rule, start, end]` in UTF-16 offsets into the word's text (every code
point here is in the BMP, so a Python index is a UTF-16 index). The rule
ids are quran.com's where the rule is shared with Ḥafṣ, so the app's
colours and guide carry over, plus Warsh's own.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# ── The characters ───────────────────────────────────────────────────

FATHA, DAMMA, KASRA, SUKUN, SHADDA = "َ", "ُ", "ِ", "ْ", "ّ"
FATHATAN, DAMMATAN, KASRATAN = "ً", "ٌ", "ٍ"           # stacked: iẓhār
OPEN_FATHATAN, OPEN_DAMMATAN, OPEN_KASRATAN = "ٗ", "ٞ", "ٖ"  # open: not iẓhār
MADDAH = "ٓ"
SUP_ALEF = "ٰ"
SMALL_WAW, SMALL_YEH, SMALL_HIGH_YEH, SMALL_HIGH_NOON = "ۥ", "ۦ", "ۧ", "ۨ"
SMALL_MEEM = "ۢ"     # iqlāb
ZERO = "۟"           # rounded zero
WASL_DOT = "۬"       # the filled dot: hamzat al-waṣl of ال
LOW_DOT = "۪"        # the empty low dot: taqlīl, or a changed hamza
HAMZA_ABOVE, HAMZA_BELOW = "ٔ", "ٕ"
TATWEEL = "ـ"
YEH_BARREE = "ے"

VOWELS = {FATHA, DAMMA, KASRA}
STACKED_TANWEEN = {FATHATAN, DAMMATAN, KASRATAN}
OPEN_TANWEEN = {OPEN_FATHATAN, OPEN_DAMMATAN, OPEN_KASRATAN}
TANWEEN = STACKED_TANWEEN | OPEN_TANWEEN
MARKS = VOWELS | TANWEEN | {SUKUN, SHADDA, MADDAH, SUP_ALEF, SMALL_WAW, SMALL_YEH, SMALL_HIGH_YEH,
                            SMALL_HIGH_NOON, SMALL_MEEM, ZERO, WASL_DOT, LOW_DOT, HAMZA_ABOVE, HAMZA_BELOW}
# Not part of any word for the rules: stop signs, the hizb rosette, sajdah, RLM.
NOISE = set("ۖۗۘۙۚۛۜ۞۩‏")

HAMZA_LETTERS = set("ءأإؤئ")
GHUNNAH_IDGHAM = set("ينمو")
NO_GHUNNAH_IDGHAM = set("لر")
QALQALAH = set("قطبجد")
ISTILA = set("خصضغطقظ")
LAM_HEAVY_BEFORE = set("صطظ")
# Idghām of two letters across words: same makhraj (mutajānisayn) and near
# (mutaqāribayn), as the text writes them — the first bare, the second with shadda.
MUTAJANISAYN = [set("دتط"), set("ذثظ"), set("بم")]
MUTAQARIBAYN = [set("قك"), set("لر")]


@dataclass
class Letter:
    base: str
    marks: str
    start: int   # offset of `base` in the word
    end: int     # offset after the last mark

    @property
    def vowel(self) -> str | None:
        for m in self.marks:
            if m in VOWELS:
                return m
        return None

    @property
    def tanween(self) -> str | None:
        for m in self.marks:
            if m in TANWEEN:
                return m
        return None

    def has(self, mark: str) -> bool:
        return mark in self.marks

    @property
    def sukun(self) -> bool:
        return SUKUN in self.marks

    @property
    def shadda(self) -> bool:
        return SHADDA in self.marks

    @property
    def bare(self) -> bool:
        """No vowel, no sukūn, no tanwīn — the text's way of writing an assimilated letter."""
        return self.vowel is None and not self.sukun and self.tanween is None

    @property
    def is_hamza(self) -> bool:
        return self.base in HAMZA_LETTERS or (self.base == TATWEEL and (HAMZA_ABOVE in self.marks or HAMZA_BELOW in self.marks))


@dataclass
class Word:
    text: str
    letters: list[Letter] = field(default_factory=list)
    spans: list[tuple[str, int, int]] = field(default_factory=list)
    # The last word of its āyah — where a reciter stops, which changes the
    # madd at the end of it and lets the last letter bounce.
    last: bool = False

    def mark(self, rule: str, a: Letter, b: Letter | None = None) -> None:
        end = (b or a).end
        self.spans.append((rule, a.start, end))


def tokenize(text: str) -> Word:
    w = Word(text)
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in NOISE or ch in MARKS:
            # A mark with no base (a stop sign's neighbour): skip it.
            i += 1
            continue
        j = i + 1
        while j < n and text[j] in MARKS:
            j += 1
        if ch == TATWEEL and j == i + 1:
            # A bare kashīda stretches the line; it is not a letter.
            i = j
            continue
        w.letters.append(Letter(ch, text[i + 1:j], i, j))
        i = j
    return w


# ── The rules ────────────────────────────────────────────────────────

def is_wasl_alef(w: Word, k: int) -> bool:
    """A hamzat al-waṣl — the alif is written and not sounded in the join."""
    L = w.letters[k]
    if L.base != "ا":
        return False
    if k == 0:
        return L.has(WASL_DOT) or L.has(LOW_DOT) or L.has(ZERO)
    # Inside a word, after one or two one-letter prefixes (وَ فَ بِ كَ لِ, or
    # وَبِ, فَلِ…): وَالذِينَ, بِالْوَصِيدِ, وَبِالَاخِرَةِ.
    if L.marks != "" or k > 2:
        return False
    if not all(x.base in "وفبكل" and x.vowel for x in w.letters[:k]):
        return False
    nxt = w.letters[k + 1] if k + 1 < len(w.letters) else None
    if nxt is None or nxt.base != "ل":
        return False
    if nxt.sukun or nxt.bare:
        return True  # the article, qamarī or shamsī
    # لَا / لَـ with a vowel after a plain alif is a madd (قَالُواْ), so a
    # vowelled lām counts only when it took a hamza's vowel by naql (الَاخِر).
    return k + 2 < len(w.letters) and w.letters[k + 2].base == "ا" and w.letters[k + 2].marks == ""


def naql_initial(w: Word, k: int, prev_word: Word | None, first_in_ayah: bool) -> bool:
    """قَدَ اَفْلَحَ — the hamza gone, its vowel on the letter before. Q18."""
    L = w.letters[k]
    if k != 0 or L.base != "ا":
        return False
    if L.has(WASL_DOT) or L.has(LOW_DOT):
        return False
    if L.has(ZERO) and L.vowel is None:
        # ا۟وْلَٰٓئِكَ after tanwīn: the vowel went to the tanwīn's nūn.
        return prev_word is not None and prev_word.letters and prev_word.letters[-1].tanween is not None
    if L.has(ZERO):
        return False  # اُ۟عْبُدُواْ — a waṣl written with the zero
    if L.vowel is None:
        return False
    if L.has(SUP_ALEF):
        return False  # اٰمَنَ — badal
    return True


def naql_in_article(w: Word, k: int) -> bool:
    """اِ۬لَاخِرِ, بِالَارْضِ — the lām of ال takes the hamza's vowel. Q18."""
    L = w.letters[k]
    if L.base != "ل" or L.vowel is None or L.shadda:
        return False
    if k == 0 or not is_wasl_alef(w, k - 1):
        return False
    return k + 1 < len(w.letters) and w.letters[k + 1].base == "ا" and w.letters[k + 1].marks == ""


def rule_word(w: Word, prev_word: Word | None, next_word: Word | None, first_in_ayah: bool) -> None:
    Ls = w.letters
    n = len(Ls)
    if n == 0:
        return
    nxt_first = next_word.letters[0] if next_word and next_word.letters else None

    for k, L in enumerate(Ls):
        prev = Ls[k - 1] if k > 0 else None
        nxt = Ls[k + 1] if k + 1 < n else None

        # ── Silent letters ────────────────────────────────────────────
        if L.base == "ا":
            if naql_initial(w, k, prev_word, first_in_ayah):
                w.mark("naql", L)
                continue
            if k == 0 and L.marks == "" and not first_in_ayah:
                # ان after هَٰٓؤُلَآءِ: the second of two hamzas, eased. Q23.
                w.mark("tasheel", L)
                continue
            if k == 0 and L.has(LOW_DOT) and prev_word and prev_word.letters and prev_word.letters[-1].is_hamza:
                w.mark("tasheel", L)  # شُهَدَآءَ ا۪ذْ
                continue
            if is_wasl_alef(w, k):
                w.mark("ham_wasl", L)
                continue
            if L.sukun and prev and prev.base == "و":
                w.mark("slnt", L)  # كَفَرُواْ
                continue
            if prev and prev.base == "ل" and prev.vowel and naql_in_article(w, k - 1):
                continue  # coloured with its lām below
        if L.base == "و" and L.sukun and k == 1 and Ls[0].base in "أا" and nxt and nxt.base == "ل":
            w.mark("slnt", L)  # أُوْلَٰٓئِكَ, أُوْلُواْ
            continue

        # ── The article's lām, and the lām of naql ────────────────────
        if L.base == "ل" and prev and is_wasl_alef(w, k - 1):
            if naql_in_article(w, k):
                w.mark("naql", L, nxt)
                continue
            # Shamsī only when the letter after it is doubled (اَ۬لرَّحْمَٰنِ,
            # اَ۬لنَّاسُ). A bare lām before an undoubled letter is sounded —
            # اَ۬لذِينَ, اَ۬لتِے are written with one lām, and it is read.
            if L.bare and nxt is not None and nxt.shadda and nxt.base != "ل":
                w.mark("laam_shamsiyah", L)
                continue

        # ── Ghunnah on a doubled nūn or mīm ───────────────────────────
        if L.base in "نم" and L.shadda and not (k == 0 and prev_word is not None and prev_word.letters and (prev_word.letters[-1].bare or prev_word.letters[-1].tanween in OPEN_TANWEEN)):
            w.mark("ghunnah", L)

        # ── Nūn sākinah and tanwīn ────────────────────────────────────
        # The text puts fatḥatan on the alif (أَمْناٗ): the letter before it
        # is vowelled by that tanwīn, not sākin.
        tanween_on_alef = nxt is not None and nxt.base in "اى" and nxt.tanween is not None
        if L.base == "ن" and L.bare and not L.shadda and not tanween_on_alef:
            if nxt is not None:
                w.mark("ikhafa", L, nxt)  # أُنزِلَ — inside the word it is always ikhfāʾ
            elif nxt_first is not None:
                _nun_or_tanween_across(w, L, next_word, nxt_first)
        elif L.tanween in OPEN_TANWEEN and nxt_first is not None:
            if L.base in "اى" and prev is not None and nxt is None:
                # The letter before the alif is the one the tanwīn belongs to.
                _nun_or_tanween_across(w, prev, next_word, nxt_first, L)
            else:
                # The letter carrying the tanwīn, with a trailing silent alif.
                tail = nxt if (nxt is not None and nxt.base in "اى" and nxt.marks == "") else None
                _nun_or_tanween_across(w, L, next_word, nxt_first, tail)
        elif L.has(SMALL_MEEM) and nxt is None and nxt_first is not None and nxt_first.base == "ب":
            w.mark("iqlab", L)
            next_word.mark("iqlab", nxt_first)

        # ── Mīm sākinah ───────────────────────────────────────────────
        if L.base == "م" and L.bare and not L.shadda and nxt is None and nxt_first is not None:
            if nxt_first.base == "ب":
                w.mark("ikhafa_shafawi", L)
                next_word.mark("ikhafa_shafawi", nxt_first)
            elif nxt_first.base == "م" and nxt_first.shadda:
                w.mark("idgham_shafawi", L)
                next_word.mark("idgham_shafawi", nxt_first)

        # ── Two letters meeting across words ──────────────────────────
        if L.bare and not L.shadda and L.base not in "نم" and L.base not in "اوىے" and nxt is None and nxt_first is not None and nxt_first.shadda:
            pair = {L.base, nxt_first.base}
            if any(pair <= g for g in MUTAJANISAYN) or L.base == nxt_first.base:
                w.mark("idgham_mutajanisayn", L)
            elif any(pair <= g for g in MUTAQARIBAYN):
                w.mark("idgham_mutaqaribayn", L)

        # ── Qalqalah ──────────────────────────────────────────────────
        at_stop = w.last and k == n - 1
        if L.base in QALQALAH and (L.sukun or (at_stop and not L.shadda)):
            w.mark("qalaqah", L)

        # ── Madd ──────────────────────────────────────────────────────
        _madd(w, k, L, prev, nxt, next_word, nxt_first)

        # ── Warsh: līn mahmūz. Q14 ────────────────────────────────────
        if L.base in ("و", "ي", YEH_BARREE) and L.sukun and prev and prev.vowel == FATHA and nxt is not None and nxt.is_hamza:
            if w.text_root() not in ("مَوْئِلاٗ", "اَ۬لْمَوْءُودَةُ", "اَ۬لْمَوْءُۥدَةُ"):
                w.mark("leen_mahmooz", L)

        # ── Warsh: the lām. Q30–31 ────────────────────────────────────
        lam_open = L.vowel == FATHA or (L.vowel is None and nxt is not None and nxt.base in "اى" and nxt.tanween in (FATHATAN, OPEN_FATHATAN))
        if L.base == "ل" and lam_open and prev and prev.base in LAM_HEAVY_BEFORE and (prev.vowel == FATHA or prev.sukun) and not L.has(LOW_DOT):
            w.mark("laam_taghleedh", L)

        # ── Tafkhīm of the heavy letters, as the Ḥafṣ colours have it ─
        # خ ص ض غ ط ق ظ are always heavy.
        if L.base in ISTILA:
            w.mark("tafkheem", L)
        # The lām of Allah's name: heavy after a fatḥa or ḍamma, light after
        # a kasra. The KFGQPC Warsh script writes the joining vowel on the
        # waṣl alif (اَ۬للَّهُ, بِسْمِ اِ۬للَّهِ), so that alif says which.
        if L.base == "ل" and L.shadda and nxt is not None and nxt.base == "ه" and _is_allah(w, k):
            v = _vowel_before_allah(w, k)
            if v in (FATHA, DAMMA):
                w.mark("tafkheem", L)

        # ── Warsh: the rāʾ. Q28–29 ────────────────────────────────────
        assimilated = L.bare and nxt is None and nxt_first is not None and nxt_first.shadda
        if L.base == "ر" and not L.has(LOW_DOT) and not assimilated:
            r = _raa(w, k, L, prev, prev_word)
            if r:
                w.mark(r, L)

        # ── Warsh: taqlīl — the low dot under a letter before its alif ─
        if L.has(LOW_DOT) and not (k == 0 and L.base == "ا"):
            tail = nxt if (nxt is not None and nxt.base in "اى" ) else None
            w.mark("taqleel", L, tail)


def _nun_or_tanween_across(w: Word, L: Letter, next_word: Word, nf: Letter, tail: Letter | None = None) -> None:
    if (nf.shadda and nf.base in GHUNNAH_IDGHAM) or nf.base in ("و", "ي"):
        w.mark("idgham_ghunnah", L, tail); next_word.mark("idgham_ghunnah", nf)
    elif nf.shadda and nf.base in NO_GHUNNAH_IDGHAM:
        w.mark("idgham_wo_ghunnah", L, tail); next_word.mark("idgham_wo_ghunnah", nf)
    elif nf.base == "ب":
        w.mark("iqlab", L, tail); next_word.mark("iqlab", nf)
    else:
        w.mark("ikhafa", L, tail); next_word.mark("ikhafa", nf)


def _madd(w: Word, k: int, L: Letter, prev: Letter | None, nxt: Letter | None, next_word: Word | None, nf: Letter | None) -> None:
    n = len(w.letters)
    # A hamza after the madd — in this word, or first in the next.
    hamza_next_word = nf is not None and (nf.is_hamza or (nf.base == "ا" and nf.has(SUP_ALEF)))
    # The madd letter itself, or the letter carrying a small one.
    carries_small = L.has(SUP_ALEF) or L.has(SMALL_WAW) or L.has(SMALL_YEH)
    natural = (
        (L.base == "ا" and L.marks in ("", MADDAH) and prev is not None and prev.vowel == FATHA and not (nxt is not None and (nxt.sukun or nxt.bare) and L.marks == ""))
        or (L.base == "و" and L.marks in ("", SUKUN, MADDAH, SUKUN + MADDAH) and prev is not None and prev.vowel == DAMMA and not (k == 1 and w.letters[0].base in "أا" and nxt is not None and nxt.base == "ل"))
        or (L.base in ("ي", YEH_BARREE) and L.marks in ("", SUKUN, MADDAH, SUKUN + MADDAH) and prev is not None and prev.vowel == KASRA)
        or (L.base == "ى" and (L.has(SUP_ALEF) or (L.marks == "" and prev is not None and prev.vowel == FATHA)))
        or carries_small
    )
    if not natural:
        return
    has_maddah = L.has(MADDAH)
    # قَالُوٓاْ — the alif after the wāw is written and silent: what the madd
    # meets is what comes after it.
    if nxt is not None and nxt.base == "ا" and nxt.marks == SUKUN and L.base == "و":
        nxt = w.letters[k + 2] if k + 2 < n else None
    # ءَا, إِي, أُو — badal, Warsh's own count. Q13.
    if prev is not None and prev.is_hamza and not has_maddah:
        w.mark("madd_badal", prev, L); return
    if L.base == "ا" and L.has(SUP_ALEF) and k == 0:
        w.mark("madd_badal", L); return
    if has_maddah:
        if nxt is not None and (nxt.is_hamza):
            w.mark("madda_obligatory_mottasel", L)
        elif nxt is None and hamza_next_word:
            w.mark("madda_obligatory_monfasel", L)
        elif nxt is not None and (nxt.shadda or nxt.sukun or nxt.bare):
            w.mark("madda_necessary", L)
        elif nxt is not None and nxt.base == "ا" and nxt.sukun and hamza_next_word:
            w.mark("madda_obligatory_monfasel", L)  # قَالُوٓاْ إِ…
        else:
            w.mark("madda_permissible", L)
        return
    # A natural madd in the last syllable of the āyah becomes ʿāriḍ at the
    # stop: 2 · 4 · 6. Anywhere else a full madd letter is left in ink, as
    # the tajwīd muṣḥaf leaves it; a small one is marked, since it is easy
    # to read past.
    last_syllable = nxt is not None and (k + 2 == n or (k + 3 == n and w.letters[k + 2].base in "اى" and w.letters[k + 2].marks in ("", SUKUN)))
    if last_syllable and w.last:
        w.mark("madda_permissible", L)
    elif carries_small:
        w.mark("madda_normal", L)


def _is_allah(w: Word, k: int) -> bool:
    """The doubled lām of اللّه / لِلّه — the name, not any lām before a hā."""
    skeleton = "".join(x.base for x in w.letters)
    return "لله" in skeleton or skeleton.endswith("له") and skeleton.startswith(("ال", "لل", "وال", "فال", "بال", "تال", "ول", "فل"))


def _vowel_before_allah(w: Word, k: int) -> str | None:
    for j in range(k - 1, -1, -1):
        x = w.letters[j]
        if x.base == "ل" and not x.vowel:
            continue  # the article's lām, merged into the doubled one
        if x.base == "ا":
            if x.vowel:
                return x.vowel  # the joining vowel, written on the waṣl alif
            continue          # وَاللَّهُ — a bare waṣl alif: look past it
        return x.vowel
    return None


FOREIGN_NAMES = ("إِبْرَٰهِ", "إِبْرَاهِ", "إِسْرَٰٓءِيل", "إِسْرَآءِيل", "عِمْرَٰنَ", "عِمْرَانَ", "إِرَمَ")
SIX_NOUNS = ("ذِكْراٗ", "سِتْراٗ", "إِمْراٗ", "اِمْراٗ", "وِزْراٗ", "حِجْراٗ", "صِهْراٗ")


def _raa(w: Word, k: int, L: Letter, prev: Letter | None, prev_word: Word | None) -> str | None:
    """Tarqīq or tafkhīm of a rāʾ in Warsh. Q28–29 of the reference."""
    Ls = w.letters
    root = w.text_root()
    nxt = Ls[k + 1] if k + 1 < len(Ls) else None
    # The text puts the fatḥatan on the alif after the rāʾ (خَبِيراٗ): that
    # rāʾ is open, not sākin.
    open_by_alef = L.bare and nxt is not None and nxt.base in "اى" and nxt.tanween is not None
    # A kasra on the rāʾ itself: always thin.
    if L.vowel == KASRA or L.tanween in (KASRATAN, OPEN_KASRATAN):
        return "raa_tarqeeq"
    # A doubled rāʾ with fatḥa or ḍamma is thick (اَ۬لْبِرَّ).
    if L.shadda:
        return "tafkheem"
    followed_by_istila = any(x.base in ISTILA for x in Ls[k + 1:k + 3] if x.base != "ا") if k + 1 < len(Ls) else False
    # The rāʾ is sākin: thin only after a real kasra in its own word, with no
    # istiʿlāʾ letter after it (فِرْعَوْنَ thin, قِرْطَاسٍ thick, and a kasra
    # borrowed from the previous word never counts).
    if (L.sukun or L.bare) and not open_by_alef:
        if prev is not None and prev.vowel == KASRA and not (k >= 1 and is_wasl_alef(w, k - 1)):
            if nxt is not None and nxt.base in ISTILA:
                return "tafkheem"
            return "raa_tarqeeq"
        return "tafkheem"
    # Fatḥa or ḍamma. The exceptions first — each is thick despite a kasra.
    if any(name in root for name in FOREIGN_NAMES):
        return "tafkheem"                                  # Q28 exc. 1: foreign names
    if any(x.base == "ر" for x in Ls[k + 1:]):
        return "tafkheem"                                  # Q28 exc. 3: a second rāʾ in the word
    if followed_by_istila:
        return "tafkheem"                                  # صِرَٰطَ, فِرَاقُ
    if any(root.startswith(s) or root == s for s in SIX_NOUNS):
        return "tafkheem"                                  # Q29 §4: ذِكْراً and its five
    # Now the reasons to thin.
    if prev is None:
        return "tafkheem"
    if prev.vowel == KASRA and not (k >= 1 and is_wasl_alef(w, k - 1)):
        return "raa_tarqeeq"                               # كَرِيم… a kasra directly before
    if prev.base in ("ي", YEH_BARREE) and (prev.sukun or prev.bare or prev.marks == "") and not prev.vowel:
        return "raa_tarqeeq"                               # خَيْرٌ, بَصِيرٌ
    if (prev.sukun or prev.bare) and prev.base not in ISTILA and k >= 2 and Ls[k - 2].vowel == KASRA and not is_wasl_alef(w, k - 2):
        return "raa_tarqeeq"                               # اَ۬لذِّكْرُ — a sākin between
    return "tafkheem"


def _text_root(self: Word) -> str:
    return "".join(ch for ch in self.text if ch not in NOISE)


Word.text_root = _text_root  # type: ignore[attr-defined]


# ── Driving it ───────────────────────────────────────────────────────

RULE_IDS = [
    "ham_wasl", "laam_shamsiyah", "slnt", "idgham_wo_ghunnah", "idgham_mutajanisayn", "idgham_mutaqaribayn",
    "ghunnah", "ikhafa", "idgham_ghunnah", "iqlab", "ikhafa_shafawi", "idgham_shafawi",
    "madda_normal", "madda_permissible", "madda_obligatory_mottasel", "madda_obligatory_monfasel", "madda_necessary",
    "madd_badal", "leen_mahmooz",
    "qalaqah", "tafkheem", "laam_taghleedh", "raa_tarqeeq",
    "naql", "tasheel", "taqleel",
]


def split_words(text: str) -> list[str]:
    return [w for w in text.split() if w.strip("".join(NOISE))]


def analyse_ayah(text: str, next_text: str | None = None, prev_text: str | None = None) -> list[Word]:
    """The words of one āyah with their spans. The neighbours give the
    cross-word rules their context at the āyah's edges."""
    words = [tokenize(t) for t in split_words(text)]
    after = tokenize(split_words(next_text)[0]) if next_text and split_words(next_text) else None
    before = tokenize(split_words(prev_text)[-1]) if prev_text and split_words(prev_text) else None
    if words:
        words[-1].last = True
    for i, w in enumerate(words):
        prev_w = words[i - 1] if i > 0 else before
        next_w = words[i + 1] if i + 1 < len(words) else after
        rule_word(w, prev_w, next_w, first_in_ayah=(i == 0))
    # Spans a neighbour outside the āyah received are its own business.
    for w in words:
        w.spans = sorted(set(w.spans), key=lambda s: (s[1], s[2], s[0]))
    return words


def analyse_surah(ayahs: list[str]) -> list[list[Word]]:
    out = []
    for i, t in enumerate(ayahs):
        out.append(analyse_ayah(t, ayahs[i + 1] if i + 1 < len(ayahs) else None, ayahs[i - 1] if i > 0 else None))
    return out


def fnv1a(text: str) -> str:
    """FNV-1a over UTF-16 code units, 8 hex chars — the app checks each word
    against the text it fetched with the same function (tajweedData.ts)."""
    h = 0x811C9DC5
    for ch in text:
        for unit in _utf16(ch):
            h ^= unit
            h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def _utf16(ch: str) -> list[int]:
    cp = ord(ch)
    if cp < 0x10000:
        return [cp]
    cp -= 0x10000
    return [0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)]


def describe(words: list[Word]) -> str:
    out = []
    for w in words:
        parts = [f"{r}:{w.text[s:e]}" for r, s, e in w.spans]
        out.append(f"{w.text}  " + " | ".join(parts))
    return "\n".join(out)


if __name__ == "__main__":
    import sys
    for line in sys.stdin:
        print(describe(analyse_ayah(line.strip())))
