import { initHands } from "./hands.js";
import { initRig } from "./rig.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Hero scene ---------- */

const field = initHands($("[data-hands]"));
initRig($("[data-rig]"));

/* ---------- Theme ---------- */

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncThemeUI() {
  const btn = $("[data-theme-toggle]");
  const next = currentTheme() === "light" ? "dark" : "light";
  btn?.setAttribute("aria-label", `Switch to ${next} theme`);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = currentTheme() === "light" ? "#E8EADF" : "#0E120F";
}

$("[data-theme-toggle]")?.addEventListener("click", () => {
  const next = currentTheme() === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("avcon-theme", next);
  } catch (e) {
    /* storage unavailable: theme still applies for this visit */
  }
  syncThemeUI();
  field?.refresh();
});
syncThemeUI();

/* ---------- Header state and active nav ---------- */

const header = $("[data-header]");
const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 12);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

const navLinks = $$(".site-nav a");
const navTargets = navLinks.map((a) => $(a.getAttribute("href"))).filter(Boolean);
if ("IntersectionObserver" in window && navTargets.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) =>
          a.setAttribute("aria-current", a.getAttribute("href") === `#${entry.target.id}` ? "true" : "false")
        );
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  navTargets.forEach((t) => navObserver.observe(t));
}

/* ---------- Clock and year ---------- */

