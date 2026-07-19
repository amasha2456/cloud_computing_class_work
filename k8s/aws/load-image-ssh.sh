#!/bin/bash
set -e

# Loads a local Docker image directly onto the remote k3s EC2 node over SSH,
# bypassing any registry. Useful for manual verification/debugging without
# needing GHCR credentials - the real CI/CD path (deploy-aws.sh) pushes to
# ghcr.io instead, since GitHub Actions runners can't reach this node's
# Docker daemon directly.

IMAGE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="${K3S_HOST:-3.128.60.46}"
KEY="${K3S_KEY:-$ROOT_DIR/k8s/aws/newevent-k3s-key.pem}"

if [ -z "$IMAGE" ]; then
  echo "Usage: $0 <image:tag>" >&2
  exit 1
fi

TAR_NAME="/tmp/$(echo "$IMAGE" | tr '/:' '__').tar"

docker save "$IMAGE" -o "$TAR_NAME"
scp -o StrictHostKeyChecking=no -i "$KEY" "$TAR_NAME" "ubuntu@${HOST}:/tmp/load.tar"
ssh -o StrictHostKeyChecking=no -i "$KEY" "ubuntu@${HOST}" \
  "sudo k3s ctr --address /run/k3s/containerd/containerd.sock --namespace k8s.io images import /tmp/load.tar && rm -f /tmp/load.tar"
rm -f "$TAR_NAME"
