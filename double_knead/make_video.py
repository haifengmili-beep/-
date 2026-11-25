#!/usr/bin/env python3
"""《假如你家猫踩奶的频率每分钟翻一倍》41s 9:16 短视频 — 粉色方块猫版.

梗: 加班到深夜回家躺沙发, 猫开始踩奶, 频率每分钟 ×2:
  1 分钟 1 下 (治愈) → 5 分钟 16 下 (按摩) → 10 分钟 512 下 (爪子残影) → 15 分钟 16384 下 (沙发冒烟)
  → 20 分钟 52 万下 (楼在震, 邻居报警) → 30 分钟 5 亿下 (被踩进地心) → 31 分钟 猫睡着 → 明早 9 点打卡.
复用 ../kneading/make_video.py 里的猫 / 主人 / 绘图工具.
    python3 double_knead/voiceover.py 1.05 && python3 double_knead/make_video.py
    python3 double_knead/make_video.py preview 2 9 16 25 ...
"""
import json
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "kneading"))
import make_video as K  # noqa: E402
from make_video import (C, CH, CW, FRAME_TF, HEART, LN, PG, RC, RR, EL, SS, H, W, T, clamp, ease_out_back,  # noqa
                        kf, smooth, star_pts, text_img, paste, font, mbox, note, load_wav)

OUT_DIR = os.path.join(HERE, "output")
OUT_MP4 = os.path.join(OUT_DIR, "cat_knead_doubling_41s.mp4")
VO_DIR = os.path.join(HERE, "vo")
FPS, DUR = 30, 41.0
N = int(FPS * DUR)
SR = 44100

SCENES = [("title", 0.0, 4.2), ("sofa", 4.2, 27.5), ("core", 27.5, 32.4), ("sleep", 32.4, 37.0),
          ("alarm", 37.0, DUR)]
VO_START = [0.5, 4.4, 8.1, 11.0, 14.5, 18.6, 22.8, 27.9, 32.7, 37.3]
# (time, minute)  HUD 分钟数在 0.8s 内滚动到新值
STAGES = [(7.8, 1), (10.8, 5), (14.2, 10), (18.3, 15), (22.5, 20), (27.5, 30), (32.4, 31)]
ROLL = 0.8
XF = 0.3
NOTES = [(23.4, "邻居", "楼上大半夜在打桩吗？？", (90, 170, 110)),
         (24.4, "地震速报", "本地发生 3.2 级地震", (230, 120, 50)),
         (25.6, "110", "已出警，请保持电话畅通", (60, 110, 220))]
CRACK_IN = 23.0
SIREN_IN = 25.4


def stage_at(t):
    """-> (minute 显示值, 阶段 minute, 阶段内时间). minute=0 表示还没开始."""
    prev, cur, t0 = 0, 0, 0.0
    for ts, m in STAGES:
        if t >= ts:
            prev, cur, t0 = cur, m, ts
    if cur == 0:
        return 0, 0, 0.0
    u = smooth((t - t0) / ROLL)
    return int(round(prev + (cur - prev) * u)) if prev else cur, cur, t - t0


def rnd(i, k=0):
    """可复现的伪随机 [0,1)."""
    x = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return x - math.floor(x)


# ------------------------------------------------------------------ backgrounds
_BG = {}


def night_bg():
    """把原来的客厅压暗成深夜, 台灯保留暖光."""
    if "night" in _BG:
        return _BG["night"]
    a = np.asarray(K.bg("owner")).astype(np.float32)
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    r = np.hypot(xx - 830 * SS, yy - 300 * SS) / (520 * SS)
    glow = np.clip(1 - r, 0, 1)[..., None] ** 1.5
    dark = a * np.array([0.42, 0.40, 0.62]) + np.array([8, 6, 26])
    out = dark * (1 - glow) + (a * np.array([1.0, 0.93, 0.8])) * glow
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    # 窗外月亮 (书架上方)
    RC(d, F, 560, 520, 700, 700, (40, 46, 90))
    EL(d, F, 630, 600, 34, 34, (250, 240, 200))
    EL(d, F, 645, 590, 30, 30, (40, 46, 90))
    RC(d, F, 556, 516, 704, 524, (90, 70, 80))
    RC(d, F, 556, 696, 704, 704, (90, 70, 80))
    _BG["night"] = img
    return img


