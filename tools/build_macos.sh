#!/bin/bash
# 建置 macOS 版：dist-mac/資料助秘電子書翻頁.app 與 dist-mac/ZMSFlipbook-<版本>-mac.dmg
# 用法（在 Mac 上）：bash tools/build_macos.sh   （要簽章＋公證時，從 tools/mac_in_terminal.sh 在終端機視窗執行）
# 需要：.venv（pywebview pymysql certifi pyinstaller edge-tts）、packaging/mariadb-mac（可從 zms-family-album 複製）
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
PY=.venv/bin/python
export SSL_CERT_FILE="$($PY -c 'import certifi; print(certifi.where())')"
VER=$($PY -c "import fb; print(fb.APP_VERSION)")
NAME="資料助秘電子書翻頁"
APPID="ZMSFlipbook"
BUNDLE_ID="com.achir.zmsflipbook"
echo "== 版本 $VER"

[ -x packaging/mariadb-mac/bin/mariadbd ] || { echo "缺少 packaging/mariadb-mac（可從 zms-sliderule 複製或執行 prepare_mariadb_mac.sh）"; exit 1; }
rm -rf build-mac dist-mac build/pyi-mac
mkdir -p build-mac dist-mac

# 圖示 PNG → icns
SET=build-mac/icon.iconset; mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s web/assets/icon.png --out "$SET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) web/assets/icon.png --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o build-mac/icon.icns

echo "== PyInstaller"
$PY -m PyInstaller main.py --noconfirm --clean --onedir --windowed --name "$APPID" \
  --icon build-mac/icon.icns --distpath dist-mac --workpath build/pyi-mac \
  --osx-bundle-identifier "$BUNDLE_ID" \
  --add-data web:web \
  --exclude-module tkinter --exclude-module test --exclude-module PIL --exclude-module qrcode \
  --hidden-import pymysql --hidden-import edge_tts --hidden-import certifi \
  --collect-all webview

APP=dist-mac/$APPID.app
[ -d "$APP" ] || { echo "找不到 $APP"; ls dist-mac; exit 1; }
for j in web/assets/voice/manifest.json web/test-flip.html web/test-reader.html; do rm -f "$APP/Contents/Resources/$j" "$APP/Contents/Frameworks/$j" 2>/dev/null || true; done; rm -rf "$APP/Contents/Resources/web/_pubtest" "$APP/Contents/Frameworks/web/_pubtest"

echo "== 內附 MariaDB"
cp -R packaging/mariadb-mac "$APP/Contents/Resources/mariadb"

PL="$APP/Contents/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PL" 2>/dev/null || true; }
pb "Delete :CFBundleDisplayName"; pb "Add :CFBundleDisplayName string $NAME"
pb "Set :CFBundleName $NAME"
pb "Set :CFBundleShortVersionString $VER"; pb "Set :CFBundleVersion $VER"
pb "Delete :LSMinimumSystemVersion"; pb "Add :LSMinimumSystemVersion string 12.0"
pb "Delete :LSApplicationCategoryType"; pb "Add :LSApplicationCategoryType string public.app-category.productivity"
pb "Delete :NSHumanReadableCopyright"; pb "Add :NSHumanReadableCopyright string 開發：吳玉柱 先生 與 Claude AI Opus 5.5"
pb "Delete :NSAppleEventsUsageDescription"; pb "Add :NSAppleEventsUsageDescription string 用 Microsoft Office 把簡報與文件轉成 PDF、在桌面建立本程式的替身"
pb "Delete :NSHighResolutionCapable"; pb "Add :NSHighResolutionCapable bool true"

FINAL="dist-mac/$NAME.app"
rm -rf "$FINAL"; mv "$APP" "$FINAL"
SIGN_KC="$HOME/Library/Keychains/zms-signing.keychain-db"
if [ -f "$SIGN_KC" ] && [ -f "$HOME/Developer/zms-signing/kc.pass" ]; then
  security unlock-keychain -p "$(cat "$HOME/Developer/zms-signing/kc.pass")" "$SIGN_KC"
fi
IDENT=$(security find-identity -v -p codesigning | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"' || true)
if [ -n "$IDENT" ]; then
  echo "== 簽章（${IDENT}）"
  ENT=packaging/mac-entitlements.plist
  find "$FINAL/Contents" -type f \( -name "*.dylib" -o -name "*.so" \) -print0 |
    xargs -0 -I{} codesign --force --timestamp --options runtime -s "$IDENT" "{}"
  find "$FINAL/Contents/Resources" "$FINAL/Contents/Frameworks" -type f -perm +111 ! -name "*.dylib" ! -name "*.so" -print0 |
    while IFS= read -r -d '' f; do
      if file -b "$f" | grep -q Mach-O; then codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENT" "$f"; fi
    done
  codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENT" "$FINAL/Contents/MacOS/$APPID"
  codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENT" "$FINAL"
else
  echo "== 簽章（ad-hoc；找不到 Developer ID 憑證）"
  codesign --force --deep -s - "$FINAL"
fi
codesign --verify --deep --strict "$FINAL" && echo "簽章 OK"

NOTARY="${NOTARY_PROFILE:-zms-notary}"
notarize() {
  xcrun notarytool submit "$1" --keychain-profile "$NOTARY" --wait --timeout 90m | tee build-mac/notary.txt
  grep -q "status: Accepted" build-mac/notary.txt || {
    ID=$(grep -m1 "  id:" build-mac/notary.txt | awk '{print $2}')
    [ -n "$ID" ] && xcrun notarytool log "$ID" --keychain-profile "$NOTARY" || true
    echo "公證失敗"; exit 1; }
}
CAN_NOTARIZE=""
if [ -n "$IDENT" ] && [ -z "${SKIP_NOTARY:-}" ] && xcrun notarytool history --keychain-profile "$NOTARY" >/dev/null 2>&1; then CAN_NOTARIZE=1; fi
if [ -n "$CAN_NOTARIZE" ]; then
  echo "== 公證 App"
  ditto -c -k --keepParent "$FINAL" build-mac/app.zip
  notarize build-mac/app.zip
  xcrun stapler staple "$FINAL"
fi

echo "== DMG"
STAGE=build-mac/dmg; rm -rf "$STAGE"; mkdir -p "$STAGE"
ditto "$FINAL" "$STAGE/$NAME.app"
ln -s /Applications "$STAGE/應用程式"
SIZE_MB=$(( $(du -sm "$STAGE" | cut -f1) + 80 ))
DMG="dist-mac/$APPID-$VER-mac.dmg"
rm -f "$DMG"
for i in 1 2 3; do
  hdiutil create -volname "$NAME $VER" -srcfolder "$STAGE" -ov -format UDZO -size ${SIZE_MB}m "$DMG" && break
  echo "hdiutil 重試 $i"; sleep 5
done
if [ -n "$IDENT" ]; then codesign --force --timestamp -s "$IDENT" "$DMG"; fi
if [ -n "$CAN_NOTARIZE" ]; then
  echo "== 公證 DMG"
  notarize "$DMG"
  xcrun stapler staple "$DMG"
  spctl -a -vv -t install "$DMG" 2>&1 | head -3
  spctl -a -vv "$FINAL" 2>&1 | head -3
fi
shasum -a 256 "$DMG"
du -h "$DMG"
echo "BUILD_DONE"
