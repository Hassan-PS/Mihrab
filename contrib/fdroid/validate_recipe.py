#!/usr/bin/env python3
"""
Validate contrib/fdroid/com.prayer_times.yml against every known F-Droid CI
pitfall.  Run from the repo root:

    python3 contrib/fdroid/validate_recipe.py

Exit 0 on success, 1 if any ERRORs are found.

Rules enforced
──────────────
 1  Blank line between entries — exactly one (rewritemeta fails on 0 or 2)
 2  Python \\n in YAML scalars — literal backslash-n must survive (raw strings)
 3  Two ABIs → C++ timeout — arm64-v8a only for v2.3.9+ (vc>=167)
 4  org.gradle.parallel=true — causes C++ OOM (cmake exit 1)
 5  newArchEnabled=false — ReactRootProjectPlugin overrides it; no-op
 6  Line length ≥ 97 chars — rewritemeta wraps long lines, corrupting commands
 7  commit: must be a tag ref (vX.Y.Z), not a raw SHA
 8  Xmx value — 1536m only; 1g starves APK packager, 2g starves Metro
 9  CurrentVersion / CurrentVersionCode must match the latest Builds entry
10  Required gradle.properties lines present in new-template entries
11  Required app/build.gradle append lines present in new-template entries
12  npm ci flags — must include --ignore-scripts, --omit=dev, --omit=optional
13  patch-package reinstall step present
14  jvmToolchain(17) sed patch present
15  scanignore: node_modules present
16  ndk version consistent across all entries
"""

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed — run: pip install pyyaml")
    sys.exit(2)

YAML_PATH = Path("contrib/fdroid/com.prayer_times.yml")

# Entries at or above this versionCode must use the canonical new template.
NEW_TEMPLATE_MIN_VC = 167  # v2.3.9

REQUIRED_GRADLE_PROPS = [
    (r"org\.gradle\.java\.home=/usr/local/jdk21",
     "org.gradle.java.home=/usr/local/jdk21"),
    (r"react\.internal\.disableJavaVersionAlignment=true",
     "react.internal.disableJavaVersionAlignment=true"),
    (r"kotlin\.jvm\.target\.validation\.mode=IGNORE",
     "kotlin.jvm.target.validation.mode=IGNORE"),
    (r"reactNativeArchitectures=arm64-v8a",
     "reactNativeArchitectures=arm64-v8a"),
    (r"org\.gradle\.daemon=false",
     "org.gradle.daemon=false"),
    (r"org\.gradle\.jvmargs=-Xmx1536m",
     "org.gradle.jvmargs=-Xmx1536m"),
]

REQUIRED_BUILD_GRADLE_APPENDS = [
    (r"lint \{ checkReleaseBuilds false \}",
     "android { lint { checkReleaseBuilds false } }"),
    (r"minifyEnabled false",
     "android { buildTypes { release { minifyEnabled false } } }"),
]

REQUIRED_NPM_FLAGS = [
    "--no-audit",
    "--ignore-scripts",
    "--omit=optional",
    "--omit=dev",
]

