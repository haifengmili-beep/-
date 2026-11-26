# -*- coding: utf-8 -*-
"""假如你家猫每天多一条尾巴 —— 体素风竖屏短视频 (1080x1920, 30fps), 浅色系, 《每分钟可爱一倍》同一形式
运行: python3 tail_voxel/render.py  -> 输出 tail_voxel/out/cat_tails.mp4 ; 预览: --preview
"""
import math, random, subprocess, os, sys, wave
import numpy as np
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

_fc = {}
def F(size):
    if size not in _fc:
        _fc[size] = ImageFont.truetype(FONT, size)
    return _fc[size]

# ---------------------------------------------------------------- 工具函数
def lerp(a, b, t): return a + (b - a) * t
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(t): t = clamp(t); return t * t * (3 - 2 * t)
def back(t, c=1.9):  # 回弹 (会冲过头再回来)
    t = clamp(t); return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
def bounce(t):  # 落地弹两下
    t = clamp(t)
    if t < 1 / 2.75: return 7.5625 * t * t
    if t < 2 / 2.75: t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75
    if t < 2.5 / 2.75: t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375
    t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375
def shade(c, k): return tuple(int(clamp(v * k, 0, 255)) for v in c[:3])
def mix(c1, c2, t): return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))

def cube(d, x, y, w, h, dep, col, outline=None):
    """斜二测体素块：正面 + 顶面(亮) + 右侧面(暗)。(x,y)=正面左上角"""
    dx, dy = dep * 0.55, -dep * 0.45
    d.polygon([(x, y), (x + w, y), (x + w + dx, y + dy), (x + dx, y + dy)], fill=shade(col, 1.18))
    d.polygon([(x + w, y), (x + w + dx, y + dy), (x + w + dx, y + h + dy), (x + w, y + h)], fill=shade(col, 0.72))
    d.rectangle([x, y, x + w, y + h], fill=col, outline=outline)

HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"]
def heart(d, cx, cy, s, col=(255, 92, 140)):
    px = s / 7
    for j, row in enumerate(HEART):
        for i, ch in enumerate(row):
            if ch == "1":
                x0 = cx - s / 2 + i * px; y0 = cy - s / 2 + j * px
                d.rectangle([x0, y0, x0 + px + 0.5, y0 + px + 0.5], fill=col)

def text_c(d, xy, s, size, fill=(255, 255, 255), stroke=0, sfill=(0, 0, 0), anchor="mm"):
    d.text(xy, s, font=F(size), fill=fill, stroke_width=stroke, stroke_fill=sfill, anchor=anchor)

def vgrad(top, bot, h=H, w=W):
    t = np.linspace(0, 1, h)[:, None, None]
    a = np.array(top)[None, None, :] * (1 - t) + np.array(bot)[None, None, :] * t
    return Image.fromarray(np.repeat(a, w, axis=1).astype(np.uint8), "RGB")


# ---------------------------------------------------------------- 浅色系配色
PC = dict(ear=(244, 160, 186), ear_in=(253, 214, 226), head_top=(255, 228, 236), head_side=(240, 180, 202),
          head=(252, 210, 224), body=(250, 200, 216), body_side=(236, 170, 194), spot=(238, 172, 196),
          paw=(255, 226, 236), eye=(70, 50, 70), white=(255, 255, 255), cheek=(250, 150, 180),
          nose=(244, 130, 160), muzzle=(255, 222, 210), mouth=(200, 100, 130))
WHISK = [(150, 140, 168), (188, 178, 206)]
PINK, MINT, SKY, LAV, PEACH = (246, 132, 168), (120, 200, 170), (130, 184, 236), (176, 150, 220), (255, 170, 120)
INK = (96, 66, 96)  # 浅底上的深色文字
SHIRT, PANTS, SKIN, HAIR = (150, 212, 192), (140, 160, 206), (244, 206, 178), (120, 90, 76)


