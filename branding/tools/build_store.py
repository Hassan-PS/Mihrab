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
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from compose import compose, compose_landscape  # noqa: E402
from PIL import Image  # noqa: E402

# Keyed by the part of the file name after the number, so the same screen
# can sit at a different position in different sets — the tablet has no
# tasbih panel and its journal is number five, the phone's is number six.
# The number is still what fixes the running order on the product page.  The wording carries over from the
# 6.3"/6.5" sets that are live today; only the two new panels are new copy.
# "\\n" inside a headline is a deliberate line break.
CAPTIONS = {
    "home": (
        "Prayer times\\nyou can trust",
        "Fifteen calculation methods, a year stored offline",
    ),
    "mushaf": (
        "The Madinah mushaf,\\npage for page",
        "All 604 pages, recitation that follows each word",
    ),
    "spread": (
        "The mushaf,\\nas it falls open",
        "Two facing pages, exactly as the Madinah print sets them",
    ),
    "month": (
        "The whole month\\nat a glance",
        "Every day's times in one table, ready offline",
    ),
    "duas": (
        "Daily duas,\\nalways to hand",
        "Morning, evening and after prayer",
    ),
    "tasbih": (
        "A quiet tasbih counter",
        "Keep your dhikr count without leaving the app",
    ),
    "journal": (
        "Your prayer journal",
        "Every prayer logged, encrypted on your device",
    ),
    "qibla": (
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
        "raw_size": (1320, 2868),
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
        "raw_size": (2064, 2752),
        "size": (2064, 2752),
        "radius": 0.030,
        "device_w": 0.74,
        "device_top": 0.355,
    },
    {
        # Play caps a screenshot's long side at twice its short side, so the
        # phone's own 1080x2400 (2.22) cannot be uploaded as-is and the panel
        # is composed at 1080x2160 (exactly 2.00). The raw shots go to F-Droid
        # instead, which shows real screenshots rather than marketing panels.
        "name": "Android phone",
        "src": "branding/store/play",
        "raw_size": (1080, 2400),
        "previews": "branding/play-previews",
        "upload": None,
        "fdroid": "fastlane/metadata/android/en-US/images/phoneScreenshots",
        "size": (1080, 2160),
        "radius": 0.050,
        "device_w": 0.62,
        "device_top": 0.290,
    },
    {
        # A tablet is held in landscape and Play wants 16:9 or 9:16 exactly,
        # so these are the only panels built sideways. 1440 on the short side
        # clears Play's 1080 floor with room to spare.
        "name": "Android tablet",
        "src": "branding/store/play-tablet",
        "raw_size": (2560, 1600),
        "previews": "branding/play-previews-tablet",
        "upload": None,
        "fdroid": "fastlane/metadata/android/en-US/images/tenInchScreenshots",
        "size": (2560, 1440),
        "landscape": True,
        "radius": 0.022,
        "device_w": 0.66,
        "device_top": None,
    },
]


def check(path, size):
    im = Image.open(path)
    if im.size != size:
        raise SystemExit("%s is %s, expected %s" % (path, im.size, size))
    if im.mode != "RGB":
        raise SystemExit("%s carries an alpha channel; the stores reject those" % path)


def empty(path, suffixes):
    os.makedirs(path, exist_ok=True)
    for stale in sorted(os.listdir(path)):
        if stale.lower().endswith(suffixes):
            os.remove(os.path.join(path, stale))


def build(spec):
    src = os.path.join(ROOT, spec["src"])
    previews = os.path.join(ROOT, spec["previews"])
    empty(previews, (".png",))
    upload = spec.get("upload")
    if upload:
        upload = os.path.join(ROOT, upload)
        empty(upload, (".png", ".jpg", ".jpeg"))
    fdroid = spec.get("fdroid")
    if fdroid:
        fdroid = os.path.join(ROOT, fdroid)
        empty(fdroid, (".png", ".jpg", ".jpeg"))
    W, H = spec["size"]
    # Numbered files only: the Play folder also holds the feature graphic and
    # the icon, which are assets rather than panels.
    shots = sorted(f for f in os.listdir(src) if re.match(r"^\d\d_.*\.png$", f))
    if not shots:
        raise SystemExit("no screenshots in " + src)
    for shot in shots:
        key = os.path.splitext(shot)[0]
        screen = key.split("_", 1)[1] if "_" in key else key
        if screen not in CAPTIONS:
            raise SystemExit("no caption for " + screen)
        headline, subhead = CAPTIONS[screen]
        raw = os.path.join(src, shot)
        check(raw, spec["raw_size"])
        out = os.path.join(previews, shot)
        if spec.get("landscape"):
            compose_landscape(
                raw,
                out,
                W,
                H,
                headline,
                subhead,
                screen_radius_frac=spec["radius"],
                device_h_frac=spec["device_w"],
                device_x_frac=spec["device_top"],
            )
        else:
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
        if upload:
            jpg = os.path.join(upload, key + ".jpg")
            Image.open(out).convert("RGB").save(jpg, quality=92, subsampling=0)
        if fdroid:
            # F-Droid orders by file name and shows the shot itself, so the
            # raw capture goes across under a plain 1-based name.
            n = key.split("_", 1)
            plain = "%d_%s.png" % (int(n[0]), n[1]) if n[0].isdigit() else shot
            Image.open(raw).convert("RGB").save(os.path.join(fdroid, plain))
    went = [d for d in (spec["previews"], spec.get("upload"), spec.get("fdroid")) if d]
    print("%s: %d panels -> %s" % (spec["name"], len(shots), ", ".join(went)))




def android_assets():
    """Feature graphic and icon: Play's two non-screenshot assets, and the
    same two files F-Droid reads out of the fastlane tree."""
    from compose_wide import feature_graphic

    play = os.path.join(ROOT, "branding/store/play")
    home = os.path.join(play, "01_home.png")
    fg = os.path.join(play, "feature-graphic-1024x500.png")
    icon = os.path.join(play, "icon-512.png")
    feature_graphic(fg, home)
    images = os.path.join(ROOT, "fastlane/metadata/android/en-US/images")
    os.makedirs(images, exist_ok=True)
    # 24-bit, no alpha: Play rejects an alpha channel on the feature graphic.
    Image.open(fg).convert("RGB").save(os.path.join(images, "featureGraphic.png"))
    # 32-bit with an opaque alpha channel, which is what Play asks for.
    Image.open(icon).convert("RGBA").save(os.path.join(images, "icon.png"))
    print("Android assets: feature graphic + icon -> branding/store/play, %s" % images[len(ROOT) + 1 :])


if __name__ == "__main__":
    for spec in SETS:
        build(spec)
    android_assets()
