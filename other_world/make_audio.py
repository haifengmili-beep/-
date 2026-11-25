#!/usr/bin/env python3
"""配乐 + 旁白 + 音效 合成 (纯 numpy).

输出:
  output/_audio.wav   44.1kHz 立体声, 与 timeline.json 对齐
  vo/envelope.json    旁白逐帧音量包络 (驱动猫咪口型) + 每句时长
用法: python3 voiceover.py && python3 make_audio.py
"""
import json
import os
import wave

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, "timeline.json")))
SR = 44100
DUR = TL["dur"]
N = int(SR * DUR)
rng = np.random.default_rng(3)


def m2f(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(buf, sig, t, gain=1.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


# ------------------------------------------------------------------ instruments
def piano(m, dur=2.5, vel=0.6):
    f = m2f(m)
    n = int(SR * (dur + 1.5))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h, a in enumerate([1.0, 0.45, 0.22, 0.12, 0.07, 0.04], start=1):
        fh = f * h * (1 + 0.0004 * h * h)
        dec = 1.2 + 0.9 * h + f / 600
        out += a * np.sin(2 * np.pi * fh * t) * np.exp(-t * dec)
    att = np.minimum(1, t / 0.006)
    rel = np.clip(1 - (t - dur) / 0.6, 0, 1)
    hammer = rng.normal(0, 1, n) * np.exp(-t * 120) * 0.03
    return (out * att * rel + hammer) * vel * 0.25


def musicbox(m, vel=0.5):
    f = m2f(m)
    n = int(SR * 2.6)
    t = np.arange(n) / SR
    out = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
           + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)
           + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 11))
    return out * np.minimum(1, t / 0.002) * vel * 0.2


def pad(ms, dur, vel=0.12):
    n = int(SR * (dur + 2.0))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in ms:
        f = m2f(m)
        for det in (-0.12, 0.0, 0.11):
            fd = f * 2 ** (det / 12)
            ph = rng.uniform(0, 6.28)
            out += (np.sin(2 * np.pi * fd * t + ph) + 0.3 * np.sin(4 * np.pi * fd * t + ph) + 0.1 * np.sin(6 * np.pi * fd * t + ph))
    env = np.minimum(1, t / 1.2) * np.clip(1 - (t - dur) / 2.0, 0, 1)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 0.25 * t)
    return out * env * trem * vel / (len(ms) * 3)


def bell(f, vel=0.4, decay=1.6):
    n = int(SR * 3)
    t = np.arange(n) / SR
    out = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * decay * d)
              for r, a, d in [(1, 1, 1), (2.0, 0.4, 1.6), (3.01, 0.25, 2.4), (4.17, 0.15, 3.4)])
    return out * np.minimum(1, t / 0.003) * vel * 0.2


def tick(vel=0.12):
    n = int(SR * 0.06)
    t = np.arange(n) / SR
    return (rng.normal(0, 1, n) * np.exp(-t * 300) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 200)) * vel


def boing(vel=0.25):
    n = int(SR * 0.35)
    t = np.arange(n) / SR
    f = 380 + 420 * np.minimum(1, t / 0.18)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * np.minimum(1, t / 0.005) * vel


def reverb_ir(sec=3.0, seed=0, damp=1.0):
    r = np.random.default_rng(seed)
    n = int(SR * sec)
    t = np.arange(n) / SR
    ir = r.normal(0, 1, n) * np.exp(-t * 3.0 / sec * 2.3)
    # 高频更快衰减: 简单做法 — 叠加一个平滑版本
    k = 24
    sm = np.convolve(ir, np.ones(k) / k, mode="same")
    ir = sm * damp + ir * (1 - damp) * np.exp(-t * 6)
    ir[: int(SR * 0.012)] = 0
    return ir / np.sqrt(np.sum(ir ** 2))


def fftconv(x, h):
    n = len(x) + len(h) - 1
    nf = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(h, nf), nf)[:len(x)]
    return y


