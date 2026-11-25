#!/usr/bin/env python3
"""《猫被抱着时在想啥？》抱猫科普 26s 9:16 精简版 — 粉色方块猫, 与踩奶视频同一形式.

6 段: 开场喊救命 / 懵→扭→蹬 / 四脚离地 / 不让抱≠不爱你 / 正确抱法 / 甩尾巴就放下.
先生成旁白再渲染:
    python3 holding/voiceover.py 1.1 && python3 holding/make_video.py
预览单帧: python3 holding/make_video.py preview 1.5 6 10 ...
"""
import importlib.util
import json
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("kn", os.path.join(HERE, "..", "kneading", "make_video.py"))
kn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kn)  # 复用踩奶视频的绘图/文字/音频工具

from_kn = ("clamp smooth ease_out_back kf T PG RC ell_pts EL RR LN heart_pts HEART star_pts FRAME_TF "
           "draw_person text_img paste font note mbox load_wav pop_text C W H SS CW CH SR").split()
globals().update({k: getattr(kn, k) for k in from_kn})

OUT_DIR = os.path.join(HERE, "output")
OUT_MP4 = os.path.join(OUT_DIR, "cat_holding_26s.mp4")
VO_DIR = os.path.join(HERE, "vo")
FPS, DUR = 30, 26.0
N = int(FPS * DUR)

SCENES = [("hook", 0.0, 3.0), ("struggle", 3.0, 8.4), ("air", 8.4, 12.6),
          ("love", 12.6, 17.8), ("howto", 17.8, 22.6), ("down", 22.6, 26.0)]
VO_START = [0.3, 3.2, 8.6, 12.8, 18.0, 22.8]
XF = 0.24
STAMP = 24.35
TAGS = 25.0
HEADLINES = {"hook": "猫被抱着时在想啥？", "struggle": "懵 → 扭 → 蹬", "air": "四脚离地 = 没法逃",
             "love": "不让抱 ≠ 不爱你", "howto": "正确抱法", "down": "甩尾巴 = 快放下"}
GREEN, RED, DEEP = (60, 170, 110), (232, 70, 80), (236, 90, 135)


# ------------------------------------------------------------------ cat (踩奶猫的扩展版: 尾巴/后腿/表情/耳朵)
def draw_tail(d, tf, t, base=-0.5, swing=0.15, hz=0.8, curl=0.06):
    x, y, a = 748.0, 790.0, base
    pts = [(x, y)]
    for i in range(12):
        s = i / 11
        a += curl + swing * s * math.sin(2 * math.pi * hz * t - 1.2 * s) * 0.45
        x, y = x + 26 * math.cos(a), y + 26 * math.sin(a)
        pts.append((x, y))
    LN(d, tf, pts, C["body_side"], 40)
    LN(d, tf, pts[-4:], C["spot"], 40)
    EL(d, tf, pts[-1][0], pts[-1][1], 20, 20, C["spot"])
    return pts


