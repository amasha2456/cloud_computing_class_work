#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="newevent"

SERVICES="
frontend-service:services/frontend-service
event-service:services/event-service
program-service:services/program-service
registration-service:services/registration-service
email-service:services/email-service
auth-service:services/auth-service
analytics-service:services/analytics-service
"

echo "== Building images =="
for entry in $SERVICES; do
  name="${entry%%:*}"
  context="${entry#*:}"
  echo "-- building newevent/${name}:latest from ${context}"
  docker build -t "newevent/${name}:latest" "${ROOT_DIR}/${context}"
done

echo "-- building newevent/superset:latest"
docker build -t "newevent/superset:latest" "${ROOT_DIR}/superset"

echo "== Loading images into kind cluster '${CLUSTER_NAME}' =="
for entry in $SERVICES; do
  name="${entry%%:*}"
  bash "$ROOT_DIR/k8s/load-image.sh" "newevent/${name}:latest"
done
bash "$ROOT_DIR/k8s/load-image.sh" "newevent/superset:latest"

# Public infra images: load from the local Docker cache too (avoids the kind
# node pulling large images fresh from the internet, which is slow and was
# observed to make the deploy time out on stateful service rollouts).
for img in "postgres:16" "clickhouse/clickhouse-server:24-alpine" "prom/prometheus:latest" "grafana/grafana:latest" "prometheuscommunity/postgres-exporter:latest" "gcr.io/cadvisor/cadvisor:latest"; do
  docker pull -q "$img" >/dev/null 2>&1 || true
  bash "$ROOT_DIR/k8s/load-image.sh" "$img"
done

echo "== Applying namespace, secrets, configmaps =="
kubectl apply -f "$ROOT_DIR/k8s/00-namespace.yaml"
bash "$ROOT_DIR/k8s/create-secrets.sh"
bash "$ROOT_DIR/k8s/create-configmaps.sh"
kubectl apply -f "$ROOT_DIR/k8s/01-app-config.yaml"

echo "== Applying stateful services =="
kubectl apply -f "$ROOT_DIR/k8s/postgres.yaml"
kubectl apply -f "$ROOT_DIR/k8s/clickhouse.yaml"
kubectl apply -f "$ROOT_DIR/k8s/prometheus.yaml"
kubectl apply -f "$ROOT_DIR/k8s/grafana.yaml"

echo "-- waiting for postgres and clickhouse to be ready before dependents..."
kubectl rollout status deployment/postgres -n newevent --timeout=120s
kubectl rollout status deployment/clickhouse -n newevent --timeout=120s

echo "== Applying non-blue-green app services =="
kubectl apply -f "$ROOT_DIR/k8s/postgres-exporter.yaml"
kubectl apply -f "$ROOT_DIR/k8s/cadvisor.yaml"
kubectl apply -f "$ROOT_DIR/k8s/superset.yaml"

echo "== Applying blue-green services =="
kubectl apply -f "$ROOT_DIR/k8s/blue-green/"

echo "== Applying ingress =="
kubectl apply -f "$ROOT_DIR/k8s/ingress.yaml"

echo "== Waiting for rollouts =="
for entry in $SERVICES; do
  name="${entry%%:*}"
  kubectl rollout status "deployment/${name}-blue" -n newevent --timeout=120s
done
kubectl rollout status deployment/superset -n newevent --timeout=180s
kubectl rollout status deployment/postgres-exporter -n newevent --timeout=60s

echo "== Waiting for superset-seed job =="
kubectl wait --for=condition=complete job/superset-seed -n newevent --timeout=180s || \
  echo "WARNING: superset-seed job did not complete in time, check logs: kubectl logs job/superset-seed -n newevent"

echo "Done. kubectl get pods -n newevent"
kubectl get pods -n newevent
