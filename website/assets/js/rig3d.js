/**
 * 3D capture rig: a rigged human figure standing at a workbench, wearing the
 * avcon capture rig and repairing a drone, rendered with studio environment
 * lighting and soft shadows.
 *
 * The figure is the Mixamo "X Bot" (from the three.js examples). Its idle
 * animation drives breathing and posture; on top of that the spine leans in,
 * the head follows the work, and both arms are solved every frame with two
 * bone IK applied straight to the skeleton, so the hands work on the drone.
 * Rig hardware is attached to bones and follows them.
 *
 * three.js loads lazily (import map in index.html) when the figure nears the
 * viewport. If WebGL or the CDN is unavailable, the SVG drawing stays.
 */

const MODEL_URL = new URL("../models/xbot.glb", import.meta.url).href;
const LOOP = 10;
const LABELS = {
  1: "Stereo head camera", 2: "Depth", 3: "Eye tracking", 4: "Wrist cameras", 5: "Tactile gloves",
  6: "Motion suit", 7: "Audio", 8: "Workcell cameras", 9: "Recorder and sync",
};
const OFFSETS = {
  1: [0, -40], 2: [46, -16], 3: [-48, -8], 4: [-52, 10], 5: [-44, 34],
  6: [-56, -14], 7: [48, -6], 8: [36, 26], 9: [52, 14],
};

export function initRig3d(figure) {
  if (!figure) return;
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      Promise.all([
        import("three"),
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/environments/RoomEnvironment.js"),
      ])
        .then(([THREE, { GLTFLoader }, { RoomEnvironment }]) =>
          new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => build(THREE, RoomEnvironment, gltf, figure))
        )
        .catch(() => {
          /* keep the SVG fallback */
        });
    },
    { rootMargin: "700px 0px" }
  );
  io.observe(figure);
}

