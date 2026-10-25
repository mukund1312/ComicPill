#!/usr/bin/env bash
# Records which classes and methods the app runs while it starts and while you use it, and saves them as
# profiles/baseline-prof.txt.gz (the format Android's build tools expect). Needs an emulator whose image allows `adb root`
# (a "Google APIs" image, not "Google Play"), and an UNMINIFIED release build installed — so names match the source:
#   cd android && ./gradlew assembleRelease -Pandroid.enableMinifyInReleaseBuilds=false -Pandroid.enableShrinkResourcesInReleaseBuilds=false
#   adb install -r app/build/outputs/apk/release/app-release.apk
# Then use the app for a minute (open the shelf, read a comic, open Mind Space), and run this script.
set -euo pipefail
PKG=com.mukund.comicpill
adb root >/dev/null; sleep 2
PID=$(adb shell pidof $PKG); adb shell kill -10 "$PID"; sleep 6        # SIGUSR1 makes ART save the profile now
APK=$(adb shell pm path $PKG | head -1 | sed 's/package://')
adb shell "/apex/com.android.art/bin/profman --dump-classes-and-methods --profile-file=/data/misc/profiles/cur/0/$PKG/primary.prof --apk=$APK --dex-location=$APK --dump-output-to-fd=1" \
  | LC_ALL=C grep -E '^(H?S?P?L[a-zA-Z0-9_/$]*;(->.*)?|L[a-zA-Z0-9_/$]*;)$' | LC_ALL=C sort -u | gzip -9 > "$(dirname "$0")/../profiles/baseline-prof.txt.gz"
zcat "$(dirname "$0")/../profiles/baseline-prof.txt.gz" | wc -l