# ---------------------------------------------------------------- 灵动版粉色方块猫
def cat(d, cx, by, s, t, eyes="normal", mouth="w", look=0.0, tilt=0.0, head_dy=0.0, hop=0.0, walk=0.0,
        tail=(-1.7, 0.4, 1.1), wh=None, blush=0.6, rot=0.0, brows=False, tails=None, enter=None):
    """cx=中心x, by=脚底y, s=头宽. 自带: 歪头/眨眼/抖耳朵/甩尾巴/呼吸.
    eyes: normal/happy/half/dot ; hop=蹦跳强度 ; walk=走路 ; wh=胡子 dict(n每侧, L, spread, droop, mode)
    tails=多条尾巴 dict(n, mode=fan/two/knot/prop, a0, a1, amp, hz)."""
    k = s / 420.0
    jump = hop * abs(math.sin(t * math.pi * 1.6)) * 70
    if enter is not None and enter < 0.7:  # 入场: 从天而降, 落地弹两下 + 压扁
        jump += (1 - bounce(enter / 0.7)) * 900
    land = hop * max(0.0, 1 - abs(math.sin(t * math.pi * 1.6)) * 6)        # 落地瞬间压扁
    sq = 0.02 * math.sin(t * 3.2) - 0.08 * land + 0.04 * hop * min(1.0, jump / 70)
    if enter is not None and 0.25 < enter < 0.85:
        sq -= 0.12 * math.sin(math.pi * (enter - 0.25) / 0.6)
    tl = tilt + 0.07 * math.sin(t * 1.6) + 0.04 * math.sin(t * 3.7)           # 自然歪头
    hb = 4 * math.sin(t * 2.2) + head_dy
    c, sn = math.cos(rot), math.sin(rot)
    ct, st = math.cos(tl), math.sin(tl)

    def P(x, y, head=False):
        if head:  # 头绕脖子转
            x, y = 540 + (x - 540) * ct - (y - 585) * st, 585 + (x - 540) * st + (y - 585) * ct + hb
        x = 540 + (x - 540) * (1 - sq * 0.5)
        y = 831 + (y - 831) * (1 + sq)
        X, Y = (x - 540) * k, (y - 831) * k - jump
        return (cx + X * c - Y * sn, by + X * sn + Y * c)

    def poly(pts, col, head=False):
        d.polygon([P(x, y, head) for x, y in pts], fill=col)

    def rect(x0, y0, x1, y1, col, head=False):
        poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col, head)

    def line(pts, col, w, head=False):
        d.line([P(x, y, head) for x, y in pts], fill=col, width=max(2, int(w * k)), joint="curve")

    mode = wh.get("mode", "fan") if wh else None
    rnd = random.Random(7)
    if mode == "ball":  # 蒲公英: 全身放射状
        nd, L = 260, wh["L"]
        for i in range(nd):
            a = 2 * math.pi * i / nd + 0.03 * math.sin(t * 2 + i)
            r1 = L * (0.75 + 0.25 * rnd.random())
            p0, p1 = (540 + 150 * math.cos(a), 560 + 150 * math.sin(a)), (540 + r1 * math.cos(a), 560 + r1 * math.sin(a))
            line([p0, p1], (255, 255, 255) if i % 2 else (226, 226, 240), 5)
            d.ellipse([*(v - 5 for v in P(*p1)), *(v + 5 for v in P(*p1))], fill=(240, 240, 252))
    # 尾巴 (S 形, 一直在甩) —— 可以有很多条
    def one_tail(ox, oy, base, amp, hz, ph=0.0, segs=12, sl=26.0, w=40, curl=0.06, col=None, hd=False):
        x, y, a = ox, oy, base
        pts = [(x, y)]
        for i in range(segs):
            u = i / (segs - 1)
            a += curl + amp * math.sin(2 * math.pi * hz * t - 2.2 * u + ph) * 0.32
            x, y = x + sl * math.cos(a), y + sl * math.sin(a)
            pts.append((x, y))
        line(pts, col or PC["body_side"], w, hd); line(pts[-4:], PC["spot"], w, hd)
        return pts

    ts = tails or {}
    tn, tm = ts.get("n", 1), ts.get("mode", "single" if not tails else "fan")
    tcol = [PC["body_side"], (246, 190, 210)]
    if tm == "single":
        one_tail(745.0, 790.0, *tail)
    elif tm == "two":  # 一条开心竖着, 一条不耐烦地甩
        one_tail(735.0, 780.0, -1.75, 0.25, 0.9, segs=13)
        one_tail(745.0, 805.0, -0.35, 1.7, 3.2, ph=1.0, col=tcol[1])
    elif tm == "fan":
        nd = min(tn, 90)
        a0, a1 = ts.get("a0", -2.6), ts.get("a1", -0.5)
        for i in range(nd):
            u = i / (nd - 1) if nd > 1 else 0.5
            one_tail(600.0, 700.0, lerp(a0, a1, u), ts.get("amp", 0.4), ts.get("hz", 1.1), ph=i * 0.7,
                     segs=ts.get("segs", 15), sl=ts.get("sl", 40.0), w=40 if nd < 20 else 30, curl=0.02,
                     col=tcol[i % 2])
    elif tm == "knot":  # 打结成一团
        kx, ky = 1010.0, 740.0
        for i in range(min(tn, 14)):
            ph = i * 0.9
            mid = (880 + 30 * math.sin(t * 2 + ph), 760 + 80 * math.sin(ph) + 20 * math.sin(t * 3 + i))
            line([(745, 790), mid, (kx + 40 * math.cos(ph), ky + 40 * math.sin(ph))], tcol[i % 2], 34)
        r = random.Random(11)
        for j in range(30):
            ax, ay = kx + r.uniform(-60, 60), ky + r.uniform(-60, 60)
            rr = r.uniform(30, 70) * k
            px, py = P(ax, ay)
            d.arc([px - rr, py - rr, px + rr, py + rr], r.uniform(0, 360) + t * 60, r.uniform(0, 360) + 200 + t * 60,
                  fill=tcol[j % 2], width=max(3, int(26 * k)))
    elif tm == "prop":  # 头顶螺旋桨
        nd = min(tn, 24)
        spin = t * ts.get("spin", 13.0)
        for i in range(nd):
            one_tail(560.0, 95.0, spin + 2 * math.pi * i / nd, 0.04, 1.0, ph=i, segs=10, sl=30.0, w=32, curl=0.015,
                     col=tcol[i % 2], hd=True)
        line([(560, 260), (560, 100)], PC["body_side"], 40, True)
    # 身体
    poly([(336, 573), (390, 585), (390, 825), (336, 798)], PC["body_side"])
    rect(390, 585, 750, 825, PC["body"])
    for (sx, sy, r) in [(495, 705, 25), (600, 675, 35), (675, 745, 22)]:
        rect(sx - r * 0.7, sy - r * 0.7, sx + r * 0.7, sy + r * 0.7, PC["spot"])
        rect(sx - r * 0.42, sy - r * 0.42, sx + r * 0.42, sy + r * 0.42, PC["body"])
    for j, x0 in enumerate((414, 636)):  # 前爪 (走路时交替抬起)
        lift = walk * 22 * max(0.0, math.sin(t * 9 + j * math.pi))
        rect(x0, 783 - lift, x0 + 90, 831 - lift, PC["paw"])
        for q in range(3): rect(x0 + 16 + q * 26, 815 - lift, x0 + 20 + q * 26, 831 - lift, PC["spot"])
    if mode == "mane":  # 狮子鬃毛: 绕头一圈
        nd, L = 220, wh["L"]
        for i in range(nd):
            a = 2 * math.pi * i / nd + 0.04 * math.sin(t * 3 + i * 0.3)
            r1 = 190 + L * (0.7 + 0.3 * rnd.random())
            line([(560 + 170 * math.cos(a), 420 + 150 * math.sin(a)), (560 + r1 * math.cos(a), 420 + r1 * 0.9 * math.sin(a))],
                 (250, 236, 210) if i % 2 else (236, 214, 180), 9, True)
    # 耳朵 (偶尔抖一下)
    tw_l = 0.5 if (t % 3.3) < 0.18 else 0.0
    tw_r = 0.5 if ((t + 1.4) % 4.1) < 0.18 else 0.0
    lt_, rt_ = (438 - 60 * tw_l, 107 + 40 * tw_l), (720 + 60 * tw_r, 107 + 40 * tw_r)
    poly([(385, 255), lt_, (528, 255)], PC["ear"], True)
    poly([(420, 255), ((441 + lt_[0]) / 2, (173 + lt_[1]) / 2 + 40), (488, 255)], PC["ear_in"], True)
    poly([(640, 255), rt_, (775, 280)], PC["ear"], True)
    poly([(676, 255), ((714 + rt_[0]) / 2, (173 + rt_[1]) / 2 + 40), (745, 270)], PC["ear_in"], True)
    poly([(300, 255), (720, 255), (780, 285), (360, 285)], PC["head_top"], True)
    poly([(300, 255), (360, 285), (360, 585), (300, 555)], PC["head_side"], True)
    rect(360, 285, 780, 585, PC["head"], True)
    # 眼睛 (大高光 + 眨眼 + 看方向)
    blink = (t % 2.6) < 0.11 and eyes == "normal"
    ox = look * 14
    for x0 in (414, 624):
        x1, cxe = x0 + 102, x0 + 51
        if eyes == "happy":
            line([(x0 + 8, 432), (cxe, 380), (x1 - 8, 432)], PC["eye"], 18, True)
        elif blink:
            rect(x0, 400, x1, 414, PC["eye"], True)
        elif eyes == "half":  # 不爽的半眯眼
            rect(x0, 400, x1, 465, PC["eye"], True)
            rect(x0 - 6, 394, x1 + 6, 404, PC["head_side"], True)
        elif eyes == "dot":
            rect(cxe - 18, 387, cxe + 18, 423, PC["eye"], True)
        else:
            rect(x0, 345, x1, 465, PC["eye"], True)
            rect(x0 + 16 + ox, 358, x0 + 58 + ox, 400, PC["white"], True)
            rect(x0 + 62 + ox, 420, x0 + 84 + ox, 442, PC["white"], True)
            if (t % 1.8) < 0.9:  # 闪一闪的星光
                rect(x0 + 84 + ox, 356, x0 + 92 + ox, 364, PC["white"], True)
        if brows:  # 眉毛上的胡子
            for q in range(3):
                line([(cxe - 20 + q * 20, 335), (cxe - 50 + q * 40 + (x0 - 519) * 0.4, 230 - q * 10)], WHISK[0], 4, True)
    g = 8 * blush
    for x0 in (402, 684): rect(x0 - g, 486 - g / 2, x0 + 54 + g, 516 + g / 2, PC["cheek"], True)
    rect(546, 480, 594, 506, PC["nose"], True); rect(510, 504, 630, 552, PC["muzzle"], True)
    if mouth == "w":
        line([(540, 522), (555, 534), (570, 522), (585, 534), (600, 522)], PC["mouth"], 6, True)
    elif mouth == "o":
        rect(552, 520, 588, 552, PC["mouth"], True)
    elif mouth == "flat":
        line([(548, 530), (592, 530)], PC["mouth"], 6, True)
    # 胡子
    if mode == "fan":
        n, L, spread, droop = wh["n"], wh["L"], wh.get("spread", 0.3), wh.get("droop", 0.05)
        nd = min(n, 110)
        for side, ox0 in ((-1, 516), (1, 624)):
            for i in range(nd):
                u = (i + 0.5) / nd - 0.5 if nd > 1 else 0.0
                a = u * 2 * spread + droop + 0.05 * math.sin(t * 2.6 + i * 0.7)
                ln = L * (0.78 + 0.22 * rnd.random())
                p0 = (ox0, 530)
                p1 = (ox0 + side * ln * 0.5 * math.cos(a), 530 + ln * 0.5 * math.sin(a))
                a2 = a + wh.get("curve", 0.12)
                p2 = (p1[0] + side * ln * 0.5 * math.cos(a2), p1[1] + ln * 0.5 * math.sin(a2))
                line([p0, p1, p2], WHISK[i % 2], 4 if nd < 40 else 3, True)
    elif mode == "braid":  # 两条麻花辫 + 蝴蝶结
        L = wh["L"]
        for side, ox0 in ((-1, 512), (1, 628)):
            for j in range(16):
                u = j / 15
                bx = ox0 + side * (70 * u + 20 * math.sin(u * 3 + t * 2))
                byy = 540 + L * u
                off = 12 if j % 2 else -12
                d.ellipse([*P(bx + off - 26, byy - 20, True), *P(bx + off + 26, byy + 20, True)], fill=WHISK[j % 2])
            ex, ey = ox0 + side * (70 + 20 * math.sin(3 + t * 2)), 540 + L + 20
            poly([(ex, ey), (ex - 50, ey - 30), (ex - 50, ey + 30)], PINK, True)
            poly([(ex, ey), (ex + 50, ey - 30), (ex + 50, ey + 30)], PINK, True)
            rect(ex - 12, ey - 12, ex + 12, ey + 12, (255, 190, 210), True)
    return P


