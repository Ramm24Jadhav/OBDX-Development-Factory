#!/usr/bin/env bash
# Smoke test on a device: builds the app, installs it, starts it and checks it is still running after a few seconds.
#
#   bash scripts/run-on-device.sh android [serial]       a connected phone or a running emulator (adb devices lists them)
#   bash scripts/run-on-device.sh ios ["iPhone 16"]      an iOS simulator by name (xcrun simctl list devices), on a Mac
#
# It works from the app folder (the one with Package.swift) wherever it is called from. WAIT=15 waits longer. It exits 0 when the app started and kept running, 1 otherwise.
set -euo pipefail

APP_ID=com.bank.obdx
WAIT=${WAIT:-8}
cd "$(dirname "$0")/.."

fail() { echo "FAILED: $*" >&2; exit 1; }

android() {
    command -v adb >/dev/null || fail "adb not found. Install the Android SDK platform tools and put them on the PATH."
    [ -n "${1:-}" ] && export ANDROID_SERIAL="$1"
    adb get-state >/dev/null 2>&1 || fail "No phone or emulator. Connect one (USB debugging on) or start an emulator."
    [ -f android/gradle/wrapper/gradle-wrapper.jar ] \
        || fail "android/gradle/wrapper/gradle-wrapper.jar is missing. Copy it in (see the README, Gradle wrapper)."
    (cd android && bash ./gradlew assembleDebug)
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    adb logcat -c
    adb shell am start -W -n "$APP_ID/.MainActivity"
    sleep "$WAIT"
    if ! adb shell pidof "$APP_ID" >/dev/null; then
        adb logcat -d -s AndroidRuntime:E >&2
        fail "The app stopped after starting (the crash is above)."
    fi
    echo "OK: $APP_ID is running on $(adb get-serialno)."
}

ios() {
    command -v xcrun >/dev/null || fail "xcrun not found. Run this on a Mac with Xcode."
    command -v xcodegen >/dev/null || fail "xcodegen not found. Install it (brew install xcodegen)."
    local device=${1:-iPhone 16}
    (cd ios/App && xcodegen generate)
    xcodebuild build -project ios/App/ObdxMobile.xcodeproj -scheme ObdxMobile -configuration Debug \
        -destination "platform=iOS Simulator,name=$device" -derivedDataPath .build/device-run
    local app=.build/device-run/Build/Products/Debug-iphonesimulator/ObdxMobile.app
    [ -d "$app" ] || fail "The build did not produce $app."
    # Booting a simulator that is already booted is not an error here
    xcrun simctl boot "$device" 2>/dev/null || true
    xcrun simctl bootstatus "$device" -b >/dev/null
    xcrun simctl install "$device" "$app"
    xcrun simctl terminate "$device" "$APP_ID" 2>/dev/null || true
    xcrun simctl launch "$device" "$APP_ID"
    sleep "$WAIT"
    # Not piped into grep -q: with pipefail its early exit would fail the check
    local running
    running=$(xcrun simctl spawn "$device" launchctl list)
    [[ "$running" == *"UIKitApplication:$APP_ID"* ]] \
        || fail "The app stopped after starting. See its crash log in Console (Simulator) or ~/Library/Logs/DiagnosticReports."
    echo "OK: $APP_ID is running on the $device simulator."
}

case "${1:-}" in
    android) shift; android "$@" ;;
    ios) shift; ios "$@" ;;
    *) echo "Usage: bash scripts/run-on-device.sh android [serial] | ios [simulator name]" >&2; exit 2 ;;
esac
