#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 俏皮 → 越来越快越紧张, 切场景 叮, 每双鞋落地 噗, 松口 啪嗒 + 震, 科普/反转转温柔和弦, 淡出."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.0), ("flip", 3.4), ("croc", 3.2), ("plaid", 3.2), ("bunny", 3.6), ("black", 3.6),
        ("drop", 3.4), ("why", 4.8), ("warm", 4.8), ("end", 4.0)]
STARTS, acc = {}, 0.0
for n, d in DURS:
    STARTS[n] = acc; acc += d
TOTAL = acc
SR = 44100
PLACE_AT, FLY, DROP_AT = 0.3, 0.55, 1.05


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

    def thud(d=0.25, f0=160):
        k = tt(d); return np.sin(2 * np.pi * f0 * np.exp(-k * 12) * k * 3) * np.exp(-k * 18)

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    calm = STARTS["why"]
    # 俏皮的"做贼心虚"小调: 跳音 + 低音
    melody = [69, 72, 76, 72, 74, 71, 67, 71, 69, 72, 76, 79, 77, 76, 74, 71]
    chords = [(45, 52, 60), (43, 50, 59), (41, 48, 57), (40, 47, 56)]
    t, step = 0.0, 0
    while t < calm - 0.2:
        bpm = 112 + 64 * (t / calm); beat = 60 / bpm / 2
        add(note(mtof(melody[step % 16]), beat * 1.4, "sin"), t, 0.10)
        add(note(mtof(melody[step % 16] + 12), beat * 0.8, "sq"), t, 0.025)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 4 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3)
        if step % 2 == 0:
            add(rng.standard_normal(int(0.04 * SR)) * np.exp(-tt(0.04) * 80), t + beat, 0.04)
        t += beat; step += 1
    for name in ["flip", "croc", "plaid", "bunny", "black", "drop", "why", "warm", "end"]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), STARTS[name], 0.12); add(note(mtof(103), 0.5, "sin"), STARTS[name] + 0.07, 0.10)
    for name in ["flip", "croc", "plaid", "bunny", "black"]:   # 鞋飞过去 嗖 + 落地 噗噗
        k = tt(0.5); add(np.convolve(rng.standard_normal(len(k)), np.ones(30) / 30, "same") * np.sin(np.pi * k / 0.5) ** 2, STARTS[name] + PLACE_AT, 0.5)
        add(thud(), STARTS[name] + PLACE_AT + FLY, 0.5)
        if name != "black": add(thud(), STARTS[name] + PLACE_AT + FLY + 0.14, 0.4)
    k = tt(0.5)   # 兔子拖鞋 boing
    add(np.sin(2 * np.pi * (300 + 500 * k) * k) * np.exp(-k * 6), STARTS["bunny"] + 0.95, 0.25)
    for j in range(3):   # 锁定 嘀嘀
        k = tt(0.1); add(np.sin(2 * np.pi * 1600 * k) * np.exp(-k * 30), STARTS["black"] + 1.8 + j * 0.18, 0.15)
    k = tt(0.45)   # 掉落 下滑音 + 啪嗒 + 低频震
    add(np.sin(2 * np.pi * (900 - 600 * k / 0.45) * k) * np.exp(-k * 3), STARTS["drop"] + DROP_AT, 0.15)
    add(thud(0.4, 120), STARTS["drop"] + DROP_AT + 0.45, 0.9)
    add(rng.standard_normal(int(0.06 * SR)) * np.exp(-tt(0.06) * 60), STARTS["drop"] + DROP_AT + 0.45, 0.3)
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72), (65, 69, 72), (64, 67, 72), (60, 64, 67, 72)]
    for kk, ch in enumerate(soft):
        for jj, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), calm + kk * 1.95 + jj * 0.12, 0.09)
    fade, end = int(1.2 * SR), int(TOTAL * SR)
    out[end - fade:end] *= np.linspace(1, 0, fade); out = out[:end]
    out = out / (np.abs(out).max() + 1e-9) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
    main(os.path.join(HERE, "output", "_audio.wav"))
    print("audio ok", TOTAL)
