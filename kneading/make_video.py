#!/usr/bin/env python3
"""《你家猫正在把你当妈》踩奶科普 30s 9:16 短视频 — 用户的粉色方块猫重制版.

参考: 用户上传的 moer-caimai-30s 视频 (6 段: 踩主人 / 小时候踩妈妈+外卖订单卡 / 长大踩毯子+17分钟 /
      特写流口水 / 肉垫气味腺 / 已认领).
先运行 voiceover.py 生成旁白, 再运行本脚本:
    python3 kneading/voiceover.py && python3 kneading/make_video.py
预览单帧: python3 kneading/make_video.py preview 2 7 ...
"""
import json
import math
import os
import subprocess
import sys
import wave
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")
OUT_MP4 = os.path.join(OUT_DIR, "cat_kneading_30s.mp4")
VO_DIR = os.path.join(HERE, "vo")
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

W, H, SS = 1080, 1920, 2
CW, CH = W * SS, H * SS
FPS, DUR = 30, 30.0
N = int(FPS * DUR)
SR = 44100

# ------------------------------------------------------------------ timeline
# (scene, start, end)
SCENES = [("owner", 0.0, 3.8), ("baby", 3.8, 10.6), ("blanket", 10.6, 16.6),
          ("closeup", 16.6, 20.6), ("paw", 20.6, 26.2), ("hug", 26.2, 30.0)]
VO_START = [0.6, 4.2, 11.0, 17.0, 21.0, 26.6]
CARD_IN = 4.7
CLOCK_IN = 12.6
PAW_CLOSE = 22.6
STAMP = 28.05
XF = 0.3  # crossfade

C = dict(
    ear=(238, 136, 168), ear_in=(250, 196, 212), head_top=(253, 214, 226), head_side=(235, 160, 186),
    head=(249, 198, 214), body=(247, 185, 204), body_side=(229, 147, 176), spot=(229, 150, 180),
    paw=(250, 206, 220), eye=(18, 18, 18), white=(255, 255, 255), cheek=(242, 123, 160),
    cheek_deep=(236, 90, 135), nose=(239, 108, 143), muzzle=(247, 184, 165), mouth=(190, 80, 110),
    drool=(214, 238, 255), pink=(236, 90, 135), pad=(240, 130, 165),
    skin=(247, 216, 196), skin_sh=(234, 186, 160), hair=(96, 60, 48), hair_hi=(128, 84, 64),
    pj=(244, 172, 198), pj_dot=(253, 222, 232), sweater=(124, 184, 146), sweater_dk=(98, 160, 122),
    pants=(78, 128, 92), lip=(214, 100, 112),
    sofa=(76, 138, 96), sofa_dk=(58, 112, 76), sofa_hi=(96, 160, 114),
)


# ------------------------------------------------------------------ math helpers
def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x, s=1.70158):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def kf(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0))
    return keys[-1][1]


class T:
    """2D transform: local units -> canvas px. (pre-translate, scale, rotate, then place)."""

    def __init__(self, ox, oy, s=1.0, a=0.0, px=0.0, py=0.0):
        self.ox, self.oy, self.s, self.a, self.px, self.py = ox, oy, s, a, px, py
        self.c, self.sn = math.cos(a), math.sin(a)

    def __call__(self, x, y):
        x, y = (x + self.px) * self.s, (y + self.py) * self.s
        return ((self.ox + x * self.c - y * self.sn) * SS, (self.oy + x * self.sn + y * self.c) * SS)

    def pre(self, dx, dy):
        return T(self.ox, self.oy, self.s, self.a, self.px + dx, self.py + dy)

    def frame(self, x, y):
        X, Y = self(x, y)
        return X / SS, Y / SS


def PG(d, tf, pts, fill):
    d.polygon([tf(x, y) for x, y in pts], fill=fill)


def RC(d, tf, x0, y0, x1, y1, fill):
    PG(d, tf, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill)