def draw_cat(d, tf0, t, eyes="normal", mouth=None, blush=0.0, ears=0.0, tail=None, hind=None, close=0.0):
    """原点=身体底部中心 (540, 831). eyes: normal/happy/sleepy/dot/wide/x. ears: 0 竖 → 1 飞机耳.
    tail: dict(base, swing, hz, curl) 或 None. hind: None / ('dangle', kick 0..1). close: 慢眨眼闭合 0..1."""
    tf = tf0.pre(-540, -831)
    br = 2.5 * math.sin(t * 2 * math.pi / 3.0)
    if tail:
        tp = draw_tail(d, tf, t, **tail)
        if tail.get("swing", 0) > 0.6:  # 甩尾动作线
            ex, ey = tp[-1]
            for k in range(3):
                LN(d, tf, [(ex + 40 + k * 22, ey - 50 + k * 50), (ex + 70 + k * 22, ey - 60 + k * 50)], RED, 9)
    if hind:
        kick = hind[1]
        for x0, ph in ((418, 0.0), (632, math.pi)):
            lift = -70 * kick * max(0.0, math.sin(2 * math.pi * 3.2 * t + ph))
            RC(d, tf, x0, 760, x0 + 86, 950 + lift, C["body_side"])
            RC(d, tf, x0 - 4, 930 + lift, x0 + 90, 980 + lift, C["paw"])
            for k in range(3):
                RC(d, tf, x0 + 14 + k * 26, 966 + lift, x0 + 18 + k * 26, 980 + lift, C["spot"])
    bt = 585 + br * 0.5
    PG(d, tf, [(336, bt - 12), (390, bt), (390, 825), (336, 798)], C["body_side"])
    PG(d, tf, [(390, bt), (750, bt), (750, 825), (390, 825)], C["body"])
    for (cx, cy, r) in [(495, 705, 25), (600, 675, 35), (675, 745, 22), (546, 768, 16)]:
        pts = ell_pts(cx, cy, r, r)
        d.line([tf(x, y) for x, y in pts + pts[:1]], fill=C["spot"], width=max(1, int(5 * tf.s * SS)))
    for x0 in (414, 636):
        RC(d, tf, x0, 783, x0 + 90, 831, C["paw"])
    th = tf.pre(0, br)
    e = ears
    lt = (438 - 110 * e, 107 + 120 * e)
    rt = (720 + 110 * e, 107 + 120 * e)
    PG(d, th, [(385, 255), lt, (528, 255)], C["ear"])
    PG(d, th, [(420, 255), ((441 + lt[0]) / 2 + 10 * (1 - e), (173 + lt[1]) / 2 + 40), (488, 255)], C["ear_in"])
    PG(d, th, [(640, 255), rt, (775, 280)], C["ear"])
    PG(d, th, [(676, 255), ((714 + rt[0]) / 2 - 10 * (1 - e), (173 + rt[1]) / 2 + 40), (745, 270)], C["ear_in"])
    PG(d, th, [(300, 255), (720, 255), (780, 285), (360, 285)], C["head_top"])
    PG(d, th, [(300, 255), (360, 285), (360, 585), (300, 555)], C["head_side"])
    RC(d, th, 360, 285, 780, 585, C["head"])
    for x0, y0, x1, y1 in [(414, 345, 516, 465), (624, 345, 726, 465)]:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if eyes == "happy":
            LN(d, th, [(x0 + 8, 432), (cx, 378), (x1 - 8, 432)], C["eye"], 16)
        elif eyes == "sleepy":
            LN(d, th, [(x0 + 6, 405), (x0 + 28, 425), (cx, 431), (x1 - 28, 425), (x1 - 6, 405)], C["eye"], 15)
        elif eyes == "dot":
            RC(d, th, cx - 16, cy - 16, cx + 16, cy + 16, C["eye"])
        elif eyes == "wide":
            RC(d, th, x0 - 6, y0 - 6, x1 + 6, y1 + 6, C["eye"])
            RC(d, th, x0 + 6, y0 + 6, x1 - 6, y1 - 6, C["white"])
            RC(d, th, cx - 14, cy - 14, cx + 14, cy + 14, C["eye"])
        elif eyes == "x":
            s = 1 if x0 < 540 else -1
            LN(d, th, [(cx - 40 * s, y0 + 10), (cx + 40 * s, cy), (cx - 40 * s, y1 - 10)], C["eye"], 17)
        else:
            RC(d, th, x0, y0, x1, y1, C["eye"])
            RC(d, th, x0 + 18, y0 + 15, x0 + 54, y0 + 51, C["white"])
            RC(d, th, x0 + 60, y0 + 75, x0 + 84, y0 + 99, C["white"])
            if close > 0.02:  # 慢眨眼: 眼皮从上往下盖
                yb = y0 - 4 + (y1 - y0 + 8) * close
                RC(d, th, x0 - 4, y0 - 4, x1 + 4, yb, C["head"])
                if close > 0.9:
                    LN(d, th, [(x0 + 6, 405), (cx, 425), (x1 - 6, 405)], C["eye"], 14)
    g = 8 * blush
    for x0 in (402, 684):
        RC(d, th, x0 - g, 486 - g / 2, x0 + 54 + g, 516 + g / 2, C["cheek"])
        if blush > 0.3:
            for k in range(3):
                LN(d, th, [(x0 + 18 + k * 16, 490), (x0 + 8 + k * 16, 512)], C["cheek_deep"], 4)
    RC(d, th, 546, 480, 594, 506, C["nose"])
    RC(d, th, 510, 504, 630, 552, C["muzzle"])
    if mouth == "w":
        for a in (540, 570):
            LN(d, th, [(a + 30 * i / 10, 524 + 10 * math.sin(math.pi * i / 10)) for i in range(11)], C["mouth"], 5)
    elif mouth == "open":
        EL(d, th, 570, 532, 16, 12, C["mouth"])
    elif mouth == "scream":
        RR(d, th, 548, 516, 592, 566, 12, C["mouth"])
        RC(d, th, 556, 552, 584, 566, (240, 130, 150))
    elif mouth == "flat":
        LN(d, th, [(548, 528), (592, 528)], C["mouth"], 6)


