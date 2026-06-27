#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="open-live-strom-ndi:0.6.6"
NDI_SDK="/home/nygard/ndi-sdk-temp/NDI SDK for Linux"

echo "=== Build Strom + NDI Docker Image ==="

# Prepare NDI libraries for Docker build context
rm -rf ndi-libs
mkdir -p ndi-libs
cp -v "$NDI_SDK/lib/x86_64-linux-gnu/libndi.so.6."* ndi-libs/

echo ""
echo "Building Docker image: $IMAGE"
docker build -t "$IMAGE" .

echo ""
echo "Cleaning up build context..."
rm -rf ndi-libs

echo ""
echo "=== Done ==="
echo "Image built: $IMAGE"
echo "Use it with: docker compose --profile ndi up -d"