def ell_pts(cx, cy, rx, ry, n=36, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    return [(cx + rx * math.cos(2 * math.pi * i / n) * c - ry * math.sin(2 * math.pi * i / n) * s,
             cy + rx * math.cos(2 * math.pi * i / n) * s + ry * math.sin(2 * math.pi * i / n) * c) for i in range(n)]


def EL(d, tf, cx, cy, rx, ry, fill, rot=0.0):
    PG(d, tf, ell_pts(cx, cy, rx, ry, 36, rot), fill)


def rr_pts(x0, y0, x1, y1, r, n=6):
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    pts = []
    for cx, cy, a0 in [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]:
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def RR(d, tf, x0, y0, x1, y1, r, fill):
    PG(d, tf, rr_pts(x0, y0, x1, y1, r), fill)


def LN(d, tf, pts, fill, w):
    d.line([tf(x, y) for x, y in pts], fill=fill, width=max(1, int(w * tf.s * SS)), joint="curve")


def heart_pts(cx, cy, s, n=48):
    out = []
    for i in range(n):
        u = 2 * math.pi * i / n
        out.append((cx + s * 16 * math.sin(u) ** 3,
                    cy - s * (13 * math.cos(u) - 5 * math.cos(2 * u) - 2 * math.cos(3 * u) - math.cos(4 * u))))
    return out


def HEART(d, tf, cx, cy, s, fill):
    PG(d, tf, heart_pts(cx, cy, s), fill)


def star_pts(cx, cy, r):
    return [(cx + (r if i % 2 == 0 else r * 0.3) * math.cos(math.pi / 4 * i - math.pi / 2),
             cy + (r if i % 2 == 0 else r * 0.3) * math.sin(math.pi / 4 * i - math.pi / 2)) for i in range(8)]


FRAME_TF = T(0, 0, 1.0)  # frame px coordinates


# ------------------------------------------------------------------ characters
def knead(t, hz=1.5, amp=34):
    """returns (left_lift, right_lift, sway) — 两只前爪交替踩."""
    ph = 2 * math.pi * hz * t
    return -amp * max(0.0, math.sin(ph)), -amp * max(0.0, math.sin(ph + math.pi)), 4 * math.sin(ph)


def draw_cat(d, tf0, t, eyes="normal", mouth=None, drool=0.0, kneading=None, blush=0.0, breath=True):
    """用户的粉色方块猫. 坐标沿用原图 (1140x1200), 原点=身体底部中心 (540, 831)."""
    tf = tf0.pre(-540, -831)
    lp, rp, sway = kneading if kneading else (0.0, 0.0, 0.0)
    br = 2.5 * math.sin(t * 2 * math.pi / 3.0) if breath else 0.0
    hx, hy = sway * 0.8, br + (abs(sway) * 1.2 if kneading else 0)
    bt = 585 + br * 0.5
    # body
    PG(d, tf, [(336 + sway * .3, bt - 12), (390 + sway * .3, bt), (390, 825), (336, 798)], C["body_side"])
    PG(d, tf, [(390 + sway * .3, bt), (750 + sway * .3, bt), (750, 825), (390, 825)], C["body"])
    for (cx, cy, r) in [(495, 705, 25), (600, 675, 35), (675, 745, 22), (546, 768, 16)]:
        pts = ell_pts(cx, cy, r, r)
        d.line([tf(x, y) for x, y in pts + pts[:1]], fill=C["spot"], width=max(1, int(5 * tf.s * SS)))
    # front paws / legs
    for x0, lift in ((414, lp), (636, rp)):
        if kneading:
            RC(d, tf, x0, 700, x0 + 90, 806 + lift, C["body"])
            RC(d, tf, x0 - 4, 790 + lift, x0 + 94, 836 + lift, C["paw"])
            for k in range(3):
                RC(d, tf, x0 + 14 + k * 26, 822 + lift, x0 + 18 + k * 26, 836 + lift, C["spot"])
        else:
            RC(d, tf, x0, 783, x0 + 90, 831, C["paw"])
    # ears
    PG(d, tf, [(385 + hx, 255 + hy), (438 + hx, 107 + hy), (528 + hx, 255 + hy)], C["ear"])
    PG(d, tf, [(420 + hx, 255 + hy), (441 + hx, 173 + hy), (488 + hx, 255 + hy)], C["ear_in"])
    PG(d, tf, [(640 + hx, 255 + hy), (720 + hx, 107 + hy), (775 + hx, 280 + hy)], C["ear"])
    PG(d, tf, [(676 + hx, 255 + hy), (714 + hx, 173 + hy), (745 + hx, 270 + hy)], C["ear_in"])
    th = tf.pre(hx, hy)
    PG(d, th, [(300, 255), (720, 255), (780, 285), (360, 285)], C["head_top"])
    PG(d, th, [(300, 255), (360, 285), (360, 585), (300, 555)], C["head_side"])
    RC(d, th, 360, 285, 780, 585, C["head"])
    # eyes
    E = [(414, 345, 516, 465), (624, 345, 726, 465)]
    blink = any(b <= t % 4.0 < b + 0.15 for b in (2.6,))
    for x0, y0, x1, y1 in E:
        cx = (x0 + x1) / 2
        if eyes == "happy":
            LN(d, th, [(x0 + 8, 432), (cx, 378), (x1 - 8, 432)], C["eye"], 16)
        elif eyes == "sleepy" or (eyes == "normal" and blink):
            LN(d, th, [(x0 + 6, 405), (x0 + 28, 425), (cx, 431), (x1 - 28, 425), (x1 - 6, 405)], C["eye"], 15)
        else:
            RC(d, th, x0, y0, x1, y1, C["eye"])
            RC(d, th, x0 + 18, y0 + 15, x0 + 54, y0 + 51, C["white"])
            RC(d, th, x0 + 60, y0 + 75, x0 + 84, y0 + 99, C["white"])
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
            pts = [(a + 30 * i / 10, 524 + 10 * math.sin(math.pi * i / 10)) for i in range(11)]
            LN(d, th, pts, C["mouth"], 5)
    elif mouth == "open":
        EL(d, th, 570, 532, 16, 12, C["mouth"])
    if drool > 0.02:
        L = 70 * drool
        LN(d, th, [(606, 540), (608, 540 + L)], C["drool"], 9)
        EL(d, th, 608, 546 + L, 9 + 3 * drool, 11 + 3 * drool, C["drool"])
        EL(d, th, 605, 543 + L, 3, 4, C["white"])


def draw_person(d, tf, t, outfit="pj", eyes="sleep", arms="side"):
    """方块风主人. 原点=脖子底部中心, 头朝 -y."""
    top = C["pj"] if outfit == "pj" else C["sweater"]
    RC(d, tf, -118, -215, 118, 150, C["hair"])                      # long hair (back)
    # torso
    RR(d, tf, -135, 5, 135, 340, 26, top)
    if outfit == "pj":
        for i in range(-2, 3):
            for j in range(4):
                HEART(d, tf, i * 52 + (j % 2) * 26, 60 + j * 70, 1.0, C["pj_dot"])
        PG(d, tf, [(-40, 5), (0, 55), (40, 5)], C["skin_sh"])
        PG(d, tf, [(-40, 5), (-8, 40), (-58, 30)], C["pj_dot"])
        PG(d, tf, [(40, 5), (8, 40), (58, 30)], C["pj_dot"])
    else:
        RC(d, tf, -135, 300, 135, 340, C["sweater_dk"])
        for k in range(-4, 5):
            RC(d, tf, k * 28 - 3, 300, k * 28 + 3, 340, top)
        HEART(d, tf, -70, 90, 1.2, C["cheek"])
    RC(d, tf, -110, 340, 110, 720, C["pants"])                     # legs
    if arms == "side":
        for s in (-1, 1):
            RR(d, tf, s * 135 - 25, 20, s * 135 + 25, 300, 20, top)
            RR(d, tf, s * 135 - 22, 290, s * 135 + 22, 340, 14, C["skin"])
    RC(d, tf, -22, -25, 22, 12, C["skin_sh"])                      # neck
    RC(d, tf, -92, -200, 92, -18, C["skin"])                       # head
    RC(d, tf, -92, -200, -78, -18, C["skin_sh"])
    PG(d, tf, [(-104, -228), (104, -228), (104, -150), (50, -160), (10, -140), (-40, -165), (-104, -138)], C["hair"])
    RC(d, tf, -110, -205, -82, 70, C["hair"])
    RC(d, tf, 82, -205, 110, 70, C["hair"])
    RC(d, tf, -60, -222, 20, -210, C["hair_hi"])
    for s in (-1, 1):
        cx = s * 42
        if eyes == "sleep":
            LN(d, tf, [(cx - 22, -104), (cx, -92), (cx + 22, -104)], C["eye"], 7)
        else:  # happy
            LN(d, tf, [(cx - 22, -92), (cx, -110), (cx + 22, -92)], C["eye"], 8)
        RC(d, tf, cx - 18 + s * 10, -76, cx + 18 + s * 10, -62, (244, 160, 170))
    smile = 1.0 if eyes == "happy" else 0.5
    LN(d, tf, [(-16, -50), (0, -50 + 10 * smile), (16, -50)], C["lip"], 6)


# ------------------------------------------------------------------ backgrounds (static, cached)
_BG = {}


def bg(name):
    if name in _BG:
        return _BG[name]
    img = Image.new("RGB", (CW, CH))
    d = ImageDraw.Draw(img)
    F = FRAME_TF
    if name in ("owner", "hug"):
        RC(d, F, 0, 0, W, H, (240, 214, 224))
        # bookshelf
        RC(d, F, 40, 160, 520, 700, (150, 104, 84))
        for k, y in enumerate((180, 360, 540)):
            RC(d, F, 60, y, 500, y + 150, (120, 80, 64))
            x = 70
            cols = [(236, 120, 150), (130, 180, 220), (250, 210, 120), (160, 200, 150), (200, 150, 220), (245, 160, 120)]
            i = k
            while x < 470:
                w = 26 + (i * 13) % 22
                h = 100 + (i * 29) % 45
                RC(d, F, x, y + 150 - h, x + w, y + 150, cols[i % len(cols)])
                x += w + 6
                i += 1
        # lamp glow + lamp
        for r, c in ((210, (246, 224, 222)), (150, (250, 232, 214))):
            EL(d, F, 830, 300, r, r, c)
        PG(d, F, [(760, 220), (900, 220), (940, 330), (720, 330)], (255, 214, 150))
        RC(d, F, 820, 330, 840, 520, (150, 104, 84))
        HEART(d, F, 660, 520, 4.0, (240, 160, 190))
        if name == "owner":
            RR(d, F, -40, 760, 1120, 1240, 60, C["sofa_dk"])
            for x in (340, 700):
                RC(d, F, x - 4, 790, x + 4, 1200, (50, 98, 66))
            RR(d, F, -40, 1150, 1120, 1560, 50, C["sofa"])
            RR(d, F, 880, 900, 1120, 1520, 60, C["sofa_hi"])
            RC(d, F, 0, 1540, W, H, (176, 126, 96))
            for y in range(1600, H, 90):
                RC(d, F, 0, y, W, y + 6, (156, 108, 80))
        else:
            RR(d, F, -60, 1150, 1140, H + 60, 80, C["sofa_dk"])
    elif name == "baby":
        RC(d, F, 0, 0, W, H, (247, 196, 214))
        for j in range(0, 22):
            for i in range(0, 9):
                HEART(d, F, i * 135 + (j % 2) * 67, j * 95, 2.4, (251, 214, 228))
        RR(d, F, 40, 100, 1040, 520, 60, (240, 170, 198))       # crib bar
        for x in range(90, 1040, 110):
            RR(d, F, x, 120, x + 30, 500, 15, (250, 220, 232))
    elif name == "blanket":
        RC(d, F, 0, 0, W, H, (236, 212, 228))
        # window with warm light
        RC(d, F, 120, 150, 700, 820, (255, 248, 240))
        RC(d, F, 140, 170, 400, 800, (255, 222, 184))
        RC(d, F, 420, 170, 680, 800, (255, 222, 184))
        for k in range(5):
            PG(d, F, [(140 + k * 110, 800), (220 + k * 110, 800), (420 + k * 110, 170), (360 + k * 110, 170)], (255, 232, 204))
        RC(d, F, 60, 120, 160, 900, (240, 168, 196))
        RC(d, F, 660, 120, 760, 900, (240, 168, 196))
        RC(d, F, 40, 100, 780, 130, (200, 140, 170))
        RC(d, F, 0, 960, W, 1300, (186, 140, 186))             # sofa back (purple)
        for x, c in ((80, (236, 160, 110)), (860, (140, 190, 230))):
            RR(d, F, x - 70, 1000, x + 150, 1240, 40, c)       # pillows
        RC(d, F, 0, 1260, W, H, (236, 150, 180))             # knitted blanket
        for y in range(1280, H, 34):
            for x in range(0, W, 34):
                c = (226, 136, 168)
                d.line([F(x, y), F(x + 17, y + 20), F(x + 34, y)], fill=c, width=3 * SS)
        for i, (x, y) in enumerate([(140, 1420), (930, 1380), (220, 1760), (820, 1800), (520, 1700), (1000, 1640)]):
            for k in range(5):
                a = 2 * math.pi * k / 5
                EL(d, F, x + 20 * math.cos(a), y + 20 * math.sin(a), 15, 15, (220, 70, 90))
            EL(d, F, x, y, 11, 11, (255, 214, 120))
            EL(d, F, x + 30, y + 34, 18, 8, (110, 170, 100), rot=0.6)
    elif name == "paw":
        RC(d, F, 0, 0, W, H, (227, 211, 238))
        RC(d, F, 640, 380, 1040, 980, (255, 255, 255))
        RC(d, F, 656, 396, 832, 964, (191, 221, 242))
        RC(d, F, 848, 396, 1024, 964, (191, 221, 242))
        RC(d, F, 0, 1380, W, H, (239, 196, 145))
        for y in range(1440, H, 80):
            RC(d, F, 0, y, W, y + 5, (224, 174, 120))
    elif name == "pawclose":
        RC(d, F, 0, 0, W, H, (244, 206, 222))
        for r, c in ((700, (247, 216, 230)), (420, (250, 226, 236))):
            EL(d, F, 540, 820, r, r, c)
    _BG[name] = img
    return img


# ------------------------------------------------------------------ scenes
# each returns (canvas, overlays, camera)   camera=(zoom, fx, fy) in frame px
def pop_text(ov, s, x, y, t, t0, size=58, color=(236, 90, 135)):
    u = (t - t0) / 0.6
    if 0 <= u <= 1:
        ov.append(dict(text=s, x=x, y=y - 50 * u, size=size, fill=color, stroke=(255, 255, 255),
                       sw=6, scale=ease_out_back(u / 0.4), alpha=1 - smooth((u - 0.6) / 0.4)))


def knead_pops(ov, t, tf, hz, x_l, x_r, y):
    """每次爪子落下时冒出一个 "踩"."""
    ph = (t * hz) % 1.0
    k = int(t * hz)
    for side, off in ((0, 0.5), (1, 0.0)):
        t0 = (k + off) / hz if (ph >= off) else (k - 1 + off) / hz
        fx, fy = tf.frame(x_l if side == 0 else x_r, y)
        pop_text(ov, "踩", fx, fy, t, t0, 50)


def scene_owner(t, lt):
    img = bg("owner").copy()
    d = ImageDraw.Draw(img)
    breathe = 1 + 0.01 * math.sin(t * 2 * math.pi / 3.5)
    ptf = T(790, 1040, 1.15 * breathe, math.radians(68))
    draw_person(d, ptf, t)
    HEART(d, FRAME_TF, 980, 900, 3.2, (250, 200, 220))
    kn = knead(t, 1.4)
    ctf = T(560, 1200, 0.68)
    draw_cat(d, ctf, t, eyes="sleepy" if lt > 1.2 else "normal", mouth="w", kneading=kn, blush=0.5)
    ov = []
    knead_pops(ov, t, ctf, 1.4, -80, 140, -40)
    for i in range(3):  # 呼噜 z
        u = ((t * 0.6 + i / 3) % 1.0)
        ov.append(dict(text="噜", x=900 + 40 * u, y=760 - 160 * u, size=44 + 20 * u, fill=(150, 110, 160),
                       stroke=(255, 255, 255), sw=5, scale=1, alpha=math.sin(math.pi * u)))
    z = kf(lt, [(0, 1.0), (3.8, 1.12)])
    return img, ov, (z, 640, 1020)


def scene_baby(t, lt):
    img = bg("baby").copy()
    d = ImageDraw.Draw(img)
    mom = T(70, 1260, 1.25, math.radians(90))
    draw_cat(d, mom, t, eyes="happy", blush=0.6, breath=True)
    kn = knead(t, 2.2, 28)
    ktf = T(330, 1395, 0.45)
    draw_cat(d, ktf, t, eyes="sleepy", mouth="w", kneading=kn, blush=0.8)
    ov = []
    knead_pops(ov, t, ktf, 2.2, -80, 140, -40)
    z = kf(lt, [(0, 1.0), (6.8, 1.15)])
    return img, ov, (z, 400, 1150)


def scene_blanket(t, lt, close=False):
    img = bg("blanket").copy()
    d = ImageDraw.Draw(img)
    kn = knead(t, 1.2, 36)
    ctf = T(540, 1540, 0.95)
    dr = smooth((lt - 1.5) / 2.5) * 0.8 if not close else 0.8 + 0.5 * smooth(lt / 3)
    draw_cat(d, ctf, t, eyes="sleepy", mouth="open" if close else "w", drool=dr, kneading=kn, blush=0.7)
    ov = []
    if not close:
        knead_pops(ov, t, ctf, 1.2, -80, 140, -40)
    # 计时钟
    if t >= CLOCK_IN and not close:
        u = ease_out_back((t - CLOCK_IN) / 0.4)
        cx, cy = 800, 330
        F = T(cx, cy, u)
        LN(d, F, [(-90, -110), (0, -170), (90, -110)], (130, 90, 80), 5)
        RR(d, F, -170, -110, 170, 110, 24, (110, 70, 64))
        RR(d, F, -155, -96, 155, 96, 18, (40, 26, 34))
        m = int(min(17, 17 * clamp((t - CLOCK_IN - 0.2) / 1.4)))
        ov.append(dict(text=f"{m:02d}:00", x=cx, y=cy - 25, size=int(100 * u) or 1, fill=(255, 70, 70),
                       stroke=(120, 20, 30), sw=2, scale=1, alpha=1))
        ov.append(dict(text=f"已经踩了{m}分钟", x=cx, y=cy + 55, size=int(36 * u) or 1, fill=(255, 120, 110),
                       stroke=(40, 26, 34), sw=1, scale=1, alpha=1))
    if close:
        for i in range(4):
            u = ((t * 0.5 + i / 4) % 1.0)
            ov.append(dict(text="呼噜" if i % 2 else "噜～", x=230 + i * 190, y=640 - 140 * u, size=50,
                           fill=(150, 100, 150), stroke=(255, 255, 255), sw=6, scale=1, alpha=math.sin(math.pi * u)))
        return img, ov, (kf(lt, [(0, 1.8), (4.0, 2.05)]), 560, 1170)
    return img, ov, (kf(lt, [(0, 1.0), (6.0, 1.1)]), 600, 1200)


def scene_paw(t, lt):
    ov = []
    if t < PAW_CLOSE:
        img = bg("paw").copy()
        d = ImageDraw.Draw(img)
        F = FRAME_TF
        RR(d, F, 240, 1310, 840, 1480, 50, (246, 186, 208))
        RR(d, F, 240, 1290, 840, 1360, 40, (252, 214, 228))
        RC(d, F, 470, 1480, 610, 1700, (232, 198, 145))
        bob = 6 * math.sin(t * 3)
        draw_cat(d, T(540, 1325, 0.8), t, eyes="happy", mouth="w", blush=0.6)
        HEART(d, F, 880, 520 + bob, 6.5 + 0.4 * math.sin(t * 6), (244, 114, 160))
        HEART(d, F, 880, 525 + bob, 4.8 + 0.3 * math.sin(t * 6), (255, 190, 214))
        return img, ov, (kf(lt, [(0, 1.0), (2.0, 1.12)]), 540, 1000)
    # 肉垫特写
    pt = t - PAW_CLOSE
    img = bg("pawclose").copy()
    d = ImageDraw.Draw(img)
    press = max(0.0, math.sin(2 * math.pi * 1.1 * pt))
    sq = 1 - 0.06 * press
    F = T(540, 900 + 40 * press, 1.0)
    RR(d, F, -300, -380, 300, 420 * sq, 120, (250, 210, 224))
    RR(d, F, -300, -380, -230, 420 * sq, 60, (240, 186, 206))
    # toe beans + main pad
    for x, y, r in ((-170, -170, 62), (-60, -240, 66), (60, -240, 66), (170, -170, 62)):
        EL(d, F, x, y * sq, r, r * 1.1, C["pad"])
        EL(d, F, x - 18, (y - 22) * sq, r * 0.28, r * 0.22, (250, 180, 200))
    PG(d, F, [(x, y * sq) for x, y in heart_pts(0, 70, 11.5)], C["pad"])
    EL(d, F, -60, 20 * sq, 40, 24, (250, 180, 200))
    # 气味波纹 + 小爱心
    for i in range(6):
        u = ((pt * 0.55 + i / 6) % 1.0)
        x0 = -220 + i * 88
        pts = [(x0 + 22 * math.sin(k / 3 + pt * 4 + i), -420 - 340 * u - k * 9) for k in range(12)]
        if u < 0.9:
            LN(d, F, pts, (255, 160, 196), 7 * (1 - u))
        if i % 2 == 0:
            HEART(d, F, x0 + 30 * math.sin(pt * 3 + i), -470 - 520 * u, 2.6 * math.sin(math.pi * u) + 0.1, (244, 114, 160))
    if pt > 0.6:
        u = ease_out_back((pt - 0.6) / 0.4)
        ov.append(dict(text="气味腺", x=820, y=1260, size=int(64 * u) or 1, fill=(255, 255, 255),
                       stroke=(236, 90, 135), sw=10, scale=1, alpha=1))
        LN(d, FRAME_TF, [(740, 1250), (640, 1100)], (236, 90, 135), 8)
    if pt > 1.6:
        ov.append(dict(text="专属味道～", x=300, y=520, size=60, fill=(236, 90, 135), stroke=(255, 255, 255),
                       sw=8, scale=ease_out_back((pt - 1.6) / 0.4), alpha=1))
    return img, ov, (1.0, 540, 960)


def scene_hug(t, lt):
    img = bg("hug").copy()
    d = ImageDraw.Draw(img)
    sway = 0.04 * math.sin(lt * 2.2)
    ptf = T(470, 980, 1.35, sway * 0.5)
    draw_person(d, ptf, t, outfit="sweater", eyes="happy", arms="none")
    ctf = T(770, 1260, 0.78, -0.08 + sway)
    draw_cat(d, ctf, t, eyes="happy", mouth="w", blush=1.0)
    # 手臂抱住猫
    RR(d, ptf, -170, 30, -115, 250, 26, C["sweater"])
    RR(d, ptf, -150, 190, 330, 255, 30, C["sweater"])
    RR(d, ptf, 300, 175, 370, 260, 30, C["skin"])
    RR(d, ptf, 115, 30, 170, 120, 26, C["sweater"])
    ov = []
    for i in range(6):
        u = ((lt * 0.45 + i / 6) % 1.0)
        HEART(d, FRAME_TF, 140 + i * 160 + 30 * math.sin(lt * 2 + i), 1150 - 700 * u,
              2.6 * math.sin(math.pi * u), (244, 114, 160) if i % 2 else (255, 182, 206))
    if t >= STAMP:
        u = clamp((t - STAMP) / 0.22)
        sc = 2.4 - 1.4 * smooth(u)
        F = T(330, 1330, sc, math.radians(-12))
        RR(d, F, -170, -78, 170, 78, 26, (236, 70, 110))
        RR(d, F, -156, -64, 156, 64, 18, (255, 240, 244))
        ov.append(dict(text="已认领", x=330, y=1328, size=max(1, int(92 * sc)), fill=(236, 70, 110),
                       stroke=(255, 240, 244), sw=2, scale=1, alpha=1, rot=12))
        if u >= 1:
            for k in range(8):
                a = 2 * math.pi * k / 8
                v = clamp((t - STAMP - 0.22) / 0.6)
                r = 210 + 160 * v
                if v < 1:
                    PG(d, FRAME_TF, star_pts(330 + r * math.cos(a), 1330 + r * 0.7 * math.sin(a), 26 * (1 - v)),
                       (255, 214, 120))
    shake = (8 * math.sin((t - STAMP) * 90) * (1 - clamp((t - STAMP) / 0.3))) if t > STAMP else 0
    return img, ov, (kf(lt, [(0, 1.06), (3.8, 1.0)]), 600 + shake, 1100)


def render_scene(name, t, lt):
    if name == "owner":
        return scene_owner(t, lt)
    if name == "baby":
        return scene_baby(t, lt)
    if name == "blanket":
        return scene_blanket(t, lt)
    if name == "closeup":
        return scene_blanket(t, lt, close=True)
    if name == "paw":
        return scene_paw(t, lt)
    return scene_hug(t, lt)


# ------------------------------------------------------------------ text & UI
_FONTS, _TXT = {}, {}


def font(size):
    if size not in _FONTS:
        _FONTS[size] = ImageFont.truetype(FONT_PATH, size)
    return _FONTS[size]


def text_img(s, size, fill, stroke, sw):
    key = (s, size, fill, stroke, sw)
    if key not in _TXT:
        f = font(size)
        bb = ImageDraw.Draw(Image.new("L", (1, 1))).textbbox((0, 0), s, font=f, stroke_width=sw)
        im = Image.new("RGBA", (bb[2] - bb[0] + 8, bb[3] - bb[1] + 8), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((4 - bb[0], 4 - bb[1]), s, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke)
        _TXT[key] = im
    return _TXT[key]


def paste(frame, im, cx, cy, scale=1.0, alpha=1.0, rot=0.0):
    if scale <= 0.02 or alpha <= 0.02:
        return
    if abs(scale - 1) > 0.01:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 0.99:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    frame.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def draw_card(frame, t):
    """外卖订单卡 (像素风粉色 UI)."""
    u = ease_out_back((t - CARD_IN) / 0.45)
    a = 1 - smooth((t - (SCENES[1][2] - 0.35)) / 0.3)
    if u <= 0.02 or a <= 0.02:
        return
    lay = Image.new("RGBA", (900, 980), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    PINK, DEEP, TXT = (240, 140, 170), (236, 90, 135), (200, 60, 90)
    d.rounded_rectangle([20, 40, 880, 960], 40, fill=(255, 244, 248), outline=PINK, width=10)
    d.rounded_rectangle([20, 40, 880, 160], 40, fill=(252, 214, 228))
    d.rectangle([30, 120, 870, 160], fill=(252, 214, 228))
    d.text((70, 72), "外卖订单", font=font(56), fill=(150, 60, 100))
    d.rounded_rectangle([640, 10, 830, 70], 20, fill=(236, 70, 110))
    d.text((690, 18), "热销", font=font(40), fill=(255, 255, 255))
    d.rounded_rectangle([630, 78, 840, 142], 16, fill=(255, 255, 255), outline=(236, 70, 110), width=5)
    d.text((655, 88), "已接单", font=font(42), fill=(236, 70, 110))
    d.rounded_rectangle([70, 200, 830, 470], 26, fill=(255, 255, 255), outline=(250, 200, 216), width=5)
    tw = d.textlength("踩踩下单", font=font(92))
    d.text((450 - tw / 2, 222), "踩踩下单", font=font(92), fill=DEEP)
    d.line([110, 345, 790, 345], fill=(250, 200, 216), width=4)
    # milk bottle
    d.rounded_rectangle([120, 372, 170, 450], 12, fill=(255, 255, 255), outline=(200, 170, 180), width=4)
    d.rectangle([132, 360, 158, 376], fill=(200, 170, 180))
    d.rectangle([124, 410, 166, 446], fill=(255, 248, 236))
    d.text((200, 375), "妈妈牌热奶", font=font(60), fill=(170, 70, 100))
    # scooter
    d.ellipse([690, 420, 726, 456], fill=(90, 60, 80))
    d.ellipse([770, 420, 806, 456], fill=(90, 60, 80))
    d.polygon([(700, 420), (800, 420), (790, 390), (740, 390), (730, 405), (700, 405)], fill=(236, 70, 110))
    d.rectangle([760, 365, 800, 395], fill=(255, 140, 120))
    d.rounded_rectangle([70, 500, 830, 900], 26, fill=(255, 255, 255), outline=(250, 200, 216), width=5)
    lines = [(5.3, "踩一下单，妈妈牌热奶，", TXT), (7.15, "踩一下，奶就来了，", TXT), (8.6, "比点外卖", DEEP)]
    for i, (ts, s, col) in enumerate(lines):
        if t >= ts:
            y = 535 + i * 115
            sz = 54 if i < 2 else 72
            d.text((110, y), s, font=font(sz), fill=col)
            if i == 1:
                d.polygon([(690, y + 5), (650, y + 40), (676, y + 40), (660, y + 75), (705, y + 30), (680, y + 30)], fill=(236, 70, 110))
            if i == 2:
                x = 110 + d.textlength("比点外卖", font=font(72))
                d.text((x, y), "还快", font=font(72), fill=(245, 150, 60))
                d.line([110, y + 92, x + 150, y + 92], fill=(245, 150, 60), width=7)
                d.polygon([(x + 200, y + 10), (x + 180, y + 50), (x + 200, y + 70), (x + 220, y + 50)], fill=(150, 200, 240))
    paste(frame, lay, 540, 960, 0.98 * u, a)


def subtitle_chunks():
    info = json.load(open(os.path.join(VO_DIR, "lines.json")))
    chunks = []
    for (start, li) in zip(VO_START, info):
        text, dur = li["text"], li["dur"]
        parts, cur = [], ""
        for ch in text:
            cur += ch
            if ch in "，。；：":
                parts.append(cur)
                cur = ""
        if cur:
            parts.append(cur)
        groups, g = [], ""
        for p in parts:
            if len(g) + len(p) > 13 and g:
                groups.append(g)
                g = p
            else:
                g += p
        groups.append(g)
        total = sum(len(x) for x in groups)
        tt = start
        for k, g in enumerate(groups):
            d = dur * len(g) / total
            end = tt + d + (0.35 if k == len(groups) - 1 else 0)
            chunks.append((tt, end, g.rstrip("，。")))
            tt += d
    return chunks


SUBS = None


def draw_subs(frame, t):
    global SUBS
    if SUBS is None:
        SUBS = subtitle_chunks()
    if SCENES[1][1] + 0.9 <= t < SCENES[1][2]:  # 订单卡上已有文字
        return
    for t0, t1, s in SUBS:
        if t0 <= t < t1:
            al = clamp((t - t0) / 0.12) * clamp((t1 - t) / 0.12)
            im = text_img(s, 68, (255, 255, 255), (110, 50, 80), 9)
            paste(frame, im, W / 2, 1610, 1.0, al)
            if s.endswith("我的"):
                h = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
                ImageDraw.Draw(h).polygon([(x + 40, y + 42) for x, y in heart_pts(0, 0, 2.0)], fill=(244, 90, 140))
                paste(frame, h, W / 2 + im.width / 2 + 30, 1606, 1.0 + 0.1 * math.sin(t * 10), al)
    if t >= 28.9:
        paste(frame, text_img("#踩奶  #猫咪行为  #治愈系动画", 46, (255, 255, 255), (236, 90, 135), 6),
              W / 2, 1760, 1.0, clamp((t - 28.9) / 0.3))


# ------------------------------------------------------------------ frame
def compose(name, t, lt):
    img, ov, (z, fx, fy) = render_scene(name, t, lt)
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
    if name == "baby" and t >= CARD_IN:
        b = clamp((t - CARD_IN) / 0.3) * (1 - smooth((t - (SCENES[1][2] - 0.35)) / 0.3))
        if b > 0.01:
            blurred = frame.filter(ImageFilter.GaussianBlur(14))
            tint = Image.new("RGBA", (W, H), (250, 210, 230, 90))
            blurred.alpha_composite(tint)
            frame = Image.blend(frame, blurred, b)
        draw_card(frame, t)
    return frame


def render(i):
    t = i / FPS
    cur = None
    for k, (name, a, b) in enumerate(SCENES):
        if a <= t < b or (k == len(SCENES) - 1 and t >= a):
            cur = k
            break
    name, a, b = SCENES[cur]
    frame = compose(name, t, t - a)
    if cur + 1 < len(SCENES) and t > b - XF / 2:      # crossfade into next
        nm, na, nb = SCENES[cur + 1]
        frame = Image.blend(frame, compose(nm, t, t - na), clamp((t - (b - XF / 2)) / XF) * 0.5)
    if cur > 0 and t < a + XF / 2:
        pm, pa, pb = SCENES[cur - 1]
        frame = Image.blend(compose(pm, t, t - pa), frame, 0.5 + clamp((t - a) / (XF / 2)) * 0.5)
    if name == "paw" and abs(t - PAW_CLOSE) < 0.12:     # 白闪切特写
        frame = Image.blend(frame, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 0.6 * (1 - abs(t - PAW_CLOSE) / 0.12))
    draw_subs(frame, t)
    frame = frame.convert("RGB")
    if t < 0.3:
        frame = Image.blend(Image.new("RGB", (W, H), (255, 255, 255)), frame, t / 0.3)
    return frame.tobytes()


# ------------------------------------------------------------------ audio
def note(n):
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    return 440.0 * 2 ** ((names[n[0]] + 12 * (int(n[1]) + 1) - 69) / 12)


def mbox(buf, t0, f, amp, dur=1.4):
    s0 = int(t0 * SR)
    n = min(int(dur * SR), len(buf) - s0)
    if n <= 0:
        return
    tt = np.arange(n) / SR
    env = np.minimum(1, tt / 0.004) * np.exp(-tt * 3.5)
    buf[s0:s0 + n] += amp * env * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 6))


def load_wav(p):
    with wave.open(p) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16 if w.getsampwidth() == 2 else np.int32)
        a = a.astype(np.float64) / (32768 if w.getsampwidth() == 2 else 2 ** 31)
        if w.getnchannels() > 1:
            a = a.reshape(-1, w.getnchannels()).mean(1)
    if sr != SR:
        a = np.interp(np.arange(int(len(a) * SR / sr)) * sr / SR, np.arange(len(a)), a)
    return a


