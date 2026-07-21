#!/bin/bash
set -e

# Runs ON the EC2 instance itself (piped over SSH, not executed locally).
# Uses k3s's own local kubectl against 127.0.0.1:6443 - no Kubernetes API
# port needs to be exposed to the internet at all with this approach, only
# SSH (22) does, which is what actually reaches this script in the first
# place.
#
# Bootstraps k3s itself on first run (idempotent - skipped once k3s is
# already installed). Relies on the default Ubuntu AMI's passwordless sudo
# for the `ubuntu` user, since this runs non-interactively over SSH.
#
# Usage (from the caller, over ssh): bash -s -- <tag> <dockerhub-username>
# Expects ~/env-staging/.env to already be in place (written by the caller
# via scp before this runs) - contains the secrets for k8s/create-secrets.sh.

TAG="$1"
DOCKERHUB_USERNAME="$2"
APP_DIR="$HOME/app"

if [ -z "$TAG" ] || [ -z "$DOCKERHUB_USERNAME" ]; then
  echo "Usage: deploy-on-server.sh <tag> <dockerhub-username>" >&2
  exit 1
fi

export PATH="$PATH:/usr/local/bin"

if ! command -v k3s >/dev/null 2>&1; then
  echo "== k3s not found - installing (first run on this server) =="
  curl -sfL https://get.k3s.io | sh -
  echo "== Waiting for k3s node to be Ready =="
  until sudo k3s kubectl get nodes 2>/dev/null | grep -q " Ready"; do
    sleep 2
  done
fi

mkdir -p "$HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
sudo chown "$(id -u):$(id -g)" "$HOME/.kube/config"
chmod 600 "$HOME/.kube/config"

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
bash k8s/create-configmaps.sh
kubectl apply -f k8s/01-app-config.yaml

echo "== Applying stateful services (idempotent) =="
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/clickhouse.yaml
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/grafana.yaml
kubectl rollout status deployment/postgres -n newevent --timeout=120s
kubectl rollout status deployment/clickhouse -n newevent --timeout=120s

echo "== Applying non-blue-green app services =="
kubectl apply -f k8s/postgres-exporter.yaml
kubectl apply -f k8s/cadvisor.yaml
kubectl apply -f k8s/superset.yaml
kubectl set image deployment/superset "superset=docker.io/${DOCKERHUB_USERNAME}/newevent-superset:${TAG}" -n newevent
kubectl rollout status deployment/superset -n newevent --timeout=300s || \
  echo "WARNING: superset rollout did not finish in time, check: kubectl get pods -n newevent -l app=superset"
kubectl rollout status deployment/postgres-exporter -n newevent --timeout=60s || \
  echo "WARNING: postgres-exporter rollout did not finish in time, check: kubectl get pods -n newevent -l app=postgres-exporter"

echo "== Applying cert-manager (idempotent - installs on first run, no-op after) =="
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=120s
kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=120s
kubectl wait --for=condition=Available deployment/cert-manager-cainjector -n cert-manager --timeout=120s
kubectl apply -f k8s/cert-manager-issuer.yaml

echo "== Applying ingress (idempotent) =="
kubectl apply -f k8s/aws/ingress.yaml

SERVICES="analytics-service event-service program-service registration-service auth-service frontend-service"
for name in $SERVICES; do
  image="docker.io/${DOCKERHUB_USERNAME}/newevent-${name}:${TAG}"

  if kubectl get deployment "${name}-blue" -n newevent >/dev/null 2>&1; then
    echo "== ${name}: already deployed - blue-green cutover to ${image} =="
    bash k8s/blue-green-deploy.sh "$name" "$image"
  else
    echo "== ${name}: first deploy - bootstrapping with blue active =="
    kubectl apply -f "k8s/blue-green/${name}.yaml"
    kubectl set image "deployment/${name}-blue" "${name}=${image}" -n newevent
    kubectl rollout status "deployment/${name}-blue" -n newevent --timeout=180s || \
      echo "WARNING: ${name}-blue rollout did not finish in time, check: kubectl get pods -n newevent -l app=${name}"
  fi
done

echo "== Waiting for superset-seed job =="
kubectl wait --for=condition=complete job/superset-seed -n newevent --timeout=180s || \
  echo "WARNING: superset-seed job did not complete in time, check logs: kubectl logs job/superset-seed -n newevent"

echo "Done. kubectl get pods -n newevent:"
kubectl get pods -n newevent