def muzzle_world(cx, by, s, side):
    """胡子根部的大致屏幕坐标 (不含歪头), 用来放标签."""
    k = s / 420.0
    return cx + ((516 if side < 0 else 624) - 540) * k, by + (530 - 831) * k


def person(d, x, by, s, t=0.0, wave_arm=False, face="smile"):
    by = by + 5 * math.sin(t * 2.4 + x * 0.01)  # 呼吸起伏
    cube(d, x - s * 0.4, by - s * 0.9, s * 0.35, s * 0.9, s * 0.3, PANTS)
    cube(d, x + s * 0.05, by - s * 0.9, s * 0.35, s * 0.9, s * 0.3, PANTS)
    cube(d, x - s * 0.55, by - s * 2.1, s * 1.1, s * 1.25, s * 0.5, SHIRT)
    a = math.sin(t * 6) * s * 0.3 if wave_arm else 0
    cube(d, x - s * 0.85, by - s * 2.05 - a, s * 0.3, s * 1.0, s * 0.3, shade(SHIRT, 0.92))
    cube(d, x + s * 0.55, by - s * 2.05, s * 0.3, s * 1.0, s * 0.3, shade(SHIRT, 0.92))
    hy = by - s * 3.05
    cube(d, x - s / 2, hy, s, s * 0.95, s * 0.55, SKIN)
    cube(d, x - s / 2, hy - s * 0.12, s, s * 0.3, s * 0.55, HAIR)
    e = s * 0.1
    if face == "shock":
        for ex in (x - s * 0.27, x + s * 0.13):
            d.rectangle([ex, hy + s * 0.36, ex + e * 1.3, hy + s * 0.36 + e * 1.3], fill=INK)
        d.rectangle([x - s * 0.08, hy + s * 0.62, x + s * 0.08, hy + s * 0.76], fill=(200, 100, 110))
    elif ((t + x * 0.003) % 2.9) < 0.12:  # 眨眼
        d.rectangle([x - s * 0.25, hy + s * 0.44, x - s * 0.25 + e, hy + s * 0.47], fill=INK)
        d.rectangle([x + s * 0.15, hy + s * 0.44, x + s * 0.15 + e, hy + s * 0.47], fill=INK)
        d.rectangle([x - s * 0.1, hy + s * 0.65, x + s * 0.1, hy + s * 0.7], fill=(220, 110, 120))
    else:
        d.rectangle([x - s * 0.25, hy + s * 0.4, x - s * 0.25 + e, hy + s * 0.4 + e], fill=INK)
        d.rectangle([x + s * 0.15, hy + s * 0.4, x + s * 0.15 + e, hy + s * 0.4 + e], fill=INK)
        d.rectangle([x - s * 0.1, hy + s * 0.65, x + s * 0.1, hy + s * 0.7], fill=(220, 110, 120))
        d.rectangle([x - s * 0.36, hy + s * 0.56, x - s * 0.22, hy + s * 0.62], fill=(250, 170, 170))
        d.rectangle([x + s * 0.22, hy + s * 0.56, x + s * 0.36, hy + s * 0.62], fill=(250, 170, 170))


