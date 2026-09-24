#!/usr/bin/env bash
# One-time top-up: gives the 10 starter credits to players who signed up
# before the starter-credits Cloud Function was deployed. ./deploy.sh runs
# this automatically with --apply. To run it by hand from Google Cloud Shell:
#   ./top-up.sh            # preview: lists who would get credits, changes nothing
#   ./top-up.sh --apply    # gives the credits
# Safe to run more than once: nobody ever gets the starter credits twice.
set -euo pipefail

cd "$(dirname "$0")"

npm --prefix functions ci --silent
GCLOUD_PROJECT=betterplayer-beta npm --prefix functions run --silent top-up -- "$@"
