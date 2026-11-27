#!/usr/bin/env bash
# 一键生成 3D 版《如果你童年的狗，能看着你长大呢》: 配乐 -> 逐帧渲染 (4 进程并行) -> 编码
# 依赖: python3 (numpy), node + playwright (自带 Chromium), ffmpeg
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install
mkdir -p output && python3 make_audio.py
[ "${KEEP_FRAMES:-0}" = 1 ] || rm -rf output/frames
N=$(python3 -c "import json;t=json.load(open('timeline.json'));print(round(t['fps']*t['dur']))"); Q=$(( (N + 3) / 4 ))
for k in 0 1 2 3; do node render.js frames $((k * Q)) $(((k + 1) * Q)) & done; wait
ffmpeg -y -v error -framerate 30 -i output/frames/f_%05d.jpg -i output/_audio.wav \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k -shortest output/dog_grow_3d.mp4
echo "done -> output/dog_grow_3d.mp4"