def sweat(d, tf, x, y, s=1.0):
    PG(d, tf, [(x, y - 40 * s), (x - 22 * s, y), (x + 22 * s, y)], (150, 205, 245))
    EL(d, tf, x, y + 4 * s, 22 * s, 22 * s, (150, 205, 245))
    EL(d, tf, x - 7 * s, y, 6 * s, 8 * s, (225, 243, 255))


def check(d, x, y, s=1.0, color=GREEN):
    F = FRAME_TF
    EL(d, F, x, y, 34 * s, 34 * s, (255, 255, 255))
    EL(d, F, x, y, 28 * s, 28 * s, color)
    LN(d, F, [(x - 14 * s, y), (x - 3 * s, y + 12 * s), (x + 16 * s, y - 12 * s)], (255, 255, 255), 8 * s)


def label(ov, s, x, y, t, t0, size=64, fill=(255, 255, 255), stroke=DEEP, sw=9, rot=0):
    """弹出后停留的标签."""
    if t >= t0:
        ov.append(dict(text=s, x=x, y=y, size=size, fill=fill, stroke=stroke, sw=sw,
                       scale=ease_out_back((t - t0) / 0.35), alpha=1, rot=rot))


# ------------------------------------------------------------------ 抱猫 (人在后, 猫在胸前)
PERSON = T(540, 760, 1.3)
CAT_X, CAT_Y, CAT_S = 540, 1230, 0.6


def held(d, t, cat_kw, wobble=0.0, dy=0.0, eyes_p="happy", arms=True):
    """人抱猫: 一手托胸, 前臂托屁股. dy: 猫下放距离 (px)."""
    draw_person(d, PERSON, t, outfit="sweater", eyes=eyes_p, arms="none" if arms else "side")
    ctf = T(CAT_X, CAT_Y + dy, CAT_S, wobble)
    draw_cat(d, ctf, t, **cat_kw)
    if arms:
        L = dy / 1.3
        RR(d, PERSON, -178, 30, -120, 390 + L, 26, C["sweater"])           # 左上臂
        RR(d, PERSON, -165, 345 + L, 150, 400 + L, 28, C["sweater"])       # 前臂托屁股
        RR(d, PERSON, 128, 332 + L, 192, 402 + L, 26, C["skin"])
        RR(d, PERSON, 115, 30, 172, 250, 26, C["sweater"])                 # 右上臂
        LN(d, PERSON, [(150, 240), (70, 300 + L * 0.9)], C["sweater"], 56)  # 前臂 → 托胸
        EL(d, PERSON, 52, 300 + L * 0.9, 40, 34, C["skin"])
        for k in range(3):
            LN(d, PERSON, [(30 + k * 16, 285 + L * 0.9), (24 + k * 16, 318 + L * 0.9)], C["skin_sh"], 4)
    return ctf


