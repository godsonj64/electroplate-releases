/* ElectroPlate site — the hero's LED wall.
 *
 * The hero background is a wall of round LEDs showing a slow molten band, in
 * the style of the app's displays: a dim red layer above, a hot crest, the
 * band itself, and dark dunes in front. On a wide screen the band's horizon
 * is a U: flat under the copy, rising in the room beside it, so it frames the
 * words instead of running behind them. On a phone the copy runs edge to
 * edge, so the band instead flows behind the buttons, with its dark dunes
 * under the small print. Behind the headline and lede the wall dims to unlit
 * LEDs. It powers on from the bottom row up.
 *
 * Two passes keep it cheap at full screen: the light is worked out once per
 * LED into a small texture, then the dots are drawn from it. Drawing runs at
 * 30 fps, pauses off screen and in a hidden tab, and holds still for reduced
 * motion. Without WebGL the page keeps its CSS dot field.
 */
(() => {
  const hero = document.querySelector('.hero');
  const copy = hero && hero.querySelector('.hero-copy');
  const band = hero && (hero.querySelector('.assurances') || copy);
  if (!hero || !copy) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-led';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return;

  // [back layer, band, crest, band's lower edge, dune and sky] — molten.
  const PALETTE = ['#5a1709', '#ff5a1f', '#ffc46b', '#d42a12', '#140605'].map((hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  });
  const FPS = 30;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  const VERTEX = 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';

  // Pass 1: one texel per LED — the colour of the light behind it.
  const FIELD = `
    precision highp float;
    uniform vec2 u_cells;
    uniform float u_pitch;
    uniform vec2 u_margin;
    uniform float u_unit;
    uniform float u_crest;
    uniform float u_rise;
    uniform vec3 u_span;
    uniform float u_xfreq;
    uniform float u_amp;
    uniform float u_dune;
    uniform float u_time;
    uniform vec4 u_hole;
    uniform float u_power;
    uniform vec2 u_res;
    uniform vec3 u_back, u_main, u_hot, u_edge, u_deep;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
    void main() {
      vec2 cell = vec2(floor(gl_FragCoord.x), u_cells.y - 1.0 - floor(gl_FragCoord.y));
      vec2 c = u_margin + (cell + 0.5) * u_pitch;          // LED centre, device px, y down
      vec2 q = c / u_unit;                                  // in units of the fold height
      float t = u_time;
      float n = fbm(q * vec2(1.8, 2.6) + vec2(t * 0.045, -t * 0.03));
      float x = q.x * u_xfreq;
      // Flat under the words, rising only in the room beside them:
      // 0 at the edge of the text, 1 at the edge of the page.
      float beside = max(0.0, abs(c.x - u_span.x) - u_span.z) / max(1.0, u_span.y - u_span.z);
      float bowl = u_rise * beside * beside;
      float crest = u_crest - bowl + u_amp * (0.06 * sin(x * 1.15 + t * 0.19) + 0.035 * sin(x * 2.9 - t * 0.27) + 0.06 * (n - 0.5));
      float backCrest = crest - 0.26 + 0.06 * sin(x * 1.7 - t * 0.22 + 1.1) + 0.05 * (n - 0.5);
      float duneCrest = crest + u_dune + u_amp * (0.07 * sin(x * 1.05 + t * 0.16 + 2.2) + 0.04 * sin(x * 3.6 - t * 0.21) + 0.04 * (n - 0.5));

      vec3 col = u_deep * (0.5 + 0.9 * n);                            // the sky: unlit, barely warm
      float dBack = q.y - backCrest;
      vec3 back = u_back * (0.45 + 0.75 * n) * (0.65 + 0.35 * exp(-max(dBack, 0.0) * 5.0));
      col = mix(col, back, smoothstep(-0.01, 0.02, dBack));
      float d = q.y - crest;
      vec3 bandCol = mix(u_hot, u_main, smoothstep(0.0, 0.07, d));
      bandCol = mix(bandCol, u_edge, smoothstep(0.08, 0.28, d) * 0.8);
      bandCol *= (0.72 + 0.45 * n) * mix(1.0, 0.5, smoothstep(0.1, 0.5, d));
      col = mix(col, bandCol, smoothstep(-0.01, 0.02, d));
      float dDune = q.y - duneCrest;
      vec3 dune = u_deep * (0.8 + 0.8 * n) + u_edge * 0.28 * exp(-max(dDune, 0.0) * 22.0) + u_main * 0.18 * exp(-max(dDune, 0.0) * 60.0);
      col = mix(col, dune, smoothstep(-0.01, 0.02, dDune));

      // The words stay clear: the wall dims to unlit LEDs behind the copy.
      vec2 h = (c - u_hole.xy) / u_hole.zw;
      col *= mix(0.12, 1.0, smoothstep(0.55, 1.2, length(h)));

      // Power-on: rows light from the bottom up behind a bright scan line.
      float row = 1.0 - c.y / u_res.y;
      float sweep = u_power * 1.2;
      col *= smoothstep(row - 0.02, row + 0.12, sweep);
      col += u_hot * exp(-pow((row - sweep + 0.04) / 0.035, 2.0)) * (1.0 - u_power) * 0.55;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // Pass 2: round LEDs, each lit by its texel, with a little bloom.
  const DOTS = `
    precision highp float;
    uniform sampler2D u_field;
    uniform vec2 u_cells;
    uniform float u_pitch;
    uniform vec2 u_margin;
    uniform vec2 u_res;
    uniform vec3 u_off;
    void main() {
      vec2 lp = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
      vec2 cell = floor((lp - u_margin) / u_pitch);
      if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= u_cells.x || cell.y >= u_cells.y) discard;
      vec2 c = u_margin + (cell + 0.5) * u_pitch;
      vec3 col = texture2D(u_field, vec2((cell.x + 0.5) / u_cells.x, 1.0 - (cell.y + 0.5) / u_cells.y)).rgb;
      float lum = max(col.r, max(col.g, col.b));
      float d = length(lp - c);
      float r = u_pitch * 0.41;
      float aa = 0.9;
      float dotMask = 1.0 - smoothstep(r - aa, r + aa, d);
      float k = clamp(d / r, 0.0, 1.0);
      vec3 rgb = max(col * (1.0 - 0.32 * k * k), u_off) * dotMask;
      rgb += col * exp(-(d * d) / (u_pitch * u_pitch * 0.34)) * lum * 0.3;
      gl_FragColor = vec4(rgb, clamp(max(rgb.r, max(rgb.g, rgb.b)), 0.0, 1.0));
    }`;

  function program(fragment) {
    const make = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
    const vs = make(gl.VERTEX_SHADER, VERTEX); const fs = make(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    const u = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u, pos: gl.getAttribLocation(p, 'a_pos') };
  }
  const field = program(FIELD);
  const dots = program(DOTS);
  if (!field || !dots) return;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();

  hero.prepend(canvas);
  hero.classList.add('has-led');

  const size = { w: 1, h: 1, dpr: 1, pitch: 12, cols: 1, rows: 1, margin: [0, 0], unit: 1, crest: 0.6, rise: 0.3, flat: 1, xfreq: 1, amp: 1, dune: 0.21, hole: [0, 0, 1, 1] };
  const boxOf = (nodes) => {
    const rects = nodes.filter(Boolean).map((node) => node.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left)); const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top)); const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, top, width: right - left, height: bottom - top };
  };
  function measure() {
    const rect = hero.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssPitch = rect.width < 700 ? 9 : 12;
    size.dpr = dpr;
    size.w = Math.max(1, Math.round(rect.width * dpr));
    size.h = Math.max(1, Math.round(rect.height * dpr));
    size.pitch = Math.round(cssPitch * dpr);
    size.cols = Math.ceil(size.w / size.pitch);
    size.rows = Math.ceil(size.h / size.pitch);
    size.margin = [((size.w - size.cols * size.pitch) / 2), ((size.h - size.rows * size.pitch) / 2)];
    size.unit = Math.max(600, Math.min(window.innerHeight, 1000)) * dpr;
    const narrow = rect.width < 700;
    const pick = (sel) => copy.querySelector(sel);
    if (narrow) {
      // Phone: the crest sits just inside the top of the buttons, so the band
      // flows behind them, and the dark dunes rise to just under the second
      // button so the small print below sits on unlit LEDs. Waves are tighter
      // across and lower, so the crest never climbs into the lede.
      const actions = pick('.hero-actions') || band;
      const actionsBox = actions.getBoundingClientRect();
      size.crest = ((actionsBox.top - rect.top) + 22) * dpr / size.unit;
      size.dune = ((actionsBox.height - 14) * dpr) / size.unit;
      size.rise = 0;
      size.flat = size.w;
      size.xfreq = 2.4;
      size.amp = 0.4;
    } else {
      // Wide: in the middle the crest runs under the assurances, behind the
      // window's top, and it rises only in the room beside the copy. The
      // rise scales with that room, so a narrow laptop gets a gentle lift
      // instead of a steep wall at its edges.
      size.crest = ((band.getBoundingClientRect().bottom - rect.top + 110) * dpr) / size.unit;
      const lines = ['h1', '.hero-lede', '.hero-actions', '.assurances', '.microcopy'].map(pick).filter(Boolean);
      const widest = Math.max(...lines.map((node) => node.getBoundingClientRect().width), 320);
      const flat = widest / 2 + 56;
      const room = rect.width / 2 - flat;
      size.flat = flat * dpr;
      size.rise = 0.42 * Math.max(0, Math.min(1, room / 340));
      size.xfreq = 1;
      size.amp = 1;
      size.dune = 0.21;
    }
    // The wall dims to unlit LEDs behind the words: on a phone only the chip,
    // headline and lede (the band is meant to show behind the buttons); on a
    // wide screen the whole block of copy.
    const box = narrow ? boxOf([pick('.hero-chip'), pick('h1'), pick('.hero-lede')]) : copy.getBoundingClientRect();
    size.hole = narrow
      ? [(box.left + box.width / 2 - rect.left) * dpr, (box.top + box.height / 2 - rect.top) * dpr, Math.max(box.width * 0.6, 200) * dpr, (box.height * 0.6 + 28) * dpr]
      : [(box.left + box.width / 2 - rect.left) * dpr, (box.top + box.height * 0.42 - rect.top) * dpr, Math.max(box.width * 0.5, 260) * dpr, Math.max(box.height * 0.62, 220) * dpr];
    if (canvas.width !== size.w || canvas.height !== size.h) { canvas.width = size.w; canvas.height = size.h; }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.cols, size.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  let time = 11;
  let power = still.matches ? 1 : 0;
  function draw() {
    const [back, main, hot, edge, deep] = PALETTE;
    // Pass 1 into the per-LED texture.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, size.cols, size.rows);
    gl.useProgram(field.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(field.pos);
    gl.vertexAttribPointer(field.pos, 2, gl.FLOAT, false, 0, 0);
    const fu = field.u;
    gl.uniform2f(fu.u_cells, size.cols, size.rows);
    gl.uniform1f(fu.u_pitch, size.pitch);
    gl.uniform2f(fu.u_margin, size.margin[0], size.margin[1]);
    gl.uniform1f(fu.u_unit, size.unit);
    gl.uniform1f(fu.u_crest, size.crest);
    gl.uniform1f(fu.u_rise, size.rise);
    gl.uniform3f(fu.u_span, size.w / 2, size.w / 2, size.flat);
    gl.uniform1f(fu.u_xfreq, size.xfreq);
    gl.uniform1f(fu.u_amp, size.amp);
    gl.uniform1f(fu.u_dune, size.dune);
    gl.uniform1f(fu.u_time, time);
    gl.uniform4f(fu.u_hole, size.hole[0], size.hole[1], size.hole[2], size.hole[3]);
    gl.uniform1f(fu.u_power, power);
    gl.uniform2f(fu.u_res, size.w, size.h);
    gl.uniform3fv(fu.u_back, back); gl.uniform3fv(fu.u_main, main); gl.uniform3fv(fu.u_hot, hot);
    gl.uniform3fv(fu.u_edge, edge); gl.uniform3fv(fu.u_deep, deep);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Pass 2: the dots, full size.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size.w, size.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(dots.p);
    gl.enableVertexAttribArray(dots.pos);
    gl.vertexAttribPointer(dots.pos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const du = dots.u;
    gl.uniform1i(du.u_field, 0);
    gl.uniform2f(du.u_cells, size.cols, size.rows);
    gl.uniform1f(du.u_pitch, size.pitch);
    gl.uniform2f(du.u_margin, size.margin[0], size.margin[1]);
    gl.uniform2f(du.u_res, size.w, size.h);
    gl.uniform3fv(du.u_off, deep.map((v) => 0.032 + v * 0.3));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let running = false; let last = 0; let inView = true; let powerStart = 0;
  function frame(now) {
    if (!running) return;
    if (!inView || document.hidden) { running = false; return; }
    window.requestAnimationFrame(frame);
    if (last && now - last < 1000 / FPS - 2) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!still.matches) time += dt;
    if (power < 1) {
      if (!powerStart) powerStart = now;
      const k = Math.min(1, (now - powerStart) / 1400);
      power = 1 - Math.pow(1 - k, 3);
    }
    draw();
    if (still.matches && power >= 1) running = false;
  }
  function start() {
    if (running || !inView || document.hidden) return;
    running = true; last = 0;
    window.requestAnimationFrame(frame);
  }

  measure();
  if (still.matches) draw();
  new ResizeObserver(() => { measure(); draw(); }).observe(hero);
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; start(); }).observe(hero);
  document.addEventListener('visibilitychange', start);
  still.addEventListener('change', () => { if (still.matches) { power = 1; draw(); } start(); });
  start();
})();
