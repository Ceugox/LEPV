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
    document.getElementById("who-name").textContent = me.name;
    return me;
  });
  document.getElementById("logout-btn").addEventListener("click", function () {
    api("/api/logout", { method: "POST" }).then(function () {
      window.location.href = "/login.html";
    });
  });

  // ---- Quartos (widget flutuante, visível em todas as abas) ----
  var roomFab = document.getElementById("room-fab");
  var roomPanel = document.getElementById("room-panel");
  var roomBackdrop = document.getElementById("room-backdrop");
  var roomClose = document.getElementById("room-close");

  function openRoomPanel() {
    roomPanel.classList.add("open");
    roomBackdrop.classList.add("open");
    roomFab.setAttribute("aria-expanded", "true");
  }
  function closeRoomPanel() {
    roomPanel.classList.remove("open");
    roomBackdrop.classList.remove("open");
    roomFab.setAttribute("aria-expanded", "false");
  }
  roomFab.addEventListener("click", function () {
    roomPanel.classList.contains("open") ? closeRoomPanel() : openRoomPanel();
  });
  roomClose.addEventListener("click", closeRoomPanel);
  roomBackdrop.addEventListener("click", closeRoomPanel);

  api("/api/itinerary").then(function (data) {
    var el = document.getElementById("room-list");
    if (!data.hotel.rooms || !data.hotel.rooms.length) {
      el.innerHTML = '<p class="empty-state">Sem alocação definida.</p>';
      return;
    }
    el.innerHTML = data.hotel.rooms
      .map(function (r) {
        var itemsHtml = r.members.map(function (m) { return "<li>" + m + "</li>"; }).join("");
        return '<div class="room-group"><p class="rlabel">' + r.label + '</p><ul>' + itemsHtml + "</ul></div>";
      })
      .join("");
  }).catch(function () {});

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

  var tabButtons = document.querySelectorAll("nav.tabs button");
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
    // Tudo pode mudar durante a viagem (agenda corrigida, item de checklist de
    // outro membro, presença marcada) — recarrega a aba a cada ativação. Os
    // JSONs são pequenos e os loaders preservam o dia/empresa selecionados.
    loaders[name] && loaders[name]();
  }
  tabButtons.forEach(function (b) {
    b.addEventListener("click", function () { activateTab(b.dataset.tab); });
  });

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
    if (today0 > last) return "";

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
            '<p class="section-label">Prepare-se: o que estudar antes de cada visita</p>' +
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
            '<p class="section-label">O que esperar das visitas</p>' +
            '<ul class="objectives">' + m.expectations.map(function (e) { return "<li>" + e + "</li>"; }).join("") + "</ul>" +
          "</div>"
        : "";

      var content = document.getElementById("mission-content");
      content.innerHTML = nowHtml + heroHtml + pioneerHtml + prepareHtml + expectHtml;
      content.querySelectorAll("[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () { activateTab(btn.dataset.goto); });
      });
    });
  }

  // ---- Membros ----
  function loadMembers() {
    api("/api/members").then(function (members) {
      var grid = document.getElementById("member-grid");
      grid.innerHTML = members
        .map(function (m, i) {
          var initials = m.name.trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
          var avatarHtml = m.photo
            ? '<img class="avatar photo" src="' + m.photo + '" alt="' + m.name + '">'
            : '<div class="avatar">' + initials + "</div>";

          var courseLine = [m.course, m.year].filter(Boolean).join(" · ");
          var metaHtml = courseLine ? '<div class="meta">' + courseLine + "</div>" : "";
          var interestsHtml = (m.interests && m.interests.length)
            ? '<div class="interests">' + m.interests.map(function (i) { return '<span class="interest-chip">' + i + "</span>"; }).join("") + "</div>"
            : "";

          return (
            '<div class="member-card stagger-in" style="animation-delay:' + (i * 45) + 'ms">' +
              '<div class="head">' +
                avatarHtml +
                '<div class="who"><div class="name">' + m.name + '</div><div class="order">Inscrição nº ' + m.order + "</div></div>" +
              "</div>" +
              metaHtml +
              interestsHtml +
            "</div>"
          );
        })
        .join("");
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
      renderLunch(day.lunch);
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
                (me.admin ? '<button class="del-btn" title="Remover material">×</button>' : "") +
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

      if (!list.length && !me.admin) {
        panel.innerHTML = ""; // membro sem material não precisa ver card vazio
        return;
      }

      var adminHtml = me.admin
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

      if (!me.admin) return;
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
    label: "Perguntas do grupo",
    hint: "O roteiro coletivo do Q&amp;A desta visita — todo mundo vê, cada um leva 2 ou 3 pra fazer.",
    empty: "Nenhuma pergunta ainda. Puxe a fila: adicione a primeira.",
    placeholder: "Adicionar pergunta...",
    mark: "?",
    gate: null, // qualquer membro pode postar, antes ou depois da visita
    lockedHint: "",
  };

  var LEARNINGS_PANEL = {
    elId: "learnings-panel",
    api: "/api/learnings",
    label: "Aprendizados da visita",
    hint: "O que vale levar de volta pra liga — registre enquanto está fresco.",
    empty: "Nenhum aprendizado registrado ainda.",
    placeholder: "Registrar aprendizado...",
    mark: "—",
    // Só posta quem já tem o selo desta empresa (presença marcada pelo admin).
    gate: function (companyKey) {
      return api("/api/badges").then(function (b) { return b.earned.indexOf(companyKey) !== -1; });
    },
    lockedHint: "Libera depois da visita, quando a presença for confirmada.",
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
          ? '<img class="av" src="' + m.photo + '" alt="">'
          : '<span class="av">' + initials + "</span>";
        return (
          '<label class="attendance-row">' +
            '<input type="checkbox" data-order="' + m.order + '" ' + (checked ? "checked" : "") + ">" +
            avatarHtml +
            '<span class="rn">' + m.name + "</span>" +
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
    var statusText = unlocked ? "SELO CONFIRMADO" : "A CONQUISTAR";

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
              return '<div class="pin-row"><span class="pn">' + m.name + "</span>" + status + "</div>";
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

  function fmtBRL(cents) {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function parseBRL(text) {
    var clean = String(text).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    // aceita também "48.70" digitado com ponto decimal (sem milhar)
    if (/^\d+\.\d{1,2}$/.test(String(text).trim())) clean = String(text).trim();
    var value = parseFloat(clean);
    return isNaN(value) ? null : Math.round(value * 100);
  }
  function firstName(order) {
    var m = expenseMembers.find(function (x) { return x.order === order; });
    return m ? m.name.split(" ")[0] : "?";
  }

  function loadExpenses() {
    Promise.all([meReady, api("/api/expenses"), expenseMembers ? Promise.resolve(expenseMembers) : api("/api/members")]).then(function (results) {
      var me = results[0], data = results[1];
      expenseMembers = results[2];
      var container = document.getElementById("expenses-content");
      var myBalance = data.balances[String(me.order)] || 0;

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

      var payerChips = expenseMembers
        .map(function (m) {
          return '<button type="button" class="p-chip pay' + (m.order === me.order ? " on" : "") + '" data-order="' + m.order + '">' + m.name.split(" ")[0] + "</button>";
        })
        .join("");
      var splitChips = expenseMembers
        .map(function (m) {
          return '<button type="button" class="p-chip split on" data-order="' + m.order + '">' + m.name.split(" ")[0] + "</button>";
        })
        .join("");
      var formHtml =
        '<div class="card"><p class="section-label">Adicionar despesa</p>' +
          '<div class="expense-form">' +
            '<div class="row2">' +
              '<input type="text" inputmode="decimal" class="exp-amount" placeholder="R$ 0,00" aria-label="Valor">' +
              '<input type="text" class="exp-desc" placeholder="Uber, almoço, mercado..." aria-label="Descrição" maxlength="80">' +
            "</div>" +
            '<p class="chips-label">Quem pagou</p>' +
            '<div class="payer-chips">' + payerChips + "</div>" +
            '<p class="chips-label">Dividir entre <button type="button" class="split-all" style="border:none;background:none;color:var(--red);font-weight:700;cursor:pointer;font-size:11px;">todos / ninguém</button></p>' +
            '<div class="split-chips">' + splitChips + "</div>" +
            '<button class="btn-primary exp-add">Registrar despesa</button>' +
          "</div>" +
        "</div>";

      var settleHtml = "";
      if (data.settle.length) {
        var rows = data.settle
          .map(function (s) {
            var canMark = s.from === me.order;
            return (
              '<div class="settle-row">' +
                '<span class="sp">' + firstName(s.from) + ' <span class="arrow">→</span> ' + firstName(s.to) +
                  ' <span class="sv num">' + fmtBRL(s.amountCents) + "</span></span>" +
                (canMark ? '<button class="mark-paid" data-to="' + s.to + '" data-cents="' + s.amountCents + '">Paguei via Pix</button>' : "") +
              "</div>"
            );
          })
          .join("");
        settleHtml =
          '<div class="card"><p class="section-label">Acerto final (mínimo de transações)</p>' +
            '<div class="settle-list">' + rows + "</div>" +
          "</div>";
      }

      var feedHtml;
      if (!data.expenses.length) {
        feedHtml = '<div class="card"><p class="section-label">Despesas</p><p class="empty-state">Nenhuma despesa ainda. Registre a primeira acima.</p></div>';
      } else {
        var items = data.expenses
          .map(function (e) {
            var canDelete = e.createdBy === me.order || me.admin;
            var delHtml = canDelete ? '<button class="del-btn" data-id="' + e.id + '" title="Remover">×</button>' : "";
            if (e.type === "settlement") {
              return (
                '<div class="expense-item settlement">' +
                  '<div class="ei-main"><div class="ei-desc">' + firstName(e.from) + " pagou " + firstName(e.to) + '</div><div class="ei-meta">acerto via Pix</div></div>' +
                  '<span class="ei-value num">' + fmtBRL(e.amountCents) + "</span>" + delHtml +
                "</div>"
              );
            }
            return (
              '<div class="expense-item">' +
                '<div class="ei-main"><div class="ei-desc">' + esc(e.description) + "</div>" +
                  '<div class="ei-meta">pago por ' + firstName(e.paidBy) + " · dividido entre " + e.participants.length + "</div></div>" +
                '<span class="ei-value num">' + fmtBRL(e.amountCents) + "</span>" + delHtml +
              "</div>"
            );
          })
          .join("");
        feedHtml = '<div class="card"><p class="section-label">Despesas</p><div class="expense-feed">' + items + "</div></div>";
      }

      container.innerHTML = heroHtml + formHtml + settleHtml + feedHtml;

      // pagador: seleção única
      container.querySelectorAll(".p-chip.pay").forEach(function (chip) {
        chip.addEventListener("click", function () {
          container.querySelectorAll(".p-chip.pay").forEach(function (c) { c.classList.remove("on"); });
          chip.classList.add("on");
        });
      });
      // participantes: toggle individual + atalho todos/ninguém
      container.querySelectorAll(".p-chip.split").forEach(function (chip) {
        chip.addEventListener("click", function () { chip.classList.toggle("on"); });
      });
      container.querySelector(".split-all").addEventListener("click", function () {
        var chips = container.querySelectorAll(".p-chip.split");
        var allOn = Array.prototype.every.call(chips, function (c) { return c.classList.contains("on"); });
        chips.forEach(function (c) { c.classList.toggle("on", !allOn); });
      });

      container.querySelector(".exp-add").addEventListener("click", function () {
        var cents = parseBRL(container.querySelector(".exp-amount").value);
        var desc = container.querySelector(".exp-desc").value.trim();
        var payer = container.querySelector(".p-chip.pay.on");
        var participants = Array.prototype.map.call(
          container.querySelectorAll(".p-chip.split.on"),
          function (c) { return parseInt(c.dataset.order, 10); }
        );
        if (!cents || cents <= 0) return window.alert("Informe o valor (ex: 48,70).");
        if (!desc) return window.alert("Descreva a despesa.");
        if (!payer) return window.alert("Selecione quem pagou.");
        if (!participants.length) return window.alert("Selecione entre quem dividir.");
        var payload = { description: desc, amountCents: cents, paidBy: parseInt(payer.dataset.order, 10), participants: participants };
        api("/api/expenses", { method: "POST", body: JSON.stringify(payload) }).then(function (res) {
          if (res && res.error === "possible_duplicate") {
            var d = res.duplicate;
            var mins = Math.max(1, Math.round((Date.now() - new Date(d.createdAt).getTime()) / 60000));
            var ok = window.confirm(
              "Parece duplicada: \"" + d.description + "\" (" + fmtBRL(d.amountCents) + ", mesmos participantes) foi registrada por " +
              firstName(d.createdBy) + " há " + mins + " min.\n\nRegistrar essa nova despesa mesmo assim?"
            );
            if (!ok) return;
            payload.force = true;
            return api("/api/expenses", { method: "POST", body: JSON.stringify(payload) }).then(loadExpenses);
          }
          loadExpenses();
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

  // ---- Checklist (server-persisted, compartilhado entre todos os membros) ----
  function renderChecklist(items) {
    var listEl = document.getElementById("checklist-items");
    if (!items.length) {
      listEl.innerHTML = '<p class="empty-state">Nenhuma pendência. Adicione uma abaixo.</p>';
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
    Promise.all([meReady, api("/api/pin-poll")]).then(function (results) {
      var me = results[0], poll = results[1];
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
    });
  }
  setTimeout(maybeShowPinPoll, 1400); // deixa a primeira aba assentar antes

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  var loaders = {
    resumo: loadMission,
    membros: loadMembers,
    agenda: loadAgenda,
    empresas: loadCompanies,
    trajetos: loadRoutes,
    selos: loadBadges,
    despesas: loadExpenses,
    checklist: loadChecklist,
  };

  activateTab("resumo");
})();