# ------------------------------------------------------------------ backgrounds
_BG = {}


def bg(name):
    if name in ("hug", "paw"):
        return kn.bg(name)
    if name in _BG:
        return _BG[name]
    img = Image.new("RGB", (CW, CH))
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    RC(d, F, 0, 0, W, H, (238, 222, 240))
    for r, c in ((640, (244, 214, 226)), (380, (248, 226, 236))):
        EL(d, F, 540, 900, r, r, c)
    RC(d, F, 0, 1500, W, H, (239, 196, 145))
    for y in range(1560, H, 80):
        RC(d, F, 0, y, W, y + 5, (224, 174, 120))
    _BG[name] = img
    return img


# ------------------------------------------------------------------ scenes → (img, overlays, (zoom, fx, fy))
def scene_hook(t, lt):
    img = bg("hug").copy()
    d = ImageDraw.Draw(img)
    held(d, t, dict(eyes="wide", mouth="flat", ears=0.25, tail=dict(base=0.9, swing=0.2, curl=0.02)))
    ov = []
    if lt > 0.15:
        sweat(d, FRAME_TF, 708, 900 + 8 * math.sin(t * 6), 1.2)
    if lt > 1.0:  # 内心 OS 气泡
        u = ease_out_back((lt - 1.0) / 0.35)
        F = T(800, 700, u)
        for (x, y, r) in ((-150, 150, 14), (-115, 115, 22)):
            EL(d, F, x, y, r, r, (255, 255, 255))
        RR(d, F, -170, -95, 170, 85, 60, (255, 255, 255))
        if u > 0.5:
            ov.append(dict(text="救命…", x=800, y=692, size=74, fill=RED, stroke=(255, 255, 255), sw=2,
                           scale=1.0 + 0.04 * math.sin(t * 20), alpha=1))
    return img, ov, (kf(lt, [(0, 1.0), (3.0, 1.22)]), 560, 1020)


def scene_struggle(t, lt):
    img = bg("hug").copy()
    d = ImageDraw.Draw(img)
    ov = []
    p_dizzy, p_wiggle, p_kick = lt < 1.1, 1.1 <= lt < 2.0, lt >= 2.0
    if p_dizzy:
        kw = dict(eyes="dot", mouth="flat", tail=dict(base=0.9, swing=0.1, curl=0.02))
        wob = 0.0
    elif p_wiggle:
        kw = dict(eyes="normal", mouth="flat", ears=0.4, tail=dict(base=0.6, swing=0.6, hz=1.6, curl=0.02),
                  hind=("dangle", 0.3))
        wob = 0.11 * math.sin(2 * math.pi * 2.4 * t)
    else:
        kw = dict(eyes="x", mouth="scream", ears=1.0, tail=dict(base=-0.7, swing=1.6, hz=3.2, curl=0.0),
                  hind=("dangle", 1.0))
        wob = 0.13 * math.sin(2 * math.pi * 3.6 * t)
    held(d, t, kw, wobble=wob, eyes_p="sleep" if lt < 2.0 else "happy")
    pop_text(ov, "懵", 330, 780, t, 3.25, 96, (150, 110, 200))
    if p_dizzy:
        u = ease_out_back((lt - 0.1) / 0.35)
        ov.append(dict(text="?", x=740, y=760 - 10 * math.sin(t * 5), size=130, fill=(150, 110, 200),
                       stroke=(255, 255, 255), sw=10, scale=u, alpha=1))
    if lt >= 1.1:
        for k, s in enumerate(("扭", "扭", "扭")):
            pop_text(ov, s, 250 + k * 290, 1120 - (k % 2) * 160, t, 3.0 + 1.1 + k * 0.25, 76, (245, 150, 60))
    if p_kick:
        pop_text(ov, "蹬!", 330, 1330, t, 5.2, 84, RED)
        pop_text(ov, "蹬!", 760, 1330, t, 5.55, 84, RED)
        pop_text(ov, "甩!", 860, 1060, t, 5.05, 80, RED)
    if t >= 6.6:
        u = ease_out_back((t - 6.6) / 0.35)
        ov.append(dict(text="放我下来！", x=540 + 6 * math.sin(t * 60), y=1450, size=118, fill=(255, 255, 255),
                       stroke=RED, sw=12, scale=u, alpha=1, rot=-4))
    z = 1.0 if lt < 2.0 else 1.02 + 0.012 * math.sin(t * 50)
    return img, ov, (z, 540, 1000)


