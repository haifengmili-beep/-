#!/usr/bin/env python3
"""用离线 TTS (sherpa-onnx + MeloTTS 中文) 生成旁白, 每句一个 wav, 并输出时长."""
import json, os, sys
import sherpa_onnx, soundfile as sf

MODEL = os.environ.get("TTS_MODEL", "/tmp/claude-0/-home-user--/f7906614-e897-5084-bb5f-d7c58c14945a/scratchpad/tts/vits-melo-tts-zh_en/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo")
LINES = [
    "别动。你家猫，正在把你当妈。",
    "小时候，踩一下单，妈妈牌热奶，踩一下，奶就来了，比点外卖还快。",
    "后来它长大了，早就断奶了，可这个习惯，一直没改掉。",
    "你这儿当然踩不出奶，但它不管。",
    "它肉垫上有气味腺，每踩一下，都在给你留味道。",
    "翻译一下，这个人，我的。",
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
