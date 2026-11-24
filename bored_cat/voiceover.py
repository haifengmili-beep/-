#!/usr/bin/env python3
"""用离线 TTS (sherpa-onnx + MeloTTS 中文) 生成旁白, 每句一个 wav, 并输出时长.
TTS_MODEL 指向 vits-melo-tts-zh_en 模型目录."""
import json, os, sys
import sherpa_onnx, soundfile as sf

MODEL = os.environ["TTS_MODEL"].rstrip("/") + "/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo")
LINES = [
    "你出门上班的时候，猫在家，会不会很无聊？",
    "其实猫一天要睡十二到十六个小时，你不在，它大半时间都在呼呼大睡。",
    "但要是天天一走就是一整天，它也会闷得发慌。",
    "无聊的猫，会乱抓沙发，半夜跑酷，还会追着你喵喵叫。",
    "出门前陪它玩十分钟，把猫爬架放在窗边，再藏几颗零食。",
    "这样等你回家，它才会精神满满地，冲过来迎接你。",
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
    info.append({"text": s, "file": f"line{i}.wav", "dur": len(a.samples) / a.sample_rate})
json.dump(info, open(os.path.join(OUT, "lines.json"), "w"), ensure_ascii=False, indent=1)
for x in info:
    print(f"{x['dur']:.2f}s  {x['text']}")
print("total", sum(x["dur"] for x in info))
