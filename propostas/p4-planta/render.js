/* P4 · Planta baixa — console: tabelas densas, estados por ponto, mono em id. */
(function () {
  var D = LEPV_DATA;
  function $(id) { return document.getElementById(id); }

  /* ícones de traço 14px (stroke currentColor) */
  function ic(p) { return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }
  var I = {
    inicio:    ic('<path d="M2.5 7.5 8 2.5l5.5 5v6h-11z"/><path d="M6.5 13.5v-4h3v4"/>'),
    eventos:   ic('<rect x="2" y="3" width="12" height="10.5" rx="1.5"/><path d="M2 6.5h12M5.5 1.8v2.5M10.5 1.8v2.5"/>'),
    membros:   ic('<circle cx="5.5" cy="5" r="2.4"/><path d="M1.8 13.5c.6-2.4 2-3.6 3.7-3.6s3.1 1.2 3.7 3.6"/><circle cx="11" cy="5.6" r="1.9"/><path d="M10.2 10c2.4.2 3.5 1.4 4 3.5"/>'),
    gastos:    ic('<rect x="1.8" y="3.5" width="12.4" height="9" rx="1.5"/><path d="M1.8 6.5h12.4M4.5 10h3"/>'),
    diretoria: ic('<rect x="2" y="5" width="12" height="8.5" rx="1.5"/><path d="M5.5 5V3.8c0-.8.7-1.3 1.4-1.3h2.2c.7 0 1.4.5 1.4 1.3V5M2 9h12"/>'),
    acessos:   ic('<path d="M1.8 8s2.3-4 6.2-4 6.2 4 6.2 4-2.3 4-6.2 4-6.2-4-6.2-4z"/><circle cx="8" cy="8" r="1.8"/>'),
    legado:    ic('<path d="M4 2.5h8v11l-4-2.6-4 2.6z"/>'),
    empresas:  ic('<rect x="2.5" y="6" width="5" height="7.5"/><rect x="8.5" y="2.5" width="5" height="11"/><path d="M4.2 8.5h1.6M4.2 11h1.6M10.2 5h1.6M10.2 8h1.6M10.2 11h1.6"/>'),
    selos:     ic('<circle cx="8" cy="6" r="3.4"/><path d="M6 8.8 4.8 13.5 8 12l3.2 1.5L10 8.8"/>'),
    roteiro:   ic('<path d="M2.5 12.5c2-5 4-7.5 6-8.5s4-.8 5 .5-1 4-3 6-5 2.5-8 2z"/><circle cx="5.5" cy="11" r="1"/><circle cx="11" cy="4.5" r="1"/>'),
    missao:    ic('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.6"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>'),
    arquivo:   ic('<rect x="2" y="4.5" width="12" height="9" rx="1"/><path d="M1.8 2.5h12.4v2H1.8zM6.5 8h3"/>'),
  };

  var grupos = [
    { nome: "Liga", abas: [["inicio","Início","1"],["eventos","Eventos","2"],["membros","Membros","3"],["gastos","Gastos","4"],["diretoria","Diretoria","5"],["acessos","Acessos","6"]] },
    { nome: "Acervo · Imersão SP", abas: [["legado","Legado","7"],["empresas","Empresas","8"],["selos","Selos","9"],["roteiro","Roteiro","0"],["missao","A missão","-"],["arquivo","Arquivo","="]] },
  ];
  $("nav").innerHTML = grupos.map(function (g) {
    return '<div class="navgrp"><div class="gt">' + g.nome + "</div>" + g.abas.map(function (a) {
      return '<button data-tab="' + a[0] + '" aria-selected="false">' + I[a[0]] + a[1] + '<span class="kbd">' + a[2] + "</span></button>";
    }).join("") + "</div>";
  }).join("");

  /* breadcrumb acompanha a aba */
  var rotulos = {};
  grupos.forEach(function (g) { g.abas.forEach(function (a) { rotulos[a[0]] = a[1]; }); });
  function crumbs() {
    var ativo = (document.querySelector("[data-tab].active") || {}).getAttribute;
    var nome = ativo ? ativo.call(document.querySelector("[data-tab].active"), "data-tab") : "inicio";
    var grupo = ["legado","empresas","selos","roteiro","missao","arquivo"].indexOf(nome) >= 0 ? "acervo" : "liga";
    $("crumbs").innerHTML = "<b>LEPV</b><span class=\"sep\">/</span>" + grupo + '<span class="sep">/</span><b>' + rotulos[nome] + '</b><div class="ac"><span class="mono" style="color:var(--ink-3)">30/09/2026</span></div>';
  }
  document.addEventListener("click", function (e) { if (e.target.closest("[data-tab]")) setTimeout(crumbs, 0); });
  window.addEventListener("hashchange", function () { setTimeout(crumbs, 0); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", crumbs);
  else crumbs();

  /* ---------- Início ---------- */
  $("p-inicio").innerHTML =
    '<div class="kpis">' +
      D.stats.map(function (s) { return '<div class="kpi"><b>' + s.v + "</b><span>" + s.label + "</span></div>"; }).join("") +
    "</div>" +
    '<div class="sheet"><div class="sh"><h2>Mural da liga</h2><span class="meta">' + D.mural.length + ' avisos ativos</span></div><div class="sc">' +
      D.mural.map(function (m) {
        return '<div class="mural-item"><span class="tag-m">' + m.tipo + "</span><div><b>" + m.titulo + "</b><p>" + m.texto + "</p></div></div>";
      }).join("") +
    "</div></div>" +
    '<div class="sheet"><div class="sh"><h2>Atividades da liga</h2></div><div class="sc"><div class="atv">' +
      D.atividades.map(function (a) { return "<span>" + a + "</span>"; }).join("") + "</div></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Empresas na rede</h2><span class="meta">12 anfitriões</span></div><div class="sc"><div class="logos-strip">' +
      D.empresas.map(function (e) { return '<span class="lg' + (e.logoBg === "dark" ? " esc" : "") + '"><img src="' + e.logo + '" alt="' + e.nome + '"></span>'; }).join("") + "</div></div></div>";

  /* ---------- Eventos ---------- */
  var estE = { "aberta": "aberto", "encerrada": "fechado" };
  $("p-eventos").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Eventos</h2><span class="meta">' + D.eventos.length + " registros</span></div>" +
    '<div class="sc"><table class="t"><thead><tr><th>id</th><th>tipo</th><th>título</th><th>data</th><th>local</th><th>inscrição</th><th>presença</th></tr></thead><tbody>' +
      D.eventos.map(function (e) {
        return "<tr><td><span class='mono' style='color:var(--ink-3)'>" + e.id + "</span></td>" +
          "<td>" + e.tipo + "</td><td><b style='font-weight:600;color:var(--ink)'>" + e.titulo + "</b></td>" +
          "<td><span class='mono'>" + e.data + "</span></td><td>" + e.local + "</td>" +
          '<td><span class="st ' + estE[e.inscricao] + '">' + e.inscricao + "</span></td>" +
          "<td><span class='mono' style='font-size:11px;color:var(--ink-3)'>" + e.presenca + "</span></td></tr>";
      }).join("") +
    "</tbody></table></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Novo evento</h2><span class="meta">diretoria</span></div>' +
    '<div class="sc"><div class="fields">' +
      '<div class="fld" style="flex:2;min-width:200px"><label>título</label><input type="text" placeholder="Reunião semanal — plano do 4º tri"></div>' +
      '<div class="fld"><label>tipo</label><select><option>reunião</option><option>aula</option><option>visita</option><option>social</option></select></div>' +
      '<div class="fld"><label>data</label><input type="date"></div>' +
      '<button class="btn btn-p">Publicar no mural</button>' +
    "</div></div></div>";

  /* ---------- Membros ---------- */
  $("p-membros").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Solicitações de acesso</h2><span class="meta">' + D.pendentes.length + " na fila</span></div>" +
    '<div class="sc"><table class="t"><tbody>' +
      D.pendentes.map(function (p) {
        return "<tr><td><b style='font-weight:600;color:var(--ink)'>" + p.nome + '<span class="sub">' + p.meta + "</span></td>" +
          '<td style="text-align:right;white-space:nowrap"><button class="btn btn-p btn-s">Aprovar</button> <button class="btn btn-g btn-s">Recusar</button></td></tr>';
      }).join("") +
    "</tbody></table></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Quadro de membros</h2><span class="meta">' + D.membros.length + " ativos + reservas</span></div>" +
    '<div class="sc"><table class="t"><thead><tr><th>membro</th><th>curso</th><th>turma</th><th>interesses</th><th>status</th></tr></thead><tbody>' +
      D.membros.map(function (m) {
        return '<tr class="mrow"><td><div class="idm"><img src="' + m.foto + '" alt=""><div><b style="font-weight:600;color:var(--ink)">' + m.nome + "</b>" +
          (m.cargo !== "Membro" ? '<span class="sub" style="color:var(--acc)">' + m.cargo + "</span>" : "") + "</div></div></td>" +
          "<td>" + m.curso + '<span class="sub">' + m.ano + "</span></td>" +
          "<td><span class='mono'>" + (m.turma || "—") + "</span></td>" +
          "<td style='font-size:12px;color:var(--ink-3)'>" + m.interesses.join(", ") + "</td>" +
          '<td><span class="st ' + (m.status === "ativa" ? "aberto" : "fechado") + '">' + m.status + "</span></td></tr>";
      }).join("") +
    "</tbody></table></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Visitantes</h2><span class="meta">próximas atividades</span></div>' +
    '<div class="sc"><div class="vazio"><span class="c0">[ 0 registros ]</span><b>Nenhum visitante nas próximas atividades.</b><span>Convites por QR e listas de porta aparecem aqui.</span></div></div></div>';

  /* ---------- Gastos ---------- */
  $("p-gastos").innerHTML =
    '<div class="kpis">' +
      '<div class="kpi"><b>R$ 307,30</b><span>pendentes de decisão</span></div>' +
      '<div class="kpi"><b>R$ 84,00</b><span>aprovados, a pagar</span></div>' +
      '<div class="kpi"><b>R$ 96,40</b><span>pagos em setembro</span></div>' +
      '<div class="kpi"><b>5</b><span>lançamentos no mês</span></div>' +
    "</div>" +
    '<div class="sheet"><div class="sh"><h2>Extrato</h2><span class="meta">lançar → diretoria decide → comprovante</span></div>' +
    '<div class="sc"><table class="t"><thead><tr><th>id</th><th>item</th><th>dono</th><th>data</th><th class="v">valor</th><th>estado</th></tr></thead><tbody>' +
      D.gastos.map(function (g) {
        return "<tr><td><span class='mono' style='color:var(--ink-3)'>" + g.id + "</span></td>" +
          "<td>" + g.item + (g.motivo ? '<span class="sub">recusado: ' + g.motivo + "</span>" : "") + "</td>" +
          "<td>" + g.dono + "</td><td><span class='mono'>" + g.data + "</span></td>" +
          '<td class="v">' + g.valor + '</td><td><span class="st ' + g.estado + '">' + g.estado + "</span></td></tr>";
      }).join("") +
    "</tbody></table></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Lançar gasto</h2></div>' +
    '<div class="sc"><div class="fields">' +
      '<div class="fld" style="flex:2;min-width:200px"><label>item</label><input type="text" placeholder="Uber ida — visita NOMAD (4 pax)"></div>' +
      '<div class="fld"><label>valor</label><input type="text" placeholder="R$ 0,00"></div>' +
      '<div class="fld"><label>anexo</label><input type="text" placeholder="nota ou comprovante"></div>' +
      '<button class="btn btn-p">Lançar</button>' +
    "</div></div></div>";

  /* ---------- Diretoria ---------- */
  $("p-diretoria").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Encontros externos</h2><span class="meta">' + D.diretoria.length + " marcados</span></div>" +
    '<div class="sc"><table class="t"><thead><tr><th>data</th><th>encontro</th><th>notas</th></tr></thead><tbody>' +
      D.diretoria.map(function (d) {
        return "<tr><td><span class='mono'>" + d.data + "</span></td><td><b style='font-weight:600;color:var(--ink)'>" + d.titulo + "</b></td><td>" + d.obs + "</td></tr>";
      }).join("") +
    "</tbody></table></div></div>";

  /* ---------- Acessos ---------- */
  $("p-acessos").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Sessões — últimos 7 dias</h2><span class="meta">super admin</span></div>' +
    '<div class="sc"><table class="t"><thead><tr><th>membro</th><th>papel</th><th>último acesso</th><th class="v">sessões</th><th>origem</th></tr></thead><tbody>' +
      D.acessos.map(function (a) {
        return "<tr><td>" + a.membro + "</td><td>" + a.papel + "</td><td><span class='mono'>" + a.ultimo + '</span></td><td class="v">' + a.sessoes7d + "</td><td><span class='mono'>" + a.origem + "</span></td></tr>";
      }).join("") +
    "</tbody></table></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Alertas</h2></div>' +
    '<div class="sc"><div class="vazio"><span class="c0">[ 0 alertas / 30d ]</span><b>Nenhuma sessão bloqueada.</b><span>Tentativas com senha errada ou origem nova aparecem aqui.</span></div></div></div>';

  /* ---------- Legado ---------- */
  $("p-legado").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Legado — 1ª Imersão SP</h2><span class="meta">19–24/07/2026</span></div>' +
    '<div class="sc">' +
      D.legado.map(function (l) { return '<div class="pion"><h4>' + l.titulo + "</h4><p>" + l.texto + "</p></div>"; }).join("") +
    "</div></div>";

  /* ---------- Empresas ---------- */
  $("p-empresas").innerHTML =
    '<div class="split">' +
      '<div class="emp-list">' + D.empresas.map(function (e, i) {
        return '<button class="' + (i === 0 ? "active" : "") + '">' + e.nome + '<span class="d">' + e.dia + "</span></button>";
      }).join("") + "</div>" +
      '<div class="sheet"><div class="sc empresa">' +
        '<div class="cab"><span class="lg"><img src="' + D.empresas[0].logo + '" alt=""></span><div><h3>' + D.empresaDetalhe.nome + '</h3><span class="dia">' + D.empresaDetalhe.dia + " · " + D.empresaDetalhe.endereco + "</span></div></div>" +
        '<div class="cols3">' +
          "<div><h4>Aprendizados</h4><ul>" + D.empresaDetalhe.aprendizados.map(function (a) { return "<li>" + a + "</li>"; }).join("") + "</ul></div>" +
          "<div><h4>Materiais</h4><ul>" + D.empresaDetalhe.materiais.map(function (m) { return '<li><a href="#">' + m.nome + '</a><span class="meta">' + m.tipo + " · " + m.tamanho + "</span></li>"; }).join("") + "</ul></div>" +
          "<div><h4>Perguntas</h4><ul>" + D.empresaDetalhe.perguntas.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul></div>" +
        "</div>" +
      "</div></div>" +
    "</div>";

  /* ---------- Selos ---------- */
  $("p-selos").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Selos</h2><span class="meta">marcos da imersão e da liga</span></div>' +
    '<div class="sc"><table class="t"><thead><tr><th></th><th>selo</th><th>critério</th><th class="v">membros</th></tr></thead><tbody>' +
      D.selos.map(function (s) {
        return "<tr><td style='width:34px;font-size:16px;color:var(--acc)'>" + s.icone + "</td>" +
          "<td><b style='font-weight:600;color:var(--ink)'>" + s.nome + "</b></td><td>" + s.desc + '</td><td class="v"><span class="mono">' + s.qtd + "</span></td></tr>";
      }).join("") +
    "</tbody></table></div></div>";

  /* ---------- Roteiro ---------- */
  $("p-roteiro").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Base</h2><span class="meta">' + D.roteiro.hotel.nome + " · " + D.roteiro.hotel.endereco + "</span></div>" +
    '<div class="sc">' +
      D.roteiro.quartos.map(function (q) { return '<div class="quarto"><b>' + q.label + "</b><span>" + q.membros.join(" · ") + "</span></div>"; }).join("") +
    "</div></div>" +
    '<div class="sheet"><div class="sh"><h2>Dia a dia</h2><span class="meta">' + D.roteiro.dias[1].dia + "</span></div>" +
    '<div class="sc">' +
      '<div class="dias">' + D.roteiro.dias.map(function (d, i) { return '<button class="' + (i === 1 ? "active" : "") + '">' + d.dia.split(" ")[1] + " " + d.dia.split(" ")[0].slice(0, 3).toLowerCase() + "</button>"; }).join("") + "</div>" +
      "<p style='font-size:12px;color:var(--ink-3);margin:0 0 10px'>" + D.roteiro.dias[1].nota + "</p>" +
      D.roteiro.dias[1].paradas.map(function (p) {
        var partes = p.split(" · ");
        return '<div class="parada"><span class="h">' + (partes[0].match(/\d/) ? partes[0] : "—") + "</span><b>" + (partes[1] || partes[0]) + "</b></div>";
      }).join("") +
    "</div></div>";

  /* ---------- A missão ---------- */
  $("p-missao").innerHTML =
    '<div class="sheet"><div class="sh"><h2>A missão</h2><span class="meta">' + D.missao.titulo + "</span></div>" +
    '<div class="sc"><p style="font-size:13.5px;line-height:1.65;margin:0;max-width:70ch">' + D.missao.resumo + "</p></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Objetivos</h2></div><div class="sc"><ul class="obj" style="margin:0">' +
      D.missao.objetivos.map(function (o) { return "<li>" + o + "</li>"; }).join("") + "</ul></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Pioneiro</h2></div><div class="sc">' +
      D.missao.pioneiros.map(function (p) { return '<div class="pion"><h4>' + p.titulo + "</h4><p>" + p.texto + "</p></div>"; }).join("") +
    "</div></div>";

  /* ---------- Arquivo ---------- */
  $("p-arquivo").innerHTML =
    '<div class="sheet"><div class="sh"><h2>Trajetos</h2></div>' +
    '<div class="sc"><table class="t"><thead><tr><th>dia</th><th>perna</th><th>modo</th><th class="v">tempo</th></tr></thead><tbody>' +
      D.arquivo.trajetos.map(function (t) {
        return "<tr><td><span class='mono'>" + t.dia + "</span></td><td>" + t.perna + "</td><td>" + t.modo + '</td><td class="v"><span class="mono">' + t.tempo + "</span></td></tr>";
      }).join("") +
    "</tbody></table></div></div>" +
    '<div class="sheet"><div class="sh"><h2>Combinados</h2><span class="meta">4/5 cumpridos</span></div>' +
    '<div class="sc"><ul class="chk">' +
      D.arquivo.checklist.map(function (c) { return '<li class="' + (c.feito ? "feito" : "") + '"><span class="bx">✓</span>' + c.texto + "</li>"; }).join("") +
    "</ul></div></div>";
})();
