#!/bin/bash
set -e

# Deploys the core app path (frontend + 6 microservices + Postgres) to the
# real k3s cluster on EC2. ClickHouse/analytics/Superset/Prometheus/Grafana/
# cAdvisor are deliberately NOT part of this deployment - the node is a
# free-tier-eligible t3.small (2GB RAM), which only comfortably fits the
# core transactional path. Those pieces remain docker-compose-only.
#
# Reuses k8s/blue-green/*.yaml as-is (same source of truth as the kind
# deployment) rather than duplicating them.
#
# Bootstraps the namespace/secrets/Postgres/Deployments on the very first
# run (nothing exists yet - safe to just apply fresh with blue active).
# On every run after that, each of the 6 services already exists, so a
# real blue-green cutover (k8s/blue-green-deploy.sh) is used instead of
# blindly overwriting the active slot's image in place, which would cause
# a brief outage on that slot - exactly what blue-green exists to avoid.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="$ROOT_DIR/k8s/aws/kubeconfig"

REPO_LOWER=$(echo "${GITHUB_REPOSITORY:-amasha2456/cloud_computing_class_work}" | tr '[:upper:]' '[:lower:]')
TAG="${TAG:-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"

SERVICES="
frontend-service:services/frontend-service
event-service:services/event-service
program-service:services/program-service
registration-service:services/registration-service
email-service:services/email-service
auth-service:services/auth-service
"

echo "== Building and pushing images (tag: ${TAG}, platform: linux/amd64) =="
for entry in $SERVICES; do
  name="${entry%%:*}"
  context="${entry#*:}"
  image="ghcr.io/${REPO_LOWER}-${name}:${TAG}"
  echo "-- ${image}"
  if [ "$name" = "frontend-service" ]; then
    docker buildx build --platform linux/amd64 --push \
      --build-arg NGINX_CONF=nginx.aws.conf \
      -t "$image" "${ROOT_DIR}/${context}"
  else
    docker buildx build --platform linux/amd64 --push -t "$image" "${ROOT_DIR}/${context}"
  fi
done

echo "== Applying namespace, secrets, configmaps (idempotent, safe to always re-run) =="
kubectl apply -f "$ROOT_DIR/k8s/00-namespace.yaml"
bash "$ROOT_DIR/k8s/create-secrets.sh"
kubectl create configmap postgres-init \
  --from-file=init.sql="$ROOT_DIR/db/init.sql" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$ROOT_DIR/k8s/01-app-config.yaml"

echo "== Applying Postgres (idempotent) =="
kubectl apply -f "$ROOT_DIR/k8s/postgres.yaml"
kubectl rollout status deployment/postgres -n newevent --timeout=120s

echo "== Applying ingress (idempotent) =="
kubectl apply -f "$ROOT_DIR/k8s/aws/ingress.yaml"

for entry in $SERVICES; do
  name="${entry%%:*}"
  image="ghcr.io/${REPO_LOWER}-${name}:${TAG}"

  if kubectl get deployment "${name}-blue" -n newevent >/dev/null 2>&1; then
    echo "== ${name}: already deployed - blue-green cutover to ${image} =="
    bash "$ROOT_DIR/k8s/blue-green-deploy.sh" "$name" "$image"
  else
    echo "== ${name}: first deploy - bootstrapping with blue active =="
    kubectl apply -f "$ROOT_DIR/k8s/blue-green/${name}.yaml"
    kubectl set image "deployment/${name}-blue" "${name}=${image}" -n newevent
    kubectl rollout status "deployment/${name}-blue" -n newevent --timeout=120s
  fi
done

echo "Done. kubectl get pods -n newevent"
kubectl get pods -n newevent
