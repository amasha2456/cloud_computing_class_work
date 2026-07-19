#!/bin/bash
set -e

# Runs ON the EC2 instance itself (piped over SSH, not executed locally).
# Uses k3s's own local kubectl against 127.0.0.1:6443 - no Kubernetes API
# port needs to be exposed to the internet at all with this approach, only
# SSH (22) does, which is what actually reaches this script in the first
# place.
#
# Usage (from the caller, over ssh): bash -s -- <tag> <repo-lower>
# Expects ~/env-staging/.env to already be in place (written by the caller
# via scp before this runs) - contains the secrets for k8s/create-secrets.sh.

TAG="$1"
REPO_LOWER="$2"
APP_DIR="$HOME/app"

if [ -z "$TAG" ] || [ -z "$REPO_LOWER" ]; then
  echo "Usage: deploy-on-server.sh <tag> <repo-lower>" >&2
  exit 1
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "== Updating existing checkout =="
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  echo "== Cloning repo =="
  git clone --depth 1 https://github.com/amasha2456/cloud_computing_class_work.git "$APP_DIR"
fi

cp "$HOME/env-staging/.env" "$APP_DIR/.env"
cd "$APP_DIR"

export KUBECONFIG="$HOME/.kube/config"

echo "== Applying namespace, secrets, configmaps (idempotent) =="
kubectl apply -f k8s/00-namespace.yaml
bash k8s/create-secrets.sh
kubectl create configmap postgres-init \
  --from-file=init.sql=db/init.sql \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/01-app-config.yaml

echo "== Applying Postgres (idempotent) =="
kubectl apply -f k8s/postgres.yaml
kubectl rollout status deployment/postgres -n newevent --timeout=120s

echo "== Applying ingress (idempotent) =="
kubectl apply -f k8s/aws/ingress.yaml

SERVICES="frontend-service event-service program-service registration-service email-service auth-service"
for name in $SERVICES; do
  image="ghcr.io/${REPO_LOWER}-${name}:${TAG}"

  if kubectl get deployment "${name}-blue" -n newevent >/dev/null 2>&1; then
    echo "== ${name}: already deployed - blue-green cutover to ${image} =="
    bash k8s/blue-green-deploy.sh "$name" "$image"
  else
    echo "== ${name}: first deploy - bootstrapping with blue active =="
    kubectl apply -f "k8s/blue-green/${name}.yaml"
    kubectl set image "deployment/${name}-blue" "${name}=${image}" -n newevent
    kubectl rollout status "deployment/${name}-blue" -n newevent --timeout=120s
  fi
done

echo "Done. kubectl get pods -n newevent:"
kubectl get pods -n newevent
