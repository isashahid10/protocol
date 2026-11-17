/**
 * 3D capture rig: a lit, shaded mannequin at a workbench wearing the avcon rig,
 * repairing a drone. Arms are solved with two bone IK in 3D every frame.
 * Loads three.js lazily from a CDN when the figure nears the viewport; if that
 * fails, the SVG drawing in the figure stays as the fallback.
 */

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const LOOP = 10;
const L1 = 0.3;
const L2 = 0.28;

const LABELS = {
  1: "Stereo head camera", 2: "Depth", 3: "Eye tracking", 4: "Wrist cameras", 5: "Tactile gloves",
  6: "Motion suit", 7: "Audio", 8: "Workcell cameras", 9: "Recorder and sync",
};
// screen offset (px) of each hotspot marker from its anchor
const OFFSETS = {
  1: [0, -38], 2: [42, -18], 3: [-46, -4], 4: [-48, 18], 5: [40, 34],
  6: [52, -8], 7: [44, -10], 8: [-34, 30], 9: [-50, 14],
};

export function initRig3d(figure) {
  if (!figure) return;
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      import(THREE_URL)
        .then((THREE) => build(THREE, figure))
        .catch(() => {
          /* keep the SVG fallback */
        });
    },
    { rootMargin: "600px 0px" }
  );
  io.observe(figure);
}