# ------------------------------------------------------------------ score
music = np.zeros(N)
box = np.zeros(N)
CH = {  # 和弦 (低音, [和弦音])
    "F": (41, [65, 69, 72]), "C": (36, [64, 67, 72]), "C/E": (40, [64, 67, 72]), "Dm": (38, [62, 65, 69]),
    "Bb": (34, [62, 65, 70]), "Gm": (43, [62, 67, 70]), "Csus": (36, [65, 67, 72]), "F/A": (45, [65, 69, 72]),
}


def chord(name, t, dur, vel=0.5, arp=True, padv=0.10, low=True):
    bass, notes = CH[name]
    add(music, piano(bass, dur, vel * 0.9), t)
    if low:
        add(music, piano(bass + 12, dur, vel * 0.45), t + 0.01)
    if arp:
        step = dur / 4
        for k, m in enumerate([notes[0], notes[1], notes[2], notes[1]]):
            add(music, piano(m, step * 1.8, vel * (0.55 if k else 0.62)), t + k * step + 0.02)
    if padv:
        add(music, pad([bass + 24] + notes, dur, padv), t)


# A: 黄昏的房间 (略带忧伤)
for name, t, d in [("Dm", 0.3, 2.0), ("Bb", 2.3, 2.0), ("F", 4.3, 1.9), ("Csus", 6.2, 1.1), ("C", 7.3, 1.1)]:
    chord(name, t, d, vel=0.42, padv=0.05)
for i, t in enumerate(np.arange(0.0, 6.3, 1.0)):
    add(music, tick(0.05 if i % 2 else 0.065), t)
# 升起的光: 上行音盒琶音
for i, m in enumerate([72, 77, 79, 81, 84, 86, 89, 91, 93, 96]):
    add(box, musicbox(m, 0.32 + i * 0.03), 6.35 + i * 0.19)
add(music, pad([60, 65, 72, 77], 2.0, 0.07), 6.3)

# B: 云端 (温暖)
B0, BD = 8.4, 2.1
seqB = ["F", "C", "Dm", "Bb", "F", "C", "Bb", "C"]
melB = [[81, 84, 77], [79, 76, 72], [77, 81, 86], [86, 84, 82], [81, 84, 89], [88, 86, 84], [86, 82, 77], [79, None, None]]
for i, (name, mel) in enumerate(zip(seqB, melB)):
    t = B0 + i * BD
    chord(name, t, BD, vel=0.5, padv=0.09)
    for k, m in enumerate(mel):
        if m:
            add(box, musicbox(m, 0.55 if k == 0 else 0.42), t + k * BD / 3)
add(box, bell(m2f(96), 0.25), 8.5)   # 出现的闪光

# C: 云边往下看 (安静)
for name, t, d in [("Bb", 25.2, 2.1), ("Gm", 27.3, 1.4), ("Csus", 28.7, 0.7), ("C", 29.4, 0.6)]:
    chord(name, t, d, vel=0.38, padv=0.06, low=False)

# D: 回忆 + 约定 (最满)
D0, DD = 30.0, 1.9
seqD = ["F", "C/E", "Dm", "Bb", "Gm", "C"]
melD = [[(72, 0.5), (77, 0.5), (81, 1.0)], [(79, 1.5), (76, 0.5)], [(77, 0.5), (81, 0.5), (84, 1.0)],
        [(86, 1.5), (84, 0.5)], [(82, 0.5), (81, 0.5), (79, 1.0)], [(79, 0.5), (81, 0.5), (84, 1.0)]]
for i, (name, mel) in enumerate(zip(seqD, melD)):
    t = D0 + i * DD
    chord(name, t, DD, vel=0.55, padv=0.13)
    tt = t
    for m, beats in mel:
        add(music, piano(m, beats * DD / 2 * 1.4, 0.75), tt)
        add(box, musicbox(m + 12, 0.18), tt)
        tt += beats * DD / 2
# 约定段尾的心心
for k in range(6):
    add(box, bell(m2f(84 + [0, 4, 7, 12, 7, 16][k]), 0.12), 39.2 + k * 0.33)

# E: 结尾 (解决到主和弦, 余音)
for name, t, d in [("Bb", 41.4, 1.6), ("C", 43.0, 1.6), ("F", 44.6, 2.4)]:
    chord(name, t, d, vel=0.5, padv=0.1)
