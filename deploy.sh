#!/usr/bin/env bash
# Deploys the Cloud Functions, Firestore rules and Firestore indexes to
# betterplayer-beta. Run from Google Cloud Shell, which already has your
# Google credentials, so no Firebase login is needed:
#   ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

# Wake up Cloud Shell's own Google credentials, which the Firebase CLI uses.
# In a new Cloud Shell session this may show an "Authorize Cloud Shell" box:
# tap Authorize (it stays inside Cloud Shell, no link to open).
if ! gcloud auth print-access-token >/dev/null; then
  echo
  echo "Cloud Shell couldn't get your Google credentials."
  echo "If an \"Authorize Cloud Shell\" box appeared, tap Authorize, then run ./deploy.sh again."
  exit 1
fi

npm --prefix functions ci
firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project betterplayer-beta
