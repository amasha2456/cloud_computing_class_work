#!/bin/bash
set -e

# Rolls a service back to whichever blue-green slot is currently idle,
# reversing blue-green-deploy.sh's cutover. The idle slot was scaled to 0
# but never had its image changed, so it still runs whatever was live
# before the last cutover - scaling it back up restores exactly that.
#
# Usage: rollback.sh <service-name>

SERVICE="$1"
NAMESPACE="newevent"

if [ -z "$SERVICE" ]; then
  echo "Usage: $0 <service-name>" >&2
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

TARGET_IMAGE=$(kubectl get deployment "${SERVICE}-${TARGET_SLOT}" -n "$NAMESPACE" -o jsonpath="{.spec.template.spec.containers[0].image}")

echo "[$SERVICE] currently active slot: $CURRENT_SLOT -> rolling back to slot: $TARGET_SLOT ($TARGET_IMAGE)"

kubectl scale "deployment/${SERVICE}-${TARGET_SLOT}" --replicas=1 -n "$NAMESPACE"
kubectl rollout status "deployment/${SERVICE}-${TARGET_SLOT}" -n "$NAMESPACE" --timeout=120s

echo "[$SERVICE] smoke-testing $TARGET_SLOT slot..."
LOCAL_PORT=$((10000 + RANDOM % 10000))
kubectl port-forward "deployment/${SERVICE}-${TARGET_SLOT}" "${LOCAL_PORT}:${CONTAINER_PORT}" -n "$NAMESPACE" >/tmp/pf-${SERVICE}-rollback.log 2>&1 &
PF_PID=$!

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
  echo "[$SERVICE] smoke test FAILED (HTTP $HTTP_CODE) on rollback target $TARGET_SLOT - not cutting over. Scaling it back down." >&2
  kubectl scale "deployment/${SERVICE}-${TARGET_SLOT}" --replicas=0 -n "$NAMESPACE"
  exit 1
fi

echo "[$SERVICE] smoke test passed (HTTP $HTTP_CODE) - cutting traffic back to $TARGET_SLOT"
kubectl patch service "$SERVICE" -n "$NAMESPACE" -p "{\"spec\":{\"selector\":{\"app\":\"${SERVICE}\",\"slot\":\"${TARGET_SLOT}\"}}}"

echo "[$SERVICE] waiting for endpoints/ingress to converge on the restored slot before draining the bad one..."
sleep 8

echo "[$SERVICE] scaling down slot: $CURRENT_SLOT"
kubectl scale "deployment/${SERVICE}-${CURRENT_SLOT}" --replicas=0 -n "$NAMESPACE"

echo "[$SERVICE] rollback done. Active slot is now $TARGET_SLOT running $TARGET_IMAGE."
