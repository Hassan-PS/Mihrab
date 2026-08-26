#!/usr/bin/env python3
"""Talk to Xcode Cloud from the terminal, because the web UI is the only other
way to know whether a release is actually building.

    ./scripts/xcode-cloud.py runs [n]      # recent build runs, newest first
    ./scripts/xcode-cloud.py start         # start the Default workflow on main
                                           #   (refuses if one is already running)
    ./scripts/xcode-cloud.py why <run-id>  # non-warning issues of a failed run

WHY THIS EXISTS. A release cut assumed that pushing a tag started an App Store
build. It does not — there is one workflow and it starts on `main` — and on
2026-08-07 the push trigger did not fire either: `main` moved and no run
appeared for half an hour. A run started by hand picked up the same commit and
succeeded. Nothing in the repo could see any of that, so the release was
reported finished while the iOS channel had quietly not started.

CREDENTIALS. The same App Store Connect API key notarytool uses. Nothing here
is written down in the repo — export these first, or put them in
~/.config/mihrab/asc.json as {"keyPath":…, "keyId":…, "issuerId":…}:

    export ASC_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
    export ASC_KEY_ID=XXXXXXXXXX
    export ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Requires `pyjwt`, `cryptography` and `certifi`.
"""
import json
import os
import pathlib
import ssl
import sys
import time
import urllib.error
import urllib.request

import certifi
import jwt

BASE = "https://api.appstoreconnect.apple.com"
CTX = ssl.create_default_context(cafile=certifi.where())
CONFIG = pathlib.Path.home() / ".config" / "mihrab" / "asc.json"


def credentials() -> dict:
    cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
    creds = {
        "keyPath": os.environ.get("ASC_KEY_PATH") or cfg.get("keyPath"),
        "keyId": os.environ.get("ASC_KEY_ID") or cfg.get("keyId"),
        "issuerId": os.environ.get("ASC_ISSUER_ID") or cfg.get("issuerId"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        sys.exit(f"missing credentials: {', '.join(missing)} — see the header of this file")
    return creds


def token() -> str:
    creds = credentials()
    now = int(time.time())
    return jwt.encode(
        {"iss": creds["issuerId"], "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
        pathlib.Path(creds["keyPath"]).read_text(),
        algorithm="ES256",
        headers={"kid": creds["keyId"], "typ": "JWT"},
    )


def call(path: str, body: dict | None = None):
    req = urllib.request.Request(
        path if path.startswith("http") else BASE + path,
        data=json.dumps(body).encode() if body else None,
        headers={
            "Authorization": "Bearer " + token(),
            **({"Content-Type": "application/json"} if body else {}),
        },
        method="POST" if body else "GET",
    )
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        sys.exit(f"HTTP {err.code}: {err.read().decode()[:1000]}")


def product() -> str:
    products = call("/v1/ciProducts?limit=10")["data"]
    if len(products) != 1:
        names = ", ".join(p["attributes"].get("name", "?") for p in products)
        sys.exit(f"expected exactly one Xcode Cloud product, found {len(products)}: {names}")
    return products[0]["id"]


def default_workflow(prod: str) -> str:
    for wf in call(f"/v1/ciProducts/{prod}/workflows?limit=20")["data"]:
        if wf["attributes"].get("name") == "Default":
            return wf["id"]
    sys.exit("no workflow named Default")


def runs(limit: str = "5") -> None:
    data = call(f"/v1/ciProducts/{product()}/buildRuns?limit={limit}&sort=-number")
    for run in data["data"]:
        a = run["attributes"]
        commit = a.get("sourceCommit") or {}
        message = (commit.get("message") or "").splitlines()
        print(
            f"#{a.get('number')} {a.get('executionProgress')}/{a.get('completionStatus')}"
            f"  {a.get('startedDate')}  {a.get('startReason')}"
            f"  {(commit.get('commitSha') or '')[:8]}"
            f"  {message[0][:58] if message else ''}"
            f"  id={run['id']}"
        )


def in_flight() -> list:
    """Runs App Store Connect still considers live."""
    data = call(f"/v1/ciProducts/{product()}/buildRuns?limit=5&sort=-number")
    return [
        run
        for run in data["data"]
        if run["attributes"].get("executionProgress") in ("PENDING", "RUNNING")
    ]


def start(force: str | None = None) -> None:
    """Start the Default workflow — unless one is already running.

    TWO CONCURRENT RUNS DO NOT RACE, THEY BOTH DIE. On 2026-08-26 a release
    cut started a run by hand while the push trigger's run was still going,
    and App Store Connect failed BOTH with

        An update has been initiated by another request and is currently
        being processed. Please try again later.

    which reads like a transient hiccup and is not — it is the archive step
    refusing to run twice for one product. The iOS channel came out of that
    release with two failed runs, and was saved only by a later commit
    happening to trigger a third.

    Starting by hand is still the habit worth keeping: the push trigger has
    silently not fired before (2026-08-07), which is the whole reason this
    script exists. So this does not stop you starting one — it stops you
    starting a SECOND one, which never helps and reliably kills the first.
    """
    live = in_flight()
    if live and force != "--force":
        for run in live:
            a = run["attributes"]
            commit = (a.get("sourceCommit") or {}).get("commitSha") or ""
            print(
                f"already in flight: #{a.get('number')} {a.get('executionProgress')}"
                f"  {a.get('startReason')}  {commit[:8]}"
            )
        print("not starting another — a second run fails both. Watch it with:")
        print("  ./scripts/xcode-cloud.py runs 3")
        print("Really want one anyway? ./scripts/xcode-cloud.py start --force")
        raise SystemExit(1)
    out = call(
        "/v1/ciBuildRuns",
        {
            "data": {
                "type": "ciBuildRuns",
                "relationships": {
                    "workflow": {"data": {"type": "ciWorkflows", "id": default_workflow(product())}}
                },
            }
        },
    )
    a = out["data"]["attributes"]
    print(f"started run {a.get('number')} ({a.get('executionProgress')}) id={out['data']['id']}")


def why(run_id: str) -> None:
    for act in call(f"/v1/ciBuildRuns/{run_id}/actions")["data"]:
        a = act["attributes"]
        print(f"== {a.get('name')}: {a.get('executionProgress')}/{a.get('completionStatus')}")
        if a.get("completionStatus") in (None, "SUCCEEDED", "SKIPPED"):
            continue
        url = f"/v1/ciBuildActions/{act['id']}/issues?limit=200"
        while url:
            page = call(url)
            for issue in page["data"]:
                ia = issue["attributes"]
                if ia.get("issueType") == "WARNING":
                    continue
                print(f"   [{ia.get('issueType')}] {(ia.get('message') or '')[:600]}")
            url = page.get("links", {}).get("next")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "runs"
    if cmd == "runs":
        runs(*sys.argv[2:3])
    elif cmd == "start":
        start(*sys.argv[2:3])
    elif cmd == "why":
        why(sys.argv[2])
    else:
        sys.exit(__doc__)
