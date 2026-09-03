#!/usr/bin/env bash
# Publish the built QPC v2 page fonts as a GitHub release on this repo.
#
# The mushaf fonts are hosted the same way the page images are: one asset per
# page on a dedicated, permanent release tag, fetched by the app on demand.
#
#   scripts/mushaf/upload_qcf_fonts.sh /tmp/qcfbuild/fonts [tag]
#
# Re-runnable: an asset already on the release AT THE SAME SIZE is skipped, so
# an interrupted upload can simply be started again. An asset of a different
# size is REPLACED (--clobber).
#
# It used to skip by name alone. That is how twenty fonts cut short of their
# pages stayed on the release for six weeks after a correct build existed:
# the correct files were "already present" and never uploaded, and the reader
# drew the missing words in the platform's fallback face (2026-09-03).
set -uo pipefail

DIR="${1:?usage: upload_qcf_fonts.sh <font-dir> [tag]}"
TAG="${2:-mushaf-fonts-v2}"
REPO="Hassan-PS/Mihrab"

if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" \
    --title "Mushaf fonts (QPC v2)" \
    --notes "KFGQPC QPC v2 per-page mushaf fonts (one glyph per word), subset to each page's own glyphs. Used by Mihrab's font-rendered mushaf. Fonts © King Fahd Glorious Quran Printing Complex, used under their terms for software: https://dm.qurancomplex.gov.sa/copyright-2/" \
    --latest=false
fi

# macOS ships bash 3.2 — no mapfile, no associative arrays. A sorted file of
# asset names plus grep does the same job.
EXISTING=$(mktemp)
trap 'rm -f "$EXISTING"' EXIT
# "name size" per asset, so a rebuilt font is told apart from the one it replaces.
gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[] | "\(.name) \(.size)"' > "$EXISTING" 2>/dev/null || true

total=0
skipped=0
failed=0
batch=()
flush() {
  [ ${#batch[@]} -eq 0 ] && return 0
  if ! gh release upload "$TAG" -R "$REPO" "${batch[@]}" --clobber >/dev/null 2>&1; then
    # Retry once file-by-file so one bad asset cannot sink a whole batch.
    for f in "${batch[@]}"; do
      gh release upload "$TAG" -R "$REPO" "$f" --clobber >/dev/null 2>&1 \
        || { echo "FAILED $(basename "$f")"; failed=$((failed + 1)); }
    done
  fi
  batch=()
}

for f in "$DIR"/QCF2*.ttf; do
  name=$(basename "$f")
  size=$(stat -f %z "$f" 2>/dev/null || stat -c %s "$f")
  if grep -qxF "$name $size" "$EXISTING"; then
    skipped=$((skipped + 1))
    continue
  fi
  batch+=("$f")
  total=$((total + 1))
  if [ ${#batch[@]} -ge 20 ]; then
    flush
    echo "uploaded $total (skipped $skipped, failed $failed)"
  fi
done
flush

echo "done: uploaded $total, already present $skipped, failed $failed"
gh release view "$TAG" -R "$REPO" --json assets --jq '.assets | length' | xargs echo "assets on release:"
