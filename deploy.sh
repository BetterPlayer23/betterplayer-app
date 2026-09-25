#!/usr/bin/env bash
# Deploys the Cloud Functions, Firestore rules and Firestore indexes to
# betterplayer-beta. Run from Google Cloud Shell, which already has your
# Google credentials, so no Firebase login is needed:
#   ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

# If gcloud has no active account selected, pick the Google account Cloud Shell
# already has credentials for (no login link needed).
if [ -z "$(gcloud config get-value account 2>/dev/null)" ]; then
  account="$(gcloud auth list --format='value(account)' 2>/dev/null | head -n 1)"
  if [ -n "$account" ]; then
    echo "Using your Cloud Shell Google account: $account"
    gcloud config set account "$account" >/dev/null 2>&1
  fi
fi

# Wake up Cloud Shell's own Google credentials, which the Firebase CLI uses.
# In a new Cloud Shell session this may show an "Authorize Cloud Shell" box:
# tap Authorize (it stays inside Cloud Shell, no link to open).
if ! gcloud auth print-access-token >/dev/null; then
  echo
  echo "Cloud Shell couldn't get your Google credentials."
  echo "If an \"Authorize Cloud Shell\" box appeared, tap Authorize, then run ./deploy.sh again."
  echo "Otherwise restart Cloud Shell (the ⋮ menu > Restart) and paste the command again."
  exit 1
fi

npm --prefix functions ci
firebase deploy --only functions,firestore:rules,firestore:indexes,storage --project betterplayer-beta
