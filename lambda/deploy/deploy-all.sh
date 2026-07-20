#!/bin/bash
set -e

# Deploys every Lambda function in this repo - each subdirectory of lambda/
# (other than deploy/ itself) that has an index.mjs is treated as one
# function, named after its directory. For each one this npm installs its
# production deps, zips it, and hands it to deploy.mjs, which creates the
# function if it doesn't exist yet or updates its code/config if it does.
#
# Safe to run on every CD run regardless of what changed: adding a new
# lambda/<name>/ directory is enough for it to get deployed automatically
# next time this runs - no manual AWS step required, and no manual step
# needed when an existing function's code changes either.
#
# Required env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL
# (same as deploy.mjs - AWS_REGION is optional, defaults to us-east-2).

: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID env var required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY env var required}"
: "${SES_FROM_EMAIL:?SES_FROM_EMAIL env var required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for dir in "$ROOT_DIR"/*/; do
  name="$(basename "$dir")"
  [ "$name" = "deploy" ] && continue
  [ -f "${dir}index.mjs" ] || continue

  echo "== Deploying lambda: ${name} =="
  (cd "$dir" && npm install --omit=dev --no-audit --no-fund)

  ZIP_PATH="${dir}function.zip"
  rm -f "$ZIP_PATH"
  (cd "$dir" && zip -rq function.zip . -x ".gitignore" "function.zip")

  FUNCTION_NAME="$name" ZIP_PATH="$ZIP_PATH" node "$ROOT_DIR/deploy/deploy.mjs"
  rm -f "$ZIP_PATH"
done
