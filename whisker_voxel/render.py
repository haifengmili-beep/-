# -*- coding: utf-8 -*-
"""假如你家猫每分钟长一根胡子 —— 体素风竖屏短视频 (1080x1920, 30fps), 浅色系, 《每分钟可爱一倍》同一形式
运行: python3 whisker_voxel/render.py  -> 输出 whisker_voxel/out/cat_whiskers.mp4 ; 预览: --preview
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
        tail=(-1.7, 0.4, 1.1), wh=None, blush=0.6, rot=0.0, brows=False):
    """cx=中心x, by=脚底y, s=头宽. 自带: 歪头/眨眼/抖耳朵/甩尾巴/呼吸.
    eyes: normal/happy/half/dot ; hop=蹦跳强度 ; walk=走路 ; wh=胡子 dict(n每侧, L, spread, droop, mode)."""
    k = s / 420.0
    jump = hop * abs(math.sin(t * math.pi * 1.6)) * 70
    land = hop * max(0.0, 1 - abs(math.sin(t * math.pi * 1.6)) * 6)        # 落地瞬间压扁
    sq = 0.02 * math.sin(t * 3.2) - 0.08 * land + 0.04 * hop * (jump / 70)
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
    # 尾巴 (S 形, 一直在甩)
    base, amp, hz = tail
    x, y, a = 745.0, 790.0, base
    pts = [(x, y)]
    for i in range(12):
        u = i / 11
        a += 0.06 + amp * math.sin(2 * math.pi * hz * t - 2.2 * u) * 0.32
        x, y = x + 26 * math.cos(a), y + 26 * math.sin(a)
        pts.append((x, y))
    line(pts, PC["body_side"], 40); line(pts[-4:], PC["spot"], 40)
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
    else:
        d.rectangle([x - s * 0.25, hy + s * 0.4, x - s * 0.25 + e, hy + s * 0.4 + e], fill=INK)
        d.rectangle([x + s * 0.15, hy + s * 0.4, x + s * 0.15 + e, hy + s * 0.4 + e], fill=INK)
        d.rectangle([x - s * 0.1, hy + s * 0.65, x + s * 0.1, hy + s * 0.7], fill=(220, 110, 120))
        d.rectangle([x - s * 0.36, hy + s * 0.56, x - s * 0.22, hy + s * 0.62], fill=(250, 170, 170))
        d.rectangle([x + s * 0.22, hy + s * 0.56, x + s * 0.36, hy + s * 0.62], fill=(250, 170, 170))


def pill(d, x, y, s, size=44, fill=(255, 255, 255), bgc=PINK):
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


# ---------------------------------------------------------------- 场景定义
# (时长s, 场景名, 起始分钟, 结束分钟, 标题字幕, 英文, 相当于, 副作用)
SCENES = [
    (3.0, "title", 0, 0, "", "", "", ""),
    (3.2, "m0",    0, 9, "第0分钟：一只普通的猫\n左右各12根胡子", "Minute 0: An ordinary cat. 12 whiskers on each side.", "普通猫咪", "无"),
    (3.2, "m10",  10, 59, "第10分钟：吃饭时胡子碰到碗边\n猫：不吃了", "Minute 10: The whiskers hit the bowl. Cat: I'm done.", "多了10根", "吃饭不香了"),
    (3.2, "h1",   60, 120, "第1小时：胡子多得像扫把\n扫地机器人失业了", "Hour 1: Whiskers like a broom. The robot vacuum is out of a job.", "一把扫帚", "扫地机器人失业"),
    (3.2, "d1", 1440, 1500, "第1天：胡子比洞口还宽\n纸箱，进不去了", "Day 1: The whiskers are wider than the hole. No more box.", "比身体宽好几倍", "钻不进纸箱"),
    (3.0, "d3", 4320, 4400, "第3天：胡子竖起来当天线\n全屋WiFi满格", "Day 3: Whiskers up like antennas. Full WiFi bars.", "一排天线", "WiFi满格"),
    (3.0, "w1", 10080, 10200, "第1周：胡子多到能编麻花辫", "Week 1: Enough whiskers for two braids.", "两条麻花辫", "每天梳头1小时"),
    (3.2, "mo1", 43200, 43500, "第1个月：邻居报警\n小区里来了一只狮子", "Month 1: The neighbors call the police. A lion is loose.", "一头狮子", "邻居报警"),
    (3.6, "y1", 525600, 526200, "第1年：风一吹\n它像蒲公英一样飘走了", "Year 1: One breeze, and it floats away like a dandelion.", "一颗蒲公英", "被风吹走"),
    (4.6, "why", 0, 0, "其实，胡子是猫的尺子和雷达\n千万不要剪", "Whiskers are a cat's ruler and radar. Never trim them.", "", ""),
    (4.8, "back", 0, 0, "24根，刚刚好\n够它量纸箱，也够它蹭你的手", "24 whiskers is just right: enough to measure a box, and to nuzzle your hand.", "刚刚好", "无"),
    (3.6, "end", 0, 0, "", "", "", ""),
]
STARTS = []
_acc = 0
for _s in SCENES:
    STARTS.append(_acc); _acc += _s[0]
TOTAL = _acc
NFRAMES = int(TOTAL * FPS)
IDX = {s[1]: i for i, s in enumerate(SCENES)}

DANMAKU = ["哈哈哈哈哈", "狮子猫", "awsl", "胡子：我长我的", "这是猫还是蒲公英", "+1", "前方高能！", "猫：我飘了",
           "物理意义上的飘了", "求同款胡子", "扫地机器人：？", "WiFi密码多少", "好想摸", "猫猫：？", "快回来！"]

# ---------------------------------------------------------------- 静态背景 (浅色系)
_bg = {}


def bg(name):
    if name in _bg: return _bg[name]
    rnd = random.Random(len(name) * 31)
    if name == "kitchen":
        im = vgrad((228, 247, 240), (214, 240, 230)); d = ImageDraw.Draw(im)
        for i in range(7):
            cube(d, 40 + i * 150, 330, 130, 160, 40, (250, 252, 250))
        d.rectangle([0, 1180, W, H], fill=(250, 244, 236))
        for i in range(0, W, 120):
            for j in range(1180, H, 120):
                if (i // 120 + j // 120) % 2: d.rectangle([i, j, i + 120, j + 120], fill=(238, 230, 218))
    elif name == "town":
        im = vgrad((196, 228, 250), (232, 244, 252)); d = ImageDraw.Draw(im)
        cols = [(255, 214, 220), (214, 232, 255), (255, 240, 200), (214, 244, 226), (232, 220, 250)]
        for b in range(7):
            x = b * 160 - 40; top = rnd.randint(380, 760)
            cube(d, x, top, 140, 1300 - top, 60, cols[b % 5])
            for wy in range(top + 40, 1260, 90):
                for wx in range(x + 20, x + 130, 50):
                    d.rectangle([wx, wy, wx + 26, wy + 40], fill=(255, 255, 255))
        d.rectangle([0, 1300, W, H], fill=(226, 226, 234))
        for x in range(0, W, 180): d.rectangle([x, 1600, x + 100, 1616], fill=(255, 255, 255))
    elif name == "sky":
        im = vgrad((176, 216, 248), (236, 246, 255)); d = ImageDraw.Draw(im)
        for cx, cy in ((180, 380), (820, 620), (300, 1000), (880, 1250)):
            for j in range(4):
                cube(d, cx - 140 + j * 70, cy - 30 * (j % 2), 110, 56, 36, (255, 255, 255))
        cols = [(255, 222, 228), (222, 236, 255), (255, 244, 210), (222, 246, 232)]
        for b in range(16):
            x = b * 70; h = rnd.randint(60, 200)
            cube(d, x, 1720 - h, 60, h, 24, cols[b % 4])
        d.rectangle([0, 1720, W, H], fill=(200, 230, 190))
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
def draw_scene(im, name, lt, dur):
    d = ImageDraw.Draw(im)
    p = lt / dur
    if name == "title":
        person(d, 320, 1620, 150, t=lt, wave_arm=True)
        cat(d, 730, 1620, 280, lt, hop=1.0, wh=dict(n=12, L=150))
        heart(d, 520, 1080 - 20 * math.sin(lt * 3), 40 + 6 * math.sin(lt * 5), PINK)
        d.rounded_rectangle([140, 430, 940, 720], 36, fill=(255, 255, 255))
        text_c(d, (540, 520), "假如你家猫", 74, fill=INK)
        text_c(d, (540, 625), "每分钟长一根胡子", 82, fill=PEACH)
        text_c(d, (540, 790), "会发生什么？", 76, fill=(255, 255, 255), stroke=6, sfill=INK)
    elif name == "m0":
        cat(d, 540, 1450, 330, lt, tilt=0.12 * math.sin(lt * 2.2), look=math.sin(lt * 1.5), wh=dict(n=12, L=190))
        for side, x in ((-1, 250), (1, 830)):
            if lt > 0.4 + (side > 0) * 0.3: pill(d, x, 1120, "12根", 46, bgc=LAV)
    elif name == "m10":
        dip = ease(clamp(lt / 0.5)) * (1 - ease(clamp((lt - 1.9) / 0.4)))
        cube(d, 420, 1330, 240, 110, 70, (190, 216, 248))                 # 窄碗 (后半)
        cat(d, 540, 1450, 330, lt, head_dy=110 * dip, eyes="half" if lt > 0.9 else "normal",
            mouth="flat" if lt > 0.9 else "w", wh=dict(n=17 + int(lt * 3), L=190, droop=-0.25 * dip, curve=-0.2 * dip))
        d.rectangle([420, 1330, 660, 1350], fill=(170, 200, 240))          # 碗沿盖在胡子前
        if dip > 0.5:
            pop(d, 380, 1290, "碰!", 64, PINK, lt, 0.5); pop(d, 700, 1290, "碰!", 64, PINK, lt, 0.65)
        if lt > 2.1: pill(d, 790, 1050, "不吃了", 46, bgc=PINK)
    elif name == "h1":
        x = lerp(220, 760, ease(p))
        for i, dx in enumerate((340, 470, 600, 730, 860)):                # 地上的灰尘被推走
            px = max(dx, x + 210) if x + 210 > dx - 40 else dx
            for q in range(3):
                d.rectangle([px + q * 14, 1488 - q * 10 - (i % 2) * 6, px + q * 14 + 12, 1500 - q * 10 - (i % 2) * 6], fill=(200, 190, 200))
        cat(d, x, 1500, 270, lt, walk=1.0, wh=dict(n=42, L=260, spread=0.45, droop=1.0, curve=0.25))
        d.ellipse([870, 1520, 1050, 1580], fill=(214, 214, 224)); d.ellipse([870, 1500, 1050, 1560], fill=(246, 246, 250))
        d.ellipse([948, 1520, 972, 1540], fill=MINT if (lt % 1) < 0.5 else (200, 200, 210))
        if lt > 1.4:
            pop(d, 960, 1420, "?", 90, LAV, lt, 1.4)
            pill(d, 900, 1320, "失业", 44, bgc=(170, 170, 190))
    elif name == "d1":
        cube(d, 640, 1150, 360, 330, 160, (238, 210, 172))
        d.ellipse([755, 1270, 885, 1400], fill=(150, 116, 92))
        cat(d, 330, 1500, 300, lt, tilt=0.18 * math.sin(lt * 1.8), look=1.0, eyes="normal",
            wh=dict(n=120, L=300, spread=0.55, droop=0.0))
        k = 300 / 420
        half = (22 + 300) * k
        if lt > 0.6:
            arrow(d, 330 - half, 330 + half, 1010, PINK); text_c(d, (330, 960), "胡子宽度", 42, fill=PINK, stroke=5, sfill=(255, 255, 255))
        if lt > 1.1:
            arrow(d, 755, 885, 1230, MINT); text_c(d, (820, 1180), "洞口", 42, fill=MINT, stroke=5, sfill=(255, 255, 255))
        if lt > 1.6:
            pop(d, 820, 1335, "×", 120, PINK, lt, 1.6)
            pop(d, 170, 1120, "?", 100, LAV, lt, 1.8)
    elif name == "d3":
        cat(d, 540, 1450, 320, lt, eyes="happy", tilt=0.05, wh=dict(n=150, L=270, spread=0.32, droop=-1.15, curve=-0.05))
        k = 320 / 420
        for side in (-1, 1):
            tx = 540 + side * (22 + 270 * 0.5) * k * 0.6 + side * 40
            wifi(d, tx, 1250 - 270 * k * 0.95, lt + (side > 0) * 0.3)
        cube(d, 830, 960, 120, 40, 40, (255, 255, 255))                    # 路由器
        d.ellipse([845, 972, 860, 987], fill=MINT)
        if lt > 0.8:
            pill(d, 860, 880, "WiFi 满格", 42, bgc=MINT)
    elif name == "w1":
        person(d, 860, 1640, 150, t=lt, wave_arm=True)
        cube(d, 708, 1250 - 40 * math.sin(lt * 6), 40, 70, 20, (255, 200, 120))   # 梳子
        cat(d, 450, 1420, 320, lt, eyes="happy", tilt=0.1, wh=dict(mode="braid", L=300))
        if lt > 0.6: pill(d, 300, 1020, "每天梳头1小时", 42, bgc=LAV)
    elif name == "mo1":
        cat(d, 540, 1520, 290, lt, eyes="normal", look=math.sin(lt * 3), wh=dict(mode="mane", L=230), tilt=0.06)
        for x, s0 in ((130, 1680), (950, 1700)):
            person(d, x, s0, 70, t=lt, face="shock")
            pop(d, x, s0 - 260, "!", 80, PINK, lt, 0.3)
        cube(d, 800, 1730, 220, 80, 70, (220, 234, 255))                   # 警车
        d.rectangle([870, 1700, 940, 1730], fill=(255, 140, 160) if (lt * 4) % 1 < 0.5 else (140, 190, 255))
        if lt > 0.7: pill(d, 540, 930, "报警：小区来了狮子", 44, bgc=PINK)
    elif name == "y1":
        cx = 540 + 140 * math.sin(lt * 1.2) + lt * 30
        cy = 1300 - lt * 160
        for i in range(10):                                                # 风
            wy = 300 + i * 150; wx = (lt * 700 + i * 260) % 1500 - 300
            d.line([(wx, wy), (wx + 160, wy - 10)], fill=(255, 255, 255), width=6)
        r = random.Random(3)
        for i in range(24):                                                # 飘走的胡子种子
            sx = (r.uniform(0, W) + lt * r.uniform(120, 300)) % W; sy = r.uniform(200, 1500) - lt * 60
            d.line([(sx, sy), (sx + 30, sy - 12)], fill=(255, 255, 255), width=3)
            d.ellipse([sx + 26, sy - 16, sx + 34, sy - 8], fill=(255, 255, 255))
        cat(d, cx, cy, 200, lt, eyes="happy", rot=0.25 * math.sin(lt * 1.5), wh=dict(mode="ball", L=420))
        if lt > 1.0: pill(d, 540, 640, "猫：我飘了～", 44, bgc=SKY)
    elif name == "why":
        cat(d, 540, 1680, 500, lt, look=0.5 * math.sin(lt), wh=dict(n=12, L=200), brows=True)
        for i, s in enumerate(("胡子宽度 ≈ 身体宽度 → 量缝隙", "根部神经密集 → 感知气流和障碍", "眉毛上、下巴、前腿后侧也有")):
            if lt > 0.3 + i * 0.9:
                pill(d, 540, 300 + i * 130, s, 42, fill=INK, bgc=(255, 255, 255))
    elif name == "back":
        cat(d, 520, 1450, 330, lt, eyes="happy", tilt=0.18 + 0.06 * math.sin(lt * 3), blush=1.0, wh=dict(n=12, L=190))
        sx = lerp(1180, 720, ease(lt / 0.8))
        d.line([(1080, 1180), (sx + 60, 1040)], fill=shade(SHIRT, 0.92), width=70)
        cube(d, sx, 990 + 10 * math.sin(lt * 5), 110, 70, 50, SKIN)
        ov = Image.new("RGB", (W, H), (255, 214, 190))
        im.paste(Image.blend(im, ov, 0.12 * ease(lt / 1.5)))
        d = ImageDraw.Draw(im)
        heart_burst(d, lt, 12, 540, 1150, 300, 5, size=(22, 50))
    elif name == "end":
        a = ease(lt / 0.8)
        text_c(d, (540, 800), "千万别剪猫胡子", 66, fill=mix((255, 244, 248), PINK, a))
        text_c(d, (540, 930), "你家猫有几根胡子？", 72, fill=mix((255, 244, 248), INK, a))
        if lt > 1.0:
            text_c(d, (540, 1050), "数完评论区告诉我 ↓", 58, fill=mix((255, 244, 248), PEACH, clamp((lt - 1) / 0.4)))
        heart(d, 540, 1200, 70 * a + 1, PINK)
        cat(d, 540, 1620, 200, lt, hop=0.6, wh=dict(n=12, L=120))
    return im


# ---------------------------------------------------------------- HUD / 字幕 / 弹幕
def tlabel(m):
    m = int(m)
    if m < 60: return f"{m}分钟"
    if m < 1440: return f"{m // 60}小时{m % 60}分"
    if m < 43200: return f"{m // 1440}天{m % 1440 // 60}小时"
    if m < 525600: return f"{m // 43200}个月{m % 43200 // 1440}天"
    return f"{m // 525600}年{m % 525600 // 1440}天"


def draw_hud(d, sc, lt, dur):
    _, name, m0, m1, cap, en, desc, side = sc
    if not desc: return
    mins = lerp(m0, m1, ease(clamp(lt / (dur * 0.85))))
    val = 24 if name == "back" else 24 + int(mins)
    x, y = 30, 560
    text_c(d, (x, y), "胡子数量", 46, anchor="lm", stroke=4, sfill=INK)
    d.text((x, y + 34), "W H I S K E R S", font=F(20), fill=INK, anchor="lm")
    num = f"{val:,}"
    d.text((x, y + 110), num, font=F(96), fill=(255, 255, 255), stroke_width=5, stroke_fill=INK, anchor="lm")
    w = d.textlength(num, font=F(96)) + 10
    d.text((x + w, y + 128), "根", font=F(40), fill=(255, 255, 255), stroke_width=4, stroke_fill=INK, anchor="lm")
    lines = [f"时间: {tlabel(mins) if name != 'back' else '现在'}", f"相当于: {desc}", f"副作用: {side}"]
    for i, line in enumerate(lines):
        d.text((x, y + 186 + i * 40), line, font=F(32), fill=(255, 255, 255), stroke_width=4, stroke_fill=INK, anchor="lm")
    lab, col = ("刚刚好", MINT) if name == "back" else ("+1根 / 分钟", (240, 100, 130))
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
        d.text((540, y0 + i * 82), line, font=F(fs), fill=(255, 226, 70), stroke_width=7, stroke_fill=(110, 70, 60), anchor="mm")
    ew = 28
    while ew > 20 and d.textlength(en, font=F(ew)) > 1020: ew -= 1
    d.text((540, y0 + len(lines) * 82 - 20), en, font=F(ew), fill=(255, 255, 255), stroke_width=3, stroke_fill=INK, anchor="mm")


def draw_danmaku(d, gt, start=STARTS[IDX["mo1"]], end=STARTS[IDX["why"]] + 0.8):
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


BG_OF = {"m10": "kitchen", "mo1": "town", "y1": "sky"}


def scene_at(gt):
    for i in range(len(SCENES) - 1, -1, -1):
        if gt >= STARTS[i]: return i
    return 0


def render_frame(fi):
    gt = fi / FPS
    i = scene_at(gt); sc = SCENES[i]; lt = gt - STARTS[i]; dur = sc[0]; name = sc[1]
    im = draw_scene(bg(BG_OF.get(name, name)).copy(), name, lt, dur)
    if name not in ("end", "title"):
        zoom = 1 + 0.04 * (lt / dur)
        nw, nh = int(W * zoom), int(H * zoom)
        im = im.resize((nw, nh), Image.BILINEAR).crop(((nw - W) // 2, (nh - H) // 2, (nw - W) // 2 + W, (nh - H) // 2 + H))
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
    for s0, kk in ((STARTS[IDX["m10"]] + 0.5, 0), (STARTS[IDX["m10"]] + 0.65, 1)):  # 碰
        k = tt(0.15); add(np.sin(2 * np.pi * (500 - 1500 * k) * k) * np.exp(-k * 25), s0, 0.25)
    k = tt(0.9)  # 飘走 上滑音
    add(np.sin(2 * np.pi * (300 + 500 * k) * k) * np.exp(-k * 2.5), STARTS[IDX["y1"]] + 0.3, 0.2)
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
    mp4 = os.path.join(OUT, "cat_whiskers.mp4")
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
