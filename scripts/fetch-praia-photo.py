"""Baixa e prepara a fotografia de arquivo da Praia Vermelha.

Fonte: Wikimedia Commons, "Praia Vermelha e Botafogo - tomada do Morro da
Urca (013RJ009012).jpg" — acervo do Centro de Documentacao e Memoria da
Brascan / Instituto Moreira Salles, DOMINIO PUBLICO.

O arquivo original e uma reproducao da pagina de album: tem moldura preta e
legenda manuscrita. Este script recorta a area da fotografia, converte para
tons de cinza (o CSS aplicaria grayscale de todo jeito, e salvar em cinza
corta ~40% do peso) e gera as duas larguras do srcset.

Roda uma vez; o resultado e versionado em public/assets/.
"""
import json
import os
import urllib.parse
import urllib.request

from PIL import Image

TITLE = "Praia Vermelha e Botafogo - tomada do Morro da Urca (013RJ009012).jpg"
UA = {"User-Agent": "LEPV-site/1.0 (https://lepv.org)"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets")
TMP = os.path.join(ROOT, ".praia-src.jpg")

# Recorte da area da fotografia dentro da moldura do album, medido sobre a
# reproducao de 3840x3370 que o Commons entrega como thumb maximo.
CROP = (519, 452, 3342, 2478)


def api(**params):
    params.setdefault("action", "query")
    params.setdefault("format", "json")
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300))


def main():
    d = api(titles="File:" + TITLE, prop="imageinfo",
            iiprop="url|size|extmetadata", iiurlwidth="3840")
    pages = (d.get("query") or {}).get("pages") or {}
    info = None
    for p in pages.values():
        info = (p.get("imageinfo") or [None])[0]
    if not info:
        raise SystemExit("arquivo nao encontrado no Commons")

    lic = ((info.get("extmetadata") or {}).get("LicenseShortName") or {}).get("value", "?")
    print(f"origem: {info['width']}x{info['height']}  licenca: {lic}")
    print(f"pagina: {info['descriptionurl']}")

    with open(TMP, "wb") as f:
        f.write(urllib.request.urlopen(
            urllib.request.Request(info["thumburl"], headers=UA), timeout=600).read())

    im = Image.open(TMP).convert("RGB")
    if im.size != (3840, 3370):
        print(f"AVISO: reproducao veio {im.size}, e o recorte foi medido em "
              f"(3840, 3370). Conferir CROP antes de confiar no resultado.")
    gray = im.crop(CROP).convert("L")
    print("area da fotografia:", gray.size)

    os.makedirs(OUT, exist_ok=True)
    for w, name, q in ((1800, "praia-vermelha.jpg", 74),
                       (900, "praia-vermelha-900.jpg", 70)):
        h = round(w * gray.size[1] / gray.size[0])
        path = os.path.join(OUT, name)
        gray.resize((w, h), Image.LANCZOS).save(
            path, "JPEG", quality=q, optimize=True, progressive=True)
        print(f"{name}: {w}x{h}  {os.path.getsize(path)/1024:.0f} KB")

    os.remove(TMP)


if __name__ == "__main__":
    main()
