#!/usr/bin/env bash
# Backup way to deploy the backend (Cloud Functions, Firestore rules and
# indexes, Storage rules) to betterplayer-beta. The normal way is the GitHub
# workflow .github/workflows/firebase-deploy.yml.
#
# Uses the deploy key saved at ~/.deployer-key.json if it exists (the same
# "github-deploy" service account key as the GitHub secret). Never put that
# file inside this folder. Without it, the Firebase CLI uses whatever Google
# credentials the machine already has.
#   ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

KEY_FILE="$HOME/.deployer-key.json"
if [ -f "$KEY_FILE" ]; then
  export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"
  echo "Using the deploy key at ~/.deployer-key.json"
fi

npm --prefix functions ci
npx --yes firebase-tools@15 deploy \
  --only functions,firestore:rules,firestore:indexes,storage \
  --project betterplayer-beta
