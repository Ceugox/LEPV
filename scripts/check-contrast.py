"""Razoes WCAG dos pares de token em uso. Sai 1 se algum par falhar AA.

Rodar sempre que um token de cor mudar. A tabela da secao 6.1 do spec e a
saida deste script; nao conferir contraste de olho.
"""
import sys


def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(hx):
    hx = hx.lstrip("#")
    r, g, b = (int(hx[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def over(fg, alpha, bg):
    """Cor resultante de fg com alfa sobre bg opaco."""
    fh, bh = fg.lstrip("#"), bg.lstrip("#")
    return "#%02X%02X%02X" % tuple(
        round(int(fh[i:i + 2], 16) * alpha + int(bh[i:i + 2], 16) * (1 - alpha))
        for i in (0, 2, 4)
    )


T = {
    "paper": "#FAF8F5", "paper-2": "#F3EFE9", "card": "#FFFFFF", "band": "#0A0A0B",
    "ink": "#121214", "ink-2": "#3D3940", "ink-3": "#736D77",
    "wine": "#7F0A1A", "wine-2": "#9E1F30", "white": "#FFFFFF",
    "danger": "#991B1B", "danger-soft": "#FEEBEB",
}

PAIRS = [
    ("ink", "paper"), ("ink", "card"),
    ("ink-2", "paper"), ("ink-2", "card"),
    ("ink-3", "paper"), ("ink-3", "card"),
    ("wine", "paper"), ("wine", "paper-2"), ("wine-2", "paper"),
    ("white", "wine"), ("paper", "band"),
    ("danger", "danger-soft"),
]

fails = 0
print(f"{'par':34s} {'razao':>6s}  AA-normal")
print("-" * 54)
for a, b in PAIRS:
    r = ratio(T[a], T[b])
    ok = r >= 4.5
    if not ok:
        fails += 1
    print(f"{a + ' / ' + b:34s} {r:6.2f}  {'passa' if ok else 'FALHA'}")

# rotulo do marquee: branco translucido sobre o band
lab = over("#FFFFFF", 0.55, T["band"])
r = ratio(lab, T["band"])
ok = r >= 4.5
if not ok:
    fails += 1
print(f"{'marquee (branco 55%) / band':34s} {r:6.2f}  {'passa' if ok else 'FALHA'}")

print(f"\n{fails} par(es) abaixo de AA")
sys.exit(1 if fails else 0)
