"""Procura CSS quebrado nos arquivos servidos.

Motivo: editar CSS por regex deixa restos. Numa remocao de bloco sobrou
`section.blk + ` orfao antes de um comentario, e o seletor seguinte foi
engolido — `section.blk + .entry`. Isso nao gera erro em lugar nenhum: o
browser aplica o seletor errado e segue. So aparece quando o estilo some.

Nao e um parser de CSS completo. Cobre os restos que a edicao por script
produz de verdade:
  - seletor terminando em combinador (+ > ~ ,) antes do bloco
  - chaves desbalanceadas
  - propriedade sem valor
  - regra vazia

Sai 1 se achar qualquer coisa.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALVOS = [
    os.path.join("public", "styles.css"),
    os.path.join("public", "home.html"),
    os.path.join("public", "app.html"),
    os.path.join("public", "login.html"),
    os.path.join("public", "inscricao.html"),
    os.path.join("public", "presenca.html"),
]

problemas = 0


def blocos_de_css(texto, arquivo):
    """Devolve (css, deslocamento_de_linha) de cada bloco relevante."""
    if arquivo.endswith(".css"):
        return [(texto, 0)]
    saida = []
    for m in re.finditer(r"<style[^>]*>(.*?)</style>", texto, re.S):
        linha = texto[: m.start(1)].count("\n")
        saida.append((m.group(1), linha))
    return saida


def limpa_comentarios(css):
    """Troca comentario por espacos, preservando as quebras de linha."""
    def sub(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    return re.sub(r"/\*.*?\*/", sub, css, flags=re.S)


for rel in ALVOS:
    caminho = os.path.join(ROOT, rel)
    if not os.path.exists(caminho):
        continue
    bruto = io.open(caminho, encoding="utf-8").read()

    for css, offset in blocos_de_css(bruto, rel):
        limpo = limpa_comentarios(css)

        # 1) chaves desbalanceadas
        if limpo.count("{") != limpo.count("}"):
            print(f"  FALHA {rel}: {limpo.count('{')} abre-chaves x "
                  f"{limpo.count('}')} fecha-chaves")
            problemas += 1

        # 2) seletor terminando em combinador — o resto tipico de edicao
        for m in re.finditer(r"([^{}]*?)\{", limpo):
            sel = m.group(1).strip()
            if not sel:
                continue
            if sel[-1] in "+>~,":
                linha = offset + limpo[: m.start(1)].count("\n") + 1
                print(f"  FALHA {rel}:{linha}: seletor termina em "
                      f"combinador '{sel[-1]}' -> {sel[-60:]!r}")
                problemas += 1

        # 3) propriedade sem valor e regra vazia
        for m in re.finditer(r"\{([^{}]*)\}", limpo):
            corpo = m.group(1).strip()
            linha = offset + limpo[: m.start(1)].count("\n") + 1
            if not corpo:
                print(f"  FALHA {rel}:{linha}: regra vazia")
                problemas += 1
                continue
            for decl in corpo.split(";"):
                d = decl.strip()
                if not d:
                    continue
                if ":" not in d:
                    print(f"  FALHA {rel}:{linha}: declaracao sem valor -> {d[:50]!r}")
                    problemas += 1
                else:
                    nome, valor = d.split(":", 1)
                    if not valor.strip():
                        print(f"  FALHA {rel}:{linha}: '{nome.strip()}' sem valor")
                        problemas += 1

    print(f"  ok    {rel}")

print(f"\n{problemas} problema(s) de sintaxe" if problemas else "\nCSS OK")
sys.exit(1 if problemas else 0)
