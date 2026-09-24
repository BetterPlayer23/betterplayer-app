#!/usr/bin/env bash
# Deploys the Cloud Functions, Firestore rules and Firestore indexes to
# the betterplayer-beta Firebase project. Run from Google Cloud Shell:
#   ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

# Install the Firebase command-line tool if it isn't there yet.
if ! command -v firebase >/dev/null 2>&1; then
  echo "Installing the Firebase CLI..."
  npm install -g firebase-tools
fi

echo "Installing Cloud Functions dependencies..."
npm --prefix functions ci

echo "Deploying to betterplayer-beta..."
firebase deploy --only functions,firestore:rules,firestore:indexes --project betterplayer-beta
