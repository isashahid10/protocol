/**
 * Animated capture rig figure. The operator's arms are solved with two bone
 * inverse kinematics every frame, so the gloved hands can fasten a screw,
 * reach for a bit and come back, while the head turns to follow the gaze and
 * the readout shows what the sensors would be recording.
 * Runs only while visible. Renders one still frame for reduced motion.
 */
import { BONES, handPose, place } from "./hands.js";

const NS = "http://www.w3.org/2000/svg";
const L1 = 120; // upper arm
const L2 = 112; // forearm
const SHOULDER = { L: [222, 272], R: [418, 272] };
const BASE = { L: [266, 488], R: [374, 486] };
const SCREW = [338, 514];
const HEAD_PIVOT = [320, 222];
const EYES = [[306, 170], [334, 170]];
const LOOP = 10;

const FINGER_BONES = BONES.filter(([a, b]) => !(a === 0 || (a === 5 && b === 9) || (a === 9 && b === 13) || (a === 13 && b === 17)));
const PALM = [0, 1, 5, 9, 13, 17];

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  parent?.append(n);
  return n;
};
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const smooth = (t) => t * t * (3 - 2 * t);
const f = (n) => n.toFixed(1);

function ik(S, T, bend) {
  let dx = T[0] - S[0];
  let dy = T[1] - S[1];
  let d = Math.hypot(dx, dy);
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1), L1 + L2 - 1);
  const a = Math.atan2(dy, dx);
  const A = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
  const ea = a + bend * A;
  const E = [S[0] + Math.cos(ea) * L1, S[1] + Math.sin(ea) * L1];
  const wa = Math.atan2(T[1] - E[1], T[0] - E[0]);
  const W = [E[0] + Math.cos(wa) * L2, E[1] + Math.sin(wa) * L2];
  return { E, W };
}

function normal(P, Q) {
  const dx = Q[0] - P[0];
  const dy = Q[1] - P[1];
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}