def make_audio(path):
    n = int(DUR * SR)
    music, vo, sfx = np.zeros(n), np.zeros(n), np.zeros(n)
    mel = ["C5", "E5", "G5", "E5", "F5", "A5", "G5", None, "E5", "G5", "C6", "B5", "A5", "G5", "E5", None,
           "F5", "E5", "D5", "E5", "C5", "D5", "E5", "G5", "A5", "G5", "E5", "D5", "C5", None, None, None]
    bass = ["C3", "A2", "F2", "G2"]
    k = 0
    while k * 0.33 < DUR:
        t = k * 0.33
        if mel[k % 32]:
            mbox(music, t, note(mel[k % 32]), 0.2)
        if k % 8 == 0:
            mbox(music, t, note(bass[(k // 8) % 4]), 0.15, 2.6)
        k += 1
    info = json.load(open(os.path.join(VO_DIR, "lines.json")))
    for st, li in zip(VO_START, info):
        a = load_wav(li["file"])
        s0 = int(st * SR)
        m = min(len(a), n - s0)
        vo[s0:s0 + m] += a[:m] / (np.abs(a).max() + 1e-9) * 0.9
    # duck music under voice
    env = np.convolve((np.abs(vo) > 0.02).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
    music *= 1 - 0.55 * np.clip(env * 3, 0, 1)

    def add(t0, sig, g=1.0):
        s0 = int(t0 * SR)
        m = min(len(sig), n - s0)
        if m > 0:
            sfx[s0:s0 + m] += g * sig[:m]

    tt = lambda d: np.arange(int(d * SR)) / SR
    rng = np.random.default_rng(3)
    # 呼噜声 (踩奶场景)
    for name, a, b in SCENES[:4]:
        x = tt(b - a)
        noise = np.convolve(rng.standard_normal(len(x)), np.ones(60) / 60, mode="same")
        purr = noise * (0.5 + 0.5 * np.sin(2 * np.pi * 24 * x)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * x))
        add(a, purr * np.minimum(1, x / 0.3) * np.minimum(1, (x[-1] - x) / 0.3), 0.9)
    # 订单卡 "叮咚" + 每行文字小提示音
    for i, f in enumerate([note("E6"), note("C6")]):
        mbox(sfx, CARD_IN + i * 0.15, f, 0.18, 0.8)
    for ts in (5.3, 7.15, 8.6):
        x = tt(0.08)
        add(ts, 0.2 * np.sin(2 * np.pi * 1800 * x) * np.exp(-x * 60))
    # 钟表计数 滴滴滴
    for k in range(17):
        x = tt(0.03)
        add(CLOCK_IN + 0.2 + k * 1.4 / 17, 0.12 * np.sin(2 * np.pi * 2600 * x) * np.exp(-x * 120))
    # 肉垫特写: 每次按下 "噗"
    pt = PAW_CLOSE + 0.23
    while pt < SCENES[4][2]:
        x = tt(0.12)
        add(pt, 0.3 * np.sin(2 * np.pi * (180 - 400 * x) * x) * np.exp(-x * 30))
        pt += 1 / 1.1
    # 白闪 whoosh
    x = tt(0.4)
    add(PAW_CLOSE - 0.2, 0.25 * np.convolve(rng.standard_normal(len(x)), np.ones(20) / 20, "same") * np.sin(np.pi * x / 0.4) ** 2)
    # 盖章 "咚!" + 闪闪
    x = tt(0.4)
    add(STAMP + 0.2, 0.7 * np.sin(2 * np.pi * (90 + 60 * np.exp(-x * 25)) * x) * np.exp(-x * 12))
    for i, nn in enumerate(["C6", "E6", "G6", "C7"]):
        mbox(sfx, STAMP + 0.3 + i * 0.07, note(nn), 0.12, 1.0)
    mix = music * 0.55 + vo * 1.0 + sfx * 0.6
    mix[:int(0.2 * SR)] *= np.linspace(0, 1, int(0.2 * SR))
    mix[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))
    mix = mix / np.abs(mix).max() * 0.9
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
