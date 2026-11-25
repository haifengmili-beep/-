# -*- coding: utf-8 -*-
"""假如你家猫每分钟可爱一倍 —— 体素风竖屏短视频生成器 (1080x1920, 30fps)
运行: python3 render.py  -> 输出 out/cat_cuteness.mp4
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

# ---------------------------------------------------------------- 角色
PC = dict(ear=(238, 136, 168), ear_in=(250, 196, 212), head_top=(253, 214, 226), head_side=(235, 160, 186),
          head=(249, 198, 214), body=(247, 185, 204), body_side=(229, 147, 176), spot=(229, 150, 180),
          paw=(249, 198, 214), eye=(18, 18, 18), white=(255, 255, 255), cheek=(242, 123, 160),
          nose=(239, 108, 143), muzzle=(247, 184, 165), mouth=(190, 80, 110))
def cat(d, cx, by, s, t, blink=True, mouth=False, look=0.0, glow=False):
    """用户的粉色方块猫 (造型来自 meow_life/character_reference.png)。cx=中心x, by=脚底y, s=头宽"""
    k = s / 420.0
    bob = math.sin(t * 2.2) * 6
    P = lambda x, y, h=0: (cx + (x - 560) * k, by + (y - 831 + h) * k)
    def poly(pts, col, h=bob): d.polygon([P(x, y, h) for x, y in pts], fill=col)
    def rect(x0, y0, x1, y1, col, h=bob): d.rectangle([*P(x0, y0, h), *P(x1, y1, h)], fill=col)
    # 身体
    poly([(336, 573), (390, 585), (390, 825), (336, 798)], PC["body_side"], 0)
    rect(390, 585, 750, 825, PC["body"], 0)
    for (x, y, r) in [(495, 705, 25), (600, 675, 35), (675, 745, 22), (546, 768, 16)]:
        d.ellipse([*P(x - r, y - r, 0), *P(x + r, y + r, 0)], outline=PC["spot"], width=max(1, int(5 * k)))
    rect(414, 783, 504, 831, PC["paw"], 0); rect(636, 783, 726, 831, PC["paw"], 0)
    # 耳朵
    poly([(385, 255), (438, 107), (528, 255)], PC["ear"]); poly([(420, 255), (441, 173), (488, 255)], PC["ear_in"])
    poly([(640, 255), (720, 107), (775, 280)], PC["ear"]); poly([(676, 255), (714, 173), (745, 270)], PC["ear_in"])
    # 头
    poly([(300, 255), (720, 255), (780, 285), (360, 285)], PC["head_top"])
    poly([(300, 255), (360, 285), (360, 585), (300, 555)], PC["head_side"])
    rect(360, 285, 780, 585, PC["head"])
    # 眼睛
    closed = blink and (t % 3.1) < 0.12
    ox = look * 10
    for x0 in (414, 624):
        if closed:
            rect(x0, 398, x0 + 102, 412, PC["eye"])
        else:
            rect(x0, 345, x0 + 102, 465, PC["eye"])
            rect(x0 + 18 + ox, 360, x0 + 54 + ox, 396, PC["white"])
            rect(x0 + 60 + ox, 420, x0 + 84 + ox, 444, PC["white"])
    for x0 in (402, 684): rect(x0, 486, x0 + 54, 516, PC["cheek"])
    rect(546, 480, 594, 506, PC["nose"]); rect(510, 504, 630, 552, PC["muzzle"])
    if mouth: rect(548, 520, 592, 548, PC["mouth"])

def person(d, x, by, s, shirt, skin=(214, 160, 120), hair=(30, 28, 28), t=0, face=1, wave_arm=False):
    """体素小人：x=中心, by=脚底, s=比例(头宽)"""
    hw = s
    # 腿
    cube(d, x - s * 0.4, by - s * 0.9, s * 0.35, s * 0.9, s * 0.3, (50, 52, 70))
    cube(d, x + s * 0.05, by - s * 0.9, s * 0.35, s * 0.9, s * 0.3, (50, 52, 70))
    # 身体
    cube(d, x - s * 0.55, by - s * 2.1, s * 1.1, s * 1.25, s * 0.5, shirt)
    # 手臂
    a = math.sin(t * 6) * s * 0.3 if wave_arm else 0
    cube(d, x - s * 0.85, by - s * 2.05 - a, s * 0.3, s * 1.0, s * 0.3, shade(shirt, 0.92))
    cube(d, x + s * 0.55, by - s * 2.05, s * 0.3, s * 1.0, s * 0.3, shade(shirt, 0.92))
    # 头
    hy = by - s * 3.05
    cube(d, x - hw / 2, hy, hw, hw * 0.95, s * 0.55, skin)
    cube(d, x - hw / 2, hy - s * 0.12, hw, s * 0.3, s * 0.55, hair)
    if face:
        e = s * 0.1
        d.rectangle([x - s * 0.25, hy + s * 0.4, x - s * 0.25 + e, hy + s * 0.4 + e], fill=(20, 20, 20))
        d.rectangle([x + s * 0.15, hy + s * 0.4, x + s * 0.15 + e, hy + s * 0.4 + e], fill=(20, 20, 20))
        d.rectangle([x - s * 0.1, hy + s * 0.65, x + s * 0.1, hy + s * 0.7], fill=(200, 90, 90))

def back_person(d, x, by, s, shirt, hair=(30, 28, 28)):
    cube(d, x - s * 0.55, by - s * 1.4, s * 1.1, s * 1.4, s * 0.4, shirt)
    cube(d, x - s * 0.45, by - s * 2.3, s * 0.9, s * 0.9, s * 0.4, hair)

# ---------------------------------------------------------------- 数字格式
def _sig(x):
    return f"{x:.2f}".rstrip("0").rstrip(".") if x < 10 else (f"{x:.1f}".rstrip("0").rstrip(".") if x < 100 else f"{int(round(x)):,}")
def fmt_num(n):
    if n < 1e4: return f"{int(round(n)):,}"
    if n < 1e8: return _sig(n/1e4) + "万"
    if n < 1e12: return _sig(n/1e8) + "亿"
    if n < 1e16: return _sig(n/1e12) + "万亿"
    if n < 1e20: return _sig(n/1e16) + "亿亿"
    e = int(math.floor(math.log10(n))); m = n / 10 ** e
    return f"{m:.1f}×10^{e}"

# ---------------------------------------------------------------- 场景定义
# (时长s, 场景名, 起始分钟, 结束分钟, 单位, 标题, 英文, 说明, 副作用)
SCENES = [
    (3.2, "title",   0, 0,  "人",    "", "", "只有你", "无"),
    (4.4, "bedroom", 0, 1,  "人",    "一开始，只有你被萌到", "At first, only you are smitten.", "只有你", "无"),
    (4.4, "courier", 3, 5,  "人",    "第3分钟：快递放下了，人没走", "Minute 3: the courier drops the parcel — and stays.", "加上快递小哥", "快递延误"),
    (4.6, "gate",    7, 9,  "人",    "第7分钟：保安忘了问\"你是哪栋的\"", "Minute 7: the guard forgets to ask which building you're in.", "整个小区", "门禁失效"),
    (4.6, "metro",  11, 17, "人",    "第11分钟：地铁不走了，司机也在看", "Minute 11: the metro stops. The driver is watching too.", "一整列地铁", "全线晚点"),
    (4.8, "stock",  20, 25, "人",    "第20分钟：股市暂停，K线长出了猫耳朵", "Minute 20: trading halts. The chart grows cat ears.", "全上海", "熔断"),
    (4.4, "delivery",25, 28,"人",    "第25分钟：全城外卖都超时了\n没有一个差评", "Minute 25: every delivery is late. Zero bad reviews.", "超过全市人口", "外卖超时: 全部"),
    (4.8, "un",     31, 32, "人",    "第31分钟：联合国紧急开会\n议题：先撸猫还是先开会", "Minute 31: emergency summit. Agenda: pet the cat first?", "全国都看完了", "议题通过率: 0%"),
    (4.4, "earth",  33, 34, "人",    "第33分钟：人类历史上第一次，全体摸鱼", "Minute 33: for the first time in history, all of humanity slacks off.", "全人类", "全球摸鱼"),
    (4.4, "chicken",35, 39, "位观众", "第35分钟：全世界的鸡，早上都不打鸣了", "Minute 35: no rooster crows anywhere on Earth.", "加上全世界的鸡", "公鸡: 今天罢工"),
    (4.6, "fish",   42, 50, "位观众", "第42分钟：江里的鱼浮上来排队看猫", "Minute 42: the fish in the river line up for a look.", "加上江里的鱼", "鱼: 排队中"),
    (4.6, "ants",   55, 58, "位观众", "第55分钟：全世界的蚂蚁，不搬家了", "Minute 55: every ant on Earth stops moving house.", "加上全世界的蚂蚁", "蚂蚁: 围成爱心"),
    (4.6, "mars",   60, 64, "位观众", "第60分钟：火星车掉头拍了一张", "Minute 60: a Mars rover turns around for a photo.", "连机器人都没忍住", "NASA: 这张发我"),
    (4.6, "voyager",66, 74, "位观众", "第66分钟：旅行者1号回头了", "Minute 66: Voyager 1 looks back.", "连探测器都回头了", "暗淡蓝点 → 暗淡猫点"),
    (5.4, "stars",  76, 76, "位观众", "第76分钟：\n可观测宇宙的每一颗星星，都在看它", "Minute 76: every star in the observable universe is watching.", "可观测宇宙的恒星", "宇宙膨胀: 暂停"),
    (4.6, "universe",76, 76,"位观众", "全宇宙被萌到，\n需要它可爱 2的76次方 倍", "For the universe to fall for it, it had to be 2^76 times cuter.", "全宇宙", "无"),
    (6.0, "back",    0, 0,  "人",    "而你，在它最普通的时候，\n就觉得它最可爱了", "You? You thought it was the cutest when it was just ordinary.", "只有你", "无"),
    (4.4, "end",     0, 0,  "",      "", "", "", ""),
]
STARTS = []
_acc = 0
for s in SCENES:
    STARTS.append(_acc); _acc += s[0]
TOTAL = _acc
NFRAMES = int(TOTAL * FPS)

DANMAKU = ["awsl", "好可爱啊啊啊", "我也被萌倒了", "前方高能！", "宇宙的尽头是猫", "+1", "已被吸进去",
           "这是我的猫(不是)", "哈哈哈哈哈", "猫猫：？", "撸到了吗", "好想rua", "全宇宙：已关注", "外星人也在看"]

# ---------------------------------------------------------------- 预渲染静态背景
_bg = {}
def bg(name):
    if name in _bg: return _bg[name]
    rnd = random.Random(hash(name) & 0xffff)
    if name in ("bedroom", "title", "back", "courier"):
        im = vgrad((236, 214, 170), (205, 176, 132)); d = ImageDraw.Draw(im)
        d.rectangle([0, 1180, W, H], fill=(150, 104, 72))           # 地板
        for y in range(1180, H, 70): d.line([0, y, W, y], fill=(130, 88, 60), width=4)
        if name == "courier":
            # 门框 + 敞开的门
            d.rectangle([300, 260, 860, 1200], fill=(245, 245, 240))
            d.rectangle([340, 300, 820, 1200], fill=(70, 78, 92))
            d.polygon([(340, 300), (560, 360), (560, 1150), (340, 1200)], fill=(176, 98, 52))
            d.ellipse([515, 760, 540, 785], fill=(230, 200, 90))
        else:
            # 床头/床
            d.rectangle([560, 640, 1080, 1100], fill=(140, 72, 52))
            cube(d, 0, 1150, 1080, 420, 200, (72, 82, 190))      # 蓝色被子
            for i in range(14):
                for j in range(5):
                    x = i * 90 + (j % 2) * 45; y = 1200 + j * 80
                    d.rectangle([x, y, x + 30, y + 30], fill=(110, 120, 220))
            # 台灯
            cube(d, 150, 760, 200, 160, 80, (250, 246, 230))
            d.rectangle([235, 920, 265, 1060], fill=(90, 90, 100))
            cube(d, 70, 1060, 360, 100, 100, (120, 70, 50))
            # 窗
            d.rectangle([700, 170, 1000, 520], fill=(160, 196, 232), outline=(110, 70, 50), width=16)
            d.line([850, 170, 850, 520], fill=(110, 70, 50), width=10)
    elif name == "gate":
        im = vgrad((14, 18, 48), (30, 30, 70)); d = ImageDraw.Draw(im)
        for b in range(7):
            x = b * 170 - 40; top = rnd.randint(150, 420)
            d.rectangle([x, top, x + 150, 1300], fill=(26, 32, 70))
            for wy in range(top + 30, 1280, 50):
                for wx in range(x + 15, x + 140, 40):
                    if rnd.random() < 0.45: d.rectangle([wx, wy, wx + 20, wy + 26], fill=(250, 214, 120))
        d.rectangle([0, 1300, W, H], fill=(40, 40, 52))
    elif name == "metro":
        im = vgrad((214, 214, 210), (120, 120, 120)); d = ImageDraw.Draw(im)
        d.polygon([(0, 0), (W, 0), (700, 600), (380, 600)], fill=(236, 236, 232))
        for k in range(6):
            y = 40 + k * 90
            d.line([lerp(0, 380, k / 6), y, lerp(W, 700, k / 6), y], fill=(255, 255, 255), width=10)
        d.rectangle([380, 600, 700, 950], fill=(70, 74, 80))
        d.polygon([(0, H), (W, H), (700, 950), (380, 950)], fill=(150, 150, 150))
        for side in (0, 1):
            for k in range(4):
                xx = lerp(380, 0, k / 4) if side == 0 else lerp(700, W, k / 4)
                d.line([xx, lerp(600, 0, k / 4), xx, lerp(950, H, k / 4)], fill=(200, 200, 205), width=int(6 + k * 4))
            seat = [(0, 1250), (380, 900), (380, 960), (0, 1420)] if side == 0 else [(W, 1250), (700, 900), (700, 960), (W, 1420)]
            d.polygon(seat, fill=(220, 120, 40))
    elif name in ("stock", "delivery"):
        im = vgrad((10, 12, 34), (40, 30, 80)); d = ImageDraw.Draw(im)
        for b in range(14):
            x = b * 85 - 30; top = rnd.randint(120, 900)
            col = (18 + rnd.randint(0, 15), 22, 52)
            d.rectangle([x, top, x + 80, H], fill=col)
            for wy in range(top + 10, H, 22):
                for wx in range(x + 6, x + 76, 16):
                    if rnd.random() < 0.5: d.rectangle([wx, wy, wx + 8, wy + 10], fill=(255, 226, 150) if rnd.random() < 0.8 else (180, 210, 255))
        # 东方明珠风格的塔
        d.rectangle([160, 200, 180, 1400], fill=(120, 60, 100))
        d.ellipse([110, 560, 230, 680], fill=(220, 70, 130)); d.ellipse([130, 330, 210, 410], fill=(220, 70, 130))
    elif name == "un":
        im = vgrad((40, 30, 60), (90, 60, 90)); d = ImageDraw.Draw(im)
        for r in range(8):
            y = 1000 + r * 110
            d.ellipse([-400 - r * 120, y - 60, W + 400 + r * 120, y + 300], outline=(110, 70, 110), width=14)
            for k in range(14):
                x = 40 + k * 80 + (r % 2) * 40
                back_person(d, x, y + 140 - abs(k - 7) * 6, 26, (60 + rnd.randint(0, 40), 50, 70))
        cube(d, 380, 1260, 320, 50, 140, (235, 220, 200))   # 讲台
    elif name in ("earth", "voyager", "stars", "universe", "mars", "end"):
        base = {"mars": ((150, 80, 50), (200, 120, 70)), "end": ((8, 8, 12), (8, 8, 12))}.get(name, ((2, 2, 10), (8, 8, 24)))
        im = vgrad(*base); d = ImageDraw.Draw(im)
        if name != "mars" and name != "end":
            for _ in range(1600):
                x, y = rnd.randrange(W), rnd.randrange(H); v = rnd.randint(90, 255)
                d.point((x, y), fill=(v, v, v))
                if rnd.random() < 0.08: d.rectangle([x, y, x + 2, y + 2], fill=(v, v, 255))
        if name == "mars":
            d.rectangle([0, 1100, W, H], fill=(170, 90, 55))
            for _ in range(160):
                x, y = rnd.randrange(W), rnd.randrange(1100, H); s = rnd.randint(6, 30)
                cube(d, x, y, s, s * 0.6, s * 0.6, (130 + rnd.randint(-20, 20), 70, 45))
    elif name == "chicken":
        im = vgrad((250, 170, 110), (230, 120, 90)); d = ImageDraw.Draw(im)
        d.ellipse([380, 260, 700, 580], fill=(255, 220, 150))
        d.rectangle([0, 1150, W, H], fill=(190, 140, 80))
        for k in range(12): d.rectangle([k * 95, 1000, k * 95 + 20, 1200], fill=(130, 80, 50))
        d.rectangle([0, 1040, W, 1060], fill=(130, 80, 50)); d.rectangle([0, 1110, W, 1130], fill=(130, 80, 50))
    elif name == "fish":
        im = vgrad((20, 30, 70), (10, 60, 110)); d = ImageDraw.Draw(im)
        for b in range(12):
            x = b * 95; top = rnd.randint(200, 700)
            d.rectangle([x, top, x + 85, 900], fill=(20, 26, 60))
            for wy in range(top + 10, 890, 24):
                for wx in range(x + 6, x + 80, 18):
                    if rnd.random() < 0.5: d.rectangle([wx, wy, wx + 8, wy + 10], fill=(255, 220, 160))
        d.rectangle([0, 900, W, H], fill=(18, 60, 110))
    elif name == "ants":
        im = vgrad((150, 96, 60), (110, 70, 45)); d = ImageDraw.Draw(im)
        for _ in range(220):
            x, y = rnd.randrange(W), rnd.randrange(H); s = rnd.randint(4, 18)
            d.rectangle([x, y, x + s, y + s], fill=(125 + rnd.randint(-20, 20), 80, 50))
    else:
        im = Image.new("RGB", (W, H), (30, 30, 30))
    _bg[name] = im
    return im

# ---------------------------------------------------------------- 各场景动态部分
def heart_burst(d, t, n, cx, cy, spread, seed, size=(20, 60), col=(255, 92, 140)):
    r = random.Random(seed)
    for i in range(n):
        ph = r.random(); sp = r.uniform(0.25, 0.6)
        k = (t * sp + ph) % 1.0
        x = cx + r.uniform(-spread, spread) + math.sin(t * 2 + i) * 20
        y = cy - k * 900
        s = r.uniform(*size) * (1 - k * 0.4)
        heart(d, x, y, s, mix(col, (255, 200, 220), r.random() * 0.4))

def draw_scene(im, name, lt, dur, sidx):
    d = ImageDraw.Draw(im)
    p = lt / dur
    if name in ("title", "bedroom", "back"):
        sm = 1.0 if name != "back" else 1.0
        person(d, 420, 1180, 150, (232, 150, 160), t=lt)
        heart(d, 420, 560 - 20 * math.sin(lt * 3), 40 + 6 * math.sin(lt * 5))
        cat(d, 560, 1600, 330, lt, mouth=(name == "back" and lt > 2.5 and lt < 3.2))
        if name == "bedroom":
            heart(d, 400, 900 - (lt * 80) % 200, 30)
        if name == "back":
            # 温柔的暖光
            ov = Image.new("RGB", (W, H), (255, 200, 150))
            im.paste(Image.blend(im, ov, 0.12 * ease(p * 2)))
            d = ImageDraw.Draw(im)
            heart(d, 560 + 160, 1000 - lt * 30, 46)
        if name == "title":
            a = ease(lt / 0.5)
            card = [140, 430, 940, 720]
            d.rounded_rectangle(card, 36, fill=(255, 255, 255))
            text_c(d, (540, 520), "假如你家猫", 74, fill=(30, 30, 30))
            text_c(d, (540, 625), "每分钟可爱一倍", 82, fill=(255, 140, 40))
            text_c(d, (540, 790), "会发生什么？", 76, fill=(255, 255, 255), stroke=6, sfill=(40, 30, 30))
    elif name == "courier":
        person(d, 470, 1210, 120, (70, 110, 170), t=lt)
        # 掉落的箱子
        by = 1180 if lt > 1.0 else lerp(880, 1180, ease(lt))
        cube(d, 560, by - 140, 200, 140, 110, (196, 150, 96))
        d.rectangle([650, by - 140, 670, by], fill=(160, 120, 70))
        cat(d, 330, 1620, 260, lt, look=-1)
        heart_burst(d, lt, 14, 470, 900, 200, 3)
    elif name == "gate":
        # 大屏幕
        d.rectangle([330, 300, 750, 900], fill=(227, 211, 238), outline=(30, 30, 40), width=14)
        cat(d, 540, 860, 200, lt)
        heart_burst(d, lt, 10, 540, 800, 180, 7, size=(16, 36))
        r = random.Random(4)
        for k in range(28):
            x = 30 + (k % 14) * 78 + r.randint(-10, 10); row = k // 14
            back_person(d, x, 1500 + row * 160, 40, (r.randint(60, 180), r.randint(40, 90), r.randint(40, 90)))
        person(d, 160, 1700, 70, (40, 50, 80), t=lt, wave_arm=True)   # 保安
        d.rectangle([120, 1440, 240, 1470], fill=(30, 40, 70))
    elif name == "metro":
        r = random.Random(11)
        for k in range(9):
            side = k % 2; depth = k // 2
            s = 110 - depth * 18
            x = (240 - depth * 50) if side == 0 else (840 + depth * 50)
            x = lerp(x, 540, depth * 0.12)
            yb = 1750 - depth * 210
            person(d, x, yb, s, (r.randint(90, 220), r.randint(40, 120), r.randint(40, 100)), face=0)
        # 中间手机屏上的猫
        d.rounded_rectangle([400, 1080, 680, 1560], 24, fill=(20, 20, 24))
        d.rectangle([420, 1110, 660, 1530], fill=(227, 211, 238))
        cat(d, 540, 1470, 140, lt)
        heart_burst(d, lt, 12, 540, 1300, 160, 12, size=(14, 34))
    elif name == "stock":
        # K线 + 猫耳形状
        x0, y0, w0, h0 = 120, 980, 840, 520
        d.rectangle([x0, y0, x0 + w0, y0 + h0], fill=(8, 10, 20), outline=(80, 90, 130), width=4)
        d.text((x0 + 20, y0 + 16), "猫指数  CAT INDEX", font=F(34), fill=(200, 210, 240))
        d.rectangle([x0 + w0 - 190, y0 + 14, x0 + w0 - 20, y0 + 58], fill=(220, 40, 40))
        text_c(d, (x0 + w0 - 105, y0 + 36), "HALTED", 30)
        prof = lambda u: 0.2 + 0.6 * max(0, 1 - abs(u - 0.28) / 0.16) + 0.6 * max(0, 1 - abs(u - 0.72) / 0.16)
        n = 38; shown = int(n * clamp(p * 1.4))
        prev = None
        for i in range(shown):
            u = i / (n - 1); v = prof(u) + math.sin(i * 1.7) * 0.03
            cx = x0 + 40 + u * (w0 - 80); cy = y0 + h0 - 40 - v * (h0 - 140)
            up = prev is None or v >= prev
            col = (230, 60, 60) if up else (40, 200, 110)
            d.rectangle([cx - 7, cy - 22, cx + 7, cy + 22], fill=col); d.line([cx, cy - 36, cx, cy + 36], fill=col, width=2)
            prev = v
        if p > 0.75:
            text_c(d, (540, y0 + h0 - 150), "=^･ω･^=", 60, fill=(255, 220, 230))
        # 塔上的猫广告
        d.rectangle([600, 330, 960, 620], fill=(227, 211, 238), outline=(255, 255, 255), width=6)
        cat(d, 780, 600, 120, lt)
    elif name == "delivery":
        # 外卖骑手停在路边看手机
        d.rectangle([0, 1500, W, H], fill=(40, 40, 50))
        for k in range(3):
            x = 200 + k * 330
            cube(d, x - 90, 1470, 200, 60, 90, (40, 40, 44))                 # 电动车
            d.ellipse([x - 90, 1500, x - 30, 1560], fill=(20, 20, 20)); d.ellipse([x + 60, 1500, x + 120, 1560], fill=(20, 20, 20))
            cube(d, x - 70, 1330, 110, 110, 90, (250, 200, 30))               # 外卖箱
            person(d, x + 40, 1500, 60, (250, 200, 30), t=lt + k)
            d.rectangle([x + 70, 1290, x + 100, 1340], fill=(227, 211, 238))
            heart(d, x + 60, 1240 - (lt * 60 + k * 30) % 120, 26)
        # 评价弹窗
        a = ease((lt - 1.2) / 0.4)
        if a > 0:
            bx = 220; by = lerp(380, 300, a)
            d.rounded_rectangle([bx, by, bx + 640, by + 220], 28, fill=(255, 255, 255))
            text_c(d, (540, by + 60), "订单已超时 47 分钟", 40, fill=(80, 80, 80))
            text_c(d, (540, by + 140), "★★★★★  五星好评", 54, fill=(255, 160, 20))
    elif name == "un":
        d.rectangle([260, 220, 820, 760], fill=(227, 211, 238), outline=(220, 200, 210), width=10)
        cat(d, 540, 740, 290, lt)
        heart_burst(d, lt, 10, 540, 700, 260, 21, size=(18, 40))
        # 投票板
        a = ease((lt - 1.0) / 0.5)
        if a > 0:
            d.rounded_rectangle([300, 820, 910, 960], 20, fill=(20, 30, 70))
            yes = clamp((lt - 1.0) / 2.5)
            d.rectangle([330, 900, 330 + 550 * yes, 935], fill=(255, 120, 160))
            d.text((330, 836), f"先撸猫: {int(yes*100)}%    先开会: 0%", font=F(38), fill=(255, 255, 255))
    elif name in ("earth",):
        # 地球 + 夜晚灯光
        cx, cy, R = 560, 1030, 520
        rot = lt * 0.08
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(8, 14, 34))
        r = random.Random(33)
        for _ in range(2600):
            th = r.uniform(0, math.pi * 2); ph = r.uniform(-1.3, 1.3)
            lon = th + rot
            x3 = math.cos(ph) * math.sin(lon); z3 = math.cos(ph) * math.cos(lon); y3 = math.sin(ph)
            if z3 < 0: continue
            # 大陆形状噪声
            if math.sin(th * 3) * math.cos(ph * 4) + math.sin(th * 7 + 1) * 0.4 < 0.15: continue
            x = cx + x3 * R; y = cy - y3 * R
            b = int(150 + 105 * z3)
            on = ease(p * 1.6 + r.random() * 0.3 - 0.3)
            col = mix((60, 60, 70), (255, 214, 120), on)
            d.rectangle([x, y, x + 3, y + 3], fill=shade(col, b / 255))
        # 大气辉光
        glow = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(glow)
        gd.ellipse([cx - R - 10, cy - R - 10, cx + R + 10, cy + R + 10], outline=120, width=26)
        glow = glow.filter(ImageFilter.GaussianBlur(18))
        im.paste((90, 150, 255), mask=glow)
        d = ImageDraw.Draw(im)
        heart(d, 820, 520, 60)
    elif name == "chicken":
        r = random.Random(35)
        for k in range(10):
            x = 90 + (k % 5) * 210 + (k // 5) * 90; yb = 1300 + (k // 5) * 260
            s = 70 + (k // 5) * 20
            cube(d, x - s * 0.6, yb - s * 1.2, s * 1.2, s * 1.0, s * 0.7, (250, 250, 245))
            cube(d, x + s * 0.2, yb - s * 2.0, s * 0.5, s * 0.8, s * 0.5, (250, 250, 245))
            cube(d, x + s * 0.3, yb - s * 2.25, s * 0.3, s * 0.25, s * 0.3, (220, 40, 40))
            d.polygon([(x + s * 0.7, yb - s * 1.7), (x + s * 0.95, yb - s * 1.6), (x + s * 0.7, yb - s * 1.5)], fill=(250, 170, 40))
            d.rectangle([x + s * 0.45, yb - s * 1.75, x + s * 0.55, yb - s * 1.65], fill=(20, 20, 20))
            heart(d, x + s * 0.4, yb - s * 2.6 - (lt * 40 + k * 17) % 60, 24)
        text_c(d, (760, 420), "zzZ", 70, fill=(255, 255, 255), stroke=4, sfill=(200, 110, 70))
        # 手机墙上播放猫
        d.rounded_rectangle([120, 620, 420, 960], 20, fill=(20, 20, 24))
        d.rectangle([140, 640, 400, 940], fill=(227, 211, 238)); cat(d, 270, 920, 120, lt)
    elif name == "fish":
        # 屏幕(桥上的大屏)
        d.rectangle([300, 560, 780, 860], fill=(227, 211, 238), outline=(240, 240, 255), width=8)
        cat(d, 540, 850, 150, lt)
        r = random.Random(42)
        for k in range(40):
            row = k // 8; col = k % 8
            x = 70 + col * 125 + (row % 2) * 60 + math.sin(lt * 2 + k) * 6
            y = 1000 + row * 160 + math.sin(lt * 3 + k * 0.7) * 8
            c = [(240, 120, 60), (230, 210, 210), (250, 170, 40), (200, 80, 80)][k % 4]
            # 鱼头朝上露出水面
            d.polygon([(x - 30, y + 50), (x + 30, y + 50), (x, y - 40)], fill=c)
            d.rectangle([x - 8, y - 6, x - 1, y + 1], fill=(20, 20, 20)); d.rectangle([x + 2, y - 6, x + 9, y + 1], fill=(20, 20, 20))
            d.line([x - 40, y + 50, x + 40, y + 50], fill=(120, 170, 230), width=4)
        heart_burst(d, lt, 14, 540, 1100, 450, 43, size=(18, 40))
    elif name == "ants":
        # 蚂蚁排成爱心
        n = 220
        cx, cy, sc = 540, 1050, 26
        r = random.Random(55)
        form = ease(p * 1.5)
        for i in range(n):
            u = i / n * 2 * math.pi
            hx = 16 * math.sin(u) ** 3; hy = -(13 * math.cos(u) - 5 * math.cos(2 * u) - 2 * math.cos(3 * u) - math.cos(4 * u))
            sx, sy = r.uniform(0, W), r.uniform(300, H)
            x = lerp(sx, cx + hx * sc, form); y = lerp(sy, cy + hy * sc, form)
            d.ellipse([x - 7, y - 5, x + 7, y + 5], fill=(25, 15, 12)); d.ellipse([x + 4, y - 4, x + 11, y + 3], fill=(25, 15, 12))
        # 中间一张猫的照片
        d.rectangle([400, 900, 680, 1180], fill=(255, 255, 255)); d.rectangle([414, 914, 666, 1140], fill=(227, 211, 238))
        cat(d, 540, 1130, 120, lt)
        # 被丢下的面包屑
        for k in range(6): cube(d, 150 + k * 140, 1650, 26, 18, 18, (240, 220, 170))
    elif name == "mars":
        # 火星车
        rot = ease((lt - 0.6) / 1.4)
        x = 540
        cube(d, x - 300, 1180, 600, 160, 200, (190, 190, 186))
        for k in range(3):
            d.ellipse([x - 300 + k * 230, 1320, x - 180 + k * 230, 1440], fill=(40, 40, 44))
        d.rectangle([x + 60, 760, x + 100, 1180], fill=(170, 170, 166))
        # 相机头(转向镜头)
        cw = lerp(80, 220, rot)
        cube(d, x + 80 - cw / 2, 640, cw, 130, 120, (215, 215, 210))
        if rot > 0.5:
            d.ellipse([x + 80 - 40, 665, x + 80 + 40, 745], fill=(20, 30, 50)); d.ellipse([x + 70, 685, x + 90, 705], fill=(120, 180, 255))
        if lt > 2.6:
            fl = clamp(1 - (lt - 2.6) * 3)
            if fl > 0: im.paste(Image.blend(im, Image.new("RGB", (W, H), (255, 255, 255)), fl * 0.8)); d = ImageDraw.Draw(im)
            if lt > 2.8:
                d.rectangle([600, 300, 960, 600], fill=(255, 255, 255)); d.rectangle([620, 320, 940, 560], fill=(227, 211, 238))
                cat(d, 780, 550, 110, lt)
    elif name == "voyager":
        # 旅行者号：天线盘 + 杆
        ang = ease((lt - 0.4) / 1.6)
        cx, cy = 560, 980
        R = 300
        sx = lerp(0.25, 1.0, ang)
        d.ellipse([cx - R * sx, cy - R, cx + R * sx, cy + R], fill=(220, 220, 225), outline=(150, 150, 160), width=6)
        d.ellipse([cx - R * sx * 0.6, cy - R * 0.6, cx + R * sx * 0.6, cy + R * 0.6], fill=(190, 190, 200))
        d.line([cx, cy, cx + lerp(260, 40, ang), cy - 360], fill=(200, 200, 210), width=8)
        d.line([cx, cy + 40, cx - 400, cy + 280], fill=(180, 160, 120), width=10)
        cube(d, cx - 60, cy + 220, 120, 80, 60, (200, 170, 90))
        if lt > 2.4:
            a = clamp((lt - 2.4) / 1.0)
            heart_burst(d, lt, int(30 * a), 560, 900, 220, 66, size=(14, 42))
            text_c(d, (560, 540), "暗淡蓝点 → 暗淡猫点", 50, fill=(200, 220, 255))
    elif name == "stars":
        # 星星连成猫脸
        a = ease(p * 1.5)
        r = random.Random(76)
        cx, cy = 540, 1000
        pts = []
        for i in range(200):  # 脸轮廓
            u = i / 200 * 2 * math.pi; pts.append((cx + 380 * math.cos(u), cy + 320 * math.sin(u)))
        for side in (-1, 1):  # 耳朵
            for i in range(40):
                k = i / 40
                pts.append((cx + side * lerp(330, 300, k), cy - lerp(160, 470, k)))
                pts.append((cx + side * lerp(300, 110, k), cy - lerp(470, 300, k)))
            for i in range(60):  # 眼睛
                u = i / 60 * 2 * math.pi; pts.append((cx + side * 150 + 70 * math.cos(u), cy - 20 + 70 * math.sin(u)))
            for i in range(30):  # 胡须
                k = i / 30
                pts.append((cx + side * lerp(200, 480, k), cy + 120 + k * 10)); pts.append((cx + side * lerp(200, 470, k), cy + 170 + k * 40))
        for i in range(40):
            u = i / 40 * math.pi; pts.append((cx + 60 * math.cos(u) - 60, cy + 140 + 40 * math.sin(u))); pts.append((cx + 60 * math.cos(u) + 60, cy + 140 + 40 * math.sin(u)))
        for (x, y) in pts:
            sx, sy = r.uniform(0, W), r.uniform(0, H)
            X = lerp(sx, x, a) + r.uniform(-3, 3); Y = lerp(sy, y, a) + r.uniform(-3, 3)
            v = r.randint(200, 255); s = r.choice((2, 3, 4))
            d.rectangle([X, Y, X + s, Y + s], fill=(v, v, 255))
        if a > 0.9:
            for side in (-1, 1): d.ellipse([cx + side * 150 - 26, cy - 46, cx + side * 150 + 26, cy + 6], fill=(255, 255, 255))
        # 旋涡星系
        for g in range(3):
            gx, gy = [(150, 400), (930, 600), (180, 1650)][g]
            for i in range(80):
                u = i * 0.25 + lt; rr = i * 1.4
                d.point((gx + rr * math.cos(u), gy + rr * math.sin(u) * 0.6), fill=(180, 160, 255))
    elif name == "universe":
        # 金色光团 + 星尘
        R = 120 + 40 * math.sin(lt * 2)
        glow = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(glow)
        gd.ellipse([780 - R * 2, 1000 - R * 2, 780 + R * 2, 1000 + R * 2], fill=200)
        glow = glow.filter(ImageFilter.GaussianBlur(80))
        im.paste((255, 214, 150), mask=glow)
        d = ImageDraw.Draw(im)
        r = random.Random(90)
        for i in range(900):
            ang = r.uniform(0, 2 * math.pi); rad = r.uniform(80, 900) * (1 + 0.15 * lt)
            x = 780 + math.cos(ang + lt * 0.2) * rad; y = 1000 + math.sin(ang + lt * 0.2) * rad * 0.8
            v = r.randint(140, 255); d.point((x, y), fill=(v, int(v * 0.85), int(v * 0.5)))
        text_c(d, (540, 560), "2^76 = 75,557,863,725,914,323,419,136", 40, fill=(255, 230, 170))
    elif name == "end":
        a = ease(lt / 0.8)
        c = int(255 * a)
        text_c(d, (540, 900), "不管别人家的猫多可爱，", 62, fill=(c, c, c))
        text_c(d, (540, 1000), "还是自己家的最好。", 62, fill=(c, int(c * 0.75), int(c * 0.8)))
        heart(d, 540, 1140, 70 * a + 1)
    return d

# ---------------------------------------------------------------- HUD / 字幕 / 弹幕
def draw_hud(d, sc, lt, dur):
    _, name, m0, m1, unit, cap, en, desc, side = sc
    if name in ("title", "end"): return
    p = clamp(lt / (dur * 0.85))
    mins = lerp(m0, m1, ease(p))
    val = 2 ** mins
    x, y = 30, 560
    text_c(d, (x, y), "猫可爱度", 46, anchor="lm", stroke=3, sfill=(0, 0, 0))
    d.text((x, y + 34), "C U T E N E S S", font=F(20), fill=(220, 220, 220), anchor="lm")
    num = fmt_num(val) if name != "back" else "1"
    if "×10^" in num:
        mant, ex = num.split("×10^")
        d.text((x, y + 110), mant + "×10", font=F(96), fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0), anchor="lm")
        w = d.textlength(mant + "×10", font=F(96))
        d.text((x + w + 4, y + 70), ex, font=F(44), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="lm")
        w += d.textlength(ex, font=F(44)) + 14
    else:
        d.text((x, y + 110), num, font=F(96), fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0), anchor="lm")
        w = d.textlength(num, font=F(96)) + 10
    d.text((x + w, y + 128), unit, font=F(40), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="lm")
    for i, line in enumerate([desc, f"副作用: {side}", f"被萌倒数: 2^{int(round(mins)) if name!='back' else 0}"]):
        d.text((x, y + 186 + i * 40), line, font=F(32), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="lm")
    d.rounded_rectangle([x, y + 300, x + 210, y + 346], 23, fill=(225, 40, 50))
    d.text((x + 105, y + 323), "×2 每分钟", font=F(30), fill=(255, 255, 255), anchor="mm")

def draw_caption(d, sc, lt):
    cap, en = sc[5], sc[6]
    if not cap: return
    a = ease(lt / 0.25)
    lines = cap.split("\n")
    y0 = 1500 - (len(lines) - 1) * 40 + (1 - a) * 30
    fs = 66
    while fs > 40 and max(d.textlength(l, font=F(fs)) for l in lines) > 1000: fs -= 2
    for i, line in enumerate(lines):
        d.text((540, y0 + i * 82), line, font=F(fs), fill=(255, 222, 40), stroke_width=7, stroke_fill=(40, 20, 10), anchor="mm")
    d.text((540, y0 + len(lines) * 82 - 20), en, font=F(28), fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0), anchor="mm")

def draw_danmaku(d, gt, start=STARTS[13], end=STARTS[16]):
    if gt < start or gt > end: return
    dens = clamp((gt - start) / 6)
    r = random.Random(2026)
    for i in range(60):
        t0 = start + r.uniform(-2, end - start)
        sp = r.uniform(260, 420)
        x = W - (gt - t0) * sp
        if x < -500 or x > W: continue
        if r.random() > dens: continue
        y = 130 + r.randint(0, 7) * 50
        col = r.choice([(255, 255, 255), (255, 230, 120), (140, 230, 255), (255, 150, 190), (160, 255, 160)])
        d.text((x, y), r.choice(DANMAKU), font=F(38), fill=col, stroke_width=2, stroke_fill=(0, 0, 0))

def scene_at(gt):
    for i in range(len(SCENES) - 1, -1, -1):
        if gt >= STARTS[i]: return i
    return 0

def render_frame(fi):
    gt = fi / FPS
    i = scene_at(gt); sc = SCENES[i]; lt = gt - STARTS[i]; dur = sc[0]
    name = sc[1]
    im = bg(name).copy()
    # 轻微推镜
    zoom = 1 + 0.04 * (lt / dur)
    if name not in ("end",):
        nw, nh = int(W * zoom), int(H * zoom)
    draw_scene(im, name, lt, dur, i)
    if zoom > 1.001 and name not in ("end", "title"):
        nw, nh = int(W * zoom), int(H * zoom)
        im = im.resize((nw, nh), Image.BILINEAR).crop(((nw - W) // 2, (nh - H) // 2, (nw - W) // 2 + W, (nh - H) // 2 + H))
    d = ImageDraw.Draw(im)
    draw_hud(d, sc, lt, dur)
    draw_caption(d, sc, lt)
    draw_danmaku(d, gt)
    # 转场：白闪 / 淡入
    if lt < 0.15 and i > 0:
        k = 1 - lt / 0.15
        im = Image.blend(im, Image.new("RGB", (W, H), (255, 255, 255) if name not in ("end", "back") else (0, 0, 0)), k * 0.7)
    if i == len(SCENES) - 1 and lt > dur - 0.8:
        im = Image.blend(im, Image.new("RGB", (W, H), (0, 0, 0)), clamp((lt - dur + 0.8) / 0.8))
    return im.tobytes()

# ---------------------------------------------------------------- 配乐 (程序合成)
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
        env = np.minimum(1, t / 0.01) * np.exp(-t * (3.5 if kind != "sin" else 2.2))
        return s * env
    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    back_t = STARTS[16]
    # 主段：欢快 C 大调五声音阶，越往后越快
    melody = [72, 76, 79, 76, 81, 79, 76, 74, 72, 74, 76, 79, 76, 74, 72, 67]
    chords = [(48, 55, 64), (45, 52, 60), (41, 48, 57), (43, 50, 59)]
    t = 0.0; step = 0
    while t < back_t - 0.3:
        bpm = 112 + 40 * (t / back_t)
        beat = 60 / bpm / 2
        add(note(mtof(melody[step % 16]), beat * 1.8, "sq"), t, 0.10)
        if step % 4 == 0:
            ch = chords[(step // 8) % 4]
            for m in ch: add(note(mtof(m), beat * 4, "tri"), t, 0.08)
        if step % 2 == 0:  # 鼓点
            k = tt(0.12); add(np.sin(2 * np.pi * (90 * np.exp(-k * 25)) * k * 6) * np.exp(-k * 30), t, 0.35 if step % 4 == 0 else 0.0)
            hh = np.random.default_rng(step).standard_normal(int(0.04 * sr)) * np.exp(-tt(0.04) * 80); add(hh, t + beat, 0.05)
        t += beat; step += 1
    # 每个场景切换：叮！
    for i, s0 in enumerate(STARTS[1:16], 1):
        add(note(mtof(96), 0.5, "sin"), s0, 0.12); add(note(mtof(103), 0.5, "sin"), s0 + 0.07, 0.10)
    # 收尾：温柔钢琴感
    soft = [(64, 67, 72), (62, 65, 69), (60, 64, 67), (60, 64, 67, 72)]
    for k, ch in enumerate(soft):
        for j, m in enumerate(ch):
            add(note(mtof(m), 3.0, "sin"), back_t + k * 2.4 + j * 0.12, 0.09)
    # 淡出
    fade = int(1.0 * sr); end = int(TOTAL * sr)
    out[end - fade:end] *= np.linspace(1, 0, fade); out[end:] = 0
    out = out[:end]
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.85
    pcm = (out * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())

# ---------------------------------------------------------------- 主程序
def main():
    preview = "--preview" in sys.argv
    if preview:
        for i, s0 in enumerate(STARTS):
            Image.frombytes("RGB", (W, H), render_frame(int((s0 + SCENES[i][0] * 0.7) * FPS))).resize((360, 640)).save(f"{OUT}/prev_{i:02d}.png")
        print("preview ok"); return
    wav = os.path.join(OUT, "music.wav"); synth_audio(wav)
    mp4 = os.path.join(OUT, "cat_cuteness.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                           "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4], stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for k, buf in enumerate(pool.imap(render_frame, range(NFRAMES), chunksize=8)):
            ff.stdin.write(buf)
            if k % 300 == 0: print(f"{k}/{NFRAMES}", flush=True)
    ff.stdin.close(); ff.wait()
    print("done ->", mp4, f"{TOTAL:.1f}s")

if __name__ == "__main__":
    main()
