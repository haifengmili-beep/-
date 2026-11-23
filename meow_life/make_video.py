#!/usr/bin/env python3
"""《喵喵人生 · 感动吗？不敢动…》 30s 9:16 治愈系短动画生成脚本.

角色: 用户提供的粉色方块猫 (矢量重绘, 以便做眨眼/发抖/表情等动画).
输出: meow_life/output/meow_life_dare_not_move.mp4 (1080x1920, 30fps, 30s, 带配乐音效)
用法: python3 meow_life/make_video.py
"""
import math
import os
import subprocess
import sys
import wave
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")
OUT_MP4 = os.path.join(OUT_DIR, "meow_life_dare_not_move.mp4")
AUDIO_WAV = os.path.join(OUT_DIR, "_audio.wav")

W, H = 1080, 1920
SS = 2                      # 2x 超采样抗锯齿
CW, CH = W * SS, H * SS
K = CW / 1140.0             # 原图坐标 (1140x1200) -> 画布
OY = 480 * SS               # 场景在竖屏中的纵向偏移
FPS, DUR = 30, 30.0
N = int(FPS * DUR)
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

C = dict(
    wall=(227, 211, 238), floor=(239, 196, 145), floor_line=(224, 174, 120),
    window=(255, 255, 255), glass=(191, 221, 242),
    table=(251, 217, 208), table_top=(255, 232, 226), leg=(232, 198, 145), leg_line=(201, 160, 106),
    ear=(238, 136, 168), ear_in=(250, 196, 212),
    head_top=(253, 214, 226), head_side=(235, 160, 186), head=(249, 198, 214),
    body=(247, 185, 204), body_side=(229, 147, 176), spot=(229, 150, 180), paw=(249, 198, 214),
    eye=(18, 18, 18), white=(255, 255, 255), cheek=(242, 123, 160), cheek_deep=(236, 90, 135),
    nose=(239, 108, 143), muzzle=(247, 184, 165), mouth=(190, 80, 110),
    heart=(244, 114, 160), heart_fill=(255, 182, 206),
    sweat=(150, 205, 245), sweat_hi=(225, 243, 255),
    bf_edge=(242, 150, 80), bf_wing=(255, 209, 102), bf_body=(90, 61, 92),
    text=(91, 50, 86),
)


# ---------------------------------------------------------------- helpers
def P(x, y):
    return (x * K, y * K + OY)


def R(x0, y0, x1, y1):
    a, b = P(x0, y0), P(x1, y1)
    return [a[0], a[1], b[0], b[1]]


def poly(d, pts, fill, dx=0, dy=0):
    d.polygon([P(x + dx, y + dy) for x, y in pts], fill=fill)


def rect(d, x0, y0, x1, y1, fill, dx=0, dy=0):
    d.rectangle(R(x0 + dx, y0 + dy, x1 + dx, y1 + dy), fill=fill)


def ellipse_pts(cx, cy, rx, ry, n=40, rot=0.0):
    cr, sr = math.cos(rot), math.sin(rot)
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * cr - y * sr, cy + x * sr + y * cr))
    return out


def heart_pts(cx, cy, s, n=80):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + s * x, cy - s * y))
    return pts


def star_pts(cx, cy, r):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.28
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x):
    x = clamp(x)
    c1 = 1.70158
    return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2


