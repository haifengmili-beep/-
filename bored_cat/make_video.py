#!/usr/bin/env python3
"""混音 (八音盒 BGM + 旁白 + 音效) 并与 frames/ 合成最终 mp4.
步骤: TTS_MODEL=... python3 voiceover.py && node render.js && python3 make_video.py"""
import json, os, subprocess, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "output", "cat_bored_alone_38s.mp4")
SR, DUR, FPS = 44100, 38.0, 30
VO_START = [1.0, 6.4, 13.5, 18.3, 24.3, 31.4]
n = int(DUR * SR)
rng = np.random.default_rng(7)


def note(nm):
    idx = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[nm[0]]
    return 440.0 * 2 ** ((idx + 12 * (int(nm[1]) + 1) - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def add(buf, t0, sig, g=1.0):
    s0 = int(t0 * SR); m = min(len(sig), len(buf) - s0)
    if m > 0: buf[s0:s0 + m] += g * sig[:m]


def pluck(f, dur=1.4, decay=3.5):
    x = tt(dur)
    return np.minimum(1, x / 0.004) * np.exp(-x * decay) * (np.sin(2 * np.pi * f * x) + 0.3 * np.sin(4 * np.pi * f * x) * np.exp(-x * 6))


def load_wav(p):
    with wave.open(p) as w:
        sr = w.getframerate(); sw = w.getsampwidth()
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16 if sw == 2 else np.int32).astype(np.float64)
        a /= 32768 if sw == 2 else 2 ** 31
        if w.getnchannels() > 1: a = a.reshape(-1, w.getnchannels()).mean(1)
    if sr != SR: a = np.interp(np.arange(int(len(a) * SR / sr)) * sr / SR, np.arange(len(a)), a)
    return a


def meow(dur=0.45, f0=620):
    x = tt(dur); k = x / dur
    f = f0 * (1 + 0.35 * np.sin(np.pi * k)) * (1 - 0.25 * k)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = sum(np.sin(ph * h) / h for h in range(1, 6))
    return s * np.sin(np.pi * k) ** 0.7 * 0.5


music, vo, sfx = np.zeros(n), np.zeros(n), np.zeros(n)
mel = ["E5", "G5", "A5", "G5", "E5", "D5", "C5", None, "D5", "E5", "G5", "E5", "D5", None, "C5", None,
       "E5", "G5", "C6", "B5", "A5", "G5", "E5", None, "F5", "E5", "D5", "C5", "D5", None, None, None]
bass = ["C3", "A2", "F2", "G2"]
k = 0
while k * 0.3 < DUR:
    t = k * 0.3
    if mel[k % 32]: add(music, t, pluck(note(mel[k % 32])), 0.2)
    if k % 8 == 0: add(music, t, pluck(note(bass[(k // 8) % 4]), 2.6, 1.6), 0.16)
    k += 1
info = json.load(open(os.path.join(HERE, "vo", "lines.json")))
for st, li in zip(VO_START, info):
    a = load_wav(os.path.join(HERE, "vo", li["file"]))
    add(vo, st, a / (np.abs(a).max() + 1e-9) * 0.9)
env = np.convolve((np.abs(vo) > 0.02).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
music *= 1 - 0.55 * np.clip(env * 3, 0, 1)
noise = lambda d, w=20: np.convolve(rng.standard_normal(int(d * SR)), np.ones(w) / w, "same")
# 场景转场 whoosh
for b in [6.0, 13.2, 18.0, 24.0, 31.0]:
    x = tt(0.35); add(sfx, b - 0.2, noise(0.35) * np.sin(np.pi * x / 0.35) ** 2, 0.35)
# 关门 / 开门
for t0, g in [(2.65, 0.9), (31.25, 0.4)]:
    x = tt(0.35); add(sfx, t0, np.sin(2 * np.pi * (70 + 50 * np.exp(-x * 30)) * x) * np.exp(-x * 14) + 0.3 * noise(0.35, 8) * np.exp(-x * 30), g)
# 问号 pop / 卡片 pop
for t0 in [4.4, 7.85, 13.5, 19.3, 20.5, 21.6, 24.3, 26.3, 28.1]:
    x = tt(0.15); add(sfx, t0, np.sin(2 * np.pi * (500 + 900 * x / 0.15) * x) * np.exp(-x * 25), 0.3)
# 睡觉呼噜
x = tt(7.0)
add(sfx, 6.1, noise(7.0, 60) * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * x)) * (0.5 + 0.5 * np.sin(2 * np.pi * x / 3.2)) * np.minimum(1, x / 0.4) * np.minimum(1, (7 - x) / 0.4), 0.8)
# 叹气
x = tt(0.9); add(sfx, 16.0, noise(0.9, 10) * np.sin(np.pi * x / 0.9) ** 2, 0.25)
# 抓沙发
for i in range(16):
    x = tt(0.09); add(sfx, 18.3 + i * 0.14, rng.standard_normal(len(x)) * np.exp(-x * 40), 0.18)
# 跑酷脚步
for i in range(12):
    x = tt(0.06); add(sfx, 20.5 + i * 0.09, np.sin(2 * np.pi * 120 * x) * np.exp(-x * 60), 0.5)
# 喵喵叫
for t0 in [21.8, 22.7, 23.6]: add(sfx, t0, meow(0.42, 640), 0.5)
# 冲过去迎接: 喵 + 闪闪
add(sfx, 31.55, meow(0.35, 760), 0.45)
add(sfx, 33.25, meow(0.55, 700), 0.5)
for i, nn in enumerate(["C6", "E6", "G6", "C7"]):
    add(sfx, 29.65 + i * 0.07, pluck(note(nn), 0.8), 0.12)
    add(sfx, 33.3 + i * 0.07, pluck(note(nn), 1.0), 0.12)
mix = music * 0.55 + vo + sfx * 0.6
f = int(0.6 * SR); mix[-f:] *= np.linspace(1, 0, f); mix[:int(0.15 * SR)] *= np.linspace(0, 1, int(0.15 * SR))
mix = mix / np.abs(mix).max() * 0.9
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wav = os.path.join(HERE, "output", "_mix.wav")
with wave.open(wav, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(HERE, "frames", "%05d.jpg"),
                "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT], check=True)
os.remove(wav)
print("done:", OUT)
