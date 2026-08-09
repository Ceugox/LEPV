(function () {
  function mapsSearch(addr) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
  }

  // Conteúdo digitado por membro (checklist, perguntas etc.) passa por aqui
  // antes de entrar em innerHTML — o resto dos dados vem dos JSONs do repo.
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function api(path, opts) {
    return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts)).then(function (r) {
      if (r.status === 401) {
        window.location.href = "/login.html";
        return Promise.reject(new Error("not authenticated"));
      }
      return r.json();
    });
  }

  // ---- Auth / topbar ----
  var currentUser = null;
  var meReady = api("/api/me").then(function (me) {
    currentUser = me;
    // Quem entrou com o código inicial precisa definir a própria senha
    // antes de usar o app.
    if (me.mustChangePassword) {
      window.location.href = "/login.html?setpass=1";
      return new Promise(function () {}); // segura os loaders até o redirect
    }
    document.getElementById("who-name").textContent = me.name;
    return me;
  });
  document.getElementById("logout-btn").addEventListener("click", function () {
    api("/api/logout", { method: "POST" }).then(function () {
      // Fotos e telas em cache não são do próximo usuário deste navegador.
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage("clear-cache");
      }
      window.location.href = "/login.html";
    });
  });

  // ---- Quartos (alocação do hotel — hoje é registro, mora no Arquivo) ----
  // Durante a viagem isso era um botão flutuante em todas as abas; acabou a
  // viagem, virou uma ficha do arquivo como qualquer outro bastidor.
  function loadRooms() {
    api("/api/itinerary").then(function (data) {
      var el = document.getElementById("room-list");
      if (!el) return;
      if (!data.hotel.rooms || !data.hotel.rooms.length) {
        el.innerHTML = '<p class="empty-state">Sem alocação registrada.</p>';
        return;
      }
      el.innerHTML = data.hotel.rooms
        .map(function (r) {
          var itemsHtml = r.members.map(function (m) { return "<li>" + m + "</li>"; }).join("");
          return '<div class="room-group"><p class="rlabel">' + r.label + '</p><ul>' + itemsHtml + "</ul></div>";
        })
        .join("");
    }).catch(function () {});
  }

  // ---- Tabs (compartilhado por nav principal, seletores de dia e de empresa) ----
  function syncTabState(container) {
    container.querySelectorAll('[role="tab"]').forEach(function (b) {
      var selected = b.classList.contains("active");
      b.setAttribute("aria-selected", selected ? "true" : "false");
      b.setAttribute("tabindex", selected ? "0" : "-1");
    });
  }
  function wireTablist(container, vertical) {
    container.addEventListener("keydown", function (e) {
      var keys = vertical ? ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
      if (keys.indexOf(e.key) === -1) return;
      var tabs = Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      var forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      var next = forward ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });
  }

  var tabButtons = document.querySelectorAll("nav.tabs button[data-tab]");
  var panels = document.querySelectorAll(".panel");
  wireTablist(document.getElementById("tabs"));

  function activateTab(name) {
    currentTab = name;
    // Consulta viva (não a NodeList do load): a aba Acessos do super admin é
    // injetada depois e precisa entrar na dança de ativação como as demais.
    document.querySelectorAll("nav.tabs button[data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    syncTabState(document.getElementById("tabs"));
    panels.forEach(function (p) {
      var isActive = p.id === "panel-" + name;
      p.classList.toggle("active", isActive);
      if (isActive) {
        p.classList.remove("fade-in");
        void p.offsetWidth;
        p.classList.add("fade-in");
      }
    });
    // Tudo pode mudar entre visitas (novo membro aprovado, presença marcada,
    // material publicado) — recarrega a aba a cada ativação. Os JSONs são
    // pequenos e os loaders preservam o dia/empresa selecionados.
    loaders[name] && loaders[name]();
    sendPing();
  }
  tabButtons.forEach(function (b) {
    b.addEventListener("click", function () { activateTab(b.dataset.tab); });
  });

  // Batimento de permanência: um ping por minuto com a página visível (e um a
  // cada troca de aba) conta ao servidor quanto tempo cada um fica e onde —
  // sem isso, uma aba aberta parada não vira tempo no painel de acessos.
  // fetch cru de propósito: um 401 aqui não deve redirecionar ninguém no
  // meio do uso; a próxima ação real do usuário cuida disso.
  var currentTab = "inicio";
  function sendPing() {
    if (document.visibilityState !== "visible") return;
    fetch("/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: currentTab }),
    }).catch(function () {});
  }
  setInterval(sendPing, 60000);

  // A aba Acessos só existe para o super admin — nem chega ao DOM dos demais
  // (e o servidor exige o papel de novo na rota, o botão é só a porta).
  meReady.then(function (me) {
    if (!me.superadmin || document.getElementById("tab-acessos")) return;
    var btn = document.createElement("button");
    btn.dataset.tab = "acessos";
    btn.dataset.group = "liga";
    btn.id = "tab-acessos";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", "panel-acessos");
    btn.setAttribute("aria-selected", "false");
    btn.setAttribute("tabindex", "-1");
    btn.textContent = "Acessos";
    var membros = document.getElementById("tab-membros");
    membros.parentNode.insertBefore(btn, membros.nextSibling);
    btn.addEventListener("click", function () { activateTab("acessos"); });
  });

  // A nav tem dois grupos: a liga (padrão, identidade preto+vinho da logo) e
  // o acervo da imersão (identidade navy+vermelho SP), aberto pela aba
  // Membros só para quem participou. A troca de tema é via body.imersao.
  function setNavGroup(group) {
    document.querySelectorAll("nav.tabs button[data-group]").forEach(function (b) {
      b.classList.toggle("group-hidden", b.dataset.group !== group);
    });
    var imersao = group === "imersao";
    document.body.classList.toggle("imersao", imersao);
    document.getElementById("brand-logo").src = imersao ? "/logo.png" : "/logo-liga.png";
    document.getElementById("brand-b1").innerHTML = imersao ? 'LEPV <span class="accent">SP</span>' : "LEPV";
    document.getElementById("brand-b2").textContent = imersao
      ? "Acervo da 1ª Imersão"
      : "Liga de Empreendedorismo da Praia Vermelha";
  }
  document.getElementById("back-liga").addEventListener("click", function () {
    setNavGroup("liga");
    activateTab("membros");
  });
  function openImmersion() {
    setNavGroup("imersao");
    activateTab("legado");
  }

  // ---- Início (quem somos + carrosséis) ----
  // Conteúdo institucional fixo: fotos das atividades (acervo público em
  // /gallery) e as empresas que já receberam a liga.
  var INICIO_FOTOS = [
    "liga-01", "liga-02", "liga-03", "liga-04", "liga-05", "liga-06",
    "liga-07", "liga-08", "liga-09", "liga-10", "liga-11", "liga-12",
    "liga-13", "liga-14", "liga-15", "liga-16", "liga-17", "liga-18",
    "liga-19", "liga-20", "liga-21",
  ];
  // Marquee escuro de logos (referência aprovada): band preto, logos
  // monocromáticos brancos — sharpi/segura têm fundo opaco, viram wordmark.
  var INICIO_ROW1 = [
    { name: "NOMAD", logo: "/logos/nomad-mono.svg" },
    { name: "Mottu", logo: "/logos/mottu.svg" },
    { name: "Insper", logo: "/logos/insper.png" },
    { name: "Link", logo: "/logos/link.png", scale: 1.2 },
    { name: "Mirow & Co.", logo: "/logos/mirow.svg" },
    { name: "Sharpi", word: true },
  ];
  var INICIO_ROW2 = [
    { name: "Bain & Company", logo: "/logos/bain.svg" },
    { name: "Revolut", logo: "/logos/revolut.svg" },
    { name: "Segura", word: true },
    { name: "PAX", logo: "/logos/pax.svg" },
    { name: "ENTER", logo: "/logos/enter.svg" },
    { name: "Tivita", logo: "/logos/tivita.svg" },
  ];
  function marqueeItemHtml(c) {
    if (c.word) return '<span class="m-word">' + c.name + "</span>";
    var style = c.scale ? ' style="height:' + Math.round(27 * c.scale) + 'px"' : "";
    return '<img class="m-logo" src="' + c.logo + '" alt="' + c.name + '" loading="lazy"' + style + ">";
  }
  function fillMarqueeRow(id, items, duration) {
    var row = document.getElementById(id);
    var track = '<div class="m-track" style="--duration:' + duration + '">' + items.map(marqueeItemHtml).join("") + "</div>";
    // 3 cópias da trilha: o loop translateX(-100% - gap) nunca mostra buraco em telas largas
    var hidden = track.replace('class="m-track"', 'class="m-track" aria-hidden="true"');
    row.innerHTML = track + hidden + hidden;
  }
  var inicioBuilt = false;

  // ---- Mural da liga: carrossel de avisos da diretoria + próximas atividades ----
  var muralSlides = [];
  var muralIndex = 0;
  var muralTimer = null;
  var muralWired = false;

  function muralShow(i) {
    if (!muralSlides.length) return;
    muralIndex = (i + muralSlides.length) % muralSlides.length;
    document.querySelectorAll("#mural-stage .mural-slide").forEach(function (el, idx) {
      el.classList.toggle("active", idx === muralIndex);
    });
    document.querySelectorAll("#mural-dots button").forEach(function (d, idx) {
      d.classList.toggle("active", idx === muralIndex);
    });
  }
  function muralRestartTimer() {
    if (muralTimer) { clearInterval(muralTimer); muralTimer = null; }
    if (muralSlides.length < 2) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    muralTimer = setInterval(function () { muralShow(muralIndex + 1); }, 7000);
  }
  function muralSlideHtml(s) {
    var photoHtml = s.photos && s.photos.length
      ? '<div class="mural-photo" style="background-image:url(\'' + esc(s.photos[0]) + '\')"></div>'
      : "";
    var thumbsHtml = s.photos && s.photos.length > 1
      ? '<div class="mural-thumbs">' + s.photos.slice(1).map(function (u) {
          return '<img src="' + esc(u) + '" alt="Foto do aviso" loading="lazy">';
        }).join("") + "</div>"
      : "";
    var ctaHtml = s.cta
      ? '<div class="mural-cta"><button type="button" data-goto-tab="' + esc(s.cta.tab) + '">' + esc(s.cta.label) + "</button></div>"
      : "";
    return (
      '<div class="mural-slide">' +
        photoHtml +
        '<div class="mural-body">' +
          '<div class="mural-meta">' +
            '<span class="mural-tag' + (s.auto ? " auto" : "") + '">' + esc(s.tag) + "</span>" +
            '<span class="mural-date num">' + fmtDateBR(s.date) + "</span>" +
          "</div>" +
          '<h3 class="mural-title">' + esc(s.title) + "</h3>" +
          (s.text ? '<p class="mural-text">' + esc(s.text) + "</p>" : "") +
          thumbsHtml +
          ctaHtml +
          (s.by ? '<div class="mural-by">Publicado por ' + esc(s.by) + "</div>" : "") +
        "</div>" +
      "</div>"
    );
  }
  // O mural é a vitrine dos eventos: o que ainda vai acontecer primeiro (o mais
  // próximo na frente), e depois os últimos que passaram, para a página não
  // ficar vazia em semana parada.
  function renderMural(events) {
    var card = document.getElementById("mural-card");
    var hoje = new Date();
    hoje = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");

    function slideDe(ev) {
      var linhas = [];
      if (ev.text) linhas.push(ev.text);
      if (ev.signupsOpen) {
        linhas.push(
          ev.seatsLeft === 0
            ? "As vagas acabaram — dá para entrar na fila de espera."
            : ev.seatsLeft
              ? "Inscrições abertas — " + ev.seatsLeft + " de " + ev.capacity + " vagas disponíveis."
              : "Inscrições abertas — garanta a sua."
        );
      } else if (ev.attendanceState === "aberta") {
        linhas.push("Acontece hoje! Registre sua presença com o código do encontro.");
      }
      return {
        tag: TIPO_LABEL[ev.type] || "Evento",
        auto: ev.date < hoje,
        date: ev.date,
        title: ev.title,
        text: linhas.join("\n"),
        photos: (ev.photos || []).map(function (p) { return p.url; }),
        by: ev.createdByName,
        cta: { label: ev.signupsOpen && ev.myStatus === null ? "Inscrever-se" : "Ver evento", tab: "eventos" },
      };
    }

    var futuros = events.filter(function (e) { return e.date >= hoje; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var passados = events.filter(function (e) { return e.date < hoje; }).slice(0, 4);
    muralSlides = futuros.concat(passados).map(slideDe);

    if (!muralSlides.length) {
      card.style.display = "none";
      muralRestartTimer();
      return;
    }
    card.style.display = "";
    document.getElementById("mural-stage").innerHTML = muralSlides.map(muralSlideHtml).join("");
    document.getElementById("mural-dots").innerHTML = muralSlides.map(function (_, i) {
      return '<button type="button" aria-label="Slide ' + (i + 1) + '"></button>';
    }).join("");
    document.querySelectorAll("#mural-dots button").forEach(function (d, i) {
      d.addEventListener("click", function () { muralShow(i); muralRestartTimer(); });
    });

    if (!muralWired) {
      muralWired = true;
      document.getElementById("mural-prev").addEventListener("click", function () { muralShow(muralIndex - 1); muralRestartTimer(); });
      document.getElementById("mural-next").addEventListener("click", function () { muralShow(muralIndex + 1); muralRestartTimer(); });
      var stage = document.getElementById("mural-stage");
      stage.addEventListener("mouseenter", function () { if (muralTimer) { clearInterval(muralTimer); muralTimer = null; } });
      stage.addEventListener("mouseleave", muralRestartTimer);
      stage.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-goto-tab]");
        if (btn) activateTab(btn.dataset.gotoTab);
      });
    }
    muralShow(Math.min(muralIndex, muralSlides.length - 1));
    muralRestartTimer();
  }

  function loadMural() {
    Promise.all([meReady, api("/api/events")]).then(function (r) {
      renderMural(r[1].events);
      // A gestão (criar, foto, inscrição, presença) vive na aba Eventos; aqui
      // o diretor só ganha o atalho.
      var box = document.getElementById("mural-admin");
      box.innerHTML = r[0].director
        ? '<div class="card mural-admin-link"><span>Publicar aviso, abrir inscrições ou gerar o QR de presença?</span>' +
          '<button type="button" class="btn-primary btn-small" data-goto-tab="eventos">Ir para Eventos</button></div>'
        : "";
      var atalho = box.querySelector("[data-goto-tab]");
      if (atalho) atalho.addEventListener("click", function () { activateTab("eventos"); });
    }).catch(function () {});
  }

  function loadInicio() {
    api("/api/members").then(function (members) {
      document.getElementById("stat-membros").textContent = members.length;
    }).catch(function () {});
    loadMural();
    if (inicioBuilt) return;
    inicioBuilt = true;

    // Trilha duplicada = loop contínuo sem emenda visível.
    var fotosHtml = INICIO_FOTOS.map(function (f) {
      return '<img class="strip-photo" loading="lazy" src="/gallery/' + f + '.jpg" alt="Atividade da LEPV">';
    }).join("");
    document.querySelector("#strip-atividades .strip-track").innerHTML = fotosHtml + fotosHtml;

    fillMarqueeRow("inicio-row-1", INICIO_ROW1, "45s");
    fillMarqueeRow("inicio-row-2", INICIO_ROW2, "52s");
  }

  // ---- Resumo: card "agora / a seguir" (durante a viagem) ou countdown ----
  function parseTimeRange(t) {
    var m = /^(\d{1,2}):(\d{2})(?:–(\d{1,2}):(\d{2}))?$/.exec(String(t || "").trim());
    if (!m) return null;
    var start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    var end = m[3] ? parseInt(m[3], 10) * 60 + parseInt(m[4], 10) : start + 60;
    return { start: start, end: end };
  }
  function fmtStart(t) {
    return String(t).split("–")[0];
  }

  function nowStopHtml(label, stop, companiesByKey, extraLine) {
    var company = stop.companyKey ? companiesByKey[stop.companyKey] : null;
    var nowLogo = (company && company.logo) || stop.logo;
    var logoHtml = nowLogo
      ? '<span class="now-logo"><img src="' + nowLogo + '" alt=""></span>'
      : "";
    var mapHtml = isRealAddr(stop.addr)
      ? '<a target="_blank" rel="noopener" href="' + mapsSearch(stop.addr) + '">Ver no mapa ↗</a>'
      : "";
    return (
      '<div class="card now-card">' +
        '<p class="now-label">' + label + "</p>" +
        '<div class="now-main">' +
          logoHtml +
          '<div><div class="now-title">' + stop.company + '</div><div class="now-time num">' + stop.time + "</div></div>" +
        "</div>" +
        (isRealAddr(stop.addr) ? '<div class="now-addr">' + stop.addr + "</div>" : "") +
        '<div class="now-foot">' + mapHtml + '<button type="button" data-goto="agenda">Agenda do dia →</button></div>' +
        (extraLine ? '<div class="now-later">' + extraLine + "</div>" : "") +
      "</div>"
    );
  }

  function buildNowCard(itin, companiesByKey) {
    function dayDate(d) {
      var p = d.date.split("/");
      return new Date(2026, parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    }
    var now = new Date();
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = itin.days;
    var first = dayDate(days[0]);
    var last = dayDate(days[days.length - 1]);

    if (today0 < first) {
      var diff = Math.round((first - today0) / 86400000);
      return (
        '<div class="card now-card">' +
          '<p class="now-label">Contagem regressiva</p>' +
          '<div class="count-num">' + (diff === 1 ? "Falta 1 dia" : "Faltam " + diff + " dias") + "</div>" +
          '<div class="count-line">' + days[0].weekday + " " + days[0].date + " — chegada em São Paulo e check-in no " + itin.hotel.name + ".</div>" +
          '<div class="now-foot"><button type="button" data-goto="agenda">Ver a agenda da semana →</button></div>' +
        "</div>"
      );
    }
    // Imersão encerrada: o card de "agora" dá lugar ao registro do que foi.
    if (today0 > last) {
      return (
        '<div class="card now-card">' +
          '<p class="now-label">Missão cumprida</p>' +
          '<div class="now-title">' + days[0].date + " a " + days[days.length - 1].date + " — São Paulo</div>" +
          '<div class="now-later">A agenda abaixo é o registro do que foi construído. O que cada um levou de volta está na aba Legado.</div>' +
          '<div class="now-foot"><button type="button" data-goto="legado">Ver o legado →</button></div>' +
        "</div>"
      );
    }

    var today = days.find(function (d) { return dayDate(d).getTime() === today0.getTime(); });
    if (!today) return "";
    var minutes = now.getHours() * 60 + now.getMinutes();

    var current = null, next = null;
    today.stops.forEach(function (stop) {
      var r = parseTimeRange(stop.time);
      if (!r) return;
      if (minutes >= r.start && minutes < r.end && !current) current = stop;
      else if (r.start > minutes && !next) next = stop;
    });

    if (current) {
      var later = next ? "Depois: " + next.company + " às " + fmtStart(next.time) : "";
      return nowStopHtml("Acontecendo agora", current, companiesByKey, later);
    }
    if (next) return nowStopHtml("Próxima parada", next, companiesByKey, "");

    // Dia sem horários parseáveis (ex: chegada) ou já encerrado
    var untimed = today.stops.filter(function (s) { return !parseTimeRange(s.time); });
    if (untimed.length === today.stops.length && untimed.length) {
      return nowStopHtml("Hoje", untimed[0], companiesByKey, today.note || "");
    }
    var tomorrow = days.find(function (d) { return dayDate(d) > today0 && d.stops.length; });
    var tomorrowLine = tomorrow
      ? "Amanhã: " + tomorrow.stops[0].company + (parseTimeRange(tomorrow.stops[0].time) ? " às " + fmtStart(tomorrow.stops[0].time) : "")
      : "";
    return (
      '<div class="card now-card">' +
        '<p class="now-label">Hoje</p>' +
        '<div class="now-title">Programação de hoje encerrada</div>' +
        (tomorrowLine ? '<div class="now-later">' + tomorrowLine + "</div>" : "") +
        '<div class="now-foot"><button type="button" data-goto="agenda">Agenda do dia →</button></div>' +
      "</div>"
    );
  }

  // ---- Resumo ----
  function loadMission() {
    Promise.all([api("/api/mission"), api("/api/companies"), api("/api/itinerary")]).then(function (results) {
      var m = results[0];
      var companiesByKey = {};
      results[1].forEach(function (c) { companiesByKey[c.key] = c; });
      var nowHtml = buildNowCard(results[2], companiesByKey);

      var objectivesHtml = m.objectives.map(function (o) { return "<li>" + o + "</li>"; }).join("");
      var chipsHtml = m.companies.map(function (c) { return '<span class="chip">' + c + "</span>"; }).join("");

      var heroHtml =
        '<div class="card">' +
          '<h2 class="mission-title">' + m.title + "</h2>" +
          '<p class="mission-summary">' + m.summary + "</p>" +
          '<ul class="objectives">' + objectivesHtml + "</ul>" +
          '<div class="chips">' + chipsHtml + "</div>" +
        "</div>";

      var guideHtml =
        '<div class="card">' +
          '<p class="section-label">Guia da imersão (registro)</p>' +
          '<ul class="materials-list"><li>' +
            '<span class="material-icon">PDF</span>' +
            '<div class="material-main">' +
              '<div class="material-title">Guia entregue aos membros antes da viagem</div>' +
              '<div class="material-meta">Fotos do Iguatemi Stay, previsão do tempo e contexto de cada visita</div>' +
            "</div>" +
            '<div class="material-actions"><a href="/guia.pdf" target="_blank" rel="noopener">Abrir ↗</a></div>' +
          "</li></ul>" +
        "</div>";

      var pioneerHtml = m.pioneering.length
        ? '<div class="card">' +
            '<p class="section-label">O que torna essa jornada pioneira</p>' +
            '<div class="pioneer-list">' +
              m.pioneering.map(function (p) {
                return '<div class="pioneer-item"><h3>' + p.title + "</h3><p>" + p.text + "</p></div>";
              }).join("") +
            "</div>" +
          "</div>"
        : "";

      var prepareHtml = m.prepare.length
        ? '<div class="card">' +
            '<p class="section-label">Contexto de cada empresa que visitamos</p>' +
            '<div class="prepare-grid">' +
              m.prepare.map(function (p, i) {
                var c = companiesByKey[p.companyKey];
                if (!c) return "";
                var pointsHtml = p.points.map(function (pt) { return "<li>" + pt + "</li>"; }).join("");
                return (
                  '<div class="prepare-card stagger-in" style="animation-delay:' + (i * 60) + 'ms">' +
                    '<div class="prepare-head"><span class="prepare-dot" style="background:' + c.color + '"></span><span class="prepare-name">' + c.name + "</span></div>" +
                    "<ul>" + pointsHtml + "</ul>" +
                  "</div>"
                );
              }).join("") +
            "</div>" +
          "</div>"
        : "";

      var expectHtml = m.expectations.length
        ? '<div class="card">' +
            '<p class="section-label">O que buscávamos em cada visita</p>' +
            '<ul class="objectives">' + m.expectations.map(function (e) { return "<li>" + e + "</li>"; }).join("") + "</ul>" +
          "</div>"
        : "";

      var content = document.getElementById("mission-content");
      content.innerHTML = nowHtml + heroHtml + guideHtml + pioneerHtml + prepareHtml + expectHtml;
      content.querySelectorAll("[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () { activateTab(btn.dataset.goto); });
      });
    });
  }

  // ---- Membros ----

  // Fila de aprovação de novos membros — só o super admin vê e decide.
  function renderSignupPanel(me) {
    var panel = document.getElementById("signup-panel");
    if (!panel) return;
    if (!me.superadmin) { panel.innerHTML = ""; return; }
    api("/api/signups").then(function (data) {
      if (!data.pending.length) { panel.innerHTML = ""; return; }
      panel.innerHTML =
        '<div class="card signup-panel">' +
          '<p class="section-label">Solicitações de acesso (super admin) · ' + data.pending.length + "</p>" +
          data.pending.map(function (p) {
            var meta = [p.course, p.year].filter(Boolean).join(" · ");
            var when = p.requestedAt ? new Date(p.requestedAt).toLocaleDateString("pt-BR") : "";
            return (
              '<div class="signup-row" data-id="' + esc(p.id) + '">' +
                '<div class="signup-info">' +
                  '<div class="name">' + esc(p.name) + "</div>" +
                  (meta ? '<div class="meta">' + esc(meta) + "</div>" : "") +
                  ((p.interests && p.interests.length) ? '<div class="meta">' + esc(p.interests.join(", ")) + "</div>" : "") +
                  (when ? '<div class="meta">Pedido em ' + when + "</div>" : "") +
                "</div>" +
                '<div class="signup-actions">' +
                  '<button class="btn-primary btn-small" data-action="approve">Aprovar</button>' +
                  '<button class="btn-reject" data-action="reject">Recusar</button>' +
                "</div>" +
              "</div>"
            );
          }).join("") +
        "</div>";
      panel.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var row = btn.closest(".signup-row");
          if (btn.dataset.action === "reject" && !confirm("Recusar este pedido de acesso?")) return;
          row.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
          api("/api/signups/" + row.dataset.id + "/" + btn.dataset.action, { method: "POST" })
            .then(function () { loadMembers(); })
            .catch(function () { loadMembers(); });
        });
      });
    });
  }

  // Base de visitantes na aba Membros — diretoria enxerga, num lugar só, quem
  // se inscreveu pelo formulário público e quem registrou presença pelo QR.
  function renderVisitorsPanel(me) {
    var panel = document.getElementById("visitors-panel");
    if (!panel) return;
    if (!me.director && !me.superadmin) { panel.innerHTML = ""; return; }
    api("/api/visitors").then(function (data) {
      if (!data.people.length) { panel.innerHTML = ""; return; }
      var rows = data.people.map(function (p) {
        var contato = [p.email, p.phone].filter(Boolean).join(" · ");
        var perfil = [p.turma ? "Turma " + p.turma : "", p.especialidade, p.idade ? p.idade + " anos" : ""]
          .filter(Boolean).join(" · ");
        var inscricoes = p.signups.length
          ? p.signups.map(function (s) {
              var tag = s.status === "waitlist" ? " (fila)" : s.attended ? " ✓ compareceu" : "";
              return '<div class="meta">' + esc(s.title) + " · " + s.date.split("-").reverse().join("/") + esc(tag) +
                ' <button type="button" class="del-btn" data-delsignup="' + esc(s.eventId) + ":" + esc(s.signupId) + '" title="Remover inscrição">×</button></div>';
            }).join("")
          : '<span class="meta">—</span>';
        var badge = p.inviteReady ? ' <span class="invite-flag">convidar para a liga</span>' : "";
        var apagar = p.visitorId
          ? '<button type="button" class="del-btn" data-delvisitor="' + esc(p.visitorId) + '" title="Apagar ficha do visitante">×</button>'
          : "";
        return (
          "<tr><td><strong>" + esc(p.name) + "</strong>" + badge +
            (perfil ? '<div class="meta">' + esc(perfil) + "</div>" : "") + "</td>" +
          "<td>" + (contato ? esc(contato) : '<span class="meta">—</span>') + "</td>" +
          "<td>" + inscricoes + "</td>" +
          '<td class="num">' + (p.visits || 0) + "</td>" +
          "<td>" + apagar + "</td></tr>"
        );
      }).join("");
      panel.innerHTML =
        '<div class="card">' +
          '<p class="section-label">Visitantes · formulários e presenças (diretoria) · ' + data.people.length + "</p>" +
          '<p class="questions-hint">Quem se inscreveu em eventos pelo formulário público ou registrou presença pelo QR sem ser membro. Com ' + data.inviteThreshold + '+ presenças, vale o convite para entrar na liga.</p>' +
          '<div class="table-scroll"><table class="access-table"><thead><tr>' +
            "<th>Nome</th><th>Contato</th><th>Inscrições em eventos</th><th>Presenças</th><th></th>" +
          "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
        "</div>";

      panel.querySelectorAll("[data-delsignup]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!window.confirm("Remover esta inscrição do evento?")) return;
          var parts = btn.dataset.delsignup.split(":");
          api("/api/events/" + parts[0] + "/signups/" + parts[1], { method: "DELETE" })
            .then(function () { renderVisitorsPanel(me); })
            .catch(function () { renderVisitorsPanel(me); });
        });
      });
      panel.querySelectorAll("[data-delvisitor]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!window.confirm("Apagar a ficha deste visitante? As presenças dele somem de todos os eventos.")) return;
          api("/api/visitors/" + btn.dataset.delvisitor, { method: "DELETE" })
            .then(function () { renderVisitorsPanel(me); })
            .catch(function () { renderVisitorsPanel(me); });
        });
      });
    }).catch(function () { panel.innerHTML = ""; });
  }

  // Entrada do acervo da imersão — só quem esteve lá vê o card.
  function renderImmersionEntry(me) {
    var box = document.getElementById("immersion-entry");
    if (!box) return;
    if (!me.immersion) { box.innerHTML = ""; return; }
    box.innerHTML =
      '<div class="card immersion-card">' +
        '<div>' +
          '<p class="section-label">Você esteve lá</p>' +
          '<div class="ic-title">1ª Imersão LEPV — São Paulo</div>' +
          '<div class="ic-sub">19–24 de julho de 2026 · 12 empresas · acervo, selos e roteiro</div>' +
        "</div>" +
        '<button type="button" class="btn-primary" id="open-immersion">Abrir acervo</button>' +
      "</div>";
    document.getElementById("open-immersion").addEventListener("click", openImmersion);
  }

  // Troca voluntária de senha — o endpoint exige a senha atual (o fluxo de
  // 1º acesso continua no login.html, sem passar por aqui).
  function openPasswordModal() {
    var backdrop = document.createElement("div");
    backdrop.className = "pin-backdrop";
    var modal = document.createElement("div");
    modal.className = "pin-modal form-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "pass-modal-title");
    modal.innerHTML =
      '<h3 id="pass-modal-title">Trocar senha</h3>' +
      '<form id="pass-form">' +
        '<div class="field"><label for="pass-current">Senha atual</label>' +
          '<input type="password" id="pass-current" autocomplete="current-password" required></div>' +
        '<div class="field"><label for="pass-new">Nova senha</label>' +
          '<input type="password" id="pass-new" autocomplete="new-password" minlength="4" maxlength="72" required></div>' +
        '<div class="field"><label for="pass-new2">Repita a nova senha</label>' +
          '<input type="password" id="pass-new2" autocomplete="new-password" required></div>' +
        '<p class="form-error" id="pass-error"></p>' +
        '<div class="pin-actions">' +
          '<button type="submit" class="btn-primary" id="pass-submit">Salvar nova senha</button>' +
          '<button type="button" class="pin-later" id="pass-cancel">Cancelar</button>' +
        "</div>" +
      "</form>";
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    requestAnimationFrame(function () {
      backdrop.classList.add("open");
      modal.classList.add("open");
    });
    function close() {
      backdrop.classList.remove("open");
      modal.classList.remove("open");
      setTimeout(function () { backdrop.remove(); modal.remove(); }, 300);
    }
    backdrop.addEventListener("click", close);
    modal.querySelector("#pass-cancel").addEventListener("click", close);
    document.getElementById("pass-current").focus();

    modal.querySelector("#pass-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var errorEl = modal.querySelector("#pass-error");
      errorEl.classList.remove("show");
      var p1 = modal.querySelector("#pass-new").value;
      if (p1 !== modal.querySelector("#pass-new2").value) {
        errorEl.textContent = "As senhas não conferem.";
        errorEl.classList.add("show");
        return;
      }
      var submitBtn = modal.querySelector("#pass-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Salvando...";
      fetch("/api/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: modal.querySelector("#pass-current").value,
          password: p1,
        }),
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (res.ok) {
            submitBtn.textContent = "Senha trocada ✓";
            setTimeout(close, 900);
          } else {
            errorEl.textContent = res.data.message || "Não foi possível trocar a senha.";
            errorEl.classList.add("show");
            submitBtn.disabled = false;
            submitBtn.textContent = "Salvar nova senha";
          }
        })
        .catch(function () {
          errorEl.textContent = "Erro de conexão com o servidor.";
          errorEl.classList.add("show");
          submitBtn.disabled = false;
          submitBtn.textContent = "Salvar nova senha";
        });
    });
  }

  // Normaliza a foto no cliente: redimensiona (512px avatar, 1600px evento) e
  // converte para JPEG (foto de iPhone vem HEIC — o canvas decodifica).
  function normalizePhoto(file, maxDim) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = maxDim || 512;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        canvas.toBlob(function (blob) { resolve(blob || file); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(img.src); resolve(file); };
      img.src = URL.createObjectURL(file);
    });
  }

  function uploadPhoto(file) {
    return normalizePhoto(file).then(function (blob) {
      return fetch("/api/me/photo", {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      }).then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.message || "Falha no envio da foto.");
          return data;
        });
      });
    });
  }

  function loadMembers() {
    Promise.all([meReady, api("/api/members")]).then(function (results) {
      var me = results[0], members = results[1];
      renderSignupPanel(me);
      renderVisitorsPanel(me);
      renderImmersionEntry(me);
      var grid = document.getElementById("member-grid");
      grid.innerHTML = members
        .map(function (m, i) {
          var isMe = m.order === me.order;
          var initials = m.name.trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
          var avatarHtml = m.photo
            ? '<img class="avatar photo" src="' + esc(m.photo) + '" alt="' + esc(m.name) + '">'
            : '<div class="avatar">' + esc(initials) + "</div>";

          var cargoHtml = (m.cargo && m.cargo !== "Membro")
            ? '<span class="cargo-chip">' + esc(m.cargo) + "</span>"
            : "";
          var courseLine = [m.turma ? "Turma " + m.turma : "", m.course, m.year].filter(Boolean).join(" · ");
          var metaHtml = (courseLine || cargoHtml) ? '<div class="meta">' + cargoHtml + esc(courseLine) + "</div>" : "";
          var interestsHtml = (m.interests && m.interests.length)
            ? '<div class="interests">' + m.interests.map(function (i) { return '<span class="interest-chip">' + esc(i) + "</span>"; }).join("") + "</div>"
            : "";
          var photoBtnHtml = isMe
            ? '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button type="button" class="avatar-edit" id="avatar-edit-btn">' + (m.photo ? "Trocar foto" : "Adicionar foto") + "</button>" +
                '<button type="button" class="avatar-edit" id="pass-edit-btn">Trocar senha</button>' +
              "</div>"
            : (me.superadmin
                ? '<button type="button" class="avatar-edit" data-reset-pass="' + m.order + '">Resetar senha</button>'
                : "");

          return (
            '<div class="member-card stagger-in" style="animation-delay:' + (i * 45) + 'ms">' +
              '<div class="head">' +
                avatarHtml +
                '<div class="who"><div class="name">' + esc(m.name) + '</div><div class="order">Inscrição nº ' + m.order + "</div></div>" +
              "</div>" +
              metaHtml +
              interestsHtml +
              photoBtnHtml +
            "</div>"
          );
        })
        .join("");

      var passBtn = document.getElementById("pass-edit-btn");
      if (passBtn) passBtn.addEventListener("click", openPasswordModal);

      // Reset pelo super admin: o código novo aparece uma única vez, para ser
      // entregue à pessoa (não fica guardado em claro em lugar nenhum).
      grid.querySelectorAll("[data-reset-pass]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var order = parseInt(btn.dataset.resetPass, 10);
          if (!window.confirm("Gerar um código novo para este membro? A senha atual dele deixa de funcionar na hora.")) return;
          btn.disabled = true;
          btn.textContent = "Gerando...";
          api("/api/admin/reset-password", { method: "POST", body: JSON.stringify({ order: order }) })
            .then(function (r) {
              if (!r.code) throw new Error("falhou");
              window.prompt("Código novo de " + r.name + " — entregue a ele(a) agora, não aparece de novo:", r.code);
              loadMembers();
            })
            .catch(function () {
              window.alert("Não foi possível resetar a senha.");
              loadMembers();
            });
        });
      });

      var editBtn = document.getElementById("avatar-edit-btn");
      if (editBtn) {
        var fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";
        grid.appendChild(fileInput);
        editBtn.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function () {
          var file = fileInput.files[0];
          if (!file) return;
          editBtn.disabled = true;
          editBtn.textContent = "Enviando...";
          uploadPhoto(file)
            .then(function () { loadMembers(); })
            .catch(function (err) {
              window.alert(err.message || "Não deu pra enviar a foto. Tente outra imagem.");
              loadMembers();
            });
        });
      }
    });
  }

  // ---- Eventos da liga: aviso → inscrição → presença ----
  //
  // Uma aba só para tudo que a liga faz. Reunião, aula, visita e social são
  // tipos do mesmo objeto; o que muda é o que cada um usa (material, formulário
  // de inscrição, presença). A presença abre sozinha no dia do evento.

  var TIPOS = [
    { key: "", label: "Tudo" },
    { key: "reuniao", label: "Reuniões" },
    { key: "aula", label: "Aulas" },
    { key: "visita", label: "Visitas" },
    { key: "social", label: "Social" },
  ];
  var TIPO_LABEL = { reuniao: "Reunião", aula: "Aula", visita: "Visita", social: "Social" };
  var eventFilter = "";
  var eventExpanded = null;
  var eventsCache = null;
  var checkinMsg = null;

  function fmtDateBR(iso) {
    var p = String(iso || "").split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : esc(iso);
  }
  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = "Copiado ✓";
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done);
    } else {
      window.prompt("Copie o texto:", text);
    }
  }

  function attendanceBadge(ev) {
    if (ev.attendanceState === "aberta") return '<span class="badge ok">presença aberta</span>';
    if (ev.attendanceState === "agendada") return '<span class="badge pending">presença abre no dia</span>';
    return '<span class="badge internal">encerrado</span>';
  }

  function signupLineHtml(ev, me) {
    if (!ev.signupsOpen && !ev.signupCount) return "";
    var partes = [];
    if (ev.signupsOpen) partes.push('<span class="signup-badge open">inscrições abertas</span>');
    else partes.push('<span class="signup-badge done">inscrições encerradas</span>');

    // Mesmo texto da home pública ("X de Y vagas disponíveis"): o mesmo número
    // dito de dois jeitos ("1/30 vagas" vs "restam 29") parecia dessincronizado.
    var inscritos = ev.signupCount + " inscrito" + (ev.signupCount === 1 ? "" : "s");
    var vagas = ev.capacity
      ? '<span class="signup-count num">' + inscritos + " · " + ev.seatsLeft + " de " + ev.capacity + " vagas disponíveis" +
        (ev.waitlistCount ? " · " + ev.waitlistCount + " na espera" : "") + "</span>"
      : '<span class="signup-count num">' + inscritos + "</span>";
    partes.push(vagas);

    if (ev.myStatus === "confirmed") {
      partes.push('<span class="signup-badge open">você está inscrito ✓</span>');
      partes.push('<button type="button" class="btn-reject" data-unsignup>Cancelar inscrição</button>');
    } else if (ev.myStatus === "waitlist") {
      partes.push('<span class="signup-badge done">você está na fila de espera</span>');
      partes.push('<button type="button" class="btn-reject" data-unsignup>Sair da fila</button>');
    } else if (ev.signupsOpen) {
      var lotado = ev.seatsLeft === 0;
      partes.push('<button type="button" class="btn-primary btn-small" data-signup>' + (lotado ? "Entrar na fila de espera" : "Inscrever-se") + "</button>");
    }
    return '<div class="lesson-signup-bar">' + partes.join("") + "</div>";
  }

  function materialsHtml(ev, me) {
    if (!ev.materials.length) return "";
    return (
      '<ul class="materials-list">' +
        ev.materials.map(function (m) {
          var isPdf = m.type === "pdf";
          var meta = [isPdf ? "PDF · " + formatBytes(m.size) : "Link externo"];
          if (m.addedBy) meta.push("por " + m.addedBy);
          var acoes = isPdf
            ? '<a target="_blank" rel="noopener" href="' + esc(m.url) + '">Abrir</a><a href="' + esc(m.url) + '?dl=1">Baixar</a>'
            : '<a target="_blank" rel="noopener" href="' + esc(m.url) + '">Abrir</a>';
          return (
            '<li data-material="' + esc(m.id) + '">' +
              '<span class="material-icon' + (isPdf ? "" : " link") + '">' + (isPdf ? "PDF" : "LINK") + "</span>" +
              '<div class="material-main"><div class="material-title">' + esc(m.title) + '</div>' +
              '<div class="material-meta">' + esc(meta.join(" · ")) + "</div></div>" +
              '<div class="material-actions">' + acoes +
                (me.director ? '<button class="del-btn" data-delmaterial title="Remover material">×</button>' : "") +
              "</div>" +
            "</li>"
          );
        }).join("") +
      "</ul>"
    );
  }

  function managePanelHtml(ev) {
    // Edição inline: os mesmos campos da criação, já preenchidos.
    var editar =
      '<p class="section-label">Editar evento</p>' +
      '<div class="meeting-new">' +
        '<select class="edit-type" aria-label="Tipo do evento">' +
          ["reuniao", "aula", "visita", "social"].map(function (t) {
            return '<option value="' + t + '"' + (ev.type === t ? " selected" : "") + ">" + TIPO_LABEL[t] + "</option>";
          }).join("") +
        "</select>" +
        '<input type="text" class="edit-title" maxlength="100" value="' + esc(ev.title) + '" aria-label="Título">' +
        '<input type="date" class="edit-date" value="' + esc(ev.date) + '" aria-label="Data">' +
        '<button type="button" class="btn-primary btn-small" data-save>Salvar</button>' +
      "</div>" +
      '<div class="meeting-new" style="margin-top:8px;">' +
        '<input type="time" class="edit-time" value="' + esc(ev.time || "") + '" aria-label="Horário">' +
        '<input type="text" class="edit-local" maxlength="120" value="' + esc(ev.location || "") + '" placeholder="Local" aria-label="Local" style="flex:1;">' +
      "</div>" +
      '<div class="meeting-new" style="margin-top:8px;">' +
        '<input type="text" class="edit-text" maxlength="600" value="' + esc(ev.text || "") + '" placeholder="Aviso que aparece no mural" aria-label="Texto do aviso" style="flex:1 1 100%;">' +
      "</div>";

    var codes =
      '<p class="section-label" style="margin-top:12px;">Códigos de presença (todos valem)</p>' +
      '<div class="code-chips">' +
        ev.codes.map(function (c) {
          return '<span class="code-chip">' + esc(c) +
            (ev.codes.length > 1 ? '<button type="button" class="chip-x" data-delcode="' + esc(c) + '" title="Remover código">×</button>' : "") +
            "</span>";
        }).join("") +
        '<button type="button" class="btn-reject" data-newcode>+ Gerar outro</button>' +
      "</div>";

    var presencaUrl = window.location.origin + "/presenca.html?t=" + ev.qrToken;
    var acoes =
      '<div class="meeting-actions">' +
        '<button type="button" class="btn-primary btn-small" data-showqr>QR de presença</button>' +
        '<button type="button" class="btn-reject" data-copyqr>Copiar link da presença</button>' +
        (ev.attendanceState === "aberta"
          ? '<button type="button" class="btn-reject" data-attclose>Encerrar presença agora</button>'
          : '<button type="button" class="btn-reject" data-attopen>Abrir presença fora da data</button>') +
      "</div>" +
      '<div class="qr-box" data-qrbox style="display:none;">' +
        '<img src="/api/events/' + esc(ev.id) + '/qr" alt="QR code de presença">' +
        '<div class="qr-link">' + esc(presencaUrl) + "</div>" +
      "</div>";

    var inscricoes =
      '<p class="section-label" style="margin-top:12px;">Inscrições</p>' +
      '<div class="meeting-new">' +
        '<input type="number" min="0" step="1" class="cap-input" placeholder="Vagas (vazio = ilimitado)" value="' + (ev.capacity || "") + '">' +
        '<button type="button" class="btn-primary btn-small" data-signuptoggle>' + (ev.signupsOpen ? "Encerrar inscrições" : "Abrir inscrições") + "</button>" +
        (ev.signupsOpen && ev.signupToken
          ? '<button type="button" class="btn-reject" data-signupqr>QR do formulário</button>' +
            '<button type="button" class="btn-reject" data-copysignup>Copiar link do formulário</button>'
          : "") +
      "</div>" +
      (ev.signupsOpen && ev.signupToken
        ? '<div class="qr-box" data-signupqrbox style="display:none;">' +
            '<img src="/api/events/' + esc(ev.id) + '/signup-qr" alt="QR code de inscrição">' +
            '<div class="qr-link">' + esc(window.location.origin + "/inscricao.html?t=" + ev.signupToken) + "</div>" +
          "</div>"
        : "");

    var listaInscritos = ev.signups.length
      ? ev.signups.map(function (s) {
          var contato = [
            s.turma ? "Turma " + s.turma : "",
            s.especialidade || "",
            s.idade ? s.idade + " anos" : "",
            s.email,
            s.phone,
          ].filter(Boolean).join(" · ");
          var tag = s.status === "waitlist"
            ? '<span class="signup-badge done">fila</span>'
            : '<span class="signup-badge open">' + (s.type === "member" ? "membro" : "visitante") + "</span>";
          var presente = s.attended ? ' <span class="invite-flag">compareceu</span>' : "";
          return (
            '<div class="visitor-row">' +
              "<span><strong>" + esc(s.name) + "</strong>" + (contato ? ' <span style="color:var(--graphite-soft);">' + esc(contato) + "</span>" : "") + presente + "</span>" +
              '<span>' + tag + '<button type="button" class="del-btn" data-delsignup="' + esc(s.id) + '" title="Remover inscrição">×</button></span>' +
            "</div>"
          );
        }).join("")
      : '<p class="empty-state">Ninguém inscrito ainda.</p>';

    var present = {};
    (ev.memberAttendance || []).forEach(function (a) { present[a.order] = true; });
    var grid =
      '<p class="section-label" style="margin-top:12px;">Presença dos membros</p>' +
      '<div class="attendance-toggle-grid">' +
        (manageMembers || []).map(function (mem) {
          return '<label><input type="checkbox" data-att-order="' + mem.order + '"' + (present[mem.order] ? " checked" : "") + ">" + esc(mem.name) + "</label>";
        }).join("") +
      "</div>";

    var visitantes =
      '<p class="section-label" style="margin-top:12px;">Visitantes presentes</p>' +
      (ev.visitors && ev.visitors.length
        ? ev.visitors.map(function (v) {
            var contato = [v.email, v.phone].filter(Boolean).join(" · ");
            return (
              '<div class="visitor-row">' +
                "<span><strong>" + esc(v.name) + "</strong>" + (contato ? ' <span style="color:var(--graphite-soft);">' + esc(contato) + "</span>" : "") + "</span>" +
                "<span>" + v.visits + "ª presença" + (v.inviteReady ? ' <span class="invite-flag">convidar p/ membro</span>' : "") +
                  '<button type="button" class="del-btn" data-delvisitor="' + esc(v.id) + '" title="Remover presença">×</button></span>' +
              "</div>"
            );
          }).join("")
        : '<p class="empty-state">Nenhum visitante ainda.</p>');

    var anexos =
      '<div class="material-admin">' +
        '<input type="text" class="mat-title" placeholder="Título do material" aria-label="Título do material" maxlength="120">' +
        '<div class="row2">' +
          '<input type="file" class="mat-file" accept="application/pdf" aria-label="Arquivo PDF">' +
          '<button class="btn-primary mat-upload">Enviar PDF</button>' +
        "</div>" +
        '<div class="row2">' +
          '<input type="url" class="mat-url" placeholder="ou cole um link (slides, vídeo...)" aria-label="URL do material">' +
          '<button class="btn-primary mat-add-link">Adicionar link</button>' +
        "</div>" +
        '<div class="row2">' +
          '<input type="file" class="ev-photo" accept="image/*" aria-label="Foto do aviso">' +
          '<button class="btn-primary ev-photo-btn">Adicionar foto ao aviso</button>' +
        "</div>" +
      "</div>";

    return '<div class="event-manage">' + editar + codes + acoes + inscricoes + listaInscritos + grid + visitantes + anexos + "</div>";
  }

  function eventCardHtml(ev, me) {
    var fotos = ev.photos.length
      ? '<div class="event-photos">' + ev.photos.map(function (p) {
          return '<img src="' + esc(p.url) + '" alt="Foto do evento" loading="lazy">';
        }).join("") + "</div>"
      : "";
    var presencaLinha =
      ev.attendanceState !== "encerrada" || ev.membersPresent || ev.visitorsPresent
        ? '<div class="event-presence">' + attendanceBadge(ev) +
            '<span class="signup-count num">' + ev.membersPresent + " membros · " + ev.visitorsPresent + " visitantes</span>" +
            (ev.present ? '<span class="signup-badge open">você esteve ✓</span>' : "") +
          "</div>"
        : "";
    var gerir = me.director
      ? '<button type="button" class="btn-reject" data-manage>' + (eventExpanded === ev.id ? "Fechar gestão" : "Gerenciar") + "</button>"
      : "";
    var apagar = me.director ? '<button class="del-btn" data-delevent title="Remover evento">×</button>' : "";

    return (
      '<div class="card event-card" data-event="' + esc(ev.id) + '">' +
        '<div class="event-head">' +
          '<span class="event-date num">' + fmtDateBR(ev.date) + "</span>" +
          '<span class="mural-tag">' + esc(TIPO_LABEL[ev.type] || "Evento") + "</span>" +
          '<span class="event-title">' + esc(ev.title) + "</span>" +
          gerir + apagar +
        "</div>" +
        (ev.time || ev.location
          ? '<p class="event-text" style="color:var(--graphite-soft);font-weight:600;">' +
              esc([
                ev.time,
                ev.location + (ev.travelMinutes > 0 ? " (~" + ev.travelMinutes + " min do IME)" : ""),
              ].filter(Boolean).join(" · ")) + "</p>"
          : "") +
        (ev.text ? '<p class="event-text">' + esc(ev.text) + "</p>" : "") +
        fotos +
        materialsHtml(ev, me) +
        signupLineHtml(ev, me) +
        presencaLinha +
        (me.director && eventExpanded === ev.id ? managePanelHtml(ev) : "") +
      "</div>"
    );
  }

  var manageMembers = null;

  function renderEvents(me, data) {
    var content = document.getElementById("events-content");
    var eventos = data.events;

    var filtros =
      '<div class="type-filters">' +
        TIPOS.map(function (t) {
          return '<button type="button" class="type-chip' + (eventFilter === t.key ? " on" : "") + '" data-type="' + t.key + '">' + t.label + "</button>";
        }).join("") +
      "</div>";

    var checkin =
      '<div class="card">' +
        '<p class="section-label">Registrar presença</p>' +
        '<div class="checkin-row">' +
          '<input type="text" id="checkin-code" placeholder="Código do evento" maxlength="12" autocapitalize="characters">' +
          '<button type="button" class="btn-primary" id="checkin-btn">Confirmar</button>' +
        "</div>" +
        // A confirmação precisa sobreviver ao re-render que vem logo depois do
        // check-in — senão o membro aperta, a lista recarrega e ele não vê nada.
        '<p class="questions-hint" id="checkin-msg"' + (checkinMsg ? ' style="color:' + checkinMsg.cor + '"' : "") + ">" +
          esc(checkinMsg ? checkinMsg.texto : "O código é falado no início do evento e só funciona no dia.") +
        "</p>" +
      "</div>";

    var novo = me.director
      ? '<div class="card">' +
          '<p class="section-label">Novo evento (diretoria)</p>' +
          '<div class="meeting-new">' +
            '<select id="new-event-type" aria-label="Tipo de evento">' +
              '<option value="reuniao">Reunião</option><option value="aula">Aula</option>' +
              '<option value="visita">Visita</option><option value="social">Social</option>' +
            "</select>" +
            '<input type="text" id="new-event-title" placeholder="Título" maxlength="100">' +
            '<input type="date" id="new-event-date">' +
            '<button type="button" class="btn-primary" id="new-event-btn">Criar</button>' +
          "</div>" +
          '<div class="meeting-new" style="margin-top:8px;">' +
            '<input type="time" id="new-event-time" aria-label="Horário">' +
            '<input type="text" id="new-event-local" placeholder="Local" maxlength="120" style="flex:1;">' +
          "</div>" +
          '<div class="meeting-new" style="margin-top:8px;">' +
            '<input type="text" id="new-event-text" placeholder="Aviso que aparece no mural (opcional)" maxlength="600" style="flex:1 1 100%;">' +
          "</div>" +
          '<p class="questions-hint">O evento já nasce com o formulário de inscrição publicado na página principal, junto com o aviso.</p>' +
        "</div>"
      : "";

    var lista = eventos.length
      ? eventos.map(function (ev) { return eventCardHtml(ev, me); }).join("")
      : '<div class="card"><p class="empty-state">Nenhum evento' + (eventFilter ? " deste tipo" : "") + " ainda." + (me.director ? " Crie o primeiro acima." : "") + "</p></div>";

    content.innerHTML = filtros + checkin + novo + lista;

    // A confirmação vale para a visita atual à aba, não para sempre.
    checkinMsg = null;

    content.querySelectorAll("[data-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        eventFilter = btn.dataset.type;
        loadEvents();
      });
    });

    document.getElementById("checkin-btn").addEventListener("click", function () {
      var input = document.getElementById("checkin-code");
      var msg = document.getElementById("checkin-msg");
      var code = input.value.trim();
      if (!code) return;
      var btn = document.getElementById("checkin-btn");
      btn.disabled = true;
      fetch("/api/events/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (res.ok) {
            input.value = "";
            checkinMsg = { texto: "Presença confirmada em " + res.data.event.title + " ✓", cor: "var(--good)" };
            loadEvents();
          } else {
            checkinMsg = { texto: res.data.message || "Não deu pra registrar.", cor: "var(--red-2)" };
            msg.textContent = checkinMsg.texto;
            msg.style.color = checkinMsg.cor;
          }
        })
        .catch(function () {
          btn.disabled = false;
          checkinMsg = { texto: "Erro de conexão. Tente de novo.", cor: "var(--red-2)" };
          msg.textContent = checkinMsg.texto;
          msg.style.color = checkinMsg.cor;
        });
    });

    if (me.director) {
      document.getElementById("new-event-btn").addEventListener("click", function () {
        var title = document.getElementById("new-event-title").value.trim();
        if (!title) return window.alert("Dê um título ao evento.");
        if (!document.getElementById("new-event-local").value.trim()) return window.alert("Informe o local do evento.");
        if (!document.getElementById("new-event-time").value) return window.alert("Informe o horário do evento.");
        // Trajeto acima de 30 min do IME costuma ser local geocodificado
        // errado: o servidor segura e a gente confirma antes de gravar.
        function criar(confirmTravel) {
          api("/api/events", {
            method: "POST",
            body: JSON.stringify({
              type: document.getElementById("new-event-type").value,
              title: title,
              date: document.getElementById("new-event-date").value,
              time: document.getElementById("new-event-time").value,
              location: document.getElementById("new-event-local").value,
              text: document.getElementById("new-event-text").value,
              confirmTravel: confirmTravel === true,
            }),
          }).then(function (r) {
            if (r && r.error === "travel_confirm") {
              if (window.confirm(r.message)) return criar(true);
              return;
            }
            loadEvents();
          });
        }
        criar(false);
      });
    }

    content.querySelectorAll(".event-card").forEach(function (card) {
      var id = card.dataset.event;
      wireEventCard(card, id, me);
    });
  }

  function wireEventCard(card, id, me) {
    var signupBtn = card.querySelector("[data-signup]");
    if (signupBtn) {
      signupBtn.addEventListener("click", function () {
        signupBtn.disabled = true;
        api("/api/events/" + id + "/signup", { method: "POST" }).then(loadEvents).catch(loadEvents);
      });
    }
    var unsignupBtn = card.querySelector("[data-unsignup]");
    if (unsignupBtn) {
      unsignupBtn.addEventListener("click", function () {
        if (!window.confirm("Cancelar sua inscrição neste evento?")) return;
        api("/api/events/" + id + "/signup", { method: "DELETE" }).then(loadEvents).catch(loadEvents);
      });
    }
    if (!me.director) return;

    var manage = card.querySelector("[data-manage]");
    if (manage) {
      manage.addEventListener("click", function () {
        eventExpanded = eventExpanded === id ? null : id;
        loadEvents();
      });
    }
    var del = card.querySelector("[data-delevent]");
    if (del) {
      del.addEventListener("click", function () {
        if (!window.confirm("Remover este evento, com fotos, materiais, inscrições e presença?")) return;
        api("/api/events/" + id, { method: "DELETE" }).then(loadEvents);
      });
    }
    card.querySelectorAll("[data-delmaterial]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!window.confirm("Remover este material para todo mundo?")) return;
        api("/api/events/" + id + "/materials/" + btn.closest("[data-material]").dataset.material, { method: "DELETE" }).then(loadEvents);
      });
    });

    var box = card.querySelector(".event-manage");
    if (!box) return;

    box.querySelector("[data-save]").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Salvando...";
      function salvar(confirmTravel) {
        var cap = box.querySelector(".cap-input").value;
        api("/api/events/" + id, {
          method: "PATCH",
          body: JSON.stringify({
            type: box.querySelector(".edit-type").value,
            title: box.querySelector(".edit-title").value,
            date: box.querySelector(".edit-date").value,
            time: box.querySelector(".edit-time").value,
            location: box.querySelector(".edit-local").value,
            text: box.querySelector(".edit-text").value,
            capacity: cap === "" ? null : parseInt(cap, 10),
            confirmTravel: confirmTravel === true,
          }),
        })
          .then(function (r) {
            if (r && r.error === "travel_confirm") {
              if (window.confirm(r.message)) return salvar(true);
              btn.disabled = false;
              btn.textContent = "Salvar";
              return;
            }
            if (!r || !r.ok) throw new Error((r && r.message) || "falhou");
            loadEvents();
          })
          .catch(function (err) {
            window.alert(err.message || "Não deu pra salvar as alterações.");
            btn.disabled = false;
            btn.textContent = "Salvar";
          });
      }
      salvar(false);
    });

    box.querySelector("[data-newcode]").addEventListener("click", function () {
      api("/api/events/" + id + "/codes", { method: "POST" }).then(loadEvents);
    });
    box.querySelectorAll("[data-delcode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        api("/api/events/" + id + "/codes/" + encodeURIComponent(btn.dataset.delcode), { method: "DELETE" }).then(loadEvents);
      });
    });
    box.querySelectorAll("[data-delsignup]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!window.confirm("Remover esta inscrição? Se houver fila de espera, a vaga passa para o próximo.")) return;
        api("/api/events/" + id + "/signups/" + btn.dataset.delsignup, { method: "DELETE" }).then(loadEvents);
      });
    });
    box.querySelectorAll("[data-delvisitor]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!window.confirm("Remover a presença deste visitante neste evento?")) return;
        api("/api/events/" + id + "/visitors/" + btn.dataset.delvisitor, { method: "DELETE" }).then(loadEvents);
      });
    });
    box.querySelector("[data-showqr]").addEventListener("click", function () {
      var qr = box.querySelector("[data-qrbox]");
      qr.style.display = qr.style.display === "none" ? "" : "none";
    });
    box.querySelector("[data-copyqr]").addEventListener("click", function (e) {
      copyText(window.location.origin + "/presenca.html?t=" + eventQrToken(id), e.currentTarget);
    });
    var attClose = box.querySelector("[data-attclose]");
    if (attClose) {
      attClose.addEventListener("click", function () {
        api("/api/events/" + id + "/attendance-open", { method: "POST", body: JSON.stringify({ open: false }) }).then(loadEvents);
      });
    }
    var attOpen = box.querySelector("[data-attopen]");
    if (attOpen) {
      attOpen.addEventListener("click", function () {
        api("/api/events/" + id + "/attendance-open", { method: "POST", body: JSON.stringify({ open: true }) }).then(loadEvents);
      });
    }

    // Editar só o número de vagas não pode exigir mexer nas inscrições:
    // ao sair do campo, o valor novo já vale.
    box.querySelector(".cap-input").addEventListener("change", function (e) {
      var cap = e.currentTarget.value;
      api("/api/events/" + id, {
        method: "PATCH",
        body: JSON.stringify({ capacity: cap === "" ? null : parseInt(cap, 10) }),
      }).then(loadEvents);
    });

    box.querySelector("[data-signuptoggle]").addEventListener("click", function (e) {
      var abrindo = e.currentTarget.textContent.indexOf("Abrir") === 0;
      var cap = box.querySelector(".cap-input").value;
      api("/api/events/" + id + "/signups-open", {
        method: "POST",
        body: JSON.stringify({ open: abrindo, capacity: cap === "" ? null : parseInt(cap, 10) }),
      }).then(loadEvents);
    });
    var signupQr = box.querySelector("[data-signupqr]");
    if (signupQr) {
      signupQr.addEventListener("click", function () {
        var qr = box.querySelector("[data-signupqrbox]");
        qr.style.display = qr.style.display === "none" ? "" : "none";
      });
    }
    var copySignup = box.querySelector("[data-copysignup]");
    if (copySignup) {
      copySignup.addEventListener("click", function (e) {
        var link = box.querySelector("[data-signupqrbox] .qr-link");
        if (link) copyText(link.textContent, e.currentTarget);
      });
    }

    box.querySelectorAll("[data-att-order]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var desired = cb.checked;
        cb.disabled = true;
        api("/api/events/" + id + "/member-attendance", {
          method: "POST",
          body: JSON.stringify({ order: parseInt(cb.dataset.attOrder, 10), present: desired }),
        })
          .then(function (r) {
            cb.disabled = false;
            if (!r || !r.ok) throw new Error("recusado");
          })
          .catch(function () {
            cb.disabled = false;
            cb.checked = !desired;
            window.alert("Não deu pra salvar a presença. Tente de novo.");
          });
      });
    });

    var uploadBtn = box.querySelector(".mat-upload");
    uploadBtn.addEventListener("click", function () {
      var title = box.querySelector(".mat-title").value.trim();
      var file = box.querySelector(".mat-file").files[0];
      if (!title) return window.alert("Dê um título ao material.");
      if (!file) return window.alert("Escolha um arquivo PDF.");
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Enviando...";
      fetch("/api/events/" + id + "/materials/upload?title=" + encodeURIComponent(title), {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      })
        .then(function (r) { if (!r.ok) throw new Error("falhou"); return r.json(); })
        .then(loadEvents)
        .catch(function () {
          window.alert("Falha no envio — confira se o arquivo é um PDF de até 25 MB.");
          uploadBtn.disabled = false;
          uploadBtn.textContent = "Enviar PDF";
        });
    });
    box.querySelector(".mat-add-link").addEventListener("click", function () {
      var title = box.querySelector(".mat-title").value.trim();
      var url = box.querySelector(".mat-url").value.trim();
      if (!title) return window.alert("Dê um título ao material.");
      if (!/^https?:\/\//i.test(url)) return window.alert("Cole um link começando com http(s)://");
      api("/api/events/" + id + "/materials/link", { method: "POST", body: JSON.stringify({ title: title, url: url }) }).then(loadEvents);
    });

    var photoBtn = box.querySelector(".ev-photo-btn");
    photoBtn.addEventListener("click", function () {
      var file = box.querySelector(".ev-photo").files[0];
      if (!file) return window.alert("Escolha uma imagem.");
      photoBtn.disabled = true;
      photoBtn.textContent = "Enviando...";
      normalizePhoto(file, 1600)
        .then(function (blob) {
          return fetch("/api/events/" + id + "/photos", {
            method: "POST",
            headers: { "Content-Type": blob.type || "application/octet-stream" },
            body: blob,
          });
        })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.message || "falhou"); }); })
        .then(loadEvents)
        .catch(function (err) {
          window.alert(err.message || "Não deu pra enviar a foto.");
          photoBtn.disabled = false;
          photoBtn.textContent = "Adicionar foto ao aviso";
        });
    });
  }

  function eventQrToken(id) {
    var ev = (eventsCache || []).find(function (e) { return e.id === id; });
    return ev ? ev.qrToken : "";
  }

  function loadEvents() {
    var pedidos = [meReady, api("/api/events" + (eventFilter ? "?type=" + eventFilter : ""))];
    Promise.all(pedidos)
      .then(function (r) {
        var me = r[0], data = r[1];
        eventsCache = data.events;
        if (me.director && !manageMembers) {
          return api("/api/members").then(function (members) {
            manageMembers = members;
            renderEvents(me, data);
          });
        }
        renderEvents(me, data);
      })
      .catch(function () {
        var content = document.getElementById("events-content");
        if (content) content.innerHTML = '<div class="card"><p class="empty-state">Não deu para carregar os eventos. Verifique a conexão e recarregue.</p></div>';
      });
  }

  // ---- Agenda ----
  var itineraryData = null;
  var activeDayId = null;
  var agendaCompaniesByKey = {};

  function renderDay(day) {
    var container = document.getElementById("agenda-days");
    var stopsHtml = "";
    day.stops.forEach(function (stop, i) {
      if (stop.arrival) {
        stopsHtml +=
          '<div class="connector' + (stop.arrival.warn ? " warn" : "") + '">' +
            '<span class="line"></span><span>' + stop.arrival.label + "</span><span class=\"line\"></span>" +
          "</div>";
      }
      var badgeHtml =
        stop.status === "ok" ? '<span class="badge ok">confirmado</span>' :
        stop.status === "pending" ? '<span class="badge pending">' + (stop.statusLabel || "a confirmar") + "</span>" :
        '<span class="badge internal">interno</span>';
      var routeHtml =
        stop.addr && stop.addr !== "A definir" && stop.addr !== "Sem visita externa"
          ? '<a class="route" target="_blank" rel="noopener" href="' + mapsSearch(stop.addr) + '">Ver no mapa ↗</a>'
          : "";
      var company = stop.companyKey ? agendaCompaniesByKey[stop.companyKey] : null;
      // eventos sem empresa (ex: HH de networking) podem trazer logo no próprio stop
      var logoSrc = (company && company.logo) || stop.logo;
      var logoBg = (company && company.logoBg) || stop.logoBg || "light";
      var logoHtml = logoSrc
        ? '<span class="stop-logo logoBg-' + logoBg + '"><img src="' + logoSrc + '" alt="' + ((company && company.name) || stop.company) + '"></span>'
        : "";
      stopsHtml +=
        '<div class="stop stagger-in" style="animation-delay:' + (i * 70) + 'ms">' +
          '<div class="time num">' + stop.time + "</div>" +
          '<div class="rail"><span class="dot"></span>' +
            '<div class="stopcard">' +
              '<div class="top">' + logoHtml + '<span class="company">' + stop.company + "</span>" + badgeHtml +
                '<span class="stop-idx num">/' + String(i + 1).padStart(2, "0") + "</span></div>" +
              '<div class="addr">' + stop.addr + "</div>" +
              '<div class="foot">' + routeHtml + "</div>" +
            "</div>" +
          "</div>" +
        "</div>";
    });

    if (day.returnToHotel) {
      stopsHtml +=
        '<div class="connector">' +
          '<span class="line"></span><span>Retorno ao hotel · ' + day.returnToHotel.label + "</span><span class=\"line\"></span>" +
        "</div>";
    }

    container.innerHTML =
      '<div class="card">' +
        '<div class="day-head"><span class="weekday">' + day.weekday + '</span><span class="date num">' + day.date + '/2026</span></div>' +
        (day.note ? '<p class="day-note">' + day.note + "</p>" : "") +
        '<div class="timeline">' + stopsHtml + "</div>" +
      "</div>" +
      '<div id="day-gallery"></div>' +
      renderLunch(day.lunch);

    renderDayGallery(day.id);
  }

  // Registro fotográfico do dia, abaixo da timeline do roteiro.
  var activeDayId = null;

  function renderDayGallery(dayId) {
    activeDayId = dayId;
    if (!document.getElementById("day-gallery")) return;
    galleryReady().then(function (g) {
      if (dayId !== activeDayId) return; // trocou de dia enquanto carregava
      var day = g.days.find(function (d) { return d.day === dayId; });
      if (!day) return; // domingo de chegada não tem registro
      var items = daySet(g, day);
      var el = document.getElementById("day-gallery");
      if (!items.length || !el) return;
      el.innerHTML =
        '<div class="card">' +
          '<p class="section-label">O que registramos neste dia</p>' +
          '<p class="questions-hint">' + items.length + (items.length === 1 ? " mídia" : " mídias") + ". Toque para ampliar.</p>" +
          thumbStripHtml(items) +
        "</div>";
      wireThumbs(el, items);
    });
  }

  function renderLunch(lunch) {
    if (!lunch) return "";
    var groupsHtml = lunch.groups
      .map(function (g) {
        var optionsHtml = g.options
          .map(function (o) {
            return (
              '<div class="lunch-option">' +
                '<div class="lo-main"><span class="lo-name">' + o.name + '</span><span class="lo-note">' + o.note + "</span></div>" +
                '<span class="lo-price num">' + o.price + "</span>" +
              "</div>"
            );
          })
          .join("");
        return '<div class="lunch-window">' + g.window + "</div>" + optionsHtml;
      })
      .join('<hr class="hair" style="margin:10px 0;">');

    return (
      '<div class="card lunch-card">' +
        '<p class="section-label" style="color:var(--lunch-dark);">Sugestão de almoço</p>' +
        '<p style="font-size:13px;color:var(--graphite-soft);line-height:1.5;margin:0 0 12px;">' + lunch.note + "</p>" +
        '<div class="lunch-options">' + groupsHtml + "</div>" +
      "</div>"
    );
  }

  function loadAgenda() {
    Promise.all([api("/api/itinerary"), api("/api/companies")]).then(function (results) {
      var data = results[0];
      results[1].forEach(function (c) { agendaCompaniesByKey[c.key] = c; });
      itineraryData = data;
      document.getElementById("hotel-card").innerHTML =
        '<div>' +
          '<div class="label">Hospedagem</div>' +
          '<div class="name">' + data.hotel.name + "</div>" +
          '<div class="addr">' + data.hotel.addr + "</div>" +
        "</div>" +
        '<a class="btn-primary" style="text-decoration:none;" target="_blank" rel="noopener" href="' + mapsSearch(data.hotel.addr) + '">Ver no mapa ↗</a>';

      var picker = document.getElementById("daypicker");
      picker.innerHTML = data.days
        .map(function (d, i) {
          return '<button role="tab" aria-controls="agenda-days" data-day="' + d.id + '">' + d.weekday.slice(0, 3) + " " + d.date + "</button>";
        })
        .join("");
      wireTablist(picker);
      picker.querySelectorAll("button").forEach(function (btn) {
        btn.addEventListener("click", function () { selectDay(btn.dataset.day); });
      });

      var today = new Date();
      var todayStr = today.getFullYear() === 2026
        ? String(today.getDate()).padStart(2, "0") + "/" + String(today.getMonth() + 1).padStart(2, "0")
        : null;
      var initial =
        data.days.find(function (d) { return d.id === activeDayId; }) ||
        data.days.find(function (d) { return d.date === todayStr; }) ||
        data.days[0];
      selectDay(initial.id);
    });
  }

  function selectDay(id) {
    activeDayId = id;
    var picker = document.getElementById("daypicker");
    picker.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.day === id);
    });
    syncTabState(picker);
    var day = itineraryData.days.find(function (d) { return d.id === id; });
    if (day) renderDay(day);
  }

  // ---- Empresas (seletor + painel dinâmico) ----
  var companiesData = null;
  var companyVisits = {};
  var activeCompanyKey = null;

  function buildCompanyVisits(itinerary) {
    var visits = {};
    itinerary.days.forEach(function (day) {
      day.stops.forEach(function (stop) {
        if (stop.companyKey) {
          visits[stop.companyKey] = {
            weekday: day.weekday,
            date: day.date,
            time: stop.time,
            addr: stop.addr,
            status: stop.status,
            statusLabel: stop.statusLabel,
          };
        }
      });
    });
    return visits;
  }

  function renderCompanyDetail(company) {
    var el = document.getElementById("company-detail");
    var visit = companyVisits[company.key];

    var heroHtml = company.logo
      ? '<img class="company-logo" src="' + company.logo + '" alt="' + company.name + '">'
      : '<span class="company-fallback-name">' + company.name + "</span>";

    var visitHtml = "";
    if (visit) {
      var badgeHtml =
        visit.status === "ok" ? '<span class="badge ok">confirmado</span>' :
        visit.status === "pending" ? '<span class="badge pending">' + (visit.statusLabel || "a confirmar") + "</span>" :
        '<span class="badge internal">interno</span>';
      var routeHtml = isRealAddr(visit.addr)
        ? '<a class="route" target="_blank" rel="noopener" href="' + mapsSearch(visit.addr) + '">Ver no mapa ↗</a>'
        : "";
      visitHtml =
        '<div class="company-visit">' +
          '<div class="row"><span class="k">Visita</span><span class="v">' + visit.weekday + " · " + visit.date + "/2026</span></div>" +
          '<div class="row"><span class="k">Horário</span><span class="v">' + visit.time + "</span></div>" +
          '<div class="row"><span class="k">Endereço</span><span class="v">' + visit.addr + "</span></div>" +
          '<div class="row"><span class="k">Status</span><span class="v">' + badgeHtml + "</span></div>" +
          (routeHtml ? '<div class="row"><span class="k"></span><span class="v">' + routeHtml + "</span></div>" : "") +
        "</div>";
    }

    el.innerHTML =
      '<div class="company-fade">' +
        '<div class="company-hero logoBg-' + (company.logoBg || "light") + '">' + heroHtml + "</div>" +
        '<p class="company-blurb">' + company.blurb + "</p>" +
        visitHtml +
      "</div>";
  }

  function selectCompany(key) {
    activeCompanyKey = key;
    var picker = document.getElementById("company-picker");
    picker.querySelectorAll(".company-chip").forEach(function (chip) {
      var isActive = chip.dataset.key === key;
      chip.classList.toggle("active", isActive);
      if (!isActive) chip.style.borderColor = "transparent";
    });
    syncTabState(picker);
    var company = companiesData.find(function (c) { return c.key === key; });
    if (company) renderCompanyDetail(company);
    renderGalleryPanel(key);
    renderMaterialsPanel(key);
    renderCollabPanel(QUESTIONS_PANEL, key);
    renderCollabPanel(LEARNINGS_PANEL, key);
    renderAttendancePanel(key);
  }

  // ---- Materiais de preparação (dentro de Empresas) ----
  var materialsCache = null;

  function formatBytes(n) {
    if (!n) return "";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  }

  function materialsListHtml(list, me) {
    if (!list.length) return '<p class="empty-state">Nenhum material ainda.</p>';
    return (
      '<ul class="materials-list">' +
      list
        .map(function (m) {
          var isPdf = m.type === "pdf";
          var iconHtml = isPdf
            ? '<span class="material-icon">PDF</span>'
            : '<span class="material-icon link">LINK</span>';
          var metaHtml = isPdf ? '<div class="material-meta">PDF · ' + formatBytes(m.size) + "</div>" : '<div class="material-meta">Link externo</div>';
          var actionsHtml = isPdf
            ? '<a target="_blank" rel="noopener" href="/api/materials/' + m.id + '/file">Abrir</a>' +
              '<a href="/api/materials/' + m.id + '/file?dl=1">Baixar</a>'
            : '<a target="_blank" rel="noopener" href="' + esc(m.url) + '">Abrir</a>';
          return (
            '<li data-id="' + m.id + '">' +
              iconHtml +
              '<div class="material-main"><div class="material-title">' + esc(m.title) + "</div>" + metaHtml + "</div>" +
              '<div class="material-actions">' + actionsHtml +
                (me.director ? '<button class="del-btn" title="Remover material">×</button>' : "") +
              "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderMaterialsPanel(companyKey) {
    var panel = document.getElementById("materials-panel");
    Promise.all([
      meReady,
      materialsCache ? Promise.resolve(materialsCache) : api("/api/materials"),
    ]).then(function (results) {
      var me = results[0];
      materialsCache = results[1];
      if (companyKey !== activeCompanyKey) return;
      var list = materialsCache[companyKey] || [];

      if (!list.length && !me.director) {
        panel.innerHTML = ""; // membro sem material não precisa ver card vazio
        return;
      }

      var adminHtml = me.director
        ? '<div class="material-admin">' +
            '<input type="text" class="mat-title" placeholder="Título do material" aria-label="Título do material" maxlength="120">' +
            '<div class="row2">' +
              '<input type="file" class="mat-file" accept="application/pdf" aria-label="Arquivo PDF">' +
              '<button class="btn-primary mat-upload">Enviar PDF</button>' +
            "</div>" +
            '<div class="row2">' +
              '<input type="url" class="mat-url" placeholder="ou cole um link (vídeo, página...)" aria-label="URL do material">' +
              '<button class="btn-primary mat-add-link">Adicionar link</button>' +
            "</div>" +
            '<p class="hintline">PDF até 25 MB — fica no volume do servidor, disponível pra todo mundo na hora.</p>' +
          "</div>"
        : "";

      panel.innerHTML =
        '<div class="card">' +
          '<p class="section-label">Materiais de preparação</p>' +
          '<div class="materials-box">' + materialsListHtml(list, me) + "</div>" +
          adminHtml +
        "</div>";

      function refresh(updated) {
        materialsCache = updated;
        panel.querySelector(".materials-box").innerHTML = materialsListHtml(updated[companyKey] || [], me);
        wireDeletes();
      }
      function wireDeletes() {
        panel.querySelectorAll(".materials-list .del-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var li = btn.closest("li");
            if (!window.confirm("Remover este material para todo mundo?")) return;
            api("/api/materials/" + li.dataset.id, { method: "DELETE" }).then(refresh);
          });
        });
      }
      wireDeletes();

      if (!me.director) return;
      var uploadBtn = panel.querySelector(".mat-upload");
      uploadBtn.addEventListener("click", function () {
        var title = panel.querySelector(".mat-title").value.trim();
        var file = panel.querySelector(".mat-file").files[0];
        if (!title) return window.alert("Dê um título ao material.");
        if (!file) return window.alert("Escolha um arquivo PDF.");
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Enviando...";
        fetch("/api/materials/upload?companyKey=" + encodeURIComponent(companyKey) + "&title=" + encodeURIComponent(title), {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        })
          .then(function (r) {
            if (!r.ok) throw new Error("upload failed");
            return r.json();
          })
          .then(function (updated) {
            panel.querySelector(".mat-title").value = "";
            panel.querySelector(".mat-file").value = "";
            refresh(updated);
          })
          .catch(function () { window.alert("Falha no envio — confira se o arquivo é um PDF de até 25 MB."); })
          .then(function () {
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Enviar PDF";
          });
      });
      panel.querySelector(".mat-add-link").addEventListener("click", function () {
        var title = panel.querySelector(".mat-title").value.trim();
        var url = panel.querySelector(".mat-url").value.trim();
        if (!title) return window.alert("Dê um título ao material.");
        if (!/^https?:\/\//i.test(url)) return window.alert("Cole um link começando com http(s)://");
        api("/api/materials/link", { method: "POST", body: JSON.stringify({ companyKey: companyKey, title: title, url: url }) }).then(function (updated) {
          panel.querySelector(".mat-title").value = "";
          panel.querySelector(".mat-url").value = "";
          refresh(updated);
        });
      });
    });
  }

  // ---- Painéis colaborativos por empresa (perguntas e aprendizados) ----
  // Mesma mecânica do checklist, mas por empresa: lista compartilhada, cada um
  // remove só o que criou (admin modera). Config distingue perguntas de
  // aprendizados — inclusive o "portão" de quem pode postar.
  var collabCaches = {};

  var QUESTIONS_PANEL = {
    elId: "questions-panel",
    api: "/api/questions",
    label: "Perguntas levadas à visita",
    hint: "O roteiro de Q&amp;A que o grupo montou para esta empresa. Fica como registro — e ainda dá pra somar o que ficou sem resposta.",
    empty: "Nenhuma pergunta registrada para esta visita.",
    placeholder: "Adicionar pergunta...",
    mark: "?",
    gate: null, // qualquer membro pode postar, antes ou depois da visita
    lockedHint: "",
  };

  var LEARNINGS_PANEL = {
    elId: "learnings-panel",
    api: "/api/learnings",
    label: "Aprendizados desta visita",
    hint: "A memória coletiva da imersão — o que vale levar de volta pra liga. Tudo aparece consolidado na aba Legado.",
    empty: "Nenhum aprendizado registrado desta visita ainda.",
    placeholder: "Registrar aprendizado...",
    mark: "—",
    // Sem portão: a imersão acabou e o acervo é do grupo inteiro. O selo
    // continua marcando quem esteve lá, mas não restringe quem contribui.
    gate: null,
    lockedHint: "",
  };

  function collabListHtml(list, me, opts) {
    if (!list.length) return '<p class="empty-state">' + opts.empty + "</p>";
    return (
      '<ul class="questions-list">' +
      list
        .map(function (item) {
          var canDelete = me.admin || item.order === me.order;
          return (
            '<li data-id="' + item.id + '">' +
              '<span class="q-mark">' + opts.mark + "</span>" +
              '<span class="q-body">' + esc(item.text) + '<span class="q-by">' + esc(item.addedBy) + "</span></span>" +
              (canDelete ? '<button class="del-btn" title="Remover">×</button>' : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderCollabPanel(opts, companyKey) {
    var panel = document.getElementById(opts.elId);
    Promise.all([
      meReady,
      collabCaches[opts.api] ? Promise.resolve(collabCaches[opts.api]) : api(opts.api),
      opts.gate ? opts.gate(companyKey) : Promise.resolve(true),
    ]).then(function (results) {
      var me = results[0];
      collabCaches[opts.api] = results[1];
      var canPost = results[2] || me.admin;
      if (companyKey !== activeCompanyKey) return; // usuário já trocou de empresa
      var list = collabCaches[opts.api][companyKey] || [];

      if (!canPost && !list.length) {
        panel.innerHTML = opts.lockedHint
          ? '<div class="card"><p class="section-label">' + opts.label + '</p><p class="empty-state">' + opts.lockedHint + "</p></div>"
          : "";
        return;
      }

      panel.innerHTML =
        '<div class="card">' +
          '<p class="section-label">' + opts.label + "</p>" +
          '<p class="questions-hint">' + opts.hint + "</p>" +
          '<div class="collab-list-box">' + collabListHtml(list, me, opts) + "</div>" +
          (canPost
            ? '<div class="addbar">' +
                '<input type="text" class="collab-input" placeholder="' + opts.placeholder + '" aria-label="' + opts.placeholder + '" maxlength="280">' +
                '<button class="btn-primary collab-add">Adicionar</button>' +
              "</div>"
            : "") +
        "</div>";

      function refresh(updated) {
        collabCaches[opts.api] = updated;
        panel.querySelector(".collab-list-box").innerHTML = collabListHtml(updated[companyKey] || [], me, opts);
        wireDeletes();
      }
      function addItem() {
        var input = panel.querySelector(".collab-input");
        var text = input.value.trim();
        if (!text) return;
        api(opts.api, { method: "POST", body: JSON.stringify({ companyKey: companyKey, text: text }) }).then(function (updated) {
          input.value = "";
          refresh(updated);
        });
      }
      function wireDeletes() {
        panel.querySelectorAll(".questions-list .del-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var li = btn.closest("li");
            if (!window.confirm("Remover este item?")) return;
            api(opts.api + "/" + companyKey + "/" + li.dataset.id, { method: "DELETE" }).then(refresh);
          });
        });
      }
      var addBtn = panel.querySelector(".collab-add");
      if (addBtn) {
        addBtn.addEventListener("click", addItem);
        panel.querySelector(".collab-input").addEventListener("keydown", function (e) {
          if (e.key === "Enter") addItem();
        });
      }
      wireDeletes();
    });
  }

  // ---- Presença (admin) ----
  var attendanceCache = null;
  var membersCache = null;

  function renderAttendanceList(companyKey) {
    var present = attendanceCache[companyKey] || [];
    return membersCache
      .map(function (m) {
        var checked = present.indexOf(m.order) !== -1;
        var initials = m.name.trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
        var avatarHtml = m.photo
          ? '<img class="av" src="' + esc(m.photo) + '" alt="">'
          : '<span class="av">' + esc(initials) + "</span>";
        return (
          '<label class="attendance-row">' +
            '<input type="checkbox" data-order="' + m.order + '" ' + (checked ? "checked" : "") + ">" +
            avatarHtml +
            '<span class="rn">' + esc(m.name) + "</span>" +
          "</label>"
        );
      })
      .join("");
  }

  function renderAttendancePanel(companyKey) {
    var panel = document.getElementById("attendance-panel");
    meReady.then(function (me) {
      if (!me.admin) { panel.innerHTML = ""; return; }

      var ready = Promise.all([
        attendanceCache ? Promise.resolve(attendanceCache) : api("/api/attendance"),
        membersCache ? Promise.resolve(membersCache) : api("/api/members"),
      ]);
      panel.innerHTML = '<div class="card attendance-panel"><p class="section-label">Presença confirmada (admin)</p><p class="empty-state">Carregando...</p></div>';
      ready.then(function (results) {
      attendanceCache = results[0];
      membersCache = results[1];
      panel.innerHTML =
        '<div class="card attendance-panel">' +
          '<p class="section-label">Presença confirmada (admin)</p>' +
          '<div class="attendance-list" id="attendance-list">' + renderAttendanceList(companyKey) + "</div>" +
        "</div>";
      panel.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
        box.addEventListener("change", function () {
          var order = parseInt(box.dataset.order, 10);
          box.disabled = true;
          api("/api/attendance", { method: "POST", body: JSON.stringify({ companyKey: companyKey, order: order, attended: box.checked }) })
            .then(function (res) {
              attendanceCache[companyKey] = res.members;
              box.disabled = false;
            })
            .catch(function () {
              box.checked = !box.checked;
              box.disabled = false;
            });
        });
      });
      });
    });
  }

  function loadCompanies() {
    attendanceCache = null; // presença pode ter mudado desde a última visita à aba
    collabCaches = {}; // outra pessoa pode ter adicionado perguntas/aprendizados
    materialsCache = null; // material novo pode ter sido publicado
    Promise.all([api("/api/companies"), api("/api/itinerary")]).then(function (results) {
      companiesData = results[0];
      companyVisits = buildCompanyVisits(results[1]);

      var picker = document.getElementById("company-picker");
      picker.innerHTML = companiesData
        .map(function (c, i) {
          return (
            '<button class="company-chip stagger-in" role="tab" aria-controls="company-detail" data-key="' + c.key + '" style="animation-delay:' + (i * 55) + 'ms">' +
              '<span class="dot" style="background:' + c.color + '"></span>' +
              '<span class="lbl">' + c.name + "</span>" +
            "</button>"
          );
        })
        .join("");
      wireTablist(picker, true);
      picker.querySelectorAll(".company-chip").forEach(function (chip) {
        var c = companiesData.find(function (x) { return x.key === chip.dataset.key; });
        chip.style.borderColor = "transparent";
        chip.addEventListener("mouseenter", function () { chip.style.borderColor = c.color; });
        chip.addEventListener("mouseleave", function () { if (chip.dataset.key !== activeCompanyKey) chip.style.borderColor = "transparent"; });
        chip.addEventListener("click", function () {
          chip.style.borderColor = c.color;
          selectCompany(chip.dataset.key);
        });
      });

      var today = new Date();
      var todayStr = today.getFullYear() === 2026
        ? String(today.getDate()).padStart(2, "0") + "/" + String(today.getMonth() + 1).padStart(2, "0")
        : null;
      var todaysCompany = companiesData.find(function (c) {
        return companyVisits[c.key] && companyVisits[c.key].date === todayStr;
      });
      var initial =
        companiesData.find(function (c) { return c.key === activeCompanyKey; }) ||
        todaysCompany || companiesData[0];
      var initialChip = picker.querySelector('[data-key="' + initial.key + '"]');
      if (initialChip) initialChip.style.borderColor = initial.color;
      selectCompany(initial.key);
    });
  }

  // ---- Trajetos (mapas reais entre hotel e cada visita) ----
  var routeItinerary = null;
  var activeRouteDayId = null;

  function mapsEmbedUrl(origin, destination) {
    return "https://maps.google.com/maps?saddr=" + encodeURIComponent(origin) + "&daddr=" + encodeURIComponent(destination) + "&output=embed";
  }

  function computeLegs(day, hotelAddr) {
    var legs = [];
    var prevAddr = hotelAddr;
    var prevLabel = "Hotel";
    day.stops.forEach(function (stop) {
      if (stop.arrival) {
        legs.push({ from: prevLabel, to: stop.company, fromAddr: prevAddr, toAddr: stop.addr, time: stop.arrival.label, warn: stop.arrival.warn });
      }
      prevAddr = stop.addr;
      prevLabel = stop.company;
    });
    if (day.returnToHotel) {
      legs.push({ from: prevLabel, to: "Hotel", fromAddr: prevAddr, toAddr: "Iguatemi Stay BT", time: day.returnToHotel.label, warn: false });
    }
    return legs;
  }

  function isRealAddr(addr) {
    return addr && addr !== "A definir" && addr !== "Sem visita externa";
  }

  function renderRouteDay(day) {
    var container = document.getElementById("route-legs");
    var legs = computeLegs(day, routeItinerary.hotel.addr);

    if (!legs.length) {
      container.innerHTML = '<div class="card fade-in"><p class="empty-state">Sem deslocamentos registrados neste dia.</p></div>';
      return;
    }

    var html = legs
      .map(function (leg, i) {
        var mapHtml = (isRealAddr(leg.fromAddr) && isRealAddr(leg.toAddr))
          ? '<div class="route-map-tilt"><iframe src="' + mapsEmbedUrl(leg.fromAddr, leg.toAddr) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Rota de ' + leg.from + ' até ' + leg.to + '"></iframe></div>'
          : '<div class="route-placeholder">Endereço ainda a confirmar para calcular a rota</div>';

        return (
          '<div class="card route-card" style="animation-delay:' + (i * 90) + 'ms">' +
            '<div class="route-head">' +
              '<div class="route-path"><span>' + leg.from + '</span><span class="rp-arrow">→</span><span>' + leg.to + "</span></div>" +
              '<span class="route-time num' + (leg.warn ? " warn" : "") + '">' + leg.time + "</span>" +
            "</div>" +
            mapHtml +
          "</div>"
        );
      })
      .join("");

    container.innerHTML = html;
    container.querySelectorAll(".route-card").forEach(function (el) { el.classList.add("stagger-in"); });
  }

  function loadRoutes() {
    api("/api/itinerary").then(function (data) {
      routeItinerary = data;
      var picker = document.getElementById("route-daypicker");
      picker.innerHTML = data.days
        .map(function (d) { return '<button role="tab" aria-controls="route-legs" data-day="' + d.id + '">' + d.weekday.slice(0, 3) + " " + d.date + "</button>"; })
        .join("");
      wireTablist(picker);
      picker.querySelectorAll("button").forEach(function (btn) {
        btn.addEventListener("click", function () { selectRouteDay(btn.dataset.day); });
      });

      var today = new Date();
      var todayStr = today.getFullYear() === 2026
        ? String(today.getDate()).padStart(2, "0") + "/" + String(today.getMonth() + 1).padStart(2, "0")
        : null;
      var initial =
        data.days.find(function (d) { return d.id === activeRouteDayId; }) ||
        data.days.find(function (d) { return d.date === todayStr; }) ||
        data.days[0];
      selectRouteDay(initial.id);
    });
  }

  function selectRouteDay(id) {
    activeRouteDayId = id;
    var picker = document.getElementById("route-daypicker");
    picker.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.day === id);
    });
    syncTabState(picker);
    var day = routeItinerary.days.find(function (d) { return d.id === id; });
    if (day) renderRouteDay(day);
  }

  // ---- Selos (presença por empresa, gamificação individualizada) ----
  var NAVY = "#081B33";
  var RED = "#D31E24";

  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
  }
  function relLum(hex) {
    var rgb = hexToRgb(hex);
    var chans = ["r", "g", "b"].map(function (c) {
      var v = rgb[c] / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
  }
  function contrastRatio(hexA, hexB) {
    var a = relLum(hexA) + 0.05, b = relLum(hexB) + 0.05;
    return Math.max(a, b) / Math.min(a, b);
  }
  function nameColorFor(company) {
    return contrastRatio(company.color, "#FFFFFF") >= 4.5 ? company.color : NAVY;
  }
  function ribbonTextFor(company) {
    return contrastRatio(company.color, "#FFFFFF") >= contrastRatio(company.color, NAVY) ? "#FFFFFF" : NAVY;
  }

  function fitBox(ratio, maxW, maxH) {
    var w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = maxH * ratio; }
    return { w: w, h: h };
  }

  // Hexágono alongado; entre y=46 e y=146 a largura é constante (132px,
  // x=34-166) — todo conteúdo fica nessa faixa, então não estoura o contorno.
  var HEX_POINTS = "100,10 166,46 166,146 100,192 34,146 34,46";
  var SAFE_W = 122;

  function badgeSVG(company, unlocked) {
    var cx = 100;
    var faceFill = unlocked ? "#FFFFFF" : "#DDE1E8";
    var borderColor = unlocked ? NAVY : "#9AA3B2";
    var opacity = unlocked ? 1 : 0.62;
    var filterAttr = unlocked ? "" : ' filter="grayscale(1)"';

    var logoCy = company.hasWordmark ? 78 : 72;
    var plateH = company.hasWordmark ? 52 : 38;
    var box = fitBox(company.logoRatio, SAFE_W - 18, plateH - 14);
    var imgX = cx - box.w / 2, imgY = logoCy - box.h / 2;
    var imgFilter = company.logoBg === "dark" ? ' style="filter:brightness(0)"' : "";
    var logoMarkup = company.logo
      ? '<image x="' + imgX + '" y="' + imgY + '" width="' + box.w + '" height="' + box.h + '" href="' + company.logo + '" preserveAspectRatio="xMidYMid meet"' + imgFilter + "/>"
      : ""; // sem arte ainda (ex: empresa recém-adicionada) — some, o nome abaixo já identifica

    var nameColor = unlocked ? nameColorFor(company) : "#8C94A0";
    var fs = (company.name.length <= 6 ? 24 : company.name.length <= 9 ? 20 : company.name.length <= 13 ? 16 : 13) * 0.8;
    var nameMarkup = (!company.hasWordmark || !company.logo)
      ? '<text x="100" y="104" font-family="Arial Narrow, sans-serif" font-size="' + fs + '" font-weight="800" fill="' + nameColor + '" text-anchor="middle" letter-spacing="0.3" style="text-transform:uppercase">' + company.name + "</text>"
      : "";

    var ribbonW = SAFE_W, ribbonH = 24, ribbonY = 112;
    var ribbonFill = unlocked ? company.color : "#9AA3B2";
    var ribbonTextColor = unlocked ? ribbonTextFor(company) : "#FFFFFF";
    // Pós-imersão não há mais o que "conquistar": ou a presença foi registrada, ou não.
    var statusText = unlocked ? "SELO CONFIRMADO" : "SEM REGISTRO";

    return (
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
        '<g opacity="' + opacity + '"' + filterAttr + '>' +
          '<polygon points="' + HEX_POINTS + '" fill="' + faceFill + '" stroke="' + borderColor + '" stroke-width="6" stroke-linejoin="round"/>' +
          logoMarkup +
          nameMarkup +
          '<rect x="' + (cx - ribbonW / 2) + '" y="' + ribbonY + '" width="' + ribbonW + '" height="' + ribbonH + '" rx="4" fill="' + ribbonFill + '"/>' +
          '<text x="100" y="' + (ribbonY + ribbonH / 2 + 3) + '" font-family="Inter, sans-serif" font-size="7.6" font-weight="700" fill="' + ribbonTextColor + '" text-anchor="middle" letter-spacing="1">' + statusText + "</text>" +
        "</g>" +
      "</svg>"
    );
  }

  // ---- Compartilhar selo (story 1080×1920 via canvas) ----
  function logoAsDataUri(url) {
    return fetch(url)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.readAsDataURL(blob);
        });
      });
  }

  function svgToImage(svgText) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function shareBadgeImage(company, me) {
    // SVG renderizado como imagem não carrega href externo — inline o logo antes
    var prep = company.logo ? logoAsDataUri(company.logo) : Promise.resolve(null);
    Promise.all([prep, document.fonts.ready])
      .then(function (results) {
        var c = results[0] ? Object.assign({}, company, { logo: results[0] }) : company;
        return svgToImage(badgeSVG(c, true));
      })
      .then(function (img) {
        var W = 1080, H = 1920;
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var ctx = cv.getContext("2d");

        ctx.fillStyle = NAVY;
        ctx.fillRect(0, 0, W, H);

        var t1 = "LEPV ", t2 = "SP";
        ctx.font = '800 108px "Barlow Condensed", "Arial Narrow", sans-serif';
        var w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width;
        var x0 = (W - (w1 + w2)) / 2;
        ctx.textAlign = "left";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(t1, x0, 300);
        ctx.fillStyle = "#F04E4E";
        ctx.fillText(t2, x0 + w1, 300);

        ctx.textAlign = "center";
        ctx.font = "700 34px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillText("M I S S Ã O   E M P R E E N D E D O R A", W / 2, 368);

        var bw = 780;
        ctx.drawImage(img, (W - bw) / 2, 480, bw, bw);

        ctx.font = '800 72px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(me.name.toUpperCase(), W / 2, 1430);
        ctx.font = '700 44px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("EDIÇÃO " + String(me.order).padStart(2, "0") + "/11", W / 2, 1500);

        ctx.fillStyle = RED;
        ctx.fillRect(W / 2 - 44, 1580, 88, 6);
        ctx.font = "700 38px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText("19–24 JUL 2026 · SÃO PAULO", W / 2, 1680);

        cv.toBlob(function (blob) {
          var file = new File([blob], "selo-" + company.key + ".png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: "Selo " + company.name + " — LEPV SP" }).catch(function () {});
          } else {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = file.name;
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
          }
        }, "image/png");
      });
  }

  function editionBadgeSVG(order) {
    var num = String(order).padStart(2, "0");
    return (
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="50" cy="50" r="47" fill="' + RED + '"/>' +
        '<circle cx="50" cy="50" r="43" fill="' + NAVY + '"/>' +
        '<circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1" stroke-dasharray="1.2 3.4"/>' +
        '<text x="50" y="38" font-family="Inter, sans-serif" font-size="6.5" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1.2">LEPV SP</text>' +
        '<text x="50" y="63" font-family="Arial Narrow, sans-serif" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">' + num + "</text>" +
        '<text x="50" y="76" font-family="Inter, sans-serif" font-size="7" font-weight="700" fill="rgba(255,255,255,0.65)" text-anchor="middle" letter-spacing="1">DE 11</text>' +
      "</svg>"
    );
  }

  function loadBadges() {
    Promise.all([meReady, api("/api/badges"), api("/api/companies")]).then(function (results) {
      var me = results[0], badges = results[1], companies = results[2];
      var container = document.getElementById("badges-content");
      var pct = Math.round((badges.earned.length / badges.totalCompanies) * 100);
      var groupPct = Math.round((badges.group.confirmed / badges.group.possible) * 100);

      var headerHtml =
        '<div class="card">' +
          '<div class="badges-header">' +
            '<div class="edition-badge">' + editionBadgeSVG(me.order) + "</div>" +
            '<div class="badges-summary">' +
              '<span class="name">' + me.name.split(" ")[0] + "</span>" +
              '<div class="progress-row">' +
                '<div class="plabel"><span>Seus selos</span><span class="num">' + badges.earned.length + "/" + badges.totalCompanies + "</span></div>" +
                '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
              "</div>" +
              '<div class="progress-row">' +
                '<div class="plabel"><span>Grupo (todo mundo, todas as visitas)</span><span class="num">' + badges.group.confirmed + "/" + badges.group.possible + "</span></div>" +
                '<div class="progress-track"><div class="progress-fill group" style="width:' + groupPct + '%"></div></div>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>";

      var seenKey = "lepv-badges-seen-" + me.order;
      var previouslySeen = [];
      try { previouslySeen = JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch (e) {}
      var newlyUnlocked = badges.earned.filter(function (k) { return previouslySeen.indexOf(k) === -1; });

      var gridHtml = companies
        .map(function (c) {
          var unlocked = badges.earned.indexOf(c.key) !== -1;
          var isNew = newlyUnlocked.indexOf(c.key) !== -1;
          return (
            '<div class="badge-tile' + (isNew ? " reveal" : "") + '">' +
              badgeSVG(c, unlocked) +
              '<span class="blabel">' + c.name + "</span>" +
              (unlocked ? '<button class="badge-share" data-key="' + c.key + '">Compartilhar</button>' : "") +
            "</div>"
          );
        })
        .join("");

      container.innerHTML = headerHtml + '<div class="badges-grid">' + gridHtml + "</div>";

      container.querySelectorAll(".badge-share").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var company = companies.find(function (c) { return c.key === btn.dataset.key; });
          if (company) shareBadgeImage(company, me);
        });
      });

      // Placar da enquete do bóton — só o admin vê, pra fechar o pedido
      if (me.admin) {
        Promise.all([api("/api/pin-poll/all"), api("/api/members")]).then(function (r) {
          var poll = r[0], members = r[1];
          var rows = members
            .map(function (m) {
              var entry = poll[String(m.order)];
              var status = entry === undefined
                ? '<span class="pin-status pending">sem resposta</span>'
                : entry.want
                  ? '<span class="pin-status yes">quer</span>'
                  : '<span class="pin-status no">não quer</span>';
              return '<div class="pin-row"><span class="pn">' + esc(m.name) + "</span>" + status + "</div>";
            })
            .join("");
          var wants = members.filter(function (m) { return (poll[String(m.order)] || {}).want; }).length;
          container.innerHTML +=
            '<div class="card">' +
              '<p class="section-label" style="color:var(--red);">Enquete do bóton (admin) — ' + wants + "/11 confirmados</p>" +
              '<div class="pin-list">' + rows + "</div>" +
            "</div>";
        });
      }

      try { localStorage.setItem(seenKey, JSON.stringify(badges.earned)); } catch (e) {}

      if (newlyUnlocked.length) {
        var names = newlyUnlocked.map(function (k) { return (companies.find(function (c) { return c.key === k; }) || {}).name; }).join(", ");
        var toast = document.createElement("div");
        toast.className = "unlock-toast";
        toast.textContent = (newlyUnlocked.length === 1 ? "Novo selo desbloqueado: " : "Novos selos desbloqueados: ") + names + "!";
        document.body.appendChild(toast);
        requestAnimationFrame(function () { toast.classList.add("show"); });
        setTimeout(function () {
          toast.classList.remove("show");
          setTimeout(function () { toast.remove(); }, 400);
        }, 3800);
      }
    });
  }

  // ---- Galeria da imersão (mídias no Drive da liga) ----
  // Nada é re-hospedado: o endpoint de miniatura do Google transcodifica HEIC
  // e gera pôster para vídeo, então tudo aparece sem gastar volume. Só as capas
  // vivem no repo, para o que mais aparece não depender do Drive.
  var galleryData = null;

  function galleryReady() {
    if (galleryData) return Promise.resolve(galleryData);
    return api("/api/gallery").then(function (g) { galleryData = g; return g; });
  }
  function driveThumb(id, width) {
    return "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + width;
  }
  function drivePreview(id) {
    return "https://drive.google.com/file/d/" + id + "/preview";
  }
  // Conjunto do dia: capa (quando é arte de recap, não repetida na lista),
  // tudo das empresas visitadas naquele dia e os extras.
  function daySet(g, day) {
    var items = [];
    (day.companies || []).forEach(function (key) {
      var c = g.companies[key];
      if (c && !c.mirrorOf) items = items.concat(c.items);
    });
    items = items.concat(day.extras || []);
    if (day.cover && !items.some(function (i) { return i.id === day.cover; })) {
      items.unshift({ id: day.cover, type: "photo", caption: day.label + " — " + day.weekday + " " + day.date });
    }
    return items;
  }

  // ---- Lightbox ----
  var lb = null, lbItems = [], lbIndex = 0;

  function buildLightbox() {
    lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML =
      '<button class="lb-close" aria-label="Fechar">×</button>' +
      '<button class="lb-nav lb-prev" aria-label="Anterior">‹</button>' +
      '<figure class="lb-stage"><div class="lb-media"></div><figcaption class="lb-cap"></figcaption></figure>' +
      '<button class="lb-nav lb-next" aria-label="Próxima">›</button>';
    document.body.appendChild(lb);
    lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
    lb.querySelector(".lb-prev").addEventListener("click", function (e) { e.stopPropagation(); stepLightbox(-1); });
    lb.querySelector(".lb-next").addEventListener("click", function (e) { e.stopPropagation(); stepLightbox(1); });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lb-stage")) closeLightbox(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    });
  }
  function renderLightbox() {
    var item = lbItems[lbIndex];
    var media = lb.querySelector(".lb-media");
    media.innerHTML = item.type === "video"
      ? '<iframe src="' + drivePreview(item.id) + '" allow="autoplay" allowfullscreen></iframe>'
      : '<img class="' + (item.rotated ? "rotated" : "") + '" src="' + driveThumb(item.id, 1600) + '" alt="' + esc(item.caption || "") + '">';
    lb.querySelector(".lb-cap").innerHTML =
      '<span class="lb-text">' + esc(item.caption || "") + "</span>" +
      '<span class="lb-count">' + (lbIndex + 1) + " / " + lbItems.length + "</span>";
    lb.querySelector(".lb-prev").style.visibility = lbItems.length > 1 ? "visible" : "hidden";
    lb.querySelector(".lb-next").style.visibility = lbItems.length > 1 ? "visible" : "hidden";
  }
  function stepLightbox(delta) {
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    renderLightbox();
  }
  function openLightbox(items, index) {
    if (!items.length) return;
    if (!lb) buildLightbox();
    lbItems = items;
    lbIndex = index || 0;
    renderLightbox();
    lb.classList.add("open");
    document.body.classList.add("lb-lock");
  }
  function closeLightbox() {
    lb.classList.remove("open");
    lb.querySelector(".lb-media").innerHTML = ""; // corta o áudio de vídeo aberto
    document.body.classList.remove("lb-lock");
  }

  // Tira de miniaturas reutilizável; devolve o HTML e liga os cliques depois.
  function thumbStripHtml(items) {
    return (
      '<div class="thumb-strip">' +
      items
        .map(function (item, i) {
          return (
            '<button class="thumb" data-i="' + i + '" title="' + esc(item.caption || "") + '">' +
              '<img loading="lazy" class="' + (item.rotated ? "rotated" : "") + '" src="' + driveThumb(item.id, 400) + '" alt="' + esc(item.caption || "") + '">' +
              (item.type === "video" ? '<span class="thumb-play">▶</span>' : "") +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  function wireThumbs(root, items) {
    root.querySelectorAll(".thumb").forEach(function (btn) {
      btn.addEventListener("click", function () { openLightbox(items, parseInt(btn.dataset.i, 10)); });
    });
  }

  // Galeria da empresa (aba Empresas, acima dos aprendizados)
  function renderGalleryPanel(companyKey) {
    var panel = document.getElementById("gallery-panel");
    galleryReady().then(function (g) {
      if (companyKey !== activeCompanyKey) return;
      var c = g.companies[companyKey];
      if (!c || !c.items.length) { panel.innerHTML = ""; return; }
      var count = c.items.length;
      panel.innerHTML =
        '<div class="card">' +
          '<p class="section-label">Registro da visita</p>' +
          '<p class="questions-hint">' +
            (c.note ? esc(c.note) + " " : "") +
            count + (count === 1 ? " mídia" : " mídias") + " desta visita. Toque para ampliar." +
          "</p>" +
          thumbStripHtml(c.items) +
        "</div>";
      wireThumbs(panel, c.items);
    });
  }

  // ---- Legado: o acervo da imersão ----
  // A viagem acabou; o que fica é isto. Consolida os aprendizados de todas as
  // empresas em um lugar só e deixa qualquer membro somar o ponto dele — sem
  // depender de qual visita ele pegou (o selo registra presença, não permissão).
  var LEARNING_MAX = 600;
  var legacyState = { filter: "all", company: "", draft: "", editing: null };

  function legacyDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  function learningItemHtml(item, company, me) {
    var mine = item.order === me.order;
    var canEdit = mine || me.admin;
    var when = legacyDate(item.editedAt || item.createdAt);
    var editing = legacyState.editing === item.id;
    var body = editing
      ? '<textarea class="learn-edit" maxlength="' + LEARNING_MAX + '">' + esc(item.text) + "</textarea>" +
        '<div class="learn-edit-foot">' +
          '<button class="btn-primary edit-save">Salvar</button>' +
          '<button class="btn-ghost edit-cancel">Cancelar</button>' +
        "</div>"
      : '<div class="lt-text">' + esc(item.text) + "</div>" +
        '<div class="lt-meta">' +
          '<span class="who">' + esc(item.addedBy) + "</span>" +
          (when ? '<span class="sep">·</span><span>' + when + (item.editedAt ? " (editado)" : "") + "</span>" : "") +
          (mine ? '<span class="mine-tag">seu ponto</span>' : "") +
        "</div>";

    return (
      '<li data-id="' + item.id + '" data-company="' + company.key + '" style="--lg-color:' + company.color + '">' +
        '<div class="lt">' + body + "</div>" +
        (canEdit && !editing
          ? '<div class="lt-actions">' +
              (mine ? '<button class="edit" title="Editar">Editar</button>' : "") +
              '<button class="del" title="Remover">×</button>' +
            "</div>"
          : "") +
      "</li>"
    );
  }

  function legacyGroupHtml(company, list, me) {
    var logoHtml = company.logo
      ? '<span class="lgroup-logo' + (company.logoBg === "dark" ? " dark" : "") + '"><img src="' + company.logo + '" alt=""></span>'
      : '<span class="lgroup-logo" style="background:' + company.color + '"></span>';
    var meta = company.attendees
      ? company.attendees + (company.attendees === 1 ? " membro esteve na visita" : " membros estiveram na visita")
      : "Visita registrada no roteiro";
    return (
      '<div class="card lgroup">' +
        '<div class="lgroup-head">' +
          logoHtml +
          "<div><div class=\"lgroup-name\">" + company.name + '</div><div class="lgroup-meta">' + meta + "</div></div>" +
          '<span class="lgroup-count' + (list.length ? " has" : "") + '">' + list.length + (list.length === 1 ? " ponto" : " pontos") + "</span>" +
        "</div>" +
        (list.length
          ? '<ul class="learn-list">' + list.map(function (i) { return learningItemHtml(i, company, me); }).join("") + "</ul>"
          : '<p class="empty-state">Ninguém registrou nada desta visita ainda. Seja o primeiro.</p>') +
      "</div>"
    );
  }

  function renderLegacy(me, legacy, learnings, gallery) {
    var content = document.getElementById("legacy-content");
    var t = legacy.totals;
    var ed = legacy.edition;
    var period = ed.start && ed.end ? ed.start + " a " + ed.end + " de " + ed.year : "";

    var heroHtml =
      '<div class="card now-card legacy-hero">' +
        '<p class="now-label">Imersão concluída</p>' +
        '<h2 class="lh-title">' + ed.title + " — " + ed.city + "</h2>" +
        '<p class="lh-sub">' + (period ? period + ". " : "") +
          "Este app deixou de ser roteiro de viagem e virou o acervo da liga: o que cada um levou de volta de cada empresa, registrado por quem viveu. Adicione o seu ponto — é isso que sobra da imersão." +
        "</p>" +
        '<div class="stat-grid">' +
          '<div class="stat"><div class="sn">' + t.companies + '</div><div class="sl">Empresas</div></div>' +
          '<div class="stat"><div class="sn">' + t.members + '</div><div class="sl">Membros</div></div>' +
          '<div class="stat accent"><div class="sn">' + t.learnings + '</div><div class="sl">Aprendizados</div></div>' +
          '<div class="stat"><div class="sn">' + t.contributors + "/" + t.members + '</div><div class="sl">Contribuíram</div></div>' +
        "</div>" +
      "</div>";

    // Álbum: uma capa por dia, cada uma abre o conjunto daquele dia.
    var totalMedia = Object.keys(gallery.companies).reduce(function (n, k) {
      return n + (gallery.companies[k].mirrorOf ? 0 : gallery.companies[k].items.length);
    }, 0) + gallery.days.reduce(function (n, d) { return n + (d.extras || []).length; }, 0);

    var albumHtml =
      '<div class="card">' +
        '<p class="section-label">O álbum da viagem</p>' +
        '<p class="questions-hint">' + totalMedia + " fotos e vídeos, dia a dia. Toque em um dia para percorrer.</p>" +
        '<div class="album-grid">' +
          gallery.days
            .map(function (d) {
              return (
                '<button class="album-day" data-day="' + d.day + '">' +
                  '<img loading="lazy" src="/gallery/day-' + d.day + '.jpg" alt="' + d.label + '">' +
                  '<span class="ad-shade"></span>' +
                  '<span class="ad-meta"><span class="ad-n">' + d.label + "</span>" +
                  '<span class="ad-d">' + d.weekday + " " + d.date + "</span></span>" +
                "</button>"
              );
            })
            .join("") +
        "</div>" +
      "</div>";

    var optionsHtml = legacy.companies
      .map(function (c) {
        return '<option value="' + c.key + '"' + (c.key === legacyState.company ? " selected" : "") + ">" + c.name + (c.mine ? " — você esteve lá" : "") + "</option>";
      })
      .join("");

    var formHtml =
      '<div class="card" id="contrib-card">' +
        '<p class="section-label">Adicione seu ponto ao acervo</p>' +
        '<div class="contrib-form">' +
          '<select id="contrib-company" aria-label="Empresa"><option value="">Escolha a empresa...</option>' + optionsHtml + "</select>" +
          '<textarea id="contrib-text" maxlength="' + LEARNING_MAX + '" placeholder="O que dessa visita você leva para o que constrói? Uma ideia por ponto." aria-label="Aprendizado">' + esc(legacyState.draft) + "</textarea>" +
          '<div class="contrib-foot">' +
            '<span class="contrib-count" id="contrib-count">' + legacyState.draft.length + "/" + LEARNING_MAX + "</span>" +
            '<button class="btn-primary" id="contrib-send">Registrar no acervo</button>' +
          "</div>" +
        "</div>" +
      "</div>";

    var mineCount = Object.keys(learnings).reduce(function (n, k) {
      return n + learnings[k].filter(function (i) { return i.order === me.order; }).length;
    }, 0);

    var filtersHtml =
      '<div class="legacy-filters">' +
        '<button class="lfilter' + (legacyState.filter === "all" ? " active" : "") + '" data-filter="all">Tudo <span class="n">' + t.learnings + "</span></button>" +
        '<button class="lfilter' + (legacyState.filter === "mine" ? " active" : "") + '" data-filter="mine">Meus pontos <span class="n">' + mineCount + "</span></button>" +
        legacy.companies
          .map(function (c) {
            var n = (learnings[c.key] || []).length;
            return (
              '<button class="lfilter' + (legacyState.filter === c.key ? " active" : "") + '" data-filter="' + c.key + '">' +
                '<span class="dot" style="background:' + c.color + '"></span>' + c.name + '<span class="n">' + n + "</span>" +
              "</button>"
            );
          })
          .join("") +
      "</div>";

    var groups = legacy.companies
      .filter(function (c) {
        if (legacyState.filter === "all" || legacyState.filter === "mine") return true;
        return c.key === legacyState.filter;
      })
      .map(function (c) {
        var list = (learnings[c.key] || []).slice();
        if (legacyState.filter === "mine") list = list.filter(function (i) { return i.order === me.order; });
        // Nas visões amplas, empresa sem nada registrado não vira ruído.
        if (!list.length && legacyState.filter !== c.key) return "";
        return legacyGroupHtml(c, list, me);
      })
      .filter(Boolean)
      .join("");

    if (!groups) {
      groups =
        '<div class="card"><div class="legacy-empty">' +
          '<div class="le-mark">“</div>' +
          '<div class="le-title">' + (legacyState.filter === "mine" ? "Você ainda não registrou nada" : "O acervo começa com o primeiro ponto") + "</div>" +
          '<p class="le-text">' +
            (legacyState.filter === "mine"
              ? "Escolha uma empresa acima e escreva o que ficou daquela visita para você."
              : "Foram seis dias e doze empresas. Alguma coisa mudou de ideia em cada um — escreva antes que vire só lembrança.") +
          "</p>" +
        "</div></div>";
    }

    var contribHtml = legacy.contributors.length
      ? '<div class="card">' +
          '<p class="section-label">Quem construiu o acervo</p>' +
          '<div class="contrib-list">' +
            legacy.contributors
              .map(function (c, i) {
                var pct = Math.round((c.count / legacy.contributors[0].count) * 100);
                return (
                  '<div class="contrib-row">' +
                    '<span class="cr-pos">' + (i + 1) + "</span>" +
                    '<span class="cr-name">' + esc(c.name) + "</span>" +
                    '<span class="cr-bar"><span style="width:' + pct + '%"></span></span>' +
                    '<span class="cr-n">' + c.count + "</span>" +
                  "</div>"
                );
              })
              .join("") +
          "</div>" +
        "</div>"
      : "";

    content.innerHTML = heroHtml + albumHtml + formHtml + filtersHtml + groups + contribHtml;
    wireLegacy(me, gallery);
  }

  function wireLegacy(me, gallery) {
    var content = document.getElementById("legacy-content");

    content.querySelectorAll(".album-day").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var day = gallery.days.find(function (d) { return d.day === btn.dataset.day; });
        if (day) openLightbox(daySet(gallery, day), 0);
      });
    });
    var select = document.getElementById("contrib-company");
    var textarea = document.getElementById("contrib-text");
    var counter = document.getElementById("contrib-count");

    select.addEventListener("change", function () { legacyState.company = select.value; });
    textarea.addEventListener("input", function () {
      legacyState.draft = textarea.value;
      counter.textContent = textarea.value.length + "/" + LEARNING_MAX;
      counter.classList.toggle("over", textarea.value.length >= LEARNING_MAX);
    });

    document.getElementById("contrib-send").addEventListener("click", function () {
      var key = select.value;
      var text = textarea.value.trim();
      if (!key) return window.alert("Escolha de qual empresa é esse aprendizado.");
      if (!text) return window.alert("Escreva o ponto antes de registrar.");
      api("/api/learnings", { method: "POST", body: JSON.stringify({ companyKey: key, text: text }) }).then(function (res) {
        if (res && res.error) return window.alert("Não deu pra registrar agora. Tente de novo.");
        legacyState.draft = "";
        legacyState.company = key; // provável que a próxima anotação seja da mesma visita
        loadLegacy();
      });
    });

    content.querySelectorAll(".lfilter").forEach(function (btn) {
      btn.addEventListener("click", function () {
        legacyState.filter = btn.dataset.filter;
        legacyState.editing = null;
        loadLegacy();
      });
    });

    content.querySelectorAll(".learn-list li").forEach(function (li) {
      var id = parseInt(li.dataset.id, 10);
      var key = li.dataset.company;
      var editBtn = li.querySelector(".edit");
      var delBtn = li.querySelector(".del");
      var saveBtn = li.querySelector(".edit-save");
      var cancelBtn = li.querySelector(".edit-cancel");

      if (editBtn) editBtn.addEventListener("click", function () { legacyState.editing = id; loadLegacy(); });
      if (cancelBtn) cancelBtn.addEventListener("click", function () { legacyState.editing = null; loadLegacy(); });
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          var text = li.querySelector(".learn-edit").value.trim();
          if (!text) return window.alert("O ponto não pode ficar vazio.");
          api("/api/learnings/" + key + "/" + id, { method: "PUT", body: JSON.stringify({ text: text }) }).then(function (res) {
            if (res && res.error) return window.alert("Não deu pra salvar a edição.");
            legacyState.editing = null;
            loadLegacy();
          });
        });
      }
      if (delBtn) {
        delBtn.addEventListener("click", function () {
          if (!window.confirm("Remover este ponto do acervo?")) return;
          api("/api/learnings/" + key + "/" + id, { method: "DELETE" }).then(function () { loadLegacy(); });
        });
      }
    });
  }

  function loadLegacy() {
    Promise.all([meReady, api("/api/legacy"), api("/api/learnings"), galleryReady()]).then(function (r) {
      renderLegacy(r[0], r[1], r[2], r[3]);
    });
  }

  // ---- Checklist (server-persisted, compartilhado entre todos os membros) ----
  function renderChecklist(items) {
    var listEl = document.getElementById("checklist-items");
    if (!items.length) {
      listEl.innerHTML = '<p class="empty-state">Nenhum combinado registrado.</p>';
      return;
    }
    listEl.innerHTML = items
      .map(function (item) {
        return (
          '<li class="' + (item.done ? "done" : "") + '" data-id="' + item.id + '">' +
            '<input type="checkbox" ' + (item.done ? "checked" : "") + ">" +
            '<span class="txt">' + esc(item.text) +
              (item.addedBy ? '<span class="who-added">adicionado por ' + esc(item.addedBy) + "</span>" : "") +
            "</span>" +
            '<button class="del-btn" title="Remover">×</button>' +
          "</li>"
        );
      })
      .join("");

    listEl.querySelectorAll("li").forEach(function (li) {
      var id = li.dataset.id;
      li.querySelector('input[type="checkbox"]').addEventListener("change", function (e) {
        api("/api/checklist/" + id, { method: "PATCH", body: JSON.stringify({ done: e.target.checked }) }).then(renderChecklist);
      });
      li.querySelector(".del-btn").addEventListener("click", function () {
        var txt = li.querySelector(".txt").childNodes[0].textContent;
        if (!window.confirm('Remover "' + txt.trim() + '" da lista de todo mundo?')) return;
        api("/api/checklist/" + id, { method: "DELETE" }).then(renderChecklist);
      });
    });
  }

  function loadChecklist() {
    api("/api/checklist").then(renderChecklist);
  }

  document.getElementById("add-item-btn").addEventListener("click", addChecklistItem);
  document.getElementById("new-item").addEventListener("keydown", function (e) {
    if (e.key === "Enter") addChecklistItem();
  });
  function addChecklistItem() {
    var input = document.getElementById("new-item");
    var text = input.value.trim();
    if (!text) return;
    api("/api/checklist", { method: "POST", body: JSON.stringify({ text: text }) }).then(function (items) {
      input.value = "";
      renderChecklist(items);
    });
  }

  // ---- Enquete do bóton limitado (pop-up até o membro responder) ----
  function maybeShowPinPoll() {
    meReady.then(function (me) {
      // O bóton é da 1ª imersão — membro novo da liga nem vê a enquete.
      if (!me.immersion) return;
      return api("/api/pin-poll").then(function (poll) { showPinPoll(me, poll); });
    });
  }
  function showPinPoll(me, poll) {
      if (poll.answered) return;

      var num = String(me.order).padStart(2, "0");
      var backdrop = document.createElement("div");
      backdrop.className = "pin-backdrop";
      var modal = document.createElement("div");
      modal.className = "pin-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "pin-modal-title");
      modal.innerHTML =
        '<div class="pin-badge">' + editionBadgeSVG(me.order) + "</div>" +
        '<p class="pin-eyebrow">Edição limitada</p>' +
        '<h3 id="pin-modal-title">Bóton ' + num + "/11 — 1ª Imersão LEPV</h3>" +
        '<p class="pin-text">Vamos produzir um bóton físico numerado, exclusivo de quem esteve na primeira imersão da LEPV em São Paulo. O seu sai com o número <strong>' + num + "/11</strong> por <strong>R$ 11,00</strong>, combinados direto com o Marcell. Quer garantir o seu?</p>" +
        '<div class="pin-actions">' +
          '<button class="btn-primary" data-want="1">Quero o meu</button>' +
          '<button class="pin-later" data-want="0">Agora não</button>' +
        "</div>";
      document.body.appendChild(backdrop);
      document.body.appendChild(modal);
      requestAnimationFrame(function () {
        backdrop.classList.add("open");
        modal.classList.add("open");
      });

      modal.querySelectorAll("[data-want]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          api("/api/pin-poll", { method: "POST", body: JSON.stringify({ want: btn.dataset.want === "1" }) }).then(function () {
            backdrop.classList.remove("open");
            modal.classList.remove("open");
            setTimeout(function () { backdrop.remove(); modal.remove(); }, 300);
          });
        });
      });
  }
  setTimeout(maybeShowPinPoll, 1400); // deixa a primeira aba assentar antes

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  // ---- Acessos (monitoramento — só o super admin) ----

  var TAB_LABELS = {
    inicio: "Início", eventos: "Eventos", membros: "Membros", acessos: "Acessos",
    legado: "Legado", empresas: "Empresas", selos: "Selos", agenda: "Roteiro",
    resumo: "A missão", arquivo: "Arquivo",
  };

  function fmtDur(min) {
    if (!min || min < 1) return "1 min";
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    return h + "h" + (m ? ("0" + m).slice(-2) : "");
  }
  function fmtWhen(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  // Cada entrada em tabs é ~1 minuto de página visível naquela aba.
  function tabsSummary(tabs) {
    return Object.keys(tabs || {})
      .map(function (k) { return { k: k, n: tabs[k] }; })
      .sort(function (a, b) { return b.n - a.n; })
      .map(function (e) { return (TAB_LABELS[e.k] || e.k) + " (" + fmtDur(e.n) + ")"; })
      .join(", ");
  }

  function loadAccess() {
    api("/api/admin/access-log").then(function (data) {
      var el = document.getElementById("access-content");
      if (!el) return;
      var today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      var dToday = data.days[today] || { public: 0, logins: 0 };
      var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      var activeWeek = data.members.filter(function (m) { return m.lastSeen >= weekAgo; }).length;

      var onlineHtml = data.online.length
        ? '<div class="table-scroll"><table class="access-table"><thead><tr>' +
            "<th>Membro</th><th>Desde</th><th>Tempo</th><th>Dispositivo</th><th>Abas</th>" +
          "</tr></thead><tbody>" +
          data.online.map(function (v) {
            return "<tr><td><span class=\"online-dot\"></span>" + esc(v.name) + "</td>" +
              "<td>" + fmtWhen(v.start) + "</td>" +
              '<td class="num">' + fmtDur(v.minutes) + "</td>" +
              "<td>" + esc(v.device) + "</td>" +
              "<td>" + esc(tabsSummary(v.tabs)) + "</td></tr>";
          }).join("") +
          "</tbody></table></div>"
        : '<p class="empty-state">Ninguém no site neste momento.</p>';

      var membersHtml = data.members.length
        ? '<div class="table-scroll"><table class="access-table"><thead><tr>' +
            "<th>Membro</th><th>Último acesso</th><th>Visitas</th><th>Tempo total</th><th>Dispositivos</th>" +
          "</tr></thead><tbody>" +
          data.members.map(function (m) {
            return "<tr><td>" + esc(m.name) + ' <span class="meta">nº ' + m.order + "</span></td>" +
              "<td>" + fmtWhen(m.lastSeen) + "</td>" +
              '<td class="num">' + m.visits + "</td>" +
              '<td class="num">' + fmtDur(m.minutes) + "</td>" +
              "<td>" + esc(m.devices.join(", ")) + "</td></tr>";
          }).join("") +
          "</tbody></table></div>"
        : '<p class="empty-state">Nenhum acesso registrado ainda.</p>';

      var visitsHtml = data.visits.length
        ? '<div class="table-scroll"><table class="access-table"><thead><tr>' +
            "<th>Membro</th><th>Entrou</th><th>Duração</th><th>Dispositivo</th><th>IP</th><th>Abas</th>" +
          "</tr></thead><tbody>" +
          data.visits.slice(0, 30).map(function (v) {
            return "<tr><td>" + esc(v.name) + "</td>" +
              "<td>" + fmtWhen(v.start) + "</td>" +
              '<td class="num">' + fmtDur(v.minutes) + "</td>" +
              "<td>" + esc(v.device) + "</td>" +
              '<td class="meta">' + esc(v.ip || "") + "</td>" +
              "<td>" + esc(tabsSummary(v.tabs)) + "</td></tr>";
          }).join("") +
          "</tbody></table></div>"
        : '<p class="empty-state">Nenhuma visita registrada ainda.</p>';

      var dayKeys = Object.keys(data.days).sort().reverse().slice(0, 14);
      var daysHtml = dayKeys.length
        ? '<div class="table-scroll"><table class="access-table"><thead><tr>' +
            "<th>Dia</th><th>Páginas públicas</th><th>Logins</th>" +
          "</tr></thead><tbody>" +
          dayKeys.map(function (d) {
            var rec = data.days[d];
            return "<tr><td>" + d.split("-").reverse().join("/") + "</td>" +
              '<td class="num">' + (rec.public || 0) + "</td>" +
              '<td class="num">' + (rec.logins || 0) + "</td></tr>";
          }).join("") +
          "</tbody></table></div>"
        : '<p class="empty-state">Sem tráfego registrado ainda.</p>';

      el.innerHTML =
        '<div class="card">' +
          '<div class="access-refresh">' +
            '<p class="section-label">Monitoramento de acessos (super admin)</p>' +
            '<button type="button" class="avatar-edit" id="access-refresh-btn">Atualizar</button>' +
          "</div>" +
          '<p class="hint" style="font-size:11.5px; color: var(--graphite-soft); margin: 4px 0 12px;">Visitas de membros logados (uma visita = atividade contínua, até 30 min de pausa). Visitantes anônimos entram só como contagem diária, sem identificação.</p>' +
          '<div class="access-stats">' +
            '<div class="stat-cell"><div class="sv">' + data.online.length + '</div><div class="sk">No site agora</div></div>' +
            '<div class="stat-cell"><div class="sv">' + (dToday.logins || 0) + '</div><div class="sk">Logins hoje</div></div>' +
            '<div class="stat-cell"><div class="sv">' + (dToday.public || 0) + '</div><div class="sk">Páginas públicas hoje</div></div>' +
            '<div class="stat-cell"><div class="sv">' + activeWeek + '</div><div class="sk">Membros ativos · 7 dias</div></div>' +
          "</div>" +
        "</div>" +
        '<div class="card"><p class="section-label">No site agora</p>' + onlineHtml + "</div>" +
        '<div class="card"><p class="section-label">Resumo por membro</p>' + membersHtml + "</div>" +
        '<div class="card"><p class="section-label">Últimas visitas</p>' + visitsHtml + "</div>" +
        '<div class="card"><p class="section-label">Tráfego por dia</p>' + daysHtml + "</div>";

      var refreshBtn = document.getElementById("access-refresh-btn");
      if (refreshBtn) refreshBtn.addEventListener("click", loadAccess);
    }).catch(function () {
      var el = document.getElementById("access-content");
      if (el) el.innerHTML = '<div class="card"><p class="empty-state">Não foi possível carregar os acessos.</p></div>';
    });
  }

  var loaders = {
    inicio: loadInicio,
    membros: loadMembers,
    eventos: loadEvents,
    acessos: loadAccess,
    legado: loadLegacy,
    resumo: loadMission,
    agenda: loadAgenda,
    empresas: loadCompanies,
    selos: loadBadges,
    // Arquivo reúne o que era operação da viagem: trajetos, quartos e combinados.
    arquivo: function () { loadRoutes(); loadRooms(); loadChecklist(); },
  };

  // O app abre na liga (Quem somos); o acervo da imersão sai da aba Membros.
  activateTab("inicio");
})();
