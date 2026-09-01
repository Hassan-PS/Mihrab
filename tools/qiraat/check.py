"""
Does a Quranpedia mushaf hold up? — run before trusting one in the app.

Usage:  python3 tools/qiraat/check.py /tmp/qp-4.json

Checks, in order, and says which fails:

  1. skeleton() is not broken. A reordered character class silently empties
     every verse and then every later check passes vacuously, so this runs
     first and refuses to continue if the bundled Hafs text does not come
     back as recognisable words.
  2. Shape: 114 surahs, no gaps, no empty text, pages 1..604 forward with
     none skipped, juz forward and complete.
  3. `number_in_hafs` — SURAH-LOCAL Hafs ayah numbers, one or more per
     ayah — must cover each surah's Hafs ayahs exactly once, in order. A
     riwayah may merge Hafs ayahs (a list of 2 or 3) or split one (the same
     Hafs number claimed by consecutive ayahs); both are ordinary, and both
     have to add up.
  4. Content: every ayah read against the Hafs ayahs it claims to be. Not
     sixty anchors — all of them.
"""
import json
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skeleton import BASMALAH, skeleton, strip_basmalah, vocabulary_overlap  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SURAH_DIR = os.path.join(ROOT, 'src', 'quran', 'data', 'surahs')

FAILURES = []


def check(label, ok, detail=''):
    print(f"  [{'ok ' if ok else 'FAIL'}] {label}{'  — ' + detail if detail else ''}")
    if not ok:
        FAILURES.append(label)
    return ok


def hafs_text():
    """Bundled Tanzil Hafs, keyed (surah, ayah), reduced to its skeleton.

    The basmalah the bundled files prefix to ayah 1 is left ON here and
    dealt with at comparison time, because whether it belongs to the ayah
    is a question about the riwayah being checked, not about Hafs: the
    Kufan count makes it ayah 1 of al-Fatihah, the Madani count does not.
    """
    out = {}
    for s in range(1, 115):
        with open(os.path.join(SURAH_DIR, f'{s:03d}.json'), encoding='utf-8') as f:
            arabic = json.load(f)['arabic']
        for a, text in enumerate(arabic, 1):
            out[(s, a)] = skeleton(text)
    return out