def scene_air(t, lt):
    img = bg("air").copy()
    d = ImageDraw.Draw(img)
    ov = []
    jit = 5 * math.sin(t * 47)
    up = ease_out_back(lt / 0.5) if lt < 0.5 else 1.0
    cy = 1400 - 230 * up + 14 * math.sin(t * 3)
    # 地上四个空脚印 + ✗
    for k, x in enumerate((300, 440, 640, 780)):
        EL(d, FRAME_TF, x, 1560, 50, 20, (226, 170, 120))
        if lt > 0.6 + k * 0.12:
            LN(d, FRAME_TF, [(x - 26, 1536), (x + 26, 1584)], RED, 10)
            LN(d, FRAME_TF, [(x + 26, 1536), (x - 26, 1584)], RED, 10)
    EL(d, FRAME_TF, 540, 1560, 170 - 30 * up, 22, (224, 170, 120))  # 影子
    ctf = T(540 + jit, cy, 0.7)
    draw_cat(d, ctf, t, eyes="wide", mouth="scream", ears=0.9, hind=("dangle", 0.35),
             tail=dict(base=1.35, swing=0.5, hz=2.5, curl=0.0))
    sweat(d, FRAME_TF, 760 + jit, 840, 1.3)
    sweat(d, FRAME_TF, 330 + jit, 900, 0.9)
    for k in range(3):  # 发抖线
        x = 290 + jit
        LN(d, FRAME_TF, [(x - 20 * k - 20, 1040 + k * 40), (x - 20 * k - 50, 1050 + k * 40)], (150, 120, 170), 7)
        x = 790 + jit
        LN(d, FRAME_TF, [(x + 20 * k + 20, 1040 + k * 40), (x + 20 * k + 50, 1050 + k * 40)], (150, 120, 170), 7)
    label(ov, "脚下没支撑", 540, 1700, t, 9.0, 72, (255, 255, 255), RED, 10)
    label(ov, "跑不掉 → 紧张", 540, 1810, t, 10.6, 64, RED, (255, 255, 255), 8)
    return img, ov, (1.0, 540, 960)


def scene_love(t, lt):
    img = bg("paw").copy()
    d = ImageDraw.Draw(img)
    ov = []
    draw_person(d, T(310, 690, 1.0), t, outfit="sweater", eyes="happy", arms="side")
    rub = smooth((t - 16.0) / 0.5)
    lean = rub * (-0.14 + 0.05 * math.sin(2 * math.pi * 1.2 * t))
    ctf = T(760 - 170 * rub, 1460, 0.56, lean)
    close = kf(t, [(14.9, 0.0), (15.5, 1.0), (15.9, 1.0), (16.4, 0.0)])
    eyes = "happy" if rub > 0.5 else "normal"
    draw_cat(d, ctf, t, eyes=eyes, mouth="w", blush=0.4 + 0.6 * rub, close=close if eyes == "normal" else 0,
             tail=dict(base=-1.75, swing=0.25, hz=1.0, curl=0.04))
    if t > 14.9:
        label(ov, "慢眨眼", 860, 960, t, 14.9, 70, (255, 255, 255), DEEP, 9)
    if t > 16.1:
        label(ov, "蹭蹭", 860, 1080, t, 16.1, 70, (255, 255, 255), DEEP, 9)
        for i in range(5):
            u = ((t * 0.6 + i / 5) % 1.0)
            HEART(d, FRAME_TF, 560 + 90 * (i - 2) + 25 * math.sin(t * 2 + i), 1060 - 420 * u,
                  2.4 * math.sin(math.pi * u) + 0.05, (244, 114, 160) if i % 2 else (255, 182, 206))
    if t > 17.0:
        label(ov, "= 我爱你", 860, 1200, t, 17.0, 78, DEEP, (255, 255, 255), 9, rot=-4)
    return img, ov, (kf(lt, [(0, 1.0), (5.2, 1.1)]), 560, 1150)


