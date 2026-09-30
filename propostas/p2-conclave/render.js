/* P2 · Conclave — painéis na linguagem quente (cards macios, pills, serif). */
(function () {
  var D = LEPV_DATA;
  function $(id) { return document.getElementById(id); }
  function head(t, ajuda, acao) {
    return '<div class="page-head"><div><h1>' + t + "</h1><p>" + ajuda + '</p></div><div class="ac">' + (acao || "") + "</div></div>";
  }

  /* nav lateral em dois grupos */
  var grupos = [
    { nome: "Liga", abas: [["inicio","Início"],["eventos","Eventos"],["membros","Membros"],["gastos","Gastos"],["diretoria","Diretoria"],["acessos","Acessos"]] },
    { nome: "Acervo · Imersão SP", abas: [["legado","Legado"],["empresas","Empresas"],["selos","Selos"],["roteiro","Roteiro"],["missao","A missão"],["arquivo","Arquivo"]] },
  ];
  $("nav").innerHTML = grupos.map(function (g) {
    return '<div class="navgrp"><div class="gt">' + g.nome + "</div>" + g.abas.map(function (a) {
      return '<button data-tab="' + a[0] + '" role="tab" aria-selected="false"><span class="dot"></span>' + a[1] + "</button>";
    }).join("") + "</div>";
  }).join("");

  /* ---------- Início ---------- */
  $("p-inicio").innerHTML =
    '<div class="card hero-card"><span class="tile"><img src="../_assets/logo-mark.png" alt=""></span>' +
      "<div><h1>Bem-vinda de volta, <i>Clara</i>.</h1>" +
      "<p>A liga teve uma semana cheia: a assembleia saiu, a visita à NOMAD abriu inscrição e a Aula 3 teve 18 presentes.</p></div></div>" +
    '<div class="metricas">' +
      D.stats.map(function (s) { return '<div class="met"><b>' + s.v + "</b><span>" + s.label + "</span></div>"; }).join("") +
    "</div>" +
    '<div class="card" style="margin-top:16px"><h2>Mural da liga</h2><p class="ajuda">Avisos da diretoria e o que abriu inscrição.</p>' +
      D.mural.map(function (m) {
        return '<div class="mural-item"><span class="pill-t' + (m.tipo === "inscricao" ? " info" : "") + '">' + m.tipo + "</span><div><b>" + m.titulo + "</b><p>" + m.texto + "</p></div></div>";
      }).join("") +
    "</div>" +
    '<div class="card"><h2>Nossas atividades</h2><p class="ajuda">O que a liga faz semana a semana.</p>' +
      '<div class="atv">' + D.atividades.map(function (a) { return "<span>" + a + "</span>"; }).join("") + "</div>" +
    "</div>" +
    '<div class="card"><h2>Empresas que já nos receberam</h2><p class="ajuda">A rede construída desde a 1ª imersão.</p>' +
      '<div class="logos-strip">' + D.empresas.map(function (e) { return '<span class="lg' + (e.logoBg === "dark" ? " esc" : "") + '"><img src="' + e.logo + '" alt="' + e.nome + '"></span>'; }).join("") + "</div>" +
    "</div>";

  /* ---------- Eventos ---------- */
  function dataBox(data) {
    var m = data.match(/(\d{2})\/(\d{2})/);
    var sem = ["dom","seg","ter","qua","qui","sex","sáb"][new Date(2026, +m[2] - 1, +m[1]).getDay()];
    return '<span class="dt"><b>' + (m ? m[1] : "—") + "</b><span>" + sem + "</span></span>";
  }
  $("p-eventos").innerHTML =
    head("Eventos", "Reunião, aula, visita e social — tudo nasce como aviso, pode abrir inscrição e tem presença que abre sozinha no dia.", '<button class="btn btn-p">Novo evento</button>') +
    '<div class="card"><h2>Vem aí</h2><p class="ajuda">Inscrições abertas agora.</p>' +
      D.eventos.filter(function (e) { return e.inscricao === "aberta"; }).map(function (e) {
        return '<div class="ev">' + dataBox(e.data) +
          '<div class="corpo"><span class="tipo">' + e.tipo + "</span><h3>" + e.titulo + '</h3><span class="meta">' + e.data + " · " + e.local + "</span></div>" +
          '<div class="lado"><span class="pill aberto">inscrição aberta</span>' + (e.vagas ? '<span class="meta">' + e.vagas + "</span>" : "") + "</div></div>";
      }).join("") +
    "</div>" +
    '<div class="card"><h2>Já aconteceram</h2><p class="ajuda">Com o registro de presença.</p>' +
      D.eventos.filter(function (e) { return e.inscricao === "encerrada"; }).map(function (e) {
        return '<div class="ev">' + dataBox(e.data) +
          '<div class="corpo"><span class="tipo">' + e.tipo + "</span><h3>" + e.titulo + '</h3><span class="meta">' + e.data + " · " + e.local + "</span></div>" +
          '<div class="lado"><span class="pill fechado">' + e.presenca + "</span></div></div>";
      }).join("") +
    "</div>" +
    '<div class="card"><h2>Criar evento <span style="font-size:12px;color:var(--ink-3)">(diretoria)</span></h2><p class="ajuda">Publica como aviso no mural; inscrição e presença ligam depois.</p>' +
      '<div class="fields linha">' +
        '<div class="fld"><label>Título</label><input type="text" placeholder="Reunião semanal — plano do 4º tri"></div>' +
        '<div class="fld"><label>Tipo</label><select><option>Reunião</option><option>Aula</option><option>Visita</option><option>Social</option></select></div>' +
        '<div class="fld"><label>Data</label><input type="date"></div>' +
        '<button class="btn btn-p">Publicar</button>' +
      "</div></div>";

  /* ---------- Membros ---------- */
  $("p-membros").innerHTML =
    head("Membros", "Quem faz a liga hoje — e quem está pedindo para entrar.") +
    '<div class="card"><h2>Solicitações de acesso</h2><p class="ajuda">Pedidos do formulário público, decididos aqui.</p>' +
      D.pendentes.map(function (p) {
        return '<div class="sol"><div><b>' + p.nome + "</b><span>" + p.meta + '</span></div><div class="ac">' +
          '<button class="btn btn-p btn-s">Aprovar</button><button class="btn btn-g btn-s">Recusar</button></div></div>';
      }).join("") +
    "</div>" +
    '<div class="membros-g" style="margin-top:16px">' +
      D.membros.map(function (m) {
        return '<div class="membro"><img src="' + m.foto + '" alt="">' +
          '<div class="id"><b>' + m.nome + "</b><span>" + m.curso + " · " + m.ano + (m.turma ? " · " + m.turma : "") + "</span>" +
          '<div class="tags">' + m.interesses.slice(0, 3).map(function (i) { return "<i>" + i + "</i>"; }).join("") + "</div></div>" +
          (m.cargo !== "Membro" ? '<span class="cargo">' + m.cargo + "</span>" : '<span class="stat">' + m.status + "</span>") +
        "</div>";
      }).join("") +
    "</div>" +
    '<div class="card" style="margin-top:16px"><h2>Visitantes</h2><p class="ajuda">Convites por QR e listas de porta das próximas atividades.</p>' +
      '<div class="vazio"><b>Nenhum visitante ainda.</b><span>Quando a diretoria abrir uma visita ou aula a convidados, a lista aparece aqui.</span></div>' +
    "</div>";

  /* ---------- Gastos ---------- */
  var estG = { "pago": "aberto", "aprovado": "andando", "pendente": "pendente", "recusado": "negado" };
  $("p-gastos").innerHTML =
    head("Centro de gastos", "Todo membro lança; a diretoria decide. Recibos ficam sigilosos — só dono e diretoria veem o anexo.", '<button class="btn btn-p">Lançar gasto</button>') +
    '<div class="metricas" style="margin-bottom:16px">' +
      '<div class="met"><b>R$ 307</b><span>Pendentes de decisão</span></div>' +
      '<div class="met"><b>R$ 96</b><span>Pagos em setembro</span></div>' +
      '<div class="met"><b>R$ 84</b><span>Aprovados, a pagar</span></div>' +
      '<div class="met"><b>5</b><span>Lançamentos no mês</span></div>' +
    "</div>" +
    '<div class="card"><h2>Extrato</h2><p class="ajuda">Ressarcimentos e registros do que a diretoria já pagou.</p>' +
      '<table class="lst"><thead><tr><th>Item</th><th>Dono</th><th>Data</th><th class="v">Valor</th><th>Estado</th></tr></thead><tbody>' +
        D.gastos.map(function (g) {
          return "<tr><td>" + g.item + '<span class="meta">' + g.id + (g.motivo ? " · recusado: " + g.motivo : "") + "</span></td>" +
            "<td>" + g.dono + "</td><td>" + g.data + '</td><td class="v">' + g.valor + "</td>" +
            '<td><span class="pill ' + estG[g.estado] + '">' + g.estado + "</span></td></tr>";
        }).join("") +
      "</tbody></table></div>";

  /* ---------- Diretoria ---------- */
  $("p-diretoria").innerHTML =
    head("Diretoria", "Agenda de encontros fora do campus — parcerias, alumni e janelas de visita.", '<button class="btn btn-g">+ Encontro</button>') +
    '<div class="card">' +
      D.diretoria.map(function (d) {
        return '<div class="ev"><span class="dt"><b>' + d.data.match(/\d{2}\/\d{2}/)[0].split("/")[0] + '</b><span>' + d.data.split(" ")[0] + "</span></span>" +
          '<div class="corpo"><h3>' + d.titulo + '</h3><span class="meta">' + d.data + " — " + d.obs + "</span></div></div>";
      }).join("") +
    "</div>";

  /* ---------- Acessos ---------- */
  $("p-acessos").innerHTML =
    head("Acessos", "Quem usa o site, de onde e quando — visível só para super admin.") +
    '<div class="card"><h2>Sessões recentes</h2><p class="ajuda">Últimos 7 dias por membro.</p>' +
      '<table class="lst"><thead><tr><th>Membro</th><th>Papel</th><th>Último acesso</th><th class="v">Sessões</th><th>Origem</th></tr></thead><tbody>' +
        D.acessos.map(function (a) {
          return "<tr><td>" + a.membro + "</td><td>" + a.papel + "</td><td>" + a.ultimo + '</td><td class="v">' + a.sessoes7d + "</td><td>" + a.origem + "</td></tr>";
        }).join("") +
      "</tbody></table></div>" +
    '<div class="card"><h2>Alertas</h2><p class="ajuda">Bloqueios e origens novas.</p>' +
      '<div class="vazio"><b>Tudo limpo.</b><span>Nenhuma sessão bloqueada nos últimos 30 dias — tentativas suspeitas aparecem aqui com IP truncado.</span></div>' +
    "</div>";

  /* ---------- Legado ---------- */
  $("p-legado").innerHTML =
    head("Legado", "A 1ª Imersão em São Paulo, 19–24/07/2026 — a operação da semana virou referência permanente.") +
    '<div class="card">' +
      D.legado.map(function (l) { return '<div class="pion"><h4>' + l.titulo + "</h4><p>" + l.texto + "</p></div>"; }).join("") +
    "</div>";

  /* ---------- Empresas ---------- */
  $("p-empresas").innerHTML =
    head("Empresas", "As 12 visitas da imersão — cada uma com aprendizados, materiais e as perguntas que preparamos.") +
    '<div class="chips-emp">' + D.empresas.map(function (e, i) { return '<button class="' + (i === 0 ? "active" : "") + '">' + e.nome + "</button>"; }).join("") + "</div>" +
    '<div class="card empresa">' +
      '<div class="cab"><span class="lg"><img src="' + D.empresas[0].logo + '" alt=""></span><div><h3>' + D.empresaDetalhe.nome + '</h3><span class="dia">' + D.empresaDetalhe.dia + " · " + D.empresaDetalhe.endereco + "</span></div></div>" +
      '<div class="cols3">' +
        "<div><h4>Aprendizados</h4><ul>" + D.empresaDetalhe.aprendizados.map(function (a) { return "<li>" + a + "</li>"; }).join("") + "</ul></div>" +
        "<div><h4>Materiais</h4><ul>" + D.empresaDetalhe.materiais.map(function (m) { return '<li><a href="#">' + m.nome + '</a><span class="meta">' + m.tipo + " · " + m.tamanho + "</span></li>"; }).join("") + "</ul></div>" +
        "<div><h4>Perguntas</h4><ul>" + D.empresaDetalhe.perguntas.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul></div>" +
      "</div>" +
    "</div>";

  /* ---------- Selos ---------- */
  $("p-selos").innerHTML =
    head("Selos", "Marcos conquistados pelos membros na imersão e na liga.") +
    '<div class="card">' +
      D.selos.map(function (s) {
        return '<div class="selo-item"><span class="glifo">' + s.icone + '</span><div><b>' + s.nome + "</b><span>" + s.desc + '</span></div><span class="q">' + s.qtd + " <i>membros</i></span></div>";
      }).join("") +
    "</div>";

  /* ---------- Roteiro ---------- */
  $("p-roteiro").innerHTML =
    head("Roteiro", "Seis dias em São Paulo — hotel, dias e o que aconteceu em cada um.") +
    '<div class="card"><h2>' + D.roteiro.hotel.nome + '</h2><p class="ajuda">' + D.roteiro.hotel.endereco + "</p>" +
      D.roteiro.quartos.map(function (q) { return '<div class="quarto"><b>' + q.label + "</b><span>" + q.membros.join(" · ") + "</span></div>"; }).join("") +
    "</div>" +
    '<div class="card"><h2>Dia a dia</h2><p class="ajuda">' + D.roteiro.dias[1].nota + "</p>" +
      '<div class="dias">' + D.roteiro.dias.map(function (d, i) { return '<button class="' + (i === 1 ? "active" : "") + '"><b>' + d.dia.split(" ")[0] + "</b><span>" + d.dia.split(" ")[1] + "</span></button>"; }).join("") + "</div>" +
      D.roteiro.dias[1].paradas.map(function (p) {
        var partes = p.split(" · ");
        return '<div class="parada"><span class="h">' + (partes[0].match(/\d/) ? partes[0] : "—") + "</span><b>" + (partes[1] || partes[0]) + "</b></div>";
      }).join("") +
    "</div>";

  /* ---------- A missão ---------- */
  $("p-missao").innerHTML =
    head("A missão", D.missao.titulo + " — por que a liga foi a São Paulo.") +
    '<div class="card"><p style="font-size:15px;line-height:1.7;margin:0;max-width:62ch">' + D.missao.resumo + "</p></div>" +
    '<div class="card"><h2>Objetivos</h2><ul class="obj">' + D.missao.objetivos.map(function (o) { return "<li>" + o + "</li>"; }).join("") + "</ul></div>" +
    '<div class="card"><h2>O que foi pioneiro</h2>' +
      D.missao.pioneiros.map(function (p) { return '<div class="pion"><h4>' + p.titulo + "</h4><p>" + p.texto + "</p></div>"; }).join("") +
    "</div>";

  /* ---------- Arquivo ---------- */
  $("p-arquivo").innerHTML =
    head("Arquivo", "Os bastidores da semana: trajetos, quartos e os combinados que sustentaram tudo — manual para a próxima imersão.") +
    '<div class="card"><h2>Trajetos entre visitas</h2><table class="lst"><thead><tr><th>Dia</th><th>Perna</th><th>Modo</th><th class="v">Tempo</th></tr></thead><tbody>' +
      D.arquivo.trajetos.map(function (t) { return "<tr><td>" + t.dia + "</td><td>" + t.perna + "</td><td>" + t.modo + '</td><td class="v">' + t.tempo + "</td></tr>"; }).join("") +
    "</tbody></table></div>" +
    '<div class="card"><h2>Combinados da viagem</h2><ul class="chk">' +
      D.arquivo.checklist.map(function (c) { return '<li class="' + (c.feito ? "feito" : "") + '"><span class="bx">✓</span>' + c.texto + "</li>"; }).join("") +
    "</ul></div>";
})();