def pill(d, x, y, s, size=44, fill=(255, 255, 255), bgc=PINK, age=None):
    if age is not None:  # 弹出: 从小放大并回弹, 之后轻轻浮动
        size = max(4, int(size * back(age / 0.35)))
        y += 6 * math.sin(age * 3)
    w = d.textlength(s, font=F(size)) + 50
    d.rounded_rectangle([x - w / 2, y - size * 0.75, x + w / 2, y + size * 0.75], int(size * 0.75), fill=bgc)
    text_c(d, (x, y), s, size, fill=fill)


def pop(d, x, y, s, size, col, lt, t0):
    """弹出字: 出现瞬间放大回弹."""
    if lt < t0: return
    u = clamp((lt - t0) / 0.25)
    sc = 1 + 0.35 * math.sin(math.pi * u) if u < 1 else 1
    text_c(d, (x, y), s, int(size * sc), fill=col, stroke=7, sfill=(255, 255, 255))


def arrow(d, x0, x1, y, col, w=6):
    d.line([(x0, y), (x1, y)], fill=col, width=w)
    for x, sgn in ((x0, 1), (x1, -1)):
        d.polygon([(x, y), (x + sgn * 22, y - 14), (x + sgn * 22, y + 14)], fill=col)


def wifi(d, x, y, t, col=MINT):
    for r in range(3):
        rr = 30 + r * 30 + 10 * ((t * 2) % 1)
        d.arc([x - rr, y - rr, x + rr, y + rr], 225, 315, fill=col, width=8)
    d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=col)


def heart_burst(d, t, n, cx, cy, spread, seed, size=(20, 60), col=(255, 120, 160)):
    r = random.Random(seed)
    for i in range(n):
        ph = r.random(); sp = r.uniform(0.25, 0.6)
        k = (t * sp + ph) % 1.0
        x = cx + r.uniform(-spread, spread) + math.sin(t * 2 + i) * 20
        heart(d, x, cy - k * 700, r.uniform(*size) * (1 - k * 0.4), mix(col, (255, 210, 225), r.random() * 0.4))


# ---------------------------------------------------------------- 配角: 孔雀 / 九尾狐
def peacock(d, cx, by, t):
    for i in range(11):  # 尾屏
        a = math.pi + math.pi * i / 10 + 0.04 * math.sin(t * 2 + i)
        x, y = cx + 230 * math.cos(a), by - 170 + 200 * math.sin(a)
        d.line([(cx, by - 150), (x, y)], fill=(170, 220, 210), width=10)
        d.ellipse([x - 34, y - 40, x + 34, y + 40], fill=(150, 214, 200))
        d.ellipse([x - 16, y - 18, x + 16, y + 18], fill=(150, 184, 240))
    cube(d, cx - 55, by - 170, 110, 120, 50, (150, 190, 240))
    cube(d, cx - 22, by - 290, 44, 130, 26, (150, 190, 240))
    cube(d, cx - 34, by - 340, 68, 60, 30, (150, 190, 240))
    d.rectangle([cx - 14, by - 322, cx - 4, by - 312], fill=INK)
    d.polygon([(cx + 34, by - 318), (cx + 64, by - 308), (cx + 34, by - 300)], fill=(255, 210, 120))
    for q in range(3): d.ellipse([cx - 20 + q * 16, by - 380, cx - 10 + q * 16, by - 370], fill=(150, 190, 240))
    d.rectangle([cx - 30, by - 50, cx - 20, by], fill=(255, 200, 120)); d.rectangle([cx + 20, by - 50, cx + 30, by], fill=(255, 200, 120))


def fox(d, cx, by, s, t):
    """九尾狐 (浅橘色), 一脸沉默."""
    k = s
    for i in range(9):
        a = -math.pi * 0.92 + math.pi * 0.84 * i / 8 + 0.05 * math.sin(t * 2 + i)
        ex, ey = cx + 170 * k * math.cos(a), by - 90 * k + 170 * k * math.sin(a)
        d.line([(cx, by - 90 * k), (ex, ey)], fill=(255, 206, 168), width=int(38 * k))
        d.ellipse([ex - 22 * k, ey - 22 * k, ex + 22 * k, ey + 22 * k], fill=(255, 250, 244))
    cube(d, cx - 70 * k, by - 120 * k, 140 * k, 120 * k, 50 * k, (255, 196, 150))
    cube(d, cx - 60 * k, by - 230 * k, 120 * k, 100 * k, 50 * k, (255, 196, 150))
    for sg in (-1, 1):
        d.polygon([(cx + sg * 60 * k, by - 230 * k), (cx + sg * 20 * k, by - 230 * k), (cx + sg * 50 * k, by - 300 * k)], fill=(255, 186, 140))
    d.rectangle([cx - 30 * k, by - 160 * k, cx + 30 * k, by - 135 * k], fill=(255, 250, 244))
    for sg in (-1, 1):
        d.line([(cx + sg * 40 * k, by - 190 * k), (cx + sg * 16 * k, by - 186 * k)], fill=INK, width=max(3, int(6 * k)))