def core_bg():
    if "core" in _BG:
        return _BG["core"]
    img = Image.new("RGB", (CW, CH), (24, 26, 60))
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    for i in range(40):
        x, y = rnd(i, 1) * W, rnd(i, 2) * 240
        PG(d, F, star_pts(x, y, 6 + 6 * rnd(i, 3)), (250, 240, 200))
    # 地层
    bands = [(240, 300, (110, 170, 90)), (300, 700, (140, 96, 70)), (700, 1000, (176, 92, 56)),
             (1000, 1300, (210, 96, 46)), (1300, 1620, (236, 128, 40)), (1620, H, (250, 170, 50))]
    for y0, y1, c in bands:
        pts = [(x, y0 + 14 * math.sin(x / 70 + y0)) for x in range(0, W + 41, 40)]
        PG(d, F, pts + [(W, H), (0, H)], c)
    for i in range(60):
        x, y = rnd(i, 4) * W, 320 + rnd(i, 5) * 1100
        c = (120, 80, 60) if y < 700 else (190, 70, 40) if y < 1300 else (255, 190, 80)
        EL(d, F, x, y, 10 + 18 * rnd(i, 6), 7 + 10 * rnd(i, 7), c)
    for r, c in ((520, (255, 200, 70)), (380, (255, 226, 110)), (240, (255, 246, 180))):
        EL(d, F, 540, 2020, r, r, c)
    # 小房子 (我家)
    PG(d, F, [(470, 240), (470, 170), (540, 120), (610, 170), (610, 240)], (236, 200, 180))
    PG(d, F, [(455, 175), (540, 105), (625, 175)], (200, 90, 110))
    RC(d, F, 560, 185, 590, 215, (255, 220, 120))
    _BG["core"] = img
    return img


def sleep_bg():
    if "sleep" in _BG:
        return _BG["sleep"]
    a = np.zeros((CH, CW, 3), np.float32)
    yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
    r = np.hypot(xx - 540 * SS, yy - 1100 * SS) / (1300 * SS)
    c0, c1 = np.array([255, 236, 150]), np.array([200, 70, 40])
    u = np.clip(r, 0, 1)[..., None]
    a[:] = c0 * (1 - u) + c1 * u
    img = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    pts = [(x, 1520 + 30 * math.sin(x / 90)) for x in range(0, W + 41, 40)]
    PG(d, F, pts + [(W, H), (0, H)], (170, 70, 40))
    for i in range(30):
        EL(d, F, rnd(i, 8) * W, 1580 + rnd(i, 9) * 320, 20 + 30 * rnd(i, 10), 10 + 12 * rnd(i, 11), (140, 52, 30))
    _BG["sleep"] = img
    return img


# ------------------------------------------------------------------ helpers
def knead_state(t, minute, i):
    """根据阶段返回 (左爪, 右爪, 晃动), 以及是否残影模式."""
    if minute == 0:
        return None, False
    if minute == 1:
        return K.knead(t - 7.8 + 0.6, 0.42, 38), False
    if minute == 5:
        return K.knead(t, 2.0, 34), False
    amp = 30 + 4 * min(minute, 20) / 5
    return (-amp * rnd(i, 21), -amp * rnd(i, 22), 8 * (rnd(i, 23) - 0.5)), True


def speed_lines(d, tf, i, n=6, spread=1.0):
    for side in (-81, 141):
        for k in range(n):
            y = -70 + 70 * rnd(i, 30 + k + side)
            x0 = side + (70 + 40 * rnd(i, 40 + k)) * (1 if side > 0 else -1) * spread
            x1 = x0 + (50 + 50 * rnd(i, 50 + k)) * (1 if side > 0 else -1)
            LN(d, tf, [(x0, y), (x1, y)], (255, 255, 255), 6)


def smoke(ov, t, cx, cy, n=12, strength=1.0):
    for k in range(n):
        u = (t * 0.6 + k / n) % 1.0
        x = cx + (rnd(k, 60) - 0.5) * 420 + 60 * math.sin(t * 2 + k)
        y = cy - 520 * u
        r = (30 + 80 * u) * strength
        g = int(150 + 70 * u)
        ov.append(dict(kind="circle", x=x, y=y, r=r, fill=(g, g, g + 6, int(150 * math.sin(math.pi * u)))))


def floaty(ov, s, x, y, t, k, size=48, color=(255, 255, 255), stroke=(110, 50, 80)):
    u = (t * 0.6 + k) % 1.0
    ov.append(dict(text=s, x=x + 30 * u, y=y - 150 * u, size=size, fill=color, stroke=stroke, sw=6,
                   scale=1, alpha=math.sin(math.pi * u)))


