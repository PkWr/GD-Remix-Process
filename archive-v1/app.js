/*
 * Generative Photo Remix — app.js
 *
 * Plain JS, no build step, no framework. Sections below map to the spec's
 * build order:
 *   1. CONFIG            — tunables, referrer-restricted API key goes here
 *   2. SEED IMAGES        — bundled offline fallback (assets/seeds/*)
 *   3. DRIVE FETCH        — files.list against the public folder
 *   4. IMAGE PIPELINE     — cover-crop normalize to 1080x1920, cached
 *   5. EFFECT PALETTE     — duotone (1), pixelation (2), halftone (5), ascii (bonus)
 *   6. STATE / RENDER LOOP — random engine + crossfade cycle (3) + blend overlay (4)
 *   7. CONTROLS           — sliders that narrow the random engine's ranges
 *
 * Full effect palette (1-5) is complete: duotone/greyscale, pixelation,
 * crossfade, blend modes, halftone. Plus a bonus ASCII-art effect. Every
 * pixel-sampling effect (duotone/pixelate/halftone/ascii) shares the same
 * Colour mode panel (Colorized toggle + fg/bg pickers).
 *
 * Blend modes (4) is NOT one of the random "which effect" picks — it's a
 * separate modifier layer (Blend overlay toggle) that composites on top of
 * whichever primary effect just rendered, every cycle, rather than
 * competing with the others for a 1-in-N chance. See pickBlendOverlay().
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // 1. CONFIG
  // ---------------------------------------------------------------------
  const CONFIG = {
    // Drive API key restricted by HTTP referrer to the GitHub Pages domain.
    // Safe to leave in client-side code as long as the referrer restriction
    // is set in Google Cloud Console — do NOT remove that restriction.
    DRIVE_API_KEY: "YOUR_DRIVE_API_KEY_HERE",
    DRIVE_FOLDER_ID: "YOUR_DRIVE_FOLDER_ID_HERE",

    CANVAS_W: 1080,
    CANVAS_H: 1920,

    // Default min/max hold duration (seconds) before the next transition.
    // Sliders in the control panel narrow/override these live.
    HOLD_MIN: 4,
    HOLD_MAX: 9,

    CROSSFADE_MS: 800,

    // Full slider ranges (must match index.html's min/max attributes) —
    // used when "Randomize scale + ASCII style" is on, rolling the entire
    // range each cycle instead of the narrow band around the slider value.
    PIXELATE_SLIDER_MIN: 2,
    PIXELATE_SLIDER_MAX: 64,
    HALFTONE_SLIDER_MIN: 6,
    HALFTONE_SLIDER_MAX: 32,
    ASCII_SLIDER_MIN: 8,
    ASCII_SLIDER_MAX: 40,

    // Cap on how many past-frame snapshots we ever keep in memory, matching
    // the Blend layers slider's max (4). Each is a full 1080x1920 offscreen
    // canvas, so this bounds memory regardless of slider position.
    MAX_BLEND_LAYERS: 4,

    // How many px the animated pixelate cell size moves per animation tick,
    // and how often that tick fires. Bounces between PIXELATE_SLIDER_MIN/MAX.
    PIXELATE_ANIM_STEP: 1,

    // Move overlay (Ken Burns-style pan): how much bigger than the frame the
    // panned image is drawn (1.18 = 18% larger), giving room to slide the
    // 1080x1920 viewport across it without ever revealing an edge. Applied
    // to the already-fully-rendered frame (post effect + blend), not the
    // source image, so it works the same regardless of which effect/blend
    // is currently showing.
    MOVE_ZOOM: 1.18,
  };

  // Given a target value, return a min/max range around it — used once at
  // module init to seed sensible default Min/Max slider positions for
  // Pixelate/Halftone/ASCII (e.g. rangeAround(12, 0.4, 2) ~= 7-17), rather
  // than starting all three sliders at some arbitrary flat default.
  function rangeAround(value, spread, floor) {
    return {
      min: Math.max(floor, Math.round(value * (1 - spread))),
      max: Math.round(value * (1 + spread)),
    };
  }

  const initialPixelateRange = rangeAround(12, 0.4, 2);
  const initialAsciiRange = rangeAround(18, 0.35, 4);
  // Floor of 6 (not 2, unlike pixelate/ascii) — halftone draws one arc() per
  // cell, so small cell sizes mean hundreds of thousands of draw calls per
  // transition. 6px keeps the worst case (full 1080x1920 canvas) well under
  // 60k cells, which stays smooth; pixelate/ascii don't have this problem
  // since they redraw via 1-2 image draws regardless of cell count.
  const initialHalftoneRange = rangeAround(8, 0.4, 6);

  // Live-tunable params, seeded from CONFIG, mutated by the control panel.
  const params = {
    holdMin: CONFIG.HOLD_MIN,
    holdMax: CONFIG.HOLD_MAX,
    // Off = hold at a constant duration (holdMin's value, holdMax ignored).
    // On = current behaviour, a random value between holdMin/holdMax every
    // cycle. Same on/off-toggle-over-a-range pattern as Blend layers'
    // "Randomize layer count".
    randomizeSpeed: true,
    opacity: 1,
    pixelateMin: initialPixelateRange.min,
    pixelateMax: initialPixelateRange.max,
    // Off = fixed cell size at pixelateMin's value (pixelateMax ignored).
    // On = random value between pixelateMin/pixelateMax every cycle. Same
    // on/off-toggle-over-a-range pattern as Speed's "Randomize speed".
    randomizePixelateScale: true,
    halftoneMin: initialHalftoneRange.min,
    halftoneMax: initialHalftoneRange.max,
    randomizeHalftoneScale: true, // same pattern as randomizePixelateScale
    asciiMin: initialAsciiRange.min,
    asciiMax: initialAsciiRange.max,
    randomizeAsciiScale: true, // same pattern as randomizePixelateScale
    asciiRampStyle: "density",
    // Off = always use the dropdown's ramp style. On = pick a random ramp
    // style every cycle instead. Separate from randomize*Scale above — this
    // is specifically about ASCII's character set, not its cell size.
    randomizeAsciiRamp: false,
    asciiAnimate: true, // cycle same-density glyphs while an ASCII frame is on screen
    pixelateAnimate: false, // bounce cell size up/down while a Pixelate frame is on screen
    // Shared between Pixelate and ASCII — "color" keeps each effect's real
    // sampled colours, "mono" recolours by luminance between bgColor (0) and
    // fgColor (1) instead.
    colorMode: "color", // "color" or "mono"
    // Multiple named colour-pair presets for "mono" mode, instead of a
    // single fixed Highlights/Shadows pair — lets the random engine swap
    // the whole palette between cycles for more visual variety in the
    // sequence. Palette 1 matches the original single Highlights/Shadows
    // default, so nothing changes until the dropdown or Randomize palette
    // below is actually used.
    palettes: [
      { fg: "#00ff00", bg: "#000000" },
      { fg: "#00e5ff", bg: "#1a0033" },
      { fg: "#ff9100", bg: "#0d1b2a" },
      { fg: "#ff2fd4", bg: "#0a1f1c" },
    ],
    activePaletteIndex: 0,
    // Off = always use activePaletteIndex's palette. On = pick a random
    // palette every cycle instead — same on/off-toggle-over-a-set pattern
    // as randomizeAsciiRamp, but over palettes instead of character ramps.
    randomizePalette: false,
    // Off = every cell in a frame uses the one resolved palette (whether
    // fixed or per-cycle-randomized above). On = ASCII/Halftone/Pixelate
    // additionally re-roll a random palette PER CELL on every animation
    // tick, so individual pixels/dots/characters shimmer between palettes
    // independently instead of the whole frame moving as one flat colour.
    animatePaletteColor: false,
    // What percentage of cells actually re-roll a random palette on each
    // animation tick when animatePaletteColor is on — the rest keep that
    // cell's normal resolved colour that tick. 100 = every cell shimmers
    // (the original all-or-nothing behaviour); lower values sparsify it, so
    // only a scattered subset of pixels/dots/characters flicker per tick.
    // Explicit min/max + Randomize toggle, same on/off-over-a-range pattern
    // as Speed/Pixelate/Halftone/ASCII scale: off = fixed at Min's value
    // (Max ignored); on = a fresh coverage roll between Min/Max every
    // animation tick, so the amount of shimmer itself breathes over time.
    animatePaletteDensityMin: 100,
    animatePaletteDensityMax: 20,
    randomizeAnimatePaletteDensity: false,
    // Which EFFECTS keys the random engine is allowed to pick. All on by
    // default; unchecking a box in "Effects in rotation" removes it here.
    // Blend modes isn't in this list — it's no longer a competing pick, see
    // blendOverlayEnabled below.
    enabledEffects: {
      none: true,
      duotone: true,
      pixelate: true,
      ascii: true,
      halftone: true,
    },
    // Off by default: when on, every cycle layers the outgoing image
    // (mode randomized from enabledBlendModes below) on top of whatever
    // primary effect just rendered, instead of competing with it for a
    // 1-in-N pick.
    blendOverlayEnabled: false,
    // Which globalCompositeOperation values the overlay rolls from each
    // cycle. Multiply/screen on by default (matches the original spec);
    // the rest are opt-in extras.
    enabledBlendModes: {
      multiply: true,
      screen: true,
      overlay: false,
      darken: false,
      lighten: false,
      difference: false,
      exclusion: false,
      "hard-light": false,
    },
    // How many past frames get composited in alongside the incoming one.
    // 1 = classic 2-image blend (incoming + last frame); higher values pull
    // in more history for a cumulative trailing/ghosting look.
    blendLayers: 1,
    // When true, layerCount is re-rolled each cycle as a random int in
    // [1, blendLayers] instead of always using the fixed slider value —
    // the slider becomes a ceiling rather than a fixed count.
    randomizeBlendLayers: false,
    // Move overlay — independent of the effect rotation, same pattern as
    // Blend overlay. Only one movement type exists so far (a leftward Ken
    // Burns pan); this checkbox both picks and enables it. If more movement
    // types get added later, this should grow into a master "Enabled"
    // toggle + a set of mode checkboxes, mirroring how Blend overlay grew.
    movePanLeft: false,
    // Global look adjustments (CSS filter %, 100 = no change) — applied to
    // the whole #stage element rather than run through the effect pipeline,
    // since they should affect literally everything on screen (every
    // effect, blend combination, and pan position) rather than needing to
    // be threaded through each effect's own pixel math.
    saturation: 100,
    contrast: 100,
  };

  // ---------------------------------------------------------------------
  // 2. SEED IMAGES (offline fallback, bundled in repo)
  // ---------------------------------------------------------------------
  // Populate assets/seeds/ with a handful of real files before the workshop
  // and list their filenames here. Used whenever the Drive fetch fails or
  // returns zero usable images (no wifi, key not live yet, folder empty).
  const SEED_IMAGES = [
    "assets/seeds/seed-01.jpg",
    "assets/seeds/seed-02.jpg",
    "assets/seeds/seed-03.jpg",
  ];

  // ---------------------------------------------------------------------
  // 3. DRIVE FETCH
  // ---------------------------------------------------------------------
  async function fetchDriveImageUrls() {
    if (!CONFIG.DRIVE_API_KEY || CONFIG.DRIVE_API_KEY.startsWith("YOUR_")) {
      console.warn("[drive] no API key configured, skipping live fetch");
      return [];
    }

    const q = encodeURIComponent(
      `'${CONFIG.DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`
    );
    const fields = encodeURIComponent("files(id,name,mimeType)");
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}` +
      `&key=${CONFIG.DRIVE_API_KEY}&pageSize=1000`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Drive API responded ${res.status}`);
      const data = await res.json();
      const files = data.files || [];

      return files.map(
        (f) =>
          `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${CONFIG.DRIVE_API_KEY}`
      );
    } catch (err) {
      console.warn("[drive] fetch failed, will fall back to seeds:", err);
      return [];
    }
  }

  async function loadImageSources() {
    setStatus("fetching Drive folder…");
    const driveUrls = await fetchDriveImageUrls();

    if (driveUrls.length > 0) {
      setStatus(`loaded ${driveUrls.length} image(s) from Drive`);
      state.sourceType = "drive";
      return driveUrls;
    }

    setStatus(`Drive unavailable — using ${SEED_IMAGES.length} local seed image(s)`);
    state.sourceType = "seed";
    return SEED_IMAGES;
  }

  // ---------------------------------------------------------------------
  // 4. IMAGE PIPELINE — cover-crop normalize to fixed 1080x1920 canvas
  // ---------------------------------------------------------------------
  // Runs once per image on load; result is cached so effects never touch
  // the raw source or handle variable aspect ratios.
  const normalizedCache = new Map(); // src -> HTMLCanvasElement

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only request CORS mode for actual cross-origin (Drive) URLs. Setting
      // crossOrigin on local/same-origin seed images makes some browsers
      // (notably Chrome on file://) refuse to load them at all.
      if (/^https?:\/\//i.test(src)) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${src}`));
      img.src = src;
    });
  }

  // Equivalent of CSS object-fit: cover — scale to fill, crop overflow, centred.
  function drawCover(ctx, img, destW, destH) {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const srcRatio = srcW / srcH;
    const destRatio = destW / destH;

    let sx, sy, sw, sh;

    if (srcRatio > destRatio) {
      // source is wider than target — crop left/right
      sh = srcH;
      sw = srcH * destRatio;
      sx = (srcW - sw) / 2;
      sy = 0;
    } else {
      // source is taller than target — crop top/bottom
      sw = srcW;
      sh = srcW / destRatio;
      sx = 0;
      sy = (srcH - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, destW, destH);
  }

  async function normalizeImage(src) {
    if (normalizedCache.has(src)) return normalizedCache.get(src);

    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = CONFIG.CANVAS_W;
    canvas.height = CONFIG.CANVAS_H;
    const ctx = canvas.getContext("2d");
    drawCover(ctx, img, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    normalizedCache.set(src, canvas);
    return canvas;
  }

  // ---------------------------------------------------------------------
  // 5. EFFECT PALETTE
  // ---------------------------------------------------------------------
  // Each effect is a function (ctx, sourceCanvas, effectParams) that draws
  // into ctx. Effects never mutate sourceCanvas — it's the shared cached
  // normalized image and gets reused by every effect/cycle.

  function hslToRgb(h, s, l) {
    // h: 0-360, s/l: 0-1. Returns [r, g, b] 0-255.
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1, g1, b1;
    if (hp < 1) [r1, g1, b1] = [c, x, 0];
    else if (hp < 2) [r1, g1, b1] = [x, c, 0];
    else if (hp < 3) [r1, g1, b1] = [0, c, x];
    else if (hp < 4) [r1, g1, b1] = [0, x, c];
    else if (hp < 5) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    const m = l - c / 2;
    return [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255),
    ];
  }

  // Shared "mono" colour-mode helpers — Pixelate and ASCII both recolour by
  // luminance between bgColor (darkest) and fgColor (brightest) when the
  // Colour mode panel's Colorized checkbox is off.
  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const n = parseInt(clean, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixHexColors(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  }

  // Resolves which Highlights/Shadows pair this cycle's mono-mode colouring
  // should use — either the fixed dropdown selection (activePaletteIndex),
  // or (when Randomize palette is on) a fresh random pick from
  // params.palettes. Called once per cycle from inside whichever effect's
  // randomParams() runs, so a single resolved pair is shared by every
  // colour reference within that cycle and shows up in the diagnostics line
  // via effectParams' paletteIndex.
  function resolveActivePalette() {
    const idx = params.randomizePalette
      ? Math.floor(Math.random() * params.palettes.length)
      : params.activePaletteIndex;
    const palette = params.palettes[idx] || params.palettes[0];
    return { fgColor: palette.fg, bgColor: palette.bg, paletteIndex: idx + 1 };
  }

  // Per-cell variant of the above, used only when "Animate palette per
  // cell" is on — instead of the one palette resolved for the whole frame,
  // each call picks a fresh random palette and mixes its Shadows/Highlights
  // by this cell's luminance, same formula as the static mono mix. Calling
  // this repeatedly on a redraw timer (rather than once per cycle) is what
  // makes individual cells shimmer between palettes independently.
  function randomPaletteMonoColor(lum) {
    const pal = params.palettes[Math.floor(Math.random() * params.palettes.length)];
    return mixHexColors(pal.bg, pal.fg, lum);
  }

  // Resolves what percentage of cells should re-roll a random palette THIS
  // redraw — either the fixed Min value, or (when Randomize coverage is on)
  // a fresh roll between Min/Max. Called once per redraw call (not once per
  // cell), so when randomized, coverage itself drifts tick to tick rather
  // than every cell picking its own independent coverage threshold.
  function resolveAnimatePaletteDensity() {
    if (!params.randomizeAnimatePaletteDensity) {
      return params.animatePaletteDensityMin;
    }
    const min = Math.min(params.animatePaletteDensityMin, params.animatePaletteDensityMax);
    const max = Math.max(params.animatePaletteDensityMin, params.animatePaletteDensityMax);
    return min + Math.random() * (max - min);
  }

  // Duotone / greyscale colour conversion (effect 1). Maps each pixel's
  // luminance onto a shadow->highlight gradient, then blends that against
  // the original colour by `intensity` (0 = untouched, 1 = full duotone).
  // When colorMode is "mono" the shadow/highlight anchors come from the
  // shared Background/Foreground pickers (same source as Pixelate/ASCII's
  // mono mode); otherwise they're the randomized hue/saturation gradient.
  function applyDuotone(
    ctx,
    sourceCanvas,
    { hue, saturation, intensity, colorMode, fgColor, bgColor }
  ) {
    ctx.drawImage(sourceCanvas, 0, 0);
    const w = CONFIG.CANVAS_W;
    const h = CONFIG.CANVAS_H;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    let shadow, highlight;
    if (colorMode === "mono") {
      const bg = hexToRgb(bgColor || "#000000");
      const fg = hexToRgb(fgColor || "#00ff00");
      shadow = [bg.r, bg.g, bg.b];
      highlight = [fg.r, fg.g, fg.b];
    } else {
      shadow = hslToRgb(hue, saturation, 0.12);
      highlight = hslToRgb(hue, saturation, 0.9);
    }

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      const dr = shadow[0] + (highlight[0] - shadow[0]) * lum;
      const dg = shadow[1] + (highlight[1] - shadow[1]) * lum;
      const db = shadow[2] + (highlight[2] - shadow[2]) * lum;

      d[i] = r + (dr - r) * intensity;
      d[i + 1] = g + (dg - g) * intensity;
      d[i + 2] = b + (db - b) * intensity;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // Pixelation (effect 2): downscale the source onto a tiny offscreen
  // canvas, then scale it back up with smoothing off so the browser's own
  // upscale does the blocky enlargement — no manual per-cell loop needed.
  const pixelateTempCanvas = document.createElement("canvas");

  function applyPixelate(ctx, sourceCanvas, { cellSize, colorMode, fgColor, bgColor }) {
    const w = CONFIG.CANVAS_W;
    const h = CONFIG.CANVAS_H;
    const cols = Math.max(1, Math.round(w / cellSize));
    const rows = Math.max(1, Math.round(h / cellSize));

    pixelateTempCanvas.width = cols;
    pixelateTempCanvas.height = rows;
    const tctx = pixelateTempCanvas.getContext("2d");
    tctx.imageSmoothingEnabled = true; // smooth downscale = each cell averages its area
    tctx.clearRect(0, 0, cols, rows);
    tctx.drawImage(sourceCanvas, 0, 0, cols, rows);

    if (colorMode === "mono") {
      // Recolour the tiny pre-upscale canvas only — cols*rows pixels here
      // (a few hundred to a few thousand), vs. the full 1080x1920 canvas,
      // so this stays cheap even though it's a per-pixel getImageData pass.
      // When "Animate palette per cell" is on, each pixel/block rolls its
      // own random palette here instead of the one resolved fgColor/bgColor
      // — since this whole recolour loop reruns every time applyPixelate is
      // called, that alone makes the blocks shimmer on each redraw tick,
      // with no extra animation plumbing needed beyond calling this again.
      const small = tctx.getImageData(0, 0, cols, rows);
      const d = small.data;
      const animatePalette = params.animatePaletteColor;
      // Resolved once for this whole recolour pass, not per pixel — see
      // resolveAnimatePaletteDensity's comment for why.
      const density = animatePalette ? resolveAnimatePaletteDensity() : 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const rollPalette = animatePalette && Math.random() * 100 < density;
        const mixed = rollPalette
          ? randomPaletteMonoColor(lum)
          : mixHexColors(bgColor || "#000000", fgColor || "#00ff00", lum);
        d[i] = mixed.r;
        d[i + 1] = mixed.g;
        d[i + 2] = mixed.b;
      }
      tctx.putImageData(small, 0, 0);
    }

    ctx.imageSmoothingEnabled = false; // hard-edged upscale = visible blocks
    ctx.drawImage(pixelateTempCanvas, 0, 0, cols, rows, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true; // reset so later effects aren't affected
  }

  // Animation state for the Pixelate "animate cell size" toggle. Cached here
  // (not on `params`) because it needs a source canvas reference and a
  // direction that evolves tick-to-tick, not just a user-set value.
  let lastPixelateSource = null;
  let lastPixelateParams = null;
  let pixelateAnimCellSize = null;
  let pixelateAnimDirection = 1;

  // Wraps applyPixelate for the initial per-cycle render: caches what the
  // animation ticker needs (source canvas, base colour params) and seeds the
  // bounce from whatever cell size this cycle happened to roll, with a
  // random initial direction so consecutive pixelate cycles don't all
  // "breathe" the same way.
  function runPixelateEffect(ctx, sourceCanvas, effectParams) {
    lastPixelateSource = sourceCanvas;
    lastPixelateParams = {
      colorMode: effectParams.colorMode,
      fgColor: effectParams.fgColor,
      bgColor: effectParams.bgColor,
    };
    pixelateAnimCellSize = effectParams.cellSize;
    pixelateAnimDirection = Math.random() < 0.5 ? 1 : -1;
    applyPixelate(ctx, sourceCanvas, effectParams);
  }

  // Redraws the currently-visible canvas, reusing the cached source canvas —
  // no new source sampling. Two independent things can trigger this (see the
  // ticker below): if "Animate scale" is on, cell size is nudged one step
  // further in the current direction (bounces, i.e. flips direction, at the
  // bounds rather than resetting, so it reads as a continuous pulse rather
  // than a sawtooth snap); if only "Animate palette per cell" is on, cell
  // size stays exactly as last rolled and only the recolour inside
  // applyPixelate's mono branch re-runs, which alone is enough to shimmer
  // since that loop re-picks a random palette per pixel every call.
  function redrawPixelateAnimationFrame() {
    if (!lastPixelateSource) return;
    if (params.pixelateAnimate) {
      let next = pixelateAnimCellSize + pixelateAnimDirection * CONFIG.PIXELATE_ANIM_STEP;
      if (next >= CONFIG.PIXELATE_SLIDER_MAX) {
        next = CONFIG.PIXELATE_SLIDER_MAX;
        pixelateAnimDirection = -1;
      } else if (next <= CONFIG.PIXELATE_SLIDER_MIN) {
        next = CONFIG.PIXELATE_SLIDER_MIN;
        pixelateAnimDirection = 1;
      }
      pixelateAnimCellSize = next;
    }
    const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
    applyPixelate(ctx, lastPixelateSource, { cellSize: pixelateAnimCellSize, ...lastPixelateParams });
  }

  // Blend modes (effect 4) — no longer a competing pick in "Effects in
  // rotation". Instead, when the Blend overlay toggle is on, this composites
  // one or more past frames on top of whatever the primary effect
  // (duotone/pixelate/ascii/halftone/none) just drew, using multiply/screen/
  // etc., so it layers with every effect instead of replacing one.
  // Deliberately does NOT redraw the base — `ctx` already holds the primary
  // effect's finished output when this runs (see renderFrame).
  //
  // Takes an already-sliced `layers` array rather than reading
  // state.recentFrames + a layerCount itself, so the same call can be reused
  // both for the initial per-cycle render AND for every later redraw this
  // cycle (Move overlay's pan ticks) against a frozen, identical set of
  // frames — see state.lastBlendLayers in renderFrame/composeFrame below.
  function applyBlendOverlay(ctx, mode, opacity, layers) {
    for (const frame of layers) {
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = opacity;
      ctx.drawImage(frame, 0, 0);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // Halftone (effect 5, stretch goal). Downsamples the source the same way
  // Pixelate does to get one average colour per cell cheaply, then draws a
  // dot per cell whose radius scales with that cell's brightness — brighter
  // cells get bigger dots, dark cells shrink toward invisible against the
  // background. This is the reverse of newsprint halftone (dark ink on
  // white paper) because the canvas defaults to a dark backdrop with bright
  // marks, matching how Pixelate/ASCII's mono mode already treat brightness.
  const halftoneTempCanvas = document.createElement("canvas");

  // Cache of the last rendered Halftone frame's per-cell colour sample —
  // same pattern as lastAsciiFrame — so the animation timer can redraw
  // fresh dot colours without re-sampling the source image every tick.
  let lastHalftoneFrame = null;

  // Draws one Halftone frame from cached per-cell sample data. `animatePalette`
  // true re-rolls a random palette per dot (mono mode only) instead of the
  // flat resolved fgColor for the whole frame — dot size alone still carries
  // brightness either way, same convention as real halftone printing.
  function drawHalftoneFrame(ctx, frame, animatePalette) {
    const { sample, cols, rows, cellW, cellH, maxRadius, colorMode, fgColor, bgColor, w, h } = frame;
    const usePaletteAnim = animatePalette && colorMode === "mono";
    // Resolved once for this whole redraw, not per dot — see
    // resolveAnimatePaletteDensity's comment for why.
    const density = usePaletteAnim ? resolveAnimatePaletteDensity() : 0;

    ctx.fillStyle = bgColor || "#000000";
    ctx.fillRect(0, 0, w, h);

    // Flat ink colour in mono mode — dot size alone carries the brightness,
    // same convention as real halftone printing, rather than also tinting.
    // This is also the fallback colour for dots that DON'T win the
    // animatePaletteDensity roll below, when usePaletteAnim is on.
    const monoFg = colorMode === "mono" ? hexToRgb(fgColor || "#00ff00") : null;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = (row * cols + col) * 4;
        const r = sample[i], g = sample[i + 1], b = sample[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const radius = maxRadius * lum;
        if (radius < 0.5) continue; // near-invisible, cheap skip

        const rollPalette = usePaletteAnim && Math.random() * 100 < density;
        if (rollPalette) {
          const pal = params.palettes[Math.floor(Math.random() * params.palettes.length)];
          const fg = hexToRgb(pal.fg);
          ctx.fillStyle = `rgb(${fg.r}, ${fg.g}, ${fg.b})`;
        } else {
          ctx.fillStyle = monoFg
            ? `rgb(${monoFg.r}, ${monoFg.g}, ${monoFg.b})`
            : `rgb(${r}, ${g}, ${b})`;
        }

        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function applyHalftone(ctx, sourceCanvas, { cellSize, colorMode, fgColor, bgColor }) {
    // Hard floor regardless of what called this — one arc()+fill() per cell
    // means small cell sizes get expensive fast (see note above the min-6
    // slider limit). This backstops that even if something else ever feeds
    // a smaller value in.
    const safeCellSize = Math.max(6, cellSize);
    const w = CONFIG.CANVAS_W;
    const h = CONFIG.CANVAS_H;
    const cols = Math.max(1, Math.round(w / safeCellSize));
    const rows = Math.max(1, Math.round(h / safeCellSize));
    const cellW = w / cols;
    const cellH = h / rows;
    const maxRadius = Math.min(cellW, cellH) * 0.5 * 0.92; // slight gap between adjacent dots

    halftoneTempCanvas.width = cols;
    halftoneTempCanvas.height = rows;
    const tctx = halftoneTempCanvas.getContext("2d");
    tctx.imageSmoothingEnabled = true; // each output pixel = average colour of its cell
    tctx.clearRect(0, 0, cols, rows);
    tctx.drawImage(sourceCanvas, 0, 0, cols, rows);
    const sample = tctx.getImageData(0, 0, cols, rows).data;

    const frame = { sample, cols, rows, cellW, cellH, maxRadius, colorMode, fgColor, bgColor, w, h };
    lastHalftoneFrame = frame; // cached for the animation timer

    drawHalftoneFrame(ctx, frame, false);
  }

  // Redraws the currently-visible canvas with fresh random per-dot palette
  // colours, reusing the cached sample data — no image re-sampling or
  // cell-size change, so this stays cheap even running several times a
  // second. Halftone has no other animation axis (no glyph/size bounce), so
  // this only ever fires when "Animate palette per cell" is on.
  function redrawHalftoneAnimationFrame() {
    if (!lastHalftoneFrame) return;
    const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
    drawHalftoneFrame(ctx, lastHalftoneFrame, true);
  }

  // ASCII art conversion (bonus effect, not in the original 1-4 palette but
  // built the same way: canvas pixel sampling only, no ML/generative tech,
  // so it fits the same non-goals as everything else).
  //
  // Downsamples the source onto a tiny offscreen canvas (same trick as
  // pixelation) to get one average colour per cell cheaply, maps each
  // cell's luminance onto a light->dark character ramp, then draws that
  // character in the cell's average colour on a configurable background.
  const asciiTempCanvas = document.createElement("canvas");

  // Three selectable density ramps (light/sparse -> dark/dense). All start
  // with a space so near-black cells stay blank against the backdrop.
  const ASCII_RAMPS = {
    density: " .:-=+*#%@",
    blocks: " ░▒▓█",
    binary: " #",
  };

  // For each ramp, a same-length array of "variant bands" — characters of
  // roughly the same visual weight as the ramp's character at that index.
  // The animate toggle picks a random glyph from the matching band each
  // redraw instead of the single fixed character, so density/shape stays
  // correct while the specific glyphs flicker.
  const ASCII_RAMP_VARIANTS = {
    density: [
      [" "],
      [".", "'", "`", ","],
      [":", ";", "^", '"'],
      ["-", "~", "_"],
      ["=", "r", "c", "v"],
      ["+", "j", "t", "l"],
      ["*", "x", "n", "u"],
      ["#", "h", "k", "d"],
      ["%", "8", "0", "o"],
      ["@", "$", "&", "W"],
    ],
    blocks: [[" "], ["░", "'"], ["▒", ":"], ["▓", "#"], ["█", "@"]],
    binary: [[" "], ["#", "@", "%", "&"]],
  };

  // Cache of the last rendered ASCII frame's per-cell colour sample. Lets
  // the animation timer redraw fresh glyphs on the visible canvas without
  // re-sampling the source image every tick.
  let lastAsciiFrame = null;

  function pickAsciiChar(ramp, variants, lum, animate) {
    const idx = Math.min(ramp.length - 1, Math.floor(lum * ramp.length));
    if (!animate) return ramp[idx];
    const band = variants[idx];
    return band && band.length ? band[Math.floor(Math.random() * band.length)] : ramp[idx];
  }

  // Draws one ASCII frame from cached per-cell sample data. Two independent
  // animation flags, so "Animate characters" and "Animate palette per cell"
  // can each be on/off without affecting the other:
  //   animateGlyph   — true swaps in random same-density variant glyphs;
  //                    false uses the exact luminance-correct character.
  //   animatePalette — true re-rolls a random palette per cell (mono mode
  //                    only) instead of the one palette resolved for the
  //                    whole frame; false uses that resolved fgColor/bgColor.
  // The initial per-cycle render (applyAscii) always calls this with both
  // false — flicker/shimmer only kicks in on later redraw ticks.
  function drawAsciiFrame(ctx, frame, animateGlyph, animatePalette) {
    const { sample, cols, rows, cellW, cellH, rampStyle, colorMode, fgColor, bgColor, w, h } = frame;
    const ramp = ASCII_RAMPS[rampStyle] || ASCII_RAMPS.density;
    const variants = ASCII_RAMP_VARIANTS[rampStyle] || ASCII_RAMP_VARIANTS.density;
    const usePaletteAnim = animatePalette && colorMode === "mono";
    // Resolved once for this whole redraw, not per character — see
    // resolveAnimatePaletteDensity's comment for why.
    const density = usePaletteAnim ? resolveAnimatePaletteDensity() : 0;

    ctx.fillStyle = bgColor || "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${Math.ceil(cellH)}px monospace`;
    ctx.textBaseline = "top";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = (row * cols + col) * 4;
        const r = sample[i], g = sample[i + 1], b = sample[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const ch = pickAsciiChar(ramp, variants, lum, animateGlyph);
        if (ch === " ") continue; // skip drawing blank cells, cheap win

        if (colorMode === "mono") {
          // Same bg->fg interpolation Pixelate uses, so both effects read
          // consistently off the same two colour pickers — unless this
          // cell wins the animatePaletteDensity roll, in which case it gets
          // its own random palette instead of the frame's one resolved pair.
          const rollPalette = usePaletteAnim && Math.random() * 100 < density;
          const mixed = rollPalette
            ? randomPaletteMonoColor(lum)
            : mixHexColors(bgColor || "#000000", fgColor || "#00ff00", lum);
          ctx.fillStyle = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
        } else {
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }
        ctx.fillText(ch, col * cellW, row * cellH);
      }
    }
  }

  function applyAscii(
    ctx,
    sourceCanvas,
    { cellSize, rampStyle, colorMode, fgColor, bgColor }
  ) {
    const w = CONFIG.CANVAS_W;
    const h = CONFIG.CANVAS_H;
    const cols = Math.max(1, Math.floor(w / cellSize));
    const rows = Math.max(1, Math.floor(h / cellSize));
    const cellW = w / cols;
    const cellH = h / rows;

    asciiTempCanvas.width = cols;
    asciiTempCanvas.height = rows;
    const tctx = asciiTempCanvas.getContext("2d");
    tctx.imageSmoothingEnabled = true; // each output pixel = average colour of its cell
    tctx.clearRect(0, 0, cols, rows);
    tctx.drawImage(sourceCanvas, 0, 0, cols, rows);
    const sample = tctx.getImageData(0, 0, cols, rows).data;

    const frame = { sample, cols, rows, cellW, cellH, rampStyle, colorMode, fgColor, bgColor, w, h };
    lastAsciiFrame = frame; // cached for the animation timer

    drawAsciiFrame(ctx, frame, false, false);
  }

  // Redraws the currently-visible canvas with fresh random glyphs and/or
  // fresh per-cell palette colours, reusing the cached sample data — no
  // image re-sampling, so this stays cheap even running several times a
  // second. Each animation flag is read independently so either toggle can
  // drive a redraw without forcing the other one's behaviour on too.
  function redrawAsciiAnimationFrame() {
    if (!lastAsciiFrame) return;
    const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
    drawAsciiFrame(ctx, lastAsciiFrame, params.asciiAnimate, params.animatePaletteColor);
  }

  // Registry the random engine picks from. "none" is a deliberate option so
  // the cycle sometimes shows the untouched normalized image.
  const EFFECTS = {
    none: {
      label: "none",
      randomParams: () => ({}),
      run: (ctx, sourceCanvas) => ctx.drawImage(sourceCanvas, 0, 0),
    },
    duotone: {
      label: "duotone",
      randomParams: () => ({
        // hue/saturation only matter when colorMode is "color" (see
        // applyDuotone) — when it's "mono" the shared fgColor/bgColor
        // override them entirely.
        hue: Math.floor(Math.random() * 360),
        // Bias toward some colour most of the time, occasional plain greyscale.
        saturation: Math.random() < 0.25 ? 0 : 0.4 + Math.random() * 0.5,
        intensity: 0.75 + Math.random() * 0.25,
        colorMode: params.colorMode,
        ...resolveActivePalette(),
      }),
      run: applyDuotone,
    },
    pixelate: {
      label: "pixelate",
      // Explicit min/max sliders, not a derived narrow band — see
      // randomizePixelateScale above. Off = fixed at pixelateMin; on = a
      // fresh random roll between pixelateMin/pixelateMax every cycle.
      randomParams: () => ({
        cellSize: params.randomizePixelateScale
          ? Math.round(
              Math.min(params.pixelateMin, params.pixelateMax) +
                Math.random() * Math.abs(params.pixelateMax - params.pixelateMin)
            )
          : Math.round(params.pixelateMin),
        colorMode: params.colorMode,
        ...resolveActivePalette(),
      }),
      run: runPixelateEffect,
    },
    halftone: {
      label: "halftone",
      // Explicit min/max sliders, not a derived narrow band — same pattern
      // as Pixelate. Off = fixed at halftoneMin; on = a fresh random roll
      // between halftoneMin/halftoneMax every cycle. Math.max(6, ...) is a
      // defensive floor regardless of what the sliders allow — see
      // applyHalftone's own clamp and the perf note above it.
      randomParams: () => ({
        cellSize: params.randomizeHalftoneScale
          ? Math.round(
              Math.max(
                6,
                Math.min(params.halftoneMin, params.halftoneMax) +
                  Math.random() * Math.abs(params.halftoneMax - params.halftoneMin)
              )
            )
          : Math.round(Math.max(6, params.halftoneMin)),
        colorMode: params.colorMode,
        ...resolveActivePalette(),
      }),
      run: applyHalftone,
    },
    ascii: {
      label: "ascii",
      // Explicit min/max sliders, same pattern as Pixelate/Halftone. Ramp
      // style normally follows the dropdown, but gets randomized per cycle
      // when randomizeAsciiRamp is on — a separate toggle from
      // randomizeAsciiScale, since one is about cell size and the other is
      // about which character set is used.
      randomParams: () => ({
        cellSize: params.randomizeAsciiScale
          ? Math.round(
              Math.min(params.asciiMin, params.asciiMax) +
                Math.random() * Math.abs(params.asciiMax - params.asciiMin)
            )
          : Math.round(params.asciiMin),
        rampStyle: params.randomizeAsciiRamp
          ? Object.keys(ASCII_RAMPS)[Math.floor(Math.random() * Object.keys(ASCII_RAMPS).length)]
          : params.asciiRampStyle,
        colorMode: params.colorMode,
        ...resolveActivePalette(),
      }),
      run: applyAscii,
    },
  };

  function pickRandomEffect() {
    let keys = Object.keys(EFFECTS).filter((k) => params.enabledEffects[k]);
    if (keys.length === 0) {
      // Every toggle switched off — fall back to "none" rather than crash,
      // so the cycle keeps advancing images even with no effects enabled.
      keys = ["none"];
    }
    const key = keys[Math.floor(Math.random() * keys.length)];
    const effect = EFFECTS[key];
    const effectParams = effect.randomParams();
    return { key, effect, effectParams };
  }

  // ---------------------------------------------------------------------
  // 6. STATE / RENDER LOOP
  // ---------------------------------------------------------------------
  // Random event engine — three dials re-rolled per cycle: next image,
  // which effect (from EFFECTS above), hold duration.

  const canvasA = document.getElementById("canvasA");
  const canvasB = document.getElementById("canvasB");
  const ctxA = canvasA.getContext("2d");
  const ctxB = canvasB.getContext("2d");
  canvasA.width = CONFIG.CANVAS_W;
  canvasA.height = CONFIG.CANVAS_H;
  canvasB.width = CONFIG.CANVAS_W;
  canvasB.height = CONFIG.CANVAS_H;

  const state = {
    sources: [],
    currentIndex: -1,
    frontCanvas: canvasA,
    backCanvas: canvasB,
    sourceType: "seed",
    paused: false,
    // Which EFFECTS key most recently rendered successfully — the ASCII
    // animation timer only touches the canvas while this is "ascii".
    lastEffectKey: null,
    // History of past-frame snapshots for the Blend overlay's multi-layer
    // mode, most recent first. Capped at CONFIG.MAX_BLEND_LAYERS regardless
    // of the current Blend layers slider position (see snapshotFrame()).
    recentFrames: [],
    // Move overlay (Ken Burns pan) state. Pan only ever moves the primary
    // effect layer — lastEffectFrame — while whatever's blended on top
    // (lastBlendMode/Opacity/Layers, frozen for the whole cycle) stays fixed,
    // so the two read as separate depth planes rather than one flat image
    // sliding together. cycleStartedAt/currentHoldMs let the pan loop work
    // out how far through the current hold duration we are, each rAF tick.
    lastEffectFrame: null,
    lastBlendMode: null,
    lastBlendOpacity: 1,
    lastBlendLayers: [],
    cycleStartedAt: 0,
    currentHoldMs: 0,
  };

  function snapshotFrame(sourceCanvas) {
    const snap = document.createElement("canvas");
    snap.width = CONFIG.CANVAS_W;
    snap.height = CONFIG.CANVAS_H;
    snap.getContext("2d").drawImage(sourceCanvas, 0, 0);
    return snap;
  }

  // Tracks the pending setTimeout so pause/resume can cancel or (re)start it
  // without ever having two cycle() chains running at once.
  let cycleTimeoutId = null;

  function togglePause(forceValue) {
    const next = typeof forceValue === "boolean" ? forceValue : !state.paused;
    if (next === state.paused) return;
    state.paused = next;

    const diagPaused = document.getElementById("diagPaused");
    if (diagPaused) diagPaused.classList.toggle("hidden", !state.paused);

    const autoCycleBox = document.getElementById("ctrlAutoCycle");
    if (autoCycleBox) autoCycleBox.checked = !state.paused;

    if (state.paused) {
      if (cycleTimeoutId) {
        clearTimeout(cycleTimeoutId);
        cycleTimeoutId = null;
      }
    } else if (!cycleTimeoutId) {
      // Resuming: kick off a fresh cycle immediately rather than waiting on
      // whatever hold duration was mid-flight when paused was pressed.
      cycleTimeoutId = setTimeout(cycle, 0);
    }
  }

  function pickNextIndex() {
    if (state.sources.length <= 1) return 0;
    let next;
    do {
      next = Math.floor(Math.random() * state.sources.length);
    } while (next === state.currentIndex);
    return next;
  }

  function randomHold() {
    if (!params.randomizeSpeed) {
      return params.holdMin * 1000;
    }
    const min = Math.min(params.holdMin, params.holdMax);
    const max = Math.max(params.holdMin, params.holdMax);
    return (min + Math.random() * (max - min)) * 1000;
  }

  // Move overlay (Ken Burns pan). Draws `sourceCanvas` (the fully rendered,
  // un-panned frame) scaled up by CONFIG.MOVE_ZOOM into `ctx`, positioned so
  // the visible 1080x1920 window slides across it as `progress` goes 0 -> 1.
  //
  // "Pan left" reads as the camera panning toward the left of the frame over
  // time: at progress 0 we're viewing the right portion of the zoomed image,
  // at progress 1 we've slid to the left portion — so on screen the image
  // content appears to drift rightward as more of its left side comes into
  // view. Vertical position stays centred; this only pans horizontally.
  function applyMoveTransform(ctx, sourceCanvas, progress) {
    const zoom = CONFIG.MOVE_ZOOM;
    const scaledW = CONFIG.CANVAS_W * zoom;
    const scaledH = CONFIG.CANVAS_H * zoom;
    const extraX = scaledW - CONFIG.CANVAS_W;
    const dx = -extraX * (1 - Math.max(0, Math.min(1, progress)));
    const dy = -(scaledH - CONFIG.CANVAS_H) / 2;

    ctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    ctx.drawImage(sourceCanvas, dx, dy, scaledW, scaledH);
  }

  // Draws the currently-visible frame into destCtx from cached state: the
  // primary effect layer (state.lastEffectFrame), optionally panned, with
  // whatever blend-history layers are active for this cycle
  // (state.lastBlendMode/Opacity/Layers, frozen at render time) composited
  // on top, unpanned. `panProgress` of null means "no pan" (draw the effect
  // layer as-is); a number 0-1 feeds applyMoveTransform.
  //
  // This is the single source of truth for "what should be on screen right
  // now," reused by both the initial per-cycle render and every later Move
  // animation tick — so the blend layers never accidentally get panned
  // along with the effect layer.
  function composeFrame(destCtx, panProgress) {
    destCtx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    if (panProgress === null) {
      destCtx.drawImage(state.lastEffectFrame, 0, 0);
    } else {
      applyMoveTransform(destCtx, state.lastEffectFrame, panProgress);
    }
    if (state.lastBlendMode) {
      applyBlendOverlay(destCtx, state.lastBlendMode, state.lastBlendOpacity, state.lastBlendLayers);
    }
  }

  // renderFrame: runs the chosen effect from EFFECTS against the cached
  // normalized source canvas, snapshots that CLEAN single-effect output for
  // history, then freezes this cycle's blend inputs and delegates the
  // actual on-screen composite to composeFrame above.
  //
  // Snapshotting the CLEAN frame (not a post-overlay result) matters: if
  // history stored the already-blended output instead, every future cycle
  // would blend on top of an increasingly-composited image rather than a
  // distinct effect frame. With multiply/screen that compounds fast (each
  // pass pushes tones further toward black or white), so instead of clearly
  // seeing e.g. Pixelate's blocks overlaid on ASCII's glyphs, everything
  // slides toward a uniform muddy result within a few cycles.
  //
  // state.lastBlendLayers is sliced from state.recentFrames BEFORE this
  // cycle's own frame is unshifted onto it — so composeFrame's blend pass
  // reads the pre-existing history, and a cycle never blends with itself.
  function renderFrame(destCtx, sourceCanvas, effect, effectParams, blendOverlay) {
    destCtx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    effect.run(destCtx, sourceCanvas, effectParams);

    const cleanSnapshot = snapshotFrame(destCtx.canvas);

    // Move (if enabled) will only ever pan this — the primary effect layer —
    // never the blend-history layers below, which are frozen as a static
    // backdrop for the rest of this cycle regardless of how many pan ticks
    // redraw the frame in between.
    state.lastEffectFrame = cleanSnapshot;
    state.lastBlendLayers = blendOverlay
      ? state.recentFrames.slice(0, blendOverlay.layerCount)
      : [];
    state.lastBlendMode = blendOverlay ? blendOverlay.mode : null;
    state.lastBlendOpacity = blendOverlay ? blendOverlay.opacity : 1;

    state.recentFrames.unshift(cleanSnapshot);
    if (state.recentFrames.length > CONFIG.MAX_BLEND_LAYERS) {
      state.recentFrames.length = CONFIG.MAX_BLEND_LAYERS;
    }

    composeFrame(destCtx, params.movePanLeft ? 0 : null);
  }

  async function crossfadeTo(nextCanvas, effect, effectParams, blendOverlay) {
    const incoming =
      state.frontCanvas === canvasA ? canvasB : canvasA;
    const incomingCtx = incoming === canvasA ? ctxA : ctxB;

    renderFrame(incomingCtx, nextCanvas, effect, effectParams, blendOverlay);

    incoming.style.transition = `opacity ${CONFIG.CROSSFADE_MS}ms ease`;
    incoming.style.opacity = String(params.opacity);
    state.frontCanvas.style.transition = `opacity ${CONFIG.CROSSFADE_MS}ms ease`;
    state.frontCanvas.style.opacity = "0";

    state.frontCanvas = incoming;
  }

  // Independent of pickRandomEffect() — this is a modifier layer, not a
  // competing pick. Returns null when the toggle is off, or when every mode
  // in "Blend overlay modes" has been unchecked (renderFrame skips the
  // overlay entirely in either case).
  function pickBlendOverlay() {
    if (!params.blendOverlayEnabled) return null;
    const modes = Object.keys(params.enabledBlendModes).filter(
      (m) => params.enabledBlendModes[m]
    );
    if (modes.length === 0) return null;
    // Slider value is either the fixed count, or (when randomized) the
    // ceiling of a per-cycle 1..N roll.
    const layerCount = params.randomizeBlendLayers
      ? 1 + Math.floor(Math.random() * params.blendLayers)
      : params.blendLayers;
    return {
      mode: modes[Math.floor(Math.random() * modes.length)],
      opacity: params.opacity,
      layerCount,
    };
  }

  async function cycle() {
    if (state.sources.length === 0) return;

    state.currentIndex = pickNextIndex();
    const src = state.sources[state.currentIndex];
    const { key: effectKey, effect, effectParams } = pickRandomEffect();
    const blendOverlay = pickBlendOverlay();
    // Snapshot count as it stood BEFORE this cycle's render adds its own
    // entry — that's what applyBlendOverlay actually had available.
    const layersAvailable = state.recentFrames.length;
    let renderError = null;

    try {
      const normalized = await normalizeImage(src);
      await crossfadeTo(normalized, effect, effectParams, blendOverlay);
      // Only update this on success — a failed render leaves the previous
      // frame on screen, so the animation timer should keep treating
      // whatever's actually still visible as the "current" effect.
      state.lastEffectKey = effectKey;
    } catch (err) {
      // Previously this only went to console.error, so a mid-render throw
      // (e.g. getImageData on a tainted canvas) would silently freeze the
      // display on whatever last rendered, while diagnostics kept reporting
      // the *intended* effect as if it had succeeded. Surface it instead.
      console.error(`[cycle] effect "${effectKey}" failed, image not updated:`, err);
      renderError = err;
    }

    const holdMs = randomHold();
    // Marks the start of this cycle's hold window for the Move overlay's pan
    // progress (elapsed / currentHoldMs, read every rAF tick — see the pan
    // loop below). Reset every cycle regardless of render success/failure,
    // same as the scheduling below; a failed render just means the pan
    // restarts against whatever frame is still on screen.
    state.cycleStartedAt = performance.now();
    state.currentHoldMs = holdMs;
    updateDiagnostics(src, holdMs, effectKey, effectParams, renderError, blendOverlay, layersAvailable);

    // Only schedule the next cycle if nothing paused us while this one was
    // in flight (e.g. user hit P while an image was still loading).
    cycleTimeoutId = state.paused ? null : setTimeout(cycle, holdMs);
  }

  function updateDiagnostics(src, holdMs, effectKey, effectParams, renderError, blendOverlay, layersAvailable) {
    const shortName = src.length > 40 ? `…${src.slice(-37)}` : src;
    setText("diagSource", state.sourceType);
    setText(
      "diagImage",
      `${shortName} (${state.currentIndex + 1}/${state.sources.length})`
    );

    const diagEffectEl = document.getElementById("diagEffect");
    if (renderError) {
      setText("diagEffect", `${effectKey} FAILED: ${renderError.message}`);
      if (diagEffectEl) diagEffectEl.classList.add("error");
    } else {
      const paramStr = Object.entries(effectParams)
        .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : v}`)
        .join(" ");
      let text = paramStr ? `${effectKey} (${paramStr})` : effectKey;
      if (blendOverlay) {
        const layersUsed = Math.min(blendOverlay.layerCount, layersAvailable);
        text += ` + blend(${blendOverlay.mode}, ${layersUsed} layer${layersUsed === 1 ? "" : "s"})`;
      }
      setText("diagEffect", text);
      if (diagEffectEl) diagEffectEl.classList.remove("error");
    }
    setText("diagHold", `${(holdMs / 1000).toFixed(1)}s`);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ---------------------------------------------------------------------
  // 7. CONTROLS — sliders narrow/override the random engine's ranges
  // ---------------------------------------------------------------------
  function setStatus(text) {
    const el = document.getElementById("statusLine");
    if (el) el.textContent = text;
  }

  // Applies Saturation/Contrast as a CSS filter on #stage — the parent of
  // both canvases — rather than as canvas pixel manipulation. This means it
  // affects whatever's currently rendered (any effect, blend combination,
  // or Move pan position) with zero changes to the render pipeline, and
  // updates instantly as the sliders move rather than waiting for the next
  // cycle. 100/100 = filter is a no-op (matches CSS's own defaults).
  function applyLookFilter() {
    const stage = document.getElementById("stage");
    if (stage) {
      stage.style.filter = `saturate(${params.saturation}%) contrast(${params.contrast}%)`;
    }
  }

  function wireControls() {
    const panel = document.getElementById("controls");

    const speedMin = document.getElementById("ctrlSpeedMin");
    const speedMax = document.getElementById("ctrlSpeedMax");
    const speedRandomize = document.getElementById("ctrlSpeedRandomize");
    const opacity = document.getElementById("ctrlOpacity");
    const pixelateMin = document.getElementById("ctrlPixelateMin");
    const pixelateMax = document.getElementById("ctrlPixelateMax");
    const pixelateRandomize = document.getElementById("ctrlPixelateRandomize");
    const halftoneMin = document.getElementById("ctrlHalftoneMin");
    const halftoneMax = document.getElementById("ctrlHalftoneMax");
    const halftoneRandomize = document.getElementById("ctrlHalftoneRandomize");
    const asciiMin = document.getElementById("ctrlAsciiMin");
    const asciiMax = document.getElementById("ctrlAsciiMax");
    const asciiRandomize = document.getElementById("ctrlAsciiRandomize");
    const asciiRamp = document.getElementById("ctrlAsciiRamp");
    const asciiRampRandomize = document.getElementById("ctrlAsciiRampRandomize");
    const asciiAnimate = document.getElementById("ctrlAsciiAnimate");
    const pixelateAnimate = document.getElementById("ctrlPixelateAnimate");
    const colorMode = document.getElementById("ctrlColorMode");
    const paletteSelect = document.getElementById("ctrlPaletteSelect");
    const paletteRandomize = document.getElementById("ctrlPaletteRandomize");
    const animatePaletteColor = document.getElementById("ctrlAnimatePaletteColor");
    const animatePaletteDensityMin = document.getElementById("ctrlAnimatePaletteDensityMin");
    const animatePaletteDensityMax = document.getElementById("ctrlAnimatePaletteDensityMax");
    const animatePaletteDensityRandomize = document.getElementById("ctrlAnimatePaletteDensityRandomize");
    // Four {fg, bg} element pairs, index-matched to params.palettes.
    const paletteColorInputs = [1, 2, 3, 4].map((n) => ({
      fg: document.getElementById(`ctrlPalette${n}Fg`),
      bg: document.getElementById(`ctrlPalette${n}Bg`),
    }));
    const autoCycle = document.getElementById("ctrlAutoCycle");
    const blendOverlay = document.getElementById("ctrlBlendOverlay");
    const blendLayers = document.getElementById("ctrlBlendLayers");
    const randomBlendLayers = document.getElementById("ctrlRandomBlendLayers");
    const movePanLeft = document.getElementById("ctrlMovePanLeft");
    const saturation = document.getElementById("ctrlSaturation");
    const contrast = document.getElementById("ctrlContrast");

    // Effect on/off checkboxes -> EFFECTS registry keys. Blend modes isn't
    // here — it's the separate blendOverlay toggle above, not a competing pick.
    const effectToggles = {
      none: document.getElementById("ctrlEffectNone"),
      duotone: document.getElementById("ctrlEffectDuotone"),
      pixelate: document.getElementById("ctrlEffectPixelate"),
      ascii: document.getElementById("ctrlEffectAscii"),
      halftone: document.getElementById("ctrlEffectHalftone"),
    };

    // Blend overlay mode checkboxes -> globalCompositeOperation values.
    const blendModeToggles = {
      multiply: document.getElementById("ctrlBlendModeMultiply"),
      screen: document.getElementById("ctrlBlendModeScreen"),
      overlay: document.getElementById("ctrlBlendModeOverlay"),
      darken: document.getElementById("ctrlBlendModeDarken"),
      lighten: document.getElementById("ctrlBlendModeLighten"),
      difference: document.getElementById("ctrlBlendModeDifference"),
      exclusion: document.getElementById("ctrlBlendModeExclusion"),
      "hard-light": document.getElementById("ctrlBlendModeHardLight"),
    };

    const valFor = (input) =>
      panel.querySelector(`.val[data-for="${input.id}"]`);

    speedMin.addEventListener("input", () => {
      params.holdMin = parseFloat(speedMin.value);
      valFor(speedMin).textContent = `${params.holdMin}s`;
    });

    speedMax.addEventListener("input", () => {
      params.holdMax = parseFloat(speedMax.value);
      valFor(speedMax).textContent = `${params.holdMax}s`;
    });

    speedRandomize.addEventListener("change", () => {
      params.randomizeSpeed = speedRandomize.checked;
    });

    opacity.addEventListener("input", () => {
      params.opacity = parseFloat(opacity.value);
      valFor(opacity).textContent = params.opacity.toFixed(2);
    });

    saturation.addEventListener("input", () => {
      params.saturation = parseInt(saturation.value, 10);
      valFor(saturation).textContent = `${params.saturation}%`;
      applyLookFilter();
    });

    contrast.addEventListener("input", () => {
      params.contrast = parseInt(contrast.value, 10);
      valFor(contrast).textContent = `${params.contrast}%`;
      applyLookFilter();
    });

    blendLayers.addEventListener("input", () => {
      params.blendLayers = parseInt(blendLayers.value, 10);
      valFor(blendLayers).textContent = String(params.blendLayers);
    });

    pixelateMin.addEventListener("input", () => {
      params.pixelateMin = parseInt(pixelateMin.value, 10);
      valFor(pixelateMin).textContent = `${params.pixelateMin}px`;
    });

    pixelateMax.addEventListener("input", () => {
      params.pixelateMax = parseInt(pixelateMax.value, 10);
      valFor(pixelateMax).textContent = `${params.pixelateMax}px`;
    });

    pixelateRandomize.addEventListener("change", () => {
      params.randomizePixelateScale = pixelateRandomize.checked;
    });

    halftoneMin.addEventListener("input", () => {
      params.halftoneMin = parseInt(halftoneMin.value, 10);
      valFor(halftoneMin).textContent = `${params.halftoneMin}px`;
    });

    halftoneMax.addEventListener("input", () => {
      params.halftoneMax = parseInt(halftoneMax.value, 10);
      valFor(halftoneMax).textContent = `${params.halftoneMax}px`;
    });

    halftoneRandomize.addEventListener("change", () => {
      params.randomizeHalftoneScale = halftoneRandomize.checked;
    });

    asciiMin.addEventListener("input", () => {
      params.asciiMin = parseInt(asciiMin.value, 10);
      valFor(asciiMin).textContent = `${params.asciiMin}px`;
    });

    asciiMax.addEventListener("input", () => {
      params.asciiMax = parseInt(asciiMax.value, 10);
      valFor(asciiMax).textContent = `${params.asciiMax}px`;
    });

    asciiRandomize.addEventListener("change", () => {
      params.randomizeAsciiScale = asciiRandomize.checked;
    });

    asciiRamp.addEventListener("change", () => {
      params.asciiRampStyle = asciiRamp.value;
    });

    asciiRampRandomize.addEventListener("change", () => {
      params.randomizeAsciiRamp = asciiRampRandomize.checked;
    });

    asciiAnimate.addEventListener("change", () => {
      params.asciiAnimate = asciiAnimate.checked;
    });

    pixelateAnimate.addEventListener("change", () => {
      params.pixelateAnimate = pixelateAnimate.checked;
    });

    colorMode.addEventListener("change", () => {
      params.colorMode = colorMode.checked ? "color" : "mono";
    });

    paletteSelect.addEventListener("change", () => {
      params.activePaletteIndex = parseInt(paletteSelect.value, 10);
    });

    paletteRandomize.addEventListener("change", () => {
      params.randomizePalette = paletteRandomize.checked;
    });

    animatePaletteColor.addEventListener("change", () => {
      params.animatePaletteColor = animatePaletteColor.checked;
    });

    animatePaletteDensityMin.addEventListener("input", () => {
      params.animatePaletteDensityMin = parseInt(animatePaletteDensityMin.value, 10);
      valFor(animatePaletteDensityMin).textContent = `${params.animatePaletteDensityMin}%`;
    });

    animatePaletteDensityMax.addEventListener("input", () => {
      params.animatePaletteDensityMax = parseInt(animatePaletteDensityMax.value, 10);
      valFor(animatePaletteDensityMax).textContent = `${params.animatePaletteDensityMax}%`;
    });

    animatePaletteDensityRandomize.addEventListener("change", () => {
      params.randomizeAnimatePaletteDensity = animatePaletteDensityRandomize.checked;
    });

    paletteColorInputs.forEach(({ fg, bg }, i) => {
      fg.addEventListener("input", () => {
        params.palettes[i].fg = fg.value;
      });
      bg.addEventListener("input", () => {
        params.palettes[i].bg = bg.value;
      });
    });

    autoCycle.addEventListener("change", () => {
      togglePause(!autoCycle.checked);
    });

    blendOverlay.addEventListener("change", () => {
      params.blendOverlayEnabled = blendOverlay.checked;
    });

    randomBlendLayers.addEventListener("change", () => {
      params.randomizeBlendLayers = randomBlendLayers.checked;
    });

    movePanLeft.addEventListener("change", () => {
      params.movePanLeft = movePanLeft.checked;
    });

    for (const [key, box] of Object.entries(effectToggles)) {
      if (!box) continue;
      box.addEventListener("change", () => {
        params.enabledEffects[key] = box.checked;
      });
    }

    for (const [mode, box] of Object.entries(blendModeToggles)) {
      if (!box) continue;
      box.addEventListener("change", () => {
        params.enabledBlendModes[mode] = box.checked;
      });
    }

    window.addEventListener("keydown", (e) => {
      if (e.key === "c" || e.key === "C") {
        panel.classList.toggle("hidden");
      }
      if (e.key === "d" || e.key === "D") {
        const diag = document.getElementById("diagnostics");
        if (diag) diag.classList.toggle("hidden");
      }
      if (e.key === "p" || e.key === "P") {
        togglePause();
      }
    });
  }

  // Ticks continuously; each branch is a no-op unless its effect is both the
  // currently-visible one and at least one of its animate toggles is on, so
  // this costs nothing the rest of the time. Shared by ASCII (glyph flicker
  // and/or palette shimmer), Pixelate (cell-size bounce and/or palette
  // shimmer), and Halftone (palette shimmer only — it has no other
  // animation axis). "Animate palette per cell" re-rolls a random palette
  // per pixel/dot/character each tick it fires on, independently of
  // whichever effect-specific animate toggle (if any) also fires it.
  const EFFECT_ANIMATE_INTERVAL_MS = 180;
  setInterval(() => {
    if ((params.asciiAnimate || params.animatePaletteColor) && state.lastEffectKey === "ascii") {
      redrawAsciiAnimationFrame();
    }
    if ((params.pixelateAnimate || params.animatePaletteColor) && state.lastEffectKey === "pixelate") {
      redrawPixelateAnimationFrame();
    }
    if (params.animatePaletteColor && state.lastEffectKey === "halftone") {
      redrawHalftoneAnimationFrame();
    }
  }, EFFECT_ANIMATE_INTERVAL_MS);

  // Move overlay's pan loop — runs every animation frame (not on the coarser
  // 180ms ticker above) since a camera pan reads as smooth motion, unlike
  // the deliberately chunky glyph-flicker/cell-bounce animations. Independent
  // of state.lastEffectKey by design: Move applies on top of whichever
  // effect is showing, same as Blend overlay.
  //
  // Redraws via composeFrame rather than panning the frame directly, so the
  // blend-history layers get re-composited fresh (unpanned, from the frozen
  // state.lastBlendLayers) on every tick instead of dragging along with the
  // effect layer underneath — only one "plane" of the image moves.
  //
  // Known limitation: if Pixelate/ASCII "animate" is also on at the same
  // time as Move, both redraw the front canvas independently and don't know
  // about each other — whichever tick fires last wins that repaint. Fine
  // for now (each still ends up looking right most frames), but if the two
  // visibly fight during rehearsal, the fix is to fold them into composeFrame
  // too instead of leaving them as separate bypass-redraws.
  function moveAnimationLoop() {
    if (params.movePanLeft && state.lastEffectFrame && state.currentHoldMs > 0) {
      const elapsed = performance.now() - state.cycleStartedAt;
      const progress = elapsed / state.currentHoldMs;
      const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
      composeFrame(ctx, progress);
    }
    requestAnimationFrame(moveAnimationLoop);
  }
  requestAnimationFrame(moveAnimationLoop);

  // ---------------------------------------------------------------------
  // 8. REMOTE CONTROL — mirrors the panel to controls.html over
  // BroadcastChannel, for a second tab/window on the SAME device (e.g. the
  // laptop's own screen while the display is fullscreen on a projector).
  //
  // This is same-device only — BroadcastChannel doesn't cross the network,
  // so it won't reach a phone or another computer. It also only works when
  // both pages are served over http(s) (e.g. GitHub Pages, or
  // `python3 -m http.server` locally) — opening either file directly via
  // file:// gives it an opaque origin in most browsers and breaks the
  // channel silently.
  //
  // Deliberately one-directional in what each side sends: controls.html
  // only ever sends "input"/"requestState" messages, and index.html only
  // ever sends "state" messages — so there's no possibility of the two
  // pages echoing a change back and forth in a loop.
  // ---------------------------------------------------------------------
  const remoteChannel = "BroadcastChannel" in window ? new BroadcastChannel("photoRemixControls") : null;

  // Every control's current value/checked state, plus whatever formatted
  // text its `.val` span is currently showing (e.g. "12px", "6s") — sent
  // wholesale rather than diffed, since the panel is small (~30 controls)
  // and this keeps the remote page's display text byte-for-byte identical
  // to the real thing without duplicating any formatting logic over there.
  function gatherControlState() {
    const values = {};
    document.querySelectorAll('#controls [id^="ctrl"]').forEach((el) => {
      const valSpan = document.querySelector(`.val[data-for="${el.id}"]`);
      values[el.id] = {
        value: el.value,
        checked: el.type === "checkbox" ? el.checked : undefined,
        display: valSpan ? valSpan.textContent : undefined,
      };
    });
    return values;
  }

  function broadcastState() {
    if (remoteChannel) {
      remoteChannel.postMessage({ type: "state", values: gatherControlState() });
    }
  }

  if (remoteChannel) {
    remoteChannel.onmessage = (evt) => {
      const msg = evt.data;
      if (msg.type === "requestState") {
        broadcastState();
      } else if (msg.type === "input") {
        // Apply exactly as if the LOCAL control had fired: set the value,
        // then dispatch real input/change events so every existing
        // wireControls() listener runs unmodified — no separate code path
        // to keep in sync with the 30-odd controls already wired up.
        const el = document.getElementById(msg.id);
        if (!el) return;
        if (msg.checked !== undefined) el.checked = msg.checked;
        else el.value = msg.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    // Delegated on the panel container rather than added to every individual
    // control — fires after each control's own listener already updated
    // params/its `.val` text (bubble phase), for both real local interaction
    // AND the synthetic events dispatched above, so remote pages see the
    // final formatted result either way.
    const controlsPanelEl = document.getElementById("controls");
    if (controlsPanelEl) {
      controlsPanelEl.addEventListener("input", broadcastState);
      controlsPanelEl.addEventListener("change", broadcastState);
    }
  }

  // ---------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------
  // Opening this page via file:// (double-clicking it instead of serving it)
  // taints the canvas for locally-loaded images in Chrome/Edge even though
  // they're same-origin — a browser quirk, not a bug here. Draw-only
  // effects (Pixelate, none) still work fine; anything calling
  // getImageData (Duotone's mono mode, ASCII, Halftone) throws
  // "canvas has been tainted by cross-origin data". Warn up front rather
  // than let that surface as a confusing per-effect error later.
  //
  // Written to its own diagnostics line (not setStatus/diagSource) because
  // those get overwritten every cycle by the normal render loop — this
  // warning needs to stick around, not flash by once and vanish.
  function warnIfFileProtocol() {
    if (location.protocol !== "file:") return;
    const msg =
      "file:// detected — Duotone/ASCII/Halftone will fail (tainted canvas). Serve this folder instead, e.g. `python3 -m http.server`, or use the GitHub Pages URL.";
    console.warn(`[boot] ${msg}`);
    const el = document.getElementById("diagWarning");
    if (el) {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  async function boot() {
    wireControls();
    applyLookFilter(); // sets the initial (default 100/100, no-op) CSS filter
    broadcastState(); // so a remote page opened first sees real values, not just HTML defaults
    warnIfFileProtocol();

    try {
      state.sources = await loadImageSources();

      if (state.sources.length === 0) {
        setStatus("no images available (Drive and seeds both empty)");
        setText("diagSource", "none");
        return;
      }

      // Pre-warm the first image so the first cycle isn't blank.
      await normalizeImage(state.sources[0]);
      cycle();
    } catch (err) {
      // Surface boot failures instead of leaving a silent black screen —
      // e.g. seed images failing to load, folder path wrong, etc.
      console.error("[boot] failed:", err);
      setStatus(`boot error: ${err.message}`);
      setText("diagSource", "ERROR");
      setText("diagImage", err.message);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
