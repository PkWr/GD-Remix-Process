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
    { id: "cells", label: "Effects", icon: "blur_on", multi: [
      { name: "Pixelate", icon: "grid_view", c: "#ff7a45", on: "ctrlEffectPixelate", cs: ["ctrlPixelateMin", "ctrlPixelateMax"], x: "Cell size", y: "Variation" },
      { name: "Halftone", icon: "scatter_plot", c: "#3fb6ff", on: "ctrlEffectHalftone", cs: ["ctrlHalftoneMin", "ctrlHalftoneMax"], x: "Dot grid", y: "Variation" },
      { name: "ASCII", icon: "abc", c: "#7be06a", on: "ctrlEffectAscii", cs: ["ctrlAsciiMin", "ctrlAsciiMax"], x: "Character size", y: "Variation" } ],
      extra: [{ name: "Untouched", icon: "image", on: "ctrlEffectNone" }] },
    { id: "colour", label: "Colour", icon: "palette", on: "ctrlEffectDuotone", onLabel: "Duotone", palettes: true, pads: [] },
    { id: "motion", label: "Motion", icon: "animation", on: "ctrlRoamOn", onLabel: "Roam", sets: [
      { chip: "Pan · Tilt", xy: ["ctrlMovePanSpeed", "ctrlMoveTiltSpeed"], title: "Move", x: "Pan", y: "Tilt" },
      { chip: "Zoom · Gap", xy: ["ctrlMoveZoomSpeed", "ctrlStripGap"], title: "Move", x: "Zoom", y: "Strip gap" },
      { chip: "Travel · Spin", needs: true, xy: ["ctrlRoamSpeed", "ctrlRoamSpin"], title: "Roam", x: "Travel", y: "Spin" },
      { chip: "Spread · Size", needs: true, xy: ["ctrlRoamSpread", "ctrlRoamSize"], title: "Roam", x: "Together ↔ Wandering", y: "Size" } ] },
    { id: "forms", label: "3D forms", icon: "view_in_ar", on: "ctrlFormsOn", sets: [
      { chip: "Organic · Mix", needs: true, cs: ["ctrlFormsOrganic", "ctrlFormsOrganicMax"], x: "Geometric ↔ Organic", y: "Mix",
        alts: [
          { shape: "rock", chip: "Rock · Mix", cs: ["ctrlFormsRock", "ctrlFormsRockMax"], x: "Triangles ↔ Rock" } ] },
      { chip: "Number · Spacing", needs: true, xy: ["ctrlFormsCount", "ctrlFormsSpacing"], x: "How many", y: "Spacing" },
      { chip: "Size · Spin", needs: true, xy: ["ctrlFormsSize", "ctrlFormsSpin"], x: "Size", y: "Spin" },
      { chip: "Lens · Glow", needs: true, xy: ["ctrlFormsLiquid", "ctrlFormsRim"], x: "Lens ↔ Liquid", y: "Edge glow" } ] },
    { id: "scenes", label: "Scenes", icon: "slideshow", scenes: true, pads: [] },
    { id: "timing", label: "Timing", icon: "timer", pads: [{ cs: ["ctrlSpeedMin", "ctrlSpeedMax"], x: "Hold time", y: "Variation" }] },
  ];

  const $ = (id) => document.getElementById(id);
  let selPal = 1; // which palette the colour pads edit
  const setIdx = {}; // per function: which pair of settings its pad edits
  // Highlight / shadow colours only matter while an effect that uses the palette is on.
  const palFx = () => ["ctrlEffectDuotone", "ctrlEffectPixelate", "ctrlEffectHalftone", "ctrlEffectAscii"].some((id) => ($(id) || {}).checked);
  let cellIdx = 0; // which of Pixelate / Halftone / ASCII the Cells pad edits
  // A set marked `needs` is only offered while the function's own switch is on.
  const shapeNow = () => ($("ctrlFormsShape") || {}).value;
  const setOf = (t) => {
    const alt = (t.alts || []).find((x) => x.shape === shapeNow());
    return alt ? { ...t, ...alt } : t;
  };
  const setOk = (f, t) => (!t.needs || ($(f.on) || {}).checked);
  const setIndex = (f) => {
    const i = setIdx[f.id] || 0;
    return f.sets[i] && setOk(f, f.sets[i]) ? i : f.sets.findIndex((t) => setOk(f, t));
  };
  const padsOf = (f) =>
    f.multi
      ? [{ multi: true, ...f.multi[cellIdx] }]
      : f.sets
      ? setIndex(f) < 0 ? [] : [setOf(f.sets[setIndex(f)])]
      : f.palettes
      ? [...f.pads, { map: true, x: "Hue", y: "Brightness" }]
      : f.pads;
  const colId = (p) => `ctrlPalette${selPal}${p.color}`;
  const mapId = (k) => (k === "Sc" ? "ctrlBackground" : `ctrlPalette${selPal}${k}`);
  const mapHue = {}; // last hue dragged to, per palette + dot: pure white / black / grey have no hue of their own
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
  // Whole-number settings with room to move snap to multiples of 5 (the ends of the range stay reachable).
  const SNAP = 5;
  const snappy = (el) => { const { lo, hi, st } = lim(el); return el.id !== "ctrlFormsCount" && st % 1 === 0 && hi - lo >= 4 * SNAP; }; // a count stays 1 by 1
  function put(el, v, raw) {
    const { lo, hi, st } = lim(el);
    if (!raw && snappy(el)) v = Math.round(v / SNAP) * SNAP;
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
      mapHue[(mapTarget === "Sc" ? "" : selPal) + mapTarget] = Math.min(359.9, fx * 360);
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

  const ico = (n, size = 20) => (window.PhotoRemixSettings ? window.PhotoRemixSettings.iconSvg(n, size) : "");
  root.innerHTML =
    `<div class="lv-funcs" id="lvFuncs"></div>` +
    `<div class="lv-chips lv-sub" id="lvSub" hidden></div>` +
    `<div id="lvOn"></div>` +
    `<div class="lv-chips" id="lvChips"></div>` +
    `<div class="lv-pads" id="lvPads"></div>` +
    `<div id="lvPal"></div>` +
    `<div class="lv-scenes" id="lvScenes" hidden></div>`;

  $("lvNext").innerHTML = ico("skip_next", 24); // Pause / Next / Reset live in the bar above both views
  const funcsEl = $("lvFuncs");
  const onEl = $("lvOn");
  const padsEl = $("lvPads");
  const chipsEl = $("lvChips");
  const palEl = $("lvPal");
  const subEl = $("lvSub");
  let colSub = "map"; // Colour page: "map" (colour pad) | "pal" (palettes) | "blend"

  function renderFuncs() {
    funcsEl.innerHTML = FUNCS.map(
      (f) => `<button type="button" class="lv-func" data-f="${f.id}" aria-pressed="${f.id === current}">${f.icon ? ico(f.icon, 18) : ""}<span>${f.label}</span><i></i></button>`
    ).join("");
  }

  // The four palettes: tap the number to take one in or out of rotation;
  // tap a swatch to pick its highlight / shadow colour (the phone's own picker).
  function paletteHtml() {
    const dot = (id, label) =>
      `<label class="lv-dotc" title="${label}"><input type="color" data-id="${id}" aria-label="${label}"></label>`;
    let h = `<div class="lv-sec" data-s="pal"><p class="lv-h">Duotone palettes <span class="lv-key">tap a number to edit that palette · dots: foreground, background</span></p><div class="lv-pals">`;
    for (let n = 1; n <= 4; n++) {
      h +=
        `<div class="lv-pal-cell"><button type="button" class="lv-pal-n" data-n="${n}" aria-label="Edit palette ${n}">${n}</button>` +
        dot(`ctrlPalette${n}Fg`, `Palette ${n} foreground (highlights)`) +
        dot(`ctrlPalette${n}Bg`, `Palette ${n} background (shadows)`) +
        `</div>`;
    }
    h += `</div><p class="lv-h">Screen</p><div class="lv-pals"><div class="lv-pal-cell lv-screen">` + dot("ctrlBackground", "Screen background colour") + `<span class="lv-cap">Screen background</span></div></div>`;
    h += `<button type="button" class="lv-btn lv-wide" id="lvPalOn"></button><button type="button" class="lv-btn lv-wide" id="lvPalRand">Random palette each image</button>`;
    // Blend overlay: on/off, which modes may be picked, how strongly, how many layers.
    h += `</div><div class="lv-sec" data-s="blend">`;
    const modes = [["Multiply", "Multiply"], ["Screen", "Screen"], ["Overlay", "Overlay"], ["Darken", "Darken"], ["Lighten", "Lighten"], ["Difference", "Difference"], ["Exclusion", "Exclusion"], ["HardLight", "Hard light"]];
    h += `<p class="lv-h">Blend overlay</p><button type="button" class="lv-btn lv-wide" id="lvBlendOn" data-flip="ctrlBlendOverlay"></button><div class="lv-chips lv-modes">`;
    h += modes.map(([k, n]) => `<button type="button" class="lv-chip" data-flip="ctrlBlendMode${k}">${n}</button>`).join("");
    h += `</div><label class="lv-rng"><span>Opacity</span><input type="range" data-id="ctrlOpacity" aria-label="Blend opacity"></label>`;
    h += `<label class="lv-rng"><span>Layers</span><input type="range" data-id="ctrlBlendLayers" aria-label="Blend layers"></label>`;
    return h + `</div>`;
  }

  function renderPads() {
    const f = FUNCS.find((x) => x.id === current);
    const fo = f.multi ? f.multi[cellIdx] : f;
    onEl.innerHTML = f.palettes || (f.sets && f.on)
      ? ""
      : f.multi
      ? `<div class="lv-fxrow">` + f.multi.map((e, k) => `<button type="button" class="lv-on lv-fxsw" data-for="${e.on}" data-k="${k}" aria-label="${e.name}" title="${e.name}">${ico(e.icon, 28)}<span class="lv-sr"></span></button>`).join("") +
        (f.extra || []).map((e) => `<button type="button" class="lv-on lv-fxsw" data-for="${e.on}" aria-label="${e.name}" title="${e.name}">${ico(e.icon, 28)}<span class="lv-sr"></span></button>`).join("") + `</div>`
      : fo.on
      ? `<button type="button" class="lv-on" id="lvOnBtn" data-for="${fo.on}">${fo.onLabel || fo.label || fo.name}<span></span></button>`
      : "";
    padsEl.className = "lv-pads" + (padsOf(f).length === 1 ? " one" : "");
    palEl.innerHTML = f.palettes ? paletteHtml() : "";
    $("lvScenes").hidden = !f.scenes; // the Scenes page shows only the scene buttons
    const sub = f.palettes ? colSub : "map";
    subEl.hidden = !f.palettes;
    subEl.innerHTML = f.palettes
      ? [["map", "Colour map", "gradient"], ["pal", "Palettes", "colors"], ["blend", "Blend overlay", "layers"]].map(([k, n, ic]) => `<button type="button" class="lv-chip lv-subb${k === sub ? " is-on" : ""}" data-sub="${k}" aria-label="${n}" title="${n}">${ico(ic, 24)}</button>`).join("")
      : "";
    padsEl.hidden = !!f.scenes || sub !== "map" || padsOf(f).length === 0;
    chipsEl.hidden = sub !== "map";
    onEl.hidden = sub !== "map" || !!f.palettes; // Colour: the Duotone switch sits in the chip row
    $("lvReset").hidden = !!f.scenes || root.hidden;
    $("lvReset").innerHTML = ico("restart_alt", 24);
    $("lvReset").setAttribute("aria-label", `Reset ${f.label}`);
    $("lvReset").title = `Reset ${f.label}`;
    chipsEl.innerHTML = f.sets
      ? (f.on ? `<button type="button" class="lv-on lv-duo" id="lvOnBtn" data-for="${f.on}">${f.onLabel || f.label}<span></span></button>` : "") +
        f.sets.map((t, i) => (setOk(f, t) ? `<button type="button" class="lv-chip" data-s="${i}">${setOf(t).chip}</button>` : "")).join("")
      : f.palettes
      ? `<button type="button" class="lv-on lv-duo" id="lvOnBtn" data-for="ctrlEffectDuotone">Duotone<span></span></button>` +
        [["Fg", "F", "Foreground (highlights)"], ["Bg", "B", "Background (shadows)"], ["Sc", "S", "Screen background"], ["SC", ico("contrast", 24), "Saturation and contrast"]]
          .filter(([k]) => palFx() || k === "Sc" || k === "SC")
          .map(([k, t, n]) => `<button type="button" class="lv-chip lv-mc" data-m="${k}" aria-label="${n}" title="${n}">${t}</button>`)
          .join("")
      : "";
    if (f.palettes && !palFx() && mapMode === "colour" && mapTarget !== "Sc") mapTarget = "Sc";
    padsEl.innerHTML = padsOf(f)
      .map(
        (p, i) =>
          p.multi
            ? `<div class="lv-pad lv-cells" data-i="${i}" tabindex="0" role="group" aria-label="Pixelate, halftone and ASCII sizes">` +
              f.multi.map((e, k) => `<span class="lv-md lv-cd" data-k="${k}" title="${e.name}">${ico(e.icon, 22)}</span>`).join("") +
              `<span class="lv-tag lv-tx"></span><span class="lv-tag lv-ty">↑ Variation</span><span class="lv-tag lv-tv"></span></div>`
            : p.map
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
    palEl.querySelectorAll(".lv-sec").forEach((x) => (x.hidden = x.dataset.s !== sub));
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
          d.hidden = sc !== isSC || (!isSC && d.dataset.k !== "Sc" && !palFx());
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
          let [h, s, lum] = hexToHsl(el.value);
          const hk = (d.dataset.k === "Sc" ? "" : selPal) + d.dataset.k;
          if ((s < 0.05 || lum < 0.04 || lum > 0.96) && mapHue[hk] !== undefined) h = mapHue[hk]; // keep the dot where it was dragged
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
      if (p.multi) {
        f.multi.forEach((e, k) => {
          const d = pad.querySelector(`.lv-cd[data-k="${k}"]`);
          const dp = padPos(e);
          if (!d || !dp) return;
          d.style.left = `${dp[0] * 100}%`;
          d.style.top = `${(1 - dp[1]) * 100}%`;
          const sw = $(e.on);
          d.classList.toggle("is-active", k === cellIdx);
          d.hidden = !(sw && sw.checked);
        });
        const selOn = ($(p.on) || {}).checked;
        pad.querySelector(".lv-tx").textContent = selOn ? `${p.name} · ${p.x} →` : "Switch an effect on";
        pad.querySelector(".lv-tv").textContent = selOn ? `${valText(p.cs[0])}–${valText(p.cs[1])}` : "";
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
      if (src && inp.type === "range" && !inp.dataset.ready) {
        inp.min = src.min;
        inp.max = src.max;
        inp.step = snappy(src) && +src.min % SNAP === 0 ? SNAP : src.step;
        inp.dataset.ready = "1";
      }
      if (src && inp.value !== src.value && document.activeElement !== inp) inp.value = src.value;
    });
    palEl.querySelectorAll(".lv-pal-n").forEach((b) => {
      const sw = $(`ctrlPalette${b.dataset.n}Enabled`);
      b.classList.toggle("is-on", !!(sw && sw.checked));
      b.classList.toggle("is-sel", +b.dataset.n === selPal);
    });
    chipsEl.querySelectorAll(".lv-chip").forEach((c) => {
      if (c.dataset.s !== undefined) {
        c.classList.toggle("is-on", +c.dataset.s === setIndex(f));
        return;
      }
      const on = mapMode === "sc" ? c.dataset.m === "SC" : c.dataset.m === mapTarget;
      c.classList.toggle("is-on", on);
    });
    const po = $("lvPalOn");
    if (po) {
      const sw = $(`ctrlPalette${selPal}Enabled`);
      po.classList.toggle("is-on", !!(sw && sw.checked));
      po.textContent = `Palette ${selPal}: ${sw && sw.checked ? "in rotation" : "out of rotation"}`;
    }
    palEl.querySelectorAll("[data-flip]").forEach((b) => {
      const sw = $(b.dataset.flip);
      b.classList.toggle("is-on", !!(sw && sw.checked));
      if (b.id === "lvBlendOn") b.textContent = `Blend overlay: ${sw && sw.checked ? "on" : "off"}`;
    });
    const pr = $("lvPalRand");
    if (pr) pr.classList.toggle("is-on", !!($("ctrlPaletteRandomize") || {}).checked);
    FUNCS.forEach((fn) => {
      const b = funcsEl.querySelector(`[data-f="${fn.id}"]`);
      const on = fn.multi ? fn.multi.some((e) => ($(e.on) || {}).checked) : (fn.on && $(fn.on) || {}).checked;
      if (b) b.classList.toggle("is-on", !!on);
    });
    onEl.querySelectorAll(".lv-fxsw").forEach((b) => {
      const sw = $(b.dataset.for);
      b.classList.toggle("is-on", !!(sw && sw.checked));
      b.classList.toggle("is-sel", +b.dataset.k === cellIdx);
      b.querySelector("span").textContent = sw && sw.checked ? "ON" : "off";
    });
    const onBtn = $("lvOnBtn");
    if (onBtn) {
      const sw = $(onBtn.dataset.for);
      onBtn.classList.toggle("is-on", !!(sw && sw.checked));
      onBtn.querySelector("span").textContent = sw && sw.checked ? "ON" : "off";
    }
    const pause = $("ctrlAutoCycle");
    const pb = $("lvPause");
    if (pause && pb) {
      pb.innerHTML = ico(pause.checked ? "pause" : "play_arrow", 24);
      pb.setAttribute("aria-label", pause.checked ? "Pause" : "Resume");
      pb.title = pause.checked ? "Pause" : "Resume";
    }
    document.querySelectorAll("#lvScenes button").forEach((b) => b.classList.toggle("is-on", b.dataset.name === scenes.active));
  }

  function setScenes(msg) {
    scenes = { names: msg.names || [], active: msg.active || "" };
    $("lvScenes").innerHTML = scenes.names
      .slice(0, 24)
      .map((n, i) => `<button type="button" class="lv-scene" data-i="${i}" data-name="${n.replace(/"/g, "&quot;")}" title="${n.replace(/"/g, "&quot;")}"><b>${i + 1}</b> ${n.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</button>`)
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
    const b = e.target.closest("#lvOnBtn, .lv-fxsw");
    const sw = b && $(b.dataset.for);
    if (!sw) return;
    if (b.dataset.k !== undefined) cellIdx = +b.dataset.k;
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
    const fl = e.target.closest("[data-flip]");
    if (fl) {
      flip(fl.dataset.flip);
      return;
    }
    const n = e.target.closest(".lv-pal-n");
    if (n) {
      selPal = +n.dataset.n;
      refresh();
    } else if (e.target.closest("#lvPalOn")) flip(`ctrlPalette${selPal}Enabled`);
    else if (e.target.closest("#lvPalRand")) flip("ctrlPaletteRandomize");
  });

  subEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sub]");
    if (!b) return;
    colSub = b.dataset.sub;
    renderPads();
  });

  chipsEl.addEventListener("click", (e) => {
    const duo = e.target.closest("#lvOnBtn");
    if (duo) {
      const sw = $(duo.dataset.for);
      if (!sw) return;
      sw.checked = !sw.checked;
      sw.dispatchEvent(new Event("change", { bubbles: true }));
      renderPads(); // the chips shown depend on what is on
      return;
    }
    const c = e.target.closest(".lv-chip");
    if (!c) return;
    if (c.dataset.s !== undefined) {
      setIdx[current] = +c.dataset.s;
      renderPads(); // the pad's axis labels change with the pair
      return;
    }
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
    if (pad.classList.contains("lv-cells")) {
      // Grab the nearest of the three effect dots, wherever you touch.
      let best = Infinity;
      pad.querySelectorAll(".lv-cd").forEach((d) => {
        if (d.hidden) return;
        const b = d.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
        if (dist < best - 0.5) {
          best = dist;
          cellIdx = +d.dataset.k;
        }
      });
    }
    if (pad.classList.contains("lv-cells") && !pad.querySelector(".lv-cd:not([hidden])")) {
      drag = null; // every effect is off: nothing to move
      e.preventDefault();
      return;
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
      } else put(el, +el.defaultValue, true);
    });
    refresh();
  });

  // Put everything the picked function shows back to the app's default values,
  // switches included (the same defaults the app starts with).
  $("lvReset").addEventListener("click", () => {
    const f = FUNCS.find((x) => x.id === current);
    const ids = new Set();
    [...(f.pads || []), ...(f.sets || []), ...(f.multi || [])].forEach((p) => [...(p.xy || p.cs), ...(p.alts || []).flatMap((x) => x.cs)].forEach((id) => ids.add(id)));
    if (f.on) ids.add(f.on);
    [...(f.multi || []), ...(f.extra || [])].forEach((e) => ids.add(e.on));
    if (f.palettes) {
      for (let n = 1; n <= 4; n++) ["Fg", "Bg", "Enabled"].forEach((k) => ids.add(`ctrlPalette${n}${k}`));
      ["ctrlBackground", "ctrlSaturation", "ctrlContrast", "ctrlPaletteRandomize", "ctrlBlendOverlay", "ctrlOpacity", "ctrlBlendLayers"].forEach((id) => ids.add(id));
      document.querySelectorAll("[id^='ctrlBlendMode']").forEach((el) => ids.add(el.id));
    }
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = el.defaultChecked;
      else el.value = el.defaultValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
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
    const cf = FUNCS.find((x) => x.id === current);
    $("lvReset").hidden = v !== "live" || !!(cf && cf.scenes); // Reset belongs to the Live view's pads
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
