/* Spot — Live view of the phone remote (controls.html).
 *
 * One row of functions (Pixelate, Roam, 3D forms…); the pads below change to
 * suit the one picked. A pad is a square with two settings on its axes. The
 * pads drive the same hidden panel inputs as the Detailed view, so everything
 * travels through the one relay path in controls.js. "cs" pads set a range's
 * centre (x) and spread (y): spread 0 is one fixed value, more is random
 * within the range.
 */
(function () {
  "use strict";

  const root = document.getElementById("live");
  const panel = document.getElementById("controls");
  if (!root || !panel) return;

  const FUNCS = [
    { id: "pixelate", label: "Pixelate", on: "ctrlEffectPixelate", pads: [{ cs: ["ctrlPixelateMin", "ctrlPixelateMax"], x: "Cell size", y: "Variation" }] },
    { id: "halftone", label: "Halftone", on: "ctrlEffectHalftone", pads: [{ cs: ["ctrlHalftoneMin", "ctrlHalftoneMax"], x: "Dot grid", y: "Variation" }] },
    { id: "ascii", label: "ASCII", on: "ctrlEffectAscii", pads: [{ cs: ["ctrlAsciiMin", "ctrlAsciiMax"], x: "Character size", y: "Variation" }] },
    { id: "colour", label: "Colour", on: "ctrlEffectDuotone", onLabel: "Duotone", palettes: true, pads: [] },
    { id: "move", label: "Move", pads: [
      { xy: ["ctrlMovePanSpeed", "ctrlMoveTiltSpeed"], x: "Pan", y: "Tilt" },
      { xy: ["ctrlMoveZoomSpeed", "ctrlStripGap"], x: "Zoom", y: "Strip gap" } ] },
    { id: "roam", label: "Roam", on: "ctrlRoamOn", pads: [
      { xy: ["ctrlRoamSpeed", "ctrlRoamSpin"], x: "Travel", y: "Spin" },
      { xy: ["ctrlRoamSpread", "ctrlRoamSize"], x: "Together ↔ Wandering", y: "Size" } ] },
    { id: "forms", label: "3D forms", on: "ctrlFormsOn", pads: [
      { cs: ["ctrlFormsOrganic", "ctrlFormsOrganicMax"], x: "Geometric ↔ Organic", y: "Mix" },
      { xy: ["ctrlFormsSize", "ctrlFormsSpin"], x: "Size", y: "Spin" },
      { xy: ["ctrlFormsLiquid", "ctrlFormsRim"], x: "Lens ↔ Liquid", y: "Edge glow" } ] },
    { id: "timing", label: "Timing", pads: [{ cs: ["ctrlSpeedMin", "ctrlSpeedMax"], x: "Hold time", y: "Variation" }] },
  ];

  const $ = (id) => document.getElementById(id);
  let selPal = 1; // which palette the colour pads edit
  const padsOf = (f) =>
    f.palettes
      ? [...f.pads, { map: true, x: "Hue", y: "Brightness" }]
      : f.pads;
  const colId = (p) => `ctrlPalette${selPal}${p.color}`;
  const mapId = (k) => (k === "Sc" ? "ctrlBackground" : `ctrlPalette${selPal}${k}`);
  let mapTarget = "Fg"; // the colour dot being dragged on the map: Fg, Bg or Sc
  let mapMode = "colour"; // "colour" (hue × brightness) or "sc" (saturation × contrast)
  const idsOf = (p) =>
    p.map
      ? mapMode === "sc" ? ["ctrlSaturation", "ctrlContrast"] : [mapId(mapTarget)]
      : p.color ? [colId(p)] : p.xy || p.cs;

  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d + 6) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    return [h * 60, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function hslToHex(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const VIEW_KEY = "spotRemoteView";
  const FUNC_KEY = "spotRemoteFunc";
  const store = {
    get(k, d) {
      try {
        return localStorage.getItem(k) || d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        /* private mode */
      }
    },
  };

  // ---- value helpers -------------------------------------------------
  const lim = (el) => ({ lo: +el.min, hi: +el.max, st: +el.step || 1 });
  function put(el, v) {
    const { lo, hi, st } = lim(el);
    v = Math.round((v - lo) / st) * st + lo;
    const s = String(+Math.min(hi, Math.max(lo, v)).toFixed(4));
    if (el.value === s) return;
    el.value = s;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const frac = (el) => {
    const { lo, hi } = lim(el);
    return hi > lo ? (+el.value - lo) / (hi - lo) : 0;
  };

  // Where a pad's dot sits (0..1 across, 0..1 up) for its current settings.
  function padPos(p) {
    if (p.color) {
      const el = $(colId(p));
      if (!el) return null;
      const [h, , lum] = hexToHsl(el.value);
      return [h / 360, lum];
    }
    if (p.xy) {
      const [x, y] = p.xy.map($);
      return x && y ? [frac(x), frac(y)] : null;
    }
    const [a, b] = p.cs.map($);
    if (!a || !b) return null;
    const { lo, hi } = lim(a);
    const c = (+a.value + +b.value) / 2;
    const h = Math.abs(+b.value - +a.value) / 2;
    const room = Math.min(c - lo, hi - c);
    return [hi > lo ? (c - lo) / (hi - lo) : 0, room > 0 ? Math.min(1, h / room) : 0];
  }

  function padSet(p, fx, fy) {
    if (p.map && mapMode === "sc") {
      const [s, c] = ["ctrlSaturation", "ctrlContrast"].map($);
      if (!s || !c) return;
      put(s, lim(s).lo + fx * (lim(s).hi - lim(s).lo));
      put(c, lim(c).lo + fy * (lim(c).hi - lim(c).lo));
      return;
    }
    if (p.map) {
      const el = $(mapId(mapTarget));
      if (!el) return;
      el.value = hslToHex(Math.min(359.9, fx * 360), 1, fy); // full colour; top is white, bottom black
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (p.color) {
      const el = $(colId(p));
      if (!el) return;
      const [, s] = hexToHsl(el.value);
      el.value = hslToHex(Math.min(359.9, fx * 360), 1, fy); // full colour; top is white, bottom black
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (p.xy) {
      const [x, y] = p.xy.map($);
      if (!x || !y) return;
      put(x, lim(x).lo + fx * (lim(x).hi - lim(x).lo));
      put(y, lim(y).lo + fy * (lim(y).hi - lim(y).lo));
      return;
    }
    const [a, b] = p.cs.map($);
    if (!a || !b) return;
    const { lo, hi } = lim(a);
    const c = lo + fx * (hi - lo);
    const h = fy * Math.min(c - lo, hi - c);
    put(a, c - h);
    put(b, c + h);
  }

  const valText = (id) => {
    const s = document.querySelector(`.val[data-for="${id}"]`);
    return s ? s.textContent : "";
  };

  // ---- building the view ---------------------------------------------
  let current = store.get(FUNC_KEY, "roam");
  if (!FUNCS.some((f) => f.id === current)) current = FUNCS[0].id;
  let scenes = { names: [], active: "" };

  root.innerHTML =
    `<div class="lv-funcs" id="lvFuncs"></div>` +
    `<div id="lvOn"></div>` +
    `<div class="lv-chips" id="lvChips"></div>` +
    `<div class="lv-pads" id="lvPads"></div>` +
    `<div id="lvPal"></div>` +
    `<div class="lv-row"><button type="button" class="lv-btn" id="lvPause">Pause</button>` +
    `<button type="button" class="lv-btn" id="lvNext">Next image</button></div>` +
    `<div class="lv-scenes" id="lvScenes"></div>`;

  const funcsEl = $("lvFuncs");
  const onEl = $("lvOn");
  const padsEl = $("lvPads");
  const chipsEl = $("lvChips");
  const palEl = $("lvPal");

  function renderFuncs() {
    funcsEl.innerHTML = FUNCS.map(
      (f) => `<button type="button" class="lv-func" data-f="${f.id}" aria-pressed="${f.id === current}">${f.label}<i></i></button>`
    ).join("");
  }

  // The four palettes: tap the number to take one in or out of rotation;
  // tap a swatch to pick its highlight / shadow colour (the phone's own picker).
  function paletteHtml() {
    const dot = (id, label) =>
      `<label class="lv-dotc" title="${label}"><input type="color" data-id="${id}" aria-label="${label}"></label>`;
    let h = `<p class="lv-h">Duotone palettes <span class="lv-key">tap a number to edit that palette · dots: foreground, background</span></p><div class="lv-pals">`;
    for (let n = 1; n <= 4; n++) {
      h +=
        `<div class="lv-pal-cell"><button type="button" class="lv-pal-n" data-n="${n}" aria-label="Edit palette ${n}">${n}</button>` +
        dot(`ctrlPalette${n}Fg`, `Palette ${n} foreground (highlights)`) +
        dot(`ctrlPalette${n}Bg`, `Palette ${n} background (shadows)`) +
        `</div>`;
    }
    h += `</div><p class="lv-h">Screen</p><div class="lv-pals"><div class="lv-pal-cell lv-screen">` + dot("ctrlBackground", "Screen background colour") + `<span class="lv-cap">Screen background</span></div></div>`;
    return h + `<button type="button" class="lv-btn lv-wide" id="lvPalOn"></button><button type="button" class="lv-btn lv-wide" id="lvPalRand">Random palette each image</button>`;
  }

  function renderPads() {
    const f = FUNCS.find((x) => x.id === current);
    onEl.innerHTML = f.on
      ? `<button type="button" class="lv-on" id="lvOnBtn" data-for="${f.on}">${f.onLabel || f.label}<span></span></button>`
      : "";
    padsEl.className = "lv-pads" + (padsOf(f).length === 1 ? " one" : "");
    palEl.innerHTML = f.palettes ? paletteHtml() : "";
    chipsEl.innerHTML = f.palettes
      ? [["Fg", "Foreground"], ["Bg", "Background"], ["Sc", "Screen"], ["SC", "Saturation · Contrast"]]
          .map(([k, n]) => `<button type="button" class="lv-chip" data-m="${k}">${n}</button>`)
          .join("")
      : "";
    padsEl.innerHTML = padsOf(f)
      .map(
        (p, i) =>
          p.map
            ? `<div class="lv-pad lv-hue lv-map" data-i="${i}" tabindex="0" role="group" aria-label="Colour map: foreground, background and screen colours">` +
              `<span class="lv-md" data-k="Fg">F</span><span class="lv-md" data-k="Bg">B</span><span class="lv-md" data-k="Sc">S</span><span class="lv-md lv-mdsc" data-k="SC">◐</span>` +
              `<span class="lv-tag lv-tx"></span><span class="lv-tag lv-ty"></span><span class="lv-tag lv-tv"></span></div>`
            : `<div class="lv-pad${p.color ? " lv-hue" : ""}" data-i="${i}" tabindex="0" role="group" aria-label="${p.title ? p.title + " " : ""}${p.x} and ${p.y}">` +
          `<span class="lv-zero lv-zx" hidden></span><span class="lv-zero lv-zy" hidden></span>` +
          `<span class="lv-dot"></span>` +
          `<span class="lv-tag lv-tx">${p.x} →</span><span class="lv-tag lv-ty">${p.title ? p.title + " · " : ""}↑ ${p.y}</span>` +
          `<span class="lv-tag lv-tv"></span></div>`
      )
      .join("");
    refresh();
  }

  function refresh() {
    const f = FUNCS.find((x) => x.id === current);
    padsEl.querySelectorAll(".lv-pad").forEach((pad) => {
      const p = padsOf(f)[+pad.dataset.i];
      if (p.map) {
        const sc = mapMode === "sc";
        pad.classList.toggle("lv-sc", sc);
        pad.querySelectorAll(".lv-md").forEach((d) => {
          const isSC = d.dataset.k === "SC";
          d.hidden = sc !== isSC;
          if (isSC) {
            const [s, c] = ["ctrlSaturation", "ctrlContrast"].map($);
            if (s && c) {
              d.style.left = `${frac(s) * 100}%`;
              d.style.top = `${(1 - frac(c)) * 100}%`;
            }
            return;
          }
          const el = $(mapId(d.dataset.k));
          if (!el) return;
          const [h, , lum] = hexToHsl(el.value);
          d.style.left = `${(h / 360) * 100}%`;
          d.style.top = `${(1 - lum) * 100}%`;
          d.style.setProperty("--c", el.value);
          d.classList.toggle("is-active", d.dataset.k === mapTarget);
        });
        pad.querySelector(".lv-tx").textContent = sc ? "Saturation →" : "Hue →";
        pad.querySelector(".lv-ty").textContent = sc ? "↑ Contrast" : "↑ Brightness";
        pad.querySelector(".lv-tv").textContent = sc
          ? `${valText("ctrlSaturation")} · ${valText("ctrlContrast")}`
          : "F foreground · B background · S screen";
        return;
      }
      const pos = padPos(p);
      if (!pos) return;
      pad.style.setProperty("--px", `${pos[0] * 100}%`);
      pad.style.setProperty("--py", `${(1 - pos[1]) * 100}%`);
      // Middle lines for signed settings (spin, pan, tilt…).
      if (p.color) {
        const el = $(colId(p));
        pad.style.setProperty("--dc", el ? el.value : "#fff");
        pad.querySelector(".lv-tv").textContent = el ? el.value : "";
        return;
      }
      const ids = p.xy || [];
      [["lv-zx", ids[0], true], ["lv-zy", ids[1], false]].forEach(([cls, id, horiz]) => {
        const el = id && $(id);
        const mark = pad.querySelector("." + cls);
        if (el && +el.min < 0 && +el.max > 0) {
          const z = (0 - +el.min) / (+el.max - +el.min);
          mark.hidden = false;
          mark.style[horiz ? "left" : "top"] = `${(horiz ? z : 1 - z) * 100}%`;
        } else mark.hidden = true;
      });
      const ax = p.xy ? valText(p.xy[0]) : valText(p.cs[0]) + "–" + valText(p.cs[1]);
      const ay = p.xy ? valText(p.xy[1]) : "";
      pad.querySelector(".lv-tv").textContent = ay ? `${ax} · ${ay}` : ax;
    });
    palEl.querySelectorAll("input[data-id]").forEach((inp) => {
      const src = $(inp.dataset.id);
      if (src && inp.value !== src.value && document.activeElement !== inp) inp.value = src.value;
    });
    palEl.querySelectorAll(".lv-pal-n").forEach((b) => {
      const sw = $(`ctrlPalette${b.dataset.n}Enabled`);
      b.classList.toggle("is-on", !!(sw && sw.checked));
      b.classList.toggle("is-sel", +b.dataset.n === selPal);
    });
    chipsEl.querySelectorAll(".lv-chip").forEach((c) => {
      const on = mapMode === "sc" ? c.dataset.m === "SC" : c.dataset.m === mapTarget;
      c.classList.toggle("is-on", on);
    });
    const po = $("lvPalOn");
    if (po) {
      const sw = $(`ctrlPalette${selPal}Enabled`);
      po.classList.toggle("is-on", !!(sw && sw.checked));
      po.textContent = `Palette ${selPal}: ${sw && sw.checked ? "in rotation" : "out of rotation"}`;
    }
    const pr = $("lvPalRand");
    if (pr) pr.classList.toggle("is-on", !!($("ctrlPaletteRandomize") || {}).checked);
    FUNCS.forEach((fn) => {
      const b = funcsEl.querySelector(`[data-f="${fn.id}"]`);
      const sw = fn.on && $(fn.on);
      if (b) b.classList.toggle("is-on", !!(sw && sw.checked));
    });
    const onBtn = $("lvOnBtn");
    if (onBtn) {
      const sw = $(onBtn.dataset.for);
      onBtn.classList.toggle("is-on", !!(sw && sw.checked));
      onBtn.querySelector("span").textContent = sw && sw.checked ? "ON" : "off";
    }
    const pause = $("ctrlAutoCycle");
    const pb = $("lvPause");
    if (pause && pb) pb.textContent = pause.checked ? "Pause" : "Resume";
    document.querySelectorAll("#lvScenes button").forEach((b) => b.classList.toggle("is-on", b.dataset.name === scenes.active));
  }

  function setScenes(msg) {
    scenes = { names: msg.names || [], active: msg.active || "" };
    $("lvScenes").innerHTML = scenes.names
      .slice(0, 24)
      .map((n, i) => `<button type="button" class="lv-scene" data-i="${i}" data-name="${n.replace(/"/g, "&quot;")}" title="${n.replace(/"/g, "&quot;")}">${i + 1}</button>`)
      .join("");
    refresh();
  }

  // ---- interaction ---------------------------------------------------
  funcsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    current = b.dataset.f;
    store.set(FUNC_KEY, current);
    funcsEl.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderPads();
  });

  onEl.addEventListener("click", (e) => {
    const b = e.target.closest("#lvOnBtn");
    const sw = b && $(b.dataset.for);
    if (!sw) return;
    sw.checked = !sw.checked;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
  });

  palEl.addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-id]");
    const src = inp && $(inp.dataset.id);
    if (!src) return;
    src.value = inp.value;
    src.dispatchEvent(new Event("input", { bubbles: true }));
  });
  palEl.addEventListener("change", (e) => {
    const inp = e.target.closest("input[data-id]");
    const src = inp && $(inp.dataset.id);
    if (src) src.dispatchEvent(new Event("change", { bubbles: true }));
  });
  palEl.addEventListener("click", (e) => {
    const flip = (id) => {
      const sw = $(id);
      if (!sw) return;
      sw.checked = !sw.checked;
      sw.dispatchEvent(new Event("change", { bubbles: true }));
      refresh();
    };
    const n = e.target.closest(".lv-pal-n");
    if (n) {
      selPal = +n.dataset.n;
      refresh();
    } else if (e.target.closest("#lvPalOn")) flip(`ctrlPalette${selPal}Enabled`);
    else if (e.target.closest("#lvPalRand")) flip("ctrlPaletteRandomize");
  });

  chipsEl.addEventListener("click", (e) => {
    const c = e.target.closest(".lv-chip");
    if (!c) return;
    if (c.dataset.m === "SC") mapMode = "sc";
    else {
      mapMode = "colour";
      mapTarget = c.dataset.m;
    }
    refresh();
  });

  let drag = null;
  function fromPointer(e, pad) {
    const f = FUNCS.find((x) => x.id === current);
    const p = padsOf(f)[+pad.dataset.i];
    const r = pad.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    padSet(p, fx, fy);
    refresh();
  }
  padsEl.addEventListener("pointerdown", (e) => {
    const pad = e.target.closest(".lv-pad");
    if (!pad) return;
    pad.setPointerCapture(e.pointerId);
    drag = pad;
    if (pad.classList.contains("lv-map") && mapMode === "colour") {
      // Grab the nearest of the three colour dots, wherever you touch.
      const r = pad.getBoundingClientRect();
      let best = Infinity;
      pad.querySelectorAll(".lv-md").forEach((d) => {
        if (d.hidden || d.dataset.k === "SC") return;
        const b = d.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
        if (dist < best - 0.5) {
          best = dist;
          mapTarget = d.dataset.k;
        }
      });
    }
    fromPointer(e, pad);
    e.preventDefault();
  });
  padsEl.addEventListener("pointermove", (e) => {
    if (drag && drag.hasPointerCapture(e.pointerId)) fromPointer(e, drag);
  });
  const endDrag = () => {
    if (!drag) return;
    const f = FUNCS.find((x) => x.id === current);
    const p = padsOf(f)[+drag.dataset.i];
    idsOf(p).forEach((id) => $(id) && $(id).dispatchEvent(new Event("change", { bubbles: true })));
    drag = null;
  };
  padsEl.addEventListener("pointerup", endDrag);
  padsEl.addEventListener("pointercancel", endDrag);
  padsEl.addEventListener("dblclick", (e) => {
    const pad = e.target.closest(".lv-pad");
    if (!pad) return;
    const f = FUNCS.find((x) => x.id === current);
    idsOf(padsOf(f)[+pad.dataset.i]).forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "color") {
        el.value = el.defaultValue;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else put(el, +el.defaultValue);
    });
    refresh();
  });

  $("lvScenes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b && window.SpotRemote) window.SpotRemote.post({ type: "scene", index: +b.dataset.i });
  });
  $("lvNext").addEventListener("click", () => window.SpotRemote && window.SpotRemote.post({ type: "next" }));
  $("lvPause").addEventListener("click", () => {
    const sw = $("ctrlAutoCycle");
    if (!sw) return;
    sw.checked = !sw.checked;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
  });

  // ---- Live / Detailed switch ----------------------------------------
  function setView(v) {
    store.set(VIEW_KEY, v);
    root.hidden = v !== "live";
    panel.style.display = v === "live" ? "none" : "";
    document.querySelectorAll("#viewBar [data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    if (v === "live") refresh();
  }
  document.querySelectorAll("#viewBar [data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  renderFuncs();
  renderPads();
  setView(store.get(VIEW_KEY, "live"));
  panel.addEventListener("input", refresh);
  panel.addEventListener("change", refresh);

  window.SpotLive = { refresh, setScenes };
})();
