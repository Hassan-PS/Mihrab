#!/usr/bin/env python3
"""Apply the App Store search metadata — subtitle, keywords, marketing URL.

    ./scripts/appstore-metadata.py            # apply, if the listing is editable
    ./scripts/appstore-metadata.py --dry-run  # say what would change

WHY THIS EXISTS. Apple indexes the app NAME, the SUBTITLE and the KEYWORDS
field together, and ranks on all three. This app shipped for a year with
the subtitle empty — thirty indexed characters unused — and 65 of the 100
keyword characters spent, several of them on words the name already
carried, which Apple counts once. A US App Store search for "mihrab"
returns ten apps called Mihrab and this was not among them.

The values below are chosen so that no word repeats between name,
subtitle and keywords:

    name      Mihrab: The Muslim Companion
    subtitle  Prayer Times, Adhan & Quran
    keywords  salah namaz islamic qibla athan azan masjid hijri ramadan
              fasting dua tasbih dhikr mushaf widget

WHEN IT CAN RUN. Version metadata is frozen while a version is in review.
This refuses rather than fighting Apple for it: submit, wait for the
verdict, then run this against the next editable version.
"""
import importlib.util
import json
import pathlib
import ssl
import sys
import urllib.error
import urllib.request

_spec = importlib.util.spec_from_file_location(
    "xc", pathlib.Path(__file__).with_name("xcode-cloud.py")
)
xc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(xc)

BUNDLE_ID = "com.hassan.prayerapp"
LOCALE = "en-US"

SUBTITLE = "Prayer Times, Adhan & Quran"
KEYWORDS = (
    "salah,namaz,islamic,qibla,athan,azan,masjid,hijri,"
    "ramadan,fasting,dua,tasbih,dhikr,mushaf,widget"
)
MARKETING_URL = "https://mihrab.elghamri.se/"

# Apple's editable states. Anything else — WAITING_FOR_REVIEW, IN_REVIEW,
# PENDING_DEVELOPER_RELEASE, READY_FOR_SALE — is frozen.
EDITABLE = {
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
    "INVALID_BINARY",
}


def patch(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        xc.BASE + path,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": "Bearer " + xc.token(),
            "Content-Type": "application/json",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, context=xc.CTX) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        sys.exit(f"HTTP {err.code}: {err.read().decode()[:800]}")


def main(dry: bool) -> None:
    if len(SUBTITLE) > 30:
        sys.exit(f"subtitle is {len(SUBTITLE)} chars, Apple's limit is 30")
    if len(KEYWORDS) > 100:
        sys.exit(f"keywords are {len(KEYWORDS)} chars, Apple's limit is 100")

    app = next(
        (a for a in xc.call("/v1/apps?limit=10")["data"]
         if a["attributes"].get("bundleId") == BUNDLE_ID),
        None,
    )
    if app is None:
        sys.exit(f"no app with bundle id {BUNDLE_ID}")
    aid = app["id"]

    info = next(
        (i for i in xc.call(f"/v1/apps/{aid}/appInfos?limit=5")["data"]
         if i["attributes"].get("state") in EDITABLE),
        None,
    )
    ver = next(
        (v for v in xc.call(f"/v1/apps/{aid}/appStoreVersions?limit=5")["data"]
         if v["attributes"].get("appStoreState") in EDITABLE),
        None,
    )
    if info is None or ver is None:
        states = [
            v["attributes"].get("appStoreState")
            for v in xc.call(f"/v1/apps/{aid}/appStoreVersions?limit=3")["data"]
        ]
        print("nothing to edit — the listing is frozen. Versions: "
              + ", ".join(s or "?" for s in states))
        print("Metadata unlocks when the version leaves review, or when you "
              "create the next one. Nothing was changed.")
        raise SystemExit(3)

    vs = ver["attributes"].get("versionString")
    il = next(
        l for l in xc.call(f"/v1/appInfos/{info['id']}/appInfoLocalizations?limit=20")["data"]
        if l["attributes"].get("locale") == LOCALE
    )
    vl = next(
        l for l in xc.call(
            f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations?limit=20"
        )["data"]
        if l["attributes"].get("locale") == LOCALE
    )

    changes = [
        ("subtitle", il["attributes"].get("subtitle"), SUBTITLE),
        ("keywords", vl["attributes"].get("keywords"), KEYWORDS),
        ("marketingUrl", vl["attributes"].get("marketingUrl"), MARKETING_URL),
    ]
    print(f"version {vs} ({ver['attributes'].get('appStoreState')}), locale {LOCALE}")
    for field, was, now in changes:
        print(f"  {field}: {was!r}\n    -> {now!r}" if was != now
              else f"  {field}: already correct")
    if dry:
        print("\n--dry-run: nothing written.")
        return
    if all(was == now for _, was, now in changes):
        print("\nnothing to do.")
        return

    patch(f"/v1/appInfoLocalizations/{il['id']}", {
        "data": {"type": "appInfoLocalizations", "id": il["id"],
                 "attributes": {"subtitle": SUBTITLE}},
    })
    patch(f"/v1/appStoreVersionLocalizations/{vl['id']}", {
        "data": {"type": "appStoreVersionLocalizations", "id": vl["id"],
                 "attributes": {"keywords": KEYWORDS, "marketingUrl": MARKETING_URL}},
    })
    print("\nwritten. They take effect when this version is submitted and approved.")


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
