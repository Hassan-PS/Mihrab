#!/usr/bin/env python3
"""
Build android/app/src/main/assets/fonts/MihrabMedallion.ttf — issue #16.

One glyph per ayah number, 1 to 286, each the whole medallion: AmiriQuran's
U+06DD rosette with the font's own small digits (the ones its `rlig` sets
inside it) placed where the font places them. Mapped at U+E000 + n, in the
Private Use Area.

WHY. The number inside the rosette was the font's shaping: U+06DD followed by
digits becomes rosette-with-number only while the platform shapes the mark and
its digits as one run in AmiriQuran. On an EMUI phone with its own font engine
that did not hold, and nothing an app sets reaches below an OEM font engine.
A code point that maps straight to a finished glyph needs no shaping at all —
the cmap lookup is the whole job — and a PUA code point cannot be answered by
any system font, so it is this glyph or nothing.

The outlines are AmiriQuran's own (SIL OFL 1.1). This is a derived font under
the same licence, and not named "Amiri", which the OFL reserves.

    pip install fonttools
    python3 scripts/gen-medallion-font.py
"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'fonts')
SRC = os.path.join(FONTS, 'AmiriQuran.ttf')
OUT = os.path.join(FONTS, 'MihrabMedallion.ttf')

PUA_BASE = 0xE000
MAX_AYAH = 286            # al-Baqarah, the longest surah
FIRST_SMALL_DIGIT = 1233  # HarfBuzz: U+06DD + '١' shapes to glyph 1234

src = TTFont(SRC)
order = src.getGlyphOrder()
src_glyphs = src.getGlyphSet()
upm = src['head'].unitsPerEm
advance = src['hmtx']['uni06DD'][0]
digit_advance = src['hmtx'][order[FIRST_SMALL_DIGIT + 1]][0]
nbsp_advance = src['hmtx'][src.getBestCmap()[0x00A0]][0]


def simple(name):
    # Some of the source glyphs are themselves composites; flatten them so
    # this font carries only its own glyphs.
    rec = DecomposingRecordingPen(src_glyphs)
    src_glyphs[name].draw(rec)
    pen = TTGlyphPen(None)
    rec.replay(pen)
    return pen.glyph()


glyph_order = ['.notdef', 'space', 'nbsp', 'rosette'] + [f'digit{d}' for d in range(10)]
glyphs = {
    '.notdef': TTGlyphPen(None).glyph(),
    'space': TTGlyphPen(None).glyph(),
    'nbsp': TTGlyphPen(None).glyph(),
    'rosette': simple('uni06DD'),
}
metrics = {
    '.notdef': (advance, 0),
    'space': (nbsp_advance, 0),
    'nbsp': (nbsp_advance, 0),
    'rosette': (advance, 0),
}
for d in range(10):
    glyphs[f'digit{d}'] = simple(order[FIRST_SMALL_DIGIT + d])
    metrics[f'digit{d}'] = (digit_advance, 0)

cmap = {0x0020: 'space', 0x00A0: 'nbsp'}
for n in range(1, MAX_AYAH + 1):
    name = f'ayah{n}'
    digits = [int(c) for c in str(n)]  # numerals run left to right
    start = advance / 2 - len(digits) * digit_advance / 2
    pen = TTGlyphPen(glyphs)
    pen.addComponent('rosette', (1, 0, 0, 1, 0, 0))
    for i, d in enumerate(digits):
        pen.addComponent(f'digit{d}', (1, 0, 0, 1, round(start + i * digit_advance), 0))
    glyphs[name] = pen.glyph()
    metrics[name] = (advance, 0)
    glyph_order.append(name)
    cmap[PUA_BASE + n] = name

fb = FontBuilder(upm, isTTF=True)
fb.setupGlyphOrder(glyph_order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
# Composite bounds and lsb are recalculated from the components on save.
fb.setupHorizontalMetrics(metrics)
hhea = src['hhea']
fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
os2 = src['OS/2']
fb.setupOS2(
    sTypoAscender=os2.sTypoAscender,
    sTypoDescender=os2.sTypoDescender,
    sTypoLineGap=os2.sTypoLineGap,
    usWinAscent=os2.usWinAscent,
    usWinDescent=os2.usWinDescent,
)
fb.setupNameTable({
    'familyName': 'MihrabMedallion',
    'styleName': 'Regular',
    'uniqueFontIdentifier': 'MihrabMedallion-Regular',
    'fullName': 'MihrabMedallion Regular',
    'psName': 'MihrabMedallion-Regular',
    'version': 'Version 1.000',
    'copyright': 'Outlines from Amiri Quran, Copyright 2010-2022 The Amiri Project Authors (https://github.com/aliftype/amiri)',
    'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
    'licenseInfoURL': 'https://openfontlicense.org',
})
fb.setupPost()
fb.setupHead(unitsPerEm=upm)
fb.save(OUT)

check = TTFont(OUT)
assert check.getBestCmap()[PUA_BASE + 286] == 'ayah286'
print(f'wrote {OUT} ({os.path.getsize(OUT)} bytes, {MAX_AYAH} medallions)')