# ---------------------------------------------------------------- 场景定义
# (时长s, 场景名, 起始天, 结束天, 标题字幕, 英文, 相当于, 副作用)
SCENES = [
    (3.0, "title", 0, 0, "", "", "", ""),
    (3.2, "t0", 0, 0, "第0天：一条尾巴\n竖起来，是在跟你打招呼", "Day 0: One tail. Held straight up, it's saying hi.", "正常猫咪", "无"),
    (3.2, "t1", 1, 1, "第1天：两条尾巴\n一条说开心，一条说别烦我", "Day 1: Two tails. One says happy, the other says go away.", "两种心情", "猫自己也懵了"),
    (3.0, "t3", 3, 3, "第3天：四条尾巴一起摇\n家里不用开电扇了", "Day 3: Four tails wagging at once. Who needs a fan?", "一台电风扇", "作业本被吹跑"),
    (3.0, "t7", 6, 7, "第7天：八条尾巴，开屏了\n孔雀：？", "Day 7: Eight tails fanned out. Peacock: ?", "一只孔雀", "孔雀不服"),
    (3.2, "t30", 25, 30, "第30天：31条尾巴打结了\n解了一下午", "Day 30: 31 tails in one big knot. It took all afternoon.", "一团毛线", "铲屎官加班"),
    (3.4, "t100", 90, 100, "第100天：尾巴转起来当螺旋桨\n它飞走了", "Day 100: The tails spin like a propeller. It takes off.", "一架直升机", "小区禁飞"),
    (3.6, "t365", 300, 365, "第1年：366条尾巴\n九尾狐看了都沉默了", "Year 1: 366 tails. Even the nine-tailed fox goes quiet.", "40多只九尾狐", "九尾狐失业"),
    (4.8, "why", 0, 0, "其实，一条尾巴就够忙了\n它是平衡杆，也是心情显示器", "One tail keeps a cat busy: it helps balance, and it shows how the cat feels.", "", ""),
    (4.8, "back", 0, 0, "一条就够了\n它竖着尾巴走向你，就是在说：见到你真好", "One is enough. Walking to you tail up means: glad to see you.", "刚刚好", "无"),
    (3.6, "end", 0, 0, "", "", "", ""),
]
STARTS = []
_acc = 0
for _s in SCENES:
    STARTS.append(_acc); _acc += _s[0]
TOTAL = _acc
NFRAMES = int(TOTAL * FPS)
IDX = {s[1]: i for i, s in enumerate(SCENES)}

DANMAKU = ["哈哈哈哈哈", "九尾狐：？", "猫：我自己都数不清", "这还是猫吗", "awsl", "+1", "前方高能！", "螺旋桨猫",
           "起飞！", "求同款", "孔雀哭了", "毛线团警告", "好想摸", "猫猫：？", "快回来！"]
BG_OF = {"t7": "garden", "t100": "town", "t365": "glow"}

# ---------------------------------------------------------------- 静态背景 (浅色系)
_bg = {}


def bg(name):
    if name in _bg: return _bg[name]
    rnd = random.Random(len(name) * 31)
    if name == "garden":
        im = vgrad((214, 238, 252), (238, 248, 255)); d = ImageDraw.Draw(im)
        for cx, cy in ((200, 360), (820, 520)):
            for j in range(4): cube(d, cx - 140 + j * 70, cy - 30 * (j % 2), 110, 56, 36, (255, 255, 255))
        d.rectangle([0, 1200, W, H], fill=(206, 238, 206))
        for _ in range(60):
            x, y = rnd.randrange(W), rnd.randrange(1230, H)
            c = rnd.choice([(255, 200, 214), (255, 236, 170), (220, 206, 250), (255, 255, 255)])
            for q in range(4):
                a = q * math.pi / 2
                d.ellipse([x + 10 * math.cos(a) - 8, y + 10 * math.sin(a) - 8, x + 10 * math.cos(a) + 8, y + 10 * math.sin(a) + 8], fill=c)
            d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(255, 220, 120))
    elif name == "town":
        im = vgrad((196, 228, 250), (232, 244, 252)); d = ImageDraw.Draw(im)
        cols = [(255, 214, 220), (214, 232, 255), (255, 240, 200), (214, 244, 226), (232, 220, 250)]
        for b in range(7):
            x = b * 160 - 40; top = rnd.randint(500, 860)
            cube(d, x, top, 140, 1300 - top, 60, cols[b % 5])
            for wy in range(top + 40, 1260, 90):
                for wx in range(x + 20, x + 130, 50):
                    d.rectangle([wx, wy, wx + 26, wy + 40], fill=(255, 255, 255))
        d.rectangle([0, 1300, W, H], fill=(226, 226, 234))
        for x in range(0, W, 180): d.rectangle([x, 1600, x + 100, 1616], fill=(255, 255, 255))
    elif name == "glow":
        im = vgrad((255, 238, 220), (255, 220, 232)); d = ImageDraw.Draw(im)
        for i in range(24):  # 柔和光芒
            a = 2 * math.pi * i / 24
            d.polygon([(540, 1150), (540 + 1400 * math.cos(a), 1150 + 1400 * math.sin(a)),
                       (540 + 1400 * math.cos(a + 0.12), 1150 + 1400 * math.sin(a + 0.12))], fill=(255, 244, 232))
        d.rectangle([0, 1560, W, H], fill=(250, 226, 214))
    elif name == "why":
        im = vgrad((244, 236, 252), (230, 222, 248))
    elif name == "end":
        im = vgrad((255, 244, 248), (252, 232, 240))
    else:  # room: 浅桃色卧室
        im = vgrad((255, 244, 236), (252, 232, 222)); d = ImageDraw.Draw(im)
        d.rectangle([0, 1180, W, H], fill=(242, 220, 198))
        for y in range(1180, H, 70): d.line([0, y, W, y], fill=(230, 204, 180), width=4)
        d.rectangle([690, 170, 1000, 520], fill=(206, 232, 252), outline=(236, 206, 186), width=16)
        d.line([845, 170, 845, 520], fill=(236, 206, 186), width=10)
        cube(d, 900, 900, 70, 100, 40, (255, 214, 200))            # 花盆
        for q in range(3): cube(d, 890 + q * 30, 830 - q * 20, 26, 70, 16, (150, 210, 170))
        cube(d, 760, 1000, 260, 70, 90, (236, 214, 248))           # 淡紫色矮柜
    _bg[name] = im
    return im


# ---------------------------------------------------------------- 各场景
SMALL_WH = dict(n=12, L=150)


