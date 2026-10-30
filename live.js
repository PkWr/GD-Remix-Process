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
    { id: "colour", label: "Colour", on: "ctrlEffectDuotone", onLabel: "Duotone", palettes: true, pads: [{ xy: ["ctrlSaturation", "ctrlContrast"], x: "Saturation", y: "Contrast" }] },
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
    `<div class="lv-pads" id="lvPads"></div>` +
    `<div id="lvPal"></div>` +
    `<div class="lv-row"><button type="button" class="lv-btn" id="lvPause">Pause</button>` +
    `<button type="button" class="lv-btn" id="lvNext">Next image</button></div>` +
    `<div class="lv-scenes" id="lvScenes"></div>`;

  const funcsEl = $("lvFuncs");
  const onEl = $("lvOn");
  const padsEl = $("lvPads");
  const palEl = $("lvPal");

  function renderFuncs() {
    funcsEl.innerHTML = FUNCS.map(
      (f) => `<button type="button" class="lv-func" data-f="${f.id}" aria-pressed="${f.id === current}">${f.label}<i></i></button>`
    ).join("");
  }

  // The four palettes: tap the number to take one in or out of rotation;
  // tap a swatch to pick its highlight / shadow colour (the phone's own picker).
  function paletteHtml() {
    let h = `<p class="lv-h">Duotone palettes</p>`;
    for (let n = 1; n <= 4; n++) {
      h +=
        `<div class="lv-pal-row"><button type="button" class="lv-pal-n" data-n="${n}" aria-label="Palette ${n} in rotation">${n}</button>` +
        `<label class="lv-sw"><input type="color" data-id="ctrlPalette${n}Fg" aria-label="Palette ${n} highlights"><span>Highlights</span></label>` +
        `<label class="lv-sw"><input type="color" data-id="ctrlPalette${n}Bg" aria-label="Palette ${n} shadows"><span>Shadows</span></label></div>`;
    }
    return h + `<button type="button" class="lv-btn lv-wide" id="lvPalRand">Random palette each image</button>`;
  }

  function renderPads() {
    const f = FUNCS.find((x) => x.id === current);
    onEl.innerHTML = f.on
      ? `<button type="button" class="lv-on" id="lvOnBtn" data-for="${f.on}">${f.onLabel || f.label}<span></span></button>`
      : "";
    padsEl.className = "lv-pads" + (f.pads.length === 1 ? " one" : "");
    palEl.innerHTML = f.palettes ? paletteHtml() : "";
    padsEl.innerHTML = f.pads
      .map(
        (p, i) =>
          `<div class="lv-pad" data-i="${i}" tabindex="0" role="group" aria-label="${p.x} and ${p.y}">` +
          `<span class="lv-zero lv-zx" hidden></span><span class="lv-zero lv-zy" hidden></span>` +
          `<span class="lv-dot"></span>` +
          `<span class="lv-tag lv-tx">${p.x} →</span><span class="lv-tag lv-ty">↑ ${p.y}</span>` +
          `<span class="lv-tag lv-tv"></span></div>`
      )
      .join("");
    refresh();
  }

  function refresh() {
    const f = FUNCS.find((x) => x.id === current);
    padsEl.querySelectorAll(".lv-pad").forEach((pad) => {
      const p = f.pads[+pad.dataset.i];
      const pos = padPos(p);
      if (!pos) return;
      pad.style.setProperty("--px", `${pos[0] * 100}%`);
      pad.style.setProperty("--py", `${(1 - pos[1]) * 100}%`);
      // Middle lines for signed settings (spin, pan, tilt…).
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
    });
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
    if (n) flip(`ctrlPalette${n.dataset.n}Enabled`);
    else if (e.target.closest("#lvPalRand")) flip("ctrlPaletteRandomize");
  });

  let drag = null;
  function fromPointer(e, pad) {
    const f = FUNCS.find((x) => x.id === current);
    const p = f.pads[+pad.dataset.i];
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
    fromPointer(e, pad);
    e.preventDefault();
  });
  padsEl.addEventListener("pointermove", (e) => {
    if (drag && drag.hasPointerCapture(e.pointerId)) fromPointer(e, drag);
  });
  const endDrag = () => {
    if (!drag) return;
    const f = FUNCS.find((x) => x.id === current);
    const p = f.pads[+drag.dataset.i];
    (p.xy || p.cs).forEach((id) => $(id) && $(id).dispatchEvent(new Event("change", { bubbles: true })));
    drag = null;
  };
  padsEl.addEventListener("pointerup", endDrag);
  padsEl.addEventListener("pointercancel", endDrag);
  padsEl.addEventListener("dblclick", (e) => {
    const pad = e.target.closest(".lv-pad");
    if (!pad) return;
    const f = FUNCS.find((x) => x.id === current);
    (f.pads[+pad.dataset.i].xy || f.pads[+pad.dataset.i].cs).forEach((id) => {
      const el = $(id);
      if (el) put(el, +el.defaultValue);
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