def scene_howto(t, lt):
    img = bg("hug").copy()
    d = ImageDraw.Draw(img)
    ov = []
    held(d, t, dict(eyes="sleepy", mouth="w", blush=0.8, tail=dict(base=1.2, swing=0.1, curl=0.02)))
    if t > 19.4:  # 托胸
        check(d, 820, 1155, 1.2)
        LN(d, FRAME_TF, [(780, 1160), (645, 1150)], GREEN, 7)
        label(ov, "托胸", 930, 1155, t, 19.4, 70, (255, 255, 255), GREEN, 9)
    if t > 20.6:  # 托屁股
        check(d, 160, 1300, 1.2)
        LN(d, FRAME_TF, [(200, 1295), (320, 1255)], GREEN, 7)
        label(ov, "托屁股", 160, 1390, t, 20.6, 70, (255, 255, 255), GREEN, 9)
    if t > 21.6:
        label(ov, "四只脚都有支撑", 540, 1460, t, 21.6, 74, (255, 255, 255), GREEN, 10)
    return img, ov, (1.0, 540, 1000)


def scene_down(t, lt):
    img = bg("hug").copy()
    d = ImageDraw.Draw(img)
    ov = []
    lower = smooth((t - 23.7) / 0.6)
    released = t >= 24.35
    lash = t >= 22.75
    kw = dict(eyes="normal" if lash else "sleepy", mouth="flat", ears=0.5 * smooth((t - 23.1) / 0.3),
              tail=dict(base=-0.7, swing=1.5, hz=3.0, curl=0.0) if lash else dict(base=1.2, swing=0.1, curl=0.02))
    if released:
        kw = dict(eyes="happy", mouth="w", blush=0.5, tail=dict(base=-1.75, swing=0.3, hz=1.2, curl=0.04))
    held(d, t, kw, dy=380 * lower, arms=not released, eyes_p="happy")
    if lash and not released:
        label(ov, "!", 860, 1000, t, 22.75, 130, (255, 255, 255), RED, 12)
        label(ov, "甩尾巴", 860, 1130, t, 23.0, 64, (255, 255, 255), RED, 9)
    if t >= STAMP:
        u = clamp((t - STAMP) / 0.22)
        sc = 2.4 - 1.4 * smooth(u)
        F = T(540, 1000, sc, math.radians(-8))
        RR(d, F, -250, -84, 250, 84, 26, GREEN)
        RR(d, F, -236, -70, 236, 70, 18, (240, 255, 246))
        ov.append(dict(text="马上放下", x=540, y=998, size=max(1, int(104 * sc)), fill=GREEN,
                       stroke=(240, 255, 246), sw=2, scale=1, alpha=1, rot=8))
        if u >= 1:
            v = clamp((t - STAMP - 0.22) / 0.6)
            for k in range(8):
                a = 2 * math.pi * k / 8
                r = 290 + 160 * v
                if v < 1:
                    PG(d, FRAME_TF, star_pts(540 + r * math.cos(a), 1000 + r * 0.6 * math.sin(a), 26 * (1 - v)),
                       (255, 214, 120))
    shake = (8 * math.sin((t - STAMP) * 90) * (1 - clamp((t - STAMP) / 0.3))) if t > STAMP else 0
    return img, ov, (1.0, 540 + shake, 1000)


