#!/bin/bash
set -e

# Loads a local Docker image into the kind node's containerd.
#
# `kind load docker-image` hardcodes `ctr images import --all-platforms`,
# which fails on images with multi-platform manifest lists where the local
# Docker store only holds the current platform's content (common with
# Docker Desktop's default buildx output, and with any pulled multi-arch
# image such as postgres/clickhouse/grafana/prometheus). Working around it
# by saving to a tar and importing directly without --all-platforms.

IMAGE="$1"
CLUSTER_NAME="${CLUSTER_NAME:-newevent}"
NODE="${CLUSTER_NAME}-control-plane"

if [ -z "$IMAGE" ]; then
  echo "Usage: $0 <image:tag>" >&2
  exit 1
fi

TAR_NAME="/$(echo "$IMAGE" | tr '/:' '__').tar"

docker save "$IMAGE" -o "/tmp/kind-load.tar"
docker cp "/tmp/kind-load.tar" "${NODE}:${TAR_NAME}"
docker exec "$NODE" ctr --namespace=k8s.io images import "$TAR_NAME"
docker exec "$NODE" rm -f "$TAR_NAME"
rm -f "/tmp/kind-load.tar"