def main(path):
    with open(path, encoding='utf-8') as f:
        m = json.load(f)
    rawi = (m.get('rawi') or {}).get('name', '?')
    count = (((m.get('rawi') or {}).get('qiraa') or {}).get('count') or {}).get('name', '?')
    print(f"\n{m.get('name')}  (rawi {rawi}, count {count})\n")

    hafs = hafs_text()
    hafs_len = {s: sum(1 for k in hafs if k[0] == s) for s in range(1, 115)}

    # 1 ── the measuring stick itself
    sample = hafs[(2, 255)]
    check('skeleton() returns words, not nothing',
          len(sample.split()) > 20, f'ayat al-kursi reduced to {len(sample.split())} words')
    if FAILURES:
        return 1

    surahs = m['surahs']
    ayahs = [(s['id'], a) for s in surahs for a in s['ayahs']]

    # 2 ── shape
    check('114 surahs', len(surahs) == 114, f'{len(surahs)}')
    numbering_ok = all(
        [a['number'] for a in s['ayahs']] == list(range(1, len(s['ayahs']) + 1))
        for s in surahs
    )
    check('ayah numbers run 1..n in every surah with no gaps', numbering_ok)
    check('no empty text', all(a.get('text', '').strip() for _, a in ayahs))

    pages = [a['page_number'] for _, a in ayahs]
    check('pages never go backwards', all(b >= a for a, b in zip(pages, pages[1:])))
    check('every page has an ayah on it',
          set(pages) == set(range(1, max(pages) + 1)), f'{max(pages)} pages')
    blank = [f"{s}:{a['number']}" for s, a in ayahs if not a.get('juz')]
    check('every ayah says which juz it is in', not blank,
          f'{len(blank)} with juz 0: {", ".join(blank[:6])}'
          f'{" …" if len(blank) > 6 else ""}')
    real = [a['juz'] for _, a in ayahs if a.get('juz')]
    check('juz never go backwards (ignoring the blanks)',
          all(b >= a for a, b in zip(real, real[1:])))
    check('juz 1..30 all present', set(real) == set(range(1, 31)))

    # 3 ── the numbering bridge
    missing = [f'{s}:{a["number"]}' for s, a in ayahs if not a.get('number_in_hafs')]
    if not check('every ayah carries number_in_hafs', not missing,
                 f'{len(missing)} without, e.g. {missing[:3]}'):
        return 1

    bad = []
    for s_ in surahs:
        seen = []
        for a in s_['ayahs']:
            n = a['number_in_hafs']
            seen.extend(n if isinstance(n, list) else [n])
        # Ordered, and covering 1..hafs_len(surah). A repeat is how a SPLIT
        # is expressed — two riwayah ayahs claiming one Hafs ayah — so the
        # distinct run is what must be complete, not the raw one.
        distinct = sorted(set(seen))
        if seen != sorted(seen) or distinct != list(range(1, hafs_len[s_['id']] + 1)):
            bad.append(f"surah {s_['id']}: covers {len(distinct)}, Hafs has {hafs_len[s_['id']]}")
    check('number_in_hafs covers every Hafs ayah of every surah, in order',
          not bad, '; '.join(bad[:5]))

    # 4 ── content, in the groups the two numberings actually share
    #
    # Comparing ayah to ayah is wrong wherever the numbering differs, which
    # is the whole point of this file. A riwayah that SPLITS a Hafs ayah
    # gives each half only part of the reference's words, and a half scores
    # ~45% against the whole — which reads like corruption and is not.
    #
    # So the unit of comparison is the smallest span where the two
    # numberings agree: consecutive ayahs are pulled into one group until
    # the Hafs ayahs they claim are used up. Merges and splits both come
    # out whole, and nothing is judged against a reference it is only part
    # of.
    def refs_of(a):
        n = a['number_in_hafs']
        return set(n if isinstance(n, list) else [n])

    groups = []
    i = 0
    while i < len(ayahs):
        surah = ayahs[i][0]
        refs = refs_of(ayahs[i][1])
        group = [ayahs[i]]
        j = i + 1
        # Absorb the next ayah while it is still laying claim to a Hafs
        # ayah this group has already started — that is what a split looks
        # like from this side, and half an ayah must never be judged
        # against the whole of one.
        while j < len(ayahs) and ayahs[j][0] == surah and min(refs_of(ayahs[j][1])) <= max(refs):
            refs |= refs_of(ayahs[j][1])
            group.append(ayahs[j])
            j += 1
        groups.append((group, sorted(refs)))
        i = j

    split = sum(1 for g, _ in groups if len(g) > 1)
    merge = sum(1 for _, r in groups if len(r) > 1)
    print(f'\n  {len(groups)} groups — {split} where this riwayah splits a Hafs ayah, '
          f'{merge} where it merges\n')

    worst, worst_at, total, low = 1.0, None, 0.0, []
    for group, refs in groups:
        s_ = group[0][0]
        wanted = ' '.join(hafs[(s_, i)] for i in refs if (s_, i) in hafs).strip()
        candidate = skeleton(' '.join(a['text'] for _, a in group))
        # The reference opens with a basmalah the candidate does not: this
        # riwayah does not count it as part of this ayah. That is a
        # difference in numbering, not in text, so it is not held against
        # the file. (Stripping it unconditionally is what once failed the
        # real Qur'an at 1:1 — al-Fatihah's first ayah IS the basmalah in
        # the Kufan count, and the reference would be left empty.)
        if BASMALAH.match(wanted) and not BASMALAH.match(candidate):
            stripped = strip_basmalah(wanted)
            if stripped:
                wanted = stripped
        if not wanted:
            continue
        got = vocabulary_overlap(wanted, candidate)
        total += got
        where = f"{s_}:{group[0][1]['number']}" + (f"-{group[-1][1]['number']}" if len(group) > 1 else '')
        if got < worst:
            worst, worst_at = got, where
        if got < 0.5:
            low.append((where, got, refs))
    mean = total / len(groups)
    check(f'all {len(groups)} groups read as the Hafs they claim to be',
          len(low) == 0, f'{len(low)} below 50%')
    print(f"\n  mean overlap {mean * 100:.2f}%   worst {worst * 100:.1f}% at {worst_at}")
    for where, got, refs in low[:12]:
        print(f'    {where} -> hafs {refs}: {got * 100:.0f}%')

    print(f"\n{'PASSED' if not FAILURES else 'FAILED: ' + ', '.join(FAILURES)}\n")
    return 0 if not FAILURES else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