RENDER = dict(hook=scene_hook, struggle=scene_struggle, air=scene_air, love=scene_love,
              howto=scene_howto, down=scene_down)


# ------------------------------------------------------------------ subtitles / headline
def subtitle_chunks():
    info = json.load(open(os.path.join(VO_DIR, "lines.json")))
    chunks = []
    for start, li in zip(VO_START, info):
        text, dur = li["text"], li["dur"]
        parts, cur = [], ""
        for ch in text:
            cur += ch
            if ch in "，。；：！、":
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
            chunks.append((tt, tt + dd + (0.3 if k == len(groups) - 1 else 0), g.rstrip("，。：、")))
            tt += dd
    return chunks


SUBS = None


def draw_text_layer(frame, t, name, lt):
    global SUBS
    if SUBS is None:
        SUBS = subtitle_chunks()
    # 顶部大标题 (每段切换时弹入)
    hl = HEADLINES[name]
    im = text_img(hl, 92, (255, 255, 255), (110, 50, 80), 11)
    paste(frame, im, W / 2, 250, ease_out_back(lt / 0.3), clamp(lt / 0.1))
    for t0, t1, s in SUBS:
        if t0 <= t < t1:
            al = clamp((t - t0) / 0.1) * clamp((t1 - t) / 0.1)
            paste(frame, text_img(s, 66, (255, 255, 255), (110, 50, 80), 9), W / 2, 1640 if name != "air" else 1560,
                  1.0, al)
    if t >= TAGS:
        paste(frame, text_img("#猫咪行为  #养猫知识  #正确抱猫", 46, (255, 255, 255), DEEP, 6),
              W / 2, 1770, 1.0, clamp((t - TAGS) / 0.3))


# ------------------------------------------------------------------ frame
def compose(name, t, lt):
    img, ov, (z, fx, fy) = RENDER[name](t, lt)
    z = max(1.0, z)
    cw, ch = CW / z, CH / z
    u = clamp((z - 1) / 0.3)
    cx = CW / 2 + (fx * SS - CW / 2) * u
    cy = CH / 2 + (fy * SS - CH / 2) * u
    x0 = clamp(cx - cw / 2, 0, CW - cw)
    y0 = clamp(cy - ch / 2, 0, CH - ch)
    frame = img.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch)).convert("RGBA")
    for o in ov:
        X = (o["x"] * SS - x0) * z / SS
        Y = (o["y"] * SS - y0) * z / SS
        paste(frame, text_img(o["text"], o["size"], o["fill"], o["stroke"], o["sw"]), X, Y,
              o["scale"], o["alpha"], o.get("rot", 0))
    return frame


def scene_at(t):
    for k, (name, a, b) in enumerate(SCENES):
        if a <= t < b or k == len(SCENES) - 1:
            return k


def render(i):
    t = i / FPS
    cur = scene_at(t)
    name, a, b = SCENES[cur]
    frame = compose(name, t, t - a)
    if cur + 1 < len(SCENES) and t > b - XF / 2:
        nm, na, nb = SCENES[cur + 1]
        frame = Image.blend(frame, compose(nm, t, t - na), clamp((t - (b - XF / 2)) / XF) * 0.5)
    if cur > 0 and t < a + XF / 2:
        pm, pa, pb = SCENES[cur - 1]
        frame = Image.blend(compose(pm, t, t - pa), frame, 0.5 + clamp((t - a) / (XF / 2)) * 0.5)
    draw_text_layer(frame, t, name, t - a)
    frame = frame.convert("RGB")
    if t < 0.2:
        frame = Image.blend(Image.new("RGB", (W, H), (255, 255, 255)), frame, t / 0.2)
    return frame.tobytes()


