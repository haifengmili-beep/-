#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 欢快 → 越来越快, 每次做选择 叮咚, 切场景 叮, 吃饭/追球/敲门/汪/铃铛/嗅/啪叽 音效, 科普段转温柔和弦."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("eat", 3.2), ("ball", 3.2), ("slipper", 3.2), ("bark", 3.2), ("leash", 3.2), ("sniff", 3.2),
        ("puddle", 3.2), ("rush", 4.0), ("why", 4.6), ("back", 4.8), ("end", 3.6)]
STARTS, acc = {}, 0.0
for n, d in DURS:
    STARTS[n] = acc; acc += d
TOTAL = acc
SR = 44100
TP = 1.0


def main(path):
    n = int(TOTAL * SR) + SR
    out = np.zeros(n)
    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(7)

    def add(sig, t0, vol=1.0):
        i0 = int(t0 * SR); e = min(n, i0 + len(sig)); out[i0:e] += sig[: e - i0] * vol

    def note(f, d, kind="tri"):
        t = tt(d)
        if kind == "tri": s = 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
        elif kind == "sq": s = np.sign(np.sin(2 * np.pi * f * t)) * 0.5
        else: s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
        return s * np.minimum(1, t / 0.01) * np.exp(-t * (3.5 if kind != "sin" else 2.2))

    def noise(d, smooth=20, decay=0):
        k = tt(d); s = np.convolve(rng.standard_normal(len(k)), np.ones(smooth) / smooth, "same")
        return s * (np.exp(-k * decay) if decay else np.sin(np.pi * k / d) ** 2)

    def bark(t0, vol=0.45):   # 合成狗叫: 下滑音高 + 噪声, 方波泛音
        k = tt(0.22); f = 520 - 900 * k
        s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + 0.6 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR)
        s = s * np.minimum(1, k / 0.01) * np.exp(-k * 12) + 0.3 * noise(0.22, 6, 14)
        add(s, t0, vol)

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    calm = STARTS["why"]
    melody = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 74, 76, 74, 72, 69, 67]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t, step = 0.0, 0
    while t < calm - 0.2:
        bpm = 120 + 70 * (t / calm) ** 1.3; beat = 60 / bpm / 2
        add(note(mtof(melody[step % 16]), beat * 1.8, "sin"), t, 0.10)
        add(note(mtof(melody[step % 16] + 12), beat * 1.2, "sq"), t, 0.03)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3)
        if step % 2 == 0:
            add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name, _ in DURS[1:]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)
    def choose(t0, vol=0.16):  # 选定 叮咚
        add(note(mtof(84), 0.3, "sin"), t0, vol); add(note(mtof(91), 0.4, "sin"), t0 + 0.08, vol)
    for name in ["eat", "ball", "slipper", "bark", "leash", "sniff", "puddle", "back"]:
        s0 = STARTS[name]
        for j in range(4): add(note(mtof(88), 0.08, "sq"), s0 + 0.15 + j * 0.2, 0.04)   # 倒计时 滴答
        choose(s0 + TP)
    for j in range(8):  # 咔嚓咔嚓
        add(noise(0.06, 3, 50), STARTS["eat"] + TP + 0.3 + j * 0.16, 0.35)
    k = tt(0.5); add(np.sin(2 * np.pi * (220 + 500 * k) * k) * np.exp(-k * 5), STARTS["ball"] + TP + 0.1, 0.3)   # boing
    add(noise(0.6), STARTS["ball"] + TP + 0.2, 0.3)
    add(noise(0.5), STARTS["slipper"] + TP, 0.4)
    for j in range(4):  # 咚咚 敲门
        k = tt(0.15); add(np.sin(2 * np.pi * 110 * k) * np.exp(-k * 30) + 0.4 * noise(0.15, 8, 40), STARTS["bark"] + 0.1 + j * 0.22, 0.6)
    for b in [1.1, 1.5, 1.9, 2.3, 2.7]: bark(STARTS["bark"] + b)
    for j in range(6):  # 牵引绳 铃铛
        add(note(mtof(100 + (j % 2) * 3), 0.25, "sin"), STARTS["leash"] + TP + 0.1 + j * 0.12, 0.06)
    for j in range(6):  # 嗅嗅
        add(noise(0.12, 2), STARTS["sniff"] + TP + 0.2 + j * 0.28, 0.25)
    add(noise(0.7, 4, 6), STARTS["puddle"] + TP + 0.9, 0.9)   # 啪叽
    k = tt(0.4); add(np.sin(2 * np.pi * (600 - 400 * k) * k) * np.exp(-k * 6), STARTS["puddle"] + TP + 0.9, 0.2)
    r = STARTS["rush"]; tc = 0.0   # 快速选择 叮叮叮
    while tc < 4.0:
        per = 0.5 + (0.28 - 0.5) * tc / 4.0; choose(r + tc + per * 0.55, 0.08); tc += per
    k = tt(1.6); add(np.sin(2 * np.pi * (300 + 500 * k) * k) * 0.5 * np.exp(-k * 1.5), r + 2.3, 0.15)   # 转晕 呜~
    bark(STARTS["back"] + 2.9, 0.25)
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72), (65, 69, 72), (64, 67, 72), (60, 64, 67, 72)]
    for kk, ch in enumerate(soft):
        for jj, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), calm + kk * 1.9 + jj * 0.12, 0.09)
    fade, end = int(1.0 * SR), int(TOTAL * SR)
    out[end - fade:end] *= np.linspace(1, 0, fade); out = out[:end]
    out = out / (np.abs(out).max() + 1e-9) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
    main(os.path.join(HERE, "output", "_audio.wav"))
    print("audio ok", TOTAL)
