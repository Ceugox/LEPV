/* P5 · Diário de bordo — capítulos com numerais romanos e livro-caixa. */
(function () {
  var D = LEPV_DATA;
  function $(id) { return document.getElementById(id); }
  function cap(rn, titulo, nota, fim) {
    return '<div class="cap"><div class="k"><span class="rn">' + rn + ".</span><h1>" + titulo + '</h1><span class="fim">' + (fim || "") + "</span></div>" +
      (nota ? "<p>" + nota + "</p>" : "") + "</div>";
  }
  function bh(titulo, fn) {
    return '<div class="bh"><h2>' + titulo + '</h2><span class="rr"></span><span class="fn">' + (fn || "") + "</span></div>";
  }

  var RN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  var grupos = [
    { nome: "A liga", abas: [["inicio","Início"],["eventos","Eventos"],["membros","Membros"],["gastos","Gastos"],["diretoria","Diretoria"],["acessos","Acessos"]] },
    { nome: "Acervo da imersão", abas: [["legado","Legado"],["empresas","Empresas"],["selos","Selos"],["roteiro","Roteiro"],["missao","A missão"],["arquivo","Arquivo"]] },
  ];
  var ri = 0;
  $("nav").innerHTML = grupos.map(function (g) {
    return '<div class="navgrp"><div class="gt">' + g.nome + "</div>" + g.abas.map(function (a) {
      var rn = RN[ri]; ri += 1;
      return '<button data-tab="' + a[0] + '" aria-selected="false"><span class="rn">' + rn + "</span>" + a[1] + '<span class="pt">●</span></button>';
    }).join("") + "</div>";
  }).join("");

  /* ---------- Início ---------- */
  $("p-inicio").innerHTML =
    cap("I", "A liga em <i>folha corrida</i>", "O que aconteceu, o que vem aí e quem sustenta — aberto na data de hoje.", "qua · 30/09/2026") +
    '<div class="zahlen">' +
      '<div class="z"><b>11</b><span>Membros ativos</span></div>' +
      '<div class="z"><b><i>XVII</i>–XXX</b><span>Turmas na liga</span></div>' +
      '<div class="z"><b>12</b><span>Empresas na rede</span></div>' +
      '<div class="z"><b>1<i>ª</i></b><span>Imersão · SP 2026</span></div>' +
    "</div>" +
    '<div class="blk">' + bh("Edital da semana", D.mural.length + " avisos") +
      '<div class="edital">' +
        D.mural.map(function (m, i) {
          return '<div class="item"><span class="rn">§' + (i + 1) + "</span><div><span class=\"tipo\">" + m.tipo + "</span><b>" + m.titulo + "</b><p>" + m.texto + "</p></div></div>";
        }).join("") +
      "</div></div>" +
    '<div class="blk">' + bh("O que a liga faz") +
      '<div class="razao">' +
        D.atividades.map(function (a) { return '<div class="lx"><span class="t">' + a + '</span><span class="dots"></span><span class="v" style="font-weight:400;color:var(--ink-3)">semanal</span></div>'; }).join("") +
      "</div></div>" +
    '<div class="blk">' + bh("As 12 casas que nos abriram as portas") +
      '<p style="font-family:var(--fd);font-size:19px;line-height:1.5;color:var(--ink);margin:0;max-width:40ch">' +
        D.empresas.map(function (e) { return e.nome; }).join(" · ") +
      "</p></div>";

  /* ---------- Eventos ---------- */
  $("p-eventos").innerHTML =
    cap("II", "Agenda <i>dos próximos</i>", "Reunião, aula, visita e social — cada um nasce aviso, pode abrir inscrição e tem presença que abre no dia.", "outubro") +
    D.eventos.filter(function (e) { return e.inscricao === "aberta"; }).map(function (e) {
      return '<div class="ev"><span class="k">' + e.tipo + "</span><h3><a href=\"#\">" + e.titulo + "</a></h3>" +
        '<div class="meta">' + e.data + "<br>" + e.local + (e.vagas ? "<br>" + e.vagas : "") + "</div></div>";
    }).join("") +
    '<div class="blk" style="margin-top:30px">' + bh("Registro — já aconteceram") +
      '<div class="razao">' +
        D.eventos.filter(function (e) { return e.inscricao === "encerrada"; }).map(function (e) {
          return '<div class="lx"><span class="t">' + e.titulo + "<small>" + e.tipo + " · " + e.data + '</small></span><span class="dots"></span><span class="st fechado">' + e.presenca + "</span></div>";
        }).join("") +
      "</div></div>" +
    '<div class="blk">' + bh("Novo lançamento", "diretoria") +
      '<div class="fields">' +
        '<div class="fld" style="flex:2;min-width:200px"><label>título</label><input type="text" placeholder="Reunião semanal — plano do 4º tri"></div>' +
        '<div class="fld"><label>tipo</label><select><option>reunião</option><option>aula</option><option>visita</option><option>social</option></select></div>' +
        '<div class="fld"><label>data</label><input type="date"></div>' +
        '<button class="btn btn-p">Lançar</button>' +
      "</div></div>";

  /* ---------- Membros ---------- */
  $("p-membros").innerHTML =
    cap("III", "Quadro <i>de sócios</i>", "Quem faz a liga — turma, curso e o que cada um acompanha.") +
    '<div class="blk">' + bh("Pedem a palavra", D.pendentes.length + " solicitações") +
      D.pendentes.map(function (p) {
        return '<div class="sol"><b>' + p.nome + '</b><span>' + p.meta + '</span><span class="dots"></span><span class="ac">' +
          '<button class="btn btn-p btn-s">Aprovar</button><button class="btn btn-g btn-s">Recusar</button></span></div>';
      }).join("") +
    "</div>" +
    '<div class="blk">' + bh("Os onze") +
      D.membros.map(function (m) {
        return '<div class="socio"><img src="' + m.foto + '" alt=""><div class="id"><b>' + m.nome + "</b><span>" + m.curso + " · " + m.ano + " · " + m.interesses.slice(0, 2).join(", ") + "</span></div>" +
          '<span class="tr">' + (m.turma || "—") + "</span>" +
          (m.cargo !== "Membro" ? '<span class="cargo">' + m.cargo + "</span>" : "") + "</div>";
      }).join("") +
    "</div>" +
    '<div class="blk">' + bh("Visitantes das próximas atividades") +
      '<div class="vazio"><b>Nenhum nome no livro de visitas.</b><span>Convites por QR e listas de porta entram aqui quando uma atividade abre.</span></div>' +
    "</div>";

  /* ---------- Gastos ---------- */
  var stG = { "pago": "aberto", "aprovado": "pendente", "pendente": "pendente", "recusado": "fechado" };
  var lbG = { "pago": "pago", "aprovado": "a pagar", "pendente": "a decidir", "recusado": "recusado" };
  $("p-gastos").innerHTML =
    cap("IV", "Livro-<i>caixa</i>", "Todo membro lança; a diretoria decide. Saldo do mês na régua abaixo.", "setembro") +
    '<div class="zahlen">' +
      '<div class="z"><b>307<i>,30</i></b><span>A decidir · R$</span></div>' +
      '<div class="z"><b>84<i>,00</i></b><span>Aprovados · R$</span></div>' +
      '<div class="z"><b>96<i>,40</i></b><span>Pagos · R$</span></div>' +
      '<div class="z"><b>5</b><span>Lançamentos</span></div>' +
    "</div>" +
    '<div class="blk">' + bh("Lançamentos") +
      '<div class="razao">' +
        D.gastos.map(function (g) {
          return '<div class="lx"><span class="t">' + g.item + "<small>" + g.id + " · " + g.dono + " · " + g.data + (g.motivo ? " · " + g.motivo : "") + '</small></span><span class="dots"></span>' +
            '<span class="v">' + g.valor + '</span><span class="st ' + stG[g.estado] + '">' + lbG[g.estado] + "</span></div>";
        }).join("") +
      "</div></div>" +
    '<div class="blk">' + bh("Novo lançamento") +
      '<div class="fields">' +
        '<div class="fld" style="flex:2;min-width:200px"><label>item</label><input type="text" placeholder="Uber ida — visita NOMAD (4 pax)"></div>' +
        '<div class="fld"><label>valor</label><input type="text" placeholder="R$ 0,00"></div>' +
        '<div class="fld"><label>anexo</label><input type="text" placeholder="nota ou comprovante"></div>' +
        '<button class="btn btn-p">Lançar</button>' +
      "</div></div>";

  /* ---------- Diretoria ---------- */
  $("p-diretoria").innerHTML =
    cap("V", "Mesa <i>diretora</i>", "Encontros fora do campus — parcerias, alumni e janelas de visita.") +
    '<div class="razao">' +
      D.diretoria.map(function (d) {
        return '<div class="lx"><span class="t">' + d.titulo + "<small>" + d.obs + '</small></span><span class="dots"></span><span class="v">' + d.data + "</span></div>";
      }).join("") +
    "</div>";

  /* ---------- Acessos ---------- */
  $("p-acessos").innerHTML =
    cap("VI", "Livro <i>de entrada</i>", "Quem abriu o diário nos últimos sete dias — visível só para a mesa.", "7 dias") +
    '<div class="blk"><div class="razao">' +
      D.acessos.map(function (a) {
        return '<div class="lx"><span class="t">' + a.membro + "<small>" + a.papel + " · " + a.origem + '</small></span><span class="dots"></span>' +
          '<span class="v">' + a.sessoes7d + " sessões</span><span class=\"st fechado\">" + a.ultimo + "</span></div>";
      }).join("") +
    "</div></div>" +
    '<div class="blk">' + bh("Ocorrências") +
      '<div class="vazio"><b>Nada a registrar.</b><span>Nenhuma sessão bloqueada nos últimos 30 dias.</span></div>' +
    "</div>";

  /* ---------- Legado ---------- */
  $("p-legado").innerHTML =
    cap("VII", "O que a <i>imersão</i> deixou", "São Paulo, 19–24 de julho de 2026 — a operação da semana virou capítulo permanente.", "1ª imersão") +
    D.legado.map(function (l) {
      return '<div class="pion"><h4>' + l.titulo + "</h4><p>" + l.texto + "</p></div>";
    }).join("");

  /* ---------- Empresas ---------- */
  $("p-empresas").innerHTML =
    cap("VIII", "As doze <i>casas</i>", "Cada visita com seus aprendizados, materiais e as perguntas que levamos.") +
    '<div class="emp-list">' + D.empresas.map(function (e, i) { return '<button class="' + (i === 0 ? "active" : "") + '">' + e.nome + "</button>"; }).join("") + "</div>" +
    '<div class="empresa">' +
      '<div class="cab"><span class="lg"><img src="' + D.empresas[0].logo + '" alt=""></span><div><h3>' + D.empresaDetalhe.nome + '</h3><span class="dia">' + D.empresaDetalhe.dia + " · " + D.empresaDetalhe.endereco + "</span></div></div>" +
      '<div class="cols3">' +
        "<div><h4>o que aprendemos</h4><ul>" + D.empresaDetalhe.aprendizados.map(function (a) { return "<li>" + a + "</li>"; }).join("") + "</ul></div>" +
        "<div><h4>materiais</h4><ul>" + D.empresaDetalhe.materiais.map(function (m) { return '<li><a href="#">' + m.nome + '</a><span class="meta">' + m.tipo + " · " + m.tamanho + "</span></li>"; }).join("") + "</ul></div>" +
        "<div><h4>perguntas que levamos</h4><ul>" + D.empresaDetalhe.perguntas.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul></div>" +
      "</div></div>";

  /* ---------- Selos ---------- */
  $("p-selos").innerHTML =
    cap("IX", "Selos &amp; <i>marcos</i>", "As honrarias da imersão e da liga — quem participou, registrou e recebeu.") +
    D.selos.map(function (s) {
      return '<div class="selo-item"><span class="gl">' + s.icone + '</span><div><b>' + s.nome + '</b><div class="dc">' + s.desc + '</div></div><span class="dots"></span><span class="q">' + s.qtd + " <i>membros</i></span></div>";
    }).join("");

  /* ---------- Roteiro ---------- */
  $("p-roteiro").innerHTML =
    cap("X", "O roteiro <i>dia a dia</i>", D.roteiro.hotel.nome + " — " + D.roteiro.hotel.endereco + ".", "19–24/07") +
    '<div class="dias">' + D.roteiro.dias.map(function (d, i) {
      var p = d.dia.split(" ");
      return '<button class="' + (i === 1 ? "active" : "") + '"><b>' + p[1] + "</b><span>" + p[0] + "</span></button>";
    }).join("") + "</div>" +
    "<p style='font-family:var(--fd);font-style:italic;font-size:15px;color:var(--ink-2);margin:0 0 8px;max-width:60ch'>" + D.roteiro.dias[1].nota + "</p>" +
    '<div class="blk">' +
      D.roteiro.dias[1].paradas.map(function (p) {
        var partes = p.split(" · ");
        return '<div class="parada"><span class="h">' + (partes[0].match(/\d/) ? partes[0] : "—") + "</span><b>" + (partes[1] || partes[0]) + "</b></div>";
      }).join("") +
    "</div>" +
    '<div class="blk">' + bh("Alojamento") +
      D.roteiro.quartos.map(function (q) { return '<div class="quarto"><b>' + q.label + "</b><span>" + q.membros.join(" · ") + "</span></div>"; }).join("") +
    "</div>";

  /* ---------- A missão ---------- */
  $("p-missao").innerHTML =
    cap("XI", "A <i>missão</i>", D.missao.titulo + " — por que a liga atravessou o país.") +
    '<p style="font-family:var(--fd);font-size:21px;line-height:1.5;color:var(--ink);margin:0 0 26px;max-width:34ch">' + D.missao.resumo + "</p>" +
    '<div class="blk">' + bh("Objetivos da viagem") +
      '<ul class="obj">' + D.missao.objetivos.map(function (o) { return "<li>" + o + "</li>"; }).join("") + "</ul>" +
    "</div>" +
    '<div class="blk">' + bh("O que foi pioneiro") +
      D.missao.pioneiros.map(function (p) { return '<div class="pion"><h4><i>' + p.titulo + "</i></h4><p>" + p.texto + "</p></div>"; }).join("") +
    "</div>";

  /* ---------- Arquivo ---------- */
  $("p-arquivo").innerHTML =
    cap("XII", "Arquivo da <i>operação</i>", "Trajetos, quartos e os combinados que seguraram a semana — manual de quem organizar a próxima.") +
    '<div class="blk">' + bh("Trajetos entre visitas") +
      '<div class="razao">' +
        D.arquivo.trajetos.map(function (t) {
          return '<div class="lx"><span class="t">' + t.perna + "<small>" + t.dia + " · " + t.modo + '</small></span><span class="dots"></span><span class="v">' + t.tempo + "</span></div>";
        }).join("") +
      "</div></div>" +
    '<div class="blk">' + bh("Combinados — 4 de 5 cumpridos") +
      '<ul class="chk">' + D.arquivo.checklist.map(function (c) {
        return '<li class="' + (c.feito ? "feito" : "") + '"><span class="bx">' + (c.feito ? "✓" : "·") + "</span>" + c.texto + "</li>";
      }).join("") + "</ul>" +
    "</div>";
})();
