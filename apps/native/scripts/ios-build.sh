#!/usr/bin/env bash
# Builds one iPhone/iPad app on a macOS runner (both release pipelines call it).
#
#   bash apps/native/scripts/ios-build.sh <club|member|home> <build-number> [upload: true|false]
#
# Always: a simulator build (Horus-<app>-simulator.app.zip).
# With the App Store Connect API key in the environment (ASC_KEY_ID,
# ASC_ISSUER_ID, ASC_KEY_P8_BASE64; the key needs the Admin role so Xcode can
# create the cloud-managed distribution certificate and profiles): a signed
# archive, an App Store .ipa (Horus-<app>.ipa, kept as a CI artifact only;
# an App Store build can't be side-loaded), and, when upload is true, the
# build uploaded to App Store Connect, where it appears in TestFlight.
# Without the key: an unsigned archive, as before.
#
# Outputs land in $RUNNER_TEMP/out-<app>/.
set -euo pipefail

APP="$1"
BUILD="$2"
UPLOAD="${3:-false}"
TEAM="23Y8G4D63V"
OUT="$RUNNER_TEMP/out-$APP"
mkdir -p "$OUT"
cd "apps/native/$APP/ios/App"

echo "::group::Simulator build ($APP)"
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$RUNNER_TEMP/sim-$APP" \
  build CODE_SIGNING_ALLOWED=NO CURRENT_PROJECT_VERSION="$BUILD" | tail -3
ditto -c -k --keepParent "$RUNNER_TEMP/sim-$APP/Build/Products/Release-iphonesimulator/App.app" "$OUT/Horus-$APP-simulator.app.zip"
echo "::endgroup::"

ARCHIVE="$RUNNER_TEMP/Horus-$APP.xcarchive"

if [ -n "${ASC_KEY_P8_BASE64:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  KEY="$RUNNER_TEMP/AuthKey_${ASC_KEY_ID}.p8"
  printf '%s' "$ASC_KEY_P8_BASE64" | base64 --decode > "$KEY"
  AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

  echo "::group::Signed archive ($APP, build $BUILD)"
  xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
    DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION="$BUILD" "${AUTH[@]}" | tail -5
  echo "::endgroup::"

  export_plist() {
    cat > "$RUNNER_TEMP/export-$APP-$1.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>teamID</key><string>$TEAM</string>
	<key>signingStyle</key><string>automatic</string>
	<key>destination</key><string>$1</string>
	<key>uploadSymbols</key><true/>
	<key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
EOF
    echo "$RUNNER_TEMP/export-$APP-$1.plist"
  }

  echo "::group::Export .ipa ($APP)"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$(export_plist export)" -exportPath "$RUNNER_TEMP/ipa-$APP" "${AUTH[@]}" | tail -3
  mv "$RUNNER_TEMP/ipa-$APP/"*.ipa "$OUT/Horus-$APP.ipa"
  echo "::endgroup::"

  if [ "$UPLOAD" = "true" ]; then
    echo "::group::Upload to App Store Connect / TestFlight ($APP)"
    xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$(export_plist upload)" -exportPath "$RUNNER_TEMP/upload-$APP" "${AUTH[@]}" | tail -5
    echo "Uploaded Horus-$APP build $BUILD; it appears in TestFlight once Apple has processed it."
    echo "::endgroup::"
  fi
  rm -f "$KEY"
else
  echo "No App Store Connect API key: producing an unsigned archive."
  xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CURRENT_PROJECT_VERSION="$BUILD" | tail -3
fi

ditto -c -k --keepParent "$ARCHIVE" "$OUT/Horus-$APP.xcarchive.zip"
ls -la "$OUT"