function build(THREE, RoomEnvironment, gltf, figure) {
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) return;

  const station = figure.closest("[data-station]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cssColor = (name, fb) =>
    new THREE.Color((getComputedStyle(document.documentElement).getPropertyValue(name) || fb).trim() || fb);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  /* ---------- DOM overlay ---------- */
  const wrap = document.createElement("div");
  wrap.className = "rig3d";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const leadsSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leadsSvg.setAttribute("class", "rig3d-leads");
  leadsSvg.setAttribute("aria-hidden", "true");
  const hud = document.createElement("div");
  hud.className = "rig3d-hud mono";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = '<span class="rec"></span><span class="act"></span><span class="grip"></span>';
  wrap.append(canvas, leadsSvg, hud);
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
    leads[id] = leadsSvg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "line"));
  });
  figure.insertBefore(wrap, figure.firstChild);

  /* ---------- renderer and studio ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  const LOOK = V(0, 1.2, -0.3);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.2, 4.2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.6, bottom: -1.2, near: 1, far: 10 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(-2.5, 2.6, -3);
  scene.add(rim);

  let accent = cssColor("--accent", "#c5ef6a");

  const std = (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const M = {
    shell: std(0xd9ddd8, 0.34, 0.05),
    joints: std(0x232724, 0.5, 0.3),
    device: std(0x1a1d1b, 0.32, 0.55),
    deviceTrim: std(0x3a3f3c, 0.4, 0.6),
    glass: std(0x050606, 0.04, 0.95),
    alu: std(0xa7ada8, 0.28, 0.9),
    top: std(0x262a27, 0.55, 0.15),
    mat: std(0x17251b, 0.92, 0),
    carbon: std(0x121413, 0.38, 0.45),
    motor: std(0x8e9590, 0.25, 0.95),
    prop: std(0x9aa19c, 0.35, 0.1, { transparent: true, opacity: 0.8 }),
    led: new THREE.MeshBasicMaterial({ color: accent }),
    line: new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.55, depthTest: false }),
    joint: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95, depthTest: false }),
    fov: new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.07 }),
    gaze: new THREE.LineDashedMaterial({ color: accent, dashSize: 0.018, gapSize: 0.014, transparent: true, opacity: 0.8 }),
  };

  const add = (geo, mat, parent = scene, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const sensor = {};
  const tag = (id, m) => ((sensor[id] = sensor[id] || []).push(m), m);
  const anchors = {};

  /* ---------- floor ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(6, 30, accent, accent);
  grid.material.transparent = true;
  grid.material.opacity = 0.06;
  scene.add(grid);

  /* ---------- workbench ---------- */
  const TOP_Y = 0.92;
  const bench = new THREE.Group();
  scene.add(bench);
  const top = add(new THREE.BoxGeometry(1.3, 0.04, 0.62), M.top, bench);
  top.position.set(0, TOP_Y - 0.02, 0.1);
  const lip = add(new THREE.BoxGeometry(1.3, 0.006, 0.62), M.deviceTrim, bench, false);
  lip.position.set(0, TOP_Y - 0.043, 0.1);
  [[-0.6, -0.16], [0.6, -0.16], [-0.6, 0.36], [0.6, 0.36]].forEach(([x, z]) => {
    const leg = add(new THREE.BoxGeometry(0.035, TOP_Y - 0.045, 0.035), M.alu, bench);
    leg.position.set(x, (TOP_Y - 0.045) / 2, z);
  });
  [-0.16, 0.36].forEach((z) => {
    const rail = add(new THREE.BoxGeometry(1.2, 0.025, 0.025), M.alu, bench);
    rail.position.set(0, 0.18, z);
  });
  const shelf = add(new THREE.BoxGeometry(1.2, 0.015, 0.5), M.device, bench);
  shelf.position.set(0, 0.2, 0.1);
  const mat = add(new THREE.BoxGeometry(0.62, 0.004, 0.36), M.mat, bench, false);
  mat.position.set(-0.02, TOP_Y + 0.002, 0.0);

  // drone
  const drone = new THREE.Group();
  drone.position.set(0.0, TOP_Y + 0.035, -0.01);
  drone.rotation.y = 0.25;
  drone.scale.setScalar(1.55);
  scene.add(drone);
  const body = add(new THREE.BoxGeometry(0.1, 0.03, 0.07), M.carbon, drone);
  const canopy = add(new THREE.SphereGeometry(0.035, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.deviceTrim, drone);
  canopy.scale.set(1.1, 0.5, 0.8);
  canopy.position.y = 0.015;
  const props = [];
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz], i) => {
    const arm = add(new THREE.BoxGeometry(0.12, 0.01, 0.014), M.carbon, drone);
    arm.position.set(sx * 0.065, -0.004, sz * 0.05);
    arm.rotation.y = -sx * sz * 0.66;
    const motor = add(new THREE.CylinderGeometry(0.012, 0.013, 0.02, 24), M.motor, drone);
    motor.position.set(sx * 0.11, 0.004, sz * 0.085);
    const guard = add(new THREE.TorusGeometry(0.052, 0.0025, 8, 48), M.carbon, drone);
    guard.rotation.x = Math.PI / 2;
    guard.position.set(sx * 0.11, 0.01, sz * 0.085);
    if (i !== 1) {
      const p = add(new THREE.BoxGeometry(0.095, 0.0018, 0.01), M.prop, drone);
      p.position.set(sx * 0.11, 0.016, sz * 0.085);
      props.push(p);
    }
  });
  const dled = add(new THREE.SphereGeometry(0.004, 12, 12), M.led, drone, false);
  dled.position.set(0.05, 0.004, 0);
  const SCREW = V();
  const screwMark = new THREE.Object3D();
  screwMark.position.set(-0.07, 0.006, -0.036);
  drone.add(screwMark);

  // parts tray and spare props
  const tray = add(new THREE.BoxGeometry(0.12, 0.018, 0.08), M.deviceTrim);
  tray.position.set(-0.36, TOP_Y + 0.009, -0.06);
  for (let i = 0; i < 3; i++) {
    const bit = add(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 8), M.alu, tray, false);
    bit.position.set(-0.03 + i * 0.02, 0.016, 0);
  }

  // workcell cameras on aluminium posts
  [-1, 1].forEach((s) => {
    const post = add(new THREE.CylinderGeometry(0.012, 0.012, 1.7, 16), M.alu);
    post.position.set(s * 1.0, 0.85, -1.2);
    const cam = add(new THREE.BoxGeometry(0.11, 0.065, 0.085), M.device);
    cam.position.set(s * 1.0, 1.72, -1.2);
    cam.lookAt(0, TOP_Y, 0);
    const lens = add(new THREE.CylinderGeometry(0.022, 0.024, 0.03, 24), M.glass, cam);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.055;
    const led = add(new THREE.SphereGeometry(0.004, 8, 8), M.led, cam, false);
    led.position.set(0.04, 0.024, 0.043);
    tag(8, cam);
    if (s > 0) anchors[8] = cam;
    const pts = [];
    [[-0.55, -0.18], [0.55, -0.18], [-0.55, 0.38], [0.55, 0.38]].forEach(([x, z]) =>
      pts.push(cam.position.clone(), V(x, TOP_Y, z))
    );
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.fov));
  });

  /* ---------- figure ---------- */
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = /joint/i.test(o.name) ? M.joints : M.shell;
    }
  });
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(V());
  root.scale.multiplyScalar(1.75 / size.y);
  root.updateMatrixWorld(true);

  const bone = (n) => root.getObjectByName("mixamorig" + n) || root.getObjectByName("mixamorig:" + n);
  const B = {};
  ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End"].forEach((n) => (B[n] = bone(n)));
  ["Left", "Right"].forEach((s) => {
    ["Arm", "ForeArm", "Hand", "HandMiddle1"].forEach((n) => (B[s + n] = bone(s + n)));
    ["Thumb", "Index", "Middle", "Ring", "Pinky"].forEach((f) => {
      for (let k = 1; k <= 4; k++) B[`${s}Hand${f}${k}`] = bone(`${s}Hand${f}${k}`);
    });
  });
  const wp = (o) => o.getWorldPosition(V());
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());

  // record rest pose (T pose, root at origin) for attaching hardware
  const rest = new Map();
  Object.values(B).forEach((b) => b && rest.set(b, { p: wp(b), q: wq(b) }));
  const L1 = wp(B.LeftArm).distanceTo(wp(B.LeftForeArm));
  const L2 = wp(B.LeftForeArm).distanceTo(wp(B.LeftHand));
  const headH = wp(B.HeadTop_End).y - wp(B.Head).y;

  // attachments: authored in rest space, then carried by their bone each frame
  const attached = [];
  function attach(b, obj, restPos, restQuat = new THREE.Quaternion()) {
    const r = rest.get(b);
    attached.push({ b, obj, off: restPos.clone().sub(r.p), rq: r.q.clone(), oq: restQuat.clone() });
    scene.add(obj);
    return obj;
  }
  const headP = wp(B.Head);
  const hc = V(0, headP.y + headH * 0.52, headP.z + 0.005);
  const R = headH * 0.6;

  // headset
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.009, 12, 64), M.device);
  band.castShadow = true;
  attach(B.Head, band, hc.clone().add(V(0, R * 0.12, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.12, 0, 0)));
  band.scale.set(1, 1.12, 1);
  const camBox = tag(1, add(new THREE.BoxGeometry(0.084, 0.03, 0.032), M.device, scene));
  attach(B.Head, camBox, hc.clone().add(V(0, R * 0.48, R * 0.92)));
  [-0.022, 0.022].forEach((x) => {
    const l = add(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 24), M.glass, camBox, false);
    l.rotation.x = Math.PI / 2;
    l.position.set(x, 0, 0.018);
    const ring = add(new THREE.TorusGeometry(0.0115, 0.0018, 8, 24), M.alu, camBox, false);
    ring.position.set(x, 0, 0.0185);
  });
  const camLed = add(new THREE.SphereGeometry(0.0028, 8, 8), M.led, camBox, false);
  camLed.position.set(0.034, 0.009, 0.017);
  anchors[1] = camBox;
  const depth = tag(2, add(new THREE.BoxGeometry(0.024, 0.044, 0.034), M.device, scene));
  attach(B.Head, depth, hc.clone().add(V(R * 1.02, R * 0.1, R * 0.15)));
  anchors[2] = depth;
  const visor = tag(3, add(new THREE.BoxGeometry(R * 1.55, 0.007, 0.009), M.deviceTrim, scene));
  attach(B.Head, visor, hc.clone().add(V(0, -R * 0.12, R * 1.0)));
  const eyeCams = [-1, 1].map((s) => {
    const e = tag(3, add(new THREE.SphereGeometry(0.0065, 12, 12), M.glass, scene));
    attach(B.Head, e, hc.clone().add(V(s * R * 0.36, -R * 0.2, R * 0.98)));
    return e;
  });
  anchors[3] = eyeCams[1];

  // torso hardware
  const sp2 = wp(B.Spine2);
  const chestIMU = tag(6, add(new THREE.BoxGeometry(0.05, 0.036, 0.016), M.device, scene));
  attach(B.Spine2, chestIMU, V(0, sp2.y + 0.02, sp2.z + 0.125));
  const harness = add(new THREE.BoxGeometry(0.012, 0.32, 0.008), M.device, scene);
  attach(B.Spine2, harness, V(0.075, sp2.y - 0.02, sp2.z + 0.118), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.22)));
  const mic = tag(7, add(new THREE.CapsuleGeometry(0.007, 0.018, 4, 12), M.device, scene));
  attach(B.Spine2, mic, V(-0.05, sp2.y + 0.13, sp2.z + 0.1));
  anchors[7] = mic;
  const hipsP = wp(B.Hips);
  const recorder = tag(9, add(new THREE.BoxGeometry(0.095, 0.062, 0.032), M.device, scene));
  attach(B.Hips, recorder, V(0.08, hipsP.y + 0.03, hipsP.z + 0.115));
  const recLed = add(new THREE.SphereGeometry(0.0035, 8, 8), M.led, recorder, false);
  recLed.position.set(0.03, 0.017, 0.017);
  anchors[9] = recorder;

  // arm hardware
  ["Left", "Right"].forEach((s) => {
    const a = wp(B[s + "Arm"]);
    const f = wp(B[s + "ForeArm"]);
    const h = wp(B[s + "Hand"]);
    const up = tag(6, add(new THREE.BoxGeometry(0.05, 0.016, 0.04), M.device, scene));
    attach(B[s + "Arm"], up, a.clone().lerp(f, 0.55).add(V(0, 0.052, 0)));
    const fo = tag(6, add(new THREE.BoxGeometry(0.046, 0.014, 0.036), M.device, scene));
    attach(B[s + "ForeArm"], fo, f.clone().lerp(h, 0.42).add(V(0, 0.043, 0)));
    const cam = tag(4, add(new THREE.BoxGeometry(0.03, 0.022, 0.03), M.device, scene));
    attach(B[s + "ForeArm"], cam, f.clone().lerp(h, 0.84).add(V(0, 0.038, 0)));
    const lens = add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.01, 16), M.glass, cam, false);
    lens.rotation.z = Math.PI / 2;
    lens.position.x = s === "Left" ? 0.017 : -0.017;
    if (s === "Right") {
      anchors[6] = up;
      anchors[4] = cam;
    }
    // tactile glove: pads on every fingertip and the palm
    ["Thumb", "Index", "Middle", "Ring", "Pinky"].forEach((fn) => {
      const tip = B[`${s}Hand${fn}4`];
      if (!tip) return;
      const pad = tag(5, add(new THREE.SphereGeometry(0.0075, 12, 12), M.led, scene, false));
      attach(tip, pad, wp(tip).add(V(0, -0.006, 0)));
    });
    const palm = tag(5, add(new THREE.BoxGeometry(0.06, 0.004, 0.05), M.deviceTrim, scene));
    attach(B[s + "Hand"], palm, h.clone().add(V(s === "Left" ? 0.045 : -0.045, -0.018, 0)));
    if (s === "Right") anchors[5] = palm;
  });

  // place the figure behind the bench
  root.position.set(0, 0, -0.44);
  scene.add(root);

  // screwdriver
  const shaft = add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 10), M.alu);
  const handle = add(new THREE.CapsuleGeometry(0.0115, 0.075, 6, 16), M.device);
  const band2 = add(new THREE.CylinderGeometry(0.0122, 0.0122, 0.008, 16), M.led, handle, false);
  band2.position.y = -0.03;

  // idle animation for breathing and weight shift
  const restLocal = [];
  root.traverse((o) => o.isBone && restLocal.push([o, o.quaternion.clone()]));
  const mixer = new THREE.AnimationMixer(root);
  const idle = gltf.animations.find((a) => a.name === "idle") || gltf.animations[0];
  if (idle) mixer.clipAction(idle).play();

  /* ---------- skeleton helpers ---------- */
  const q1 = new THREE.Quaternion();
  function setWorldQuat(b, worldQ) {
    const pq = wq(b.parent).invert();
    b.quaternion.copy(pq.multiply(worldQ));
    b.updateMatrixWorld(true);
  }
  function rotateWorld(b, axis, angle) {
    q1.setFromAxisAngle(axis, angle);
    setWorldQuat(b, q1.clone().multiply(wq(b)));
  }
  function aim(b, child, target) {
    const p = wp(b);
    const cur = wp(child).sub(p).normalize();
    const des = target.clone().sub(p).normalize();
    q1.setFromUnitVectors(cur, des);
    setWorldQuat(b, q1.clone().multiply(wq(b)));
  }
  function solve(S, T, pole) {
    const d = T.clone().sub(S);
    let dist = Math.min(Math.max(d.length(), Math.abs(L1 - L2) + 0.01), L1 + L2 - 0.004);
    const dir = d.normalize();
    const a = (L1 * L1 + dist * dist - L2 * L2) / (2 * dist);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return { E: S.clone().addScaledVector(dir, a).addScaledVector(p, h), W: S.clone().addScaledVector(dir, dist) };
  }
  function poseArm(side, target, fingerDir, roll, curl) {
    const sx = side === "Left" ? 1 : -1;
    const S = wp(B[side + "Arm"]);
    const { E, W } = solve(S, target, V(sx, -0.55, -0.45).normalize());
    aim(B[side + "Arm"], B[side + "ForeArm"], E);
    aim(B[side + "ForeArm"], B[side + "Hand"], W);
    aim(B[side + "Hand"], B[side + "HandMiddle1"], W.clone().add(fingerDir));
    if (roll) rotateWorld(B[side + "Hand"], W.clone().sub(E).normalize(), roll);
    const axis = new THREE.Vector3().crossVectors(fingerDir, V(0, -1, 0)).normalize();
    ["Index", "Middle", "Ring", "Pinky"].forEach((f) =>
      [1, 2, 3].forEach((k) => B[`${side}Hand${f}${k}`] && rotateWorld(B[`${side}Hand${f}${k}`], axis, curl * [0.5, 0.75, 0.55][k - 1]))
    );
    [2, 3].forEach((k) => B[`${side}HandThumb${k}`] && rotateWorld(B[`${side}HandThumb${k}`], axis, curl * 0.4));
    return { E, W };
  }

  /* ---------- mocap overlay and gaze ---------- */
  const SKEL = [
    ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
    ["LeftArm", "RightArm"], ["Neck", "Head"], ["Neck", "Spine2"], ["Spine2", "Hips"],
  ];
  const skelGeo = new THREE.BufferGeometry();
  skelGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SKEL.length * 6), 3));
  const skel = new THREE.LineSegments(skelGeo, M.line);
  skel.renderOrder = 10;
  scene.add(skel);
  const DOTS = ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "Neck", "Head", "Spine2", "Hips"];
  const dots = DOTS.map(() => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 12), M.joint);
    d.renderOrder = 11;
    scene.add(d);
    return d;
  });
  const gaze = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), M.gaze);
  scene.add(gaze);
  const gazeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.0155, 40),
    new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide, transparent: true })
  );
  gazeRing.rotation.x = -Math.PI / 2;
  scene.add(gazeRing);

  /* ---------- sizing ---------- */
  let w = 1;
  let h = 1;
  function resize() {
    const r = wrap.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    leadsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  /* ---------- selection ---------- */
  let active = "1";
  function setActive(id) {
    active = String(id);
    Object.entries(sensor).forEach(([sid, list]) =>
      list.forEach((m) => {
        if (m.material.isMeshBasicMaterial) {
          m.scale.setScalar(sid === active ? 1.5 : 1);
          return;
        }
        if (!m.userData.base) m.userData.base = m.material;
        if (sid === active) {
          if (!m.userData.hi) {
            m.userData.hi = m.userData.base.clone();
            m.userData.hi.emissive = accent.clone();
            m.userData.hi.emissiveIntensity = 0.32;
          }
          m.material = m.userData.hi;
        } else m.material = m.userData.base;
      })
    );
    Object.entries(markers).forEach(([k, b]) => b.classList.toggle("is-active", k === active));
  }
  station?.addEventListener("sensor-select", (e) => setActive(e.detail));
  const pressed = station?.querySelector('[data-sensor][aria-pressed="true"]');
  setActive(pressed ? pressed.dataset.sensor : 1);

  /* ---------- frame ---------- */
  let t = 0.4;
  const smooth = (x) => x * x * (3 - 2 * x);
  const tmpV = V();
  const hudEls = hud.children;
  let pointerX = 0;
  let pointerY = 0;

  function update(dt) {
    restLocal.forEach(([b, q]) => b.quaternion.copy(q));
    mixer.update(dt);
    root.updateMatrixWorld(true);

    const lt = t % LOOP;
    const om = Math.PI * 2 * 1.4;
    drone.updateMatrixWorld(true);
    screwMark.getWorldPosition(SCREW);

    // lean into the bench, head follows the work
    rotateWorld(B.Spine1, V(1, 0, 0), 0.16);
    rotateWorld(B.Spine2, V(1, 0, 0), 0.08);

    let reach = 0;
    let action = "fasten screw";
    let grip = 0;
    let roll = 0;
    const baseR = V(-0.11, TOP_Y + 0.085, -0.1);
    const trayW = V(-0.34, TOP_Y + 0.07, -0.13);
    let target = baseR.clone();
    if (lt < 6) {
      const k = Math.min(1, lt * 2, (6 - lt) * 2);
      target.x += Math.cos(t * om) * 0.006 * k;
      target.z += Math.sin(t * om) * 0.005 * k;
      roll = Math.sin(t * om) * 0.45 * k;
      grip = 8.4 + Math.abs(Math.sin(t * om)) * 2.6 * k;
    } else if (lt < 7) {
      reach = smooth(lt - 6);
      action = "reach for bit";
    } else if (lt < 8) {
      reach = 1;
      action = "pick bit";
      grip = 2.1 + Math.sin(t * 8) * 0.2;
    } else if (lt < 9.2) {
      reach = 1 - smooth((lt - 8) / 1.2);
      action = "return to frame";
      grip = 1.8;
    } else {
      action = "align bit to screw";
      grip = 3.4;
    }
    if (reach) target = baseR.clone().lerp(trayW, reach).add(V(0, Math.sin(reach * Math.PI) * 0.07, 0));
    const leftT = V(0.13 + Math.sin(t * 0.7) * 0.004, TOP_Y + 0.07, -0.08 + Math.cos(t * 0.5) * 0.003);

    const fwdR = V(0.25, -0.75, 1).normalize().multiplyScalar(0.1);
    const fwdL = V(-0.3, -0.85, 1).normalize().multiplyScalar(0.1);
    const R = poseArm("Right", target, fwdR, roll, 0.9);
    poseArm("Left", leftT, fwdL, 0, 0.35);

    // screwdriver in the right fist
    const fd = fwdR.clone().normalize();
    const gripPt = R.W.clone().addScaledVector(fd, 0.07).add(V(0, -0.02, 0));
    const tip = reach > 0.02 ? gripPt.clone().add(V(0.04, -0.07, 0.03)) : SCREW.clone();
    const sd = gripPt.clone().sub(tip);
    shaft.position.copy(tip).addScaledVector(sd, 0.5);
    shaft.scale.y = sd.length();
    shaft.quaternion.setFromUnitVectors(UP, sd.clone().normalize());
    handle.position.copy(gripPt).addScaledVector(sd.clone().normalize(), 0.032);
    handle.quaternion.copy(shaft.quaternion);

    // head: tilt down and turn toward the work
    const look = reach > 0.35 ? R.W.clone() : tip.clone();
    const hp = wp(B.Head);
    rotateWorld(B.Neck, V(1, 0, 0), 0.22);
    rotateWorld(B.Head, V(1, 0, 0), 0.32);
    rotateWorld(B.Head, UP, Math.atan2(look.x - hp.x, look.z - hp.z) * 0.6);

    // hardware follows bones
    attached.forEach((a) => {
      const bq = wq(a.b);
      const dq = bq.clone().multiply(a.rq.clone().invert());
      a.obj.position.copy(wp(a.b)).add(a.off.clone().applyQuaternion(dq));
      a.obj.quaternion.copy(dq).multiply(a.oq);
    });

    // overlays
    const P = skelGeo.attributes.position;
    SKEL.forEach(([a, b], i) => {
      const pa = wp(B[a]);
      const pb = wp(B[b]);
      P.setXYZ(i * 2, pa.x, pa.y, pa.z);
      P.setXYZ(i * 2 + 1, pb.x, pb.y, pb.z);
    });
    P.needsUpdate = true;
    DOTS.forEach((n, i) => dots[i].position.copy(wp(B[n])));
    const eye = wp(eyeCams[0]).lerp(wp(eyeCams[1]), 0.5);
    gaze.geometry.setFromPoints([eye, look]);
    gaze.computeLineDistances();
    gazeRing.position.copy(look).add(V(0, 0.003, 0));
    gazeRing.scale.setScalar(1 + Math.sin(t * 5) * 0.12);

    props.forEach((p, i) => (p.rotation.y = t * (i === 2 ? 0.5 : 1.6) + i * 1.3));

    hudEls[0].textContent = `REC 00:${t.toFixed(2).padStart(5, "0")}`;
    hudEls[1].textContent = `ACTION ${action}`;
    hudEls[2].textContent = `GRIP R ${grip.toFixed(1)} N`;
  }

  function draw() {
    const narrow = w / h < 0.85;
    const ang = 0.42 + Math.sin(t * 0.16) * 0.22 + pointerX * 0.12;
    const dist = narrow ? 4.0 : 3.55;
    camera.fov = narrow ? 28 : 26;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(ang) * dist, 1.9 + pointerY * 0.1, LOOK.z + Math.cos(ang) * dist);
    camera.lookAt(LOOK);
    renderer.render(scene, camera);

    Object.entries(anchors).forEach(([id, obj]) => {
      obj.getWorldPosition(tmpV).project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * w;
      const y = (-tmpV.y * 0.5 + 0.5) * h;
      const [ox, oy] = OFFSETS[id];
      markers[id].style.transform = `translate(${(x + ox).toFixed(1)}px, ${(y + oy).toFixed(1)}px)`;
      const l = leads[id];
      l.setAttribute("x1", x.toFixed(1));
      l.setAttribute("y1", y.toFixed(1));
      l.setAttribute("x2", (x + ox).toFixed(1));
      l.setAttribute("y2", (y + oy).toFixed(1));
      l.classList.toggle("is-active", id === active);
    });
  }

  wrap.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = wrap.getBoundingClientRect();
    pointerX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointerY = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  wrap.addEventListener("pointerleave", () => (pointerX = pointerY = 0));

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
    update(dt);
    draw();
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

  new MutationObserver(() => {
    accent = cssColor("--accent", "#c5ef6a");
    [M.led, M.line, M.joint, M.fov, M.gaze, gazeRing.material, grid.material].forEach((m) => m.color.copy(accent));
    Object.values(sensor).flat().forEach((m) => m.userData.hi?.emissive.copy(accent));
    if (!running) draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  figure.classList.add("is-3d");
  update(0);
  draw();
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }).observe(wrap);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
}
