#!/bin/sh
# Builds the site as the iPhone app sees it (paywall on) and copies it into the Xcode project.
# The trail maps (11 MB) are left out: the app reads them, like every data file, from
# powtracker.app, and keeps only the small files as an offline copy.
# Usage: sh scripts/ios-sync.sh
set -e
VITE_PAYWALL=on npx vite build
npx cap copy ios
rm -rf ios/App/App/public/data/trails
echo "iPhone app assets: $(du -sh ios/App/App/public | cut -f1)"
