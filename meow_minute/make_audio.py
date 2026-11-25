#!/usr/bin/env python3
"""《每分钟一声喵》配乐 (纯音乐, 无人声): 120 BPM 俏皮马林巴 + 拨弦贝斯 + 轻鼓.
每一声"喵"用一个上扬的铃音标记; 46s 磁带停转 -> 只剩钟表滴答 -> 全静音 -> 摇篮曲 -> 55s 迟到的喵 -> 全员烟花.
输出 output/_audio.wav
"""
import json
import os

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, "timeline.json")))
SR = 44100
DUR = TL["dur"]
N = int(SR * DUR)
BEAT = 60 / TL["bpm"]
BAR = BEAT * 4
rng = np.random.default_rng(1)


def m2f(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(buf, sig, t, g=1.0):
    i = int(round(t * SR))
    if i >= len(buf) or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * g


def tt(sec):
    return np.arange(int(SR * sec)) / SR


def marimba(m, v=0.5):
    f, t = m2f(m), tt(1.2)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + 0.25 * np.sin(2 * np.pi * f * 3.9 * t) * np.exp(-t * 30) + 0.1 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 60)
    return s * np.minimum(1, t / 0.002) * v * 0.3


def glock(m, v=0.4):
    f, t = m2f(m), tt(1.8)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 3) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 7) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12)
    return s * np.minimum(1, t / 0.001) * v * 0.18


def pluck_bass(m, v=0.6, dur=0.4):
    f, t = m2f(m), tt(dur + 0.2)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * np.exp(-t * 6)
    return s * np.minimum(1, t / 0.004) * np.clip(1 - (t - dur) / 0.15, 0, 1) * v * 0.35


def musicbox(m, v=0.5):
    f, t = m2f(m), tt(2.2)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.4) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 11)
    return s * np.minimum(1, t / 0.002) * v * 0.2


def pad(ms, dur, v=0.08):
    t = tt(dur + 1.0)
    s = sum(np.sin(2 * np.pi * m2f(m) * 2 ** (d / 12) * t + rng.uniform(0, 6)) for m in ms for d in (-0.1, 0.1))
    return s * np.minimum(1, t / 0.4) * np.clip(1 - (t - dur) / 1.0, 0, 1) * v / len(ms)


def kick(v=0.6):
    t = tt(0.35)
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * v


def clap(v=0.25):
    t = tt(0.25)
    n = rng.normal(0, 1, len(t))
    n = n - np.convolve(n, np.ones(6) / 6, "same")  # 高通
    env = np.exp(-t * 22) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * t) > 0) * (t < 0.03))
    return n * env * v


def hat(v=0.08):
    t = tt(0.06)
    n = rng.normal(0, 1, len(t))
    n = n - np.convolve(n, np.ones(3) / 3, "same")
    return n * np.exp(-t * 80) * v


def tick(v=0.12, f=2600):
    t = tt(0.05)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 180) + rng.normal(0, 0.4, len(t)) * np.exp(-t * 400)) * v


def boom(v=0.4):  # 烟花
    t = tt(1.2)
    n = rng.normal(0, 1, len(t))
    n = np.convolve(n, np.ones(30) / 30, "same")
    return (n * np.exp(-t * 5) * 3 + np.sin(2 * np.pi * 60 * t) * np.exp(-t * 8)) * v


def meow_cue(v=1.0):  # 上扬的 "叮-咚↑" + 小 boing
    out = np.zeros(int(SR * 2))
    for k, (m, d) in enumerate([(91, 0.0), (96, 0.09)]):
        add(out, glock(m, 0.9 * v), d)
    t = tt(0.3)
    f = 600 + 700 * np.minimum(1, t / 0.12)
    add(out, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14) * 0.12 * v, 0.0)
    return out


music = np.zeros(N)
CH = {"C": (48, [60, 64, 67]), "Am": (45, [57, 60, 64]), "F": (41, [57, 60, 65]), "G": (43, [59, 62, 67])}
PROG = ["C", "Am", "F", "G"]
MEL = {
    "C": [72, None, 76, 79, None, 76, 72, None],
    "Am": [69, None, 72, 76, None, 72, 69, 71],
    "F": [65, 69, 72, None, 77, None, 76, 74],
    "G": [71, None, 74, 79, None, 77, 74, None],
}
MEL2 = {  # 变奏 (更跳)
    "C": [79, 76, 79, 84, None, 83, 79, None],
    "Am": [81, None, 79, 76, 72, None, 76, None],
    "F": [77, 81, 84, None, 81, 77, 76, 74],
    "G": [74, 79, 83, None, 86, None, 83, 79],
}


def groove_bar(t0, name, level, var=False):
    bass, notes = CH[name]
    # 低音
    for b, (off, m) in enumerate([(0, bass), (1.5, bass + 12), (2, bass + 7), (3.5, bass + 12)]):
        add(music, pluck_bass(m, 0.6 if b % 2 == 0 else 0.4, 0.35), t0 + off * BEAT)
    # 旋律
    mel = (MEL2 if var else MEL)[name]
    for k, m in enumerate(mel):
        if m:
            add(music, marimba(m, 0.55 if k % 2 == 0 else 0.42), t0 + k * BEAT / 2 + (0.012 if k % 2 else 0))  # 轻微摇摆
    # 和弦 (马林巴反拍)
    if level >= 1:
        for off in (1, 3):
            for m in notes:
                add(music, marimba(m, 0.18), t0 + off * BEAT)
    # 鼓
    if level >= 1:
        add(music, kick(0.55), t0); add(music, kick(0.45), t0 + 2 * BEAT)
        add(music, clap(0.18), t0 + BEAT); add(music, clap(0.18), t0 + 3 * BEAT)
        for k in range(8):
            add(music, hat(0.05 if k % 2 else 0.035), t0 + k * BEAT / 2)
    if level >= 2:
        add(music, kick(0.35), t0 + 2.5 * BEAT)
        for k in range(8):
            if k % 2:
                add(music, glock(mel[k - 1] + 12 if mel[k - 1] else notes[2] + 12, 0.18), t0 + k * BEAT / 2)
    if level >= 3:
        add(music, pad([bass + 24] + notes, BAR, 0.07), t0)


