"""產生程式圖示：web/assets/icon.png（1024）、icon-256.png、packaging/icon.ico。

資料助秘系列的深藍到青綠圓角方塊；中間是一本打開的書，右頁的一角正在掀起來（本程式的翻頁特色），
上方「電子書翻頁」標題列，左下角「資料助秘」標籤。字型用 tools/fonts/NotoSansTC-VF.ttf（思源黑體，OFL）。
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(size, weight="Black"):
    for p in (os.path.join(HERE, "tools", "fonts", "NotoSansTC-VF.ttf"), r"C:\Windows\Fonts\msjhbd.ttc"):
        try:
            f = ImageFont.truetype(p, size)
            try:
                f.set_variation_by_name(weight)
            except Exception:
                pass
            return f
        except Exception:
            continue
    return ImageFont.load_default()


def blur_shadow(img, poly_fn, blur=18, alpha=110, offset=(10, 18)):
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    poly_fn(ImageDraw.Draw(sh), offset, (0, 0, 0, alpha))
    return Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(blur)))


def page_lines(d, x0, x1, y0, n, gap, col, short_last=True):
    for k in range(n):
        y = y0 + k * gap
        xe = x1 - (x1 - x0) * (0.35 if short_last and k == n - 1 else 0)
        d.rounded_rectangle([x0, y, xe, y + 14], radius=7, fill=col)


def main():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp((15, 60, 110), (14, 150, 120), y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
    img.paste(grad, (0, 0), mask)
    gloss = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse([-200, -520, S + 200, 420], fill=(255, 255, 255, 34))
    img = Image.alpha_composite(img, Image.composite(gloss, Image.new("RGBA", (S, S)), mask))

    # 打開的書：左右兩頁＋書背
    cx, top, bot = 512, 330, 810
    L = [(140, top + 40), (cx, top), (cx, bot), (140, bot + 30)]
    R = [(cx, top), (884, top + 40), (884, bot + 30), (cx, bot)]
    img = blur_shadow(img, lambda d, o, f: d.polygon([(x + o[0], y + o[1]) for x, y in L + R[1:3]], fill=f), blur=22, alpha=130)
    d = ImageDraw.Draw(img)
    # 封面（深藍色書皮，比紙大一點）
    d.polygon([(124, top + 52), (cx, top + 16), (900, top + 52), (900, bot + 50), (cx, bot + 24), (124, bot + 50)], fill=(18, 52, 96, 255))
    d.polygon(L, fill=(252, 250, 244, 255))
    d.polygon(R, fill=(255, 253, 248, 255))
    # 書背陰影
    for k in range(40):
        a = int(90 * (1 - k / 40))
        d.line([(cx - k, top), (cx - k, bot)], fill=(0, 0, 0, a // 3))
        d.line([(cx + k, top), (cx + k, bot)], fill=(0, 0, 0, a // 3))
    # 左頁：圖片＋文字
    d.rounded_rectangle([190, 410, 450, 560], radius=14, fill=(120, 196, 255, 255))
    d.polygon([(190, 560), (270, 470), (340, 530), (390, 490), (450, 560)], fill=(76, 175, 80, 255))
    d.ellipse([390, 425, 430, 465], fill=(255, 214, 90, 255))
    page_lines(d, 190, 450, 600, 4, 40, (150, 160, 175, 255))
    # 右頁：文字
    page_lines(d, 570, 830, 410, 6, 40, (150, 160, 175, 255))

    # 右下角掀起來：摺線把角切掉，翻起的那片（背面）往左上翻
    C = (884, bot + 30)            # 頁角
    M = (700, 650)                 # 被拉到的位置
    P = ((C[0] + M[0]) / 2, (C[1] + M[1]) / 2)
    n = (C[0] - M[0], C[1] - M[1])
    ln = math.hypot(*n)
    n = (n[0] / ln, n[1] / ln)
    dv = (-n[1], n[0])
    # 摺線與頁面右邊、下邊的交點
    def inter_x(x):
        t = (x - P[0]) / dv[0]
        return (x, P[1] + dv[1] * t)

    def inter_bottom():
        # 下邊從 (cx,bot) 到 C 的直線：y = bot + (x-cx)/(884-cx)*30
        for t in [i / 400 for i in range(401)]:
            x = cx + (884 - cx) * t
            y = bot + 30 * t
            if (x - P[0]) * n[0] + (y - P[1]) * n[1] >= 0:
                return (x, y)
        return (cx, bot)
    A = inter_x(884)
    B = inter_bottom()
    # 掀開處露出下一頁（淡藍灰）＋陰影
    under = [A, C, B]
    d.polygon(under, fill=(226, 232, 240, 255))
    # 翻起的那片＝把三角形 A-C-B 沿摺線鏡射
    def refl(p):
        k = 2 * ((p[0] - P[0]) * n[0] + (p[1] - P[1]) * n[1])
        return (p[0] - k * n[0], p[1] - k * n[1])
    flap = [A, refl(C), B]
    img = blur_shadow(img, lambda dd, o, f: dd.polygon([(x + o[0], y + o[1]) for x, y in flap], fill=f), blur=14, alpha=120, offset=(-6, 10))
    d = ImageDraw.Draw(img)
    fl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fl)
    fd.polygon(flap, fill=(255, 255, 255, 255))
    # 背面的光影漸層
    g = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gdr = ImageDraw.Draw(g)
    for k in range(120):
        t = k / 120
        off = (P[0] - n[0] * k * 1.6, P[1] - n[1] * k * 1.6)
        col = lerp((200, 205, 215), (250, 250, 252), min(1, t * 2.2))
        gdr.line([(off[0] - dv[0] * 400, off[1] - dv[1] * 400), (off[0] + dv[0] * 400, off[1] + dv[1] * 400)], fill=col + (255,), width=3)
    flap_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(flap_mask).polygon(flap, fill=255)
    img.paste(g, (0, 0), flap_mask)
    d = ImageDraw.Draw(img)
    d.line([A, B], fill=(170, 175, 185, 255), width=4)

    # 標題列「電子書翻頁」
    img = blur_shadow(img, lambda dd, o, f: dd.rounded_rectangle([150 + o[0], 96 + o[1], 874 + o[0], 236 + o[1]], radius=50, fill=f), blur=14, alpha=90)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([150, 96, 874, 236], radius=50, fill=(30, 77, 140, 255), outline=(120, 170, 230, 255), width=6)
    d.text((512, 162), "電子書翻頁", font=font(92), fill=(255, 255, 255, 255), anchor="mm")
    # 左下「資料助秘」
    d.rounded_rectangle([96, 862, 470, 952], radius=34, fill=(255, 255, 255, 235))
    d.text((283, 905), "資料助秘", font=font(56), fill=(15, 74, 117, 255), anchor="mm")

    os.makedirs(os.path.join(HERE, "web", "assets"), exist_ok=True)
    img.save(os.path.join(HERE, "web", "assets", "icon.png"))
    img.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, "web", "assets", "icon-256.png"))
    img.resize((180, 180), Image.LANCZOS).save(os.path.join(HERE, "web", "assets", "icon-180.png"))
    os.makedirs(os.path.join(HERE, "packaging"), exist_ok=True)
    img.save(os.path.join(HERE, "packaging", "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("ok")


if __name__ == "__main__":
    main()
