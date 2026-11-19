#!/bin/sh
# Archives the iPhone app and uploads it to App Store Connect (TestFlight and review).
# Signing and upload use the team's App Store Connect API key, named in
# ~/.appstoreconnect/powtracker.txt (KEY_ID, ISSUER_ID, KEY_FILE, TEAM_ID); nothing secret is
# kept in the repository. Pass a build number to upload a new build of the same version.
# Usage: sh scripts/ios-upload.sh [build-number]
set -e
. "$HOME/.appstoreconnect/powtracker.txt"
BUILD="${1:-1}"
OUT=data/build
AUTH="-allowProvisioningUpdates -authenticationKeyPath $KEY_FILE -authenticationKeyID $KEY_ID -authenticationKeyIssuerID $ISSUER_ID"

sh scripts/ios-sync.sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$OUT/ios-derived" -archivePath "$OUT/Powtracker.xcarchive" archive \
  DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD" $AUTH | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive -archivePath "$OUT/Powtracker.xcarchive" -exportPath "$OUT/ipa" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" $AUTH | grep -E "error|EXPORT (SUCCEEDED|FAILED)|Upload|upload|Progress 100"
