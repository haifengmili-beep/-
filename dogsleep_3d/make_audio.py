#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 夜里轻快 → 越来越闹, 切场景 叮, 跑酷/摔杯/喵/起床音效, 科普段转温柔和弦."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("s0", 3.4), ("s1", 3.4), ("s3", 3.2), ("s4", 3.2), ("s5", 3.6), ("s6", 3.6), ("why", 5.0), ("back", 4.8), ("end", 3.6)]
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
        bpm = 104 + 70 * (t / calm); beat = 60 / bpm / 2
        night = t < STARTS["s5"]
        add(note(mtof(melody[step % 16] - (12 if night else 0)), beat * 1.8, "sin"), t, 0.10)
        if not night: add(note(mtof(melody[step % 16] + 12), beat * 1.2, "sq"), t, 0.03)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 2 == 0 and step % 4 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3)
        if step % 2 == 0:
            add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name in ["s0", "s1", "s3", "s4", "s5", "s6", "why"]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)
    for j in range(8):  # 跑酷 哒哒哒
        k = tt(0.06); add(np.sin(2 * np.pi * 900 * k) * np.exp(-k * 70), STARTS["s1"] + 0.3 + j * 0.16, 0.18)
    k = tt(0.5)  # 摔杯 啪
    add(rng.standard_normal(len(k)) * np.exp(-k * 14), STARTS["s3"] + 1.5, 0.45)
    for f in (2400, 3100, 2700):
        add(np.sin(2 * np.pi * f * k) * np.exp(-k * 9), STARTS["s3"] + 1.52, 0.12)
    def meow(t0, vol=0.35):  # 合成 喵~
        k = tt(0.55); f = 600 + 500 * np.sin(np.pi * np.clip(k / 0.5, 0, 1)) ** 1.5
        ph = 2 * np.pi * np.cumsum(f) / SR
        add((np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * np.sin(np.pi * np.clip(k / 0.55, 0, 1)) ** 0.7, t0, vol)
    meow(STARTS["s5"] + 0.4); meow(STARTS["s5"] + 1.5); meow(STARTS["s5"] + 2.6, 0.4)
    for j in range(3):  # 6 点 起床铃
        add(note(mtof(84 + j * 4), 0.6, "sin"), STARTS["s6"] + 0.3 + j * 0.12, 0.15)
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