# ------------------------------------------------------------------ scenes  -> (img, ov, (z, fx, fy, dx, dy))
def scene_title(t, lt, i):
    img = night_bg().copy()
    d = ImageDraw.Draw(img)
    ctf = T(540, 1420, 0.95)
    K.draw_cat(d, ctf, t, eyes="normal", mouth="w", blush=0.5)
    ov = []
    if lt > 0.4:
        ov.append(dict(text="假如你家猫", x=540, y=430, size=84, fill=(255, 255, 255), stroke=(110, 50, 80), sw=9,
                       scale=ease_out_back((lt - 0.4) / 0.4), alpha=1))
        ov.append(dict(text="踩奶的频率", x=540, y=545, size=84, fill=(255, 255, 255), stroke=(110, 50, 80), sw=9,
                       scale=ease_out_back((lt - 0.7) / 0.4), alpha=1))
    if lt > 1.6:
        ov.append(dict(text="每分钟翻一倍", x=540, y=700, size=124, fill=(255, 220, 90), stroke=(200, 40, 70), sw=12,
                       scale=ease_out_back((lt - 1.6) / 0.45), alpha=1))
    if lt > 2.4:
        p = 1 + 0.1 * math.sin(lt * 12)
        ov.append(dict(text="×2", x=880, y=880, size=110, fill=(255, 255, 255), stroke=(236, 70, 110), sw=12,
                       scale=ease_out_back((lt - 2.4) / 0.4) * p, alpha=1, rot=-12))
    return img, ov, (kf(lt, [(0, 1.15), (4.2, 1.0)]), 540, 1100, 0, 0)


def person_on_sofa(d, t, sink=0.0, dx=0.0):
    breathe = 1 + 0.01 * math.sin(t * 2 * math.pi / 3.5)
    ptf = T(790 + dx, 1040 + sink, 1.15 * breathe, math.radians(68))
    K.draw_person(d, ptf, t, outfit="sweater", eyes="sleep")
    return ptf


