"""Deriva os assets web da marca a partir de marketing/logo.jpeg.

A arte foi achatada sobre fundo branco. Se observado = C*a + 255*(1-a),
entao a = (255 - min(canal))/255 recupera bem tanto o preto da engrenagem
quanto o vinho saturado, e dai desfazemos a mistura para achar C.

Requer Pillow. Roda uma vez; o resultado e versionado em public/assets/.
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "marketing", "logo.jpeg")
OUT = os.path.join(ROOT, "public", "assets")
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
w, h = im.size
src = im.load()

out = Image.new("RGBA", (w, h))
dst = out.load()
for y in range(h):
    for x in range(w):
        r, g, b = src[x, y]
        a = 255 - min(r, g, b)
        if a <= 6:                       # papel: descarta
            dst[x, y] = (0, 0, 0, 0)
            continue
        af = a / 255.0
        dst[x, y] = (
            int(max(0, min(255, (r - 255 * (1 - af)) / af))),
            int(max(0, min(255, (g - 255 * (1 - af)) / af))),
            int(max(0, min(255, (b - 255 * (1 - af)) / af))),
            a,
        )

out = out.crop(out.getbbox())
full = out.resize((1024, round(1024 * out.size[1] / out.size[0])), Image.LANCZOS)
full.save(os.path.join(OUT, "logo-mark.png"))
print("logo-mark.png", full.size)

fp = full.load()
for name, rgb in (("logo-mark-white.png", (255, 255, 255)),
                  ("logo-mark-ink.png", (18, 18, 20))):
    mono = Image.new("RGBA", full.size)
    mp = mono.load()
    for y in range(full.size[1]):
        for x in range(full.size[0]):
            mp[x, y] = rgb + (fp[x, y][3],)
    mono.save(os.path.join(OUT, name))
    print(name, mono.size)