function build(THREE, figure) {
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) return;

  const station = figure.closest("[data-station]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const css = () => getComputedStyle(document.documentElement);
  const cssColor = (name, fb) => new THREE.Color((css().getPropertyValue(name) || fb).trim() || fb);

  /* ---------- DOM ---------- */
  const wrap = document.createElement("div");
  wrap.className = "rig3d";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lines.setAttribute("class", "rig3d-leads");
  lines.setAttribute("aria-hidden", "true");
  const hud = document.createElement("div");
  hud.className = "rig3d-hud mono";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = '<span class="rec"></span><span class="act"></span><span class="grip"></span>';
  wrap.append(canvas, lines, hud);
  const markers = {};
  const leads = {};
  Object.keys(LABELS).forEach((id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hs3d mono";
    b.textContent = id;
    b.tabIndex = -1;
    b.setAttribute("aria-hidden", "true");
    b.addEventListener("click", () => station?.querySelector(`[data-sensor="${id}"]`)?.click());
    wrap.append(b);
    markers[id] = b;
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lines.append(l);
    leads[id] = l;
  });
  figure.insertBefore(wrap, figure.firstChild);

  /* ---------- renderer, scene, camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const LOOK = new THREE.Vector3(0, 1.08, -0.22);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1d1a, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.6, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.2;
  key.shadow.camera.right = 1.2;
  key.shadow.camera.top = 1.2;
  key.shadow.camera.bottom = -1.2;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-2, 2.2, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-2, 1, 2);
  scene.add(fill);

  /* ---------- materials ---------- */
  const accent = cssColor("--accent", "#c5ef6a");
  const M = {
    skin: new THREE.MeshStandardMaterial({ color: 0xc4c8c2, roughness: 0.55, metalness: 0.05 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0x2b302c, roughness: 0.85 }),
    device: new THREE.MeshStandardMaterial({ color: 0x1b1e1c, roughness: 0.4, metalness: 0.4 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x232724, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a0c0b, roughness: 0.05, metalness: 0.9 }),
    bench: new THREE.MeshStandardMaterial({ color: 0x3a3f3b, roughness: 0.6, metalness: 0.2 }),
    benchTop: new THREE.MeshStandardMaterial({ color: 0x4a504b, roughness: 0.45, metalness: 0.15 }),
    drone: new THREE.MeshStandardMaterial({ color: 0x3b403d, roughness: 0.35, metalness: 0.55 }),
    prop: new THREE.MeshStandardMaterial({ color: 0x8c928d, roughness: 0.5, transparent: true, opacity: 0.85 }),
    led: new THREE.MeshBasicMaterial({ color: accent }),
    line: new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.5, depthTest: false }),
    fov: new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.09 }),
    gaze: new THREE.LineDashedMaterial({ color: accent, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.9 }),
    joint: new THREE.MeshBasicMaterial({ color: accent, depthTest: false, transparent: true }),
  };

  const mesh = (geo, mat, parent = scene, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const sensor = {}; // id -> meshes whose material highlights
  const tag = (id, m) => ((sensor[id] = sensor[id] || []).push(m), m);
  const anchors = {};

  /* ---------- environment ---------- */
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);
  const grid = new THREE.GridHelper(4, 20, accent, accent);
  grid.material.transparent = true;
  grid.material.opacity = 0.08;
  scene.add(grid);

  // workbench
  const top = mesh(new THREE.BoxGeometry(1.2, 0.045, 0.56), M.benchTop);
  top.position.set(0, 0.74, 0.02);
  [[-0.56, -0.22], [0.56, -0.22], [-0.56, 0.26], [0.56, 0.26]].forEach(([x, z]) => {
    const leg = mesh(new THREE.BoxGeometry(0.04, 0.72, 0.04), M.bench);
    leg.position.set(x, 0.36, z);
  });
  const mat = mesh(new THREE.BoxGeometry(0.5, 0.006, 0.34), new THREE.MeshStandardMaterial({ color: 0x1e3324, roughness: 0.9 }), scene, false);
  mat.position.set(0, 0.766, -0.06);

  // drone
  const drone = new THREE.Group();
  drone.position.set(0, 0.795, -0.06);
  drone.scale.setScalar(1.45);
  scene.add(drone);
  mesh(new THREE.BoxGeometry(0.11, 0.035, 0.08), M.drone, drone);
  const props = [];
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz], i) => {
    const arm = mesh(new THREE.BoxGeometry(0.13, 0.012, 0.016), M.drone, drone);
    arm.position.set(sx * 0.07, 0, sz * 0.055);
    arm.rotation.y = -sx * sz * 0.65;
    const motor = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 20), M.drone, drone);
    motor.position.set(sx * 0.12, 0.008, sz * 0.09);
    if (i !== 1) {
      const p = mesh(new THREE.BoxGeometry(0.11, 0.003, 0.012), M.prop, drone);
      p.position.set(sx * 0.12, 0.021, sz * 0.09);
      props.push(p);
    }
  });
  const dled = mesh(new THREE.SphereGeometry(0.005, 10, 10), M.led, drone, false);
  dled.position.set(0, 0.012, 0.042);
  const SCREW = new THREE.Vector3(0.1, 0.815, -0.03);

  // bit tray
  const tray = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), M.device);
  tray.position.set(0.32, 0.77, -0.1);

  // workcell cameras
  [-1, 1].forEach((s) => {
    const pole = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 12), M.device);
    pole.position.set(s * 0.62, 1.95, -0.8);
    const cam = mesh(new THREE.BoxGeometry(0.1, 0.06, 0.08), M.device);
    cam.position.set(s * 0.62, 1.63, -0.8);
    cam.lookAt(0, 0.8, -0.05);
    const lens = mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 20), M.glass, cam);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.05;
    tag(8, cam);
    if (s > 0) anchors[8] = cam;
    const pts = [];
    [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.3], [0.6, 0.3]].forEach(([x, z]) => {
      pts.push(cam.position.clone(), new THREE.Vector3(x, 0.765, z));
    });
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.fov));
  });

  /* ---------- body ---------- */
  const profile = [[0, 0], [0.13, 0], [0.135, 0.08], [0.145, 0.2], [0.165, 0.32], [0.17, 0.4], [0.155, 0.46], [0.11, 0.5], [0.05, 0.52], [0, 0.52]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torso = mesh(new THREE.LatheGeometry(profile, 40), M.shirt);
  torso.scale.set(1.22, 1, 0.68);
  torso.position.set(0, 0.8, -0.46);
  const chestIMU = tag(6, mesh(new THREE.BoxGeometry(0.045, 0.035, 0.015), M.device));
  chestIMU.position.set(0, 1.18, -0.345);
  const neck = mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.1, 20), M.skin);
  neck.position.set(0, 1.36, -0.46);
  const shoulders = [-1, 1].map((s) => {
    const sh = mesh(new THREE.SphereGeometry(0.062, 24, 16), M.shirt);
    sh.position.set(s * 0.19, 1.27, -0.46);
    return sh.position.clone();
  });

  // head group pivots at the top of the neck
  const head = new THREE.Group();
  head.position.set(0, 1.4, -0.46);
  head.scale.setScalar(1.12);
  head.rotation.order = "YXZ";
  scene.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.1, 32, 24), M.skin, head);
  skull.scale.set(0.88, 1.12, 1);
  skull.position.y = 0.1;
  const jaw = mesh(new THREE.SphereGeometry(0.07, 24, 16), M.skin, head);
  jaw.scale.set(1, 0.9, 1);
  jaw.position.set(0, 0.04, 0.025);
  const band = mesh(new THREE.TorusGeometry(0.093, 0.011, 12, 48), M.device, head);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.14;
  band.scale.set(0.95, 1.12, 1);
  const camBox = tag(1, mesh(new THREE.BoxGeometry(0.09, 0.034, 0.03), M.device, head));
  camBox.position.set(0, 0.155, 0.105);
  anchors[1] = camBox;
  [-0.022, 0.022].forEach((x) => {
    const l = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 20), M.glass, camBox);
    l.rotation.x = Math.PI / 2;
    l.position.set(x, 0, 0.018);
  });
  const camLed = mesh(new THREE.SphereGeometry(0.003, 8, 8), M.led, camBox, false);
  camLed.position.set(0, 0.012, 0.016);
  const depth = tag(2, mesh(new THREE.BoxGeometry(0.022, 0.045, 0.03), M.device, head));
  depth.position.set(0.092, 0.13, 0.03);
  anchors[2] = depth;
  const visor = tag(3, mesh(new THREE.BoxGeometry(0.13, 0.009, 0.012), M.device, head));
  visor.position.set(0, 0.09, 0.098);
  [-1, 1].forEach((s) => {
    const eyeCam = tag(3, mesh(new THREE.SphereGeometry(0.007, 12, 12), M.glass, head));
    eyeCam.position.set(s * 0.032, 0.082, 0.104);
    if (s < 0) anchors[3] = eyeCam;
    const temple = tag(3, mesh(new THREE.BoxGeometry(0.008, 0.008, 0.09), M.device, head));
    temple.position.set(s * 0.066, 0.092, 0.055);
  });
  const eyeOrigin = new THREE.Object3D();
  eyeOrigin.position.set(0, 0.09, 0.1);
  head.add(eyeOrigin);

  const mic = tag(7, mesh(new THREE.CapsuleGeometry(0.008, 0.02, 4, 12), M.device));
  mic.position.set(0.06, 1.25, -0.35);
  anchors[7] = mic;
  const recorder = tag(9, mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), M.device));
  recorder.position.set(-0.07, 0.92, -0.36);
  anchors[9] = recorder;
  const recLed = mesh(new THREE.SphereGeometry(0.005, 10, 10), M.led, recorder, false);
  recLed.position.set(0.035, 0.015, 0.016);
  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, 1.24, -0.345), new THREE.Vector3(0.06, 1.12, -0.335),
    new THREE.Vector3(0.0, 1.0, -0.345), new THREE.Vector3(-0.05, 0.945, -0.355),
  ]);
  mesh(new THREE.TubeGeometry(cablePath, 40, 0.003, 6), M.device, scene, false);
  const pulses = [0, 1, 2].map(() => mesh(new THREE.SphereGeometry(0.006, 10, 10), M.led, scene, false));

  /* ---------- arms and hands ---------- */
  const UP = new THREE.Vector3(0, 1, 0);
  function segment(r, len, material) {
    const m = mesh(new THREE.CapsuleGeometry(r, len, 8, 20), material);
    m.userData.len = len;
    return m;
  }
  function placeBetween(m, A, B) {
    const d = new THREE.Vector3().subVectors(B, A);
    m.position.copy(A).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  }

  function buildHand(thumbSign) {
    const g = new THREE.Group();
    scene.add(g);
    const inner = new THREE.Group();
    inner.scale.setScalar(1.35);
    g.add(inner);
    const palm = tag(5, mesh(new THREE.BoxGeometry(0.075, 0.085, 0.026), M.glove, inner));
    palm.position.y = 0.045;
    const tips = [];
    [-0.027, -0.009, 0.009, 0.027].forEach((x, i) => {
      const len = [0.05, 0.058, 0.055, 0.044][i];
      const fg = new THREE.Group();
      fg.position.set(x, 0.088, 0);
      fg.rotation.x = 0.55;
      inner.add(fg);
      const f1 = tag(5, mesh(new THREE.CapsuleGeometry(0.0095, len, 4, 12), M.glove, fg));
      f1.position.y = len / 2;
      const tip = mesh(new THREE.SphereGeometry(0.006, 10, 10), M.led, fg, false);
      tip.position.set(0, len + 0.006, 0.006);
      tips.push(tip);
    });
    const th = new THREE.Group();
    th.position.set(thumbSign * 0.035, 0.03, 0.004);
    th.rotation.z = -thumbSign * 0.9;
    th.rotation.x = 0.3;
    inner.add(th);
    const t1 = tag(5, mesh(new THREE.CapsuleGeometry(0.011, 0.045, 4, 12), M.glove, th));
    t1.position.y = 0.03;
    return { g, palm };
  }

  const arms = [-1, 1].map((s, i) => {
    const upper = segment(0.05, L1 - 0.06, M.shirt);
    const fore = segment(0.042, L2 - 0.06, M.skin);
    const elbow = mesh(new THREE.SphereGeometry(0.046, 20, 14), M.shirt);
    const imuU = tag(6, mesh(new THREE.BoxGeometry(0.04, 0.05, 0.016), M.device));
    const imuF = tag(6, mesh(new THREE.BoxGeometry(0.036, 0.044, 0.014), M.device));
    const wcam = tag(4, mesh(new THREE.BoxGeometry(0.034, 0.024, 0.03), M.device));
    const wlens = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 14), M.glass, wcam);
    wlens.rotation.x = Math.PI / 2;
    wlens.position.z = 0.017;
    const hand = buildHand(-s);
    if (s > 0) {
      anchors[4] = wcam;
      anchors[5] = hand.palm;
      anchors[6] = imuU;
    }
    return { s, S: shoulders[i], upper, fore, elbow, imuU, imuF, wcam, hand };
  });

  // screwdriver
  const shaft = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 8), new THREE.MeshStandardMaterial({ color: 0xb8bcb9, metalness: 0.9, roughness: 0.25 }));
  const handleM = mesh(new THREE.CapsuleGeometry(0.012, 0.07, 6, 14), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));

  /* ---------- mocap overlay and gaze ---------- */
  const skelGeo = new THREE.BufferGeometry();
  skelGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
  const skel = new THREE.LineSegments(skelGeo, M.line);
  skel.renderOrder = 10;
  scene.add(skel);
  const jointDots = Array.from({ length: 7 }, () => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 10), M.joint);
    d.renderOrder = 11;
    scene.add(d);
    return d;
  });
  const gazeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const gaze = new THREE.Line(gazeGeo, M.gaze);
  scene.add(gaze);
  const gazeRing = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.018, 32), new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide }));
  gazeRing.rotation.x = -Math.PI / 2;
  scene.add(gazeRing);

  /* ---------- solve ---------- */
  const tmp = new THREE.Vector3();
  function ik(S, T, pole) {
    const d = tmp.subVectors(T, S);
    let dist = d.length();
    dist = Math.min(Math.max(dist, Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.005);
    const dir = d.clone().normalize();
    const a = (L1 * L1 + dist * dist - L2 * L2) / (2 * dist);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
    const W = S.clone().addScaledVector(dir, dist);
    return { E, W };
  }

  function poseArm(A, target, roll) {
    const pole = new THREE.Vector3(A.s, -0.35, -0.6).normalize();
    const { E, W } = ik(A.S, target, pole);
    placeBetween(A.upper, A.S, E);
    placeBetween(A.fore, E, W);
    A.elbow.position.copy(E);
    const along = (m, P, Q, t, out) => {
      const d = new THREE.Vector3().subVectors(Q, P).normalize();
      const side = new THREE.Vector3(A.s, 0, 0).addScaledVector(d, -A.s * d.x).normalize();
      m.position.copy(P).lerp(Q, t).addScaledVector(side, out);
      m.quaternion.setFromUnitVectors(UP, d);
    };
    along(A.imuU, A.S, E, 0.55, 0.05);
    along(A.imuF, E, W, 0.45, 0.042);
    along(A.wcam, E, W, 0.86, 0.038);
    // hand frame: fingers continue the forearm, palm faces the bench
    const f = new THREE.Vector3().subVectors(W, E).normalize();
    f.y = Math.max(f.y, -0.55);
    f.normalize();
    const n = new THREE.Vector3(0, -1, 0).addScaledVector(f, f.y).normalize();
    const side = new THREE.Vector3().crossVectors(f, n).normalize();
    const m = new THREE.Matrix4().makeBasis(side, f, n);
    A.hand.g.quaternion.setFromRotationMatrix(m);
    A.hand.g.rotateY(roll);
    A.hand.g.position.copy(W);
    return { E, W, f, n };
  }

  /* ---------- sizing and projection ---------- */
  let w = 1;
  let h = 1;
  function resize() {
    const r = wrap.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 34 : 30;
    camera.updateProjectionMatrix();
    lines.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  let active = "1";
  function setActive(id) {
    active = String(id);
    Object.entries(sensor).forEach(([sid, list]) => {
      list.forEach((m) => {
        if (!m.userData.baseMat) m.userData.baseMat = m.material;
        if (sid === active) {
          if (!m.userData.hiMat) {
            m.userData.hiMat = m.userData.baseMat.clone();
            m.userData.hiMat.emissive = accent.clone();
            m.userData.hiMat.emissiveIntensity = 0.55;
          }
          m.material = m.userData.hiMat;
        } else m.material = m.userData.baseMat;
      });
    });
    Object.entries(markers).forEach(([k, b]) => b.classList.toggle("is-active", k === active));
  }
  station?.addEventListener("sensor-select", (e) => setActive(e.detail));
  const pressed = station?.querySelector('[data-sensor][aria-pressed="true"]');
  setActive(pressed ? pressed.dataset.sensor : 1);

  /* ---------- frame ---------- */
  let t = 0.4;
  const v = new THREE.Vector3();
  const smooth = (x) => x * x * (3 - 2 * x);
  const hudEls = hud.children;

  function render() {
    const lt = t % LOOP;
    const om = Math.PI * 2 * 1.5;
    const baseR = new THREE.Vector3(0.15, 0.865, -0.13);
    const baseL = new THREE.Vector3(-0.15, 0.855, -0.12);
    const trayW = new THREE.Vector3(0.29, 0.88, -0.15);
    let reach = 0;
    let action = "fasten screw";
    let grip = 0;
    let roll = 0;
    let R = baseR.clone();
    if (lt < 6) {
      const k = Math.min(1, lt * 2, (6 - lt) * 2);
      R.x += Math.cos(t * om) * 0.008 * k;
      R.z += Math.sin(t * om) * 0.006 * k;
      roll = Math.sin(t * om) * 0.35 * k;
      grip = 8.6 + Math.abs(Math.sin(t * om)) * 2.4 * k;
    } else if (lt < 7) {
      reach = smooth(lt - 6);
      action = "reach for bit";
    } else if (lt < 8) {
      reach = 1;
      action = "pick bit";
      grip = 2.1;
    } else if (lt < 9.2) {
      reach = 1 - smooth((lt - 8) / 1.2);
      action = "return to frame";
      grip = 1.8;
    } else {
      action = "align bit to screw";
      grip = 3.4;
    }
    if (reach) R = baseR.clone().lerp(trayW, reach).add(new THREE.Vector3(0, Math.sin(reach * Math.PI) * 0.06, 0));
    const Lp = baseL.clone().add(new THREE.Vector3(Math.sin(t * 0.8) * 0.004, 0, Math.cos(t * 0.6) * 0.003));

    const left = poseArm(arms[0], Lp, 0);
    const right = poseArm(arms[1], R, roll);

    // screwdriver in the right hand
    const gripPt = right.W.clone().addScaledVector(right.f, 0.09).addScaledVector(right.n, 0.035);
    const tipPt = reach > 0.02 ? gripPt.clone().addScaledVector(right.f, 0.09).addScaledVector(right.n, 0.02) : SCREW.clone();
    const sd = new THREE.Vector3().subVectors(gripPt, tipPt);
    shaft.position.copy(tipPt).addScaledVector(sd, 0.5);
    shaft.scale.y = sd.length();
    shaft.quaternion.setFromUnitVectors(UP, sd.clone().normalize());
    handleM.position.copy(gripPt).addScaledVector(sd.clone().normalize(), 0.03);
    handleM.quaternion.copy(shaft.quaternion);

    // head follows the work
    const target = reach > 0.35 ? right.W.clone().addScaledVector(right.f, 0.08) : tipPt;
    const hp = head.position;
    head.rotation.y = Math.atan2(target.x - hp.x, target.z - hp.z) * 0.7;
    head.rotation.x = 0.42 + Math.sin(t * 0.9) * 0.015;
    head.updateMatrixWorld();
    const eye = eyeOrigin.getWorldPosition(new THREE.Vector3());
    gaze.geometry.setFromPoints([eye, target]);
    gaze.computeLineDistances();
    gazeRing.position.copy(target).add(new THREE.Vector3(0, 0.004, 0));
    gazeRing.scale.setScalar(1 + Math.sin(t * 6) * 0.15);

    // skeleton overlay
    const P = skelGeo.attributes.position;
    const neckTop = new THREE.Vector3(0, 1.4, -0.46);
    const pts = [arms[0].S, left.E, left.E, left.W, arms[1].S, right.E, right.E, right.W, arms[0].S, arms[1].S];
    pts.forEach((p, i) => P.setXYZ(i, p.x, p.y, p.z));
    P.needsUpdate = true;
    [arms[0].S, left.E, left.W, arms[1].S, right.E, right.W, neckTop].forEach((p, i) => jointDots[i].position.copy(p));

    // props spin, data pulses run down the cable
    props.forEach((p, i) => (p.rotation.y = t * (i === 2 ? 0.4 : 1.2) + i));
    pulses.forEach((p, i) => p.position.copy(cablePath.getPoint(((t * 0.6 + i / 3) % 1))));
    M.led.color.copy(accent);

    // camera drifts slowly around the bench
    const ang = Math.sin(t * 0.18) * 0.32 + pointerX * 0.15;
    const narrow = w / h < 0.9;
    const dist = narrow ? 3.3 : 3.0;
    camera.position.set(Math.sin(ang) * dist, 2.05 + pointerY * 0.08, LOOK.z + Math.cos(ang) * dist);
    camera.lookAt(LOOK);

    renderer.render(scene, camera);

    // hotspots and leader lines
    Object.entries(anchors).forEach(([id, obj]) => {
      obj.getWorldPosition(v);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const [ox, oy] = OFFSETS[id];
      markers[id].style.transform = `translate(${(x + ox).toFixed(1)}px, ${(y + oy).toFixed(1)}px)`;
      const l = leads[id];
      l.setAttribute("x1", x.toFixed(1));
      l.setAttribute("y1", y.toFixed(1));
      l.setAttribute("x2", (x + ox).toFixed(1));
      l.setAttribute("y2", (y + oy).toFixed(1));
      l.classList.toggle("is-active", id === active);
    });

    hudEls[0].textContent = `REC 00:${t.toFixed(2).padStart(5, "0")}`;
    hudEls[1].textContent = `ACTION ${action}`;
    hudEls[2].textContent = `GRIP R ${grip.toFixed(1)} N`;
  }

  let pointerX = 0;
  let pointerY = 0;
  wrap.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = wrap.getBoundingClientRect();
    pointerX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointerY = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  wrap.addEventListener("pointerleave", () => {
    pointerX = 0;
    pointerY = 0;
  });

  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
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

  // theme changes recolour the accent pieces
  new MutationObserver(() => {
    accent.copy(cssColor("--accent", "#c5ef6a"));
    [M.line, M.fov, M.gaze, M.joint, gazeRing.material].forEach((m) => m.color.copy(accent));
    grid.material.color.copy(accent);
    Object.values(sensor).flat().forEach((m) => m.userData.hiMat?.emissive.copy(accent));
    if (!running) render();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  figure.classList.add("is-3d");
  render();
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }).observe(wrap);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
}
