#!/bin/bash
set -e

# Builds/pushes the 6 core service images (frontend + 5 microservices),
# then SSHes into the EC2 k3s instance to run the actual deployment there
# (k8s/aws/deploy-on-server.sh) - kubectl runs locally on the server against
# 127.0.0.1:6443, so nothing beyond SSH (22) and the app's own HTTP/HTTPS
# ports need to be reachable from outside.
#
# Required env vars: SERVER_HOST (public IP/hostname), SSH_KEY (path to the
# private key file). Image build/push happens here (on whatever machine runs
# this - a GitHub Actions runner or locally) since the server itself is a
# small 2GB instance not worth burdening with builds.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${SERVER_HOST:?SERVER_HOST env var required (EC2 public IP)}"
: "${SSH_KEY:?SSH_KEY env var required (path to private key file)}"

REPO_LOWER=$(echo "${GITHUB_REPOSITORY:-amasha2456/cloud_computing_class_work}" | tr '[:upper:]' '[:lower:]')
TAG="${TAG:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
SSH_OPTS="-o StrictHostKeyChecking=no -i $SSH_KEY"

SERVICES="
frontend-service:services/frontend-service
event-service:services/event-service
program-service:services/program-service
registration-service:services/registration-service
email-service:services/email-service
auth-service:services/auth-service
analytics-service:services/analytics-service
superset:superset
"

echo "== Building and pushing images (tag: ${TAG}, platform: linux/amd64) =="
for entry in $SERVICES; do
  name="${entry%%:*}"
  context="${entry#*:}"
  image="ghcr.io/${REPO_LOWER}-${name}:${TAG}"
  echo "-- ${image}"
  docker buildx build --platform linux/amd64 --push -t "$image" "${ROOT_DIR}/${context}"
done

echo "== Staging .env on the server =="
# shellcheck disable=SC2086
ssh $SSH_OPTS "ubuntu@${SERVER_HOST}" "mkdir -p ~/env-staging"
# shellcheck disable=SC2086
scp $SSH_OPTS "$ROOT_DIR/.env" "ubuntu@${SERVER_HOST}:~/env-staging/.env"

echo "== Running deployment on the server =="
# shellcheck disable=SC2086
ssh $SSH_OPTS "ubuntu@${SERVER_HOST}" "bash -s -- '${TAG}' '${REPO_LOWER}'" < "$ROOT_DIR/k8s/aws/deploy-on-server.sh"

echo "Done."
