#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 欢快 → 越来越快, 切场景 叮, 擦除/关灯/扑的音效, 科普段转温柔和弦."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("height", 3.6), ("color", 3.6), ("fov", 3.4), ("far", 3.4), ("near", 3.2),
        ("night", 3.8), ("motion", 3.8), ("why", 4.6), ("back", 4.8), ("end", 3.6)]
STARTS, acc = {}, 0.0
for n, d in DURS:
    STARTS[n] = acc; acc += d
TOTAL = acc
SR = 44100


def main(path):
    n = int(TOTAL * SR) + SR
    out = np.zeros(n)
    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(9)

    def add(sig, t0, vol=1.0):
        i0 = int(t0 * SR); e = min(n, i0 + len(sig)); out[i0:e] += sig[: e - i0] * vol

    def note(f, d, kind="tri"):
        t = tt(d)
        if kind == "tri": s = 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
        elif kind == "sq": s = np.sign(np.sin(2 * np.pi * f * t)) * 0.5
        else: s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
        return s * np.minimum(1, t / 0.01) * np.exp(-t * (3.5 if kind != "sin" else 2.2))

    def noise_sweep(d, smooth=20):
        k = tt(d)
        return np.convolve(rng.standard_normal(len(k)), np.ones(smooth) / smooth, "same") * np.sin(np.pi * k / d) ** 2

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    calm = STARTS["why"]
    melody = [72, 76, 79, 76, 81, 79, 76, 74, 72, 74, 76, 79, 76, 74, 72, 67]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t, step = 0.0, 0
    while t < calm - 0.2:
        bpm = 116 + 56 * (t / calm); beat = 60 / bpm / 2
        night = STARTS["night"] + 0.3 <= t < STARTS["motion"]
        add(note(mtof(melody[step % 16] - (12 if night else 0)), beat * 1.8, "sin"), t, 0.10)
        if not night: add(note(mtof(melody[step % 16] + 12), beat * 1.2, "sq"), t, 0.03)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 2 == 0 and step % 4 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3)
        if step % 2 == 0:
            add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name in ["height", "color", "fov", "far", "near", "night", "motion", "why"]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)
    k = tt(1.1)  # 眼睛降下去: 下滑音
    add(np.sin(2 * np.pi * (700 - 450 * k) * k) * np.exp(-k * 2), STARTS["height"] + 0.5, 0.2)
    add(noise_sweep(1.0), STARTS["color"] + 0.5, 0.5)           # 擦除 嗖
    add(noise_sweep(0.8), STARTS["fov"] + 0.6, 0.4)
    k = tt(0.08); add(np.sin(2 * np.pi * 1200 * k) * np.exp(-k * 60), STARTS["night"] + 0.3, 0.5)  # 关灯 啪
    add(noise_sweep(0.9), STARTS["night"] + 1.0, 0.5)
    for j in range(3):  # 锁定 嘀嘀
        k = tt(0.1); add(np.sin(2 * np.pi * 1600 * k) * np.exp(-k * 30), STARTS["motion"] + 0.6 + j * 0.18, 0.15)
    k = tt(0.6)  # 扑 boing
    add(np.sin(2 * np.pi * (250 + 600 * k) * k) * np.exp(-k * 5), STARTS["motion"] + 2.95, 0.35)
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
