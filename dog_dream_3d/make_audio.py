#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 摇篮曲式开场 → 越来越快; 切场景 叮; 嚼/蹬腿/汪/骨头雨等音效; 科普段转温柔和弦, 最后淡出."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("bone", 3.4), ("ball", 3.4), ("field", 3.6), ("cat", 3.4), ("rain", 3.4),
        ("stack", 3.8), ("why", 4.8), ("back", 4.8), ("end", 3.6)]
STARTS, acc = {}, 0.0
for n, d in DURS:
    STARTS[n] = acc; acc += d
TOTAL = acc
SR = 44100


def main(path):
    n = int(TOTAL * SR) + SR
    out = np.zeros(n)
    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(12)

    def add(sig, t0, vol=1.0):
        i0 = int(t0 * SR); e = min(n, i0 + len(sig)); out[i0:e] += sig[: e - i0] * vol

    def note(f, d, kind="tri"):
        t = tt(d)
        if kind == "tri": s = 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
        elif kind == "sq": s = np.sign(np.sin(2 * np.pi * f * t)) * 0.5
        elif kind == "bell": s = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)
        else: s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
        return s * np.minimum(1, t / 0.01) * np.exp(-t * (3.5 if kind in ("tri", "sq") else 2.2))

    def noise(d, smooth=20, decay=0):
        k = tt(d)
        env = np.sin(np.pi * k / d) ** 2 if not decay else np.exp(-k * decay)
        return np.convolve(rng.standard_normal(len(k)), np.ones(smooth) / smooth, "same") * env

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    calm = STARTS["why"]
    melody = [72, 76, 79, 84, 79, 76, 74, 79, 72, 76, 79, 81, 79, 77, 76, 74]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t, step = 0.0, 0
    while t < calm - 0.2:
        bpm = 104 + 76 * (t / calm) ** 1.3; beat = 60 / bpm / 2
        dreaming = STARTS["field"] <= t < STARTS["stack"]
        add(note(mtof(melody[step % 16]), beat * 1.8, "bell" if t < STARTS["bone"] else "sin"), t, 0.10)
        if dreaming or t > STARTS["stack"]: add(note(mtof(melody[step % 16] + 12), beat * 1.2, "sq"), t, 0.03)
        if dreaming and step % 2: add(note(mtof(melody[(step + 2) % 16] + 12), beat * 2, "bell"), t, 0.04)  # 梦里的亮晶晶
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if t > STARTS["bone"] and step % 4 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3)
        if t > STARTS["bone"] and step % 2 == 0:
            add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name in ["bone", "ball", "field", "cat", "rain", "stack", "why", "back"]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)
    for k in range(2):  # 呼噜 (开场睡觉)
        add(noise(0.9, 400) * (1 + 0.5 * np.sin(2 * np.pi * 30 * tt(0.9))), 0.3 + k * 1.3, 1.2)
    for j in range(8):  # 吧唧吧唧
        add(noise(0.06, 6, 60), STARTS["bone"] + 0.8 + j * 0.225, 0.35)
    k = tt(0.25)
    for j in range(6):  # 球 boing
        add(np.sin(2 * np.pi * (300 + 500 * k) * k) * np.exp(-k * 12), STARTS["ball"] + 0.3 + j * 0.6, 0.18)
    sweep = tt(1.0); add(np.sin(2 * np.pi * (300 + 900 * sweep ** 2) * sweep) * np.sin(np.pi * sweep) * 0.6 + noise(1.0) * 0.6, STARTS["field"] - 0.3, 0.35)  # 钻进梦里
    add(noise(0.6), STARTS["field"] + 1.2, 0.35)                     # 飞盘 嗖
    add(note(mtof(88), 0.4, "bell"), STARTS["field"] + 2.95, 0.2)    # 接住 叮
    def bark(t0, f=420):
        k = tt(0.18); s = np.sin(2 * np.pi * (f + 260 * np.exp(-k * 18)) * k) + 0.6 * noise(0.18, 3, 0)
        add(s * np.exp(-k * 14), t0, 0.3)
    bark(STARTS["cat"] + 0.9); bark(STARTS["cat"] + 1.15, 460)
    k = tt(0.5)  # 呜呜
    for j in range(2): add(np.sin(2 * np.pi * (700 + 120 * np.sin(np.pi * k)) * k) * np.sin(np.pi * k / 0.5) ** 2, STARTS["cat"] + 1.6 + j * 0.65, 0.12)
    for j in range(16):  # 骨头雨 叮叮咚咚
        add(note(mtof(84 + (j * 5) % 12), 0.2, "bell"), STARTS["rain"] + 0.3 + j * 0.18, 0.08)
    k = tt(1.6); add(np.sin(2 * np.pi * (200 + 500 * k / 1.6) * k) * 0.2, STARTS["stack"] + 0.2, 0.3)  # 60 个梦 上升音
    for j in range(6): add(note(mtof(76 + j * 2), 0.3, "bell"), STARTS["stack"] + 0.15 + j * 0.22, 0.12)  # 泡泡 啵
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72), (65, 69, 72), (64, 67, 72), (60, 64, 67, 72)]
    for kk, ch in enumerate(soft):
        for jj, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), calm + kk * 1.9 + jj * 0.12, 0.09)
    add(note(mtof(91), 0.8, "bell"), STARTS["back"] + 2.2, 0.15)    # 醒啦
    bark(STARTS["back"] + 2.5, 520)
    fade, end = int(1.0 * SR), int(TOTAL * SR)
    out[end - fade:end] *= np.linspace(1, 0, fade); out = out[:end]
    out = out / (np.abs(out).max() + 1e-9) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
    main(os.path.join(HERE, "output", "_audio.wav"))
    print("audio ok", TOTAL)