# ------------------------------------------------------------------ audio
def make_audio(path):
    n = int(DUR * SR)
    music, vo, sfx = np.zeros(n), np.zeros(n), np.zeros(n)
    mel = ["E5", "G5", "C6", "G5", "A5", "G5", "E5", None, "D5", "E5", "G5", "E5", "D5", "C5", "D5", None,
           "E5", "G5", "C6", "D6", "C6", "A5", "G5", "E5", "F5", "E5", "D5", "G5", "C5", None, None, None]
    bass = ["C3", "A2", "F2", "G2"]
    k = 0
    while k * 0.28 < DUR:  # 比踩奶版更快一点, 节奏紧凑
        if mel[k % 32]:
            mbox(music, k * 0.28, note(mel[k % 32]), 0.2)
        if k % 8 == 0:
            mbox(music, k * 0.28, note(bass[(k // 8) % 4]), 0.15, 2.4)
        k += 1
    info = json.load(open(os.path.join(VO_DIR, "lines.json")))
    for st, li in zip(VO_START, info):
        a = load_wav(li["file"])
        s0 = int(st * SR)
        m = min(len(a), n - s0)
        vo[s0:s0 + m] += a[:m] / (np.abs(a).max() + 1e-9) * 0.9
    env = np.convolve((np.abs(vo) > 0.02).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
    music *= 1 - 0.55 * np.clip(env * 3, 0, 1)

    def add(t0, sig, g=1.0):
        s0 = int(t0 * SR)
        m = min(len(sig), n - s0)
        if m > 0:
            sfx[s0:s0 + m] += g * sig[:m]

    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(5)
    x = tt(0.35)  # 救命气泡 "啵"
    add(1.0, 0.3 * np.sin(2 * np.pi * (500 + 900 * x) * x) * np.exp(-x * 14))
    x = tt(0.5)  # 懵 "?" 弹簧音
    add(3.1, 0.25 * np.sin(2 * np.pi * (300 + 200 * np.sin(2 * np.pi * 9 * x)) * x) * np.exp(-x * 5))
    for k in range(3):  # 扭 swish
        x = tt(0.2)
        add(4.1 + k * 0.25, 0.2 * np.convolve(rng.standard_normal(len(x)), np.ones(15) / 15, "same")
            * np.sin(np.pi * x / 0.2) ** 2)
    for k in range(10):  # 蹬 咚咚
        x = tt(0.12)
        add(5.05 + k * 0.155, 0.35 * np.sin(2 * np.pi * (140 - 300 * x) * x) * np.exp(-x * 35))
    x = tt(0.3)  # 放我下来 嘟
    add(6.6, 0.25 * np.sign(np.sin(2 * np.pi * 330 * x)) * np.exp(-x * 9))
    for k in range(4):  # 悬空 警报 嘀嘀
        x = tt(0.12)
        add(8.9 + k * 0.5, 0.12 * np.sin(2 * np.pi * 1500 * x) * np.exp(-x * 20))
    for ts in (14.9, 16.1, 17.0):  # 爱心 叮
        mbox(sfx, ts, note("E6"), 0.16, 0.8)
        mbox(sfx, ts + 0.08, note("G6"), 0.12, 0.8)
    for ts in (19.4, 20.6, 21.6):  # 打勾 叮
        mbox(sfx, ts, note("C6"), 0.18, 0.8)
        mbox(sfx, ts + 0.07, note("E6"), 0.14, 0.8)
    x = tt(0.4)  # 甩尾 嗖
    add(22.75, 0.25 * np.convolve(rng.standard_normal(len(x)), np.ones(20) / 20, "same") * np.sin(np.pi * x / 0.4) ** 2)
    x = tt(0.4)  # 盖章
    add(STAMP + 0.2, 0.7 * np.sin(2 * np.pi * (90 + 60 * np.exp(-x * 25)) * x) * np.exp(-x * 12))
    for i, nn in enumerate(["C6", "E6", "G6", "C7"]):
        mbox(sfx, STAMP + 0.3 + i * 0.07, note(nn), 0.12, 1.0)
    mix = music * 0.55 + vo * 1.0 + sfx * 0.6
    mix[:int(0.15 * SR)] *= np.linspace(0, 1, int(0.15 * SR))
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
