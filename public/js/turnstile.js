// Turnstile (Cloudflare) nos formulários públicos: inscrição, presença e
// pedido de cadastro. Só age se o server expuser uma sitekey em
// /api/public-config; sem ela a página fica exatamente como era.
//
// Uso nas páginas:
//   LEPVTurnstile.attach(form)         — uma vez, depois de achar o <form>
//   turnstileToken: LEPVTurnstile.token()  — no corpo do POST
//   LEPVTurnstile.reset()              — quando o server recusa o envio
//
// Arquivo classic (não módulo), mas mora em public/js/, que é ESM para o
// node --check do CI: por isso nada aqui depende de sloppy mode.
(function () {
  var slot = null;
  var widgetId = null;
  var siteKey = null;

  function render() {
    if (!slot || !siteKey || !window.turnstile || widgetId !== null) return;
    widgetId = window.turnstile.render(slot, {
      sitekey: siteKey,
      theme: "light",
      size: "flexible",
      language: "pt-br",
    });
  }

  function loadApi() {
    if (document.getElementById("cf-turnstile-api")) return;
    window.__lepvTurnstileReady = render;
    var s = document.createElement("script");
    s.id = "cf-turnstile-api";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__lepvTurnstileReady";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function attach(form) {
    if (!form) return;
    fetch("/api/public-config")
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (cfg) {
        if (!cfg || !cfg.turnstile) return;
        siteKey = cfg.turnstile;
        slot = document.createElement("div");
        slot.className = "turnstile-slot";
        slot.style.margin = "4px 0 14px";
        slot.style.minHeight = "65px";
        var submit = form.querySelector('button[type="submit"]');
        if (submit) form.insertBefore(slot, submit);
        else form.appendChild(slot);
        loadApi();
        render();
      })
      .catch(function () {});
  }

  // undefined quando não há widget: JSON.stringify descarta a chave e o
  // corpo do POST fica igual ao de antes.
  function token() {
    if (widgetId === null || !window.turnstile) return undefined;
    return window.turnstile.getResponse(widgetId) || "";
  }

  function reset() {
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
  }

  window.LEPVTurnstile = { attach: attach, token: token, reset: reset };
})();
