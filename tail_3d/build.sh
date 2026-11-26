#!/usr/bin/env bash
# 一键生成 3D 版《假如你家猫每天多一条尾巴》: 配乐 -> 逐帧渲染 (4 进程并行) -> 编码
# 依赖: python3 (numpy pillow), node + playwright (自带 Chromium), ffmpeg
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install
mkdir -p output && python3 make_audio.py
rm -rf output/frames
node render.js frames 0 291 & node render.js frames 291 582 & node render.js frames 582 873 & node render.js frames 873 1164 & wait
ffmpeg -y -v error -framerate 30 -i output/frames/f_%05d.jpg -i output/_audio.wav \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k -shortest output/cat_tails_3d.mp4
echo "done -> output/cat_tails_3d.mp4"
