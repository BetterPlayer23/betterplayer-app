#!/usr/bin/env bash
# Deploys the Cloud Functions, Firestore rules and Firestore indexes to
# betterplayer-beta. Run from Google Cloud Shell, which already has your
# Google credentials, so no Firebase login is needed:
#   ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

npm --prefix functions ci
firebase deploy --only functions,firestore:rules,firestore:indexes --project betterplayer-beta
