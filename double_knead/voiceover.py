#!/usr/bin/env python3
"""《假如你家猫踩奶的频率每分钟翻一倍》旁白: 用离线 TTS (sherpa-onnx + MeloTTS 中文) 生成旁白, 每句一个 wav, 并输出时长."""
import json, os, sys
import sherpa_onnx, soundfile as sf

MODEL = os.environ.get("TTS_MODEL", "/tmp/claude-0/-home-user--/2087607c-55d3-5e6f-9f8e-c37795eb9bb6/scratchpad/tts/vits-melo-tts-zh_en/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo")
LINES = [
    "假如你家猫踩奶的频率，每分钟翻一倍。",
    "加班到深夜，回到家，往沙发上一躺。",
    "第一分钟，它踩了一下。好治愈。",
    "第五分钟，十六下，像在做按摩。",
    "第十分钟，五百一十二下，爪子已经看不清了。",
    "第十五分钟，一万六千多下，沙发开始冒烟。",
    "第二十分钟，五十二万下，整栋楼都在震，邻居报警了。",
    "第三十分钟，五亿多下，你被踩进了地心。",
    "第三十一分钟，它踩累了，打了个哈欠，睡着了。",
    "而你，明早九点，还要打卡。",
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
