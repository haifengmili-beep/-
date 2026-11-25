#!/usr/bin/env bash
# 一键生成: 旁白 -> 配乐/口型 -> 逐帧渲染 (3 进程并行) -> 编码
# 依赖: python3 (sherpa-onnx soundfile numpy), node + playwright (自带 Chromium), ffmpeg
# 中文 TTS 模型: vits-melo-tts-zh_en, 路径用 TTS_MODEL 指定
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install
python3 voiceover.py
python3 make_audio.py
rm -rf output/frames
node render.js frames 0 470 & node render.js frames 470 940 & node render.js frames 940 1410 & wait
ffmpeg -y -v error -framerate 30 -i output/frames/f_%05d.jpg -i output/_audio.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest output/cat_other_world_v2.mp4
echo "done -> output/cat_other_world_v2.mp4"
