#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 欢快 → 越来越快, 切场景 叮, 狗说话的叽里咕噜声/汪/敲门, 科普段转温柔和弦."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("m1", 3.2), ("m2", 3.2), ("m5", 3.2), ("m10", 3.4), ("m20", 3.4),
        ("m30", 3.4), ("m45", 3.8), ("why", 4.6), ("back", 4.8), ("end", 3.6)]
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
        night = False
        add(note(mtof(melody[step % 16] - (12 if night else 0)), beat * 1.8, "sin"), t, 0.10)
        if not night: add(note(mtof(melody[step % 16] + 12), beat * 1.2, "sq"), t, 0.03)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 2 == 0 and step % 4 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3)
        if step % 2 == 0:
            add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name in ["m1", "m2", "m5", "m10", "m20", "m30", "m45", "why"]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)

    def woof(t0, vol=0.35, f0=330):  # 汪: 下滑音 + 噪声
        k = tt(0.22)
        s = np.sin(2 * np.pi * np.cumsum(f0 * (1 - 0.45 * k / 0.22)) / SR) * np.exp(-k * 14)
        s += 0.4 * rng.standard_normal(len(k)) * np.exp(-k * 30)
        add(s, t0, vol)

    def babble(t0, d, base=72, vol=0.13):  # 叽里咕噜说话声: 一串随机音高的短音
        t = t0
        while t < t0 + d:
            f = mtof(base + rng.integers(-3, 8)); L = 0.06 + rng.random() * 0.05
            k = tt(L); s = np.sign(np.sin(2 * np.pi * f * k)) * 0.5 * np.sin(np.pi * k / L)
            add(s, t, vol); t += L + 0.02
    for name, a, d in [("m1", 0.9, 0.4), ("m2", 0.8, 0.8), ("m5", 0.9, 1.4), ("m10", 0.8, 0.9), ("m20", 0.8, 1.1), ("m30", 0.7, 1.1), ("back", 2.0, 0.7)]:
        babble(STARTS[name] + a, d, base=74 if name != "back" else 79)
    babble(STARTS["m45"] + 0.2, 3.5, base=76, vol=0.16)
    for name in ["m1", "m2", "m5", "m10", "m20", "m30", "m45", "why"]:
        add(np.sin(2 * np.pi * (180 - 120 * tt(0.25)) * tt(0.25)) * np.exp(-tt(0.25) * 10), STARTS[name] + 0.62, 0.3)  # 落地 咚
    woof(STARTS["title"] + 0.6); woof(STARTS["title"] + 0.9, 0.3, 380)
    woof(STARTS["m5"] + 0.6, 0.4); woof(STARTS["m5"] + 2.6, 0.3)
    for j in range(3):  # 敲门 咚咚咚
        k = tt(0.12); add(np.sin(2 * np.pi * 140 * k) * np.exp(-k * 35) + 0.3 * rng.standard_normal(len(k)) * np.exp(-k * 60), STARTS["m5"] + 0.3 + j * 0.2, 0.5)
    add(noise_sweep(0.6), STARTS["m10"] + 0.2, 0.4)          # 棉花 噗
    k = tt(0.5); add(np.sin(2 * np.pi * (300 + 500 * k) * k) * np.exp(-k * 5), STARTS["m20"] + 2.25, 0.3)  # 坐下 boing
    k = tt(0.35); add(np.sin(2 * np.pi * (900 - 500 * k) * k) * np.exp(-k * 6), STARTS["m30"] + 1.2, 0.25)  # 喵?!
    k = tt(0.3); add(np.sin(2 * np.pi * (600 + 900 * k) * k) * np.exp(-k * 7), STARTS["m1"] + 1.3, 0.2)     # 惊讶
    woof(STARTS["back"] + 2.9, 0.3, 420)
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