for m, t in [(74, 41.4), (77, 41.8), (82, 42.2), (76, 43.0), (79, 43.4), (84, 43.8), (81, 44.6), (89, 45.4)]:
    add(music, piano(m, 1.6, 0.6), t)
for i in range(5):  # 光的脚印
    add(box, bell(m2f(84 + [0, 2, 4, 7, 9][i]), 0.16), 41.7 + i * 0.42)
for i, t in enumerate(np.arange(41.6, 44.6, 1.0)):
    add(music, tick(0.035), t)

# 音效
sfx = np.zeros(N)
add(sfx, boing(0.12), 22.95)
add(sfx, boing(0.08), 23.62)
# 天空空气感
air = rng.normal(0, 1, N)
air = np.convolve(air, np.ones(200) / 200, mode="same")
air *= 0.25 / (np.abs(air).max() + 1e-9)
skymask = np.zeros(N)
tt = np.arange(N) / SR
skymask = np.clip((tt - 8.4) / 1.5, 0, 1) * np.clip((41.4 - tt) / 1.0, 0, 1)
sfx += air * skymask * 0.25

# ------------------------------------------------------------------ voiceover
vo_info = json.load(open(os.path.join(HERE, "vo", "lines.json")))
vo = np.zeros(N)
durs = []
for i, x in enumerate(vo_info):
    a, sr = sf.read(os.path.join(HERE, "vo", x["file"]))
    if a.ndim > 1:
        a = a.mean(1)
    if sr != SR:
        idx = np.arange(0, len(a), sr / SR)
        a = np.interp(idx, np.arange(len(a)), a)
    a = a / (np.abs(a).max() + 1e-9) * 0.8
    fade = int(SR * 0.02)
    a[:fade] *= np.linspace(0, 1, fade); a[-fade:] *= np.linspace(1, 0, fade)
    add(vo, a, TL["vo"][i])
    durs.append(len(a) / SR)

# 口型包络
fps = TL["fps"]
hop = SR // fps
env = []
for f in range(int(DUR * fps)):
    seg = vo[f * hop:(f + 1) * hop]
    env.append(float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0)
env = np.array(env)
env = np.clip(env / (np.percentile(env[env > 0.01], 90) + 1e-9), 0, 1)
env = np.convolve(env, [0.25, 0.5, 0.25], mode="same")
json.dump({"fps": fps, "env": [round(float(v), 3) for v in env], "durs": durs},
          open(os.path.join(HERE, "vo", "envelope.json"), "w"))

# ------------------------------------------------------------------ mix
duck = np.ones(N)
for i, d in enumerate(durs):
    a, b = TL["vo"][i] - 0.15, TL["vo"][i] + d + 0.2
    duck -= 0.32 * np.clip(np.minimum((tt - a) / 0.25, (b - tt) / 0.4), 0, 1)
mus = (music + box * 1.1) * duck + sfx
irL, irR = reverb_ir(3.2, 1), reverb_ir(3.2, 2)
irvL, irvR = reverb_ir(1.4, 3), reverb_ir(1.4, 4)
L = mus * 0.72 + fftconv(mus, irL) * 0.30 + vo * 0.95 + fftconv(vo, irvL) * 0.10
R = mus * 0.72 + fftconv(mus, irR) * 0.30 + vo * 0.95 + fftconv(vo, irvR) * 0.10
# 声像: 音盒稍偏右, 增加宽度
L += fftconv(box * duck, irL) * 0.05
R += box * duck * 0.08
mix = np.stack([L, R], 1)
# 整体淡入淡出
mix[: int(SR * 0.3)] *= np.linspace(0, 1, int(SR * 0.3))[:, None]
fo = int(SR * 2.0)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
mix = np.tanh(mix / np.abs(mix).max() * 1.15) * 0.89
os.makedirs(os.path.join(HERE, "output"), exist_ok=True)
sf.write(os.path.join(HERE, "output", "_audio.wav"), mix.astype(np.float32), SR, subtype="PCM_16")
print("audio ok", mix.shape, "vo durs", [round(d, 2) for d in durs])
