#!/usr/bin/env bash
# Builds the native macOS shell and installs it to ~/Applications/Whiteboard Studio.app.
set -euo pipefail

readonly PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
readonly SRC="$PROJECT_DIR/macos/WhiteboardStudio"
readonly APP="${WHITEBOARD_STUDIO_APP_PATH:-$HOME/Applications/Whiteboard Studio.app}"
readonly BUNDLE_ID="${BUNDLE_ID:-com.example.whiteboard-studio.app}"
readonly WORK="$SRC/.build/app"

swift build --package-path "$SRC" -c release

rm -rf "$WORK"
mkdir -p "$WORK/Whiteboard Studio.app/Contents/MacOS" "$WORK/Whiteboard Studio.app/Contents/Resources"
readonly STAGED="$WORK/Whiteboard Studio.app"
cp "$SRC/.build/release/WhiteboardStudio" "$STAGED/Contents/MacOS/WhiteboardStudio"
sed "s|__PROJECT_DIR__|$PROJECT_DIR|" "$SRC/Info.plist" > "$STAGED/Contents/Info.plist"
# Apply the bundle id at build time (overridable via BUNDLE_ID).
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$STAGED/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLName $BUNDLE_ID" "$STAGED/Contents/Info.plist" 2>/dev/null || true
# A new build number per build makes the Dock and Cmd-Tab drop their cached icon.
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(date +%Y%m%d%H%M%S)" "$STAGED/Contents/Info.plist"
swift "$SRC/make-icon.swift" "$SRC/AppIcon.svg" "$WORK/AppIcon.iconset"
iconutil -c icns "$WORK/AppIcon.iconset" -o "$STAGED/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$STAGED" >/dev/null

# Replace only our own bundle.
if [[ -e "$APP" ]]; then
  existing_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist" 2>/dev/null || true)
  if [[ "$existing_id" != "$BUNDLE_ID" ]]; then
    echo "Refusing to overwrite $APP (bundle id: ${existing_id:-unknown})" >&2
    exit 1
  fi
  rm -rf "$APP"
fi
mkdir -p "$(dirname "$APP")"
mv "$STAGED" "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "Installed $APP"
