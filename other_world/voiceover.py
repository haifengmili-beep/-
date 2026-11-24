#!/usr/bin/env python3
"""离线 TTS (sherpa-onnx + MeloTTS 中文) 生成《假如你的猫已在另一个世界》旁白."""
import json, os, sys
import sherpa_onnx, soundfile as sf

MODEL = os.environ.get("TTS_MODEL", "/tmp/claude-0/-home-user--/5a698c84-6fe1-5be7-aabc-f77eef6f83b6/scratchpad/tts/vits-melo-tts-zh_en/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo")
LINES = [
    "嘿，是我呀。我在这边，过得很好。",
    "这里的阳光，每天都晒在我最喜欢的地方。",
    "罐头吃不完，身上，也再也不疼了。",
    "别总盯着我的空碗发呆啦。",
    "你给我的那些年，我全都带过来了。",
    "下辈子，我还要找到你。记得好好吃饭哦。",
]
SPEED = float(sys.argv[1]) if len(sys.argv) > 1 else 0.9
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
    info.append({"text": s, "file": f"line{i}.wav", "dur": len(a.samples) / a.sample_rate})
json.dump(info, open(os.path.join(OUT, "lines.json"), "w"), ensure_ascii=False, indent=1)
for x in info:
    print(f"{x['dur']:.2f}s  {x['text']}")
print("total", sum(x["dur"] for x in info))
