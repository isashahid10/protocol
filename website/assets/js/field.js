/**
 * Hero field: an animated topographic contour map drawn with marching squares
 * over evolving simplex noise, with tracked field stations overlaid.
 * Pauses offscreen and when the tab is hidden. Renders one still frame when
 * the visitor prefers reduced motion.
 */

/* ---------- 2D simplex noise (after Stefan Gustavson, public domain) ---------- */

function createNoise(seed = 7) {
  const grad = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return function noise(xin, yin) {
    const s2 = (xin + yin) * F2;
    const i = Math.floor(xin + s2);
    const j = Math.floor(yin + s2);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = grad[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = grad[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = grad[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * n; // roughly -1..1
  };
}

/* ---------- Stations shown on the map ---------- */

const STATIONS = [
  { id: "SOL-214", rx: 0.62, ry: 0.22, label: "SOIL", unit: "% VWC", base: 27.8, spread: 0.6, dp: 1 },
  { id: "BIO-071", rx: 0.84, ry: 0.36, label: "ACOUSTIC", unit: " SPP", base: 23, spread: 2, dp: 0 },
  { id: "H2O-118", rx: 0.73, ry: 0.58, label: "NO₃", unit: " mg/L", base: 2.1, spread: 0.15, dp: 2 },
  { id: "CAN-044", rx: 0.47, ry: 0.4, label: "NDVI", unit: "", base: 0.81, spread: 0.02, dp: 2 },
  { id: "AIR-302", rx: 0.9, ry: 0.14, label: "PM2.5", unit: " µg/m³", base: 38, spread: 3, dp: 0 },
];

export function initField(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const noise = createNoise(11);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const CELL = 14;
  const LEVELS = [];
  for (let v = -0.84; v <= 0.84; v += 0.12) LEVELS.push(+v.toFixed(2));
  const ACCENT_LEVEL = 7; // index into LEVELS drawn in the accent colour

  let w = 0;
  let h = 0;
  let cols = 0;
  let rows = 0;
  let field = new Float32Array(0);
  let colors = readColors();
  let running = false;
  let visible = true;
  let rafId = 0;
  let last = 0;
  let t = Math.random() * 100;
  const readings = STATIONS.map((s) => s.base);
  let lastReading = 0;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    return {
      ink: cs.getPropertyValue("--ink-rgb").trim() || "229, 232, 220",
      accent: cs.getPropertyValue("--accent-rgb").trim() || "197, 239, 106",
      mono: cs.getPropertyValue("--font-mono").trim() || "monospace",
      canvas: cs.getPropertyValue("--canvas").trim() || "#0e120f",
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / CELL) + 1;
    rows = Math.ceil(h / CELL) + 1;
    field = new Float32Array(cols * rows);
  }

  function sample(time) {
    const s = 0.0026;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * CELL;
        const py = y * CELL;
        const v =
          noise(px * s + time * 0.018, py * s - time * 0.006) * 0.72 +
          noise(px * s * 2.3 - time * 0.011, py * s * 2.3 + 40) * 0.28;
        field[y * cols + x] = v;
      }
    }
  }

  function lerp(a, b, level) {
    const d = b - a;
    return d === 0 ? 0.5 : (level - a) / d;
  }

  function drawContours() {
    for (let li = 0; li < LEVELS.length; li++) {
      const level = LEVELS[li];
      const isIndex = li % 4 === 0;
      const isAccent = li === ACCENT_LEVEL;
      ctx.beginPath();
      for (let y = 0; y < rows - 1; y++) {
        const y0 = y * CELL;
        for (let x = 0; x < cols - 1; x++) {
          const i = y * cols + x;
          const a = field[i];
          const b = field[i + 1];
          const c = field[i + cols + 1];
          const d = field[i + cols];
          let idx = 0;
          if (a > level) idx |= 8;
          if (b > level) idx |= 4;
          if (c > level) idx |= 2;
          if (d > level) idx |= 1;
          if (idx === 0 || idx === 15) continue;

          const x0 = x * CELL;
          // edge points: top, right, bottom, left
          const tx = x0 + CELL * lerp(a, b, level);
          const ry = y0 + CELL * lerp(b, c, level);
          const bx = x0 + CELL * lerp(d, c, level);
          const ly = y0 + CELL * lerp(a, d, level);
          const x1 = x0 + CELL;
          const y1 = y0 + CELL;

          switch (idx) {
            case 1: case 14: ctx.moveTo(x0, ly); ctx.lineTo(bx, y1); break;
            case 2: case 13: ctx.moveTo(bx, y1); ctx.lineTo(x1, ry); break;
            case 3: case 12: ctx.moveTo(x0, ly); ctx.lineTo(x1, ry); break;
            case 4: case 11: ctx.moveTo(tx, y0); ctx.lineTo(x1, ry); break;
            case 6: case 9: ctx.moveTo(tx, y0); ctx.lineTo(bx, y1); break;
            case 7: case 8: ctx.moveTo(x0, ly); ctx.lineTo(tx, y0); break;
            case 5:
              ctx.moveTo(x0, ly); ctx.lineTo(tx, y0);
              ctx.moveTo(bx, y1); ctx.lineTo(x1, ry);
              break;
            case 10:
              ctx.moveTo(tx, y0); ctx.lineTo(x1, ry);
              ctx.moveTo(x0, ly); ctx.lineTo(bx, y1);
              break;
          }
        }
      }
      if (isAccent) {
        ctx.strokeStyle = `rgba(${colors.accent}, 0.75)`;
        ctx.lineWidth = 1.2;
      } else if (isIndex) {
        ctx.strokeStyle = `rgba(${colors.ink}, 0.34)`;
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = `rgba(${colors.ink}, 0.13)`;
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();
    }
  }

  function drawStations(time, now) {
    const narrow = w < 720;
    const size = narrow ? 44 : 60;
    const corner = 9;
    ctx.font = `${narrow ? 9 : 10.5}px ${colors.mono}`;
    ctx.textBaseline = "alphabetic";

    if (now - lastReading > 1400) {
      lastReading = now;
      STATIONS.forEach((s, i) => {
        readings[i] = s.base + (Math.random() * 2 - 1) * s.spread;
      });
    }

    STATIONS.forEach((s, i) => {
      if (narrow && i > 2) return;
      const rx = narrow ? 0.3 + s.rx * 0.6 : s.rx;
      const ry = narrow ? 0.08 + s.ry * 0.5 : s.ry;
      const cx = rx * w + Math.sin(time * 0.3 + i * 1.7) * 8;
      const cy = ry * h + Math.cos(time * 0.24 + i * 2.1) * 6;
      const half = size / 2;
      const x0 = cx - half;
      const y0 = cy - half;

      // corner brackets
      ctx.strokeStyle = `rgba(${colors.ink}, 0.85)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + corner); ctx.lineTo(x0, y0); ctx.lineTo(x0 + corner, y0);
      ctx.moveTo(x0 + size - corner, y0); ctx.lineTo(x0 + size, y0); ctx.lineTo(x0 + size, y0 + corner);
      ctx.moveTo(x0 + size, y0 + size - corner); ctx.lineTo(x0 + size, y0 + size); ctx.lineTo(x0 + size - corner, y0 + size);
      ctx.moveTo(x0 + corner, y0 + size); ctx.lineTo(x0, y0 + size); ctx.lineTo(x0, y0 + size - corner);
      ctx.stroke();

      // crosshair
      ctx.strokeStyle = `rgba(${colors.ink}, 0.35)`;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
      ctx.stroke();

      // pulsing core
      const pulse = (Math.sin(time * 2 + i) + 1) / 2;
      ctx.fillStyle = `rgba(${colors.accent}, 1)`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${colors.accent}, ${0.5 * (1 - pulse)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();

      // label
      const value = readings[i].toFixed(s.dp);
      const line1 = s.id;
      const line2 = `${s.label} ${value}${s.unit}`;
      const pad = 5;
      const tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + pad * 2;
      const lh = narrow ? 12 : 14;
      const lx = x0;
      const ly = y0 - lh * 2 - 6;
      ctx.fillStyle = `rgba(${colors.ink}, 0.92)`;
      ctx.fillRect(lx, ly, tw, lh * 2 + 2);
      ctx.fillStyle = colors.canvas;
      ctx.fillText(line1, lx + pad, ly + lh - 3);
      ctx.fillText(line2, lx + pad, ly + lh * 2 - 2);
    });
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    // ~30fps is plenty for slow terrain
    if (now - last < 33) return;
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    t += dt;
    render(now);
  }

  function render(now = performance.now()) {
    ctx.clearRect(0, 0, w, h);
    sample(t);
    drawContours();
    drawStations(t, now);
  }

  function start() {
    if (running || reduceMotion.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  resize();
  render();
  start();

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      render();
    }, 120);
  });

  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      visible ? start() : stop();
    },
    { threshold: 0 }
  ).observe(canvas);

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener?.("change", () => {
    if (reduceMotion.matches) {
      stop();
      render();
    } else start();
  });

  // Repaint once web fonts are ready so labels use Geist Mono.
  document.fonts?.ready.then(() => {
    colors = readColors();
    if (!running) render();
  });

  return {
    refresh() {
      colors = readColors();
      if (!running) render();
    },
  };
}