def draw_scene(im, name, lt, dur):
    d = ImageDraw.Draw(im)
    p = lt / dur
    if name == "title":
        person(d, 320, 1620, 150, t=lt, wave_arm=True)
        cat(d, 730, 1620, 280, lt, hop=1.0, wh=SMALL_WH, tail=(-1.75, 0.3, 1.0))
        heart(d, 520, 1080 - 20 * math.sin(lt * 3), 40 + 6 * math.sin(lt * 5), PINK)
        d.rounded_rectangle([140, 430, 940, 720], 36, fill=(255, 255, 255))
        text_c(d, (540, 520), "假如你家猫", 74, fill=INK)
        text_c(d, (540, 625), "每天多一条尾巴", 82, fill=PEACH)
        text_c(d, (540, 790), "会发生什么？", 76, fill=(255, 255, 255), stroke=6, sfill=INK)
    elif name == "t0":
        cat(d, 520, 1450, 330, lt, enter=lt, tilt=0.1 * math.sin(lt * 2), look=math.sin(lt * 1.5), wh=SMALL_WH,
            tail=(-1.75, 0.22, 0.9), hop=0.35)
        if lt > 0.5: pill(d, 800, 860, "竖尾巴 = 见到你开心", 40, bgc=MINT, age=lt - 0.5)
    elif name == "t1":
        cat(d, 500, 1450, 330, lt, enter=lt, eyes="dot", look=math.sin(lt * 4), wh=SMALL_WH, tails=dict(n=2, mode="two"))
        pop(d, 690, 1060, "开心♪", 56, MINT, lt, 0.4)
        pop(d, 900, 1300, "别烦我", 56, PINK, lt, 0.9)
        pop(d, 500, 860, "?", 110, LAV, lt, 1.6)
    elif name == "t3":
        cw = 30 * math.sin(lt * 9)  # 窗帘被吹
        d.polygon([(690, 170), (760 + cw, 170), (800 + cw * 2, 520), (690, 520)], fill=(255, 214, 226))
        person(d, 220, 1650, 130, t=lt, face="shock")
        for q in range(5):  # 被吹乱的头发
            d.line([(160 + q * 24, 1255), (110 + q * 20 - 20 * math.sin(lt * 10 + q), 1225)], fill=HAIR, width=10)
        r = random.Random(4)
        for i in range(7):  # 飞走的作业本
            x = (r.uniform(0, 600) - lt * r.uniform(200, 380)) % 700
            y = r.uniform(700, 1300) + 30 * math.sin(lt * 4 + i)
            d.polygon([(x, y), (x + 60, y - 10), (x + 66, y + 34), (x + 6, y + 44)], fill=(255, 255, 255))
            d.line([(x + 10, y + 12), (x + 54, y + 4)], fill=(200, 210, 240), width=3)
        for i in range(6):  # 风
            wy = 1000 + i * 70; wx = 520 - ((lt * 900 + i * 120) % 500)
            d.line([(wx, wy), (wx + 120, wy - 6)], fill=(255, 255, 255), width=7)
        cat(d, 640, 1450, 320, lt, enter=lt, eyes="happy", wh=SMALL_WH, tails=dict(n=4, a0=-2.5, a1=-0.65, amp=0.55, hz=4.0))
        if lt > 0.8: pill(d, 860, 820, "风力 3 级", 42, bgc=SKY, age=lt - 0.8)
    elif name == "t7":
        peacock(d, 220, 1560, lt)
        pop(d, 220, 1120, "?", 110, LAV, lt, 1.0)
        cat(d, 640, 1480, 300, lt, enter=lt, eyes="normal", tilt=0.12, wh=SMALL_WH,
            tails=dict(n=8, a0=-3.05, a1=-0.1, amp=0.18, hz=1.0, segs=15))
        if lt > 0.5: pill(d, 820, 760, "开屏！", 46, bgc=PINK, age=lt - 0.5)
    elif name == "t30":
        person(d, 900, 1660, 140, t=lt, face="shock")
        cat(d, 400, 1450, 300, lt, enter=lt, eyes="half", mouth="flat", wh=SMALL_WH, tails=dict(n=31, mode="knot"))
        d.line([(830, 1330), (760, 1330 + 10 * math.sin(lt * 8))], fill=SKIN, width=26)
        if lt > 0.6: pill(d, 820, 880, "解了一下午", 44, bgc=LAV, age=lt - 0.6)
        d.ellipse([975, 1080, 1000, 1110], fill=(170, 214, 250))
    elif name == "t100":
        for x, f in ((170, 0.3), (930, 0.5)):
            person(d, x, 1720, 70, t=lt, face="shock")
            pop(d, x, 1460, "!", 80, PINK, lt, f)
        cx = lerp(260, 820, ease(p)); cy = 1250 - 360 * ease(p) + 25 * math.sin(lt * 6)
        for j in range(5):
            d.line([(cx - 200 - j * 30, cy - 120 + j * 50), (cx - 320 - j * 30, cy - 90 + j * 50)], fill=(255, 255, 255), width=8)
        cat(d, cx, cy, 230, lt, eyes="happy", wh=SMALL_WH, rot=0.12, tails=dict(n=101, mode="prop", spin=14))
        if lt > 0.9: pill(d, 540, 520, "猫：起飞～", 44, bgc=SKY, age=lt - 0.9)
    elif name == "t365":
        fox(d, 190, 1760, 0.9, lt)
        if lt > 0.8:
            d.rounded_rectangle([110, 1360, 300, 1440], 30, fill=(255, 255, 255))
            text_c(d, (205, 1398), "……", 50, fill=INK)
        cat(d, 600, 1520, 260, lt, enter=lt, eyes="happy", blush=1.0, wh=SMALL_WH,
            tails=dict(n=366, a0=-3.14, a1=0.0, amp=0.25, hz=1.2, segs=16, sl=40.0))
    elif name == "why":
        cat(d, 540, 1700, 470, lt, enter=lt, look=0.5 * math.sin(lt), wh=SMALL_WH, tail=(-1.6, 0.6, 1.0))
        labels = ("竖起来 → 开心、打招呼", "快速甩 → 不耐烦", "炸毛变粗 → 害怕", "走高处 → 帮忙保持平衡")
        for i, s in enumerate(labels):
            if lt > 0.3 + i * 0.7:
                pill(d, 540, 280 + i * 115, s, 40, fill=INK, bgc=(255, 255, 255), age=lt - 0.3 - i * 0.7)
    elif name == "back":
        person(d, 860, 1660, 150, t=lt)
        x = lerp(220, 580, ease(clamp(lt / 3.2)))
        cat(d, x, 1500, 290, lt, eyes="happy", blush=1.0, walk=1.0 if lt < 3.2 else 0.0, wh=SMALL_WH,
            tail=(-1.75, 0.25, 0.9))
        ov = Image.new("RGB", (W, H), (255, 214, 190))
        im.paste(Image.blend(im, ov, 0.12 * ease(lt / 1.5)))
        d = ImageDraw.Draw(im)
        heart_burst(d, lt, 12, 700, 1150, 260, 5, size=(22, 50))
    elif name == "end":
        a = ease(lt / 0.8)
        text_c(d, (540, 800), "一条尾巴就够了", 66, fill=mix((255, 244, 248), PINK, a))
        text_c(d, (540, 930), "你家猫见到你，尾巴是竖着的吗？", 56, fill=mix((255, 244, 248), INK, a))
        if lt > 1.0:
            text_c(d, (540, 1050), "评论区告诉我 ↓", 58, fill=mix((255, 244, 248), PEACH, clamp((lt - 1) / 0.4)))
        heart(d, 540, 1200, 70 * a + 1, PINK)
        cat(d, 540, 1620, 200, lt, hop=0.6, wh=dict(n=12, L=120), tail=(-1.75, 0.3, 1.0))
    return im


