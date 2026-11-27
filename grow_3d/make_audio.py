#!/usr/bin/env python3
"""程序合成配乐 (无旁白): 怀旧八音盒主题 → 12岁转小调 → 离家变稀疏 → 圣诞铃铛 + 爆发 → 温柔和弦淡出. 切场景 叮."""
import os, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DURS = [("title", 3.2), ("age6", 4.2), ("age9", 3.8), ("age12", 4.2), ("age15", 4.4), ("age18", 4.4),
        ("wait", 4.0), ("xmas", 4.8), ("ball", 4.6), ("fact", 4.6), ("end", 4.4)]
STARTS, acc = {}, 0.0
for n, d in DURS:
    STARTS[n] = acc; acc += d
TOTAL = acc
SR = 44100


def main(path):
    n = int(TOTAL * SR) + SR
    out = np.zeros(n)
    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(3)

    def add(sig, t0, vol=1.0):
        i0 = int(t0 * SR); e = min(n, i0 + len(sig)); out[i0:e] += sig[: e - i0] * vol

    def box(f, d):   # 八音盒: 正弦 + 高次泛音, 快速衰减
        t = tt(d)
        s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12)
        return s * np.minimum(1, t / 0.004) * np.exp(-t * 3.2)

    def pad(f, d):
        t = tt(d)
        s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(2 * np.pi * f * 1.003 * t)
        return s * np.minimum(1, t / 0.25) * np.minimum(1, (d - t) / 0.6)

    def thump(f0=90, d=0.15, k=25):
        t = tt(d); return np.sin(2 * np.pi * (f0 * np.exp(-t * k)) * t * 6) * np.exp(-t * 30)

    def noise(d, smooth=20):
        k = tt(d); return np.convolve(rng.standard_normal(len(k)), np.ones(smooth) / smooth, "same")

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    # 主题 (3/4 拍, 每小节 3 个音) — 大调 / 小调
    major = [76, 79, 84, 83, 79, 76, 74, 77, 81, 79, 76, 72, 72, 76, 79, 81, 79, 77, 76, 74, 72, 74, 76, 79]
    minor = [m - (1 if m % 12 in (4, 9, 11) else 0) for m in major]
    chordsM = [(48, 55, 64), (43, 50, 59), (45, 52, 60), (41, 48, 57)]
    chordsm = [(45, 52, 60), (41, 48, 57), (43, 50, 59), (40, 47, 56)]
    t, step = 0.0, 0
    end_music = STARTS["fact"]
    while t < end_music - 0.1:
        sec = max(k for k, v in STARTS.items() if v <= t + 1e-6)
        sad = sec in ("age12",)
        sparse = sec in ("age18", "wait")
        bpm = {"title": 92, "age6": 100, "age9": 108, "age12": 84, "age15": 96, "age18": 80, "wait": 72, "xmas": 116, "ball": 88}[sec]
        beat = 60 / bpm
        mel = minor if sad else major
        if not (sparse and step % 3 == 1):
            add(box(mtof(mel[step % 24]), 1.6), t, 0.11)
        if step % 3 == 0:
            ch = (chordsm if sad else chordsM)[(step // 6) % 4]
            for jj, m in enumerate(ch): add(box(mtof(m + 12), 1.8), t + jj * 0.02, 0.045)
            add(pad(mtof(ch[0]), beat * 3), t, 0.05 if not sparse else 0.03)
        if sec in ("age9", "xmas") and step % 3 == 0: add(thump(), t, 0.22)
        if sec == "xmas" and t > STARTS["xmas"] + 2.4:   # 雪橇铃
            k = tt(0.12); add(noise(0.12, 2) * np.sin(2 * np.pi * 7000 * k) * np.exp(-k * 30), t + beat / 2, 0.05)
        t += beat; step += 1
    for name in ["age6", "age9", "age12", "age15", "age18", "wait", "xmas", "ball", "fact"]:  # 切场景 叮
        add(box(mtof(96), 0.6), STARTS[name], 0.08); add(box(mtof(103), 0.6), STARTS[name] + 0.07, 0.07)
    # 音效
    add(noise(0.25, 3) * np.exp(-tt(0.25) * 14), STARTS["age6"] + 0.7, 0.5)                 # 礼花 啪
    for j in range(5): add(box(mtof(90 + j * 3), 0.3), STARTS["age6"] + 0.75 + j * 0.05, 0.05)
    for j, tb in enumerate([1.5, 1.68, 1.8]): add(thump(180, 0.1, 35), STARTS["age9"] + tb, 0.35 - j * 0.08)   # 球弹跳
    k = tt(4.2); add(noise(4.2, 6) * np.minimum(1, k / 0.5) * np.minimum(1, (4.2 - k) / 0.5), STARTS["age12"], 0.05)  # 雨声
    for j in range(4): add(thump(200, 0.08, 40), STARTS["age15"] + 1.3 + j * 0.16, 0.25 - j * 0.05)  # 球滚走
    add(thump(70, 0.3, 12), STARTS["age18"] + 2.6, 0.6)                                    # 关门
    for j in range(8): add(box(mtof(98 + (j % 3) * 4), 0.25), STARTS["xmas"] + 0.3 + j * 0.06, 0.06)   # 叮铃铃
    for j, mm in enumerate([84, 88, 91, 96, 100]): add(box(mtof(mm), 0.8), STARTS["xmas"] + 1.25 + j * 0.07, 0.09)
    for j in range(4):
        k = tt(0.12); add(np.sin(2 * np.pi * (650 - 1600 * k) * k) * np.exp(-k * 20), STARTS["xmas"] + 2.5 + j * 0.5, 0.2)
    # 事实 + 结尾: 温柔和弦
    soft = [(60, 64, 67, 72), (57, 60, 64, 69), (53, 57, 60, 65), (55, 59, 62, 67), (60, 64, 67, 72)]
    for kk, ch in enumerate(soft):
        for jj, m in enumerate(ch): add(pad(mtof(m), 2.4), STARTS["fact"] + kk * 1.8 + jj * 0.05, 0.05)
    for kk, m in enumerate([76, 74, 72, 74, 76, 79, 76, 72, 74, 72]):
        add(box(mtof(m), 1.4), STARTS["fact"] + 0.4 + kk * 0.85, 0.08)
    fade, end = int(1.2 * SR), int(TOTAL * SR)
    out[end - fade:end] *= np.linspace(1, 0, fade); out = out[:end]
    out = out / (np.abs(out).max() + 1e-9) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
    main(os.path.join(HERE, "output", "_audio.wav"))
    print("audio ok", TOTAL)