FORBIDDEN_LINES = [
    ("org.gradle.parallel=true",
     "causes C++ OOM — all 10+ native module CMake builds run in parallel, "
     "exhausting RAM; OOM killer kills clang++ → cmake exit 1"),
    ("newArchEnabled=false",
     "ReactRootProjectPlugin.kt forcibly sets newArchEnabled=true on every "
     "subproject at config time; this flag is a no-op for C++ compilation"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(f"  ERROR  {msg}")


def warn(msg: str) -> None:
    warnings.append(f"  WARN   {msg}")


def prebuild_lines(entry: dict) -> list[str]:
    pb = entry.get("prebuild", [])
    if isinstance(pb, str):
        return [pb]
    return [str(x) for x in pb]


def prebuild_str(entry: dict) -> str:
    return "\n".join(prebuild_lines(entry))


def is_new_template(entry: dict) -> bool:
    return int(entry.get("versionCode", 0)) >= NEW_TEMPLATE_MIN_VC


# ─────────────────────────────────────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────────────────────────────────────

if not YAML_PATH.exists():
    print(f"File not found: {YAML_PATH}")
    print("Run from the repo root: python3 contrib/fdroid/validate_recipe.py")
    sys.exit(2)

raw = YAML_PATH.read_text()
raw_lines = raw.splitlines()

try:
    data = yaml.safe_load(raw)
except yaml.YAMLError as exc:
    print(f"YAML parse error: {exc}")
    sys.exit(1)

builds: list[dict] = data.get("Builds", [])
if not builds:
    print("No Builds entries found.")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Rule 1 — Blank line between entries (raw-text check)
# Every "ndk:" line must be followed by exactly one blank line.
# ─────────────────────────────────────────────────────────────────────────────

for i, line in enumerate(raw_lines):
    if not re.match(r"^\s+ndk:", line):
        continue

    remaining = raw_lines[i + 1:]
    if not remaining:
        continue

    # Count consecutive blank lines immediately after ndk:
    blanks = 0
    for after in remaining:
        if after.strip() == "":
            blanks += 1
        else:
            break

    if blanks == 0:
        err(f"Line {i + 1} ('ndk:'): zero blank lines before next entry — "
            "fdroid rewritemeta inserts one → file changed → CI fails")
    elif blanks >= 2:
        err(f"Line {i + 1} ('ndk:'): {blanks} blank lines before next entry — "
            "fdroid rewritemeta removes extras → file changed → CI fails")

# ─────────────────────────────────────────────────────────────────────────────
# Per-entry checks
# ─────────────────────────────────────────────────────────────────────────────

ndk_versions: set[str] = set()

for entry in builds:
    vn = entry.get("versionName", "?")
    vc = int(entry.get("versionCode", 0))
    label = f"v{vn} (vc={vc})"
    pb_lines = prebuild_lines(entry)
    pb = prebuild_str(entry)
    new_tmpl = is_new_template(entry)

    # ── Rule 2 — Python \n embedded in YAML scalars ──────────────────────────
    for pb_line in pb_lines:
        if "printf" in pb_line and "\n" in pb_line and "\\n" not in pb_line:
            err(f"{label}: printf line contains a real newline character — "
                "if generated via Python use r'...' raw strings")

    # ── Rule 3 — Two ABIs ────────────────────────────────────────────────────
    if new_tmpl and "armeabi-v7a" in pb:
        err(f"{label}: armeabi-v7a present — two-ABI C++ codegen exceeds "
            "the 1h CI timeout; arm64-v8a only for v2.3.9+")

    # ── Rules 4 & 5 — Forbidden gradle.properties values ────────────────────
    for prop, reason in FORBIDDEN_LINES:
        if prop in pb:
            err(f"{label}: '{prop}' — {reason}")

    # ── Rule 6 — Line length ─────────────────────────────────────────────────
    for idx, pb_line in enumerate(pb_lines, start=1):
        full = f"      - {pb_line}"
        if len(full) >= 97:
            err(f"{label}: prebuild line {idx} is {len(full)} chars "
                f"(max 96, rewritemeta wraps at 97): "
                f"{full[:80]}{'...' if len(full) > 80 else ''}")

    # ── Rule 7 — Tag ref not SHA ─────────────────────────────────────────────
    commit = str(entry.get("commit", ""))
    if re.fullmatch(r"[0-9a-f]{7,40}", commit):
        err(f"{label}: commit '{commit}' looks like a raw SHA — "
            f"use a tag ref e.g. 'v{vn}'")

    # ── Rule 8 — Xmx value ───────────────────────────────────────────────────
    if new_tmpl:
        if "Xmx1g" in pb or re.search(r"Xmx1g\b", pb):
            err(f"{label}: Xmx1g — starves APK packager "
                "(IncrementalSplitterRunnable OOM); use Xmx1536m")
        if "Xmx2g" in pb or re.search(r"Xmx2g\b", pb):
            err(f"{label}: Xmx2g — starves Metro bundler "
                "(hermesc exit code 5); use Xmx1536m")
        if "Xmx1536m" not in pb:
            warn(f"{label}: no Xmx1536m found — Gradle heap may be misconfigured")

    # ── Rule 10 — Required gradle.properties lines ───────────────────────────
    if new_tmpl:
        for pattern, display in REQUIRED_GRADLE_PROPS:
            if not re.search(pattern, pb):
                err(f"{label}: missing required gradle.properties line: {display}")

    # ── Rule 11 — Required app/build.gradle appends ──────────────────────────
    if new_tmpl:
        for pattern, display in REQUIRED_BUILD_GRADLE_APPENDS:
            if not re.search(pattern, pb):
                err(f"{label}: missing required app/build.gradle append: {display}")

    # ── Rule 12 — npm ci flags ───────────────────────────────────────────────
    if new_tmpl:
        npm_line = next((l for l in pb_lines if l.startswith("npm ci")), None)
        if npm_line is None:
            err(f"{label}: no 'npm ci' line found in prebuild")
        else:
            for flag in REQUIRED_NPM_FLAGS:
                if flag not in npm_line:
                    err(f"{label}: npm ci missing flag '{flag}'")

    # ── Rule 13 — patch-package reinstall ────────────────────────────────────
    if new_tmpl:
        if "npm install --no-save --ignore-scripts patch-package" not in pb:
            err(f"{label}: missing 'npm install --no-save --ignore-scripts "
                "patch-package' — patch-package is a devDep (omitted by "
                "--omit=dev) and must be reinstalled explicitly")
        if "node node_modules/.bin/patch-package" not in pb:
            err(f"{label}: missing 'node node_modules/.bin/patch-package' — "
                "geolocation GMS-strip and sensors patches won't be applied")

    # ── Rule 14 — jvmToolchain(17) sed patch ─────────────────────────────────
    if new_tmpl:
        if "jvmToolchain" not in pb:
            err(f"{label}: missing jvmToolchain sed patch — "
                "RN Gradle Plugin's own build.gradle.kts files have "
                "jvmToolchain(17) which fails on JDK 21; "
                "fix: find \\$RNG -name build.gradle.kts -exec sed -i "
                "'/jvmToolchain/d' {{}} \\;")

    # ── Rule 15 — scanignore: node_modules ───────────────────────────────────
    scanignore = entry.get("scanignore", [])
    if isinstance(scanignore, str):
        scanignore = [scanignore]
    if "node_modules" not in scanignore:
        err(f"{label}: scanignore missing 'node_modules'")

    # ── Rule 16 — ndk version ────────────────────────────────────────────────
    ndk = str(entry.get("ndk", ""))
    if ndk:
        ndk_versions.add(ndk)

# ─────────────────────────────────────────────────────────────────────────────
# Rule 9 — CurrentVersion / CurrentVersionCode vs latest Builds entry
# ─────────────────────────────────────────────────────────────────────────────

current_vn = str(data.get("CurrentVersion", ""))
current_vc = str(data.get("CurrentVersionCode", ""))
latest = builds[-1]
latest_vn = str(latest.get("versionName", ""))
latest_vc = str(latest.get("versionCode", ""))

if current_vn != latest_vn:
    err(f"CurrentVersion '{current_vn}' != latest Builds entry '{latest_vn}' "
        "— update CurrentVersion when adding a new entry")
if current_vc != latest_vc:
    err(f"CurrentVersionCode '{current_vc}' != latest versionCode '{latest_vc}' "
        "— update CurrentVersionCode when adding a new entry")

# ── Rule 16 cont — ndk consistency ──────────────────────────────────────────
if len(ndk_versions) > 1:
    warn(f"Multiple ndk versions in use: {sorted(ndk_versions)} — "
         "consider aligning all entries to the latest")

# ─────────────────────────────────────────────────────────────────────────────
# Report
# ─────────────────────────────────────────────────────────────────────────────

print()
print(f"  {YAML_PATH}  ({len(builds)} entries)")
print()

if errors or warnings:
    for msg in errors:
        print(msg)
    for msg in warnings:
        print(msg)
    print()

if not errors and not warnings:
    print(f"  ✓  all {len(builds)} entries passed all 16 checks")
elif not errors:
    print(f"  ⚠  0 errors, {len(warnings)} warning(s)")
else:
    print(f"  ✗  {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1)
