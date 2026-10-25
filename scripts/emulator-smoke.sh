#!/usr/bin/env bash
# Smoke-test a release APK on one Android emulator, end to end, through the real UI: boot → install → import CBZ / 7z / RAR /
# PDF with the system file picker → open each → scan a screenshot with on-device OCR → measure start-up and memory.
#   scripts/emulator-smoke.sh <avd-name> <path/to/app.apk> <fixtures-dir> <out-dir>
# <fixtures-dir> needs: Bundle.zip (a zip of "Nightwatch 01.cbz" Test7z.cb7 Test4.cbr Test.pdf) and post_manga.png (see docs/RELEASING.md).
# Screenshots land in <out-dir>. Needs an emulator image with `adb root` (Google APIs, not Google Play).
set -uo pipefail
AVD=$1; APK=$2; FIX=$3; OUT=$4; PKG=com.mukund.comicpill
export ANDROID_HOME=${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
mkdir -p "$OUT"
log() { printf '%s\n' "$*" | tee -a "$OUT/report.txt"; }

adb emu kill >/dev/null 2>&1; sleep 3
(nohup emulator -avd "$AVD" -no-snapshot -no-audio -no-boot-anim -gpu swiftshader_indirect >"$OUT/emulator.log" 2>&1 &)
adb wait-for-device; until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done; sleep 8
SDK=$(adb shell getprop ro.build.version.sdk | tr -d '\r'); log "== $AVD  (API $SDK, $(adb shell getprop ro.build.version.release | tr -d '\r'), RAM $(adb shell grep MemTotal /proc/meminfo | awk '{print int($2/1024)}') MB)"

adb install -r "$APK" 2>&1 | tail -1 | tee -a "$OUT/report.txt"
if [ "$SDK" -ge 33 ]; then adb shell pm grant $PKG android.permission.READ_MEDIA_IMAGES; else adb shell pm grant $PKG android.permission.READ_EXTERNAL_STORAGE; fi
adb shell mkdir -p /sdcard/Download /sdcard/Pictures/Screenshots
for f in "$FIX"/Bundle.zip; do [ -f "$f" ] && adb push "$f" /sdcard/Download/ >/dev/null && adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$(basename "$f")" >/dev/null; done
adb push "$FIX/post_manga.png" /sdcard/Pictures/Screenshots/ >/dev/null; adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/Screenshots/post_manga.png >/dev/null

# find a UI element by text or content-desc and tap it. tap = contains the words; tapx = exactly equal.
_tap() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  local xy; xy=$(adb exec-out cat /sdcard/ui.xml | python3 -c "
import sys,re
x=sys.stdin.read(); w=sys.argv[1]; exact=sys.argv[2]
for m in re.finditer(r'<node[^>]*>',x):
    n=m.group(0)
    t=re.search(r' text=\"([^\"]*)\"',n); d=re.search(r'content-desc=\"([^\"]*)\"',n); b=re.search(r'bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',n)
    if not b: continue
    if exact=="1":
        ok=(t and t.group(1)==w) or (d and d.group(1)==w)
    else:
        ok=(t and w in t.group(1)) or (d and w in d.group(1))
    if ok:
        print((int(b.group(1))+int(b.group(3)))//2,(int(b.group(2))+int(b.group(4)))//2); break" "$1" "$2")
  if [ -n "$xy" ]; then adb shell input tap $xy; sleep 1.5; return 0; fi; return 1
}
tap() { _tap "$1" 0; }
tapx() { _tap "$1" 1; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
screen_has() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml | grep -q "$1"; }

adb shell am start -a android.intent.action.VIEW -d "comicpill:///reader" $PKG >/dev/null; sleep 8
# wait until the UI dump contains a pattern (default: up to 60 s)
wait_for() { local n=0; while [ $n -lt ${2:-60} ]; do adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml | grep -q "$1" && return 0; sleep 2; n=$((n+2)); done; return 1; }

import_file() {  # $1 = file name; success means the comic really appeared on the shelf
  local file=$1 title=${1%.*}
  tap "Import files" || { log "  ! no import button"; return 1; }
  wait_for 'documentsui' 40 || { log "  ! the file picker never opened for $file"; return 1; }
  sleep 2
  # The roots drawer works the same on every Android version; searching doesn't (older pickers have no search icon).
  tapx "Show roots"; sleep 1; tapx "Downloads"; sleep 3
  tapx "$file" || { log "  ! picker did not list $file"; adb shell input keyevent 4; sleep 1; adb shell input keyevent 4; return 1; }
  if wait_for "text=\"$title\"" 60; then log "  imported $file"; return 0; fi
  if screen_has "could not be imported"; then log "  ! import of $file failed: $(adb exec-out cat /sdcard/ui.xml | python3 -c "import sys,re;print(re.findall(r'text=\"([^\"]*could[^\"]*|[^\"]*: [^\"]*)\"',sys.stdin.read())[:2])")"; tapx "OK"; return 1; fi
  log "  ! $file never appeared on the shelf"; return 1
}
# One bundle zip holds all four, so a single trip through the picker imports every format (and tests bundle import).
import_file "Bundle.zip"; for t in "Nightwatch 01" Test7z Test4 Test; do wait_for "text=\"$t\"" 90 && log "  bundle gave: $t" || log "  ! bundle did not give: $t"; done; shot shelf

for t in "Nightwatch 01" Test7z Test4 "Test"; do
  if tapx "$t"; then sleep 12; adb shell input swipe 900 1200 150 1200 200; sleep 2; shot "read_$(echo $t | tr ' ' '_')"; adb shell input keyevent 4; sleep 2; else log "  ! could not open $t"; fi
done

# Mind Space: watch the album, scan, OCR gate
adb shell am start -a android.intent.action.VIEW -d "comicpill:///mind/settings" $PKG >/dev/null; sleep 5
tap "Watch an album"; sleep 3; shot mind_settings
adb shell am start -a android.intent.action.VIEW -d "comicpill:///mind?tab=inbox" $PKG >/dev/null; sleep 5
tap "Look back 7 days"; sleep 14; shot mind_inbox
if screen_has "look comic-related"; then log "  OCR scan: screenshot offered for review (on-device text read OK)"; else log "  ! OCR scan: nothing offered"; fi

# start-up and memory
for i in 1 2 3 4 5; do adb shell am force-stop $PKG; sleep 2; adb shell am start -W -a android.intent.action.VIEW -d "comicpill:///reader" $PKG 2>&1 | grep TotalTime | awk '{print $2}'; done | sort -n | tr '\n' ' ' > "$OUT/start.txt"
log "  cold start ms (sorted): $(cat "$OUT/start.txt")"
sleep 5
MEM=$(adb shell dumpsys meminfo $PKG | tr -d '\r' | awk '/TOTAL PSS:/{print $3; exit} /^ *TOTAL +[0-9]/{print $2; exit}')
log "  memory: $((${MEM:-0} / 1024)) MB PSS"
log "  crashes: $(adb logcat -d 2>&1 | grep -c 'FATAL EXCEPTION')"
