#!/bin/zsh
#
# Does the app's "System" theme actually follow the system?
#
#   scripts/theme-scenarios.sh <adb-serial> [package]
#
# Set the app's Appearance to System first, then run this. It flips the
# device between light and dark eight different ways and reads the answer off
# the screen rather than out of a log, because the thing being tested is what
# the user sees.
#
# RUN IT AGAINST A RELEASE BUILD. A debug build reloads its bundle from Metro
# and can sit on the splash for twenty seconds after a flip, which reads as a
# theme that did not change. Every "failure" in the first pass of this was
# that, and it cost an afternoon.
#
# Two more things this harness learned the hard way:
#   • the splash is a flat fill, and scores exactly like a rendered light or
#     dark page — so a screenshot with almost no distinct colours is not an
#     answer, it is "not painted yet";
#   • a screenshot taken mid-repaint reads as the OLD theme — so one sample
#     is not an answer either, and two readings have to agree.
#
set -u
S=${1:?usage: theme-scenarios.sh <adb-serial> [package]}
P=${2:-com.prayer_times}
A=$P/com.prayer_times.MainActivity
OUT=${TMPDIR:-/tmp}/theme-scenarios

mkdir -p $OUT

classify() {
  adb -s $S exec-out screencap -p > $OUT/${S}_$1.png
  python3 - $OUT/${S}_$1.png <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
tot = n = 0
seen = set()
for y in range(300, h - 300, 7):
    for x in range(0, w, 7):
        p = im.getpixel((x, y))
        tot += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
        n += 1
        seen.add(p)
lum = tot / max(n, 1)
if len(seen) < 40:
    print('SPLASH colours=%d lum=%.1f' % (len(seen), lum))
else:
    print('%s lum=%.1f colours=%d' % ('LIGHT' if lum > 128 else 'DARK', lum, len(seen)))
PY
}

fails=0
check() {  # check <name> <expected LIGHT|DARK>
  local prev="" out=""
  for i in {1..30}; do
    out=$(classify $1)
    [[ $out != SPLASH* && ${out%% *} == ${prev%% *} ]] && break
    prev=$out
    sleep 3
  done
  if [[ ${out%% *} == $2 ]]; then
    echo "  ok   $1: $out"
  else
    echo "  FAIL $1: expected $2, got $out"
    fails=$((fails + 1))
  fi
}
night() { adb -s $S shell cmd uimode night $1 >/dev/null; }
home() { adb -s $S shell input keyevent KEYCODE_HOME; sleep 3; }
open() { adb -s $S shell am start -n $A >/dev/null 2>&1; }

echo "== $S / $P =="
night no; adb -s $S shell am force-stop $P >/dev/null; open
check baseline LIGHT

echo "-- A. flip to dark in the foreground"
night yes; check fg_dark DARK
echo "-- B. flip back to light in the foreground"
night no; check fg_light LIGHT

echo "-- C. background, flip to dark, foreground"
home; night yes; sleep 5; open; check bg_dark DARK
echo "-- D. background, flip to light, foreground"
home; night no; sleep 5; open; check bg_light LIGHT

echo "-- E. rapid double flip in the foreground"
night yes; sleep 1; night no; sleep 1; night yes; check rapid DARK

echo "-- F. screen off, flip to light, screen on"
adb -s $S shell input keyevent KEYCODE_POWER; sleep 3
night no; sleep 5
adb -s $S shell input keyevent KEYCODE_POWER; sleep 2
adb -s $S shell input keyevent KEYCODE_MENU
check asleep LIGHT

echo "-- G. cold start in dark"
adb -s $S shell am force-stop $P >/dev/null; night yes; sleep 3; open
check cold_dark DARK

echo "-- H. flip to light while the process is dead, then start"
adb -s $S shell am force-stop $P >/dev/null; sleep 2; night no; sleep 3; open
check cold_light LIGHT

echo
if [[ $fails -eq 0 ]]; then
  echo "all 9 readings correct"
else
  echo "$fails reading(s) wrong — screenshots in $OUT"
fi
exit $fails
