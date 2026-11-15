import { initField } from "./field.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Hero field ---------- */

const field = initField($("[data-field]"));

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
    title: "Wind",
    body: "Ultrasonic anemometer and vane at 3 m. Speed, gusts and direction for micrometeorology, fire weather and spray drift models.",
    spec: [["Signals", "Speed, gust, direction"], ["Cadence", "1 Hz"], ["Accuracy", "±0.1 m/s"]],
  },
  2: {
    title: "Sunlight",
    body: "Thermopile pyranometer measuring incoming solar radiation. The energy budget behind evaporation, crop growth and solar yield.",
    spec: [["Signals", "Global irradiance, PAR"], ["Range", "285 to 3000 nm"], ["Cadence", "1 min"]],
  },
  3: {
    title: "Canopy camera",
    body: "Fixed RGB and near infrared camera aimed at the canopy. Tracks green up, flowering, stress and leaf fall frame by frame.",
    spec: [["Signals", "RGB, NIR, NDVI, phenology"], ["Cadence", "Every 10 min"], ["Labels", "Phenology stage, damage"]],
  },
  4: {
    title: "Air quality",
    body: "Radiation shielded sensor stack for particulates, gases, temperature and humidity, co-located with reference monitors for calibration.",
    spec: [["Signals", "PM1, PM2.5, PM10, NO₂, O₃, CO₂, VOCs"], ["Cadence", "1 min"], ["Calibration", "Monthly vs reference"]],
  },
  5: {
    title: "Bioacoustics",
    body: "Weatherproof recorder capturing the soundscape day and night. Birds, bats, frogs, insects and the engines and saws that interrupt them.",
    spec: [["Signals", "Audio, species, events"], ["Sample rate", "48 kHz, up to 384 kHz"], ["Labels", "Expert verified"]],
  },
  6: {
    title: "Rainfall",
    body: "Tipping bucket gauge at ground level. The trigger event that ties every other stream together.",
    spec: [["Signals", "Rain depth, intensity"], ["Resolution", "0.2 mm"], ["Cadence", "Per tip, 1 min roll up"]],
  },
  7: {
    title: "Soil profile",
    body: "Multi depth probe reading moisture, temperature and salinity at 10, 30 and 60 cm. What the satellite cannot see.",
    spec: [["Signals", "VWC, temperature, EC"], ["Depths", "10, 30, 60 cm"], ["Cadence", "15 min"]],
  },
  8: {
    title: "Water sonde",
    body: "Submerged multiparameter sonde in the nearest pond, stream or canal. Catches runoff and nutrient pulses as they happen.",
    spec: [["Signals", "pH, DO, turbidity, nitrate, level"], ["Cadence", "5 min"], ["Depth", "Up to 10 m"]],
  },
  9: {
    title: "Logger and uplink",
    body: "Edge logger with GPS disciplined clock. Buffers months of data and sends it home over whatever the site allows.",
    spec: [["Time sync", "GPS, ±1 ms"], ["Uplink", "LoRa, LTE-M, satellite"], ["Autonomy", "14 days without sun"]],
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
    () => [id("SOL"), `VWC 30cm ${rnd(18, 34)}%`, "OK"],
    () => [id("SOL"), `EC 10cm ${rnd(0.2, 1.8, 2)} dS/m`, "OK"],
    () => [id("H2O"), `NO₃ ${rnd(0.8, 4.2, 2)} mg/L`, `TURB ${rnd(4, 40, 0)} NTU`],
    () => [id("H2O"), `DO ${rnd(6, 9.5)} mg/L`, `pH ${rnd(6.6, 8.2)}`],
    () => [id("AIR"), `PM2.5 ${rnd(8, 90, 0)} µg/m³`, "CALIBRATED"],
    () => [id("AIR"), `NO₂ ${rnd(4, 48, 0)} ppb`, "OK"],
    () => [id("BIO"), `${pick(["DAWN CHORUS", "DUSK CHORUS", "NIGHT PASS"])}`, `${rnd(6, 31, 0)} SPECIES TAGGED`],
    () => [id("BIO"), `BAT PASS ${rnd(20, 60, 0)} kHz`, "LABELLED"],
    () => [id("CAN"), `NDVI ${rnd(0.42, 0.88, 2)}`, `FRAME ${rnd(1000, 24000, 0)}`],
    () => [id("MET"), `GUST ${rnd(2, 18)} m/s ${pick(["N", "NE", "E", "SE", "S", "SW", "W", "NNW"])}`, "OK"],
    () => [id("MET"), `RAIN ${rnd(0.2, 6)} mm`, "EVENT OPEN"],
    () => ["SYS", `${id("STN")} UPLINK ${pick(["LORA", "LTE-M", "SAT"])}`, "SYNCED"],
    () => ["QA", `BATCH ${rnd(7000, 9999, 0)} PASSED`, `${rnd(0, 0.09, 2)}% GAPS FILLED`],
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
    const modalities = data.getAll("modality");
    const payload = {
      name: data.get("name").trim(),
      email: data.get("email").trim(),
      company: data.get("company").trim(),
      modalities: modalities.join(", ") || "Not specified",
      message: (data.get("message") || "").trim(),
      source: location.href,
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
        `Data of interest: ${payload.modalities}`,
        "",
        payload.message || "",
      ].join("\n");
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      showSuccess("Your email app should open with the request filled in. Hit send and we will reply with a sample pack.");
      return;
    }

    submit.disabled = true;
    label.textContent = "Sending";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
