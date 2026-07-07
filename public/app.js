(function () {
  function mapsSearch(addr) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr);
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
  api("/api/me").then(function (me) {
    document.getElementById("who-name").textContent = me.name;
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

  // ---- Tabs ----
  var tabButtons = document.querySelectorAll("nav.tabs button");
  var panels = document.querySelectorAll(".panel");
  var loaded = {};

  function activateTab(name) {
    tabButtons.forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    panels.forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + name); });
    if (!loaded[name]) {
      loaded[name] = true;
      loaders[name] && loaders[name]();
    }
  }
  tabButtons.forEach(function (b) {
    b.addEventListener("click", function () { activateTab(b.dataset.tab); });
  });

  // ---- Resumo ----
  function loadMission() {
    api("/api/mission").then(function (m) {
      var objectivesHtml = m.objectives.map(function (o) { return "<li>" + o + "</li>"; }).join("");
      var chipsHtml = m.companies.map(function (c) { return '<span class="chip">' + c + "</span>"; }).join("");
      document.getElementById("mission-content").innerHTML =
        '<h2 class="mission-title">' + m.title + "</h2>" +
        '<p class="mission-summary">' + m.summary + "</p>" +
        '<ul class="objectives">' + objectivesHtml + "</ul>" +
        '<div class="chips">' + chipsHtml + "</div>";
    });
  }

  // ---- Membros ----
  function loadMembers() {
    api("/api/members").then(function (members) {
      var grid = document.getElementById("member-grid");
      grid.innerHTML = members
        .map(function (m) {
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
            '<div class="member-card">' +
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
      stopsHtml +=
        '<div class="stop">' +
          '<div class="time num">' + stop.time + "</div>" +
          '<div class="rail"><span class="dot"></span>' +
            '<div class="stopcard">' +
              '<div class="top"><span class="company">' + stop.company + "</span>" + badgeHtml + "</div>" +
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
      "</div>";
  }

  function loadAgenda() {
    api("/api/itinerary").then(function (data) {
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
        .map(function (d) { return '<button data-day="' + d.id + '">' + d.weekday.slice(0, 3) + " " + d.date + "</button>"; })
        .join("");
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
    document.querySelectorAll("#daypicker button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.day === id);
    });
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
      var routeHtml = visit.addr
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
    document.querySelectorAll("#company-picker .company-chip").forEach(function (chip) {
      chip.classList.toggle("active", chip.dataset.key === key);
    });
    var company = companiesData.find(function (c) { return c.key === key; });
    if (company) renderCompanyDetail(company);
  }

  function loadCompanies() {
    Promise.all([api("/api/companies"), api("/api/itinerary")]).then(function (results) {
      companiesData = results[0];
      companyVisits = buildCompanyVisits(results[1]);

      var picker = document.getElementById("company-picker");
      picker.innerHTML = companiesData
        .map(function (c) {
          return (
            '<button class="company-chip" data-key="' + c.key + '">' +
              '<span class="dot" style="background:' + c.color + '"></span>' +
              '<span class="lbl">' + c.name + "</span>" +
            "</button>"
          );
        })
        .join("");
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

  // ---- Transporte ----
  var paxInput = document.getElementById("pax");
  var veicSelect = document.getElementById("veic");
  var calcOut = document.getElementById("calc-out");
  function updateCalc() {
    var pax = Math.max(1, parseInt(paxInput.value, 10) || 1);
    var perCar = parseInt(veicSelect.value, 10);
    calcOut.textContent = Math.ceil(pax / perCar);
  }
  paxInput.addEventListener("input", updateCalc);
  veicSelect.addEventListener("change", updateCalc);
  updateCalc();

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
            '<span class="txt">' + item.text +
              (item.addedBy ? '<span class="who-added">adicionado por ' + item.addedBy + "</span>" : "") +
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
    transporte: function () {},
    checklist: loadChecklist,
  };

  activateTab("resumo");
})();
