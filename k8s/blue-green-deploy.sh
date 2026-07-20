#!/bin/bash
set -e

# Blue-green cutover for one of the 7 user-facing services.
# Usage: blue-green-deploy.sh <service-name> <image-tag>
#
# Only needed for updates - the initial `kubectl apply` of the manifests in
# k8s/blue-green/ already starts with slot=blue active and slot=green idle
# (replicas: 0), so there's nothing to cut over to on a first deploy.

SERVICE="$1"
IMAGE="$2"
NAMESPACE="newevent"

if [ -z "$SERVICE" ] || [ -z "$IMAGE" ]; then
  echo "Usage: $0 <service-name> <image-tag>" >&2
  exit 1
fi

HEALTH_PATH="/health"
if [ "$SERVICE" = "frontend-service" ]; then
  HEALTH_PATH="/"
fi

CONTAINER_PORT=$(kubectl get service "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')
CURRENT_SLOT=$(kubectl get service "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.selector.slot}')

if [ "$CURRENT_SLOT" = "blue" ]; then
  TARGET_SLOT="green"
else
  TARGET_SLOT="blue"
fi

echo "[$SERVICE] current active slot: $CURRENT_SLOT -> deploying $IMAGE to slot: $TARGET_SLOT"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$IMAGE" in
  docker.io/*)
    echo "[$SERVICE] image is a registry reference - the cluster will pull it directly, no local load needed."
    ;;
  *)
    bash "$SCRIPT_DIR/load-image.sh" "$IMAGE"
    ;;
esac

kubectl set image "deployment/${SERVICE}-${TARGET_SLOT}" "${SERVICE}=${IMAGE}" -n "$NAMESPACE"
kubectl scale "deployment/${SERVICE}-${TARGET_SLOT}" --replicas=1 -n "$NAMESPACE"
kubectl rollout status "deployment/${SERVICE}-${TARGET_SLOT}" -n "$NAMESPACE" --timeout=120s

echo "[$SERVICE] smoke-testing $TARGET_SLOT slot..."
LOCAL_PORT=$((10000 + RANDOM % 10000))
kubectl port-forward "deployment/${SERVICE}-${TARGET_SLOT}" "${LOCAL_PORT}:${CONTAINER_PORT}" -n "$NAMESPACE" >/tmp/pf-${SERVICE}.log 2>&1 &
PF_PID=$!

# Port-forward tunnel setup time varies (near-instant for local kind,
# a couple seconds for a remote cluster over the internet) - retry instead
# of a single fixed-delay attempt.
HTTP_CODE="000"
for attempt in $(seq 1 10); do
  sleep 1
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${LOCAL_PORT}${HEALTH_PATH}" || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi
done
kill "$PF_PID" 2>/dev/null || true
wait "$PF_PID" 2>/dev/null || true

if [ "$HTTP_CODE" != "200" ]; then
  echo "[$SERVICE] smoke test FAILED (HTTP $HTTP_CODE) - not cutting over. Rolling back image on $TARGET_SLOT." >&2
  kubectl scale "deployment/${SERVICE}-${TARGET_SLOT}" --replicas=0 -n "$NAMESPACE"
  exit 1
fi

echo "[$SERVICE] smoke test passed (HTTP $HTTP_CODE) - cutting traffic over to $TARGET_SLOT"
kubectl patch service "$SERVICE" -n "$NAMESPACE" -p "{\"spec\":{\"selector\":{\"app\":\"${SERVICE}\",\"slot\":\"${TARGET_SLOT}\"}}}"

echo "[$SERVICE] waiting for endpoints/ingress to converge on the new slot before draining the old one..."
sleep 8

echo "[$SERVICE] scaling down old slot: $CURRENT_SLOT (kept at 0 replicas for instant rollback)"
kubectl scale "deployment/${SERVICE}-${CURRENT_SLOT}" --replicas=0 -n "$NAMESPACE"

echo "[$SERVICE] done. Active slot is now $TARGET_SLOT running $IMAGE."
