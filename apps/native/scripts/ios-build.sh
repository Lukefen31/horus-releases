#!/usr/bin/env bash
# Builds one iPhone/iPad app on a macOS runner (both release pipelines call it).
#
#   bash apps/native/scripts/ios-build.sh <club|member|home> <build-number> [upload: true|false]
#
# Always: a simulator build (Horus-<app>-simulator.app.zip).
#
# Signed, when the secrets are in the environment:
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64  App Store Connect API key
#   IOS_DIST_P12_BASE64, IOS_DIST_P12_PASSWORD     Apple Distribution certificate
# (both made once on a developer machine: see ios-signing-setup.mjs). The
# app's App Store profile is downloaded through the API at build time, the
# archive is signed manually with it, an App Store .ipa (Horus-<app>.ipa) is
# kept as a CI artifact, and when upload is true the build goes to App Store
# Connect, where it appears in TestFlight.
# Without them: an unsigned archive.
#
# Outputs land in $RUNNER_TEMP/out-<app>/.
set -euo pipefail

APP="$1"
BUILD="$2"
UPLOAD="${3:-false}"
TEAM="23Y8G4D63V"
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

if [ -n "${ASC_KEY_P8_BASE64:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] \
  && [ -n "${IOS_DIST_P12_BASE64:-}" ] && [ -n "${IOS_DIST_P12_PASSWORD:-}" ]; then
  KEY="$RUNNER_TEMP/AuthKey_${ASC_KEY_ID}.p8"
  printf '%s' "$ASC_KEY_P8_BASE64" | tr -d ' \r\n' | base64 --decode > "$KEY"
  AUTH=(-authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

  echo "::group::Signing setup ($APP)"
  KEYCHAIN="$RUNNER_TEMP/horus-signing.keychain-db"
  if [ ! -f "$KEYCHAIN" ]; then
    KC_PW="$(openssl rand -base64 24)"
    security create-keychain -p "$KC_PW" "$KEYCHAIN"
    security set-keychain-settings -lut 21600 "$KEYCHAIN"
    security unlock-keychain -p "$KC_PW" "$KEYCHAIN"
    P12="$RUNNER_TEMP/dist.p12"
    printf '%s' "$IOS_DIST_P12_BASE64" | tr -d ' \r\n' | base64 --decode > "$P12"
    security import "$P12" -P "$IOS_DIST_P12_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN"
    rm -f "$P12"
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PW" "$KEYCHAIN" > /dev/null
    # shellcheck disable=SC2046
    security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
  fi
  security find-identity -v -p codesigning "$KEYCHAIN" | sed -E 's/[0-9A-F]{40}/<sha1>/'
  PROFILE="$(ASC_KEY_P8_PATH="$KEY" node "$SCRIPTS/asc-profile.mjs" "$APP" --patch "$PWD/App.xcodeproj/project.pbxproj")"
  echo "profile: $PROFILE"
  echo "::endgroup::"

  echo "::group::Signed archive ($APP, build $BUILD)"
  xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
    DEVELOPMENT_TEAM="$TEAM" CURRENT_PROJECT_VERSION="$BUILD" OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" | tail -5
  echo "::endgroup::"

  BUNDLE_ID="farm.horus.$APP"
  export_plist() {
    cat > "$RUNNER_TEMP/export-$APP-$1.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>teamID</key><string>$TEAM</string>
	<key>signingStyle</key><string>manual</string>
	<key>signingCertificate</key><string>Apple Distribution</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>$BUNDLE_ID</key><string>$PROFILE</string>
	</dict>
	<key>destination</key><string>$1</string>
	<key>uploadSymbols</key><true/>
	<key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
EOF
    echo "$RUNNER_TEMP/export-$APP-$1.plist"
  }

  echo "::group::Export .ipa ($APP)"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$(export_plist export)" -exportPath "$RUNNER_TEMP/ipa-$APP" | tail -3
  mv "$RUNNER_TEMP/ipa-$APP/"*.ipa "$OUT/Horus-$APP.ipa"
  echo "::endgroup::"

  if [ "$UPLOAD" = "true" ]; then
    echo "::group::Upload to App Store Connect / TestFlight ($APP)"
    xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$(export_plist upload)" -exportPath "$RUNNER_TEMP/upload-$APP" \
      -allowProvisioningUpdates "${AUTH[@]}" | tail -5
    echo "Uploaded Horus-$APP build $BUILD; it appears in TestFlight once Apple has processed it."
    echo "::endgroup::"
  fi
  rm -f "$KEY"
else
  echo "No App Store Connect API key or distribution certificate: producing an unsigned archive."
  xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CURRENT_PROJECT_VERSION="$BUILD" | tail -3
fi

ditto -c -k --keepParent "$ARCHIVE" "$OUT/Horus-$APP.xcarchive.zip"
ls -la "$OUT"
