/**
 * Hero scene: an egocentric (first person) view of a drone repair, drawn the
 * way our annotation tools see it. Two tracked hand skeletons (21 keypoints
 * each), a segmented quadcopter, a screwdriver, the operator's gaze and the
 * current action label, all moving live.
 * Pauses offscreen and when the tab is hidden. One still frame for reduced motion.
 */

/* ---------- Hand model (shared shape with the annotation mockups) ---------- */

const FINGERS = {
  thumb: [[-22, -12], [-38, -30], [-48, -46], [-55, -60]],
  index: [[-14, -58], [-17, -84], [-19, -100], [-20, -114]],
  middle: [[0, -62], [0, -90], [0, -108], [0, -123]],
  ring: [[13, -58], [15, -83], [16, -99], [17, -112]],
  pinky: [[25, -50], [30, -68], [33, -80], [35, -91]],
};
const CURL_K = [0, 0.38, 0.6, 0.74];
const THUMB_K = [0, 0.25, 0.45, 0.6];
const THUMB_TARGET = [-8, -44];

export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = new Set([4, 8, 12, 16, 20]);

function handPose(curl, thumbCurl) {
  const pts = [[0, 0]];
  FINGERS.thumb.forEach(([x, y], i) => {
    const k = thumbCurl * THUMB_K[i];
    pts.push([x + (THUMB_TARGET[0] - x) * k, y + (THUMB_TARGET[1] - y) * k]);
  });
  ["index", "middle", "ring", "pinky"].forEach((name) => {
    const f = FINGERS[name];
    const [bx, by] = f[0];
    f.forEach(([x, y], i) => {
      const s = 1 - curl * CURL_K[i];
      pts.push([bx + (x - bx) * s, by + (y - by) * s]);
    });
  });
  return pts;
}

function place(pts, { x, y, rot, scale, mirror }) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return pts.map(([px, py]) => {
    const mx = (mirror ? -px : px) * scale;
    const my = py * scale;
    return [x + mx * c - my * s, y + mx * s + my * c];
  });
}

/* ---------- Scene constants (scene units, origin at drone centre) ---------- */

const ROTORS = [
  { x: -150, y: -72, prop: false }, // front left: prop removed for repair
  { x: 150, y: -72, prop: true },
  { x: -170, y: 62, prop: true },
  { x: 170, y: 62, prop: true },
];
const SCREW = [100, 39];
const DRONE_BOX = [-236, -104, 472, 196];

