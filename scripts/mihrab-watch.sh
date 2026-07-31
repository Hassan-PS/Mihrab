#!/usr/bin/env bash
# Weekly reuse check for Mihrab.
#
# Looks for signs that the codebase has been forked, copied or republished, and
# prints ONLY what changed since the last run. Silence means nothing happened.
#
#   scripts/mihrab-watch.sh          # report changes since last run
#   scripts/mihrab-watch.sh --full   # print everything, change or not
#
# State lives in ~/.mihrab-watch-baseline.json, outside the repo.
# Requires: gh (authenticated), python3.
set -uo pipefail

REPO="Hassan-PS/Mihrab"
BASELINE="$HOME/.mihrab-watch-baseline.json"
FULL="${1:-}"

# Strings that should exist nowhere but this project. Deliberately public
# identifiers — nothing here reveals anything that isn't already in the repo.
NEEDLES=(
  "prayerapp.settings.v1"
  "MihrabLiveActivity"
  "mushaf-assets-v2"
  "mushaf-fonts-v2"
  "MihrabMushaf"
)

json_get() { python3 -c "
import json,sys
try: d=json.load(open('$BASELINE'))
except Exception: d={}
print(d.get('$1', '$2'))
"; }

# ---- gather -----------------------------------------------------------------
meta=$(gh api "repos/$REPO" --jq '"\(.forks_count) \(.network_count) \(.stargazers_count) \(.subscribers_count)"' 2>/dev/null) || {
  echo "mihrab-watch: gh api failed — is gh still authenticated? (gh auth status)"
  exit 1
}
read -r forks network stars watchers <<< "$meta"

fork_list=$(gh api "repos/$REPO/forks" --jq '.[].full_name' 2>/dev/null | sort | tr '\n' ',' )

# Traffic needs push access. A workflow's default GITHUB_TOKEN does NOT have
# it and returns 403 with a JSON body on stdout, so validate rather than
# trust: an error string reaching the arithmetic below aborts the check.
clones=$(gh api "repos/$REPO/traffic/clones" --jq '.uniques' 2>/dev/null)
case "$clones" in
  ''|*[!0-9]*) clones=-1 ;; # -1 means "could not read"
esac

hits=""
search_ok=0
for n in "${NEEDLES[@]}"; do
  raw=$(gh search code "$n" --limit 20 --json repository 2>/dev/null)
  # An empty result and a refused request look identical once jq has run, so
  # check the call itself: code search rejects some token types outright, and
  # a monitor that silently stops searching is worse than no monitor.
  [ -n "$raw" ] && search_ok=1
  found=$(printf '%s' "$raw" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit()
print(' '.join(sorted({r['repository']['nameWithOwner'] for r in d} - {'$REPO'})))
" 2>/dev/null)
  [ -n "$found" ] && hits="$hits\n  \"$n\" → $found"
done

# Which checks actually ran. Reported when it changes, so a capability that
# quietly disappears (an expired token, a revoked scope) surfaces instead of
# turning into a permanently silent "all clear".
caps="forks"
[ "$clones" -ge 0 ] && caps="$caps,traffic"
[ "$search_ok" = "1" ] && caps="$caps,codesearch"

# ---- compare ----------------------------------------------------------------
old_forks=$(json_get forks 0)
old_network=$(json_get network 0)
old_fork_list=$(json_get fork_list "")
old_hits=$(json_get hits "")

changed=0
report=""

if [ "$forks" != "$old_forks" ] || [ "$network" != "$old_network" ]; then
  changed=1
  report="$report\n• FORKS: was $old_forks (network $old_network), now $forks (network $network)"
  [ -n "$fork_list" ] && report="$report\n  forks: $fork_list"
fi

if [ "$hits" != "$old_hits" ]; then
  changed=1
  if [ -n "$hits" ]; then
    report="$report\n• CODE SEARCH — Mihrab-only strings found in other repos:$hits"
    report="$report\n  (check each: an F-Droid index mirror or a package-name dataset is harmless;"
    report="$report\n   actual source is not)"
  else
    report="$report\n• CODE SEARCH: previous hits are gone"
  fi
fi

# Clone traffic is dominated by CI — F-Droid's builder and Xcode Cloud clone on
# every push, tag and retry, so the normal weekly figure is already dozens. An
# absolute threshold would fire every single week and train you to ignore this
# report. Only a jump well past the established level is worth a word.
# Default to the FULL set, not to empty. With an empty default a first run
# that can only see forks compares "forks" against "" and — because the old
# value is blank — says nothing, so a monitor that is two-thirds blind reports
# "no change" forever and reads as an all-clear. Comparing against the full set
# instead means any missing capability is announced the first time it is
# missing, which is the only moment it is still news.
old_caps=$(json_get caps "forks,traffic,codesearch")
if [ "$caps" != "$old_caps" ]; then
  changed=1
  report="$report\n• CHECK COVERAGE changed: was [$old_caps], now [$caps]."
  report="$report\n  A check that stopped running leaves a blind spot. 'traffic' needs a PAT"
  report="$report\n  in the MIHRAB_WATCH_TOKEN secret — it is an Administration-read endpoint,"
  report="$report\n  and 'administration' is not a key the workflow permissions block accepts."
  report="$report\n  'codesearch' and 'forks' do work on the default GITHUB_TOKEN."
fi

old_clones=$(json_get clones 0)
case "$old_clones" in ''|*[!0-9]*) old_clones=0 ;; esac
if [ "$clones" -ge 0 ] && [ "$clones" -gt 40 ] && [ "$clones" -gt $((old_clones * 2)) ]; then
  changed=1
  report="$report\n• CLONE TRAFFIC: $clones unique cloners in 14 days, up from $old_clones."
  report="$report\n  CI (F-Droid + Xcode Cloud) explains a rise around a release; worth a"
  report="$report\n  look if you didn't ship anything."
fi

python3 - "$forks" "$network" "$stars" "$watchers" "$fork_list" "$hits" "$clones" "$caps" <<PY
import json, sys
json.dump({
    "forks": sys.argv[1], "network": sys.argv[2], "stars": sys.argv[3],
    "watchers": sys.argv[4], "fork_list": sys.argv[5], "hits": sys.argv[6],
    "clones": sys.argv[7], "caps": sys.argv[8],
    "checked": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
}, open("$BASELINE", "w"), indent=1)
PY

# ---- report -----------------------------------------------------------------
if [ "$FULL" = "--full" ]; then
  echo "Mihrab reuse check — $(date -u +%Y-%m-%d)"
  echo "  forks $forks · network $network · stars $stars · watchers $watchers"
  echo "  unique cloners (14d): $clones"
  echo -e "  code-search hits:${hits:- none}"
  echo "  checks that ran: $caps"
fi

if [ "$changed" = "1" ]; then
  echo "Mihrab reuse check — something changed:"
  echo -e "$report"
  echo
  echo "If it looks like a real copy: TRADEMARK.md covers the name and icon,"
  echo "and ~/.mihrab-provenance.md (kept outside the repo) has the markers"
  echo "that prove origin."
elif [ "$FULL" != "--full" ]; then
  echo "Mihrab reuse check: no change."
fi
