/* P3 · Fluxo — painéis data-forward: tiles, barras, cards de evento. */
(function () {
  var D = LEPV_DATA;
  function $(id) { return document.getElementById(id); }
  function head(t, ajuda, acao) {
    return '<div class="page-head"><div><h1>' + t + "</h1><p>" + ajuda + '</p></div><div class="ac">' + (acao || "") + "</div></div>";
  }

  /* nav: liga + separador + acervo (pills mudam de cor no grupo) */
  var liga = [["inicio","Início"],["eventos","Eventos"],["membros","Membros"],["gastos","Gastos"],["diretoria","Diretoria"],["acessos","Acessos"]];
  var acervo = [["legado","Legado"],["empresas","Empresas"],["selos","Selos"],["roteiro","Roteiro"],["missao","A missão"],["arquivo","Arquivo"]];
  $("tabs").innerHTML =
    liga.map(function (a) { return '<button data-tab="' + a[0] + '" aria-selected="false">' + a[1] + "</button>"; }).join("") +
    '<span class="sep"></span>' +
    acervo.map(function (a) { return '<button data-tab="' + a[0] + '" class="acervo" aria-selected="false">' + a[1] + "</button>"; }).join("");

  /* ---------- Início ---------- */
  $("p-inicio").innerHTML =
    '<div class="hero-wash"><div class="hero-row"><span class="tile"><img src="../_assets/logo-mark.png" alt=""></span>' +
      '<div><span class="pre">Liga de Empreendedorismo da Praia Vermelha</span>' +
      "<h1>A liga em movimento</h1>" +
      "<p>Reuniões, aulas, visitas e imersões dentro das empresas — a primeira levou 11 membros a São Paulo, com 12 visitas em 6 dias.</p></div></div></div>" +
    '<div class="metricas">' +
      '<div class="met"><b>11</b><span>Membros ativos</span><div class="barra"><i style="width:73%"></i></div></div>' +
      '<div class="met"><b>XVII–XXX</b><span>Turmas na liga</span><div class="barra"><i style="width:54%"></i></div></div>' +
      '<div class="met"><b>12</b><span>Empresas na rede</span><div class="barra"><i style="width:100%"></i></div></div>' +
      '<div class="met"><b>1ª</b><span>Imersão · SP 2026</span><div class="barra"><i style="width:100%"></i></div></div>' +
    "</div>" +
    '<div class="card"><h2>Mural da liga</h2><p class="ajuda">Avisos da diretoria e o que abriu inscrição.</p>' +
      D.mural.map(function (m) {
        return '<div class="mural-item"><span class="tag' + (m.tipo === "inscricao" ? " info" : "") + '">' + m.tipo + "</span><div><b>" + m.titulo + "</b><p>" + m.texto + "</p></div></div>";
      }).join("") +
    "</div>" +
    '<div class="card"><h2>Nossas atividades</h2><div class="atv">' +
      D.atividades.map(function (a) { return "<span>" + a + "</span>"; }).join("") + "</div></div>" +
    '<div class="card"><h2>Empresas na rede</h2><p class="ajuda">As 12 que já receberam a liga.</p>' +
      '<div class="logos-strip">' + D.empresas.map(function (e) { return '<span class="lg' + (e.logoBg === "dark" ? " esc" : "") + '"><img src="' + e.logo + '" alt="' + e.nome + '"></span>'; }).join("") + "</div></div>";

  /* ---------- Eventos ---------- */
  function vagasBar(e) {
    if (!e.vagas) return "";
    var m = e.vagas.match(/(\d+) de (\d+)/);
    if (!m) return "";
    var restam = +m[1], total = +m[2];
    var pct = Math.round(((total - restam) / total) * 100);
    return '<div class="pe"><div class="barra"><i style="width:' + pct + '%"></i></div><span>' + e.vagas + "</span></div>";
  }
  $("p-eventos").innerHTML =
    head("Eventos", "Reunião, aula, visita e social — inscrição e presença no mesmo objeto.", '<button class="btn btn-p">Novo evento</button>') +
    '<div class="ev-grid">' +
      D.eventos.filter(function (e) { return e.inscricao === "aberta"; }).map(function (e) {
        return '<div class="ev-card"><div class="topo"><span class="tipo">' + e.tipo + '</span><span class="pill aberto" style="margin-left:auto">inscrição aberta</span></div>' +
          "<h3>" + e.titulo + '</h3><span class="meta">' + e.data + " · " + e.local + "</span>" +
          (vagasBar(e) || '<div class="pe"><span>presença ' + e.presenca + "</span></div>") + "</div>";
      }).join("") +
    "</div>" +
    '<div class="card" style="margin-top:16px"><h2>Já aconteceram</h2><p class="ajuda">Registro de presença dos últimos eventos.</p>' +
      '<table class="lst"><tbody>' +
      D.eventos.filter(function (e) { return e.inscricao === "encerrada"; }).map(function (e) {
        return "<tr><td>" + e.titulo + '<span class="meta">' + e.tipo + " · " + e.data + "</span></td>" +
          '<td style="text-align:right"><span class="pill fechado">' + e.presenca + "</span></td></tr>";
      }).join("") +
      "</tbody></table></div>" +
    '<div class="card"><h2>Criar evento <span style="font-size:12px;font-weight:500;color:var(--ink-3)">(diretoria)</span></h2>' +
      '<div class="fields linha">' +
        '<div class="fld"><label>Título</label><input type="text" placeholder="Reunião semanal — plano do 4º tri"></div>' +
        '<div class="fld"><label>Tipo</label><select><option>Reunião</option><option>Aula</option><option>Visita</option><option>Social</option></select></div>' +
        '<div class="fld"><label>Data</label><input type="date"></div>' +
        '<button class="btn btn-p">Publicar</button>' +
      "</div></div>";

  /* ---------- Membros ---------- */
  $("p-membros").innerHTML =
    head("Membros", "O quadro da liga — turma, curso e o que cada um acompanha.") +
    '<div class="card"><h2>Solicitações de acesso</h2><p class="ajuda">Pedidos do formulário público.</p>' +
      D.pendentes.map(function (p) {
        return '<div class="sol"><div><b>' + p.nome + "</b><span>" + p.meta + '</span></div><div class="ac">' +
          '<button class="btn btn-p btn-s">Aprovar</button><button class="btn btn-g btn-s">Recusar</button></div></div>';
      }).join("") + "</div>" +
    '<div class="membros-g">' +
      D.membros.map(function (m) {
        return '<div class="membro"><div class="id"><img src="' + m.foto + '" alt=""><div><b>' + m.nome + "</b><span>" + m.curso + " · " + m.ano + "</span></div>" +
          (m.cargo !== "Membro" ? '<span class="cargo" style="margin-left:auto">' + m.cargo + "</span>" : "") + "</div>" +
          '<div class="tags">' + m.interesses.slice(0, 3).map(function (i) { return "<i>" + i + "</i>"; }).join("") + "</div>" +
          '<div class="pe"><span>turma ' + (m.turma || "—") + "</span><span>" + m.status + "</span></div></div>";
      }).join("") +
    "</div>" +
    '<div class="card" style="margin-top:16px"><h2>Visitantes</h2><p class="ajuda">Convites por QR e listas de porta.</p>' +
      '<div class="vazio"><b>Nenhum visitante nas próximas atividades.</b><span>Quando uma visita abrir para convidados, a lista aparece aqui.</span></div></div>';

  /* ---------- Gastos ---------- */
  var estG = { "pago": "aberto", "aprovado": "andando", "pendente": "pendente", "recusado": "negado" };
  $("p-gastos").innerHTML =
    head("Centro de gastos", "Todo membro lança; a diretoria decide. Anexos sigilosos.", '<button class="btn btn-p">Lançar gasto</button>') +
    '<div class="metricas">' +
      '<div class="met"><b>R$ 307</b><span>Pendentes de decisão</span><div class="barra"><i style="width:62%"></i></div></div>' +
      '<div class="met"><b>R$ 84</b><span>Aprovados, a pagar</span><div class="barra"><i style="width:17%"></i></div></div>' +
      '<div class="met"><b>R$ 96</b><span>Pagos em setembro</span><div class="barra"><i style="width:20%"></i></div></div>' +
      '<div class="met"><b>5</b><span>Lançamentos no mês</span><div class="barra"><i style="width:42%"></i></div></div>' +
    "</div>" +
    '<div class="card"><h2>Extrato</h2>' +
      '<table class="lst"><thead><tr><th>Item</th><th>Dono</th><th>Data</th><th class="v">Valor</th><th>Estado</th></tr></thead><tbody>' +
        D.gastos.map(function (g) {
          return "<tr><td>" + g.item + '<span class="meta">' + g.id + (g.motivo ? " · " + g.motivo : "") + "</span></td>" +
            "<td>" + g.dono + "</td><td>" + g.data + '</td><td class="v">' + g.valor + "</td>" +
            '<td><span class="pill ' + estG[g.estado] + '">' + g.estado + "</span></td></tr>";
        }).join("") +
      "</tbody></table></div>";

  /* ---------- Diretoria ---------- */
  $("p-diretoria").innerHTML =
    head("Diretoria", "Encontros externos — parcerias, alumni e janelas de visita.", '<button class="btn btn-g">+ Encontro</button>') +
    '<div class="card"><table class="lst"><thead><tr><th>Data</th><th>Encontro</th><th>Notas</th></tr></thead><tbody>' +
      D.diretoria.map(function (d) {
        return "<tr><td>" + d.data + "</td><td>" + d.titulo + "</td><td>" + d.obs + "</td></tr>";
      }).join("") +
    "</tbody></table></div>";

  /* ---------- Acessos ---------- */
  $("p-acessos").innerHTML =
    head("Acessos", "Sessões por membro — visível só para super admin.") +
    '<div class="card"><table class="lst"><thead><tr><th>Membro</th><th>Papel</th><th>Último acesso</th><th class="v">Sessões 7d</th><th>Origem</th></tr></thead><tbody>' +
      D.acessos.map(function (a) {
        return "<tr><td>" + a.membro + "</td><td>" + a.papel + "</td><td>" + a.ultimo + '</td><td class="v">' + a.sessoes7d + "</td><td>" + a.origem + "</td></tr>";
      }).join("") +
    "</tbody></table></div>" +
    '<div class="card"><h2>Alertas de segurança</h2>' +
      '<div class="vazio"><b>Tudo limpo.</b><span>Nenhuma sessão bloqueada nos últimos 30 dias.</span></div></div>';

  /* ---------- Legado ---------- */
  $("p-legado").innerHTML =
    head("Legado", "1ª Imersão em São Paulo, 19–24/07/2026.") +
    '<div class="hero-wash"><span class="pre">12 visitas · 6 dias · 11 membros</span>' +
      "<h1>A operação virou acervo</h1><p>" + D.legado[0].texto + "</p></div>" +
    '<div class="card">' +
      D.legado.slice(1).map(function (l) { return '<div class="pion"><h4>' + l.titulo + "</h4><p>" + l.texto + "</p></div>"; }).join("") +
    "</div>";

  /* ---------- Empresas ---------- */
  $("p-empresas").innerHTML =
    head("Empresas", "As 12 visitas — aprendizados, materiais e perguntas de cada uma.") +
    '<div class="chips-emp">' + D.empresas.map(function (e, i) { return '<button class="' + (i === 0 ? "active" : "") + '">' + e.nome + "</button>"; }).join("") + "</div>" +
    '<div class="card empresa">' +
      '<div class="cab"><span class="lg"><img src="' + D.empresas[0].logo + '" alt=""></span><div><h3>' + D.empresaDetalhe.nome + '</h3><span class="dia">' + D.empresaDetalhe.dia + " · " + D.empresaDetalhe.endereco + "</span></div></div>" +
      '<div class="cols3">' +
        "<div><h4>Aprendizados</h4><ul>" + D.empresaDetalhe.aprendizados.map(function (a) { return "<li>" + a + "</li>"; }).join("") + "</ul></div>" +
        "<div><h4>Materiais</h4><ul>" + D.empresaDetalhe.materiais.map(function (m) { return '<li><a href="#">' + m.nome + '</a><span class="meta">' + m.tipo + " · " + m.tamanho + "</span></li>"; }).join("") + "</ul></div>" +
        "<div><h4>Perguntas</h4><ul>" + D.empresaDetalhe.perguntas.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul></div>" +
      "</div></div>";

  /* ---------- Selos ---------- */
  $("p-selos").innerHTML =
    head("Selos", "Marcos dos membros na imersão e na liga.") +
    '<div class="selo-g">' +
      D.selos.map(function (s) {
        return '<div class="selo-card"><span class="glifo">' + s.icone + '</span><div><b>' + s.nome + "</b><span>" + s.desc + '</span></div><span class="q">' + s.qtd + "</span></div>";
      }).join("") +
    "</div>";

  /* ---------- Roteiro ---------- */
  $("p-roteiro").innerHTML =
    head("Roteiro", "Seis dias em São Paulo — " + D.roteiro.hotel.nome + ", " + D.roteiro.hotel.endereco + ".") +
    '<div class="dias">' + D.roteiro.dias.map(function (d, i) { return '<button class="' + (i === 1 ? "active" : "") + '"><b>' + d.dia.split(" ")[0] + "</b><span>" + d.dia.split(" ")[1] + "</span></button>"; }).join("") + "</div>" +
    '<div class="card"><h2>' + D.roteiro.dias[1].dia + '</h2><p class="ajuda">' + D.roteiro.dias[1].nota + "</p>" +
      '<div class="linha-t">' +
      D.roteiro.dias[1].paradas.map(function (p) {
        var partes = p.split(" · ");
        return '<div class="parada"><span class="h">' + (partes[0].match(/\d/) ? partes[0] : "—") + "</span><b>" + (partes[1] || partes[0]) + "</b></div>";
      }).join("") +
      "</div></div>" +
    '<div class="card"><h2>Alocação de quartos</h2>' +
      D.roteiro.quartos.map(function (q) { return '<div class="quarto"><b>' + q.label + "</b><span>" + q.membros.join(" · ") + "</span></div>"; }).join("") +
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
    head("Arquivo", "Trajetos, quartos e combinados — o manual da próxima imersão.") +
    '<div class="card"><h2>Trajetos entre visitas</h2><table class="lst"><thead><tr><th>Dia</th><th>Perna</th><th>Modo</th><th class="v">Tempo</th></tr></thead><tbody>' +
      D.arquivo.trajetos.map(function (t) { return "<tr><td>" + t.dia + "</td><td>" + t.perna + "</td><td>" + t.modo + '</td><td class="v">' + t.tempo + "</td></tr>"; }).join("") +
    "</tbody></table></div>" +
    '<div class="card"><h2>Combinados da viagem</h2><ul class="chk">' +
      D.arquivo.checklist.map(function (c) { return '<li class="' + (c.feito ? "feito" : "") + '"><span class="bx">✓</span>' + c.texto + "</li>"; }).join("") +
    "</ul></div>";
})();
