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
    tabButtons.forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
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
  }
  tabButtons.forEach(function (b) {
    b.addEventListener("click", function () { activateTab(b.dataset.tab); });
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
    "day-seg20", "co-nomad", "co-mottu", "day-ter21", "co-insper", "co-mirow",
    "co-sharpi", "day-qua22", "co-bain", "co-revolut", "day-qui23", "co-link",
    "co-pax", "co-enter", "day-sex24", "co-tivita",
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
  function renderMural(events, lessons, meetings) {
    var card = document.getElementById("mural-card");
    var today = new Date();
    today = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

    muralSlides = events.map(function (e) {
      return {
        tag: "Aviso", date: e.date, title: e.title, text: e.text,
        photos: (e.photos || []).map(function (p) { return p.url; }),
        by: e.createdByName,
      };
    });
    // "Outras atividades": aulas futuras e reuniões abertas entram sozinhas.
    lessons.filter(function (l) { return l.date >= today; }).forEach(function (l) {
      muralSlides.push({
        tag: "Aula", auto: true, date: l.date, title: l.title,
        text: (l.description || "") + (l.signupsOpen ? (l.description ? "\n" : "") + "Inscrições abertas — garanta sua vaga." : ""),
        cta: { label: l.signupsOpen ? "Inscrever-se" : "Ver materiais", tab: "materiais" },
      });
    });
    meetings.filter(function (m) { return m.open; }).forEach(function (m) {
      muralSlides.push({
        tag: "Reunião", auto: true, date: m.date, title: m.title,
        text: "Reunião com presença aberta — registre a sua com o código falado no encontro.",
        cta: { label: "Fazer check-in", tab: "reunioes" },
      });
    });

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

  function renderMuralAdmin(me, events) {
    var box = document.getElementById("mural-admin");
    if (!me.director) { box.innerHTML = ""; return; }

    var listHtml = events.length
      ? events.map(function (e) {
          var photosHtml = (e.photos || []).map(function (p) {
            return '<span class="ph"><img src="' + esc(p.url) + '" alt=""><button type="button" title="Remover foto" data-delphoto="' + esc(p.id) + '">×</button></span>';
          }).join("");
          return (
            '<div class="event-admin-row" data-event="' + esc(e.id) + '">' +
              '<div class="event-admin-head">' +
                '<span class="mural-date num">' + fmtDateBR(e.date) + "</span>" +
                '<span class="etitle">' + esc(e.title) + "</span>" +
                '<button type="button" class="btn-reject" data-addphoto>+ Foto</button>' +
                '<button type="button" class="del-btn" title="Remover aviso" data-delevent>×</button>' +
              "</div>" +
              (photosHtml ? '<div class="event-photo-strip">' + photosHtml + "</div>" : "") +
            "</div>"
          );
        }).join("")
      : '<p class="empty-state">Nenhum aviso publicado ainda.</p>';

    box.innerHTML =
      '<div class="card">' +
        '<p class="section-label">Mural (diretoria)</p>' +
        '<div class="meeting-new">' +
          '<input type="text" id="new-event-title" placeholder="Título do aviso" maxlength="100">' +
          '<input type="date" id="new-event-date">' +
          '<button type="button" class="btn-primary" id="new-event-btn">Publicar</button>' +
        "</div>" +
        '<div class="meeting-new" style="margin-top:8px;">' +
          '<input type="text" id="new-event-text" placeholder="Texto do aviso (opcional)" maxlength="600" style="flex:1 1 100%;">' +
        "</div>" +
        '<div style="margin-top:14px;">' + listHtml + "</div>" +
      "</div>";

    document.getElementById("new-event-btn").addEventListener("click", function () {
      var title = document.getElementById("new-event-title").value.trim();
      if (!title) return window.alert("Dê um título ao aviso.");
      api("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: title,
          date: document.getElementById("new-event-date").value,
          text: document.getElementById("new-event-text").value,
        }),
      }).then(loadMural);
    });

    box.querySelectorAll(".event-admin-row").forEach(function (row) {
      var eventId = row.dataset.event;
      row.querySelector("[data-delevent]").addEventListener("click", function () {
        if (!window.confirm("Remover este aviso do mural?")) return;
        api("/api/events/" + eventId, { method: "DELETE" }).then(loadMural);
      });
      row.querySelectorAll("[data-delphoto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          api("/api/events/" + eventId + "/photos/" + btn.dataset.delphoto, { method: "DELETE" }).then(loadMural);
        });
      });
      var addBtn = row.querySelector("[data-addphoto]");
      addBtn.addEventListener("click", function () {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.addEventListener("change", function () {
          var file = input.files[0];
          if (!file) return;
          addBtn.disabled = true;
          addBtn.textContent = "Enviando...";
          normalizePhoto(file, 1600).then(function (blob) {
            return fetch("/api/events/" + eventId + "/photos", {
              method: "POST",
              headers: { "Content-Type": blob.type || "application/octet-stream" },
              body: blob,
            });
          }).then(function (r) {
            return r.json().then(function (data) {
              if (!r.ok) throw new Error(data.message || "Falha no envio da foto.");
            });
          }).then(loadMural).catch(function (err) {
            window.alert(err.message || "Não deu pra enviar a foto.");
            loadMural();
          });
        });
        input.click();
      });
    });
  }

  function loadMural() {
    Promise.all([meReady, api("/api/events"), api("/api/lessons"), api("/api/meetings")]).then(function (r) {
      renderMural(r[1].events, r[2].lessons, r[3].meetings);
      renderMuralAdmin(r[0], r[1].events);
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
          '<div class="ic-sub">19–24 de julho de 2026 · 12 empresas · acervo, selos, roteiro e despesas</div>' +
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

  // ---- Reuniões da liga (presença por código e QR) ----
  var meetingExpanded = null;

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

  function meetingRowHtml(m, me) {
    var badge = m.open
      ? '<span class="badge ok">aberta</span>'
      : '<span class="badge internal">encerrada</span>';
    var mine = m.present ? ' · <strong style="color:var(--good,#1B7A3D);">você esteve ✓</strong>' : "";
    var manageBtn = me.director
      ? '<button type="button" class="btn-reject" data-manage="' + esc(m.id) + '">' + (meetingExpanded === m.id ? "Fechar" : "Gerenciar") + "</button>"
      : "";
    var detail = "";
    if (me.director && meetingExpanded === m.id) {
      detail = '<div class="meeting-manage" data-detail="' + esc(m.id) + '"><p class="empty-state">Carregando...</p></div>';
    }
    return (
      '<div class="meeting-row" data-id="' + esc(m.id) + '">' +
        '<div class="meeting-head">' +
          '<span class="mdate num">' + fmtDateBR(m.date) + "</span>" +
          '<span class="mtitle">' + esc(m.title) + "</span>" +
          badge +
          '<span class="mcount">' + m.membersPresent + " membros · " + m.visitorsPresent + " visitantes" + mine + "</span>" +
          manageBtn +
        "</div>" +
        detail +
      "</div>"
    );
  }

  function meetingDetailHtml(m, members) {
    var codesHtml =
      '<p class="section-label">Códigos de presença (todos valem)</p>' +
      '<div class="code-chips">' +
        m.codes.map(function (c) { return '<span class="code-chip">' + esc(c) + "</span>"; }).join("") +
        '<button type="button" class="btn-reject" data-newcode>+ Gerar outro</button>' +
      "</div>";

    var publicUrl = window.location.origin + "/presenca.html?t=" + m.qrToken;
    var qrHtml =
      '<div class="meeting-actions">' +
        '<button type="button" class="btn-primary btn-small" data-showqr>QR de visitantes</button>' +
        '<button type="button" class="btn-reject" data-copylink>Copiar link público</button>' +
        '<button type="button" class="btn-reject" data-toggleopen>' + (m.open ? "Encerrar reunião" : "Reabrir reunião") + "</button>" +
      "</div>" +
      '<div class="qr-box" data-qrbox style="display:none;">' +
        '<img src="/api/meetings/' + esc(m.id) + '/qr" alt="QR code de presença">' +
        '<div class="qr-link">' + esc(publicUrl) + "</div>" +
      "</div>";

    var present = {};
    m.memberAttendance.forEach(function (a) { present[a.order] = true; });
    var gridHtml =
      '<p class="section-label" style="margin-top:12px;">Presença dos membros</p>' +
      '<div class="attendance-toggle-grid">' +
        (members || [])
          .map(function (mem) {
            return (
              "<label><input type=\"checkbox\" data-att-order=\"" + mem.order + "\"" + (present[mem.order] ? " checked" : "") + ">" +
                esc(mem.name) +
              "</label>"
            );
          })
          .join("") +
      "</div>";

    var visitorsHtml =
      '<p class="section-label" style="margin-top:12px;">Visitantes desta reunião</p>' +
      (m.visitors && m.visitors.length
        ? m.visitors
            .map(function (v) {
              var contact = [v.email, v.phone].filter(Boolean).join(" · ");
              return (
                '<div class="visitor-row">' +
                  "<span><strong>" + esc(v.name) + "</strong>" + (contact ? ' <span style="color:var(--graphite-soft);">' + esc(contact) + "</span>" : "") + "</span>" +
                  "<span>" + v.visits + "ª presença" + (v.inviteReady ? ' <span class="invite-flag">convidar p/ membro</span>' : "") + "</span>" +
                "</div>"
              );
            })
            .join("")
        : '<p class="empty-state">Nenhum visitante registrado.</p>');

    return codesHtml + qrHtml + gridHtml + visitorsHtml;
  }

  function renderMeetings(me, data, members) {
    var content = document.getElementById("meetings-content");

    var checkinHtml =
      '<div class="card">' +
        '<p class="section-label">Registrar minha presença</p>' +
        '<div class="checkin-row">' +
          '<input type="text" id="checkin-code" maxlength="10" placeholder="CÓDIGO" aria-label="Código de presença" autocomplete="off">' +
          '<button type="button" class="btn-primary" id="checkin-btn">Confirmar</button>' +
        "</div>" +
        '<p class="hint" style="margin-top:8px; font-size:11.5px; color:var(--graphite-soft);">O código é anunciado pelos diretores durante a reunião.</p>' +
        '<div id="checkin-feedback"></div>' +
      "</div>";

    var createHtml = me.director
      ? '<div class="card">' +
          '<p class="section-label">Nova reunião (diretoria)</p>' +
          '<div class="meeting-new">' +
            '<input type="text" id="new-meeting-title" placeholder="Título (ex.: Reunião geral)" maxlength="80">' +
            '<input type="date" id="new-meeting-date">' +
            '<button type="button" class="btn-primary" id="new-meeting-btn">Criar</button>' +
          "</div>" +
        "</div>"
      : "";

    var inviteHtml = "";
    if (me.director && data.inviteReady && data.inviteReady.length) {
      inviteHtml =
        '<div class="card">' +
          '<p class="section-label" style="color:var(--red);">Visitantes com 2+ presenças — convidar para virar membro</p>' +
          data.inviteReady
            .map(function (v) {
              var contact = [v.email, v.phone].filter(Boolean).join(" · ");
              return (
                '<div class="visitor-row">' +
                  "<span><strong>" + esc(v.name) + "</strong>" + (contact ? ' <span style="color:var(--graphite-soft);">' + esc(contact) + "</span>" : "") + " · " + v.visits + " reuniões</span>" +
                  '<button type="button" class="btn-reject" data-invite="' + esc(v.name) + '">Copiar convite</button>' +
                "</div>"
              );
            })
            .join("") +
        "</div>";
    }

    var listHtml =
      '<div class="card">' +
        '<p class="section-label">Reuniões</p>' +
        (data.meetings.length
          ? data.meetings.map(function (m) { return meetingRowHtml(m, me); }).join("")
          : '<p class="empty-state">Nenhuma reunião registrada ainda.</p>') +
      "</div>";

    content.innerHTML = checkinHtml + createHtml + inviteHtml + listHtml;

    // Check-in do membro
    var checkinBtn = document.getElementById("checkin-btn");
    var checkinInput = document.getElementById("checkin-code");
    function doCheckin() {
      var code = checkinInput.value.trim().toUpperCase();
      if (!code) return;
      checkinBtn.disabled = true;
      fetch("/api/meetings/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok) {
            loadMeetings();
          } else {
            checkinBtn.disabled = false;
            document.getElementById("checkin-feedback").innerHTML =
              '<div class="checkin-ok" style="background:#FEEBEB; color:#991B1B;">' + esc(res.data.message || "Código inválido.") + "</div>";
          }
        });
    }
    checkinBtn.addEventListener("click", doCheckin);
    checkinInput.addEventListener("keydown", function (e) { if (e.key === "Enter") doCheckin(); });

    // Criação de reunião (diretoria)
    if (me.director) {
      document.getElementById("new-meeting-btn").addEventListener("click", function () {
        api("/api/meetings", {
          method: "POST",
          body: JSON.stringify({
            title: document.getElementById("new-meeting-title").value,
            date: document.getElementById("new-meeting-date").value,
          }),
        }).then(function (res) {
          if (res && res.meeting) meetingExpanded = res.meeting.id;
          loadMeetings();
        });
      });

      content.querySelectorAll("[data-invite]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          copyText(
            "Oi, " + btn.dataset.invite.split(" ")[0] + "! Você já participou de 2+ reuniões da LEPV e queremos você como membro. " +
              "Peça seu acesso em " + window.location.origin + "/login.html (botão \"Solicitar acesso\") que a gente aprova!",
            btn
          );
        });
      });

      content.querySelectorAll("[data-manage]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          meetingExpanded = meetingExpanded === btn.dataset.manage ? null : btn.dataset.manage;
          loadMeetings();
        });
      });

      // Detalhe expandido
      var detailBox = content.querySelector("[data-detail]");
      if (detailBox) {
        var meeting = data.meetings.find(function (m) { return m.id === meetingExpanded; });
        if (meeting) {
          detailBox.innerHTML = meetingDetailHtml(meeting, members);
          detailBox.querySelector("[data-newcode]").addEventListener("click", function () {
            api("/api/meetings/" + meeting.id + "/codes", { method: "POST" }).then(loadMeetings);
          });
          detailBox.querySelector("[data-showqr]").addEventListener("click", function () {
            var box = detailBox.querySelector("[data-qrbox]");
            box.style.display = box.style.display === "none" ? "block" : "none";
          });
          detailBox.querySelector("[data-copylink]").addEventListener("click", function (e) {
            copyText(window.location.origin + "/presenca.html?t=" + meeting.qrToken, e.currentTarget);
          });
          detailBox.querySelector("[data-toggleopen]").addEventListener("click", function () {
            api("/api/meetings/" + meeting.id + "/open", { method: "POST", body: JSON.stringify({ open: !meeting.open }) }).then(loadMeetings);
          });
          detailBox.querySelectorAll("[data-att-order]").forEach(function (cb) {
            cb.addEventListener("change", function () {
              var desired = cb.checked;
              cb.disabled = true;
              api("/api/meetings/" + meeting.id + "/member-attendance", {
                method: "POST",
                body: JSON.stringify({ order: parseInt(cb.dataset.attOrder, 10), present: desired }),
              })
                .then(function (r) {
                  cb.disabled = false;
                  // Se o servidor não confirmou, o check volta: presença
                  // marcada na tela e ausente no servidor é pior que erro.
                  if (!r || !r.ok) throw new Error("recusado");
                })
                .catch(function () {
                  cb.disabled = false;
                  cb.checked = !desired;
                  window.alert("Não deu pra salvar a presença. Tente de novo.");
                });
            });
          });
        }
      }
    }
  }

  function loadMeetings() {
    Promise.all([meReady, api("/api/meetings")]).then(function (r) {
      var me = r[0], data = r[1];
      if (me.director) {
        api("/api/members").then(function (members) { renderMeetings(me, data, members); });
      } else {
        renderMeetings(me, data, null);
      }
    });
  }

  // ---- Aulas da liga (aba Materiais) ----

  function lessonMaterialsHtml(lesson, me) {
    var list = lesson.materials || [];
    if (!list.length) {
      return '<p class="empty-state">Nenhum material nesta aula ainda.</p>';
    }
    return (
      '<ul class="materials-list">' +
        list.map(function (m) {
          var isPdf = m.type === "pdf";
          var iconHtml = isPdf
            ? '<span class="material-icon">PDF</span>'
            : '<span class="material-icon link">LINK</span>';
          var metaBits = [isPdf ? "PDF · " + formatBytes(m.size) : "Link externo"];
          if (m.addedBy) metaBits.push("por " + m.addedBy);
          var actionsHtml = isPdf
            ? '<a target="_blank" rel="noopener" href="/api/lessons/materials/' + m.id + '/file">Abrir</a>' +
              '<a href="/api/lessons/materials/' + m.id + '/file?dl=1">Baixar</a>'
            : '<a target="_blank" rel="noopener" href="' + esc(m.url) + '">Abrir</a>';
          return (
            '<li data-id="' + esc(m.id) + '">' +
              iconHtml +
              '<div class="material-main"><div class="material-title">' + esc(m.title) + '</div><div class="material-meta">' + esc(metaBits.join(" · ")) + "</div></div>" +
              '<div class="material-actions">' + actionsHtml +
                (me.director ? '<button class="del-btn" title="Remover material">×</button>' : "") +
              "</div>" +
            "</li>"
          );
        }).join("") +
      "</ul>"
    );
  }

  // Barra de inscrições da aula: membro se inscreve com 1 clique; a diretoria
  // abre/fecha, distribui o link público (QR) e vê a lista nominal.
  function lessonSignupBarHtml(l, me) {
    var badge = l.signupsOpen
      ? '<span class="signup-badge open">inscrições abertas</span>'
      : (l.signupCount ? '<span class="signup-badge done">inscrições encerradas</span>' : "");
    var countHtml = '<span class="signup-count num">' + l.signupCount + " inscrito" + (l.signupCount === 1 ? "" : "s") + "</span>";
    var meBtn = l.signedUp
      ? '<button type="button" class="btn-primary btn-small" disabled>Inscrito ✓</button>'
      : (l.signupsOpen ? '<button type="button" class="btn-primary btn-small" data-signup>Inscrever-se</button>' : "");

    if (!me.director) {
      if (!badge && !meBtn) return "";
      return '<div class="lesson-signup-bar">' + badge + meBtn + (l.signupsOpen || l.signupCount ? countHtml : "") + "</div>";
    }

    var controls = '<button type="button" class="btn-reject" data-toggle-signups>' + (l.signupsOpen ? "Encerrar inscrições" : "Abrir inscrições") + "</button>";
    var qrBox = "";
    if (l.signupsOpen && l.signupToken) {
      controls +=
        '<button type="button" class="btn-reject" data-signup-qr>QR de inscrição</button>' +
        '<button type="button" class="btn-reject" data-copy-signup>Copiar link público</button>';
      qrBox =
        '<div class="qr-box" data-signup-qrbox style="display:none;">' +
          '<img src="/api/lessons/' + esc(l.id) + '/signup-qr" alt="QR code de inscrição">' +
          '<div class="qr-link">' + esc(window.location.origin + "/inscricao.html?t=" + l.signupToken) + "</div>" +
        "</div>";
    }
    var listHtml = "";
    if (l.signups && l.signups.length) {
      listHtml =
        '<div style="margin-top:6px;">' +
          '<p class="section-label">Inscritos · ' + l.signups.length + "</p>" +
          l.signups.map(function (s) {
            var contact = [s.email, s.phone].filter(Boolean).join(" · ");
            return (
              '<div class="visitor-row">' +
                "<span><strong>" + esc(s.name) + "</strong>" + (contact ? ' <span style="color:var(--graphite-soft);">' + esc(contact) + "</span>" : "") + "</span>" +
                '<span class="signup-badge ' + (s.type === "member" ? "open" : "done") + '">' + (s.type === "member" ? "membro" : "visitante") + "</span>" +
              "</div>"
            );
          }).join("") +
        "</div>";
    }
    return '<div class="lesson-signup-bar">' + badge + meBtn + controls + countHtml + "</div>" + qrBox + listHtml;
  }

  function renderLessons(me, lessons) {
    var content = document.getElementById("lessons-content");

    var createHtml = me.director
      ? '<div class="card">' +
          '<p class="section-label">Nova aula (diretoria)</p>' +
          '<div class="meeting-new">' +
            '<input type="text" id="new-lesson-title" placeholder="Título (ex.: Aula 03 — Precificação)" maxlength="100">' +
            '<input type="date" id="new-lesson-date">' +
            '<button type="button" class="btn-primary" id="new-lesson-btn">Criar aula</button>' +
          "</div>" +
          '<div class="meeting-new" style="margin-top:8px;">' +
            '<input type="text" id="new-lesson-desc" placeholder="Descrição (opcional)" maxlength="300" style="flex:1 1 100%;">' +
          "</div>" +
        "</div>"
      : "";

    var listHtml = lessons.length
      ? lessons.map(function (l) {
          var adminHtml = me.director
            ? '<div class="material-admin">' +
                '<input type="text" class="mat-title" placeholder="Título do material" aria-label="Título do material" maxlength="120">' +
                '<div class="row2">' +
                  '<input type="file" class="mat-file" accept="application/pdf" aria-label="Arquivo PDF">' +
                  '<button class="btn-primary mat-upload">Enviar PDF</button>' +
                "</div>" +
                '<div class="row2">' +
                  '<input type="url" class="mat-url" placeholder="ou cole um link (vídeo, slides...)" aria-label="URL do material">' +
                  '<button class="btn-primary mat-add-link">Adicionar link</button>' +
                "</div>" +
              "</div>"
            : "";
          return (
            '<div class="card lesson-card" data-lesson="' + esc(l.id) + '">' +
              '<div class="lesson-head">' +
                '<span class="ldate num">' + fmtDateBR(l.date) + "</span>" +
                '<span class="ltitle">' + esc(l.title) + "</span>" +
                (me.director ? '<button class="del-lesson" title="Remover aula">×</button>' : "") +
              "</div>" +
              (l.description ? '<p class="lesson-desc">' + esc(l.description) + "</p>" : "") +
              '<div class="lesson-materials" style="margin-top:10px;">' + lessonMaterialsHtml(l, me) + "</div>" +
              lessonSignupBarHtml(l, me) +
              adminHtml +
            "</div>"
          );
        }).join("")
      : '<div class="card"><p class="empty-state">Nenhuma aula cadastrada ainda.' + (me.director ? " Crie a primeira acima." : "") + "</p></div>";

    content.innerHTML = createHtml + listHtml;

    // Inscrição do próprio membro — vale para todo mundo, diretor ou não.
    content.querySelectorAll(".lesson-card [data-signup]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.disabled = true;
        btn.textContent = "Inscrevendo...";
        api("/api/lessons/" + btn.closest(".lesson-card").dataset.lesson + "/signup", { method: "POST" })
          .then(function () { loadLessons(); })
          .catch(function () { loadLessons(); });
      });
    });

    if (!me.director) return;

    document.getElementById("new-lesson-btn").addEventListener("click", function () {
      var title = document.getElementById("new-lesson-title").value.trim();
      if (!title) return window.alert("Dê um título à aula.");
      api("/api/lessons", {
        method: "POST",
        body: JSON.stringify({
          title: title,
          date: document.getElementById("new-lesson-date").value,
          description: document.getElementById("new-lesson-desc").value,
        }),
      }).then(function () { loadLessons(); });
    });

    content.querySelectorAll(".lesson-card").forEach(function (cardEl) {
      var lessonId = cardEl.dataset.lesson;

      var toggleSignups = cardEl.querySelector("[data-toggle-signups]");
      if (toggleSignups) {
        toggleSignups.addEventListener("click", function () {
          var opening = toggleSignups.textContent.indexOf("Abrir") === 0;
          if (!opening && !window.confirm("Encerrar as inscrições desta aula? O link público para de aceitar novas.")) return;
          api("/api/lessons/" + lessonId + "/signups-open", {
            method: "POST",
            body: JSON.stringify({ open: opening }),
          }).then(function () { loadLessons(); });
        });
      }
      var qrBtn = cardEl.querySelector("[data-signup-qr]");
      if (qrBtn) {
        qrBtn.addEventListener("click", function () {
          var box = cardEl.querySelector("[data-signup-qrbox]");
          if (box) box.style.display = box.style.display === "none" ? "" : "none";
        });
      }
      var copyBtn = cardEl.querySelector("[data-copy-signup]");
      if (copyBtn) {
        copyBtn.addEventListener("click", function (e) {
          var link = cardEl.querySelector("[data-signup-qrbox] .qr-link");
          if (link) copyText(link.textContent, e.currentTarget);
        });
      }

      var delLesson = cardEl.querySelector(".del-lesson");
      if (delLesson) {
        delLesson.addEventListener("click", function () {
          if (!window.confirm("Remover esta aula e todos os materiais dela?")) return;
          api("/api/lessons/" + lessonId, { method: "DELETE" }).then(function () { loadLessons(); });
        });
      }

      cardEl.querySelectorAll(".materials-list .del-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!window.confirm("Remover este material para todo mundo?")) return;
          var li = btn.closest("li");
          api("/api/lessons/" + lessonId + "/materials/" + li.dataset.id, { method: "DELETE" }).then(function () { loadLessons(); });
        });
      });

      var uploadBtn = cardEl.querySelector(".mat-upload");
      uploadBtn.addEventListener("click", function () {
        var title = cardEl.querySelector(".mat-title").value.trim();
        var file = cardEl.querySelector(".mat-file").files[0];
        if (!title) return window.alert("Dê um título ao material.");
        if (!file) return window.alert("Escolha um arquivo PDF.");
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Enviando...";
        fetch("/api/lessons/" + lessonId + "/materials/upload?title=" + encodeURIComponent(title), {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        })
          .then(function (r) { if (!r.ok) throw new Error("upload failed"); return r.json(); })
          .then(function () { loadLessons(); })
          .catch(function () {
            window.alert("Falha no envio — confira se o arquivo é um PDF de até 25 MB.");
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Enviar PDF";
          });
      });

      cardEl.querySelector(".mat-add-link").addEventListener("click", function () {
        var title = cardEl.querySelector(".mat-title").value.trim();
        var url = cardEl.querySelector(".mat-url").value.trim();
        if (!title) return window.alert("Dê um título ao material.");
        if (!/^https?:\/\//i.test(url)) return window.alert("Cole um link começando com http(s)://");
        api("/api/lessons/" + lessonId + "/materials/link", {
          method: "POST",
          body: JSON.stringify({ title: title, url: url }),
        }).then(function () { loadLessons(); });
      });
    });
  }

  function loadLessons() {
    Promise.all([meReady, api("/api/lessons")]).then(function (r) {
      renderLessons(r[0], r[1].lessons);
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

  // ---- Despesas (divisão estilo Splitwise, tudo em centavos) ----
  var expenseMembers = null;
  var expensePix = null;

  function fmtBRL(cents) {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  // Nome de membro pode vir de cadastro público, então já sai escapado — o
  // retorno destas funções entra direto em innerHTML.
  function firstName(order) {
    var m = expenseMembers.find(function (x) { return x.order === order; });
    return m ? esc(m.name.split(" ")[0]) : "?";
  }
  // Parte de um membro numa despesa — espelha splitEqual do servidor
  // (base + resto distribuído por ordem crescente, soma sempre = total).
  function shareOf(amountCents, participants, order) {
    var sorted = participants.slice().sort(function (a, b) { return a - b; });
    var idx = sorted.indexOf(order);
    if (idx < 0) return 0;
    var base = Math.floor(amountCents / sorted.length);
    var remainder = amountCents % sorted.length;
    return base + (idx < remainder ? 1 : 0);
  }
  // Saldo líquido entre você e cada pessoa (não o acerto consolidado de mínimo
  // de Pix). net[P] > 0: P te deve; < 0: você deve P. A soma = seu saldo global.
  function pairwiseNet(expenses, myOrder) {
    var net = {};
    function add(order, cents) {
      if (order === myOrder) return;
      net[order] = (net[order] || 0) + cents;
    }
    expenses.forEach(function (e) {
      if (e.type === "settlement") {
        if (e.from === myOrder) add(e.to, e.amountCents);
        else if (e.to === myOrder) add(e.from, -e.amountCents);
        return;
      }
      if (e.paidBy === myOrder) {
        e.participants.forEach(function (p) { add(p, shareOf(e.amountCents, e.participants, p)); });
      } else if (e.participants.indexOf(myOrder) >= 0) {
        add(e.paidBy, -shareOf(e.amountCents, e.participants, myOrder));
      }
    });
    return net;
  }

  function fullName(order) {
    var m = expenseMembers.find(function (x) { return x.order === order; });
    return m ? m.name : "?";
  }
  function pixKey(order) {
    var p = (expensePix || []).find(function (x) { return x.order === order; });
    return p ? String(p.pix) : "";
  }
  // Texto do acerto final pronto pra colar no grupo — usa o plano de mínimo de
  // Pix (data.settle) com a chave de quem recebe.
  function buildSettlementExport(settle) {
    var lines = ["LEPV · Missão SP — Acerto final", ""];
    if (!settle || !settle.length) {
      lines.push("Contas zeradas — ninguém deve nada. 🎉");
      return lines.join("\n");
    }
    lines.push("Plano de pagamento (menor número de Pix):", "");
    settle.forEach(function (p) {
      lines.push("• " + fullName(p.from) + " paga " + fmtBRL(p.amountCents) + " para " + fullName(p.to));
      var pix = pixKey(p.to);
      lines.push(pix ? "   Pix: " + pix : "   (Pix não cadastrado — peça a chave)");
    });
    lines.push("", "Feitos esses Pix, as contas da viagem zeram.");
    return lines.join("\n");
  }
  function copyToClipboard(text, alertOnDone) {
    function done() { if (alertOnDone) window.alert("Copiado!"); }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) { /* silencioso */ }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function loadExpenses() {
    Promise.all([
      meReady,
      api("/api/expenses"),
      expenseMembers ? Promise.resolve(expenseMembers) : api("/api/members"),
      // As chaves Pix (CPF de vários) vêm de rota própria da imersão, e não do
      // roster da liga — ver o comentário de memberCardView no server.
      expensePix ? Promise.resolve(expensePix) : api("/api/expenses/pix"),
    ]).then(function (results) {
      var me = results[0], data = results[1];
      expenseMembers = results[2];
      expensePix = results[3];
      var container = document.getElementById("expenses-content");
      var myBalance = data.balances[String(me.order)] || 0;
      var closed = data.closed === true;

      function pixOf(order) {
        return pixKey(order);
      }

      var heroClass = myBalance < 0 ? "owe" : myBalance > 0 ? "receive" : "even";
      var heroValue = myBalance < 0 ? "Você deve " + fmtBRL(-myBalance) : myBalance > 0 ? "Te devem " + fmtBRL(myBalance) : "Contas em dia";
      var heroHtml =
        '<div class="card"><div class="balance-hero">' +
          '<span class="bh-label">Seu saldo na viagem</span>' +
          '<span class="bh-value num ' + heroClass + '">' + heroValue + "</span>" +
          '<span class="bh-sub">' + (function (n) {
            return n === 0 ? "Nenhuma despesa registrada ainda."
              : n === 1 ? "Calculado sobre 1 despesa registrada pelo grupo."
              : "Calculado sobre " + n + " despesas registradas pelo grupo.";
          })(data.expenses.filter(function (e) { return e.type !== "settlement"; }).length) + "</span>" +
        "</div></div>";

      var closedBanner = closed
        ? '<div class="card closed-banner"><span class="cb-badge">Contas fechadas</span>' +
            '<p class="note">O acerto foi congelado. Ninguém consegue marcar novos Pix.' +
            (me.admin ? " Reabra abaixo se precisar ajustar." : " Fale com o Marcell se algo estiver errado.") + "</p></div>"
        : "";

      // Despesas encerradas: não há mais cadastro de novas despesas. O histórico
      // fica intacto e cada um só registra os Pix que fizer ("Paguei via Pix",
      // no saldo por pessoa abaixo).
      var infoHtml = closed ? "" :
        '<div class="card"><p class="note" style="margin:0;">As despesas da viagem foram encerradas — não dá mais para adicionar novas. Confira seu saldo e toque em <strong>“Paguei via Pix”</strong> a cada acerto que você fizer.</p></div>';

      var adminHtml = "";
      if (me.admin) {
        var brochesBlock = closed ? "" :
          '<div class="exp-admin">' +
            '<p class="note">Todos receberam o bóton? Registra a dívida de R$ 11,00 para cada membro que ainda não tem. Idempotente: não duplica quem já respondeu a enquete.</p>' +
            '<button class="btn-primary reg-broches">Registrar broche de todos</button>' +
          "</div>";
        adminHtml =
          (brochesBlock ? '<div class="card"><p class="section-label">Admin · broches</p>' + brochesBlock + "</div>" : "") +
          '<div class="card"><p class="section-label">Admin · fechamento</p>' +
            '<div class="exp-admin">' +
              '<p class="note">' +
                (closed
                  ? "As contas estão <strong>fechadas</strong> (congeladas). Exporte o acerto para o grupo ou reabra para liberar os Pix."
                  : "Exporte o acerto final para compartilhar no grupo. Feche as contas para travar os Pix depois que todo mundo tiver acertado.") +
              "</p>" +
              '<div class="exp-admin-actions">' +
                '<button class="btn-primary exp-export">Exportar acerto final</button>' +
                (closed
                  ? '<button class="btn-secondary exp-reopen">Reabrir contas</button>'
                  : '<button class="btn-secondary exp-close">Fechar contas</button>') +
              "</div>" +
              '<div class="export-panel" hidden>' +
                '<textarea class="export-text" readonly rows="10"></textarea>' +
                '<div class="exp-admin-actions">' +
                  '<button class="btn-primary export-copy">Copiar</button>' +
                  '<button class="btn-secondary export-share">Compartilhar</button>' +
                "</div>" +
              "</div>" +
            "</div>" +
          "</div>";
      }

      // Saldo por pessoa: líquido real com cada um (todo mundo que tem conta
      // com você aparece). "Você deve" (net < 0) e "Te devem" (net > 0).
      var net = pairwiseNet(data.expenses, me.order);
      var iOwe = [], oweMe = [];
      Object.keys(net).forEach(function (k) {
        var order = parseInt(k, 10), cents = net[k];
        if (cents < 0) iOwe.push({ order: order, cents: -cents });
        else if (cents > 0) oweMe.push({ order: order, cents: cents });
      });
      var byCents = function (a, b) { return b.cents - a.cents; };
      iOwe.sort(byCents);
      oweMe.sort(byCents);
      var settleHtml = "";
      if (iOwe.length || oweMe.length) {
        var groups = "";
        if (iOwe.length) {
          var debtRows = iOwe
            .map(function (r) {
              var pix = pixOf(r.order);
              var pixHtml = pix
                ? '<div class="settle-pix"><span class="pix-label">Pix</span>' +
                    '<span class="pix-key">' + esc(pix) + "</span>" +
                    '<button class="copy-pix" data-pix="' + esc(pix) + '" title="Copiar Pix">Copiar</button></div>'
                : "";
              var actionHtml = closed
                ? ""
                : '<button class="mark-paid" data-to="' + r.order + '" data-cents="' + r.cents + '">Paguei via Pix</button>';
              return (
                '<div class="settle-row">' +
                  '<div class="settle-row-top">' +
                    '<span class="sp">Você <span class="arrow">→</span> ' + firstName(r.order) +
                      ' <span class="sv num">' + fmtBRL(r.cents) + "</span></span>" +
                    actionHtml +
                  "</div>" +
                  pixHtml +
                "</div>"
              );
            })
            .join("");
          groups += '<p class="settle-group-label owe">Você deve</p><div class="settle-list">' + debtRows + "</div>";
        }
        if (oweMe.length) {
          var creditRows = oweMe
            .map(function (r) {
              return (
                '<div class="settle-row">' +
                  '<span class="sp">' + firstName(r.order) + ' <span class="arrow">→</span> Você' +
                    ' <span class="sv num">' + fmtBRL(r.cents) + "</span></span>" +
                "</div>"
              );
            })
            .join("");
          groups += '<p class="settle-group-label receive">Te devem</p><div class="settle-list">' + creditRows + "</div>";
        }
        settleHtml =
          '<div class="card"><p class="section-label">Saldo por pessoa</p>' +
            groups +
          "</div>";
      }

      var feedHtml;
      if (!data.expenses.length) {
        feedHtml = '<div class="card"><p class="section-label">Despesas</p><p class="empty-state">Nenhuma despesa registrada.</p></div>';
      } else {
        var items = data.expenses
          .map(function (e) {
            var canDelete = !closed && (e.createdBy === me.order || me.admin);
            var delHtml = canDelete ? '<button class="del-btn" data-id="' + e.id + '" title="Remover">×</button>' : "";
            if (e.type === "settlement") {
              return (
                '<div class="expense-item settlement">' +
                  '<div class="ei-main"><div class="ei-desc">' + firstName(e.from) + " pagou " + firstName(e.to) + '</div><div class="ei-meta">acerto via Pix</div></div>' +
                  '<span class="ei-value num">' + fmtBRL(e.amountCents) + "</span>" + delHtml +
                "</div>"
              );
            }
            var inSplit = e.participants.indexOf(me.order) >= 0;
            var meta = "pago por " + firstName(e.paidBy) + " · dividido entre " + e.participants.length;
            if (e.createdBy !== e.paidBy) meta += " · lançado por " + firstName(e.createdBy);
            var shareHtml = inSplit
              ? '<div class="ei-share">sua parte <span class="num">' + fmtBRL(shareOf(e.amountCents, e.participants, me.order)) + "</span></div>"
              : '<div class="ei-share muted">você não entrou no rateio</div>';
            return (
              '<div class="expense-item">' +
                '<div class="ei-main"><div class="ei-desc">' + esc(e.description) + "</div>" +
                  '<div class="ei-meta">' + meta + "</div>" + shareHtml + "</div>" +
                '<span class="ei-value num">' + fmtBRL(e.amountCents) + "</span>" + delHtml +
              "</div>"
            );
          })
          .join("");
        feedHtml = '<div class="card"><p class="section-label">Despesas</p><div class="expense-feed">' + items + "</div></div>";
      }

      container.innerHTML = heroHtml + closedBanner + infoHtml + adminHtml + settleHtml + feedHtml;

      var regBtn = container.querySelector(".reg-broches");
      if (regBtn) {
        regBtn.addEventListener("click", function () {
          if (!window.confirm("Registrar a dívida de R$ 11,00 do bóton para todos os membros que ainda não têm?")) return;
          regBtn.disabled = true;
          api("/api/pin-poll/register-all", { method: "POST" }).then(function (res) {
            var n = res && res.created ? res.created.length : 0;
            window.alert(n === 0 ? "Todo mundo já tinha a dívida registrada — nada a fazer." : n + " dívida(s) de bóton registrada(s).");
            loadExpenses();
          });
        });
      }

      // Fechar / reabrir contas (admin)
      var closeBtn = container.querySelector(".exp-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          if (!window.confirm("Fechar as contas? Ninguém vai conseguir marcar novos Pix até você reabrir.")) return;
          closeBtn.disabled = true;
          api("/api/expenses/close", { method: "POST", body: JSON.stringify({ closed: true }) }).then(loadExpenses);
        });
      }
      var reopenBtn = container.querySelector(".exp-reopen");
      if (reopenBtn) {
        reopenBtn.addEventListener("click", function () {
          reopenBtn.disabled = true;
          api("/api/expenses/close", { method: "POST", body: JSON.stringify({ closed: false }) }).then(loadExpenses);
        });
      }

      // Exportar acerto final (admin): texto pronto pra colar no grupo, com Pix.
      var exportBtn = container.querySelector(".exp-export");
      if (exportBtn) {
        exportBtn.addEventListener("click", function () {
          var text = buildSettlementExport(data.settle);
          var panel = container.querySelector(".export-panel");
          var ta = container.querySelector(".export-text");
          ta.value = text;
          panel.hidden = false;
          ta.rows = Math.min(20, text.split("\n").length + 1);
          copyToClipboard(text);
          ta.focus();
          ta.setSelectionRange(0, 0);
        });
        container.querySelector(".export-copy").addEventListener("click", function () {
          copyToClipboard(container.querySelector(".export-text").value, true);
        });
        container.querySelector(".export-share").addEventListener("click", function () {
          var text = container.querySelector(".export-text").value;
          if (navigator.share) {
            navigator.share({ title: "LEPV · Acerto final", text: text }).catch(function () {});
          } else {
            copyToClipboard(text, true);
          }
        });
      }

      // Copiar chave Pix de uma linha de acerto
      container.querySelectorAll(".copy-pix").forEach(function (btn) {
        btn.addEventListener("click", function () {
          copyToClipboard(btn.dataset.pix, true);
          var old = btn.textContent;
          btn.textContent = "Copiado!";
          setTimeout(function () { btn.textContent = old; }, 1500);
        });
      });

      container.querySelectorAll(".mark-paid").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var to = parseInt(btn.dataset.to, 10);
          var cents = parseInt(btn.dataset.cents, 10);
          if (!window.confirm("Confirmar que você pagou " + fmtBRL(cents) + " para " + firstName(to) + "?")) return;
          api("/api/expenses/settle", { method: "POST", body: JSON.stringify({ to: to, amountCents: cents }) }).then(loadExpenses);
        });
      });

      container.querySelectorAll(".expense-item .del-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!window.confirm("Remover esta despesa para todo mundo?")) return;
          api("/api/expenses/" + btn.dataset.id, { method: "DELETE" }).then(loadExpenses);
        });
      });
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
        '<p class="pin-text">Vamos produzir um bóton físico numerado, exclusivo de quem esteve na primeira imersão da LEPV em São Paulo. O seu sai com o número <strong>' + num + "/11</strong> por <strong>R$ 11,00</strong> — aceitando, o valor entra como dívida com o Marcell na aba Despesas. Quer garantir o seu?</p>" +
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

  var loaders = {
    inicio: loadInicio,
    membros: loadMembers,
    reunioes: loadMeetings,
    materiais: loadLessons,
    legado: loadLegacy,
    resumo: loadMission,
    agenda: loadAgenda,
    empresas: loadCompanies,
    selos: loadBadges,
    despesas: loadExpenses,
    // Arquivo reúne o que era operação da viagem: trajetos, quartos e combinados.
    arquivo: function () { loadRoutes(); loadRooms(); loadChecklist(); },
  };

  // O app abre na liga (Quem somos); o acervo da imersão sai da aba Membros.
  activateTab("inicio");
})();
