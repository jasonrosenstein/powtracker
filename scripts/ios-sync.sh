#!/bin/sh
# Builds the site for the iPhone app and copies it into the Xcode project. The app is free
# unless PAYWALL=on is given, which builds it with Powtracker Pro for sale.
# The trail maps (11 MB) are left out: the app reads them, like every data file, from
# powtracker.app, and keeps only the small files as an offline copy.
# Usage: sh scripts/ios-sync.sh            (free)
#        PAYWALL=on sh scripts/ios-sync.sh (sells Pro)
set -e
VITE_PAYWALL="${PAYWALL:-off}" npx vite build
npx cap copy ios
rm -rf ios/App/App/public/data/trails
echo "iPhone app assets: $(du -sh ios/App/App/public | cut -f1), paywall ${PAYWALL:-off}"