const clock = $("[data-clock]");
if (clock) {
  const tick = () => {
    clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  setInterval(tick, 1000);
}

// Frame counter in the hero, ticking at 30 fps from a fixed start.
const frameEl = $("[data-frame]");
if (frameEl && !reduceMotion) {
  const t0 = performance.now();
  setInterval(() => {
    const f = 18224 + Math.floor(((performance.now() - t0) / 1000) * 30);
    frameEl.textContent = f.toLocaleString("en-US").padStart(6, "0");
  }, 100);
}
$$("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));

/* ---------- Reveal on scroll ---------- */

const revealEls = $$("[data-reveal]");
if (!reduceMotion && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  revealEls.forEach((el) => revealObserver.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Station explorer ---------- */

const SENSORS = {
  1: {
    title: "Stereo head camera",
    body: "Forehead mounted stereo pair that sees exactly what the operator sees, with hands, tools and parts in frame.",
    spec: [["Signals", "Stereo RGB video"], ["Resolution", "2 × 4K at 30 fps, or 1080p at 60"], ["Field of view", "120° diagonal"]],
  },
  2: {
    title: "Depth",
    body: "Time of flight depth aligned to the head camera, giving 3D geometry for hands, tools and parts.",
    spec: [["Signals", "Depth map, point cloud"], ["Range", "0.2 to 4 m"], ["Rate", "30 fps"]],
  },
  3: {
    title: "Eye tracking",
    body: "Gaze shows a model where attention goes before the hands move: which screw, which connector, which edge.",
    spec: [["Signals", "Gaze vector, fixations, pupil"], ["Rate", "120 Hz"], ["Labels", "Fixation targets"]],
  },
  4: {
    title: "Wrist cameras",
    body: "Close up views from each wrist for fine manipulation the head camera cannot resolve: pins, threads, wires.",
    spec: [["Signals", "RGB video, 2 units"], ["Resolution", "1080p at 60 fps"], ["Labels", "Contact, grasp type"]],
  },
  5: {
    title: "Tactile gloves",
    body: "Thin pressure sensing gloves across palm and fingers, so grip force is in the data instead of guessed.",
    spec: [["Signals", "Pressure map per hand"], ["Resolution", "120 taxels, 100 Hz"], ["Labels", "Contact, peak force, slip"]],
  },
  6: {
    title: "Motion suit",
    body: "Nine axis IMUs on the forearms, upper arms and chest for full upper body motion and posture.",
    spec: [["Signals", "Joint angles, acceleration"], ["Nodes", "7 IMUs"], ["Rate", "200 Hz"]],
  },
  7: {
    title: "Audio",
    body: "Tool sounds and optional think aloud narration from the operator, transcribed and time aligned to each step.",
    spec: [["Signals", "Audio, transcript"], ["Sample rate", "48 kHz"], ["Labels", "Narration, tool events"]],
  },
  8: {
    title: "Workcell cameras",
    body: "Fixed third person views of the work area, calibrated to the head rig for multi view 3D reconstruction.",
    spec: [["Signals", "Synced RGB views"], ["Units", "2 to 6 per cell"], ["Labels", "Scene layout, 3D pose"]],
  },
  9: {
    title: "Recorder and sync",
    body: "Belt worn recorder with a hardware clock across every stream. Encrypted on device, offloaded at end of shift.",
    spec: [["Time sync", "Hardware, ±1 ms"], ["Battery", "Full 8 hour shift"], ["Storage", "Encrypted on device"]],
  },
};

const station = $("[data-station]");
if (station) {
  const buttons = $$("[data-sensor]", station);
  const hotspots = $$(".hs", station);
  const parts = $$(".st-part", station);
  const detail = $("#sensor-detail");
  const kicker = $("[data-detail-kicker]", detail);
  const title = $("[data-detail-title]", detail);
  const body = $("[data-detail-body]", detail);
  const spec = $("[data-detail-spec]", detail);

  const select = (id, { animate = true } = {}) => {
    const data = SENSORS[id];
    if (!data) return;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sensor === String(id))));
    hotspots.forEach((h) => h.classList.toggle("is-active", h.dataset.hs === String(id)));
    parts.forEach((p) => p.classList.toggle("is-active", p.dataset.part === String(id)));

    kicker.textContent = `Sensor ${String(id).padStart(2, "0")}`;
    title.textContent = data.title;
    body.textContent = data.body;
    spec.replaceChildren(
      ...data.spec.map(([k, v]) => {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = k;
        dd.textContent = v;
        row.append(dt, dd);
        return row;
      })
    );
    if (animate && !reduceMotion) {
      detail.classList.remove("is-swapping");
      void detail.offsetWidth;
      detail.classList.add("is-swapping");
    }
  };

  buttons.forEach((b) => {
    b.addEventListener("click", () => select(b.dataset.sensor));
  });
  hotspots.forEach((h) => {
    h.addEventListener("click", () => select(h.dataset.hs));
  });
  select(1, { animate: false });
}

/* ---------- Annotation viewer ---------- */

const annot = $("[data-annot]");
if (annot) {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Vertex handles on every polygon, like an annotation tool.
  $$("polygon[data-handles]", annot).forEach((poly) => {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "handles");
    g.setAttribute("style", poly.getAttribute("style") || "");
    poly
      .getAttribute("points")
      .trim()
      .split(/\s+/)
      .forEach((pt) => {
        const [x, y] = pt.split(",").map(Number);
        const r = document.createElementNS(SVG_NS, "rect");
        r.setAttribute("x", x - 3);
        r.setAttribute("y", y - 3);
        r.setAttribute("width", 6);
        r.setAttribute("height", 6);
        g.append(r);
      });
    poly.after(g);
  });

  // Fit label tags to their text once fonts are in.
  const fitTags = (root) =>
    $$(".tag", root).forEach((tag) => {
      const text = tag.querySelector("text");
      const rect = tag.querySelector("rect");
      try {
        const len = text.getComputedTextLength();
        if (len > 0) rect.setAttribute("width", Math.ceil(len + 12));
      } catch (e) {
        /* hidden panels cannot be measured yet */
      }
    });

  const tabs = $$('[role="tab"]', annot);
  const panels = $$('[role="tabpanel"]', annot);
  const activate = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p) => {
      const on = p.id === tab.getAttribute("aria-controls");
      p.hidden = !on;
      p.classList.toggle("is-active", on);
      if (on) fitTags(p);
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        activate(next, true);
      }
    });
  });
  document.fonts?.ready.then(() => fitTags(panels.find((p) => !p.hidden)));
}

/* ---------- Carousel ---------- */

