#!/usr/bin/env bash
# Everything in one go, from Google Cloud Shell:
#   1. installs the Firebase CLI if needed
#   2. logs in to Firebase only if Cloud Shell's own Google login isn't enough
#   3. deploys the Cloud Functions, Firestore rules and indexes
#      (retries automatically if Google is still switching services on)
#   4. gives starter credits to any player who is still missing them
#      (safe: nobody ever gets them twice)
#
# Safe to run again at any time, e.g. if Cloud Shell disconnected halfway.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT=betterplayer-beta

step() { printf '\n==> %s\n' "$1"; }

step "1/4 Checking the Firebase CLI"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Installing the Firebase CLI..."
  npm install -g firebase-tools
fi

step "2/4 Checking access to $PROJECT"
if firebase projects:list >/dev/null 2>&1; then
  echo "Access OK (using your Cloud Shell Google login)."
else
  echo "Firebase needs you to log in once. Follow the link below, sign in with"
  echo "the Google account that owns the Firebase project, then paste the code here."
  firebase login --no-localhost
fi

step "3/4 Deploying functions, rules and indexes to $PROJECT"
npm --prefix functions ci --silent
attempt=1
until firebase deploy --only functions,firestore:rules,firestore:indexes --project "$PROJECT"; do
  if [ "$attempt" -ge 3 ]; then
    echo
    echo "Deploy failed 3 times. Copy the error above and send it to Claude."
    exit 1
  fi
  echo
  echo "Deploy failed (attempt $attempt of 3). On a first deploy this is often"
  echo "Google still switching services on. Trying again in 90 seconds..."
  sleep 90
  attempt=$((attempt + 1))
done

step "4/4 Starter credits for players who are missing them"
if ! ./top-up.sh --apply; then
  echo
  echo "The deploy worked, but the starter-credits top-up couldn't run."
  echo "Copy the error above and send it to Claude."
  exit 1
fi

printf '\nAll done.\n'