// Story loop (seconds): align, fasten, inspect.
const LOOP = 9;
const PHASES = [
  { until: 3, label: "align bit to screw", gaze: "screw" },
  { until: 6.5, label: "fasten M2 screw", gaze: "screw" },
  { until: 9, label: "inspect front rotor", gaze: "rotor" },
];

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function initHands(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let w = 0;
  let h = 0;
  let colors = readColors();
  let running = false;
  let visible = true;
  let rafId = 0;
  let last = 0;
  let t = 1.2;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    return {
      ink: cs.getPropertyValue("--ink-rgb").trim() || "229, 232, 220",
      accent: cs.getPropertyValue("--accent-rgb").trim() || "197, 239, 106",
      canvas: cs.getPropertyValue("--canvas").trim() || "#0e120f",
      accentInk: cs.getPropertyValue("--accent-ink").trim() || "#0e120f",
      mono: cs.getPropertyValue("--font-mono").trim() || "monospace",
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
  }

  const ink = (a) => `rgba(${colors.ink}, ${a})`;
  const acc = (a) => `rgba(${colors.accent}, ${a})`;

  function layout() {
    const narrow = w < 820;
    const s = narrow ? Math.min(w * 0.86, 520) / 760 : Math.min(w * 0.4, h * 0.78) / 640;
    const cx = narrow ? w * 0.52 : w * 0.74;
    const cy = narrow ? Math.min(h * 0.25, 230) : h * 0.36;
    return { s, cx, cy, narrow };
  }

  /* ---------- drawing helpers ---------- */

  function brackets(x, y, bw, bh, c = 10, color = ink(0.85)) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
    ctx.moveTo(x + bw - c, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + c);
    ctx.moveTo(x + bw, y + bh - c); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw - c, y + bh);
    ctx.moveTo(x + c, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, y + bh - c);
    ctx.stroke();
  }

  function tag(x, y, text, accent = false, fs = 10.5) {
    ctx.font = `${fs}px ${colors.mono}`;
    const pad = 5;
    const tw = ctx.measureText(text).width + pad * 2;
    const th = fs + 7;
    ctx.fillStyle = accent ? acc(1) : ink(0.92);
    ctx.fillRect(x, y - th, tw, th);
    ctx.fillStyle = accent ? colors.accentInk : colors.canvas;
    ctx.fillText(text, x + pad, y - 5);
    return tw;
  }

  function drawGrid() {
    // Workbench surface seen from the operator's eyes.
    const horizon = h * 0.02;
    const vpX = w * 0.62;
    const vpY = -h * 0.55;
    ctx.strokeStyle = ink(0.07);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k <= 16; k++) {
      const tt = k / 16;
      const y = horizon + (h - horizon) * tt * tt;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    for (let i = -14; i <= 14; i++) {
      const bx = vpX + i * (w / 9);
      ctx.moveTo(vpX + (bx - vpX) * 0.05, vpY + (h - vpY) * 0.05);
      ctx.lineTo(bx, h);
    }
    ctx.stroke();
  }

  function drawDrone(P, s) {
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ink(0.9);
    // arms
    ctx.beginPath();
    [[-40, -20], [40, -20], [-40, 20], [40, 20]].forEach(([ax, ay], i) => {
      const r = ROTORS[i];
      const a = P(ax, ay);
      const b = P(r.x, r.y);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    });
    ctx.stroke();
    // body
    const [bx, by] = P(-50, -28);
    ctx.fillStyle = colors.canvas;
    ctx.beginPath();
    ctx.roundRect(bx, by, 100 * s, 56 * s, 12 * s);
    ctx.fill();
    ctx.stroke();
    const [ix, iy] = P(-30, -14);
    ctx.strokeStyle = ink(0.45);
    ctx.beginPath();
    ctx.roundRect(ix, iy, 60 * s, 28 * s, 6 * s);
    ctx.stroke();
    const cam = P(0, -36);
    ctx.beginPath();
    ctx.arc(cam[0], cam[1], 5 * s, 0, Math.PI * 2);
    ctx.stroke();
    // rotors
    ROTORS.forEach((r, i) => {
      const [rx, ry] = P(r.x, r.y);
      ctx.strokeStyle = ink(0.75);
      ctx.beginPath();
      ctx.ellipse(rx, ry, 60 * s, 24 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = ink(0.9);
      ctx.beginPath();
      ctx.ellipse(rx, ry, 8 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (r.prop) {
        const a = i === 3 ? 0.4 : t * (i === 1 ? 0.9 : 0.6) + i;
        ctx.strokeStyle = ink(0.55);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx - Math.cos(a) * 54 * s, ry - Math.sin(a) * 21 * s);
        ctx.lineTo(rx + Math.cos(a) * 54 * s, ry + Math.sin(a) * 21 * s);
        ctx.stroke();
        ctx.lineWidth = 1.3;
      } else {
        // removed prop shown as a ghost outline
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = acc(0.6);
        ctx.beginPath();
        ctx.ellipse(rx, ry, 52 * s, 20 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  function drawHand(pts, s, tipColor) {
    ctx.strokeStyle = ink(0.95);
    ctx.lineWidth = Math.max(1.2, 1.6 * s);
    ctx.beginPath();
    BONES.forEach(([a, b]) => {
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
    });
    ctx.stroke();
    pts.forEach(([x, y], i) => {
      const r = (TIPS.has(i) ? 3.6 : 2.6) * Math.max(0.7, s);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (TIPS.has(i)) {
        ctx.fillStyle = tipColor;
        ctx.fill();
      } else {
        ctx.fillStyle = colors.canvas;
        ctx.fill();
        ctx.strokeStyle = ink(0.95);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  function bbox(pts, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(([x, y]) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
    return [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
  }

  /* ---------- frame ---------- */

  function render() {
    ctx.clearRect(0, 0, w, h);
    const { s, cx, cy, narrow } = layout();
    const P = (x, y) => [cx + x * s, cy + y * s];
    const fs = narrow ? 9 : 10.5;

    const lt = t % LOOP;
    const phaseIdx = PHASES.findIndex((p) => lt < p.until);
    const phase = PHASES[phaseIdx];
    const phaseStart = phaseIdx ? PHASES[phaseIdx - 1].until : 0;
    const progress = (lt - phaseStart) / (phase.until - phaseStart);
    const fastenAmt = phaseIdx === 1 ? Math.min(1, Math.min(progress, 1 - progress) * 6) : 0;

    drawGrid();
    drawDrone(P, s);

    // right hand: grips the screwdriver
    const omega = Math.PI * 2 * 1.1;
    const wob = 0.25 + fastenAmt * 0.75;
    const reach = phaseIdx === 2 ? smooth(Math.min(1, progress * 3)) * (1 - smooth(Math.max(0, progress * 3 - 2))) : 0;
    const right = place(handPose(0.52 + Math.sin(t * omega) * 0.06 * wob, 0.55), {
      x: P(238 + Math.cos(t * omega) * 6 * wob + reach * 30, 34 + Math.sin(t * omega) * 4 * wob + reach * 24)[0],
      y: P(0, 34 + Math.sin(t * omega) * 4 * wob + reach * 24)[1],
      rot: (-46 + Math.sin(t * omega) * 5 * wob) * (Math.PI / 180),
      scale: 1.1 * s,
      mirror: false,
    });

    // left hand: steadies the frame near the front left rotor
    const left = place(handPose(0.22 + Math.sin(t * 0.7) * 0.03, 0.3), {
      x: P(-292 + Math.sin(t * 0.5) * 3, 0)[0],
      y: P(0, 18 + Math.cos(t * 0.6) * 3)[1],
      rot: 54 * (Math.PI / 180),
      scale: 1.1 * s,
      mirror: true,
    });

    // screwdriver from screw to the right hand's grip
    const screw = P(SCREW[0], SCREW[1]);
    const grip = [(right[4][0] + right[6][0]) / 2, (right[4][1] + right[6][1]) / 2];
    let dx = grip[0] - screw[0];
    let dy = grip[1] - screw[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const tip = reach > 0.05 ? [screw[0] + dx * reach * 40 * s, screw[1] + dy * reach * 40 * s] : screw;
    const hStart = [grip[0] - dx * 22 * s, grip[1] - dy * 22 * s];
    const hEnd = [grip[0] + dx * 34 * s, grip[1] + dy * 34 * s];
    ctx.strokeStyle = ink(0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(hStart[0], hStart[1]);
    ctx.stroke();
    ctx.lineWidth = 12 * s;
    ctx.lineCap = "round";
    ctx.strokeStyle = ink(0.28);
    ctx.beginPath();
    ctx.moveTo(hStart[0], hStart[1]);
    ctx.lineTo(hEnd[0], hEnd[1]);
    ctx.stroke();
    ctx.lineCap = "butt";

    drawHand(left, s, acc(1));
    drawHand(right, s, acc(1));

    // annotations
    const [dbx, dby] = P(DRONE_BOX[0], DRONE_BOX[1]);
    const dbw = DRONE_BOX[2] * s;
    const dbh = DRONE_BOX[3] * s;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = acc(0.55);
    ctx.lineWidth = 1;
    ctx.strokeRect(dbx, dby, dbw, dbh);
    ctx.setLineDash([]);
    tag(dbx, dby - 2, narrow ? "OBJ · quadcopter" : "OBJ · quadcopter frame · 0.97", false, fs);

    const lb = bbox(left, 12 * s);
    brackets(...lb, 10);
    tag(lb[0], lb[1] + lb[3] + fs + 10, narrow ? "HAND L" : "HAND L · 21 KP · 0.97", false, fs);
    const rb = bbox(right, 12 * s);
    brackets(...rb, 10);
    tag(rb[0], rb[1] + rb[3] + fs + 10, narrow ? "HAND R" : "HAND R · 21 KP · 0.98", false, fs);

    // screw target
    ctx.strokeStyle = acc(1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screw[0] - 9, screw[1]); ctx.lineTo(screw[0] - 3, screw[1]);
    ctx.moveTo(screw[0] + 3, screw[1]); ctx.lineTo(screw[0] + 9, screw[1]);
    ctx.moveTo(screw[0], screw[1] - 9); ctx.lineTo(screw[0], screw[1] - 3);
    ctx.moveTo(screw[0], screw[1] + 3); ctx.lineTo(screw[0], screw[1] + 9);
    ctx.stroke();

    // gaze moves between the screw and the front left rotor
    const rotor = P(ROTORS[0].x, ROTORS[0].y);
    let g = phaseIdx === 2 ? smooth(Math.min(1, progress * 2.5)) : phaseIdx === 0 ? 1 - smooth(Math.min(1, progress * 2.5)) : 0;
    if (lt < 0.01) g = 1;
    const gx = lerp(screw[0], rotor[0], g) + Math.sin(t * 3.1) * 2;
    const gy = lerp(screw[1], rotor[1], g) + Math.cos(t * 2.7) * 2;
    ctx.strokeStyle = acc(0.95);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(gx, gy, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = acc(1);
    ctx.beginPath();
    ctx.arc(gx, gy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${fs}px ${colors.mono}`;
    ctx.fillStyle = acc(1);
    ctx.fillText("GAZE", gx + 22, gy - 10);

    // current action
    const ax = dbx + dbw - (narrow ? 150 : 200);
    const ay = dby - (narrow ? 26 : 34);
    const atw = tag(ax, ay, `ACTION · ${phase.label}`, true, fs);
    ctx.fillStyle = ink(0.18);
    ctx.fillRect(ax, ay + 4, atw, 2);
    ctx.fillStyle = acc(1);
    ctx.fillRect(ax, ay + 4, atw * progress, 2);
  }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (now - last < 16) return;
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    t += dt;
    render();
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

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? start() : stop();
  }).observe(canvas);

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener?.("change", () => {
    if (reduceMotion.matches) {
      stop();
      render();
    } else start();
  });

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