const carousel = $("[data-carousel]");
if (carousel) {
  const step = () => {
    const card = carousel.querySelector(".use-card");
    const gap = parseFloat(getComputedStyle(carousel).columnGap) || 16;
    return card ? card.getBoundingClientRect().width + gap : 400;
  };
  const scrollBy = (dir) =>
    carousel.scrollBy({ left: dir * step(), behavior: reduceMotion ? "auto" : "smooth" });
  $("[data-carousel-prev]")?.addEventListener("click", () => scrollBy(-1));
  $("[data-carousel-next]")?.addEventListener("click", () => scrollBy(1));
  carousel.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollBy(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollBy(-1);
    }
  });
}

/* ---------- Field log ---------- */

const log = $("[data-log]");
if (log) {
  const rnd = (min, max, dp = 1) => (min + Math.random() * (max - min)).toFixed(dp);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const id = (prefix) => `${prefix}-${String(Math.floor(Math.random() * 320) + 1).padStart(3, "0")}`;
  const templates = [
    () => [id("EGO"), `${pick(["DRONE REPAIR", "PCB REWORK", "LINE ASSEMBLY", "PICK AND PACK", "SEWING", "HOT LINE PREP"])} · CLIP ${rnd(100, 999, 0)}`, `${rnd(1, 4, 0)}m${rnd(10, 59, 0)}s`],
    () => ["ANN", `HAND KP 21 × 2 · FRAME ${rnd(1000, 24000, 0)}`, "VERIFIED"],
    () => ["ANN", `ACTION "${pick(["fasten screw", "seat connector", "fold shirt", "solder joint", "scan parcel", "swap rotor"])}" ${rnd(0.8, 6)} s`, "LABELLED"],
    () => [id("TAC"), `GRIP PEAK ${rnd(4, 18)} N · ${pick(["INDEX TIP", "THUMB TIP", "PALM"])}`, "OK"],
    () => [id("GAZ"), `FIXATION ${rnd(120, 900, 0)} ms`, "TARGET TAGGED"],
    () => [id("MOT"), `WRIST ROT ${rnd(0.4, 2.2)} rad/s`, "OK"],
    () => ["SYNC", `7 STREAMS · DRIFT ${rnd(0.1, 0.9)} ms`, "PASS"],
    () => [id("EXO"), `CALIB REPROJ ${rnd(0.2, 0.5, 2)} px`, "PASS"],
    () => ["PRIV", `${rnd(1, 9, 0)} FACES BLURRED · CLIP ${rnd(100, 999, 0)}`, "OK"],
    () => ["QA", `BATCH ${rnd(7000, 9999, 0)} PASSED`, `κ ${rnd(0.9, 0.97, 2)}`],
  ];

  const MAX = 22;
  const addLine = () => {
    const [src, msg, status] = pick(templates)();
    const li = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = new Date().toISOString().slice(11, 19);
    const tag = document.createElement("b");
    tag.textContent = src;
    li.append(time, tag, document.createTextNode(` · ${msg} · ${status}`));
    log.append(li);
    while (log.children.length > MAX) log.firstElementChild.remove();
  };

  for (let i = 0; i < 14; i++) addLine();

  let logTimer = 0;
  const startLog = () => {
    if (logTimer || reduceMotion) return;
    logTimer = window.setInterval(addLine, 1100);
  };
  const stopLog = () => {
    clearInterval(logTimer);
    logTimer = 0;
  };
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? startLog() : stopLog())).observe(log);
}

/* ---------- Request sample dialog ---------- */

const dialog = $("[data-sample-dialog]");
const form = $("[data-sample-form]");
const success = $("[data-form-success]");
const formStatus = $("[data-form-status]");
let lastTrigger = null;
const DEFAULT_SUCCESS = $("[data-success-msg]")?.textContent || "";

function openSample(trigger) {
  if (!dialog) return;
  lastTrigger = trigger || document.activeElement;
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  document.documentElement.style.overflow = "hidden";
  setTimeout(() => $("#f-name")?.focus(), 50);
}

