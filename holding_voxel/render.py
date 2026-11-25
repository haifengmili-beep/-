# -*- coding: utf-8 -*-
"""假如你抱着猫一直不放 —— 体素风竖屏短视频 (1080x1920, 30fps), 与《假如你家猫每分钟可爱一倍》同一形式
运行: python3 holding_voxel/render.py  -> 输出 holding_voxel/out/cat_holding.mp4 ; 预览: --preview
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


# ---------------------------------------------------------------- 角色: 用户的粉色方块猫 (可旋转/表情/尾巴/后腿)
PC = dict(ear=(238, 136, 168), ear_in=(250, 196, 212), head_top=(253, 214, 226), head_side=(235, 160, 186),
          head=(249, 198, 214), body=(247, 185, 204), body_side=(229, 147, 176), spot=(229, 150, 180),
          paw=(249, 198, 214), eye=(18, 18, 18), white=(255, 255, 255), cheek=(242, 123, 160),
          nose=(239, 108, 143), muzzle=(247, 184, 165), mouth=(190, 80, 110))
RED, GREEN = (230, 50, 60), (50, 180, 100)
SWEATER, SKIN = (84, 132, 200), (214, 160, 120)


def cat(d, cx, by, s, t, eyes="normal", mouth=None, ears=0.0, tail=None, hind=0.0, rot=0.0, blush=0.0):
    """cx=中心x, by=脚底y, s=头宽. eyes: normal/dot/x/wide/happy/sleepy; ears 0→1 飞机耳;
    tail=(基角, 摆幅, 频率) ; hind=后腿悬空蹬腿强度 (0=不画)."""
    k = s / 420.0
    c, sn = math.cos(rot), math.sin(rot)
    br = math.sin(t * 2.2) * 5

    def P(x, y, h=0.0):
        X, Y = (x - 540) * k, (y - 831 + h) * k
        return (cx + X * c - Y * sn, by + X * sn + Y * c)

    def poly(pts, col, h=0.0):
        d.polygon([P(x, y, h) for x, y in pts], fill=col)

    def rect(x0, y0, x1, y1, col, h=0.0):
        poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col, h)

    def line(pts, col, w, h=0.0):
        d.line([P(x, y, h) for x, y in pts], fill=col, width=max(2, int(w * k)), joint="curve")

    if tail:  # 尾巴 (在身体后面)
        base, amp, hz = tail
        x, y, a = 745.0, 790.0, base
        pts = [(x, y)]
        for i in range(12):
            u = i / 11
            a += 0.05 + amp * u * math.sin(2 * math.pi * hz * t - 1.3 * u) * 0.5
            x, y = x + 27 * math.cos(a), y + 27 * math.sin(a)
            pts.append((x, y))
        line(pts, PC["body_side"], 42)
        line(pts[-4:], PC["spot"], 42)
        if amp > 0.8:  # 甩尾动作线
            ex, ey = pts[-1]
            for j in range(3):
                line([(ex + 45 + j * 24, ey - 55 + j * 55), (ex + 80 + j * 24, ey - 65 + j * 55)], RED, 12)
    if hind > 0:  # 悬空的后腿
        for x0, ph in ((420, 0.0), (632, math.pi)):
            lift = -75 * hind * max(0.0, math.sin(2 * math.pi * 3.3 * t + ph))
            rect(x0, 760, x0 + 86, 955 + lift, PC["body_side"])
            rect(x0 - 4, 935 + lift, x0 + 90, 985 + lift, PC["paw"])
    poly([(336, 573), (390, 585), (390, 825), (336, 798)], PC["body_side"])
    rect(390, 585, 750, 825, PC["body"])
    for (x, y, r) in [(495, 705, 25), (600, 675, 35), (675, 745, 22), (546, 768, 16)]:
        rect(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7, PC["spot"])
        rect(x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45, PC["body"])
    rect(414, 783, 504, 831, PC["paw"]); rect(636, 783, 726, 831, PC["paw"])
    # 耳朵 (ears=1 时向两侧压平)
    lt_, rt_ = (438 - 115 * ears, 107 + 125 * ears), (720 + 115 * ears, 107 + 125 * ears)
    poly([(385, 255), lt_, (528, 255)], PC["ear"], br)
    poly([(420, 255), ((441 + lt_[0]) / 2, (173 + lt_[1]) / 2 + 40), (488, 255)], PC["ear_in"], br)
    poly([(640, 255), rt_, (775, 280)], PC["ear"], br)
    poly([(676, 255), ((714 + rt_[0]) / 2, (173 + rt_[1]) / 2 + 40), (745, 270)], PC["ear_in"], br)
    poly([(300, 255), (720, 255), (780, 285), (360, 285)], PC["head_top"], br)
    poly([(300, 255), (360, 285), (360, 585), (300, 555)], PC["head_side"], br)
    rect(360, 285, 780, 585, PC["head"], br)
    blink = eyes == "normal" and (t % 3.1) < 0.12
    for x0 in (414, 624):
        x1, cxe, cye = x0 + 102, x0 + 51, 405
        if eyes == "happy":
            line([(x0 + 8, 432), (cxe, 380), (x1 - 8, 432)], PC["eye"], 18, br)
        elif eyes == "sleepy" or blink:
            rect(x0, 398, x1, 414, PC["eye"], br)
        elif eyes == "dot":
            rect(cxe - 17, cye - 17, cxe + 17, cye + 17, PC["eye"], br)
        elif eyes == "x":
            sg = 1 if x0 < 540 else -1
            line([(cxe - 42 * sg, 355), (cxe + 42 * sg, cye), (cxe - 42 * sg, 455)], PC["eye"], 18, br)
        elif eyes == "wide":  # 瞳孔放大: 整个眼睛变黑变大
            rect(x0 - 10, 335, x1 + 10, 475, PC["eye"], br)
            rect(x0 + 8, 352, x0 + 44, 388, PC["white"], br)
        else:
            rect(x0, 345, x1, 465, PC["eye"], br)
            rect(x0 + 18, 360, x0 + 54, 396, PC["white"], br)
            rect(x0 + 60, 420, x0 + 84, 444, PC["white"], br)
    g = 10 * blush
    for x0 in (402, 684):
        rect(x0 - g, 486 - g / 2, x0 + 54 + g, 516 + g / 2, PC["cheek"], br)
    rect(546, 480, 594, 506, PC["nose"], br); rect(510, 504, 630, 552, PC["muzzle"], br)
    if mouth == "open":
        rect(548, 518, 592, 560, PC["mouth"], br)
    elif mouth == "w":
        line([(540, 522), (555, 534), (570, 522), (585, 534), (600, 522)], PC["mouth"], 6, br)


# 人 (前面抱猫). x=中心, by=脚底, s=头宽
PX, PBY, PS = 540, 1560, 230
CAT_BY, CAT_S = 1330, 190


def person_body(d, x=PX, by=PBY, s=PS, t=0.0, face="smile"):
    cube(d, x - s * 0.4, by - s * 0.9, s * 0.35, s * 0.9, s * 0.3, (50, 52, 70))
    cube(d, x + s * 0.05, by - s * 0.9, s * 0.35, s * 0.9, s * 0.3, (50, 52, 70))
    cube(d, x - s * 0.55, by - s * 2.1, s * 1.1, s * 1.25, s * 0.5, SWEATER)
    hy = by - s * 3.05
    cube(d, x - s / 2, hy, s, s * 0.95, s * 0.55, SKIN)
    cube(d, x - s / 2, hy - s * 0.12, s, s * 0.3, s * 0.55, (30, 28, 28))
    e = s * 0.1
    if face == "shock":
        for ex in (x - s * 0.27, x + s * 0.13):
            d.rectangle([ex, hy + s * 0.36, ex + e * 1.3, hy + s * 0.36 + e * 1.3], fill=(20, 20, 20))
        d.rectangle([x - s * 0.08, hy + s * 0.62, x + s * 0.08, hy + s * 0.76], fill=(160, 60, 60))
    else:
        d.rectangle([x - s * 0.25, hy + s * 0.4, x - s * 0.25 + e, hy + s * 0.4 + e], fill=(20, 20, 20))
        d.rectangle([x + s * 0.15, hy + s * 0.4, x + s * 0.15 + e, hy + s * 0.4 + e], fill=(20, 20, 20))
        d.rectangle([x - s * 0.1, hy + s * 0.65, x + s * 0.1, hy + s * 0.7], fill=(200, 90, 90))
        d.rectangle([x - s * 0.36, hy + s * 0.56, x - s * 0.22, hy + s * 0.62], fill=(240, 140, 140))
        d.rectangle([x + s * 0.22, hy + s * 0.56, x + s * 0.36, hy + s * 0.62], fill=(240, 140, 140))
    # 上臂 (两侧)
    cube(d, x - s * 0.85, by - s * 2.05, s * 0.3, s * 0.95, s * 0.3, shade(SWEATER, 0.92))
    cube(d, x + s * 0.55, by - s * 2.05, s * 0.3, s * 0.95, s * 0.3, shade(SWEATER, 0.92))


def person_arms(d, x=PX, by=PBY, s=PS, scratched=False):
    """一手托屁股 (前臂横在猫身下) + 一手托胸."""
    y = CAT_BY - 10
    cube(d, x - s * 0.85, y, s * 1.45, s * 0.24, s * 0.3, shade(SWEATER, 0.92))      # 前臂托屁股
    cube(d, x + s * 0.6, y - 6, s * 0.28, s * 0.28, s * 0.25, SKIN)                   # 手
    d.line([(x + s * 0.7, by - s * 1.2), (x + s * 0.2, CAT_BY - 45)], fill=shade(SWEATER, 0.92), width=int(s * 0.26))
    cube(d, x + s * 0.02, CAT_BY - 75, s * 0.3, s * 0.24, s * 0.2, SKIN)             # 托胸的手
    if scratched:
        for j in range(3):
            d.line([(x - 140 + j * 34, y + 8), (x - 110 + j * 34, y + 52)], fill=RED, width=9)


def held(d, lt, rot=0.0, **kw):
    person_body(d, t=lt)
    cat(d, PX, CAT_BY, CAT_S, lt, rot=rot, **kw)
    person_arms(d)


def qmark(d, x, y, s, col=(150, 110, 220), txt="?"):
    text_c(d, (x, y), txt, s, fill=col, stroke=8, sfill=(255, 255, 255))


def check(d, x, y, r=34):
    d.ellipse([x - r - 6, y - r - 6, x + r + 6, y + r + 6], fill=(255, 255, 255))
    d.ellipse([x - r, y - r, x + r, y + r], fill=GREEN)
    d.line([(x - r * 0.45, y), (x - r * 0.1, y + r * 0.38), (x + r * 0.5, y - r * 0.35)], fill=(255, 255, 255), width=9)


def pill(d, x, y, s, size=46, fill=(255, 255, 255), bgc=RED):
    w = d.textlength(s, font=F(size)) + 50
    d.rounded_rectangle([x - w / 2, y - size * 0.75, x + w / 2, y + size * 0.75], int(size * 0.75), fill=bgc)
    text_c(d, (x, y), s, size, fill=fill)


# ---------------------------------------------------------------- 场景定义
# (时长s, 场景名, 起始秒, 结束秒, 标题字幕, 英文, 猫咪状态, 警报)
SCENES = [
    (3.0, "title", 0, 0, "", "", "", ""),
    (3.2, "s0",    0, 19, "第0秒：先懵一下\n我是谁？我在哪？", "0s: Confused. Who am I? Where am I?", "懵", "★☆☆☆☆"),
    (3.2, "s20",  20, 39, "第20秒：开始在你怀里扭", "20s: The wiggling begins.", "扭来扭去", "★★☆☆☆"),
    (3.0, "s40",  40, 49, "第40秒：尾巴开始甩", "40s: The tail starts lashing.", "不耐烦", "★★★☆☆"),
    (3.0, "s50",  50, 55, "第50秒：后腿开始蹬", "50s: The back legs start kicking.", "很不爽", "★★★★☆"),
    (2.8, "s55",  55, 59, "第55秒：飞机耳，瞳孔放大", "55s: Airplane ears. Pupils wide open.", "紧张", "★★★★★"),
    (3.2, "s60",  60, 60, "第60秒：放我下来！", "60s: LET. ME. DOWN.", "已逃离", "满格"),
    (4.4, "why",   0, 0, "为什么？四脚离地 = 跑不掉\n在猫的本能里，像被天敌抓住", "Feet off the ground means no escape. To a cat, it feels like being caught.", "", ""),
    (4.8, "back", 60, 60, "所以，能安静让你抱一分钟的猫\n是真的很信任你", "So a cat that stays calm in your arms for a minute truly trusts you.", "安心", "无"),
    (4.4, "howto", 0, 0, "正确抱法：一手托胸，一手托屁股\n一甩尾巴，马上放下", "Support the chest and the hind end. Tail lashing? Put it down.", "", ""),
    (3.6, "end",   0, 0, "", "", "", ""),
]
STARTS = []
_acc = 0
for _s in SCENES:
    STARTS.append(_acc); _acc += _s[0]
TOTAL = _acc
NFRAMES = int(TOTAL * FPS)
IDX = {s[1]: i for i, s in enumerate(SCENES)}

DANMAKU = ["哈哈哈哈哈", "真实", "我家猫10秒就跑", "猫：放开朕", "+1", "前方高能！", "后腿蹬人超疼",
           "飞机耳警告", "我家的能抱5分钟", "猫：救命", "抱一下怎么了嘛", "已被蹬", "太真实了", "猫猫：？"]

# ---------------------------------------------------------------- 静态背景
_bg = {}


def bg(name):
    if name in _bg: return _bg[name]
    if name == "why":
        im = vgrad((150, 200, 240), (222, 236, 250)); d = ImageDraw.Draw(im)
        for cx, cy in ((200, 1150), (860, 1040)):
            for j in range(4):
                cube(d, cx - 160 + j * 70, cy - 40 * (j % 2), 120, 60, 40, (250, 252, 255))
        d.rectangle([0, 1320, W, H], fill=(120, 180, 90))
        rnd = random.Random(8)
        for _ in range(120):
            x, y = rnd.randrange(W), rnd.randrange(1330, H); s = rnd.randint(8, 24)
            cube(d, x, y, s, s * 0.5, s * 0.5, (100 + rnd.randint(-15, 15), 160, 75))
    elif name == "end":
        im = vgrad((8, 8, 12), (8, 8, 12))
    else:  # 卧室 (同原片)
        im = vgrad((236, 214, 170), (205, 176, 132)); d = ImageDraw.Draw(im)
        d.rectangle([0, 1180, W, H], fill=(150, 104, 72))
        for y in range(1180, H, 70): d.line([0, y, W, y], fill=(130, 88, 60), width=4)
        d.rectangle([700, 170, 1000, 520], fill=(160, 196, 232), outline=(110, 70, 50), width=16)
        d.line([850, 170, 850, 520], fill=(110, 70, 50), width=10)
        cube(d, 760, 700, 200, 160, 80, (250, 246, 230))
        d.rectangle([845, 860, 875, 1000], fill=(90, 90, 100))
        cube(d, 700, 1000, 320, 90, 100, (120, 70, 50))
    _bg[name] = im
    return im


# ---------------------------------------------------------------- 各场景动态部分
def heart_burst(d, t, n, cx, cy, spread, seed, size=(20, 60), col=(255, 92, 140)):
    r = random.Random(seed)
    for i in range(n):
        ph = r.random(); sp = r.uniform(0.25, 0.6)
        k = (t * sp + ph) % 1.0
        x = cx + r.uniform(-spread, spread) + math.sin(t * 2 + i) * 20
        y = cy - k * 700
        heart(d, x, y, r.uniform(*size) * (1 - k * 0.4), mix(col, (255, 200, 220), r.random() * 0.4))


def draw_scene(im, name, lt, dur):
    d = ImageDraw.Draw(im)
    if name == "title":
        person_body(d, x=380, by=1640, s=170, t=lt)
        cat(d, 720, 1640, 260, lt, tail=(-1.7, 0.3, 1.0))
        heart(d, 380, 1040 - 20 * math.sin(lt * 3), 40 + 6 * math.sin(lt * 5))
        d.rounded_rectangle([140, 430, 940, 720], 36, fill=(255, 255, 255))
        text_c(d, (540, 520), "假如你抱着猫", 74, fill=(30, 30, 30))
        text_c(d, (540, 625), "一直不放手", 86, fill=(255, 140, 40))
        text_c(d, (540, 790), "会发生什么？", 76, fill=(255, 255, 255), stroke=6, sfill=(40, 30, 30))
    elif name == "s0":
        held(d, lt, eyes="dot", tail=(1.3, 0.1, 0.8))
        qmark(d, 760, 1000 - 12 * math.sin(lt * 4), 130)
        qmark(d, 830, 900 - 10 * math.sin(lt * 5 + 1), 80)
    elif name == "s20":
        held(d, lt, rot=0.12 * math.sin(2 * math.pi * 2.3 * lt), eyes="normal", ears=0.3, tail=(1.0, 0.6, 1.6), hind=0.25)
        for k, (x, y) in enumerate(((260, 1180), (820, 1150), (800, 1290))):
            if lt > 0.3 + k * 0.25:
                text_c(d, (x, y), "扭", 76, fill=(255, 150, 40), stroke=7, sfill=(255, 255, 255))
    elif name == "s40":
        held(d, lt, rot=0.08 * math.sin(2 * math.pi * 2.5 * lt), eyes="normal", ears=0.5, tail=(-0.7, 1.5, 3.0), hind=0.3)
        text_c(d, (880, 1050), "甩!", 80, fill=RED, stroke=7, sfill=(255, 255, 255))
    elif name == "s50":
        held(d, lt, rot=0.12 * math.sin(2 * math.pi * 3.4 * lt), eyes="x", mouth="open", ears=0.7,
             tail=(-0.7, 1.6, 3.2), hind=1.0)
        for k, x in enumerate((330, 760)):
            if (lt * 3.3 + k * 0.5) % 1 < 0.5:
                text_c(d, (x, 1470), "蹬!", 72, fill=RED, stroke=7, sfill=(255, 255, 255))
    elif name == "s55":
        held(d, lt, rot=0.1 * math.sin(2 * math.pi * 4 * lt), eyes="wide", mouth="open", ears=1.0,
             tail=(-0.7, 1.7, 3.6), hind=1.0)
        if lt > 0.3: pill(d, 270, 1060, "飞机耳", 44)
        if lt > 0.8: pill(d, 820, 1180, "瞳孔放大", 44)
        ov = Image.new("RGB", (W, H), (255, 40, 40))
        im.paste(Image.blend(im, ov, 0.10 + 0.06 * math.sin(lt * 14)))
        d = ImageDraw.Draw(im)
    elif name == "s60":
        jump = clamp((lt - 0.5) / 0.7)
        person_body(d, t=lt, face="shock" if jump > 0 else "smile")
        if jump <= 0:
            cat(d, PX, CAT_BY, CAT_S, lt, rot=0.12 * math.sin(lt * 30), eyes="x", mouth="open", ears=1.0,
                tail=(-0.7, 1.7, 3.6), hind=1.0)
            person_arms(d)
        else:
            person_arms(d, scratched=True)
            a = ease(jump)
            cx = lerp(PX, 880, a); cy = lerp(CAT_BY, 1700, a) - 380 * math.sin(math.pi * jump)
            for j in range(4):  # 速度线
                d.line([(cx - 150 - j * 30, cy - 200 + j * 40), (cx - 260 - j * 30, cy - 160 + j * 40)], fill=(255, 255, 255), width=8)
            cat(d, cx, cy, 170, lt, rot=-0.6 * math.sin(math.pi * jump), eyes="happy" if jump >= 1 else "x",
                tail=(-1.6, 0.3, 1.0))
            if jump >= 1: text_c(d, (880, 1240), "溜了～", 60, fill=(255, 255, 255), stroke=6, sfill=(60, 40, 40))
        text_c(d, (540, 1030), "!", 150, fill=RED, stroke=10, sfill=(255, 255, 255)) if jump > 0 and lt < 1.6 else None
    elif name == "why":
        # 天上的猛禽 (体素剪影) 从左飞到右
        bx = lerp(-250, 1250, lt / dur); by = 380 + 40 * math.sin(lt * 3)
        flap = 60 * math.sin(lt * 9)
        bird = (80, 56, 46)
        cube(d, bx - 60, by - 30, 160, 60, 40, bird)
        d.polygon([(bx - 20, by - 20), (bx + 60, by - 20), (bx + 20, by - 170 - flap)], fill=shade(bird, 1.1))
        d.polygon([(bx - 20, by + 20), (bx + 60, by + 20), (bx + 20, by + 120 + flap * 0.4)], fill=shade(bird, 0.8))
        cube(d, bx + 100, by - 40, 50, 46, 30, bird); d.polygon([(bx + 150, by - 20), (bx + 180, by - 8), (bx + 150, by + 2)], fill=(250, 200, 60))
        d.ellipse([bx - 90, 1330, bx + 150, 1370], fill=(100, 150, 75))  # 地上的影子
        # 悬空发抖的猫
        jx = 6 * math.sin(lt * 50)
        cat(d, 540 + jx, 1180 + 12 * math.sin(lt * 3), 230, lt, eyes="wide", mouth="open", ears=1.0,
            tail=(1.4, 0.4, 2.5), hind=0.35)
        for k, x in enumerate((360, 470, 610, 720)):  # 地上的空脚印 ✗
            if lt > 0.4 + k * 0.15:
                d.line([(x - 22, 1400), (x + 22, 1444)], fill=RED, width=10)
                d.line([(x + 22, 1400), (x - 22, 1444)], fill=RED, width=10)
        if lt > 1.2: pill(d, 540, 1300 - 0, "脚下没有支撑", 44)
    elif name == "back":
        held(d, lt, eyes="sleepy", mouth="w", blush=1.0, tail=(1.4, 0.1, 0.8))
        ov = Image.new("RGB", (W, H), (255, 200, 150))
        im.paste(Image.blend(im, ov, 0.14 * ease(lt / 1.5)))
        d = ImageDraw.Draw(im)
        heart_burst(d, lt, 12, 540, 1150, 280, 5, size=(22, 50))
    elif name == "howto":
        lash = lt > 2.3
        held(d, lt, eyes="normal" if lash else "sleepy", mouth=None if lash else "w", blush=0 if lash else 0.6,
             tail=(-0.7, 1.5, 3.0) if lash else (1.4, 0.1, 0.8))
        if lt > 0.4:
            check(d, 820, 1275); text_c(d, (930, 1275), "托胸", 50, fill=(255, 255, 255), stroke=6, sfill=GREEN)
            d.line([(782, 1275), (640, 1275)], fill=GREEN, width=6)
        if lt > 1.2:
            check(d, 170, 1340); text_c(d, (170, 1420), "托屁股", 50, fill=(255, 255, 255), stroke=6, sfill=GREEN)
            d.line([(208, 1340), (330, 1335)], fill=GREEN, width=6)
        if lash:
            pill(d, 860, 1080, "甩尾 → 放下", 42)
    elif name == "end":
        a = ease(lt / 0.8); c = int(255 * a)
        text_c(d, (540, 820), "不让抱，不代表不爱你", 58, fill=(c, int(c * 0.75), int(c * 0.8)))
        text_c(d, (540, 940), "你家猫能让你抱几秒？", 72, fill=(c, c, c))
        if lt > 1.0:
            text_c(d, (540, 1060), "评论区报个数 ↓", 60, fill=(255, 200, 60))
        heart(d, 540, 1200, 70 * a + 1)
    return im


# ---------------------------------------------------------------- HUD / 字幕 / 弹幕
PATIENCE = [(0, 100), (20, 80), (40, 45), (50, 25), (55, 10), (60, 0)]


def patience(sec):
    for (a, va), (b, vb) in zip(PATIENCE, PATIENCE[1:]):
        if sec <= b: return lerp(va, vb, (sec - a) / (b - a))
    return 0


def draw_hud(d, sc, lt, dur):
    _, name, s0, s1, cap, en, status, alarm = sc
    if not status: return
    p = clamp(lt / (dur * 0.85))
    sec = lerp(s0, s1, ease(p))
    pat = 100 if name == "back" else patience(sec)
    x, y = 30, 560
    text_c(d, (x, y), "抱猫计时", 46, anchor="lm", stroke=3, sfill=(0, 0, 0))
    d.text((x, y + 34), "H O L D I N G   T I M E", font=F(20), fill=(220, 220, 220), anchor="lm")
    num = f"{int(sec) // 60:02d}:{int(sec) % 60:02d}"
    d.text((x, y + 110), num, font=F(96), fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0), anchor="lm")
    for i, line in enumerate([f"猫咪状态: {status}", f"危险等级: {alarm}"]):
        d.text((x, y + 186 + i * 40), line, font=F(32), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="lm")
    # 耐心条
    d.text((x, y + 270), f"耐心值 {int(round(pat))}%", font=F(30), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="lm")
    d.rectangle([x, y + 296, x + 300, y + 326], fill=(40, 30, 30))
    col = mix(RED, GREEN, pat / 100)
    d.rectangle([x + 4, y + 300, x + 4 + 292 * pat / 100, y + 322], fill=col)
    lab = "真爱认证" if name == "back" else "耐心 -1.7%/秒"
    d.rounded_rectangle([x, y + 344, x + 230, y + 390], 23, fill=GREEN if name == "back" else (225, 40, 50))
    d.text((x + 115, y + 367), lab, font=F(28), fill=(255, 255, 255), anchor="mm")


def draw_caption(d, sc, lt):
    cap, en = sc[4], sc[5]
    if not cap: return
    a = ease(lt / 0.25)
    lines = cap.split("\n")
    y0 = 1560 - (len(lines) - 1) * 40 + (1 - a) * 30
    fs = 66
    while fs > 40 and max(d.textlength(l, font=F(fs)) for l in lines) > 1000: fs -= 2
    for i, line in enumerate(lines):
        d.text((540, y0 + i * 82), line, font=F(fs), fill=(255, 222, 40), stroke_width=7, stroke_fill=(40, 20, 10), anchor="mm")
    ew = 28
    while ew > 20 and d.textlength(en, font=F(ew)) > 1020: ew -= 1
    d.text((540, y0 + len(lines) * 82 - 20), en, font=F(ew), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="mm")


def draw_danmaku(d, gt, start=STARTS[IDX["s50"]], end=STARTS[IDX["why"]] + 0.8):
    if gt < start or gt > end: return
    dens = clamp((gt - start) / 3)
    r = random.Random(2026)
    for i in range(60):
        t0 = start + r.uniform(-2, end - start)
        sp = r.uniform(300, 460)
        x = W - (gt - t0) * sp
        y = 130 + r.randint(0, 7) * 50
        col = r.choice([(255, 255, 255), (255, 230, 120), (140, 230, 255), (255, 150, 190), (160, 255, 160)])
        txt = r.choice(DANMAKU)
        if x < -500 or x > W or r.random() > dens: continue
        d.text((x, y), txt, font=F(38), fill=col, stroke_width=2, stroke_fill=(0, 0, 0))


def scene_at(gt):
    for i in range(len(SCENES) - 1, -1, -1):
        if gt >= STARTS[i]: return i
    return 0


def render_frame(fi):
    gt = fi / FPS
    i = scene_at(gt); sc = SCENES[i]; lt = gt - STARTS[i]; dur = sc[0]; name = sc[1]
    im = bg(name).copy()
    im = draw_scene(im, name, lt, dur)
    zoom = 1 + 0.04 * (lt / dur)
    if name in ("s50", "s55"):  # 震屏
        zoom += 0.02
    if name not in ("end", "title"):
        nw, nh = int(W * zoom), int(H * zoom)
        sx = int(10 * math.sin(gt * 47)) if name in ("s50", "s55") else 0
        im = im.resize((nw, nh), Image.BILINEAR).crop(((nw - W) // 2 + sx, (nh - H) // 2, (nw - W) // 2 + sx + W, (nh - H) // 2 + H))
    d = ImageDraw.Draw(im)
    draw_hud(d, sc, lt, dur)
    draw_caption(d, sc, lt)
    draw_danmaku(d, gt)
    if lt < 0.15 and i > 0:  # 白闪 / 黑场转场
        k = 1 - lt / 0.15
        im = Image.blend(im, Image.new("RGB", (W, H), (255, 255, 255) if name not in ("end", "back") else (0, 0, 0)), k * 0.7)
    if i == len(SCENES) - 1 and lt > dur - 0.8:
        im = Image.blend(im, Image.new("RGB", (W, H), (0, 0, 0)), clamp((lt - dur + 0.8) / 0.8))
    return im.tobytes()


# ---------------------------------------------------------------- 配乐 (程序合成, 无旁白, 同原片)
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
    calm_t = STARTS[IDX["why"]]
    back_t = STARTS[IDX["back"]]
    melody = [72, 76, 79, 76, 81, 79, 76, 74, 72, 74, 76, 79, 76, 74, 72, 67]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t = 0.0; step = 0
    while t < calm_t - 0.2:  # 越抱越久, 越来越快越紧张
        bpm = 112 + 70 * (t / calm_t)
        beat = 60 / bpm / 2
        mel = melody[step % 16] + (1 if t > STARTS[IDX["s50"]] and step % 4 == 2 else 0)
        add(note(mtof(mel), beat * 1.8, "sq"), t, 0.10)
        if step % 4 == 0:
            for m in chords[(step // 8) % 4]: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 2 == 0:
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.35 if step % 4 == 0 else 0.0)
            hh = np.random.default_rng(step).standard_normal(int(0.04 * sr)) * np.exp(-tt(0.04) * 80); add(hh, t + beat, 0.05)
        t += beat; step += 1
    for s0 in STARTS[1:IDX["why"] + 1]:  # 场景切换 叮
        add(note(mtof(96), 0.5, "sin"), s0, 0.12); add(note(mtof(103), 0.5, "sin"), s0 + 0.07, 0.10)
    # 第60秒 猫跳走: 弹簧音
    j = STARTS[IDX["s60"]] + 0.5; k = tt(0.6)
    add(np.sin(2 * np.pi * (300 + 700 * k) * k) * np.exp(-k * 4), j, 0.25)
    # 为什么: 低沉悬念 (猛禽飞过)
    for kk, m in enumerate((45, 44, 45, 41)):
        add(note(mtof(m), 1.4, "tri"), calm_t + kk * 1.05, 0.12)
    # 温柔收尾
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72), (65, 69, 72), (64, 67, 72)]
    for kk, ch in enumerate(soft):
        for jj, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), back_t + kk * 2.1 + jj * 0.12, 0.09)
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
    mp4 = os.path.join(OUT, "cat_holding.mp4")
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