# intro 0-6: 马林巴独奏 + 时钟滴答
for i, name in enumerate(["C", "Am", "F"]):
    groove_bar(i * BAR, name, 0)
for k in range(12):
    add(music, tick(0.05), k * 0.5)
# 6-46: 主体 (每场景 4 小节, 越来越满)
LEVEL = {6: 1, 14: 1, 22: 2, 30: 2, 38: 3}
t0 = 6.0
bar = 0
while t0 < 46.0 - 1e-6:
    sec = max(k for k in LEVEL if k <= t0 + 1e-6)
    groove_bar(t0, PROG[bar % 4], LEVEL[sec], var=(sec >= 22 and (bar // 4) % 2 == 1))
    t0 += BAR
    bar += 1
add(music, pad([60, 64, 67, 72], 0.5, 0.05), 5.5)  # 入鼓前的提气

# 每一声喵的铃音
for m in TL["meows"]:
    if m < 46:
        add(music, meow_cue(1.0), m)

# 46.0: 磁带停转 (把 45.5-46.3 的音乐减速)
seg_t0, seg_len = 45.4, 1.0
i0 = int(seg_t0 * SR)
seg = music[i0:i0 + int(seg_len * SR)].copy()
rate = np.linspace(1.0, 0.05, len(seg)) ** 1.3
pos = np.cumsum(rate)
pos = pos[pos < len(seg) - 1]
stopped = np.interp(pos, np.arange(len(seg)), seg) * np.linspace(1, 0, len(pos)) ** 0.7
music[int(45.4 * SR):] = 0.0
add(music, stopped, seg_t0)
# 46.4-48: 只有越来越响的滴答 (秒针逼近 12)
for k, t in enumerate(np.arange(46.4, 48.0, 0.5)):
    add(music, tick(0.10 + k * 0.03, 2400), t)
add(music, kick(0.25), 47.0); add(music, kick(0.3), 47.5)  # 心跳
# 48.0-51.5: 完全静音 (等待……)
# 51.5-55: 摇篮曲 (音乐盒, 慢)
lull = [(76, 0), (79, 0.5), (84, 1.0), (83, 1.75), (79, 2.25), (76, 2.75)]
for m, o in lull:
    add(music, musicbox(m, 0.5), 51.8 + o)
add(music, pad([48, 55, 64], 3.2, 0.06), 51.6)
add(music, musicbox(72, 0.3), 54.2)
# 54.4 哈欠 (下滑的音乐盒)
for k, m in enumerate([84, 83, 81, 79]):
    add(music, musicbox(m, 0.25), 54.35 + k * 0.08)
# 55.0 迟到的喵 + 鼓点加花
add(music, meow_cue(1.4), 55.0)
for k in range(8):
    add(music, kick(0.25 + k * 0.03) if k % 2 == 0 else clap(0.12 + k * 0.02), 55.0 + 0.5 + k * BEAT / 4)
# 56-60: 终章 (全员)
for i, name in enumerate(["C", "Am", "F", "G"]):
    if 56 + i * BAR < 59.5:
        groove_bar(56.0 + i * BAR, name, 3, var=True)
music[int(59.5 * SR):] *= 0  # 收在一个重音上
for m in (48, 60, 64, 67, 72, 76, 79, 84):
    add(music, marimba(m, 0.35), 59.5)
    add(music, glock(m + 12, 0.2), 59.5)
add(music, kick(0.6), 59.5)
add(music, meow_cue(0.8), 59.55)
for k in range(7):
    add(music, boom(0.12), 56.1 + k * 0.5 + 0.6)

# 混响 + 立体声
def ir(sec, seed):
    r = np.random.default_rng(seed); t = tt(sec)
    h = r.normal(0, 1, len(t)) * np.exp(-t * 6.9 / sec)
    h = np.convolve(h, np.ones(16) / 16, "same"); h[: int(SR * 0.01)] = 0
    return h / np.sqrt(np.sum(h ** 2))


def fftconv(x, h):
    n = len(x) + len(h) - 1; nf = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(h, nf), nf)[: len(x)]


L = music + fftconv(music, ir(1.6, 1)) * 0.16
R = music + fftconv(music, ir(1.6, 2)) * 0.16
mix = np.stack([L, R], 1)
mix[: int(SR * 0.05)] *= np.linspace(0, 1, int(SR * 0.05))[:, None]
mix[-int(SR * 0.3):] *= np.linspace(1, 0, int(SR * 0.3))[:, None]
mix = np.tanh(mix / np.abs(mix).max() * 1.2) * 0.9
os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
sf.write(os.path.join(HERE, "output", "_audio.wav"), mix.astype(np.float32), SR, subtype="PCM_16")
print("audio ok", mix.shape)
