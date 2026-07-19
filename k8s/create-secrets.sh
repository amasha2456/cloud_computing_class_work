#!/bin/bash
set -e

# Builds the K8s "app-secrets" Secret directly from the root .env file.
# Never commit real secret values into a YAML file in this repo.
#
# Note: root .env stores ADMIN_PASSWORD_HASH with `$` escaped as `$$`
# (a docker-compose interpolation quirk - bcrypt hashes contain literal `$`
# characters that docker-compose's ${VAR} substitution misreads as nested
# variable references). kubectl's --from-env-file does no such interpolation,
# so that escaping must be undone here, or the hash breaks silently.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

TMP_ENV=$(mktemp)
trap 'rm -f "$TMP_ENV"' EXIT

# Copy everything except ADMIN_PASSWORD_HASH as-is, then re-add it unescaped.
grep -v '^ADMIN_PASSWORD_HASH=' "$ENV_FILE" > "$TMP_ENV"
HASH_LINE=$(grep '^ADMIN_PASSWORD_HASH=' "$ENV_FILE" | sed 's/\$\$/\$/g')
echo "$HASH_LINE" >> "$TMP_ENV"

kubectl create namespace newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic app-secrets \
  --from-env-file="$TMP_ENV" \
  -n newevent \
  --dry-run=client -o yaml | kubectl apply -f -

echo "app-secrets created/updated in namespace newevent."
