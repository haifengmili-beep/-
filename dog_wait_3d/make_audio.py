#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 欢快 → 越来越快越紧张, 切场景 叮, 关门/脚步/嚎叫/开门音效, 科普段转温柔和弦."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("m1", 3.2), ("m10", 3.2), ("m30", 3.0), ("h1", 3.2), ("h3", 3.2), ("h5", 3.4),
        ("h8", 3.6), ("open", 4.4), ("why", 4.8), ("back", 4.8), ("end", 3.6)]
STARTS, acc = {}, 0.0
for n, d in DURS:
    STARTS[n] = acc; acc += d
TOTAL = acc
SR = 44100


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

    def thump(f0=90, d=0.15, k=25):
        t = tt(d); return np.sin(2 * np.pi * (f0 * np.exp(-t * k)) * t * 6) * np.exp(-t * 30)

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    calm = STARTS["why"]
    melody = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 74, 76, 74, 72, 69, 67]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t, step = 0.0, 0
    while t < calm - 0.2:
        bpm = 112 + 64 * (t / calm); beat = 60 / bpm / 2
        sad = STARTS["h5"] <= t < STARTS["h8"]            # 第5小时: 低八度, 小调一点
        m = melody[step % 16] - (12 if sad else 0) - (1 if sad and melody[step % 16] % 12 == 4 else 0)
        add(note(mtof(m), beat * 1.8, "sin"), t, 0.10)
        if not sad: add(note(mtof(m + 12), beat * 1.2, "sq"), t, 0.03)
        if step % 4 == 0:
            for c in chords[(step // 8) % 4]: add(note(mtof(c - (1 if sad and c % 12 == 4 else 0)), beat * 4, "tri"), t, 0.08)
        if step % 4 == 0: add(thump(), t, 0.3)
        if step % 2 == 0: add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name in ["m1", "m10", "m30", "h1", "h3", "h5", "h8", "open", "why"]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)
    add(thump(70, 0.3, 12), STARTS["m1"] + 0.3, 0.8)                      # 关门 砰
    add(rng.standard_normal(int(0.06 * SR)) * np.exp(-tt(0.06) * 50), STARTS["m1"] + 0.3, 0.2)
    for j in range(3):                                                    # 脚步 哒哒哒
        add(thump(160, 0.12, 30), STARTS["m10"] + 0.4 + j * 0.3, 0.5)
    k = tt(0.6); add(np.sin(2 * np.pi * (520 - 260 * k) * k) * np.exp(-k * 3), STARTS["m10"] + 2.1, 0.15)  # 失望 下滑
    k = tt(0.9); add(np.convolve(rng.standard_normal(len(k)), np.ones(40) / 40, "same") * np.sin(np.pi * k / 0.9) ** 2, STARTS["m30"] + 1.3, 0.5)  # 叹气
    for j in range(2):                                                    # 嗷呜 (带颤音的滑音)
        t0 = STARTS["h8"] + 0.6 + j * 1.6; k = tt(1.1)
        f = 420 + 360 * np.sin(np.pi * np.minimum(k / 0.7, 1) * 0.5) - 120 * np.maximum(0, k - 0.7) + 12 * np.sin(2 * np.pi * 6 * k)
        ph = 2 * np.pi * np.cumsum(f) / SR
        add((np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.minimum(1, k / 0.1) * np.minimum(1, (1.1 - k) / 0.3), t0, 0.16)
    for j in range(24):                                                   # 钟 嘀嗒 (越来越快)
        add(note(mtof(100 if j % 2 else 93), 0.05, "sin"), STARTS["h8"] + j * 0.14, 0.05)
    for j in range(3):                                                    # 钥匙 咔哒
        add(note(mtof(98 + j * 3), 0.08, "sin"), STARTS["open"] + 0.3 + j * 0.05, 0.12)
    add(thump(220, 0.08, 40), STARTS["open"] + 0.45, 0.4)
    k = tt(0.6); add(np.sin(2 * np.pi * (180 + 80 * np.sin(k * 30)) * k) * np.exp(-k * 4), STARTS["open"] + 1.0, 0.25)  # 门 吱呀
    for j, mm in enumerate([84, 88, 91, 96, 100]):                        # 开门 闪亮琶音
        add(note(mtof(mm), 0.6, "sin"), STARTS["open"] + 1.1 + j * 0.06, 0.12)
    for j in range(6):                                                    # 开心 汪!
        k = tt(0.12); add(np.sin(2 * np.pi * (700 - 1800 * k) * k) * np.exp(-k * 20), STARTS["open"] + 2.1 + j * 0.38, 0.25)
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72), (65, 69, 72), (64, 67, 72), (60, 64, 67, 72)]
    for kk, ch in enumerate(soft):
        for jj, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), calm + kk * 1.9 + jj * 0.12, 0.09)
    for kk, m in enumerate([76, 79, 84, 79, 81, 79, 76, 72, 74, 76, 79, 84]):   # 温柔小旋律
        add(note(mtof(m), 1.0, "sin"), STARTS["back"] + kk * 0.62, 0.06)
    fade, end = int(1.0 * SR), int(TOTAL * SR)
    out[end - fade:end] *= np.linspace(1, 0, fade); out = out[:end]
    out = out / (np.abs(out).max() + 1e-9) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
    main(os.path.join(HERE, "output", "_audio.wav"))
    print("audio ok", TOTAL)