function closeSample() {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

dialog?.addEventListener("close", () => {
  document.documentElement.style.overflow = "";
  if (location.hash === "#request-sample") history.replaceState(null, "", location.pathname + location.search);
  // Reset to a fresh form if the last request went through.
  if (success && !success.hidden) {
    success.hidden = true;
    $("[data-success-msg]").textContent = DEFAULT_SUCCESS;
    form.hidden = false;
    form.reset();
  }
  lastTrigger?.focus?.();
});

$$("[data-open-sample]").forEach((btn) => btn.addEventListener("click", () => openSample(btn)));
$$("[data-close-sample]").forEach((btn) => btn.addEventListener("click", closeSample));

// Click on the backdrop closes the dialog.
dialog?.addEventListener("click", (e) => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) closeSample();
});

// Deep link: /#request-sample opens the form.
if (location.hash === "#request-sample") openSample();
window.addEventListener("hashchange", () => {
  if (location.hash === "#request-sample") openSample();
});

/* Validation */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const rules = {
  name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
  email: (v) => (!v.trim() ? "Please enter your work email." : EMAIL_RE.test(v.trim()) ? "" : "That email does not look right."),
  company: (v) => (v.trim().length >= 2 ? "" : "Please enter your company."),
};

function validateField(input) {
  const rule = rules[input.name];
  if (!rule) return true;
  const msg = rule(input.value);
  const err = $(`#${input.id}-err`);
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  if (err) err.textContent = msg;
  return !msg;
}

if (form) {
  Object.keys(rules).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener("blur", () => input.value && validateField(input));
    input.addEventListener("input", () => input.getAttribute("aria-invalid") === "true" && validateField(input));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formStatus.textContent = "";

    const inputs = Object.keys(rules).map((n) => form.elements[n]);
    const results = inputs.map(validateField);
    const firstInvalid = inputs[results.indexOf(false)];
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    // Honeypot: bots fill hidden fields. Pretend success, send nothing.
    if (form.elements.website.value) {
      showSuccess();
      return;
    }

    const data = new FormData(form);
    data.delete("website");
    const modalities = data.getAll("domain");
    const payload = {
      name: data.get("name").trim(),
      email: data.get("email").trim(),
      company: data.get("company").trim(),
      modalities: modalities.join(", ") || "Not specified",
      message: (data.get("message") || "").trim(),
      source: location.href,
    };
    // Field names as they appear in the email that lands in the inbox.
    const emailBody = {
      Name: payload.name,
      Email: payload.email,
      Company: payload.company,
      "Domains": payload.modalities,
      "Task to learn": payload.message || "Not specified",
      "Submitted from": payload.source,
      _subject: `avcon sample request: ${payload.company}`,
      _replyto: payload.email,
      _template: "table",
      _captcha: "false",
    };

    const endpoint = form.dataset.endpoint.trim();
    const submit = $("[data-submit]", form);
    const label = $("[data-submit-label]", form);

    if (!endpoint) {
      // No backend configured: hand off to the visitor's email app.
      const to = form.dataset.mailto;
      const subject = `Sample request: ${payload.company}`;
      const body = [
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Company: ${payload.company}`,
        `Domains: ${payload.modalities}`,
        "",
        payload.message || "",
      ].join("\n");
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      showSuccess("Your email app should open with the request filled in. Hit send and we will reply with annotated sample clips.");
      return;
    }

    submit.disabled = true;
    label.textContent = "Sending";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(emailBody),
      });
      const result = await res.json().catch(() => ({}));
      // FormSubmit replies 200 with success "false" when it refuses, for example before activation.
      if (!res.ok || result.success === false || result.success === "false") {
        throw new Error(result.message || `HTTP ${res.status}`);
      }
      showSuccess();
    } catch (err) {
      formStatus.textContent = `Something went wrong sending your request. Please try again or email ${form.dataset.mailto}.`;
    } finally {
      submit.disabled = false;
      label.textContent = "Send request";
    }
  });
}

function showSuccess(message) {
  if (message) $("[data-success-msg]").textContent = message;
  form.hidden = true;
  success.hidden = false;
  success.focus();
}
