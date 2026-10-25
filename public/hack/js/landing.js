(() => {
  'use strict';
  const motion = document.documentElement.classList.contains('motion');
  const pad = n => String(n).padStart(2, '0');

  /* countdowns: absolute instants, never the device's local time */
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = Date.parse(el.dataset.count);
    const u = {};
    el.querySelectorAll('[data-u]').forEach(b => { u[b.dataset.u] = b; });
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      if (diff === 0) {
        el.querySelector('.count__d').hidden = true;
        el.querySelector('.count__done').hidden = false;
        return;
      }
      const s = Math.floor(diff / 1000);
      u.d.textContent = pad(Math.floor(s / 86400));
      u.h.textContent = pad(Math.floor(s / 3600) % 24);
      u.m.textContent = pad(Math.floor(s / 60) % 60);
      u.s.textContent = pad(s % 60);
      setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
  });

  /* /hack/inscricao devolve aqui quando as inscrições do evento fecharam */
  if (new URLSearchParams(location.search).get('inscricoes') === 'encerradas') {
    const n = document.getElementById('aviso-inscricao');
    if (n) n.hidden = false;
  }

  /* anchors: smooth scroll in JS (CSS smooth-scroll breaks the screenshot checks) */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: motion ? 'smooth' : 'auto' });
    // Leva o foco junto: sem isso, o "pular para o conteúdo" só rolava a tela.
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
    history.replaceState(null, '', a.getAttribute('href'));
  });

  if (!motion) return;

  /* reveal */
  const targets = document.querySelectorAll('.final__in > *, .org__text, .org__grid, .sec-head, .day, .seal__in > *, .feats li, .duo__card, .faq__list details, .outro__in');
  targets.forEach(t => t.classList.add('rv'));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  targets.forEach(t => io.observe(t));

  /* scroll-linked parallax: a foto do hero desliza devagar */
  const root = document.documentElement;
  let raf = 0;
  const onScroll = () => {
    raf = 0;
    const y = window.scrollY;
    if (y < window.innerHeight * 1.2) root.style.setProperty('--sy', y.toFixed(1));
  };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();
})();
