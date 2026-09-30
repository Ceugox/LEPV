/* Dinâmica de entrada compartilhada pelas propostas.
   - #intro: overlay pós-login (cada proposta define o desenho no CSS); sai
     sozinho após data-ms (padrão 1900) e se remove ao fim da transição.
   - [data-count]: conta 0→N com easing quando a intro termina.
   - Respeita prefers-reduced-motion: sem overlay, sem contagem, sem stagger. */
(function () {
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var intro = document.getElementById("intro");

  function contadores() {
    document.querySelectorAll("[data-count]").forEach(function (el) {
      var alvo = parseInt(el.getAttribute("data-count"), 10);
      if (isNaN(alvo)) return;
      if (reduce) { el.textContent = String(alvo); return; }
      var t0 = null, dur = 750;
      function tick(t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        el.textContent = String(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function pronto() {
    document.body.classList.add("pronto");
    contadores();
  }

  if (!intro || reduce) {
    if (intro) intro.parentNode.removeChild(intro);
    pronto();
    return;
  }

  var ms = parseInt(intro.getAttribute("data-ms") || "1900", 10);
  setTimeout(function () { intro.classList.add("sai"); }, ms);
  intro.addEventListener("transitionend", function (e) {
    if (e.target === intro && intro.parentNode) { intro.parentNode.removeChild(intro); pronto(); }
  });
  /* rede de segurança: se a transição não disparar, libera mesmo assim */
  setTimeout(function () {
    if (intro.parentNode) { intro.parentNode.removeChild(intro); }
    pronto();
  }, ms + 1800);
})();