def scene_sofa(t, lt, i):
    img = night_bg().copy()
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    shown, minute, st = stage_at(t)
    # 公文包 + 甩掉的鞋
    RR(d, F, 120, 1600, 330, 1760, 18, (90, 60, 50))
    RR(d, F, 190, 1570, 260, 1610, 12, (60, 40, 34))
    RR(d, F, 400, 1720, 500, 1770, 20, (40, 34, 40))
    ov = []
    shake = 0.0
    if minute >= 15:
        shake = 4 if minute == 15 else 10 + 8 * clamp((t - 24.5) / 3)
    dx = shake * (rnd(i, 1) - 0.5) * 2
    dy = shake * (rnd(i, 2) - 0.5) * 2
    sink = 0.0 if minute < 20 else 30 * smooth((t - 22.5) / 4)
    # 墙裂缝
    if t > CRACK_IN:
        g = clamp((t - CRACK_IN) / 3.5)
        for c, (x, y) in enumerate([(600, 760), (300, 120), (1000, 640), (150, 760)]):
            pts = [(x, y)]
            for k in range(int(10 * g)):
                x += (rnd(c, 100 + k) - 0.5) * 70
                y += 30 + 30 * rnd(c, 120 + k) if c != 1 else 30 + 20 * rnd(c, 120 + k)
                pts.append((x, y))
            if len(pts) > 1:
                LN(d, F, pts, (30, 20, 36), 7)
    ptf = person_on_sofa(d, t, sink)
    # 猫: 跳上主人肚子
    hop = clamp((lt - 1.4) / 0.8)
    if hop < 1:
        cx = 200 + 360 * smooth(hop)
        cy = 1560 - 360 * smooth(hop) - 260 * math.sin(math.pi * hop)
    else:
        cx, cy = 560, 1200 + sink
    ctf = T(cx, cy, 0.68)
    kn, blur = knead_state(t, minute, i)
    eyes = "normal" if minute in (0,) or blur else ("sleepy" if minute == 1 else "happy")
    K.draw_cat(d, ctf, t, eyes=eyes, mouth="w", kneading=kn, blush=0.4 + 0.15 * min(minute, 20) / 5)
    if blur:
        speed_lines(d, ctf, i, n=4 + min(minute, 20) // 3)
    hx, hy = ptf.frame(0, -120)
    if minute == 0 and lt < 3.4:
        floaty(ov, "好累…", hx - 40, hy - 120, t, 0.0, 56, (220, 210, 240), (60, 40, 80))
    if minute in (1, 5):
        K.knead_pops(ov, t, ctf, 0.42 if minute == 1 else 2.0, -80, 140, -40)
    if minute == 1 and st > 1.0:
        HEART(d, F, hx + 40, hy - 160 - 20 * math.sin(t * 3), 3.0, (244, 114, 160))
    if blur:
        for k in range(min(minute, 20) // 2):
            px, py = ctf.frame(-150 + 380 * rnd(i, 70 + k), -60 - 140 * rnd(i, 80 + k))
            ov.append(dict(text="踩", x=px, y=py, size=40 + int(30 * rnd(i, 90 + k)), fill=(236, 90, 135),
                           stroke=(255, 255, 255), sw=5, scale=1, alpha=1))
    if minute == 10:
        ov.append(dict(text="？？", x=hx + 10, y=hy - 170, size=90, fill=(255, 255, 255), stroke=(60, 40, 80), sw=8,
                       scale=ease_out_back(st / 0.4), alpha=1))
    if minute == 15:
        smoke(ov, t, 700, 1180, 9, 1.0)
        ov.append(dict(text="！！", x=hx + 10, y=hy - 170, size=100, fill=(255, 90, 90), stroke=(255, 255, 255), sw=8,
                       scale=ease_out_back(st / 0.4), alpha=1))
    if minute == 20:
        smoke(ov, t, 760, 1150, 9, 1.1)
        ov.append(dict(text="救命", x=hx + 10, y=hy - 180, size=96, fill=(255, 90, 90), stroke=(255, 255, 255), sw=8,
                       scale=1 + 0.08 * math.sin(t * 20), alpha=1, rot=8 * math.sin(t * 9)))
        for k in range(6):  # 掉落的书
            u = ((t - 22.5) * 0.9 + k / 6) % 1.0
            RC(d, F, 90 + k * 70, 300 + 1200 * u, 120 + k * 70, 380 + 1200 * u,
               [(236, 120, 150), (130, 180, 220), (250, 210, 120)][k % 3])
    z = kf(lt, [(0, 1.0), (3.4, 1.0), (4.6, 1.12), (16.0, 1.12), (18.3, 1.0)])
    if minute >= 20:
        z = 0.97
    return img, ov, (z, 620, 1120, dx, dy)


def scene_core(t, lt, i):
    img = core_bg().copy()
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    p = smooth(clamp((lt - 0.2) / 3.8))
    y = 300 + 1250 * p
    RC(d, F, 470, 160, 610, y - 20, (30, 22, 30))       # 隧道
    for k in range(8):                                     # 碎石
        u = (lt * 1.3 + k / 8) % 1.0
        EL(d, F, 470 + 140 * rnd(k, 130) + (rnd(k, 131) - 0.5) * 300 * u, y - 60 - 260 * u,
           10 * (1 - u) + 3, 8 * (1 - u) + 3, (120, 80, 60))
    ptf = T(540, y + 30, 0.3, math.radians(90))
    K.draw_person(d, ptf, t, outfit="sweater", eyes="sleep")
    ctf = T(500, y - 5, 0.24)
    K.draw_cat(d, ctf, t, eyes="normal", mouth="w", kneading=knead_state(t, 30, i)[0], blush=1.0)
    speed_lines(d, ctf, i, 6, 0.6)
    ov = [dict(text=f"深度 {int(6371 * p):,} km", x=800, y=y - 40, size=50, fill=(255, 255, 255),
               stroke=(80, 30, 30), sw=7, scale=1, alpha=1)]
    ov.append(dict(text="地心", x=540, y=1830, size=110, fill=(255, 255, 255), stroke=(220, 80, 30), sw=10,
                   scale=1, alpha=1))
    if p >= 0.995:
        ov.append(dict(text="已到达", x=540, y=1700, size=70, fill=(200, 40, 40), stroke=(255, 255, 255), sw=8,
                       scale=ease_out_back((lt - 4.0) / 0.3), alpha=1))
    return img, ov, (1.0, 540, 960, 4 * (rnd(i, 3) - 0.5), 4 * (rnd(i, 4) - 0.5))


def draw_sleep_pair(d, t, lt):
    ptf = T(560, 1470, 0.78, math.radians(90))
    K.draw_person(d, ptf, t, outfit="sweater", eyes="sleep")
    yawn = 0.6 < lt < 2.0
    K.draw_cat(d, T(400, 1385, 0.5), t, eyes="sleepy", mouth="open" if yawn else "w", blush=0.7)
    hx, hy = ptf.frame(0, -110)
    for k in range(5):   # 晕眩星星
        a = t * 3 + 2 * math.pi * k / 5
        PG(d, FRAME_TF, star_pts(hx + 110 * math.cos(a), hy - 150 + 30 * math.sin(a), 20), (255, 250, 200))
    return ptf


def scene_sleep(t, lt, i):
    img = sleep_bg().copy()
    d = ImageDraw.Draw(img)
    draw_sleep_pair(d, t, lt)
    ov = []
    if 0.6 < lt < 2.0:
        ov.append(dict(text="哈～欠", x=330, y=1060, size=64, fill=(255, 255, 255), stroke=(150, 80, 60), sw=7,
                       scale=ease_out_back((lt - 0.6) / 0.3), alpha=1))
    if lt > 2.0:
        for k in range(3):
            floaty(ov, "Z", 470 + 40 * k, 1130 - 40 * k, t, k / 3, 56 + 14 * k, (255, 255, 255), (150, 80, 60))
    return img, ov, (kf(lt, [(0, 1.0), (4.6, 1.1)]), 520, 1350, 0, 0)


def scene_alarm(t, lt, i):
    img = sleep_bg().copy()
    d = ImageDraw.Draw(img)
    draw_sleep_pair(d, t, lt + 5)
    ring = math.sin(t * 50) * (0.06 if lt > 0.3 else 0)
    u = ease_out_back(lt / 0.45)
    F = T(540, 720, u * 1.0, ring)
    for s in (-1, 1):
        EL(d, F, s * 150, -230, 80, 60, (230, 200, 60), rot=s * 0.5)
        RC(d, F, s * 150 - 8, 180, s * 150 + 8, 260, (80, 60, 60))
    EL(d, F, 0, 0, 260, 260, (230, 60, 70))
    EL(d, F, 0, 0, 220, 220, (255, 250, 245))
    RC(d, F, -12, -300, 12, -250, (80, 60, 60))
    for k in range(12):
        a = 2 * math.pi * k / 12
        EL(d, F, 180 * math.sin(a), -180 * math.cos(a), 8, 8, (120, 90, 90))
    ov = [dict(text="09:00", x=540, y=700, size=int(130 * u) or 1, fill=(40, 30, 40), stroke=(255, 255, 255),
               sw=2, scale=1, alpha=1, rot=-math.degrees(ring))]
    if lt > 0.3:
        for k, (x, y) in enumerate([(220, 520), (860, 520), (180, 860), (900, 860)]):
            ov.append(dict(text="铃", x=x, y=y + 10 * math.sin(t * 30 + k), size=56, fill=(255, 230, 90),
                           stroke=(200, 60, 60), sw=6, scale=1, alpha=0.5 + 0.5 * abs(math.sin(t * 12 + k))))
    if lt > 1.0:
        v = clamp((lt - 1.0) / 0.2)
        sc = 2.2 - 1.2 * smooth(v)
        Fs = T(760, 1040, sc, math.radians(-12))
        RR(d, Fs, -150, -70, 150, 70, 24, (236, 70, 110))
        RR(d, Fs, -136, -56, 136, 56, 16, (255, 240, 244))
        ov.append(dict(text="要打卡", x=760, y=1040, size=max(1, int(78 * sc)), fill=(236, 70, 110),
                       stroke=(255, 240, 244), sw=2, scale=1, alpha=1, rot=12))
    return img, ov, (1.0, 540, 960, 0, 0)


SCENE_FN = dict(title=scene_title, sofa=scene_sofa, core=scene_core, sleep=scene_sleep, alarm=scene_alarm)


# ------------------------------------------------------------------ HUD / UI (frame space)
def fmt_count(m):
    return f"{2 ** (m - 1):,}"


def draw_hud(frame, t):
    shown, minute, st = stage_at(t)
    if minute == 0 or t >= SCENES[-1][1]:
        return
    a = clamp((t - STAGES[0][0]) / 0.3)
    lay = Image.new("RGBA", (980, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle([10, 10, 970, 290], 40, fill=(40, 24, 44, 225), outline=(255, 150, 190), width=6)
    d.text((50, 40), "第", font=font(56), fill=(255, 220, 230))
    d.text((115, 22), f"{shown:02d}", font=font(118), fill=(255, 220, 90))
    d.text((265, 40), "分钟", font=font(56), fill=(255, 220, 230))
    d.text((50, 180), "踩奶频率", font=font(52), fill=(255, 180, 200))
    if minute == 31:
        val, unit, col = "睡着了", "", (170, 200, 255)
    else:
        val, unit, col = fmt_count(shown), " 次/分", (255, 255, 255)
    f = font(92 if len(val) < 9 else 76)
    tw = d.textlength(val, font=f)
    uw = d.textlength(unit, font=font(46))
    d.text((940 - uw - tw, 150 if len(val) < 9 else 165), val, font=f, fill=col)
    d.text((940 - uw, 200), unit, font=font(46), fill=(255, 200, 220))
    frame_rgba = frame
    paste(frame_rgba, lay, 540, 250, 1.0, a)
    if minute not in (1, 31) and st < 1.4:
        u = ease_out_back(st / 0.35)
        paste(frame_rgba, text_img("×2" if minute == 5 else "×2×2×2…", 80, (255, 255, 255), (236, 70, 110), 9),
              820, 110, u, 1 - smooth((st - 1.0) / 0.4), -10)


def draw_notes(frame, t):
    if not (SCENES[1][1] <= t < SCENES[1][2]):
        return
    for k, (t0, who, msg, col) in enumerate(NOTES):
        if t < t0:
            continue
        u = ease_out_back((t - t0) / 0.35)
        lay = Image.new("RGBA", (900, 150), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        d.rounded_rectangle([0, 0, 899, 149], 32, fill=(255, 255, 255, 240))
        d.rounded_rectangle([24, 30, 114, 120], 22, fill=col)
        ic = who if who.isdigit() else who[:2]
        d.text((69 - d.textlength(ic, font=font(36)) / 2, 54), ic, font=font(36), fill=(255, 255, 255))
        d.text((140, 22), who, font=font(40), fill=(60, 50, 60))
        d.text((140, 76), msg, font=font(46), fill=(30, 30, 30))
        paste(frame, lay, 540 + 1100 * (1 - u), 470 + k * 135, 0.82, 0.92)


def draw_siren(frame, t):
    if not (SIREN_IN <= t < SCENES[1][2]):
        return
    on = int(t * 6) % 2
    col = (255, 40, 60) if on else (40, 90, 255)
    a = np.zeros((H, W), np.float32)
    x = np.linspace(-1, 1, W)[None, :]
    y = np.linspace(-1, 1, H)[:, None]
    a[:] = np.clip((np.maximum(abs(x), abs(y)) - 0.55) / 0.45, 0, 1) ** 1.5 * 170 * clamp((t - SIREN_IN) / 0.3)
    lay = Image.new("RGBA", (W, H), col + (0,))
    lay.putalpha(Image.fromarray(a.astype(np.uint8)))
    frame.alpha_composite(lay)


# ------------------------------------------------------------------ subtitles
def subtitle_chunks():
    info = json.load(open(os.path.join(VO_DIR, "lines.json")))
    chunks = []
    for start, li in zip(VO_START, info):
        text, dur = li["text"], li["dur"]
        parts, cur = [], ""
        for ch in text:
            cur += ch
            if ch in "，。":
                parts.append(cur)
                cur = ""
        if cur:
            parts.append(cur)
        groups, g = [], ""
        for p in parts:
            if len(g) + len(p) > 12 and g:
                groups.append(g)
                g = p
            else:
                g += p
        groups.append(g)
        total = sum(len(x) for x in groups)
        tt = start
        for k, g in enumerate(groups):
            dd = dur * len(g) / total
            end = tt + dd + (0.35 if k == len(groups) - 1 else 0)
            chunks.append((tt, end, g.rstrip("，。")))
            tt += dd
    return chunks


SUBS = None


def draw_subs(frame, t):
    global SUBS
    if SUBS is None:
        SUBS = subtitle_chunks()
    if t < SCENES[1][1]:       # 标题页已有大字
        return
    for t0, t1, s in SUBS:
        if t0 <= t < t1:
            al = clamp((t - t0) / 0.12) * clamp((t1 - t) / 0.12)
            paste(frame, text_img(s, 66, (255, 255, 255), (110, 50, 80), 9), W / 2, 1640, 1.0, al)
    if t >= DUR - 1.6:
        paste(frame, text_img("#踩奶  #猫咪  #打工人", 46, (255, 255, 255), (236, 90, 135), 6),
              W / 2, 1780, 1.0, clamp((t - (DUR - 1.6)) / 0.3))


# ------------------------------------------------------------------ frame
def compose(name, t, lt, i):
    img, ov, (z, fx, fy, dx, dy) = SCENE_FN[name](t, lt, i)
    z = max(z, 1.0 + (0.03 if (dx or dy) else 0))
    cw, ch = CW / z, CH / z
    x0 = clamp(fx * SS - cw / 2 + dx * SS, 0, CW - cw)
    y0 = clamp(fy * SS - ch / 2 + dy * SS, 0, CH - ch)
    frame = img.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch)).convert("RGBA")
    circles = [o for o in ov if o.get("kind") == "circle"]
    if circles:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dl = ImageDraw.Draw(lay)
        for o in circles:
            X, Y, R = (o["x"] * SS - x0) * z / SS, (o["y"] * SS - y0) * z / SS, o["r"] * z
            dl.ellipse([X - R, Y - R, X + R, Y + R], fill=o["fill"])
        frame.alpha_composite(lay)
    for o in ov:
        if o.get("kind") == "circle":
            continue
        X = (o["x"] * SS - x0) * z / SS
        Y = (o["y"] * SS - y0) * z / SS
        paste(frame, text_img(o["text"], o["size"], o["fill"], o["stroke"], o["sw"]), X, Y,
              o["scale"], o["alpha"], o.get("rot", 0))
    return frame


def render(i):
    t = i / FPS
    cur = next(k for k, (n, a, b) in enumerate(SCENES) if a <= t < b or k == len(SCENES) - 1)
    name, a, b = SCENES[cur]
    frame = compose(name, t, t - a, i)
    if cur + 1 < len(SCENES) and t > b - XF / 2:
        nm, na, nb = SCENES[cur + 1]
        frame = Image.blend(frame, compose(nm, t, t - na, i), clamp((t - (b - XF / 2)) / XF) * 0.5)
    if cur > 0 and t < a + XF / 2:
        pm, pa, pb = SCENES[cur - 1]
        frame = Image.blend(compose(pm, t, t - pa, i), frame, 0.5 + clamp((t - a) / (XF / 2)) * 0.5)
    if name == "core" and t - a < 0.15:   # 白闪
        frame = Image.blend(frame, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 0.8 * (1 - (t - a) / 0.15))
    draw_siren(frame, t)
    draw_hud(frame, t)
    draw_notes(frame, t)
    draw_subs(frame, t)
    frame = frame.convert("RGB")
    if t < 0.3:
        frame = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), frame, t / 0.3)
    return frame.tobytes()


# ------------------------------------------------------------------ audio
def make_audio(path):
    n = int(DUR * SR)
    music, vo, sfx = np.zeros(n), np.zeros(n), np.zeros(n)
    mel = ["C5", "E5", "G5", "E5", "F5", "A5", "G5", None, "E5", "G5", "C6", "B5", "A5", "G5", "E5", None]
    bass = ["C3", "A2", "F2", "G2"]

    def tempo(t):  # 音乐随踩奶频率越来越快
        if t < 10.8 or t >= 32.4:
            return 1.0
        if t < 27.5:
            return 1.0 + 2.2 * (t - 10.8) / (27.5 - 10.8)
        return 0.0
    t, k = 0.0, 0
    while t < DUR:
        sp = tempo(t)
        if sp == 0:
            t = 32.4
            k = 0
            continue
        if mel[k % 16]:
            mbox(music, t, note(mel[k % 16]), 0.2)
        if k % 8 == 0:
            mbox(music, t, note(bass[(k // 8) % 4]), 0.15, 2.6)
        k += 1
        t += 0.34 / sp
    info = json.load(open(os.path.join(VO_DIR, "lines.json")))
    for st, li in zip(VO_START, info):
        a = load_wav(li["file"])
        s0 = int(st * SR)
        m = min(len(a), n - s0)
        vo[s0:s0 + m] += a[:m] / (np.abs(a).max() + 1e-9) * 0.9
    env = np.convolve((np.abs(vo) > 0.02).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
    duck = 1 - 0.55 * np.clip(env * 3, 0, 1)

    def add(t0, sig, g=1.0):
        s0 = int(t0 * SR)
        m = min(len(sig), n - s0)
        if m > 0:
            sfx[s0:s0 + m] += g * sig[:m]

    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(5)

    def pup(t0, g=0.3):
        x = tt(0.12)
        add(t0, g * np.sin(2 * np.pi * (200 - 500 * x) * x) * np.exp(-x * 30))
    # 1 分钟: 每次落爪 "噗"
    for k in range(3):
        pup(7.8 + (k + 0.5) / 0.42 * 0.5 + 0.6, 0.35)
    # 5 分钟
    x0 = 10.8
    while x0 < 14.2:
        pup(x0, 0.3)
        x0 += 0.25
    # 10 分钟: 机关枪
    x0 = 14.2
    while x0 < 18.3:
        pup(x0, 0.22)
        x0 += 1 / 14
    # 15-20 分钟: 电钻嗡嗡 + 隆隆
    x = tt(27.5 - 18.3)
    grow = np.clip(x / (27.5 - 18.3), 0, 1)
    saw = ((x * (60 + 60 * grow)) % 1.0) * 2 - 1
    noise = np.convolve(rng.standard_normal(len(x)), np.ones(30) / 30, "same")
    rumble = np.convolve(rng.standard_normal(len(x)), np.ones(400) / 400, "same") * 8
    add(18.3, (0.25 * saw + 0.6 * noise) * (0.4 + 0.6 * grow) + rumble * np.clip((x - 4.2) / 1, 0, 1), 0.6)
    # 通知 叮
    for t0, *_ in NOTES:
        mbox(sfx, t0, note("A5"), 0.25, 0.6)
        mbox(sfx, t0 + 0.1, note("E6"), 0.2, 0.6)
    # 警笛
    x = tt(27.5 - SIREN_IN)
    f = 750 + 350 * np.sin(2 * np.pi * 0.8 * x)
    add(SIREN_IN, 0.18 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, x / 0.3), 1.0)
    # 坠落: 下行哨音 + 呼呼风声
    x = tt(4.2)
    f = 1400 * np.exp(-x * 0.5) + 200
    wind = np.convolve(rng.standard_normal(len(x)), np.ones(12) / 12, "same")
    add(27.5, 0.2 * np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.35 * wind * np.sin(np.pi * x / 4.2), 1.0)
    # 落地 咚
    x = tt(0.6)
    add(31.6, 0.9 * np.sin(2 * np.pi * (60 + 80 * np.exp(-x * 20)) * x) * np.exp(-x * 8))
    # 呼噜 (睡着)
    x = tt(4.6)
    noise = np.convolve(rng.standard_normal(len(x)), np.ones(60) / 60, "same")
    add(32.4, noise * (0.5 + 0.5 * np.sin(2 * np.pi * 24 * x)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * x)) *
        np.minimum(1, x / 0.5), 0.9)
    # 闹钟
    for k in range(int((DUR - 37.3) / 0.25)):
        if k % 4 == 3:
            continue
        x = tt(0.12)
        add(37.3 + k * 0.25, 0.22 * np.sign(np.sin(2 * np.pi * 2000 * x)) * np.minimum(1, x / 0.005) *
            np.minimum(1, (0.12 - x) / 0.01))
    # 盖章
    x = tt(0.4)
    add(38.2, 0.7 * np.sin(2 * np.pi * (90 + 60 * np.exp(-x * 25)) * x) * np.exp(-x * 12))
    mix = music * duck * 0.55 + vo * 1.0 + sfx * 0.55 * duck ** 0.5
    mix[:int(0.2 * SR)] *= np.linspace(0, 1, int(0.2 * SR))
    mix[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))
    mix = mix / np.abs(mix).max() * 0.9
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for ts in [float(v) for v in sys.argv[2:]]:
            Image.frombytes("RGB", (W, H), render(int(ts * FPS))).save(os.path.join(OUT_DIR, f"preview_{ts:05.1f}.png"))
        return
    wav = os.path.join(OUT_DIR, "_mix.wav")
    make_audio(wav)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
                           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT_MP4],
                          stdin=subprocess.PIPE)
    with Pool(os.cpu_count()) as pool:
        for k, data in enumerate(pool.imap(render, range(N), chunksize=4)):
            ff.stdin.write(data)
            if k % 150 == 0:
                print(f"frame {k}/{N}", flush=True)
    ff.stdin.close()
    ff.wait()
    os.remove(wav)
    print("done:", OUT_MP4)


if __name__ == "__main__":
    main()