# ---------------------------------------------------------------- HUD / 字幕 / 弹幕
def draw_hud(d, sc, lt, dur):
    _, name, d0, d1, cap, en, desc, side = sc
    if not desc: return
    days = lerp(d0, d1, ease(clamp(lt / (dur * 0.85))))
    val = 1 if name == "back" else 1 + int(round(days))
    x, y = 30, 560
    text_c(d, (x, y), "尾巴数量", 46, anchor="lm", stroke=4, sfill=INK)
    d.text((x, y + 34), "T A I L S", font=F(20), fill=INK, anchor="lm")
    num = f"{val:,}"
    ns = int(96 * (0.7 + 0.3 * back(lt / 0.4)))  # 数字弹一下
    d.text((x, y + 110), num, font=F(ns), fill=(255, 255, 255), stroke_width=5, stroke_fill=INK, anchor="lm")
    w = d.textlength(num, font=F(ns)) + 10
    d.text((x + w, y + 128), "条", font=F(40), fill=(255, 255, 255), stroke_width=4, stroke_fill=INK, anchor="lm")
    lines = [f"时间: {'第%d天' % int(round(days)) if name != 'back' else '现在'}", f"相当于: {desc}", f"副作用: {side}"]
    for i, line in enumerate(lines):
        d.text((x, y + 186 + i * 40), line, font=F(32), fill=(255, 255, 255), stroke_width=4, stroke_fill=INK, anchor="lm")
    lab, col = ("刚刚好", MINT) if name == "back" else ("+1条 / 天", (240, 100, 130))
    d.rounded_rectangle([x, y + 312, x + 220, y + 358], 23, fill=col)
    d.text((x + 110, y + 335), lab, font=F(30), fill=(255, 255, 255), anchor="mm")


def draw_caption(d, sc, lt):
    cap, en = sc[4], sc[5]
    if not cap: return
    a = ease(lt / 0.25)
    lines = cap.split("\n")
    y0 = 1560 - (len(lines) - 1) * 40 + (1 - a) * 30
    fs = 66
    while fs > 40 and max(d.textlength(l, font=F(fs)) for l in lines) > 1000: fs -= 2
    for i, line in enumerate(lines):
        u = lt - i * 0.12  # 每行错开弹出
        if u <= 0: continue
        f2 = max(8, int(fs * back(u / 0.35)))
        d.text((540, y0 + i * 82), line, font=F(f2), fill=(255, 226, 70), stroke_width=7, stroke_fill=(110, 70, 60), anchor="mm")
    ew = 28
    while ew > 20 and d.textlength(en, font=F(ew)) > 1020: ew -= 1
    d.text((540, y0 + len(lines) * 82 - 20), en, font=F(ew), fill=(255, 255, 255), stroke_width=3, stroke_fill=INK, anchor="mm")


def draw_danmaku(d, gt, start=STARTS[IDX["t100"]], end=STARTS[IDX["why"]] + 0.8):
    if gt < start or gt > end: return
    dens = clamp((gt - start) / 2.5)
    r = random.Random(2026)
    for i in range(60):
        t0 = start + r.uniform(-2, end - start)
        sp = r.uniform(300, 460)
        x = W - (gt - t0) * sp
        y = 130 + r.randint(0, 7) * 50
        col = r.choice([(255, 255, 255), (255, 236, 150), (170, 230, 255), (255, 180, 210), (190, 250, 200)])
        txt = r.choice(DANMAKU)
        if x < -500 or x > W or r.random() > dens: continue
        d.text((x, y), txt, font=F(38), fill=col, stroke_width=3, stroke_fill=INK)


def scene_at(gt):
    for i in range(len(SCENES) - 1, -1, -1):
        if gt >= STARTS[i]: return i
    return 0


def ambient(d, name, lt):
    """背景里一直在动的小东西: 闪光星星 + 飘动的花瓣/灰尘."""
    r = random.Random(len(name) * 97)
    cols = [(255, 255, 255), (255, 214, 226), (214, 236, 255), (236, 222, 255)]
    for i in range(16):  # 一闪一闪的星星
        x, y = r.uniform(40, W - 40), r.uniform(150, 1400)
        tw = max(0.0, math.sin(lt * r.uniform(2, 4) + r.uniform(0, 6)))
        s0 = 6 + 14 * tw
        if tw > 0.1:
            c = r.choice(cols)
            d.polygon([(x, y - s0), (x + s0 * 0.3, y), (x, y + s0), (x - s0 * 0.3, y)], fill=c)
            d.polygon([(x - s0, y), (x, y + s0 * 0.3), (x + s0, y), (x, y - s0 * 0.3)], fill=c)
    for i in range(14):  # 飘落的花瓣
        sp = r.uniform(60, 140)
        x = (r.uniform(0, W) + 40 * math.sin(lt * 1.3 + i)) % W
        y = (r.uniform(0, H) + lt * sp) % H
        a = lt * 2 + i
        c = r.choice(cols[1:])
        d.polygon([(x + 10 * math.cos(a), y + 10 * math.sin(a)), (x - 6 * math.sin(a), y + 6 * math.cos(a)),
                   (x - 10 * math.cos(a), y - 10 * math.sin(a)), (x + 6 * math.sin(a), y - 6 * math.cos(a))], fill=c)


SHAKE = {"t3": 7, "t100": 6, "t365": 5}


