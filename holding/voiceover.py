#!/usr/bin/env python3
"""用离线 TTS (sherpa-onnx + MeloTTS 中文) 生成旁白, 每句一个 wav, 并输出时长."""
import json, os, sys
import sherpa_onnx, soundfile as sf

MODEL = os.environ.get("TTS_MODEL", "/tmp/claude-0/-home-user--/f43f8c86-3a86-5199-bc1b-49944e5c333f/scratchpad/tts/vits-melo-tts-zh_en/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo")
LINES = [
    "别抱了，你家猫心里正在喊救命。",
    "先是懵，然后开始扭，最后甩尾巴、蹬后腿，放我下来！",
    "因为四脚离地，它就没法自己逃跑，本能会紧张。",
    "但不让抱，不代表不爱你。慢眨眼，蹭蹭你，就是在说爱你。",
    "正确抱法：一手托胸，一手托屁股，四只脚都有支撑。",
    "一甩尾巴，马上放下。",
]
SPEED = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0

m = MODEL
cfg = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=m + "model.onnx", lexicon=m + "lexicon.txt",
                                                   tokens=m + "tokens.txt", dict_dir=m + "dict"),
        num_threads=4),
    rule_fsts=f"{m}date.fst,{m}number.fst,{m}phone.fst")
tts = sherpa_onnx.OfflineTts(cfg)
os.makedirs(OUT, exist_ok=True)
info = []
for i, s in enumerate(LINES):
    a = tts.generate(s, sid=0, speed=SPEED)
    p = os.path.join(OUT, f"line{i}.wav")
    sf.write(p, a.samples, a.sample_rate)
    info.append({"text": s, "file": p, "dur": len(a.samples) / a.sample_rate})
json.dump(info, open(os.path.join(OUT, "lines.json"), "w"), ensure_ascii=False, indent=1)
for x in info:
    print(f"{x['dur']:.2f}s  {x['text']}")
print("total", sum(x["dur"] for x in info))
