#!/usr/bin/env bash
# Publish the built QPC v2 page fonts as a GitHub release on this repo.
#
# The mushaf fonts are hosted the same way the page images are: one asset per
# page on a dedicated, permanent release tag, fetched by the app on demand.
#
#   scripts/mushaf/upload_qcf_fonts.sh /tmp/qcfbuild/fonts [tag]
#
# Re-runnable: assets that are already uploaded are skipped, so an interrupted
# upload can simply be started again.
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
gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name' > "$EXISTING" 2>/dev/null || true

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
  if grep -qxF "$name" "$EXISTING"; then
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
