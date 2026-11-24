#!/usr/bin/env python3
"""合成配乐 (柔和八音盒 + 铺底和弦) 并混入旁白 -> mix.wav"""
import json, os, sys
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
SR, DUR = 44100, 30.0
VO_START = [5.2, 9.9, 14.5, 18.5, 21.2, 24.6]
n = int(SR * DUR); t = np.arange(n) / SR
music = np.zeros(n)
f = lambda m: 440 * 2 ** ((m - 69) / 12)
# I-V-vi-IV in C, 2.5s per chord (=96bpm-ish)
chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
beat = 2.5 / 4
for bar in range(12):
    ch = chords[bar % 4]; t0 = bar * 2.5
    # pad
    seg = (t >= t0) & (t < t0 + 2.7); tt = t[seg] - t0
    env = np.minimum(1, tt / 0.6) * np.minimum(1, (2.7 - tt) / 0.6)
    for m in ch:
        music[seg] += 0.035 * env * (np.sin(2 * np.pi * f(m - 12) * tt) + 0.3 * np.sin(2 * np.pi * f(m) * tt * 1.003))
    # music box arpeggio
    arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24 if bar % 2 else ch[0] + 24]
    for k, m in enumerate(arp):
        s0 = t0 + k * beat; seg = (t >= s0) & (t < s0 + 2.0); tt = t[seg] - s0
        e = np.exp(-tt * 3.2) * np.minimum(1, tt / 0.004)
        music[seg] += 0.06 * e * (np.sin(2 * np.pi * f(m) * tt) + 0.25 * np.sin(2 * np.pi * f(m) * 3 * tt) * np.exp(-tt * 6))
music *= np.minimum(1, t / 1.5) * np.minimum(1, (DUR - t) / 2.0)
# simple echo for space
d = int(0.32 * SR); wet = np.zeros(n); wet[d:] = music[:-d] * 0.35; music = music + wet
vo = np.zeros(n)
info = json.load(open(os.path.join(HERE, 'vo/lines.json')))
for st, x in zip(VO_START, info):
    a, sr = sf.read(os.path.join(HERE, 'vo', x['file']))
    if a.ndim > 1: a = a.mean(1)
    a = np.interp(np.arange(int(len(a) * SR / sr)) * sr / SR, np.arange(len(a)), a)
    i = int(st * SR); vo[i:i + len(a)] += a[: n - i]
vo *= 0.9 / (np.abs(vo).max() + 1e-9)
# duck music under the voice
env = np.convolve((np.abs(vo) > 0.02).astype(float), np.ones(int(0.3 * SR)) / int(0.3 * SR), 'same')
mix = vo + music * (1 - 0.45 * np.clip(env * 3, 0, 1)) * 1.6
mix *= 0.95 / np.abs(mix).max()
sf.write(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'mix.wav'), mix.astype(np.float32), SR)