def kf(t, keys):
    """keyframes [(time, value)], smoothstep between."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = smooth((t - t0) / (t1 - t0))
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * u for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * u
    return keys[-1][1]


def catmull(keys, t):
    """Catmull-Rom spline through [(time,(x,y))]."""
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    for i in range(len(keys) - 1):
        if keys[i][0] <= t <= keys[i + 1][0]:
            break
    p0 = keys[max(i - 1, 0)][1]
    p1 = keys[i][1]
    p2 = keys[i + 1][1]
    p3 = keys[min(i + 2, len(keys) - 1)][1]
    u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0])
    u2, u3 = u * u, u * u * u
    return tuple(
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3)
        for a, b, c, d in zip(p0, p1, p2, p3)
    )


def lerp_col(a, b, u):
    return tuple(int(x + (y - x) * u) for x, y in zip(a, b))


# ---------------------------------------------------------------- timeline
T_ENTER, T_LAND1, T_MOVED, T_FREEZE, T_LEAVE, T_BACK, T_LAND2 = 3.5, 8.6, 10.0, 15.0, 23.0, 26.3, 27.6

NOSE = (570, 478)
HEAD_TOP = (552, 262)

FLY_IN = [(3.5, (1260, 250)), (4.8, (980, 470)), (5.8, (860, 190)), (6.6, (690, 110)),
          (7.4, (420, 170)), (8.1, (660, 360)), (8.6, NOSE)]
FLY_OUT = [(23.0, NOSE), (23.8, (770, 300)), (24.6, (1000, 140)), (25.3, (1280, 60))]
FLY_BACK = [(26.3, (1280, 160)), (26.9, (910, 40)), (27.3, (700, 150)), (27.6, HEAD_TOP)]


def frozen(t):
    return T_FREEZE <= t < T_LEAVE or t >= T_LAND2 + 0.05


def tremble(t, amp=2.2):
    return (amp * (math.sin(t * 53.0) + 0.6 * math.sin(t * 87.0)) / 1.6,
            amp * 0.6 * (math.sin(t * 61.0 + 1) + 0.5 * math.sin(t * 97.0)) / 1.5)


def head_offset(t):
    if frozen(t):
        return tremble(t)
    breath = math.sin(t * 2 * math.pi / 3.2) * 2.5
    slump = 0.0
    if T_LEAVE + 0.6 <= t < T_LAND2:
        slump = 14 * math.sin(math.pi * clamp((t - T_LEAVE - 0.6) / 1.6))  # 松一口气 "瘫"一下
    look_up = 0.0
    if T_LAND1 - 0.1 <= t < T_LAND1 + 0.5:                                   # 被停上时一缩
        look_up = -10 * math.sin(math.pi * clamp((t - T_LAND1 + 0.1) / 0.6))
    return (0.0, breath + slump + look_up)


def butterfly_state(t):
    """returns (x, y, flap, flying) or None."""
    if t < T_ENTER or (FLY_OUT[-1][0] < t < T_BACK):
        return None
    if t < T_LAND1:
        x, y = catmull(FLY_IN, t)
        w = 18 * (1 - clamp((t - 7.8) / 0.8))
        return x + w * math.sin(t * 7), y + w * math.cos(t * 9), wing_fly(t), True
    if t < T_LEAVE:
        hx, hy = head_offset(t)
        f = 0.65 + 0.35 * math.cos(2 * math.pi * 0.6 * (t - T_LAND1))
        if frozen(t):
            f += 0.05 * math.sin(t * 40)
        return NOSE[0] + hx, NOSE[1] + hy, f, False
    if t <= FLY_OUT[-1][0]:
        x, y = catmull(FLY_OUT, t)
        return x, y, wing_fly(t), True
    if t < T_LAND2:
        x, y = catmull(FLY_BACK, t)
        return x, y, wing_fly(t), True
    hx, hy = head_offset(t)
    return HEAD_TOP[0] + hx, HEAD_TOP[1] + hy, 0.75 + 0.25 * math.cos(2 * math.pi * 0.5 * (t - T_LAND2)), False


def wing_fly(t):
    return 0.2 + 0.8 * abs(math.cos(2 * math.pi * 4.5 * t))


# ---------------------------------------------------------------- drawing
def draw_background():
    img = Image.new("RGB", (CW, CH), C["wall"])
    d = ImageDraw.Draw(img)
    rect(d, -10, 1005, 1150, 1600, C["floor"])
    y = 1073
    while y < 1600:
        rect(d, -10, y - 3, 1150, y + 3, C["floor_line"])
        y += 67
    # window
    rect(d, 750, 360, 1080, 750, C["window"])
    rect(d, 765, 375, 908, 735, C["glass"])
    rect(d, 923, 375, 1065, 735, C["glass"])
    # table
    rect(d, 516, 890, 624, 1035, C["leg"])
    rect(d, 516, 931, 624, 939, C["leg_line"])
    rect(d, 516, 973, 624, 981, C["leg_line"])
    d.rounded_rectangle(R(135, 825, 1005, 897), radius=30 * K, fill=C["table"])
    d.rounded_rectangle(R(135, 825, 1005, 849), radius=12 * K, fill=C["table_top"])
    return img


def draw_heart(d, t):
    beat_rate = 1.25 if T_FREEZE <= t < T_LEAVE else 0.8
    ph = (t * beat_rate) % 1.0
    beat = math.exp(-ph * 9) * 0.06
    big = kf(t, [(9.8, 0.0), (10.4, 1.0), (14.6, 1.0), (15.2, 0.0)])
    s = 1.0 + beat + big * (0.18 + 0.05 * math.sin(t * 6))
    cx, cy = 930, 290
    d.polygon([P(x, y) for x, y in heart_pts(cx, cy, 8.9 * s)], fill=C["heart"])
    inner = lerp_col(C["white"], C["heart_fill"], big)
    d.polygon([P(x, y) for x, y in heart_pts(cx, cy + 3 * s, 6.85 * s)], fill=inner)


def draw_eyes(d, t, hx, hy):
    def blink_amt(t):
        for b in (1.6, 5.3, 12.6, 25.0):
            if b <= t < b + 0.18:
                return abs(math.cos(math.pi * (t - b) / 0.18))
        return 1.0

    eyes = [(414, 345, 516, 465), (624, 345, 726, 465)]

    if frozen(t):  # 白眼 + 小瞳孔: 盯着蝴蝶, 一动不敢动
        on_nose = t < T_LEAVE
        for i, (x0, y0, x1, y1) in enumerate(eyes):
            rect(d, x0 - 4, y0 - 4, x1 + 4, y1 + 4, C["eye"], hx, hy)
            rect(d, x0 + 4, y0 + 4, x1 - 4, y1 - 4, C["white"], hx, hy)
            if on_nose:
                px = x1 - 44 if i == 0 else x0 + 10
                py = y1 - 46
            else:
                px = (x0 + x1) / 2 - 17 + (12 if i == 0 else -12)
                py = y0 + 10
            jx, jy = tremble(t * 1.3, 1.5)
            rect(d, px + jx, py + jy, px + 34 + jx, py + 34 + jy, C["eye"], hx, hy)
        return

    if T_LEAVE + 0.6 <= t < T_BACK + 0.4:  # 开心的 ^ ^
        for x0, y0, x1, y1 in eyes:
            pts = [P(x0 + 6 + hx, 435 + hy), P((x0 + x1) / 2 + hx, 380 + hy), P(x1 - 6 + hx, 435 + hy)]
            d.line(pts, fill=C["eye"], width=int(16 * K), joint="curve")
        return

    # 普通 / 惊讶 / 星星眼
    sparkle = kf(t, [(9.6, 0.0), (10.2, 1.0), (14.6, 1.0), (15.0, 0.0)])
    surprise = 1.0 if T_LAND1 - 0.1 <= t < T_MOVED else 0.0
    grow = 6 * sparkle + 5 * surprise
    gx, gy = 0.0, 0.0
    bf = butterfly_state(t)
    if bf and bf[3] and T_ENTER < t < T_LAND1:
        gx = clamp((bf[0] - 570) / 300, -1, 1)
        gy = clamp((bf[1] - 400) / 300, -1, 1)
    o = blink_amt(t)
    for x0, y0, x1, y1 in eyes:
        cy = (y0 + y1) / 2
        hh = (y1 - y0) / 2 + grow
        if o < 0.25:
            rect(d, x0 - grow, cy - 5, x1 + grow, cy + 5, C["eye"], hx, hy)
            continue
        rect(d, x0 - grow, cy - hh * o, x1 + grow, cy + hh * o, C["eye"], hx, hy)
        if o < 0.8:
            continue
        if surprise:
            rect(d, x0 + 38, cy - 22, x0 + 60, cy, C["white"], hx, hy)
            continue
        ox, oy = 12 * gx, 12 * gy
        b = 36 + 10 * sparkle
        rect(d, x0 + 18 + ox, y0 + 15 + oy, x0 + 18 + b + ox, y0 + 15 + b + oy, C["white"], hx, hy)
        rect(d, x0 + 60 + ox, y0 + 75 + oy, x0 + 84 + ox, y0 + 99 + oy, C["white"], hx, hy)
        if sparkle > 0.05:
            tw = 0.75 + 0.25 * math.sin(t * 8 + x0)
            d.polygon([P(x + hx, y + hy) for x, y in star_pts(x0 + 30, y1 - 22, 16 * sparkle * tw)], fill=C["white"])


def draw_mouth(d, t, hx, hy):
    cx, cy = 570 + hx, 530 + hy
    w = int(5 * K)
    if frozen(t):  # 紧张的波浪嘴
        pts = [P(cx - 40 + i * 10, cy + (6 if i % 2 else -6)) for i in range(9)]
        d.line(pts, fill=C["mouth"], width=w)
    elif T_LEAVE + 0.4 <= t < T_LEAVE + 1.6:  # 呼～
        d.ellipse(R(cx - 12, cy - 14, cx + 12, cy + 14), fill=C["mouth"])
    elif T_MOVED <= t < T_FREEZE or T_LEAVE + 1.6 <= t < T_LAND2:  # ω
        d.arc(R(cx - 30, cy - 18, cx, cy + 10), 0, 180, fill=C["mouth"], width=w)
        d.arc(R(cx, cy - 18, cx + 30, cy + 10), 0, 180, fill=C["mouth"], width=w)
    elif T_LAND1 - 0.1 <= t < T_MOVED:  # 惊讶 o
        d.ellipse(R(cx - 8, cy - 6, cx + 8, cy + 14), fill=C["mouth"])


def draw_sweat(d, cx, cy, s):
    if s <= 0.02:
        return
    r = 16 * s
    d.ellipse(R(cx - r, cy - r, cx + r, cy + r), fill=C["sweat"])
    d.polygon([P(cx - r * 0.9, cy - r * 0.4), P(cx, cy - r * 2.6), P(cx + r * 0.9, cy - r * 0.4)], fill=C["sweat"])
    d.ellipse(R(cx - r * 0.5, cy - r * 0.6, cx - r * 0.1, cy - r * 0.1), fill=C["sweat_hi"])


def draw_cat(d, t):
    hx, hy = head_offset(t)
    bt = 585 + max(hy, -6) * 0.5  # 身体顶部跟随呼吸
    # body
    poly(d, [(336, bt - 12), (390, bt), (390, 825), (336, 798)], C["body_side"])
    rect(d, 390, bt, 750, 825, C["body"])
    for (cx, cy, r) in [(495, 705, 25), (600, 675, 35), (675, 745, 22), (546, 768, 16)]:
        d.ellipse(R(cx - r, cy - r, cx + r, cy + r), outline=C["spot"], width=int(5 * K))
    rect(d, 414, 783, 504, 831, C["paw"])
    rect(d, 636, 783, 726, 831, C["paw"])
    # ears (发抖时耳朵也抖, 开心时耳朵立起)
    ew = 0.0
    if T_LEAVE + 1.0 <= t < T_LAND2:
        ew = 6 * math.sin((t - T_LEAVE) * 10) * math.exp(-(t - T_LEAVE - 1.0) * 0.8)
    poly(d, [(385, 255), (438 - ew, 107), (528, 255)], C["ear"], hx, hy)
    poly(d, [(420, 255), (441 - ew, 173), (488, 255)], C["ear_in"], hx, hy)
    poly(d, [(640, 255), (720 + ew, 107), (775, 280)], C["ear"], hx, hy)
    poly(d, [(676, 255), (714 + ew, 173), (745, 270)], C["ear_in"], hx, hy)
    # head
    poly(d, [(300, 255), (720, 255), (780, 285), (360, 285)], C["head_top"], hx, hy)
    poly(d, [(300, 255), (360, 285), (360, 585), (300, 555)], C["head_side"], hx, hy)
    rect(d, 360, 285, 780, 585, C["head"], hx, hy)
    draw_eyes(d, t, hx, hy)
    # cheeks
    blush = kf(t, [(9.6, 0.0), (10.3, 1.0), (14.8, 1.0), (15.3, 0.0), (25.0, 0.0), (25.5, 0.6), (27.4, 0.6), (27.6, 0.0)])
    g = 8 * blush
    for x0 in (402, 684):
        rect(d, x0 - g, 486 - g * 0.5, x0 + 54 + g, 516 + g * 0.5, C["cheek"], hx, hy)
        if blush > 0.3:
            for k in range(3):
                xx = x0 + 8 + k * 16
                d.line([P(xx + 10 + hx, 490 + hy), P(xx + hx, 512 + hy)], fill=C["cheek_deep"], width=int(4 * K))
    rect(d, 546, 480, 594, 506, C["nose"], hx, hy)
    rect(d, 510, 504, 630, 552, C["muzzle"], hx, hy)
    draw_mouth(d, t, hx, hy)
    # sweat drops
    if T_FREEZE <= t < T_LEAVE + 0.5:
        draw_sweat(d, 800 + hx, 330 + hy + 40 * smooth((t - 17.5) / 5), smooth((t - 15.8) / 1.2))
        draw_sweat(d, 285 + hx, 300 + hy, 0.7 * smooth((t - 18.5) / 1.0))
    if t >= T_LAND2 + 0.3:
        draw_sweat(d, 800 + hx, 330 + hy, smooth((t - T_LAND2 - 0.3) / 0.5))


def draw_butterfly(d, t):
    st = butterfly_state(t)
    if not st:
        return
    x, y, f, flying = st
    s = 1.5
    tilt = 0.15 * math.sin(t * 3) if flying else 0.0
    for side in (-1, 1):
        # upper wing
        cx, cy = x + side * 24 * f * s, y - 14 * s
        d.polygon([P(*p) for p in ellipse_pts(cx, cy, 27 * f * s + 1, 23 * s, rot=side * 0.35 + tilt)], fill=C["bf_edge"])
        d.polygon([P(*p) for p in ellipse_pts(cx, cy, 21 * f * s + 1, 18 * s, rot=side * 0.35 + tilt)], fill=C["bf_wing"])
        d.ellipse(R(cx - 5 * f * s + side * 6 * f * s, cy - 5 * s, cx + 5 * f * s + side * 6 * f * s, cy + 5 * s), fill=C["white"])
        # lower wing
        cx, cy = x + side * 16 * f * s, y + 13 * s
        d.polygon([P(*p) for p in ellipse_pts(cx, cy, 17 * f * s + 1, 14 * s, rot=-side * 0.4 + tilt)], fill=C["bf_edge"])
        d.polygon([P(*p) for p in ellipse_pts(cx, cy, 12 * f * s + 1, 10 * s, rot=-side * 0.4 + tilt)], fill=C["bf_wing"])
        # antenna
        d.line([P(x, y - 18 * s), P(x + side * 13 * s, y - 40 * s)], fill=C["bf_body"], width=int(3 * K))
        d.ellipse(R(x + side * 13 * s - 4, y - 40 * s - 4, x + side * 13 * s + 4, y - 40 * s + 4), fill=C["bf_body"])
    d.ellipse(R(x - 5 * s, y - 20 * s, x + 5 * s, y + 22 * s), fill=C["bf_body"])


def draw_effects(d, t):
    # "!" 落鼻瞬间
    if T_LAND1 - 0.05 <= t < T_MOVED:
        sc = ease_out_back((t - T_LAND1 + 0.05) / 0.3)
        cx, cy = 255, 170
        d.rounded_rectangle(R(cx - 13 * sc, cy - 60 * sc, cx + 13 * sc, cy + 20 * sc), radius=12 * K * sc, fill=C["heart"])
        d.ellipse(R(cx - 14 * sc, cy + 34 * sc, cx + 14 * sc, cy + 62 * sc), fill=C["heart"])
    # 感动: 漂浮小爱心 + 闪光
    if T_MOVED - 0.2 <= t < T_FREEZE + 0.4:
        for i in range(9):
            t0 = T_MOVED + i * 0.5
            life = (t - t0) / 2.6
            if 0 <= life <= 1:
                bx = 300 + (i * 97) % 520
                px = bx + 25 * math.sin(t * 3 + i)
                py = 720 - 600 * life
                sz = 2.2 * math.sin(math.pi * life) + 0.2
                d.polygon([P(x, y) for x, y in heart_pts(px, py, sz, 40)], fill=C["heart"] if i % 2 else C["heart_fill"])
        for i, (sx, sy) in enumerate([(250, 330), (860, 560), (330, 120), (820, 120), (230, 620), (900, 820)]):
            tw = max(0.0, math.sin(t * 5 + i * 1.7))
            fade = kf(t, [(T_MOVED - 0.2, 0.0), (T_MOVED + 0.3, 1.0), (T_FREEZE - 0.2, 1.0), (T_FREEZE + 0.3, 0.0)])
            if tw * fade > 0.05:
                d.polygon([P(x, y) for x, y in star_pts(sx, sy, 26 * tw * fade)], fill=C["white"])
    # 呼～ 小云朵
    if T_LEAVE + 0.4 <= t < T_LEAVE + 2.0:
        u = (t - T_LEAVE - 0.4) / 1.6
        r = 22 * math.sin(math.pi * u) + 1
        cx, cy = 530 - 220 * u, 545 + 20 * u
        for ox, oy, k in [(0, 0, 1.0), (-r * 0.9, r * 0.2, 0.75), (r * 0.9, r * 0.25, 0.7)]:
            d.ellipse(R(cx + ox - r * k, cy + oy - r * k, cx + ox + r * k, cy + oy + r * k), fill=C["white"])


# ---------------------------------------------------------------- captions
_FONTS = {}
_TXT = {}


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


TOP = [  # (start, end, text, size, shake)
    (0.3, 3.5, "今天也是安静的一天～", 84, False),
    (3.6, 8.5, "咦？有客人来了", 90, False),
    (8.6, 10.0, "它…停在了我鼻子上！", 84, False),
    (10.0, 15.0, "感动吗？", 150, False),
    (15.0, 23.0, "不敢动……", 150, True),
    (23.2, 26.8, "呼～终于可以动了", 88, False),
    (26.9, 27.6, "嗯？", 110, False),
    (27.7, 30.0, "……又不敢动了", 110, True),
]
BOTTOM = [
    (10.3, 15.0, "（被蝴蝶选中的喵）"),
    (16.0, 23.0, "（连呼吸都不敢大声）"),
    (28.4, 30.0, "#治愈系动画  #喵喵人生"),
]


def paste_center(frame, im, cx, cy, scale=1.0, alpha=1.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    if abs(scale - 1) > 0.01:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if alpha < 0.99:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im = im.copy()
        im.putalpha(a)
    frame.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def draw_captions(frame, t):
    tag = text_img(" 喵喵人生 ", 40, (236, 90, 135), (255, 255, 255), 6)
    paste_center(frame, tag, 60 + tag.width / 2, 90)
    for t0, t1, s, size, shake in TOP:
        if t0 <= t < t1:
            sc = ease_out_back((t - t0) / 0.35)
            al = clamp((t1 - t) / 0.2)
            dx, dy = tremble(t, 4) if shake else (0, 0)
            paste_center(frame, text_img(s, size, C["text"], (255, 255, 255), 10), W / 2 + dx, 300 + dy, sc, al)
    for t0, t1, s in BOTTOM:
        if t0 <= t < t1:
            al = clamp((t - t0) / 0.3) * clamp((t1 - t) / 0.2) if t1 < DUR else clamp((t - t0) / 0.3)
            paste_center(frame, text_img(s, 58, (255, 255, 255), (138, 90, 58), 7), W / 2, 1770, 1.0, al)


# ---------------------------------------------------------------- frame
_BG = None


def render(i):
    global _BG
    if _BG is None:
        _BG = draw_background()
    t = i / FPS
    img = _BG.copy()
    d = ImageDraw.Draw(img)
    draw_heart(d, t)
    draw_cat(d, t)
    draw_butterfly(d, t)
    draw_effects(d, t)

    # camera: 不敢动时推近脸部
    z = kf(t, [(0, 1.0), (14.6, 1.0), (16.2, 1.32), (22.8, 1.32), (23.8, 1.0), (27.5, 1.0), (28.2, 1.22), (30, 1.25)])
    if z > 1.001:
        fx, fy = P(570, 430)
        u = clamp((z - 1) / 0.3)
        cx = CW / 2 + (fx - CW / 2) * u
        cy = CH / 2 + (fy - CH / 2) * u
        cw, ch = CW / z, CH / z
        x0 = clamp(cx - cw / 2, 0, CW - cw)
        y0 = clamp(cy - ch / 2, 0, CH - ch)
        frame = img.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))
    else:
        frame = img.resize((W, H), Image.LANCZOS)
    frame = frame.convert("RGBA")
    draw_captions(frame, t)
    frame = frame.convert("RGB")
    if t < 0.4:
        frame = Image.blend(Image.new("RGB", (W, H), (255, 255, 255)), frame, t / 0.4)
    return frame.tobytes()


# ---------------------------------------------------------------- audio
SR = 44100


def note_freq(n):
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    return 440.0 * 2 ** ((names[n[0]] + 12 * (int(n[1]) + 1) - 69) / 12)


def music_box(buf, t0, f, amp=0.25, dur=1.6):
    n = int(dur * SR)
    s0 = int(t0 * SR)
    if s0 >= len(buf):
        return
    n = min(n, len(buf) - s0)
    tt = np.arange(n) / SR
    env = np.minimum(1, tt / 0.004) * np.exp(-tt * 3.2)
    w = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 6) + 0.12 * np.sin(2 * np.pi * 5.4 * f * tt) * np.exp(-tt * 14)
    buf[s0:s0 + n] += amp * env * w


def make_audio():
    buf = np.zeros(int(DUR * SR))
    melody = ["E5", "G5", "A5", "G5", "E5", "D5", "C5", "D5",
              "E5", "G5", "C6", "A5", "G5", None, None, None,
              "A5", "G5", "E5", "G5", "D5", "E5", "C5", "D5",
              "E5", "D5", "C5", "A4", "C5", None, None, None]
    bass = ["C3", "A2", "F2", "G2"]
    step = 0.3

    def play(t_start, t_end, gain):
        k = 0
        while True:
            t = t_start + k * step
            if t >= t_end:
                break
            m = melody[k % len(melody)]
            if m:
                music_box(buf, t, note_freq(m), 0.22 * gain)
            if k % 8 == 0:
                b = bass[(k // 8) % 4]
                music_box(buf, t, note_freq(b), 0.16 * gain, 2.4)
                music_box(buf, t + 0.02, note_freq(b) * 1.5, 0.07 * gain, 2.4)
            k += 1

    play(0.2, 14.8, 1.0)
    play(T_LEAVE + 1.0, T_LAND2 - 0.05, 0.85)

    def add(t0, sig):
        s0 = int(t0 * SR)
        n = min(len(sig), len(buf) - s0)
        buf[s0:s0 + n] += sig[:n]

    def tt(d):
        return np.arange(int(d * SR)) / SR

    # landing "啵"
    for tl in (T_LAND1, T_LAND2):
        x = tt(0.12)
        add(tl, 0.35 * np.sin(2 * np.pi * (400 * x + 4000 * x * x)) * np.exp(-x * 30))
    # 感动 闪闪 chime
    for i, n in enumerate(["C6", "E6", "G6", "C7"]):
        music_box(buf, T_MOVED + i * 0.08, note_freq(n), 0.16, 1.2)
    # 不敢动: 心跳 "咚咚"
    t = T_FREEZE + 0.2
    while t < T_LEAVE - 0.2:
        for off, a in ((0, 0.55), (0.18, 0.4)):
            x = tt(0.25)
            add(t + off, a * np.sin(2 * np.pi * (55 + 30 * np.exp(-x * 20)) * x) * np.exp(-x * 14))
        t += 0.8
    # 冻结时的紧张高音嗡嗡 (很轻)
    x = tt(T_LEAVE - T_FREEZE)
    add(T_FREEZE, 0.025 * np.sin(2 * np.pi * 1760 * x) * np.minimum(1, x / 1.5) * np.minimum(1, (x[-1] - x) / 0.3))
    # 飞走 whoosh
    rng = np.random.default_rng(1)
    x = tt(0.7)
    noise = np.convolve(rng.standard_normal(len(x)), np.ones(30) / 30, mode="same")
    add(T_LEAVE + 0.1, 0.5 * noise * np.sin(np.pi * x / 0.7) ** 2)
    # 呼～ (下降音)
    x = tt(1.0)
    add(T_LEAVE + 0.5, 0.12 * np.sin(2 * np.pi * (520 * x - 120 * x * x)) * np.sin(np.pi * x) ** 2)
    # 第二次冻结: "叮!" + 心跳
    music_box(buf, T_LAND2 + 0.15, note_freq("C7"), 0.25, 1.0)
    for tb in (28.4, 29.2):
        for off, a in ((0, 0.55), (0.18, 0.4)):
            x = tt(0.25)
            add(tb + off, a * np.sin(2 * np.pi * (55 + 30 * np.exp(-x * 20)) * x) * np.exp(-x * 14))

    # fades + normalize
    fi = int(0.3 * SR)
    buf[:fi] *= np.linspace(0, 1, fi)
    fo = int(0.5 * SR)
    buf[-fo:] *= np.linspace(1, 0, fo)
    buf = buf / max(1e-6, np.abs(buf).max()) * 0.85
    pcm = (buf * 32767).astype(np.int16)
    with wave.open(AUDIO_WAV, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- main
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for ts in [float(v) for v in sys.argv[2:]]:
            Image.frombytes("RGB", (W, H), render(int(ts * FPS))).save(os.path.join(OUT_DIR, f"preview_{ts:05.1f}.png"))
        return
    make_audio()
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", AUDIO_WAV,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT_MP4,
    ], stdin=subprocess.PIPE)
    with Pool(os.cpu_count()) as pool:
        for k, data in enumerate(pool.imap(render, range(N), chunksize=6)):
            ff.stdin.write(data)
            if k % 150 == 0:
                print(f"frame {k}/{N}", flush=True)
    ff.stdin.close()
    ff.wait()
    os.remove(AUDIO_WAV)
    print("done:", OUT_MP4)


if __name__ == "__main__":
    main()