def render_frame(fi):
    gt = fi / FPS
    i = scene_at(gt); sc = SCENES[i]; lt = gt - STARTS[i]; dur = sc[0]; name = sc[1]
    im = draw_scene(bg(BG_OF.get(name, name)).copy(), name, lt, dur)
    ambient(ImageDraw.Draw(im), name, lt)
    # 镜头: 切场景冲进去再回弹 + 缓慢推近 + 手持晃动 + 大场面震屏
    zoom = 1.04 + 0.05 * (lt / dur) + 0.12 * (1 - back(lt / 0.45))
    sh = SHAKE.get(name, 0)
    ox = 16 * math.sin(lt * 0.9 + i) + sh * math.sin(gt * 53)
    oy = 10 * math.sin(lt * 1.3 + i * 2) + sh * math.cos(gt * 47)
    if name in ("end", "title"):
        zoom, ox, oy = 1.03 + 0.015 * math.sin(lt * 1.5), 8 * math.sin(lt), 6 * math.sin(lt * 1.4)
    zoom = max(zoom, 1.02)
    nw, nh = int(W * zoom), int(H * zoom)
    cx0 = int(clamp((nw - W) / 2 + ox, 0, nw - W)); cy0 = int(clamp((nh - H) / 2 + oy, 0, nh - H))
    im = im.resize((nw, nh), Image.BILINEAR).crop((cx0, cy0, cx0 + W, cy0 + H))
    d = ImageDraw.Draw(im)
    draw_hud(d, sc, lt, dur)
    draw_caption(d, sc, lt)
    draw_danmaku(d, gt)
    if lt < 0.15 and i > 0:  # 白闪转场
        im = Image.blend(im, Image.new("RGB", (W, H), (255, 255, 255)), (1 - lt / 0.15) * 0.7)
    if i == len(SCENES) - 1 and lt > dur - 0.8:
        im = Image.blend(im, Image.new("RGB", (W, H), (255, 255, 255)), clamp((lt - dur + 0.8) / 0.8))
    return im.tobytes()


# ---------------------------------------------------------------- 配乐 (程序合成, 无旁白)
def synth_audio(path, sr=44100):
    n = int(TOTAL * sr) + sr
    out = np.zeros(n, dtype=np.float64)
    tt = lambda dur: np.arange(int(dur * sr)) / sr

    def add(sig, t0, vol=1.0):
        i0 = int(t0 * sr); e = min(n, i0 + len(sig)); out[i0:e] += sig[: e - i0] * vol

    def note(freq, dur, kind="tri"):
        t = tt(dur)
        if kind == "tri": s = 2 * np.abs(2 * ((t * freq) % 1) - 1) - 1
        elif kind == "sq": s = np.sign(np.sin(2 * np.pi * freq * t)) * 0.5
        else: s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
        return s * np.minimum(1, t / 0.01) * np.exp(-t * (3.5 if kind != "sin" else 2.2))

    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    calm_t, back_t = STARTS[IDX["why"]], STARTS[IDX["back"]]
    melody = [72, 76, 79, 76, 81, 79, 76, 74, 72, 74, 76, 79, 76, 74, 72, 67]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t = 0.0; step = 0
    while t < calm_t - 0.2:  # 欢快 → 越来越快
        bpm = 116 + 56 * (t / calm_t)
        beat = 60 / bpm / 2
        add(note(mtof(melody[step % 16]), beat * 1.8, "sin"), t, 0.10)
        add(note(mtof(melody[step % 16] + 12), beat * 1.2, "sq"), t, 0.03)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 2 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.3 if step % 4 == 0 else 0.0)
            hh = np.random.default_rng(step).standard_normal(int(0.04 * sr)) * np.exp(-tt(0.04) * 80); add(hh, t + beat, 0.04)
        t += beat; step += 1
    for s0 in STARTS[1:IDX["why"] + 1]:  # 切场景 叮
        add(note(mtof(96), 0.5, "sin"), s0, 0.12); add(note(mtof(103), 0.5, "sin"), s0 + 0.07, 0.10)
    rng = np.random.default_rng(9)
    for s0 in (STARTS[IDX["t1"]] + 0.9, STARTS[IDX["t3"]] + 0.2, STARTS[IDX["t3"]] + 1.2):  # 甩尾 / 风 嗖
        k = tt(0.4)
        add(np.convolve(rng.standard_normal(len(k)), np.ones(20) / 20, "same") * np.sin(np.pi * k / 0.4) ** 2, s0, 0.5)
    k = tt(3.2)  # 螺旋桨 嗡嗡
    add(np.convolve(rng.standard_normal(len(k)), np.ones(30) / 30, "same") * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * k))
        * np.minimum(1, k / 0.3) * np.minimum(1, (3.2 - k) / 0.4), STARTS[IDX["t100"]] + 0.1, 0.6)
    k = tt(0.6)  # 打结 噗
    add(np.sin(2 * np.pi * (200 - 150 * k) * k) * np.exp(-k * 8), STARTS[IDX["t30"]] + 0.3, 0.3)
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72), (65, 69, 72), (64, 67, 72), (60, 64, 67, 72)]
    for kk, ch in enumerate(soft):  # 温柔收尾
        for jj, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), calm_t + kk * 1.9 + jj * 0.12, 0.09)
    fade = int(1.0 * sr); end = int(TOTAL * sr)
    out[end - fade:end] *= np.linspace(1, 0, fade); out[end:] = 0
    out = out[:end]
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.85
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((out * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- 主程序
def main():
    if "--preview" in sys.argv:
        for i, s0 in enumerate(STARTS):
            Image.frombytes("RGB", (W, H), render_frame(int((s0 + SCENES[i][0] * 0.7) * FPS))).resize((360, 640)).save(f"{OUT}/prev_{i:02d}.png")
        print("preview ok"); return
    wav = os.path.join(OUT, "music.wav"); synth_audio(wav)
    mp4 = os.path.join(OUT, "cat_tails.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                           "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4], stdin=subprocess.PIPE)
    with Pool(os.cpu_count()) as pool:
        for k, buf in enumerate(pool.imap(render_frame, range(NFRAMES), chunksize=8)):
            ff.stdin.write(buf)
            if k % 300 == 0: print(f"{k}/{NFRAMES}", flush=True)
    ff.stdin.close(); ff.wait()
    os.remove(wav)
    print("done ->", mp4, f"{TOTAL:.1f}s")


if __name__ == "__main__":
    main()
