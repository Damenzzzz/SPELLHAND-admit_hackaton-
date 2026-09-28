#!/bin/sh
# Оптимизация GLB: scripts/.cache/models/*.glb → public/assets/models/*.glb (цель ≤ 2 МБ на модель)
set -e
cd "$(dirname "$0")/.."
mkdir -p public/assets/models
for f in scripts/.cache/models/*.glb; do
  out="public/assets/models/$(basename "$f")"
  npx --yes @gltf-transform/cli optimize "$f" "$out" --compress meshopt --texture-compress webp --texture-size 1024
  echo "$(du -h "$out" | cut -f1) $out"
done
