/* ElectroPlate site — the app's LED displays, one per build state.
 *
 * A port of renderer/matrix.js from the app: a corner patch of round LEDs
 * showing slow layered light that dissolves into the display. Each tile holds
 * one state's shade. One WebGL context draws every tile in turn; drawing
 * pauses off screen and in a hidden tab, and holds a still frame for reduced
 * motion. Hovering a tile sends a ripple out of its corner, as a written file
 * does in the app. Changing a tile's data-shade cross-fades it to the new
 * state's shade, as the hero's build readout does stage by stage.
 */
(() => {
  const tiles = Array.from(document.querySelectorAll('[data-shade]'));
  if (!tiles.length) return;

  // [back layer, band, crest, band's lower edge, dune and sky] — as in the app.
  const PALETTES = {
    idle:     ['#123f9c', '#1b4fd1', '#d8f8ff', '#138ea6', '#081a4c'],
    generate: ['#0a4f86', '#00a4bb', '#c4fbff', '#006a86', '#032b3a'],
    review:   ['#2b2f9a', '#a351fb', '#f1e0ff', '#6a2bd4', '#1c0f45'],
    install:  ['#4a1d8a', '#f0309d', '#ffd3ec', '#a51c78', '#330a2a'],
    launch:   ['#123f9c', '#257ef8', '#d6eaff', '#1d52c8', '#081a4c'],
    repair:   ['#6b3208', '#ff7a00', '#ffd84a', '#e0301e', '#2a1206'],
    error:    ['#5a0f16', '#e3141e', '#ffb347', '#8f0c16', '#240709'],
    good:     ['#1497b8', '#ff7f11', '#ffc870', '#b3161e', '#2e2150']
  };
  const TONES = {
    idle:     { energy: 0.85, speed: 0.45, halftone: 1 },
    generate: { energy: 1, speed: 1, halftone: 0 },
    review:   { energy: 1, speed: 1, halftone: 0 },
    install:  { energy: 1, speed: 1.1, halftone: 0 },
    launch:   { energy: 1, speed: 1.1, halftone: 0 },
    repair:   { energy: 1, speed: 1.35, halftone: 0 },
    error:    { energy: 0.85, speed: 0.4, halftone: 0.35 },
    good:     { energy: 0.9, speed: 0.5, halftone: 0 }
  };
  const PITCH = 5;            // LED spacing, CSS px
  const REACH = [230, 150];   // patch radii, CSS px
  const SHARE = [0.66, 0.78]; // ...capped by share of the tile
  const FPS = 30;

  const FRAGMENT = `
    precision highp float;
    uniform vec2 u_res;
    uniform float u_pitch, u_time, u_seed, u_gain, u_halftone, u_pulse;
    uniform vec2 u_corner, u_radii;
    uniform vec3 u_back, u_main, u_hot, u_edge, u_deep, u_off;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
    vec3 field(vec2 p, float t, float lvl) {
      float s = u_seed;
      float n = fbm(p * vec2(2.1, 3.2) + vec2(t * 0.07 + s, -t * 0.045));
      float x = p.x;
      float yBack  = lvl + 0.30 + 0.09 * sin(x * 1.40 + t * 0.23 + s) + 0.05 * sin(x * 3.3 - t * 0.31) + 0.07 * (n - 0.5);
      float yBand  = lvl        + 0.11 * sin(x * 1.90 - t * 0.29 + 1.3 + s) + 0.05 * sin(x * 4.6 + t * 0.43) + 0.10 * (n - 0.5);
      float yFront = lvl - 0.36 + 0.10 * sin(x * 1.15 + t * 0.19 + 2.1 + s) + 0.06 * sin(x * 3.9 - t * 0.27) + 0.05 * (n - 0.5);
      vec3 col = u_deep * (0.35 + 0.7 * n);
      float dBack = yBack - p.y;
      col = mix(col, u_back * (0.5 + 0.6 * n) * (0.6 + 0.4 * exp(-max(dBack, 0.0) * 3.0)), smoothstep(-0.012, 0.02, dBack));
      float dBand = yBand - p.y;
      vec3 band = mix(u_hot, u_main, smoothstep(0.0, 0.14, dBand));
      band = mix(band, u_edge, smoothstep(0.14, 0.42, dBand) * 0.75);
      band *= (0.72 + 0.5 * n) * mix(1.0, 0.6, smoothstep(0.12, 0.7, dBand));
      col = mix(col, band, smoothstep(-0.012, 0.02, dBand));
      float dFront = yFront - p.y;
      vec3 dune = u_deep * (0.55 + 0.7 * n) + u_edge * 0.35 * (0.5 + n) * exp(-max(dFront, 0.0) * 7.0) + u_main * 0.4 * exp(-max(dFront, 0.0) * 18.0);
      return mix(col, dune, smoothstep(-0.012, 0.02, dFront));
    }
    void main() {
      vec2 lp = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
      vec2 margin = mod(u_res, u_pitch) * 0.5;
      vec2 c = margin + (floor((lp - margin) / u_pitch) + 0.5) * u_pitch;
      vec2 rel = (c - u_corner) / u_radii;
      float e = length(rel);
      float wobble = noise(c / u_radii.y * 2.4 + vec2(u_time * 0.12, u_seed));
      float edge = 1.0 + 0.1 * sin(atan(rel.y, rel.x) * 3.0 + u_time * 0.35 + u_seed) + 0.16 * (wobble - 0.5);
      float area = 1.0 - smoothstep(edge * 0.4, edge, e);
      float ring = u_pulse > 0.001 ? exp(-pow((e - (1.0 - u_pulse) * 1.15) / 0.08, 2.0)) * u_pulse * (1.0 - smoothstep(0.9, 1.5, e)) : 0.0;
      if (area < 0.003 && ring < 0.003) discard;
      vec2 p = vec2(c.x, abs(c.y - u_corner.y)) / u_radii.y;
      vec3 col = field(p, u_time, 0.45) * u_gain * area + u_hot * ring * 0.85 * u_gain;
      float lum = max(col.r, max(col.g, col.b));
      float d = length(lp - c);
      float fade = mix(0.4, 1.0, smoothstep(0.0, 0.55, area));
      float r = u_pitch * fade * mix(0.41, mix(0.14, 0.47, sqrt(clamp(lum, 0.0, 1.0))), u_halftone);
      float aa = 0.8;
      float dotMask = 1.0 - smoothstep(r - aa, r + aa, d);
      float offR = u_pitch * 0.34 * fade;
      float offMask = (1.0 - smoothstep(offR - aa, offR + aa, d)) * smoothstep(0.0, 0.35, area);
      float k = clamp(d / max(r, 0.001), 0.0, 1.0);
      vec3 rgb = max(col * (1.0 - 0.3 * k * k) * dotMask, u_off * offMask);
      rgb += col * exp(-(d * d) / (u_pitch * u_pitch * 0.4)) * lum * 0.22;
      gl_FragColor = vec4(rgb, clamp(max(rgb.r, max(rgb.g, rgb.b)), 0.0, 1.0));
    }`;

  const glCanvas = document.createElement('canvas');
  const gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return;
  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
  const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }');
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const info = gl.getActiveUniform(program, i);
    u[info.name] = gl.getUniformLocation(program, info.name);
  }
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.SCISSOR_TEST);

  const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  const displays = tiles.map((tile, i) => {
    const tone = TONES[tile.dataset.shade] ? tile.dataset.shade : 'idle';
    const canvas = document.createElement('canvas');
    canvas.className = 'shade-led';
    canvas.setAttribute('aria-hidden', 'true');
    tile.prepend(canvas);
    const d = { tile, canvas, ctx: canvas.getContext('2d'), tone, palette: PALETTES[tone].map(rgb), from: null, to: null, fadeStart: 0,
      energy: TONES[tone].energy, halftone: TONES[tone].halftone, seed: i * 1.37 + 0.4, time: 7 + i * 5.3, pulse: 0, pulseStart: 0, w: 1, h: 1, dpr: 1, visible: false };
    if (!tile.hasAttribute('data-shade-still')) {
      tile.addEventListener('pointerenter', () => { if (!still.matches) { d.pulseStart = performance.now(); start(); } });
    }
    new MutationObserver(() => retone(d, tile.dataset.shade)).observe(tile, { attributes: true, attributeFilter: ['data-shade'] });
    return d;
  });

  // A new state fades in over FADE_MS: colours, brightness and halftone together.
  const FADE_MS = 650;
  function retone(d, tone) {
    if (!TONES[tone] || tone === d.tone) return;
    d.from = { palette: d.palette, energy: d.energy, halftone: d.halftone };
    d.to = { palette: PALETTES[tone].map(rgb), energy: TONES[tone].energy, halftone: TONES[tone].halftone };
    d.tone = tone;
    d.fadeStart = performance.now();
    start();
  }
  function fade(d, now) {
    if (!d.fadeStart) return;
    const t = still.matches ? 1 : Math.min(1, (now - d.fadeStart) / FADE_MS);
    const e = 1 - Math.pow(1 - t, 3);
    const mix = (a, b) => a + (b - a) * e;
    d.palette = d.to.palette.map((c, i) => c.map((v, j) => mix(d.from.palette[i][j], v)));
    d.energy = mix(d.from.energy, d.to.energy);
    d.halftone = mix(d.from.halftone, d.to.halftone);
    if (t >= 1) d.fadeStart = 0;
  }

  function measure() {
    for (const d of displays) {
      const rect = d.tile.getBoundingClientRect();
      d.dpr = Math.min(window.devicePixelRatio || 1, 2);
      d.w = Math.max(1, Math.round(rect.width * d.dpr));
      d.h = Math.max(1, Math.round(rect.height * d.dpr));
      if (d.canvas.width !== d.w || d.canvas.height !== d.h) { d.canvas.width = d.w; d.canvas.height = d.h; }
    }
  }

  function draw(d) {
    if (glCanvas.width < d.w || glCanvas.height < d.h) {
      glCanvas.width = Math.max(glCanvas.width, d.w);
      glCanvas.height = Math.max(glCanvas.height, d.h);
    }
    const rx = Math.min(d.w * SHARE[0], REACH[0] * d.dpr);
    const ry = Math.min(d.h * SHARE[1], REACH[1] * d.dpr);
    const out = d.pulse > 0.001 ? 1.55 : 1.2;
    const bx = Math.round(Math.max(0, d.w - rx * out));
    const by = Math.round(Math.max(0, d.h - ry * out));
    const bw = d.w - bx, bh = d.h - by;
    const [back, main, hot, edge, deep] = d.palette;
    gl.viewport(0, 0, d.w, d.h);
    gl.scissor(bx, 0, bw, bh);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_res, d.w, d.h);
    gl.uniform1f(u.u_pitch, Math.max(3, Math.round(PITCH * d.dpr)));
    gl.uniform1f(u.u_time, d.time);
    gl.uniform1f(u.u_seed, d.seed);
    gl.uniform1f(u.u_gain, d.energy);
    gl.uniform1f(u.u_halftone, d.halftone);
    gl.uniform1f(u.u_pulse, d.pulse);
    gl.uniform2f(u.u_corner, d.w, d.h);
    gl.uniform2f(u.u_radii, rx, ry);
    gl.uniform3fv(u.u_back, back); gl.uniform3fv(u.u_main, main); gl.uniform3fv(u.u_hot, hot);
    gl.uniform3fv(u.u_edge, edge); gl.uniform3fv(u.u_deep, deep);
    gl.uniform3fv(u.u_off, deep.map((v) => 0.045 + v * 0.3));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    d.ctx.clearRect(0, 0, d.w, d.h);
    d.ctx.drawImage(glCanvas, bx, glCanvas.height - d.h + by, bw, bh, bx, by, bw, bh);
  }

  let running = false; let inView = false; let last = 0;
  function frame(now) {
    if (!running) return;
    if (!inView || document.hidden) { running = false; return; }
    window.requestAnimationFrame(frame);
    if (last && now - last < 1000 / FPS - 2) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    for (const d of displays) {
      if (!d.visible) continue;
      fade(d, now);
      if (!still.matches) d.time += dt * TONES[d.tone].speed;
      const age = d.pulseStart ? (now - d.pulseStart) / 1400 : 1;
      d.pulse = age < 1 ? 1 - (1 - Math.pow(1 - age, 3)) : 0;
      if (age >= 1) d.pulseStart = 0;
      draw(d);
    }
    if (still.matches && !displays.some((d) => d.pulseStart || d.fadeStart)) running = false;
  }
  function start() {
    if (running || !inView) return;
    running = true; last = 0;
    window.requestAnimationFrame(frame);
  }

  measure();
  const resize = new ResizeObserver(() => { measure(); displays.filter((d) => d.visible).forEach(draw); });
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const d = displays.find((x) => x.tile === entry.target);
      if (d) d.visible = entry.isIntersecting;
    }
    inView = displays.some((d) => d.visible);
    if (inView) start();
  }, { rootMargin: '120px 0px' });
  for (const d of displays) { resize.observe(d.tile); seen.observe(d.tile); }
  document.addEventListener('visibilitychange', start);
  still.addEventListener('change', start);
})();
