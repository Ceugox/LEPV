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
  function wireTablist(container) {
    container.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var tabs = Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      var next = e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });
  }

  var tabButtons = document.querySelectorAll("nav.tabs button");
  var panels = document.querySelectorAll(".panel");
  var loaded = {};
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
    if (name === "selos") {
      // Presença pode mudar a qualquer momento (o admin marca durante a viagem);
      // sempre recarrega, diferente das outras abas (mais estáticas).
      loaders.selos();
    } else if (!loaded[name]) {
      loaded[name] = true;
      loaders[name] && loaders[name]();
    }
  }
  tabButtons.forEach(function (b) {
    b.addEventListener("click", function () { activateTab(b.dataset.tab); });
  });

  // ---- Resumo ----
  function loadMission() {
    Promise.all([api("/api/mission"), api("/api/companies")]).then(function (results) {
      var m = results[0];
      var companiesByKey = {};
      results[1].forEach(function (c) { companiesByKey[c.key] = c; });

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

      document.getElementById("mission-content").innerHTML = heroHtml + pioneerHtml + prepareHtml + expectHtml;
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
          ? '<a class="route" target="_blank" rel="noopener" href="' + mapsSearch(stop.addr) + '">Ver no mapa →</a>'
          : "";
      var company = stop.companyKey ? agendaCompaniesByKey[stop.companyKey] : null;
      var logoHtml = company
        ? '<span class="stop-logo logoBg-' + (company.logoBg || "light") + '"><img src="' + company.logo + '" alt="' + company.name + '"></span>'
        : "";
      stopsHtml +=
        '<div class="stop stagger-in" style="animation-delay:' + (i * 70) + 'ms">' +
          '<div class="time num">' + stop.time + "</div>" +
          '<div class="rail"><span class="dot"></span>' +
            '<div class="stopcard">' +
              '<div class="top">' + logoHtml + '<span class="company">' + stop.company + "</span>" + badgeHtml + "</div>" +
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
        '<a class="btn-primary" style="text-decoration:none;" target="_blank" rel="noopener" href="' + mapsSearch(data.hotel.addr) + '">Ver no mapa</a>';

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
      var initial = data.days.find(function (d) { return d.date === todayStr; }) || data.days[0];
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
        ? '<a class="route" target="_blank" rel="noopener" href="' + mapsSearch(visit.addr) + '">Ver no mapa →</a>'
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
      chip.classList.toggle("active", chip.dataset.key === key);
    });
    syncTabState(picker);
    var company = companiesData.find(function (c) { return c.key === key; });
    if (company) renderCompanyDetail(company);
    renderAttendancePanel(key);
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
      wireTablist(picker);
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
      var initial = todaysCompany || companiesData[0];
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
      var initial = data.days.find(function (d) { return d.date === todayStr; }) || data.days[0];
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
            "</div>"
          );
        })
        .join("");

      container.innerHTML = headerHtml + '<div class="badges-grid">' + gridHtml + "</div>";

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

  var loaders = {
    resumo: loadMission,
    membros: loadMembers,
    agenda: loadAgenda,
    empresas: loadCompanies,
    trajetos: loadRoutes,
    selos: loadBadges,
    checklist: loadChecklist,
  };

  activateTab("resumo");
})();