export function initRig(svg) {
  if (!svg) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const head = svg.querySelector("[data-rig-head]");
  const gaze = svg.querySelector("[data-rig-gaze]");
  const armsG = svg.querySelector("[data-rig-arms]");
  const imuG = svg.querySelector("[data-rig-imu]");
  const camG = svg.querySelector("[data-rig-wcam]");
  const gloveG = svg.querySelector("[data-rig-gloves]");
  const toolG = svg.querySelector("[data-rig-tool]");
  const readout = svg.querySelector("[data-rig-readout]");

  // Build the moving parts once.
  const arm = {};
  ["L", "R"].forEach((side) => {
    arm[side] = {
      fill: el("path", { class: "arm-fill" }, armsG),
      line: el("path", { class: "arm-line" }, armsG),
      sleeve: el("path", { class: "arm-sleeve" }, armsG),
      bone: el("path", { class: "arm-bone" }, armsG),
      joints: [0, 1, 2].map(() => el("circle", { class: "arm-joint", r: 3.2 }, armsG)),
      imuU: el("rect", { class: "st-fill", width: 15, height: 11, rx: 2 }, imuG),
      imuF: el("rect", { class: "st-fill", width: 14, height: 10, rx: 2 }, imuG),
      cam: el("rect", { class: "st-fill", width: 14, height: 10, rx: 2 }, camG),
      fov: el("path", { class: "st-dash st-fov" }, camG),
      gOuter: el("path", { class: "glove-o" }, gloveG),
      gInner: el("path", { class: "glove-i" }, gloveG),
      cuff: el("path", { class: "glove-cuff" }, gloveG),
      tips: [4, 8, 12, 16, 20].map(() => el("circle", { class: "glove-tip", r: 2 }, gloveG)),
    };
  });
  const shaft = el("path", { class: "tool-shaft" }, toolG);
  const handle = el("path", { class: "tool-handle" }, toolG);
  const gazeLines = [el("path", { class: "st-dash st-gaze" }, gaze), el("path", { class: "st-dash st-gaze" }, gaze)];
  const gazeDot = el("circle", { class: "gaze-dot", r: 6 }, gaze);
  const lines = readout ? Array.from(readout.querySelectorAll("tspan")) : [];

  function drawArm(side, W, handRot) {
    const a = arm[side];
    const S = SHOULDER[side];
    const { E, W: Wr } = ik(S, W, side === "L" ? 1 : -1);
    const n1 = normal(S, E);
    const n2 = normal(E, Wr);
    const nE = [(n1[0] + n2[0]) / 2, (n1[1] + n2[1]) / 2];
    const ws = 17, we = 13, ww = 9;
    const p = (P, n, w) => [P[0] + n[0] * w, P[1] + n[1] * w];
    const s1 = p(S, n1, ws), e1 = p(E, nE, we), w1 = p(Wr, n2, ww);
    const s2 = p(S, n1, -ws), e2 = p(E, nE, -we), w2 = p(Wr, n2, -ww);
    const outline = `M${f(s1[0])} ${f(s1[1])}Q${f(e1[0] + n1[0])} ${f(e1[1] + n1[1])} ${f(lerp(e1[0], w1[0], 0.15))} ${f(lerp(e1[1], w1[1], 0.15))}L${f(w1[0])} ${f(w1[1])}L${f(w2[0])} ${f(w2[1])}L${f(lerp(e2[0], w2[0], 0.15))} ${f(lerp(e2[1], w2[1], 0.15))}Q${f(e2[0] - n1[0])} ${f(e2[1] - n1[1])} ${f(s2[0])} ${f(s2[1])}`;
    a.fill.setAttribute("d", outline + "Z");
    a.line.setAttribute("d", outline);
    // t-shirt sleeve hem on the upper arm
    const sp = lerp2(S, E, 0.42);
    a.sleeve.setAttribute("d", `M${f(sp[0] + n1[0] * 18)} ${f(sp[1] + n1[1] * 18)}L${f(sp[0] - n1[0] * 18)} ${f(sp[1] - n1[1] * 18)}`);
    // mocap overlay
    a.bone.setAttribute("d", `M${f(S[0])} ${f(S[1])}L${f(E[0])} ${f(E[1])}L${f(Wr[0])} ${f(Wr[1])}`);
    [S, E, Wr].forEach((P, i) => {
      a.joints[i].setAttribute("cx", f(P[0]));
      a.joints[i].setAttribute("cy", f(P[1]));
    });
    // IMUs on the upper arm and forearm, wrist camera near the wrist
    const put = (rect, P, Q, t, w, h) => {
      const c = lerp2(P, Q, t);
      const ang = (Math.atan2(Q[1] - P[1], Q[0] - P[0]) * 180) / Math.PI - 90;
      rect.setAttribute("x", f(c[0] - w / 2));
      rect.setAttribute("y", f(c[1] - h / 2));
      rect.setAttribute("transform", `rotate(${f(ang)} ${f(c[0])} ${f(c[1])})`);
      return c;
    };
    put(a.imuU, S, E, 0.62, 15, 11);
    put(a.imuF, E, Wr, 0.45, 14, 10);
    const cc = put(a.cam, E, Wr, 0.82, 14, 10);
    a.fov.setAttribute("d", `M${f(cc[0])} ${f(cc[1])}L${f(SCREW[0] + (side === "L" ? -14 : 12))} ${f(SCREW[1] + 4)}`);

    // gloved hand following the forearm
    const dir = Math.atan2(Wr[0] - E[0], -(Wr[1] - E[1]));
    const pts = place(handPose(side === "R" ? 0.55 : 0.3, side === "R" ? 0.5 : 0.25), {
      x: Wr[0],
      y: Wr[1],
      rot: dir + handRot,
      scale: 0.36,
      mirror: side === "R",
    });
    const fingers = FINGER_BONES.map(([i, j]) => `M${f(pts[i][0])} ${f(pts[i][1])}L${f(pts[j][0])} ${f(pts[j][1])}`).join("");
    const palm = "M" + PALM.map((i) => `${f(pts[i][0])} ${f(pts[i][1])}`).join("L") + "Z";
    a.gOuter.setAttribute("d", fingers + palm);
    a.gInner.setAttribute("d", fingers + palm);
    a.cuff.setAttribute("d", `M${f(Wr[0] + n2[0] * 10)} ${f(Wr[1] + n2[1] * 10)}L${f(Wr[0] - n2[0] * 10)} ${f(Wr[1] - n2[1] * 10)}`);
    [4, 8, 12, 16, 20].forEach((k, i) => {
      a.tips[i].setAttribute("cx", f(pts[k][0]));
      a.tips[i].setAttribute("cy", f(pts[k][1]));
    });
    return pts;
  }

  let t = 0.5;
  let running = false;
  let visible = false;
  let raf = 0;
  let last = 0;

  function render() {
    const lt = t % LOOP;
    const omega = Math.PI * 2 * 1.6;
    let R = [...BASE.R];
    let rot = 0;
    let action = "fasten screw";
    let grip = 0;
    let reach = 0;

    if (lt < 6) {
      const k = Math.min(1, lt * 2, (6 - lt) * 2);
      R = [BASE.R[0] + Math.cos(t * omega) * 4 * k, BASE.R[1] + Math.sin(t * omega) * 2.5 * k];
      rot = Math.sin(t * omega) * 0.18 * k;
      grip = 8.6 + Math.abs(Math.sin(t * omega)) * 2.4 * k;
    } else if (lt < 7) {
      reach = smooth(lt - 6);
      action = "reach for bit";
    } else if (lt < 8) {
      reach = 1;
      action = "pick bit";
      grip = 2.1 + Math.sin(t * 9) * 0.3;
    } else if (lt < 9.2) {
      reach = 1 - smooth((lt - 8) / 1.2);
      action = "return to frame";
      grip = 1.8;
    } else {
      action = "align bit to screw";
      grip = 3.4;
    }
    if (reach) R = lerp2(BASE.R, [458, 470], reach);

    const L = [BASE.L[0] + Math.sin(t * 0.8) * 2, BASE.L[1] + Math.cos(t * 0.6) * 1.5 + reach * 4];

    // head turns toward where the work is
    const headAng = lerp(-2.5, 6, reach) + Math.sin(t * 0.9) * 0.8;
    head?.setAttribute("transform", `rotate(${f(headAng)} ${HEAD_PIVOT[0]} ${HEAD_PIVOT[1]})`);

    drawArm("L", L, Math.sin(t * 0.7) * 0.05);
    const rp = drawArm("R", R, rot);

    // screwdriver held by the right hand
    const grip2 = lerp2(rp[4], rp[6], 0.5);
    const tip = reach > 0.02 ? [grip2[0] - 30, grip2[1] + 18] : SCREW;
    const dx = grip2[0] - tip[0];
    const dy = grip2[1] - tip[1];
    const l = Math.hypot(dx, dy) || 1;
    const u = [dx / l, dy / l];
    shaft.setAttribute("d", `M${f(tip[0])} ${f(tip[1])}L${f(grip2[0] - u[0] * 8)} ${f(grip2[1] - u[1] * 8)}`);
    handle.setAttribute("d", `M${f(grip2[0] - u[0] * 8)} ${f(grip2[1] - u[1] * 8)}L${f(grip2[0] + u[0] * 16)} ${f(grip2[1] + u[1] * 16)}`);

    // gaze from rotated eyes to the target
    const target = reach > 0.3 ? rp[8] : tip;
    const c = Math.cos((headAng * Math.PI) / 180);
    const s = Math.sin((headAng * Math.PI) / 180);
    EYES.forEach(([ex, ey], i) => {
      const x = HEAD_PIVOT[0] + (ex - HEAD_PIVOT[0]) * c - (ey - HEAD_PIVOT[1]) * s;
      const y = HEAD_PIVOT[1] + (ex - HEAD_PIVOT[0]) * s + (ey - HEAD_PIVOT[1]) * c;
      gazeLines[i].setAttribute("d", `M${f(x)} ${f(y)}L${f(target[0])} ${f(target[1])}`);
    });
    gazeDot.setAttribute("cx", f(target[0]));
    gazeDot.setAttribute("cy", f(target[1]));

    if (lines.length >= 3) {
      const secs = t.toFixed(2).padStart(5, "0");
      lines[0].textContent = `REC  00:${secs}`;
      lines[1].textContent = `ACTION  ${action}`;
      lines[2].textContent = `GRIP R  ${grip.toFixed(1)} N   WRIST ${(Math.abs(Math.cos(t * omega)) * 1.9 * (lt < 6 ? 1 : 0.1)).toFixed(1)} rad/s`;
    }
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 30) return;
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    t += dt;
    render();
  }
  const start = () => {
    if (running || reduceMotion.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  render();
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }).observe(svg);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
}
