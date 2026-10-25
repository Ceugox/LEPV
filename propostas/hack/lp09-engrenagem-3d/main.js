(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 640px)').matches;

  /* ---------- countdown (absolute instant, never device-local time) ---------- */
  const TARGET = Date.parse('2026-10-30T15:00:00-03:00');
  const cdEl = document.getElementById('countdown');
  const cdParts = {};
  cdEl.querySelectorAll('[data-cd]').forEach(b => { cdParts[b.dataset.cd] = b; });
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const diff = Math.max(0, TARGET - Date.now());
    if (diff === 0) {
      cdEl.querySelectorAll('.cd').forEach(c => { c.hidden = true; });
      cdEl.querySelector('.cd-done').hidden = false;
      return;
    }
    const s = Math.floor(diff / 1000);
    cdParts.d.textContent = pad(Math.floor(s / 86400));
    cdParts.h.textContent = pad(Math.floor(s / 3600) % 24);
    cdParts.m.textContent = pad(Math.floor(s / 60) % 60);
    cdParts.s.textContent = pad(s % 60);
    setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();

  /* ---------- turn meter + active schedule tooth ---------- */
  const tmNum = document.getElementById('tmNum');
  const tmDeg = document.getElementById('tmDeg');
  const sections = [...document.querySelectorAll('[data-turn]')];
  const teeth = [...document.querySelectorAll('[data-tooth]')];
  let activeTooth = -1;

  /* ---------- reveal ---------- */
  if (!reduced && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('.sec__head, .panel, .feat, .stats, .teams__big, .final');
    targets.forEach(t => t.setAttribute('data-rv', ''));
    root.classList.add('anim');
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(t => io.observe(t));
  }

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
  }

  /* ---------- WebGL ---------- */
  let gl = null;
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  if (reduced || !window.THREE || !hasWebGL()) {
    root.classList.add('no-gl');
  } else {
    try { gl = initScene(); } catch (e) { root.classList.add('no-gl'); gl = null; }
  }

  function scrollState() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const y = window.scrollY;
    const mid = y + window.innerHeight * 0.5;
    let idx = 0;
    sections.forEach((s, i) => { if (s.offsetTop <= mid) idx = i; });
    // tooth: the schedule row closest to viewport center
    let best = -1, bestD = Infinity;
    const vc = window.innerHeight * 0.5;
    teeth.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const d = Math.abs(r.top + r.height / 2 - vc);
      if (d < bestD) { bestD = d; best = i; }
    });
    return { p: Math.min(1, y / max), idx, tooth: best };
  }

  let last = 0;
  function frame(t) {
    if (lenis) lenis.raf(t);
    const st = scrollState();
    tmNum.textContent = pad(st.idx);
    tmDeg.textContent = String(Math.round(st.p * 7 * 360) % 360).padStart(3, '0') + '°';
    if (st.tooth !== activeTooth) {
      teeth.forEach((el, i) => el.classList.toggle('on', i === st.tooth));
      activeTooth = st.tooth;
    }
    if (gl) gl.render(t, st, t - last);
    last = t;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function initScene() {
    const THREE = window.THREE;
    const canvas = document.getElementById('gl');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070708, 0.018);
    const camera = new THREE.PerspectiveCamera(isMobile ? 55 : 40, window.innerWidth / window.innerHeight, 0.05, 260);

    /* environment for metal reflections, built from emissive cards */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.BackSide })));
    const card = (c, w, h, x, y, z, ry = 0, rx = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
    };
    card(0xffffff, 26, 3, 0, 14, 4, 0, Math.PI / 2);
    card(0xd31e24, 4, 18, -16, 0, 6, Math.PI / 2);
    card(0x9e1f30, 4, 18, 16, 2, -4, -Math.PI / 2);
    card(0xbfc6d0, 10, 6, 6, -6, 16, Math.PI);
    scene.environment = pmrem.fromScene(env, 0.035).texture;

    /* ---------- gear geometry (profile of the LEPV logo: 16 trapezoid teeth) ---------- */
    const TEETH = 16, R_TIP = 4.0, R_ROOT = 3.43, R_IN = 2.94, DEPTH = 0.72;
    const step = Math.PI * 2 / TEETH;
    const wRoot = step * 0.5, wTip = step * 0.33;
    const shape = new THREE.Shape();
    for (let i = 0; i < TEETH; i++) {
      const a = i * step;
      const pts = [
        [R_ROOT, a - wRoot / 2], [R_TIP, a - wTip / 2], [R_TIP, a + wTip / 2], [R_ROOT, a + wRoot / 2]
      ];
      pts.forEach(([r, ang], k) => {
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i === 0 && k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      });
      const a0 = a + wRoot / 2, a1 = a + step - wRoot / 2;
      for (let s = 1; s <= 6; s++) {
        const ang = a0 + (a1 - a0) * (s / 6);
        shape.lineTo(Math.cos(ang) * R_ROOT, Math.sin(ang) * R_ROOT);
      }
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, R_IN, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const BEVEL = 0.05;
    const geom = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 72 });
    geom.translate(0, 0, -DEPTH / 2);
    geom.computeVertexNormals();

    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.25, transparent: true, opacity: 0 });
    const metalB = new THREE.MeshStandardMaterial({ color: 0x1c1c21, metalness: 0.9, roughness: 0.38, envMapIntensity: 1.0 });

    // wine edges: front + back outlines
    const outline = shape.getPoints(72);
    const holePts = hole.getPoints(96);
    function edgeLines(color, opacity) {
      const g = new THREE.Group();
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      [DEPTH / 2 + BEVEL + 0.004, -DEPTH / 2 - BEVEL - 0.004].forEach(z => {
        [outline, holePts].forEach(pts => {
          const arr = pts.map(p => new THREE.Vector3(p.x, p.y, z));
          g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(arr), mat));
        });
      });
      g.userData.mat = mat;
      return g;
    }

    const world = new THREE.Group();
    scene.add(world);

    const GAP = 16, COUNT = 8;
    const gears = [];
    for (let i = 0; i < COUNT; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geom, i === 0 ? metal : metalB);
      g.add(mesh);
      const e = edgeLines(i === 0 ? 0xd31e24 : 0x9e1f30, i === 0 ? 0 : 0.85);
      g.add(e);
      g.position.z = -i * GAP;
      const sc = i === 0 ? 1 : 1 + (i % 2) * 0.18;
      g.scale.setScalar(sc);
      g.userData = { dir: i % 2 ? -1 : 1, edges: e, phase: i * 0.37 };
      world.add(g);
      gears.push(g);
    }

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 8, 10); scene.add(key);
    const rim = new THREE.PointLight(0xd31e24, 60, 30, 1.6); rim.position.set(-6, -2, 4); scene.add(rim);
    const rim2 = new THREE.PointLight(0xff6b70, 40, 24, 1.6); scene.add(rim2);

    /* ---------- particles ---------- */
    const N = isMobile ? 2400 : 7600;
    const aScatter = new Float32Array(N * 3), aGear = new Float32Array(N * 3), aSugar = new Float32Array(N * 3), aStar = new Float32Array(N * 3);
    const aRand = new Float32Array(N * 4), aC1 = new Float32Array(N * 3), aC2 = new Float32Array(N * 3);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const W = [0.96, 0.92, 0.9], RED = [0.83, 0.12, 0.14], WINE = [0.62, 0.12, 0.19];

    function inGear(r, ang) {
      if (r < R_IN || r > R_TIP) return false;
      if (r <= R_ROOT) return true;
      let local = ((ang % step) + step) % step; if (local > step / 2) local -= step;
      const t = (r - R_ROOT) / (R_TIP - R_ROOT);
      const half = (wRoot + (wTip - wRoot) * t) / 2;
      return Math.abs(local) <= half;
    }
    const peak = x => Math.max(
      2.55 * Math.exp(-Math.pow(Math.abs(x + 0.8) / 0.6, 2.3)),
      0.72 * Math.exp(-Math.pow(Math.abs(x - 0.5) / 0.42, 2)),
      0.95 * Math.exp(-Math.pow(Math.abs(x - 1.7) / 0.55, 1.6))
    );
    const BASE = -0.95;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      // scatter: big sphere shell
      const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(-1, 1)), rr = rnd(9, 22);
      aScatter[i3] = Math.sin(ph) * Math.cos(th) * rr;
      aScatter[i3 + 1] = Math.sin(ph) * Math.sin(th) * rr;
      aScatter[i3 + 2] = Math.cos(ph) * rr - 4;
      // gear: sample area (biased to edges for a crisp read)
      let r, ang;
      do { r = rnd(R_IN, R_TIP); ang = Math.random() * Math.PI * 2; } while (!inGear(r, ang));
      if (Math.random() < 0.35) r = Math.random() < 0.5 ? R_IN + 0.02 : Math.min(r + 0.08, R_TIP);
      if (!inGear(r, ang)) r = R_IN + 0.02;
      aGear[i3] = Math.cos(ang) * r;
      aGear[i3 + 1] = Math.sin(ang) * r;
      aGear[i3 + 2] = (Math.random() < 0.5 ? 1 : -1) * (DEPTH / 2 + BEVEL + 0.03) + rnd(-0.04, 0.04);
      const gc = Math.random() < 0.16 ? RED : W;
      aC1.set(gc, i3);
      // sugar loaf composition (mountains + arrow + two waves), inside the ring
      const pick = Math.random();
      let sx, sy, sc;
      if (pick < 0.56) {
        do { sx = rnd(-2.3, 2.6); sy = rnd(BASE, BASE + 2.6); } while (sy > BASE + peak(sx) || Math.hypot(sx, sy) > R_IN - 0.05);
        // emphasise silhouette
        if (Math.random() < 0.4) sy = BASE + peak(sx) - rnd(0, 0.05);
        sc = W;
      } else if (pick < 0.72) {
        const t = Math.random();
        sx = -3.0 + t * 5.6; sy = -1.55 + Math.pow(t, 1.6) * 3.4 + rnd(-0.04, 0.04);
        if (t > 0.9 && Math.random() < 0.5) { sx -= rnd(0, 0.5); sy += rnd(-0.45, 0.1); }
        sc = RED;
      } else {
        const band = Math.random() < 0.55 ? 0 : 1;
        sx = rnd(-4.0, 4.0);
        sy = (band ? -1.95 : -1.55) + 0.32 * Math.sin(sx * 0.7 + (band ? 1.6 : 0.8)) + rnd(-0.06, 0.06) * (1 - Math.abs(sx) / 4.2);
        sc = band ? WINE : RED;
      }
      aSugar[i3] = sx; aSugar[i3 + 1] = sy; aSugar[i3 + 2] = rnd(-0.12, 0.12);
      aC2.set(sc, i3);
      // tunnel of stars
      const tz = rnd(-GAP * (COUNT - 1) - 20, 2);
      const ta = Math.random() * Math.PI * 2, tr = rnd(4.6, 14);
      aStar[i3] = Math.cos(ta) * tr; aStar[i3 + 1] = Math.sin(ta) * tr; aStar[i3 + 2] = tz;
      aRand[i * 4] = Math.random(); aRand[i * 4 + 1] = rnd(0.6, 1.5); aRand[i * 4 + 2] = Math.random(); aRand[i * 4 + 3] = Math.random();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(aGear, 3));
    pg.setAttribute('aScatter', new THREE.BufferAttribute(aScatter, 3));
    pg.setAttribute('aSugar', new THREE.BufferAttribute(aSugar, 3));
    pg.setAttribute('aStar', new THREE.BufferAttribute(aStar, 3));
    pg.setAttribute('aRand', new THREE.BufferAttribute(aRand, 4));
    pg.setAttribute('aC1', new THREE.BufferAttribute(aC1, 3));
    pg.setAttribute('aC2', new THREE.BufferAttribute(aC2, 3));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -60), 200);

    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uA: { value: 0 }, uM: { value: 0 }, uE: { value: 0 }, uRot: { value: 0 },
        uPix: { value: renderer.getPixelRatio() }, uSize: { value: isMobile ? 4.2 : 4.6 }
      },
      vertexShader: `
        attribute vec3 aScatter; attribute vec3 aSugar; attribute vec3 aStar; attribute vec4 aRand;
        attribute vec3 aC1; attribute vec3 aC2;
        uniform float uTime, uA, uM, uE, uRot, uPix, uSize;
        varying vec3 vCol; varying float vAlpha;
        float ease(float t){ t = clamp(t,0.,1.); return t*t*(3.-2.*t); }
        void main(){
          float d = aRand.x;
          float a = ease((uA - d*0.4) / 0.6);
          float m = ease((uM - d*0.45) / 0.55);
          float e = ease((uE - d*0.3) / 0.7);
          float c = cos(uRot), s = sin(uRot);
          vec3 g = position; g.xy = vec2(c*g.x - s*g.y, s*g.x + c*g.y);
          vec3 p = mix(aScatter, g, a);
          vec3 q = aSugar;
          p = mix(p, q, m);
          p.z += sin(m*3.14159) * (aRand.z - 0.5) * 3.0;
          p += vec3(sin(uTime*0.9 + aRand.z*40.0), cos(uTime*0.8 + aRand.w*40.0), sin(uTime*0.7+aRand.z*20.0)) * (0.025 + 0.25*(1.0-a));
          vec3 star = aStar; star.xy *= 1.0 + 0.02*sin(uTime*0.5 + aRand.w*10.0);
          p = mix(p, star, e);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(uSize * aRand.y * uPix * (12.0 / max(0.5, -mv.z)), 26.0 * uPix);
          gl_Position = projectionMatrix * mv;
          vCol = mix(mix(aC1, aC2, m), mix(vec3(1.0,0.86,0.84), aC1, 0.5), e);
          vAlpha = (0.35 + 0.65*a) * (0.75 + 0.25*sin(uTime*2.0 + aRand.w*30.0));
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vAlpha;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float k = smoothstep(0.5, 0.0, d);
          k = k*k;
          if (k < 0.01) discard;
          gl_FragColor = vec4(vCol * k * 1.25, k * vAlpha);
        }`
    });
    const points = new THREE.Points(pg, pMat);
    points.frustumCulled = false;
    world.add(points);

    /* ---------- interaction ---------- */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', e => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    let visible = true;
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

    const start = performance.now();
    const lerp = (a, b, t) => a + (b - a) * t;
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    let camZ = null, tooth = 0, spin = 0;
    const z0 = isMobile ? 21 : 13.5;
    const travel = GAP * (COUNT - 1) + 9;

    return {
      render(now, st) {
        if (!visible) return;
        const t = (performance.now() - start) / 1000;
        pMat.uniforms.uTime.value = t;
        pMat.uniforms.uA.value = sm(0.05, 1.5, t);
        pMat.uniforms.uM.value = sm(1.55, 2.45, t);
        metal.opacity = sm(0.7, 1.7, t);
        metal.transparent = metal.opacity < 1;
        gears[0].userData.edges.userData.mat.opacity = 0.95 * sm(1.2, 2.0, t);

        const p = st.p;
        const targetZ = z0 - p * travel;
        camZ = camZ === null ? targetZ : lerp(camZ, targetZ, 0.08);
        const intro = sm(0, 0.07, p);
        const offX = isMobile ? 0 : lerp(-3.7, 0, intro);
        const offY = isMobile ? lerp(-5.6, 0, intro) : lerp(0.2, 0, intro);
        mouse.x = lerp(mouse.x, mouse.tx, 0.05); mouse.y = lerp(mouse.y, mouse.ty, 0.05);
        const sway = sm(0.06, 0.15, p);
        camera.position.set(offX + Math.sin(p * 9) * 1.1 * sway, offY + Math.cos(p * 7) * 0.7 * sway, camZ);
        camera.lookAt(offX + Math.sin(p * 9 + 0.6) * 0.6 * sway, offY, camZ - 10);
        world.rotation.y = lerp(world.rotation.y, mouse.x * 0.22, 0.08);
        world.rotation.x = lerp(world.rotation.x, mouse.y * 0.14, 0.08);

        // particles burst into a tunnel of stars once the camera nears the first gear
        pMat.uniforms.uE.value = sm(z0 - 0.5, 3.0, camZ);

        // each section = one turn; schedule rows step the gear tooth by tooth
        const targetTooth = st.tooth >= 0 ? st.tooth : tooth;
        tooth = lerp(tooth, targetTooth, 0.1);
        spin += 0.0016;
        gears.forEach((g, i) => {
          g.rotation.z = g.userData.dir * (spin + p * Math.PI * 2 * 7 / (i === 0 ? 1 : 1.5)) + g.userData.phase - tooth * step;
        });
        pMat.uniforms.uRot.value = gears[0].rotation.z;

        rim2.position.set(Math.sin(t * 0.4) * 5, Math.cos(t * 0.3) * 3, camZ - 8);
        renderer.render(scene, camera);
      }
    };
  }
})();
