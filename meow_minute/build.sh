#!/usr/bin/env bash
# 一键生成《假如你家的猫每分钟叫一声喵》: 配乐 -> 逐帧渲染 (3 进程并行) -> 编码
# 依赖: python3 (numpy soundfile), node + playwright (自带 Chromium), ffmpeg
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install
python3 make_audio.py
rm -rf output/frames
node render.js frames 0 600 & node render.js frames 600 1200 & node render.js frames 1200 1800 & wait
ffmpeg -y -v error -framerate 30 -i output/frames/f_%05d.jpg -i output/_audio.wav \
  -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k -shortest output/cat_meow_every_minute_60s.mp4
echo "done -> output/cat_meow_every_minute_60s.mp4"
