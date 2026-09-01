"""
`juzCheck.ts`'s `skeleton()` and `vocabularyOverlap()`, in Python.

EVERY Arabic literal in this file is a \\uXXXX escape. Not one is written
inline, and none should ever be.

That is not fussiness. A character class typed as literal Arabic beside
ASCII reorders on its way through an editor, a paste or a diff, and the
class that lands on disk is not the one that was meant. It cost this file
two rewrites: a skeleton that silently deleted whole verses and then scored
0% against every ayah of the Qur'an, twice, in ways that looked like a data
problem and were not. `MushafUnicodePage.tsx` carries the same warning.

`self_test()` at the bottom is the guard: it asserts a handful of known
transformations, so a mangled class fails loudly here instead of quietly
somewhere downstream.

Kept in step with src/quran/juzCheck.ts by hand.
"""
import re

# ── Marks that are drawn but carry no letter ─────────────────────────────
# Harakat, the Qur'anic annotation signs, waqf and sajdah marks, the
# extended set, tatweel and the bidi controls.
#
# NOT the dagger alif (U+0670). It is stripped by juzCheck.ts today, and
# that is a bug this file found: Warsh writes the alif of prolongation as a
# dagger where Hafs writes a full alif, so deleting it turns a correct
# Warsh spelling into a word that matches nothing. It is folded to a plain
# alif below instead.
MARKS = re.compile(
    '[ؐ-ًؚ-ٟۖ-ۭ'
    '࣓-ࣿـ‌-‏]'
)

DAGGER_ALIF = 'ٰ'
PLAIN_ALIF = 'ا'

# Alif in all its spellings: madda, hamza above and below, wasla, and the
# three high-hamza forms.
ALIF = re.compile('[آأإٱٲٳٵ]')

# Ya, alif maqsura, farsi ya, yeh barree, and e.
#
# U+06D2 (yeh barree) is the second thing this file found: Warsh ends words
# with it where Hafs uses a plain ya, so without it every such word missed.
YA = re.compile('[ىیےې]')
PLAIN_YA = 'ي'

# Bare and seated hamza carry no consonant of their own here.
HAMZA = re.compile('[ؤئء]')

TA_MARBUTA = 'ة'
HA = 'ه'

# Anything that is not Arabic or a space: digits, punctuation, the ayah
# marker glyphs a published mushaf carries.
NON_ARABIC = re.compile('[^؀-ۿ\\s]')

# bism allah al-rahman al-rahim, as it reads AFTER skeleton() — which means
# with the dagger alif of al-rahman already folded to a full one.
BASMALAH = re.compile(
    '^بسم\\s*'
    'الله\\s*'
    'الرحما?ن\\s*'
    'الرحيم\\s*'
)


def skeleton(text: str) -> str:
    t = MARKS.sub('', text)
    t = t.replace(DAGGER_ALIF, PLAIN_ALIF)
    t = ALIF.sub(PLAIN_ALIF, t)
    t = YA.sub(PLAIN_YA, t)
    t = HAMZA.sub('', t)
    t = t.replace(TA_MARBUTA, HA)
    t = NON_ARABIC.sub('', t)
    return re.sub(r'\s+', ' ', t).strip()


def strip_basmalah(bare: str) -> str:
    return BASMALAH.sub('', bare).strip()


def vocabulary_overlap(reference: str, candidate: str) -> float:
    ref_words = [w for w in reference.split(' ') if w]
    if not ref_words:
        return 0.0
    pool: dict = {}
    for w in candidate.split(' '):
        if w:
            pool[w] = pool.get(w, 0) + 1
    kept = 0
    for w in ref_words:
        if pool.get(w, 0) > 0:
            pool[w] -= 1
            kept += 1
    return kept / len(ref_words)


def self_test() -> None:
    """Known transformations. If a class reordered on disk, this fails here."""
    # al-hamdu lillahi rabbi l-alamin, vowelled, reduces to six bare words.
    vowelled = (
        'اَلْحَمْدُ لِلَّهِ'
    )
    assert skeleton(vowelled) == 'الحمد لله', skeleton(vowelled)
    # yeh barree folds to ya: fi -> fy
    assert skeleton('فے') == 'في'
    # dagger alif becomes a full alif: 'aynan written short == written long
    assert skeleton('عينٰن') == skeleton('عينان')
    # ta marbuta reads as ha
    assert skeleton('رحمة') == 'رحمه'
    # the ayah marker glyph is not a word
    assert skeleton('فے ﴾') == 'في'
    assert vocabulary_overlap('a b c d', 'a b') == 0.5
    assert vocabulary_overlap('', 'anything') == 0.0


self_test()
