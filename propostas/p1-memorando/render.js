/* P1 · Memorando — painéis na gramática de documento. */
(function () {
  var D = LEPV_DATA;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* nav: dois grupos como na produção */
  var grupos = [
    { nome: "Liga", abas: [["inicio", "Início"], ["eventos", "Eventos"], ["membros", "Membros"], ["gastos", "Gastos"], ["diretoria", "Diretoria"], ["acessos", "Acessos"]] },
    { nome: "Acervo · 1ª Imersão SP", abas: [["legado", "Legado"], ["empresas", "Empresas"], ["selos", "Selos"], ["roteiro", "Roteiro"], ["missao", "A missão"], ["arquivo", "Arquivo"]] },
  ];
  var ni = 0;
  $("tabs").innerHTML = grupos.map(function (g) {
    return '<span class="grp">' + g.nome + "</span>" + g.abas.map(function (a) {
      ni += 1;
      return '<button data-tab="' + a[0] + '" role="tab" aria-selected="false"><span class="n">' + ni + ".</span>" + a[1] + "</button>";
    }).join("");
  }).join("");

  /* ---------- Início ---------- */
  $("p-inicio").innerHTML =
    '<div class="hero">' +
      '<img class="mark" src="../_assets/logo-mark.png" alt="">' +
      "<div><h1>Quem <i>somos</i></h1>" +
      "<p>A LEPV nasceu na Praia Vermelha para aproximar estudantes de engenharia do mundo real dos negócios. Reuniões, aulas práticas, visitas e imersões dentro das empresas — a primeira levou a liga a São Paulo, com 12 visitas em 6 dias.</p></div>" +
    "</div>" +
    '<div class="ticker"><div class="ticker-in">' +
      D.stats.map(function (s) { return '<div class="tk"><b>' + s.v + "</b><span>" + s.label + "</span></div>"; }).join("") +
    "</div></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Mural da liga</h2><span class="r"></span></div>' +
      D.mural.map(function (m) {
        return '<div class="mural-item"><span class="t">' + m.tipo + "</span><div><b>" + m.titulo + "</b><p>" + m.texto + "</p></div></div>";
      }).join("") +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Nossas atividades</h2><span class="r"></span></div>' +
      '<div class="atv">' + D.atividades.map(function (a) { return "<span>" + a + "</span>"; }).join("") + "</div>" +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">3.</span><h2>Empresas que já nos receberam</h2><span class="r"></span></div>' +
      '<div class="marquee"><div class="marquee-in">' +
        D.empresas.concat(D.empresas).map(function (e) { return '<img src="' + e.logo + '" alt="' + esc(e.nome) + '"' + (e.logoBg === "dark" ? ' style="filter:brightness(0)"' : "") + '>'; }).join("") +
      "</div></div>" +
    "</div>";

  /* ---------- Eventos ---------- */
  var selo = { "aberta": "aberto", "encerrada": "fechado" };
  $("p-eventos").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Próximos <i>eventos</i></h2><span class="r"></span></div>' +
    '<p class="blk-note">Reunião, aula, visita e social são o mesmo objeto: nascem como aviso no mural, podem abrir inscrição e têm presença que abre sozinha no dia.</p>' +
    '<div class="idx">' +
      D.eventos.filter(function (e) { return e.inscricao === "aberta"; }).map(function (e) {
        return '<a class="irow" href="#">' +
          '<div class="linha"><span class="k">' + e.tipo + "</span><h3>" + e.titulo + '</h3><span class="wh">' + e.data + "</span><span class=\"go\">→</span></div>" +
          '<div class="sub"><span>' + e.local + "</span>" +
          '<span class="st ' + e.inscricao + '">inscrição ' + e.inscricao + "</span>" +
          (e.vagas ? "<span>· " + e.vagas + "</span>" : "") +
          "<span>· presença " + e.presenca + "</span></div></a>";
      }).join("") +
    "</div></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Já aconteceram</h2><span class="r"></span></div>' +
    '<div class="idx">' +
      D.eventos.filter(function (e) { return e.inscricao === "encerrada"; }).map(function (e) {
        return '<div class="irow"><div class="linha"><span class="k">' + e.tipo + "</span><h3>" + e.titulo + '</h3><span class="wh">' + e.data + "</span></div>" +
          '<div class="sub"><span class="st encerrada">' + e.presenca + "</span></div></div>";
      }).join("") +
    "</div></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">3.</span><h2>Novo evento <i>(diretoria)</i></h2><span class="r"></span></div>' +
    '<div class="fields linha">' +
      '<div class="fld"><label>Título</label><input type="text" placeholder="Reunião semanal — plano do 4º tri"></div>' +
      '<div class="fld"><label>Tipo</label><select><option>Reunião</option><option>Aula</option><option>Visita</option><option>Social</option></select></div>' +
      '<div class="fld"><label>Data</label><input type="date"></div>' +
      '<button class="btn btn-p">Publicar no mural</button>' +
    "</div></div>";

  /* ---------- Membros ---------- */
  $("p-membros").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Solicitações de acesso</h2><span class="r"></span></div>' +
      '<p class="blk-note">Quem pede entrada pelo formulário público cai aqui — a diretoria decide no mesmo lugar.</p>' +
      D.pendentes.map(function (p) {
        return '<div class="sol"><div><b>' + p.nome + "</b><span>" + p.meta + '</span></div><div class="ac">' +
          '<button class="btn btn-p btn-s">Aprovar</button><button class="btn btn-g btn-s">Recusar</button></div></div>';
      }).join("") +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Quadro de membros</h2><span class="r"></span></div>' +
    '<div class="quadro">' +
      D.membros.map(function (m) {
        return '<div class="mrow"><img src="' + m.foto + '" alt="">' +
          '<div class="id"><b>' + m.nome + "</b><span>" + m.curso + " · " + m.ano + "</span></div>" +
          '<div class="tags">' + m.interesses.slice(0, 3).map(function (i) { return "<span>" + i + "</span>"; }).join("") + "</div>" +
          '<div class="lado"><span class="turma">' + (m.turma || "—") + "</span>" +
          (m.cargo !== "Membro" ? '<span class="cargo">' + m.cargo + "</span>" : "") +
          '<span class="selo ' + (m.status === "ativa" ? "aberto" : "fechado") + '">' + m.status + "</span></div></div>";
      }).join("") +
    "</div></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">3.</span><h2>Visitantes nas próximas atividades</h2><span class="r"></span></div>' +
      '<div class="vazio"><b>Nenhum visitante registrado.</b><span>Convites por QR e listas de porta aparecem aqui assim que a diretoria abrir uma visita ou aula a convidados.</span></div>' +
    "</div>";

  /* ---------- Gastos ---------- */
  var estG = { "pago": "aberto", "aprovado": "andando", "pendente": "pendente", "recusado": "negado" };
  $("p-gastos").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Lançar gasto</h2><span class="r"></span></div>' +
      '<div class="fields linha">' +
        '<div class="fld"><label>Item</label><input type="text" placeholder="Uber ida — visita NOMAD (4 pax)"></div>' +
        '<div class="fld"><label>Valor</label><input type="text" placeholder="R$ 0,00"></div>' +
        '<div class="fld"><label>Anexo</label><input type="text" placeholder="nota ou comprovante"></div>' +
        '<button class="btn btn-p">Lançar</button>' +
      "</div></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Extrato da liga</h2><span class="r"></span></div>' +
      '<p class="blk-note">Todo membro lança; a diretoria decide. R$ 307,30 pendentes de decisão · R$ 96,40 pagos em setembro.</p>' +
      '<table class="razao"><thead><tr><th>Item</th><th>Dono</th><th>Data</th><th class="v">Valor</th><th>Estado</th></tr></thead><tbody>' +
        D.gastos.map(function (g) {
          return "<tr><td>" + g.item + '<span class="meta">' + g.id + (g.motivo ? " · " + g.motivo : "") + "</span></td>" +
            "<td>" + g.dono + "</td><td>" + g.data + '</td><td class="v">' + g.valor + "</td>" +
            '<td><span class="selo ' + estG[g.estado] + '">' + g.estado + "</span></td></tr>";
        }).join("") +
      "</tbody></table></div>";

  /* ---------- Diretoria ---------- */
  $("p-diretoria").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Encontros externos</h2><span class="r"></span></div>' +
      '<p class="blk-note">Agenda da diretoria fora do campus — parcerias, alumni e janelas de visita.</p>' +
      '<div class="idx">' +
        D.diretoria.map(function (d) {
          return '<div class="irow"><div class="linha"><span class="k">' + d.data + "</span><h3>" + d.titulo + "</h3></div>" +
            '<div class="sub" style="padding-left:86px"><span>' + d.obs + "</span></div></div>";
        }).join("") +
      "</div></div>";

  /* ---------- Acessos ---------- */
  $("p-acessos").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Sessões dos últimos 7 dias</h2><span class="r"></span></div>' +
      '<table class="razao"><thead><tr><th>Membro</th><th>Papel</th><th>Último acesso</th><th class="v">Sessões</th><th>Origem</th></tr></thead><tbody>' +
        D.acessos.map(function (a) {
          return "<tr><td>" + a.membro + "</td><td>" + a.papel + "</td><td>" + a.ultimo + '</td><td class="v">' + a.sessoes7d + "</td><td>" + a.origem + "</td></tr>";
        }).join("") +
      "</tbody></table></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Alertas de segurança</h2><span class="r"></span></div>' +
      '<div class="vazio"><b>Nenhuma sessão bloqueada nos últimos 30 dias.</b><span>Tentativas de login com senha errada demais ou origem nova aparecem aqui com o IP truncado.</span></div>' +
    "</div>";

  /* ---------- Legado ---------- */
  $("p-legado").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>O que ficou</h2><span class="r"></span></div>' +
      '<p class="blk-note">A 1ª Imersão em São Paulo, 19–24/07/2026 — o que era operação da semana virou referência permanente da liga.</p>' +
      D.legado.map(function (l) {
        return '<div class="pion"><h4>' + l.titulo + "</h4><p>" + l.texto + "</p></div>";
      }).join("") +
    "</div>";

  /* ---------- Empresas ---------- */
  $("p-empresas").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>As 12 visitas</h2><span class="r"></span></div>' +
      '<div class="chips-emp">' +
        D.empresas.map(function (e, i) {
          return '<button class="' + (i === 0 ? "active" : "") + '">' + e.nome + "</button>";
        }).join("") +
      "</div>" +
      '<div class="empresa">' +
        '<div class="cab"><img class="logo" src="' + D.empresas[0].logo + '" alt=""><div><h3>' + D.empresaDetalhe.nome + "</h3>" +
        '<span class="dia">' + D.empresaDetalhe.dia + " · " + D.empresaDetalhe.endereco + "</span></div></div>" +
        '<div class="dl3">' +
          "<div><h4>Aprendizados</h4><ul>" + D.empresaDetalhe.aprendizados.map(function (a) { return "<li>" + a + "</li>"; }).join("") + "</ul></div>" +
          "<div><h4>Materiais</h4><ul>" + D.empresaDetalhe.materiais.map(function (m) { return '<li><a href="#">' + m.nome + '</a><span class="meta">' + m.tipo + " · " + m.tamanho + "</span></li>"; }).join("") + "</ul></div>" +
          "<div><h4>Perguntas preparadas</h4><ul>" + D.empresaDetalhe.perguntas.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul></div>" +
        "</div>" +
      "</div></div>";

  /* ---------- Selos ---------- */
  $("p-selos").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Selos da imersão</h2><span class="r"></span></div>' +
      '<p class="blk-note">Marcos conquistados pelos membros — contam quem participou, quem registrou e quem recebeu empresa.</p>' +
      D.selos.map(function (s) {
        return '<div class="selo-item"><span class="glifo">' + s.icone + '</span><div><b>' + s.nome + "</b><span>" + s.desc + '</span></div><span class="q">' + s.qtd + " <i>membros</i></span></div>";
      }).join("") +
    "</div>";

  /* ---------- Roteiro ---------- */
  $("p-roteiro").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Onde ficamos</h2><span class="r"></span></div>' +
      "<p><b style='color:var(--ink)'>" + D.roteiro.hotel.nome + "</b> — " + D.roteiro.hotel.endereco + "</p>" +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Dia a dia</h2><span class="r"></span></div>' +
      '<div class="dias">' +
        D.roteiro.dias.map(function (d, i) {
          return '<button class="' + (i === 1 ? "active" : "") + '"><b>' + d.dia.split(" ")[0] + "</b><span>" + d.dia.split(" ")[1] + "</span></button>";
        }).join("") +
      "</div>" +
      '<p class="blk-note" style="padding-left:0">' + D.roteiro.dias[1].nota + "</p>" +
      D.roteiro.dias[1].paradas.map(function (p) {
        var partes = p.split(" · ");
        return '<div class="parada"><span class="h">' + (partes[0].match(/\d/) ? partes[0] : "—") + "</span><b>" + (partes[1] || partes[0]) + "</b></div>";
      }).join("") +
    "</div>";

  /* ---------- A missão ---------- */
  $("p-missao").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>A missão <i>' + D.missao.titulo + "</i></h2><span class=\"r\"></span></div>" +
      "<p style='font-size:14.5px;line-height:1.7;max-width:62ch;color:var(--ink-2)'>" + D.missao.resumo + "</p>" +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Objetivos</h2><span class="r"></span></div>' +
      '<ul class="obj">' + D.missao.objetivos.map(function (o) { return "<li>" + o + "</li>"; }).join("") + "</ul>" +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">3.</span><h2>O que foi pioneiro</h2><span class="r"></span></div>' +
      D.missao.pioneiros.map(function (p) { return '<div class="pion"><h4>' + p.titulo + "</h4><p>" + p.texto + "</p></div>"; }).join("") +
    "</div>";

  /* ---------- Arquivo ---------- */
  $("p-arquivo").innerHTML =
    '<div class="blk"><div class="blk-head"><span class="n">1.</span><h2>Trajetos entre visitas</h2><span class="r"></span></div>' +
      '<table class="razao"><thead><tr><th>Dia</th><th>Perna</th><th>Modo</th><th class="v">Tempo</th></tr></thead><tbody>' +
        D.arquivo.trajetos.map(function (t) {
          return "<tr><td>" + t.dia + "</td><td>" + t.perna + "</td><td>" + t.modo + '</td><td class="v">' + t.tempo + "</td></tr>";
        }).join("") +
      "</tbody></table></div>" +
    '<div class="blk"><div class="blk-head"><span class="n">2.</span><h2>Alocação de quartos</h2><span class="r"></span></div>' +
      D.roteiro.quartos.map(function (q) {
        return '<div class="quarto"><b>' + q.label + "</b><span>" + q.membros.join(" · ") + "</span></div>";
      }).join("") +
    "</div>" +
    '<div class="blk"><div class="blk-head"><span class="n">3.</span><h2>Combinados da viagem</h2><span class="r"></span></div>' +
      '<ul class="chk">' + D.arquivo.checklist.map(function (c) {
        return '<li class="' + (c.feito ? "feito" : "") + '"><span class="bx">' + (c.feito ? "✓" : "") + "</span>" + c.texto + "</li>";
      }).join("") + "</ul>" +
    "</div>";
})();
