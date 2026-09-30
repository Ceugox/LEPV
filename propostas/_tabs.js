/* Navegação por abas compartilhada pelos mockups: botões [data-tab] alternam
   .panel[data-panel] e sustentam o estado ativo + hash da URL (permite linkar
   uma aba direta, ex.: p2-conclave/#eventos). */
(function () {
  function ativar(nome, focar) {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      var on = b.getAttribute("data-tab") === nome;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.classList.toggle("active", p.getAttribute("data-panel") === nome);
    });
    if (focar) {
      var p = document.querySelector('[data-panel="' + nome + '"]');
      if (p) { p.setAttribute("tabindex", "-1"); p.focus({ preventScroll: true }); }
    }
    if (history.replaceState) history.replaceState(null, "", "#" + nome);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (b) ativar(b.getAttribute("data-tab"), false);
  });
  function ativarHash() {
    var h = (location.hash || "").replace("#", "");
    if (h && document.querySelector('[data-panel="' + h + '"]')) ativar(h, false);
  }
  window.addEventListener("hashchange", ativarHash);
  var inicial = (location.hash || "").replace("#", "");
  var existe = inicial && document.querySelector('[data-panel="' + inicial + '"]');
  ativar(existe ? inicial : (document.querySelector("[data-tab]") || {}).getAttribute
    ? document.querySelector("[data-tab]").getAttribute("data-tab") : "inicio", false);
})();
