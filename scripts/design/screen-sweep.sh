#!/bin/zsh
# Every screen of the installed build, screenshotted over adb — the
# before/after harness for the 2026 redesign (docs/design/redesign-plan.md).
#
#   scripts/design/screen-sweep.sh [out-dir] [package]
#
# Defaults: out-dir = .shots/<timestamp>, package = com.prayer_times.beta.
# Takes light, dark and Arabic (RTL) passes of the tabs, the reader, Month,
# Qibla, Fasting, Sync and the Settings pages. Deep links do the
# navigation; a few taps reach what has no link. Coordinates are for a
# 1280×2856 screen (Pixel 10 Pro) — pass SWEEP_SCALE to adapt.
#
# The images stay out of git (.shots/ is excluded). Compare two runs with
# any image diff, or just open them side by side.
set -u
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
OUT=${1:-.shots/$(date +%Y%m%d-%H%M%S)}
PKG=${2:-com.prayer_times.beta}
SCALE=${SWEEP_SCALE:-1}
mkdir -p "$OUT"

link() { adb shell am start -W -a android.intent.action.VIEW -d "mihrab://$1" "$PKG" >/dev/null 2>&1; sleep ${2:-2.5}; }
tap()  { adb shell input tap $(( $1 * SCALE )) $(( $2 * SCALE )); sleep ${3:-2}; }
scroll(){ adb shell input swipe 640 2200 640 900 400; sleep 1.5; }
back() { adb shell input keyevent 4; sleep 1.5; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; echo "  $1"; }
settings_page() { link settings 2; tap 640 $1; shot "$2"; }

pass() {
  local mode=$1
  echo "== $mode"
  adb shell am force-stop "$PKG"; sleep 1
  link today 5;  adb shell cmd statusbar collapse; sleep 1; shot "$mode-01-today"
  scroll;        shot "$mode-02-today-b"
  link month 3;  shot "$mode-03-month"
  link qibla 4;  shot "$mode-04-qibla"
  link fasting 3; shot "$mode-05-fasting"
  link quran 3;  shot "$mode-06-quran"
  scroll;        shot "$mode-07-quran-b"
  link "read/2" 5; shot "$mode-08-reader"
  link tasbih 3; shot "$mode-09-tasbih"
  link duas 3;   shot "$mode-10-duas"
  tap 640 605 2.5; shot "$mode-11-dua-category"; back
  link log 3;    shot "$mode-12-log"
  scroll;        shot "$mode-13-log-b"
  link settings 3; shot "$mode-14-settings"
  settings_page 550  "$mode-15-set-prayer-times"
  settings_page 755  "$mode-16-set-notifications"
  settings_page 1165 "$mode-17-set-appearance"
  link sync 3;   shot "$mode-18-sync"
}

night=$(adb shell cmd uimode night 2>/dev/null | tr -d '\r')
adb shell cmd uimode night no  >/dev/null; pass light
adb shell cmd uimode night yes >/dev/null; pass dark
adb shell cmd uimode night no  >/dev/null
case "$night" in *yes*) adb shell cmd uimode night yes >/dev/null;; esac

# Arabic, for RTL. The app follows the system locale; this flips it and
# flips it back. Needs a debuggable or `beta` build for `settings put`.
if [ "${SWEEP_RTL:-1}" = "1" ]; then
  prev=$(adb shell settings get system system_locales | tr -d '\r')
  adb shell settings put system system_locales ar-SA >/dev/null 2>&1
  adb shell am force-stop "$PKG"; sleep 2
  pass rtl
  [ -n "$prev" ] && [ "$prev" != "null" ] && adb shell settings put system system_locales "$prev" >/dev/null 2>&1
fi
echo "done → $OUT"
