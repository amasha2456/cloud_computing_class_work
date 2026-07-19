#!/bin/bash
set -e

# Generates ConfigMaps directly from existing source files, so there's a
# single source of truth (no content duplicated into hand-written YAML).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kubectl create configmap postgres-init \
  --from-file=init.sql="$ROOT_DIR/db/init.sql" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap clickhouse-init \
  --from-file=init.sql="$ROOT_DIR/clickhouse/init.sql" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap prometheus-config \
  --from-file=prometheus.yml="$ROOT_DIR/observability/prometheus.yml" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-datasource \
  --from-file="$ROOT_DIR/observability/grafana/provisioning/datasources/prometheus.yaml" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboard-provider \
  --from-file="$ROOT_DIR/observability/grafana/provisioning/dashboards/dashboards.yaml" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap grafana-dashboards \
  --from-file="$ROOT_DIR/observability/grafana/dashboards/" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

kubectl create configmap superset-seed-script \
  --from-file=seed-dashboard.mjs="$ROOT_DIR/superset/seed-dashboard.mjs" \
  -n newevent --dry-run=client -o yaml | kubectl apply -f -

echo "ConfigMaps created/updated in namespace newevent."
