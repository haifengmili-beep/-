#!/usr/bin/env bash
# 一键生成 3D 版《假如你家狗每分钟做一次选择》: 配乐 -> 逐帧渲染 (4 进程并行) -> 编码
# 依赖: python3 (numpy), node + playwright (自带 Chromium), ffmpeg.  KEEP_FRAMES=1 可续渲
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install
mkdir -p output && python3 make_audio.py
[ "${KEEP_FRAMES:-0}" = 1 ] || rm -rf output/frames
node render.js frames 0 318 & node render.js frames 318 636 & node render.js frames 636 954 & node render.js frames 954 1272 & wait
ffmpeg -y -v error -framerate 30 -i output/frames/f_%05d.jpg -i output/_audio.wav \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k -shortest output/dog_choice_3d.mp4
echo "done -> output/dog_choice_3d.mp4"
