#!/usr/bin/env python3
"""Build the App Store screenshot + preview sets.

Raw screenshots live in branding/store/<device>/ at the exact pixel size App
Store Connect asks for.  This script turns each raw shot into the captioned
marketing image that goes on the product page, and drops a JPEG copy into the
fastlane folder the images are uploaded from.

  iPhone 6.9"  1320 x 2868   branding/store/ios-6.9   -> branding/store-previews
                                                      -> fastlane/screenshots/ios/6.9
  iPad 13"     2064 x 2752   branding/store/ipad-13   -> branding/store-previews-ipad
                                                      -> fastlane/screenshots/ipad/13

Both sizes are the ones Apple currently requires: 6.9" is the mandatory
iPhone slot and 13" the mandatory iPad one.  Smaller classes are optional and
App Store Connect scales these down for them, so no 6.5" set is kept.

Run from anywhere:  python3 branding/tools/build_store.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from compose import compose  # noqa: E402
from PIL import Image  # noqa: E402

# Keyed by the raw screenshot's file name, so the numbering fixes the order
# the panels appear in on the product page.  The wording carries over from the
# 6.3"/6.5" sets that are live today; only the two new panels are new copy.
# "\\n" inside a headline is a deliberate line break.
CAPTIONS = {
    "01_home": (
        "Prayer times\\nyou can trust",
        "Fifteen calculation methods, a year stored offline",
    ),
    "02_mushaf": (
        "The Madinah mushaf,\\npage for page",
        "All 604 pages, recitation that follows each word",
    ),
    "03_month": (
        "The whole month\\nat a glance",
        "Every day's times in one table, ready offline",
    ),
    "04_duas": (
        "Daily duas,\\nalways to hand",
        "Morning, evening and after prayer",
    ),
    "05_tasbih": (
        "A quiet tasbih counter",
        "Keep your dhikr count without leaving the app",
    ),
    "06_journal": (
        "Your prayer journal",
        "Every prayer logged, encrypted on your device",
    ),
    "07_qibla": (
        "Always toward\\nthe Ka'bah",
        "A live bearing from your device's own sensors",
    ),
}

SETS = [
    {
        "name": 'iPhone 6.9"',
        "src": "branding/store/ios-6.9",
        "previews": "branding/store-previews",
        "upload": "fastlane/screenshots/ios/6.9",
        "size": (1320, 2868),
        "radius": 0.062,
        "device_w": 0.66,
        "device_top": 0.300,
    },
    {
        "name": 'iPad 13"',
        "src": "branding/store/ipad-13",
        "previews": "branding/store-previews-ipad",
        "upload": "fastlane/screenshots/ipad/13",
        "size": (2064, 2752),
        "radius": 0.030,
        "device_w": 0.74,
        "device_top": 0.355,
    },
]


def check(path, size):
    im = Image.open(path)
    if im.size != size:
        raise SystemExit("%s is %s, expected %s" % (path, im.size, size))
    if im.mode != "RGB":
        raise SystemExit("%s carries an alpha channel; App Store Connect rejects those" % path)


def empty(path, suffixes):
    os.makedirs(path, exist_ok=True)
    for stale in sorted(os.listdir(path)):
        if stale.lower().endswith(suffixes):
            os.remove(os.path.join(path, stale))


def build(spec):
    src = os.path.join(ROOT, spec["src"])
    previews = os.path.join(ROOT, spec["previews"])
    upload = os.path.join(ROOT, spec["upload"])
    empty(previews, (".png",))
    empty(upload, (".png", ".jpg", ".jpeg"))
    W, H = spec["size"]
    shots = sorted(f for f in os.listdir(src) if f.endswith(".png"))
    if not shots:
        raise SystemExit("no screenshots in " + src)
    for shot in shots:
        key = os.path.splitext(shot)[0]
        if key not in CAPTIONS:
            raise SystemExit("no caption for " + key)
        headline, subhead = CAPTIONS[key]
        raw = os.path.join(src, shot)
        check(raw, (W, H))
        out = os.path.join(previews, shot)
        compose(
            raw,
            out,
            W,
            H,
            headline,
            subhead,
            screen_radius_frac=spec["radius"],
            device_w_frac=spec["device_w"],
            device_top_frac=spec["device_top"],
        )
        jpg = os.path.join(upload, key + ".jpg")
        Image.open(out).convert("RGB").save(jpg, quality=92, subsampling=0)
    print("%s: %d panels -> %s and %s" % (spec["name"], len(shots), spec["previews"], spec["upload"]))


if __name__ == "__main__":
    for spec in SETS:
        build(spec)
