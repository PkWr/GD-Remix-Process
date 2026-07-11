/*
 * Generative Photo Remix — app.js
 *
 * Plain JS, no build step, no framework. Sections below map to the spec's
 * build order:
 *   1. CONFIG            — tunables, referrer-restricted API key goes here
 *   2. SEED IMAGES        — bundled offline fallback (assets/seeds/*)
 *   3. DRIVE FETCH        — files.list against the public folder
 *   4. IMAGE PIPELINE     — cover-crop normalize to 1080x1920, cached
 *   5. EFFECT PALETTE     — pixelation (2), halftone (5), ascii (bonus)
 *   6. STATE / RENDER LOOP — random engine + crossfade cycle (3) + blend overlay (4)
 *   7. CONTROLS           — sliders that narrow the random engine's ranges
 *
 * Effect palette: pixelation, halftone, plus a bonus ASCII-art effect.
 * Duotone/greyscale (originally effect 1) was cut — visually the least
 * distinct of the four in the live loop, and its colour-remap technique is
 * already demonstrated by the other three's shared Colour panel. Every
 * pixel-sampling effect (pixelate/halftone/ascii) shares that same Colour
 * panel (4 Highlights/Shadows palettes, randomizable/animatable).
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

    // Single-slot localStorage key for the Presets section's Save/Load —
    // see saveSettingsToStorage()/loadSettingsFromStorage() below.
    SETTINGS_STORAGE_KEY: "photoRemixSavedSettings",

    // Default min/max hold duration (seconds) before the next transition.
    // Sliders in the control panel narrow/override these live.
    HOLD_MIN: 2.5,
    HOLD_MAX: 9,

    CROSSFADE_MS: 2000,
    // How different a palette's Highlights/Shadows luminance must be (0-1
    // scale) to pass the Safe mode filter in enabledPaletteIndices(). The
    // four built-in palettes all clear this easily; it only ever excludes
    // something if a custom colour picker choice ends up dark-on-dark.
    SAFE_MODE_MIN_LUMINANCE_GAP: 0.35,
    // Prototype: incoming canvas blends onto the outgoing one via CSS
    // mix-blend-mode for the crossfade duration, instead of a plain alpha
    // dissolve — avoids the muddy/flickery midpoint two very different
    // effect renderings get with a straight opacity cross-dissolve. Reset
    // to "normal" once the fade finishes (see crossfadeTo).
    CROSSFADE_BLEND_MODE: "screen",

    // Full slider ranges (must match index.html's min/max attributes) —
    // used when "Randomize scale + ASCII style" is on, rolling the entire
    // range each cycle instead of the narrow band around the slider value.
    PIXELATE_SLIDER_MIN: 2,
    PIXELATE_SLIDER_MAX: 128,
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

    // Move overlay (Ken Burns-style pan/tilt/zoom): neutral zoom level
    // (1.18 = 18% larger than the frame) whenever the Zoom slider itself is
    // at 0 — this is what gives Pan/Tilt room to slide the 1080x1920
    // viewport across the image without ever revealing an edge, regardless
    // of whether Zoom is actively moving. Applied to the already-fully-
    // rendered frame (post effect + blend), not the source image, so it
    // works the same regardless of which effect/blend is currently showing.
    MOVE_ZOOM_BASE: 1.18,
    // Zoom slider's floor/ceiling — how far it can sweep from
    // MOVE_ZOOM_BASE toward "zoomed out" (negative slider) or "zoomed in"
    // (positive slider). MIN can't go below 1.0: below that the scaled
    // image is smaller than the frame and exposes blank edges.
    MOVE_ZOOM_MIN: 1.0,
    MOVE_ZOOM_MAX: 1.5,
    // At any Move slider's max magnitude (100), how much of its full 0-1
    // sweep completes per second — 0.5 means a full sweep takes ~2s. Actual
    // rate scales linearly down to 0 at slider value 0 (no movement).
    // Shared by Pan/Tilt/Zoom so "speed" means the same thing across all
    // three, and deliberately independent of the current cycle's hold
    // duration, so it also means the same thing regardless of how long an
    // image stays on screen.
    MOVE_MAX_RATE_PER_SEC: 0.5,
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
    // Off = hard cut (both canvases jump straight to their end opacity, no
    // CSS transition). On = the CROSSFADE_MS ease that's always run so far.
    // Pure comparison toggle — doesn't change anything else about the cycle.
    crossfadeEnabled: true,
    // "demo" = the curated assets/demo/ folder the workshop opens on. "live"
    // = whatever students have actually contributed (Drive if configured,
    // else the assets/seeds/ folder the Image uploader writes into). Flip
    // with the L key or the "Live student photos" checkbox — see
    // switchSourceMode().
    sourceMode: "demo",
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
    // "Random cell size" — independent per effect, independent of the
    // Animate scale bounce above. Instead of every block/dot/character in a
    // frame sharing one uniform size, each cell rerolls its own size jitter
    // around the resolved cellSize, so the grid itself reads as irregular
    // rather than a perfectly even mosaic. Re-rolls on every redraw the
    // ticker fires for that effect (see EFFECT_ANIMATE_INTERVAL_MS below),
    // so turning this on alone is enough to make sizes shimmer even with no
    // other animate toggle on.
    pixelateRandomCellSize: false,
    halftoneRandomCellSize: false,
    asciiRandomCellSize: false,
    // Four Highlights/Shadows colour-pair presets shared by Pixelate/
    // Halftone/ASCII — always applied now (v2: removed the "Colorized"
    // real-sampled-colour toggle). No manual selector; Palette 1 is the
    // fixed default and Randomize palette (below) is what actually
    // varies which one is in use.
    // Highlights are pure-channel RGB fluorescents (green/cyan/yellow, plus
    // magenta as the fourth complementary) — maxed-out single/dual channels
    // read as neon on screen. Shadows are RICH (deep but saturated, not
    // near-black) contrasting colours, each picked to visually fight its own
    // Highlights rather than just recede behind it: green fg sits on a rich
    // blue, cyan fg on a rich purple, yellow fg on a rich red, magenta fg on
    // a rich green. Deliberately more saturated than a plain dark tint —
    // the contrast itself is the point, not a subtle colour cast.
    palettes: [
      { fg: "#00ff00", bg: "#002fa7" }, // fluorescent green / rich blue shadow
      { fg: "#00ffff", bg: "#6a0dad" }, // fluorescent cyan / rich purple shadow
      { fg: "#ffff00", bg: "#99000d" }, // fluorescent yellow / rich red shadow
      { fg: "#ff00ff", bg: "#00802b" }, // fluorescent magenta / rich green shadow
    ],
    // Parallel to palettes above — unchecking a palette's "In rotation" box
    // removes it from both the per-cycle pick (randomizePalette) and the
    // per-cell pick (animatePaletteColor), same enable/disable pattern as
    // enabledEffects. All four on by default.
    paletteEnabled: [true, true, true, true],
    // Off by default (the four built-in palettes are already safe). On =
    // enabledPaletteIndices() additionally excludes any palette whose
    // Highlights/Shadows luminance is too close together — guards against a
    // dark-on-dark custom colour pick rendering as a muddy near-black
    // image. Deliberately a manual toggle for now rather than automatic
    // correction — more on that after the workshop.
    paletteSafeMode: false,
    // Off = always use the lowest-numbered enabled palette. On = pick a
    // random ENABLED palette every cycle instead — same on/off-toggle-over-
    // a-set pattern as randomizeAsciiRamp, but over palettes instead of
    // character ramps.
    randomizePalette: false,
    // Off = every cell in a frame uses the one resolved palette (whether
    // fixed or per-cycle-randomized above). On = ASCII/Halftone/Pixelate
    // additionally re-roll a random palette PER CELL on every animation
    // tick, so individual pixels/dots/characters shimmer between palettes
    // independently instead of the whole frame moving as one flat colour.
    animatePaletteColor: false,
    // What percentage of cells actually re-roll a random palette on each
    // animation tick when animatePaletteColor is on — the rest keep that
    // cell's normal resolved colour that tick. 100 = every cell shimmers;
    // lower values sparsify it. Explicit min/max + Randomize toggle, same
    // on/off-over-a-range pattern as Speed/Pixelate/Halftone/ASCII scale.
    animatePaletteDensityMin: 0,
    animatePaletteDensityMax: 20,
    randomizeAnimatePaletteDensity: false,
    // Which EFFECTS keys the random engine is allowed to pick — checking a
    // box in each effect's own "In rotation" toggle turns it on here. Only
    // Untouched starts on: the workshop opens on plain photos while students
    // do analogue work, and the facilitator switches effects on live during
    // the "how this was built" reveal rather than the show launching
    // straight into random effects. Blend modes isn't in this list — it's
    // the separate blendOverlayEnabled toggle below, not a competing pick.
    enabledEffects: {
      none: true,
      duotone: false,
      pixelate: false,
      ascii: false,
      halftone: false,
    },
    // On = the very first image on page load forces Untouched regardless of
    // what the random engine would otherwise pick, so the show opens on a
    // plain photo before the effects kick in. Every cycle after that first
    // one goes back to fully random (including possibly landing on
    // Untouched again by chance). No-ops if enabledEffects.none is off.
    startUnchanged: true,
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
    // Blend overlay. Three independent signed sliders, all 0 = off,
    // magnitude (0-100) = speed: Pan (horizontal, negative = left, positive
    // = right), Tilt (vertical, negative = down, positive = up), and Zoom
    // (negative = out, positive = in). Any combination can run at once — a
    // diagonal drift, a push-in while drifting left, etc. See
    // computeMovePanProgress/computeMoveTiltProgress/computeMoveZoomLevel
    // for how sign/magnitude map to each axis's Ken Burns sweep.
    movePanSpeed: 0,
    moveTiltSpeed: 0,
    moveZoomSpeed: 0,
    // Bounds on the random MAGNITUDE (0-100) rolled per axis when
    // "Randomize move" is on — direction (sign) is rolled separately at
    // 50/50, independent of these. Same explicit Min/Max pattern as
    // Pixelate/Halftone/ASCII scale, just without a Randomize-off "fixed at
    // Min" behaviour of their own, since moveRandomize below already covers
    // on/off for the whole feature.
    moveSpeedMin: 20,
    moveSpeedMax: 80,
    // Off = the three sliders above are used as-is (state.moveResolvedPan/
    // Tilt/Zoom just mirror them, see resolveMoveSpeeds()). On = every new
    // image cycle rolls a fresh random magnitude (between moveSpeedMin/Max)
    // and a fresh random direction for each axis instead, independent of
    // wherever the sliders are currently set.
    moveRandomize: false,
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
  // Workshop workflow: a photo arrives on the facilitator's laptop (e.g. via
  // Snapdrop), gets dragged into assets/seeds/, and renamed to the next
  // number in this sequence — seed-01.jpg, seed-02.jpg, seed-03.jpg, ...
  // That's it, no code edit needed. Used whenever the Drive fetch fails or
  // returns zero usable images (no wifi, key not live yet, folder empty).
  //
  // GitHub Pages doesn't serve a directory listing, so this can't just fetch
  // the folder and see what's there. Instead it probes each sequential
  // filename as an <img> and keeps whichever ones actually load; anything
  // past the last real file 404s and is silently dropped. SEED_MAX_PROBE is
  // just a safety ceiling on how far to look, not an expected file count.
  const SEED_MAX_PROBE = 60;

  function probeSeedImage(index) {
    return new Promise((resolve) => {
      const path = `assets/seeds/seed-${String(index).padStart(2, "0")}.jpg`;
      const img = new Image();
      img.onload = () => resolve(path);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }

  async function discoverSeedImages() {
    const indices = Array.from({ length: SEED_MAX_PROBE }, (_, i) => i + 1);
    const results = await Promise.all(indices.map(probeSeedImage));
    return results.filter(Boolean); // Promise.all preserves order, so this is already ascending
  }

  // ---------------------------------------------------------------------
  // 2b. DEMO IMAGES (curated, protected — never touched by the Image
  // uploader, which only ever reads/writes/deletes assets/seeds/)
  // ---------------------------------------------------------------------
  // Same sequential-probe trick as the seed pool above, just pointed at a
  // separate folder: assets/demo/demo-01.jpg, demo-02.jpg, ... This is the
  // curated "show off the filters" set the workshop opens on. Because
  // seed-loader.html's read/write/delete calls only ever touch
  // assets/seeds/, whatever's in assets/demo/ is physically unreachable from
  // that tool — that's the actual protection, not a permissions flag.
  const DEMO_MAX_PROBE = 30;

  function probeDemoImage(index) {
    return new Promise((resolve) => {
      const path = `assets/demo/demo-${String(index).padStart(2, "0")}.jpg`;
      const img = new Image();
      img.onload = () => resolve(path);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }

  async function discoverDemoImages() {
    const indices = Array.from({ length: DEMO_MAX_PROBE }, (_, i) => i + 1);
    const results = await Promise.all(indices.map(probeDemoImage));
    return results.filter(Boolean);
  }

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

  // "Live" pool: Drive folder if configured, else the assets/seeds/ folder
  // the Image uploader writes into. This is what the workshop switches TO
  // once students' own photos are ready to show — see loadImageSourcesForMode.
  async function loadImageSources() {
    setStatus("fetching Drive folder…");
    const driveUrls = await fetchDriveImageUrls();

    if (driveUrls.length > 0) {
      setStatus(`loaded ${driveUrls.length} image(s) from Drive`);
      state.sourceType = "drive";
      return driveUrls;
    }

    const seedUrls = await discoverSeedImages();
    setStatus(`Drive unavailable — using ${seedUrls.length} local seed image(s)`);
    state.sourceType = "seed";
    return seedUrls;
  }

  // Top-level entry point boot() and switchSourceMode() both call. "demo" is
  // the curated, protected assets/demo/ folder the workshop opens on; "live"
  // is the existing Drive-then-seeds logic above (whatever students have
  // actually contributed via the Image uploader, or Drive if that's set up).
  // If the demo folder turns out to be empty (e.g. nobody populated it),
  // this falls through to "live" rather than leaving the display blank.
  async function loadImageSourcesForMode(mode) {
    if (mode === "demo") {
      setStatus("loading demo images…");
      const demoUrls = await discoverDemoImages();
      if (demoUrls.length > 0) {
        setStatus(`loaded ${demoUrls.length} demo image(s)`);
        state.sourceType = "demo";
        return demoUrls;
      }
      setStatus("no demo images found in assets/demo/ — falling back to live pool");
    }
    return loadImageSources();
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

  // Shared colour helpers — every effect below recolours by luminance
  // between bgColor (darkest) and fgColor (brightest).
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

  // Same weighting as every per-pixel luminance calc elsewhere (Duotone,
  // Halftone, ASCII) — used here on the two flat picker colours themselves,
  // not on sampled image pixels, for the Safe mode check below.
  function hexLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // Indices of palettes whose "In rotation" box is checked, further
  // narrowed by Safe mode (if on) to just the ones whose Highlights/Shadows
  // luminance actually differ enough to read as a duotone rather than a
  // muddy dark-on-dark smear — a real risk once custom colour pickers let
  // anyone set both ends dark by accident. Falls back to the wider set at
  // each stage if narrowing would leave zero usable palettes (defensive,
  // same reasoning as pickRandomEffect's "none" fallback) so the app never
  // ends up with nothing to draw from.
  function enabledPaletteIndices() {
    const idxs = params.paletteEnabled
      .map((on, i) => (on ? i : -1))
      .filter((i) => i !== -1);
    const enabled = idxs.length > 0 ? idxs : params.palettes.map((_, i) => i);

    if (!params.paletteSafeMode) return enabled;

    const safe = enabled.filter((i) => {
      const pal = params.palettes[i];
      return Math.abs(hexLuminance(pal.fg) - hexLuminance(pal.bg)) >= CONFIG.SAFE_MODE_MIN_LUMINANCE_GAP;
    });
    return safe.length > 0 ? safe : enabled;
  }

  // Resolves which Highlights/Shadows pair this cycle's colouring should
  // use — the lowest-numbered enabled palette by default, or (when
  // Randomize palette is on) a fresh random pick among enabled palettes.
  // Called once per cycle from inside whichever effect's randomParams()
  // runs, so a single resolved pair is shared by every colour reference
  // within that cycle and shows up in the diagnostics line via
  // effectParams' paletteIndex.
  function resolveActivePalette() {
    const enabled = enabledPaletteIndices();
    const idx = params.randomizePalette
      ? enabled[Math.floor(Math.random() * enabled.length)]
      : enabled[0];
    const palette = params.palettes[idx] || params.palettes[0];
    return { fgColor: palette.fg, bgColor: palette.bg, paletteIndex: idx + 1 };
  }

  // Per-cell variant of the above, used only when "Animate palette per
  // cell" is on — instead of the one palette resolved for the whole frame,
  // each call picks a fresh random ENABLED palette and mixes its
  // Shadows/Highlights by this cell's luminance, same formula as the static
  // mono mix. Calling this repeatedly on a redraw timer (rather than once
  // per cycle) is what makes individual cells shimmer between palettes
  // independently.
  function randomPaletteMonoColor(lum) {
    const enabled = enabledPaletteIndices();
    const idx = enabled[Math.floor(Math.random() * enabled.length)];
    const pal = params.palettes[idx];
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

  // Duotone (effect 1, re-added): every pixel's luminance maps onto the
  // resolved palette's Shadows..Highlights gradient, same mixHexColors
  // formula the other three effects use per-cell — this just runs it over
  // every pixel in one pass instead of per grid cell. No cells here, so it
  // doesn't participate in "Animate palette per cell"/Coverage (those are
  // built around discrete grid cells); it only picks up Randomize palette's
  // per-cycle resolved pair, same as pixelate/halftone/ascii.
  function runDuotoneEffect(ctx, sourceCanvas, { fgColor, bgColor }) {
    ctx.drawImage(sourceCanvas, 0, 0);
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const mixed = mixHexColors(bgColor, fgColor, lum);
      d[i] = mixed.r;
      d[i + 1] = mixed.g;
      d[i + 2] = mixed.b;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Pixelation (effect 2): downscale the source onto a tiny offscreen
  // canvas, then scale it back up with smoothing off so the browser's own
  // upscale does the blocky enlargement — no manual per-cell loop needed.
  const pixelateTempCanvas = document.createElement("canvas");

  function applyPixelate(ctx, sourceCanvas, { cellSize, fgColor, bgColor }) {
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

    // Recolour the tiny pre-upscale canvas only — cols*rows pixels here (a
    // few hundred to a few thousand), vs. the full 1080x1920 canvas, so this
    // stays cheap even though it's a per-pixel getImageData pass. When
    // "Animate palette per cell" is on, each pixel/block rolls its own
    // random palette here instead of the one resolved fgColor/bgColor —
    // since this whole recolour loop reruns every time applyPixelate is
    // called, that alone makes the blocks shimmer on each redraw tick, with
    // no extra animation plumbing needed beyond calling this again.
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

    if (params.pixelateRandomCellSize) {
      // Manual per-cell draw instead of one scaled blit — lets each block's
      // rendered rect grow independently, so the grid reads as irregular
      // rather than a perfectly even mosaic. Cheap because this only runs
      // at the ~180ms ticker cadence, not every animation frame.
      const cellW = w / cols;
      const cellH = h / rows;
      ctx.imageSmoothingEnabled = false;
      // Jitter is grow-only (1.0x-1.6x, anchored top-left) so every cell's
      // own nominal footprint always stays fully covered by its own rect —
      // no background can ever show through as a gap. Growth instead spills
      // into the cell below/right, and since cells draw in row-major order,
      // later (down/right) cells simply paint back over that spillover,
      // which is what creates the visible size variation between blocks.
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 4;
          ctx.fillStyle = `rgb(${d[i]}, ${d[i + 1]}, ${d[i + 2]})`;
          const jitterW = 1 + Math.random() * 0.6;
          const jitterH = 1 + Math.random() * 0.6;
          ctx.fillRect(col * cellW, row * cellH, cellW * jitterW, cellH * jitterH);
        }
      }
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.imageSmoothingEnabled = false; // hard-edged upscale = visible blocks
      ctx.drawImage(pixelateTempCanvas, 0, 0, cols, rows, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true; // reset so later effects aren't affected
    }
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
    // Keep this cycle's cached "clean" bitmap in sync with what actually
    // just got drawn, and reapply the frozen blend-history layers on top —
    // without this, every animate tick (cell-size bounce, random cell size,
    // or palette shimmer) would silently erase the Blend overlay until the
    // NEXT full cycle, since this redraws straight onto the canvas rather
    // than going through composeFrame() the way Move's pan ticker does.
    state.lastEffectFrame = snapshotFrame(ctx.canvas);
    if (state.lastBlendMode) {
      applyBlendOverlay(ctx, state.lastBlendMode, state.lastBlendOpacity, state.lastBlendLayers);
    }
  }

  // Blend modes (effect 4) — no longer a competing pick in "Effects in
  // rotation". Instead, when the Blend overlay toggle is on, this composites
  // one or more past frames on top of whatever the primary effect
  // (pixelate/ascii/halftone/none) just drew, using multiply/screen/
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
  // true re-rolls a random palette per dot instead of the flat resolved
  // fgColor for the whole frame — dot size alone still carries brightness
  // either way, same convention as real halftone printing.
  function drawHalftoneFrame(ctx, frame, animatePalette) {
    const { sample, cols, rows, cellW, cellH, maxRadius, fgColor, bgColor, w, h } = frame;
    // Resolved once for this whole redraw, not per dot — see
    // resolveAnimatePaletteDensity's comment for why.
    const density = animatePalette ? resolveAnimatePaletteDensity() : 0;

    ctx.fillStyle = bgColor || "#000000";
    ctx.fillRect(0, 0, w, h);

    // Flat ink colour — dot size alone carries the brightness, same
    // convention as real halftone printing, rather than also tinting. This
    // is also the fallback colour for dots that DON'T win the
    // animatePaletteDensity roll below, when animatePalette is on.
    const monoFg = hexToRgb(fgColor || "#00ff00");

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = (row * cols + col) * 4;
        const r = sample[i], g = sample[i + 1], b = sample[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        let radius = maxRadius * lum;
        // "Random cell size" — extra jitter on top of the luminance-driven
        // size, so two dots at the same brightness no longer draw at
        // identical sizes. Allowed to exceed maxRadius a bit (dots overlap
        // their neighbours slightly rather than clipping), since a hard cap
        // would flatten out exactly the variation this toggle is for.
        if (params.halftoneRandomCellSize) radius *= 0.5 + Math.random();
        if (radius < 0.5) continue; // near-invisible, cheap skip

        const rollPalette = animatePalette && Math.random() * 100 < density;
        if (rollPalette) {
          const pal = params.palettes[Math.floor(Math.random() * params.palettes.length)];
          const fg = hexToRgb(pal.fg);
          ctx.fillStyle = `rgb(${fg.r}, ${fg.g}, ${fg.b})`;
        } else {
          ctx.fillStyle = `rgb(${monoFg.r}, ${monoFg.g}, ${monoFg.b})`;
        }

        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function applyHalftone(ctx, sourceCanvas, { cellSize, fgColor, bgColor }) {
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

    const frame = { sample, cols, rows, cellW, cellH, maxRadius, fgColor, bgColor, w, h };
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
    // See redrawPixelateAnimationFrame() for why this reapplies the frozen
    // blend overlay: this ticker redraws straight onto the canvas outside
    // composeFrame(), so without this the Blend overlay would silently drop
    // out every tick while Halftone's dot/grid scale animates.
    state.lastEffectFrame = snapshotFrame(ctx.canvas);
    if (state.lastBlendMode) {
      applyBlendOverlay(ctx, state.lastBlendMode, state.lastBlendOpacity, state.lastBlendLayers);
    }
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
  //   animatePalette — true re-rolls a random palette per cell instead of
  //                    the one palette resolved for the whole frame; false
  //                    uses that resolved fgColor/bgColor.
  // The initial per-cycle render (applyAscii) always calls this with both
  // false — flicker/shimmer only kicks in on later redraw ticks.
  function drawAsciiFrame(ctx, frame, animateGlyph, animatePalette) {
    const { sample, cols, rows, cellW, cellH, rampStyle, fgColor, bgColor, w, h } = frame;
    const ramp = ASCII_RAMPS[rampStyle] || ASCII_RAMPS.density;
    const variants = ASCII_RAMP_VARIANTS[rampStyle] || ASCII_RAMP_VARIANTS.density;
    // Resolved once for this whole redraw, not per character — see
    // resolveAnimatePaletteDensity's comment for why.
    const density = animatePalette ? resolveAnimatePaletteDensity() : 0;

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

        // Same bg->fg interpolation Pixelate uses, so both effects read
        // consistently off the same two colour pickers — unless this cell
        // wins the animatePaletteDensity roll, in which case it gets its
        // own random palette instead of the frame's one resolved pair.
        const rollPalette = animatePalette && Math.random() * 100 < density;
        const mixed = rollPalette
          ? randomPaletteMonoColor(lum)
          : mixHexColors(bgColor || "#000000", fgColor || "#00ff00", lum);
        ctx.fillStyle = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
        // "Random cell size" — jitters this character's own font size
        // around the base cellH instead of every glyph sharing one uniform
        // size. Resets ctx.font back to the base size right after so a
        // skipped-space cell (no font change) never leaves a stale jittered
        // size behind for the next drawn glyph.
        if (params.asciiRandomCellSize) {
          const jitter = 0.6 + Math.random() * 0.9;
          ctx.font = `${Math.ceil(cellH * jitter)}px monospace`;
        }
        ctx.fillText(ch, col * cellW, row * cellH);
        if (params.asciiRandomCellSize) {
          ctx.font = `${Math.ceil(cellH)}px monospace`;
        }
      }
    }
  }

  function applyAscii(ctx, sourceCanvas, { cellSize, rampStyle, fgColor, bgColor }) {
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

    const frame = { sample, cols, rows, cellW, cellH, rampStyle, fgColor, bgColor, w, h };
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
    // See redrawPixelateAnimationFrame() for why this reapplies the frozen
    // blend overlay: this ticker redraws straight onto the canvas outside
    // composeFrame(), so without this the Blend overlay would silently drop
    // out every tick while ASCII's glyphs/palette animate.
    state.lastEffectFrame = snapshotFrame(ctx.canvas);
    if (state.lastBlendMode) {
      applyBlendOverlay(ctx, state.lastBlendMode, state.lastBlendOpacity, state.lastBlendLayers);
    }
  }

  // Registry the random engine picks from. "none" (Untouched) is a regular
  // user-facing toggle now (see enabledEffects above) as well as the
  // internal fallback pickRandomEffect() reaches for if every effect gets
  // unchecked, so the cycle still has something to draw either way.
  const EFFECTS = {
    none: {
      label: "none",
      randomParams: () => ({}),
      run: (ctx, sourceCanvas) => ctx.drawImage(sourceCanvas, 0, 0),
    },
    duotone: {
      label: "duotone",
      randomParams: () => ({
        ...resolveActivePalette(),
      }),
      run: runDuotoneEffect,
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
    // Flips true after the first cycle ever runs — see startUnchanged's use
    // in cycle() below. Deliberately NOT reset on pause/resume; it's a
    // once-per-page-load thing, not a once-per-play-session thing.
    hasCycled: false,
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
    // This cycle's EFFECTIVE Pan/Tilt/Zoom speeds — what every Move
    // resolver actually reads, rather than params.move*Speed directly. When
    // "Randomize move" is off these just mirror the sliders (see
    // resolveMoveSpeeds()); when it's on they're fresh random rolls made
    // once per cycle, same "slider position stays put, engine resolves its
    // own per-cycle value" pattern as randomHold()/pickRandomEffect() — the
    // Pan/Tilt/Zoom sliders are left exactly where the user set them rather
    // than being dragged around by the randomizer.
    moveResolvedPan: 0,
    moveResolvedTilt: 0,
    moveResolvedZoom: 0,
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

  // Switches between the curated "demo" pool and the "live" (Drive/seeds)
  // pool while the display is running — triggered by the L key or the "Live
  // student photos" checkbox (see wireControls). Cancels whatever cycle is
  // pending and starts a fresh one immediately against the new pool instead
  // of waiting out whatever hold duration happened to be mid-flight, so the
  // switch reads as instant rather than "eventually catches up". Re-runs the
  // relevant discover/fetch fresh every time, so flipping to "live" also
  // doubles as a manual refresh for anything uploaded since boot.
  let sourceSwitchToken = 0;
  async function switchSourceMode(mode) {
    if (mode === params.sourceMode) return;
    params.sourceMode = mode;

    const liveModeBox = document.getElementById("ctrlLiveMode");
    if (liveModeBox) liveModeBox.checked = mode === "live";

    // Guards against two switches overlapping if the key/toggle gets hit
    // twice in a row — only the LAST call's result is applied.
    const token = ++sourceSwitchToken;
    const sources = await loadImageSourcesForMode(mode);
    if (token !== sourceSwitchToken) return;

    state.sources = sources;
    state.currentIndex = -1;

    if (state.sources.length === 0) {
      setText("diagSource", "none");
      setText("diagImage", "no images available");
      return;
    }

    if (cycleTimeoutId) {
      clearTimeout(cycleTimeoutId);
      cycleTimeoutId = null;
    }
    if (!state.paused) {
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
    let holdMs;
    if (!params.randomizeSpeed) {
      holdMs = params.holdMin * 1000;
    } else {
      const min = Math.min(params.holdMin, params.holdMax);
      const max = Math.max(params.holdMin, params.holdMax);
      holdMs = (min + Math.random() * (max - min)) * 1000;
    }
    // Guard: Speed's sliders go down to 0.1s, well under a multi-second
    // crossfade — without this, a short hold fires the next cycle mid-fade,
    // restarting the opacity/blend-mode transition before it ever finishes
    // easing (looks like a stutter, not a clean cut). Only clamps when
    // crossfade is actually on; hard-cut mode has no fade to protect, so it
    // stays free to run as fast as the sliders allow.
    if (params.crossfadeEnabled) {
      holdMs = Math.max(holdMs, CONFIG.CROSSFADE_MS);
    }
    return holdMs;
  }

  // Move overlay (Ken Burns pan/tilt/zoom). Draws `sourceCanvas` (the fully
  // rendered, un-panned frame) scaled up by `zoom` into `ctx`, positioned so
  // the visible 1080x1920 window sits somewhere inside it. `panProgress`/
  // `tiltProgress` are each either null (that axis is off — stay centred on
  // it) or 0-1: at 0 we're viewing the bottom-right portion of the zoomed
  // image, at 1 we've slid to the top-left — so on screen the image content
  // appears to drift down-and-right as either progress increases. Direction
  // isn't decided here: computeMovePanProgress/computeMoveTiltProgress below
  // pick whether progress counts up from 0 or down from 1 — this function
  // just draws whatever it's given for each axis independently, so pan,
  // tilt, and zoom can all be mid-sweep at once.
  function applyMoveTransform(ctx, sourceCanvas, panProgress, tiltProgress, zoom) {
    const scaledW = CONFIG.CANVAS_W * zoom;
    const scaledH = CONFIG.CANVAS_H * zoom;
    const extraX = scaledW - CONFIG.CANVAS_W;
    const extraY = scaledH - CONFIG.CANVAS_H;
    const dx = panProgress === null ? -extraX / 2 : -extraX * (1 - Math.max(0, Math.min(1, panProgress)));
    const dy = tiltProgress === null ? -extraY / 2 : -extraY * (1 - Math.max(0, Math.min(1, tiltProgress)));

    ctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    ctx.drawImage(sourceCanvas, dx, dy, scaledW, scaledH);
  }

  // Shared elapsed-time cap (seconds) for whichever of Pan/Tilt/Zoom are
  // currently active. Each axis's own "full sweep" time is 1 / its rate —
  // without this, whichever active axis has the highest speed finishes
  // first and then just holds there, while the slower axis/axes keep
  // moving solo — a Pan+Tilt diagonal would visibly bend into a single-axis
  // crawl the moment the faster one arrived. Capping every axis's elapsed
  // time at the FASTEST axis's completion time makes them all freeze
  // together at that instant instead, so a diagonal (or Pan+Tilt+Zoom
  // combined) keeps the same relative direction for its entire motion —
  // the trade-off being that slower axes never get to finish their own
  // full range if a faster one is also running.
  function moveSweepCapSec() {
    const speeds = [state.moveResolvedPan, state.moveResolvedTilt, state.moveResolvedZoom].filter(
      (s) => s !== 0
    );
    if (speeds.length === 0) return Infinity;
    const completionTimes = speeds.map((s) => 1 / ((Math.abs(s) / 100) * CONFIG.MOVE_MAX_RATE_PER_SEC));
    return Math.min(...completionTimes);
  }

  // Elapsed-time-based 0-1 sweep, shared by the Pan/Tilt/Zoom resolvers
  // below. Speed is deliberately independent of the current cycle's hold
  // duration (unlike the old fixed "complete one sweep per cycle"
  // behaviour) — magnitude alone sets how many seconds a full sweep takes,
  // via CONFIG.MOVE_MAX_RATE_PER_SEC. Returns 0 (not null) when `speed` is
  // 0 or cycle timing isn't ready yet — each resolver below is what decides
  // "this axis is off" via its own speed===0 check, this just does the math.
  // Elapsed time is capped by moveSweepCapSec() so multiple active axes
  // freeze in sync — see its comment above.
  function moveSweepT(speed) {
    if (speed === 0 || !(state.currentHoldMs > 0)) return 0;
    const elapsedSec = Math.min((performance.now() - state.cycleStartedAt) / 1000, moveSweepCapSec());
    const rate = (Math.abs(speed) / 100) * CONFIG.MOVE_MAX_RATE_PER_SEC;
    return Math.min(1, elapsedSec * rate);
  }

  // Resolves this cycle's EFFECTIVE Pan/Tilt/Zoom speeds into
  // state.moveResolvedPan/Tilt/Zoom — everything below reads those, never
  // params.move*Speed directly, so "Randomize move" can override them
  // without ever touching the sliders themselves. Off = mirror the sliders
  // exactly (today's behaviour). On = fresh random int in [-100, 100] per
  // axis, rolled once here and held for the whole cycle — same "resolve
  // once per cycle" timing as randomHold()/pickRandomEffect(). Call this at
  // the very top of cycle(), before any rendering, so even the initial seed
  // frame uses this cycle's freshly-resolved values.
  function resolveMoveSpeeds() {
    if (!params.moveRandomize) {
      state.moveResolvedPan = params.movePanSpeed;
      state.moveResolvedTilt = params.moveTiltSpeed;
      state.moveResolvedZoom = params.moveZoomSpeed;
      return;
    }
    // Magnitude from Speed min/max, direction independently 50/50 — so
    // e.g. Speed min=20/max=80 always gives a "noticeable but not maxed
    // out" push, in a random one of the two directions for that axis.
    const roll = () => {
      const min = Math.min(params.moveSpeedMin, params.moveSpeedMax);
      const max = Math.max(params.moveSpeedMin, params.moveSpeedMax);
      const magnitude = min + Math.random() * (max - min);
      const sign = Math.random() < 0.5 ? -1 : 1;
      return Math.round(sign * magnitude);
    };
    state.moveResolvedPan = roll();
    state.moveResolvedTilt = roll();
    state.moveResolvedZoom = roll();
  }

  // Resolves this instant's pan progress (0-1, fed to applyMoveTransform)
  // from state.moveResolvedPan, or null if it's off (resolved to 0). Shared
  // by renderFrame's initial per-cycle draw and moveAnimationLoop's rAF
  // tick so both read off the exact same formula. Sign picks direction:
  // negative counts "forward" sweep progress up from 0 (pan left), positive
  // counts it down from 1 (pan right). Once a sweep completes (t hits 1) it
  // holds at that end position for the rest of the cycle rather than
  // looping or bouncing back.
  function computeMovePanProgress() {
    if (state.moveResolvedPan === 0) return null;
    const t = moveSweepT(state.moveResolvedPan);
    return state.moveResolvedPan < 0 ? t : 1 - t;
  }

  // Vertical sibling of computeMovePanProgress — negative Tilt = pan down,
  // positive = pan up, same sweep-and-hold behaviour.
  function computeMoveTiltProgress() {
    if (state.moveResolvedTilt === 0) return null;
    const t = moveSweepT(state.moveResolvedTilt);
    return state.moveResolvedTilt > 0 ? t : 1 - t;
  }

  // Resolves the current zoom level fed to applyMoveTransform. Unlike
  // pan/tilt (which return null when off), this always returns a real
  // number: CONFIG.MOVE_ZOOM_BASE is the neutral "Zoom resolved to 0" level,
  // which is also what gives Pan/Tilt room to slide even when Zoom itself
  // isn't moving. A non-zero resolved Zoom sweeps away from that base
  // toward MOVE_ZOOM_MIN (negative, zooming out) or MOVE_ZOOM_MAX (positive,
  // zooming in), holding at whichever end once the sweep completes.
  function computeMoveZoomLevel() {
    if (state.moveResolvedZoom === 0) return CONFIG.MOVE_ZOOM_BASE;
    const t = moveSweepT(state.moveResolvedZoom);
    return state.moveResolvedZoom > 0
      ? CONFIG.MOVE_ZOOM_BASE + t * (CONFIG.MOVE_ZOOM_MAX - CONFIG.MOVE_ZOOM_BASE)
      : CONFIG.MOVE_ZOOM_BASE - t * (CONFIG.MOVE_ZOOM_BASE - CONFIG.MOVE_ZOOM_MIN);
  }

  // True if any of the three resolved Move speeds is off zero — the single
  // switch both renderFrame's seed call and moveAnimationLoop use to decide
  // whether to run applyMoveTransform at all, or skip straight to drawing
  // the frame untransformed (cheapest path, and exactly matches "every
  // slider at 0" visually since zoom would otherwise sit at MOVE_ZOOM_BASE
  // for no reason).
  function moveIsActive() {
    return state.moveResolvedPan !== 0 || state.moveResolvedTilt !== 0 || state.moveResolvedZoom !== 0;
  }

  // Draws the currently-visible frame into destCtx from cached state: the
  // primary effect layer (state.lastEffectFrame), optionally panned/tilted/
  // zoomed, with whatever blend-history layers are active for this cycle
  // (state.lastBlendMode/Opacity/Layers, frozen at render time) composited
  // on top, untransformed. `moveState` of null means "Move fully off" (draw
  // the effect layer as-is); otherwise `{ pan, tilt, zoom }` feeds
  // applyMoveTransform.
  //
  // This is the single source of truth for "what should be on screen right
  // now," reused by both the initial per-cycle render and every later Move
  // animation tick — so the blend layers never accidentally get transformed
  // along with the effect layer.
  function composeFrame(destCtx, moveState) {
    destCtx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    if (moveState === null) {
      destCtx.drawImage(state.lastEffectFrame, 0, 0);
    } else {
      applyMoveTransform(destCtx, state.lastEffectFrame, moveState.pan, moveState.tilt, moveState.zoom);
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

    // Seed the very first draw at each active axis's sweep-starting
    // position, NOT via computeMovePanProgress/computeMoveTiltProgress —
    // state.cycleStartedAt still holds the PREVIOUS cycle's timestamp at
    // this point (it's only updated after this whole render finishes, back
    // in cycle()), so computing elapsed time here would read stale. Sign
    // alone decides each axis's start: 0 for a forward-counting sweep
    // (pan left / tilt up), 1 for a mirrored one (pan right / tilt down).
    // Zoom always starts at MOVE_ZOOM_BASE regardless of sign — both zoom
    // in and zoom out sweep AWAY from that neutral level, they just move
    // in opposite directions from the same starting point.
    // moveAnimationLoop() takes over with the real elapsed-time versions on
    // its next rAF tick, once cycleStartedAt is current.
    const moveStartState = moveIsActive()
      ? {
          pan: state.moveResolvedPan === 0 ? null : state.moveResolvedPan < 0 ? 0 : 1,
          tilt: state.moveResolvedTilt === 0 ? null : state.moveResolvedTilt > 0 ? 0 : 1,
          zoom: CONFIG.MOVE_ZOOM_BASE,
        }
      : null;
    composeFrame(destCtx, moveStartState);
  }

  async function crossfadeTo(nextCanvas, effect, effectParams, blendOverlay) {
    const incoming =
      state.frontCanvas === canvasA ? canvasB : canvasA;
    const incomingCtx = incoming === canvasA ? ctxA : ctxB;
    const outgoing = state.frontCanvas;

    renderFrame(incomingCtx, nextCanvas, effect, effectParams, blendOverlay);

    // mix-blend-mode only blends an element against whatever paints BEFORE
    // it in the same stacking context — but incoming/outgoing ping-pong
    // between canvasA/canvasB every cycle, so plain DOM source order alone
    // doesn't reliably put "whichever one is incoming this cycle" on top.
    // Explicit z-index every call guarantees it regardless of which
    // physical canvas incoming happens to be.
    incoming.style.zIndex = "2";
    outgoing.style.zIndex = "1";

    // Off = hard cut: "none" transition means the opacity change below
    // applies on this tick with no ease, so the swap is instant instead of
    // fading over CROSSFADE_MS. Both branches set transition explicitly on
    // every call, so toggling this mid-run never leaves a stale transition
    // (e.g. an in-flight ease) on either canvas.
    const transition = params.crossfadeEnabled ? `opacity ${CONFIG.CROSSFADE_MS}ms ease-in-out` : "none";
    incoming.style.transition = transition;
    incoming.style.opacity = String(params.opacity);
    outgoing.style.transition = transition;
    outgoing.style.opacity = "0";

    // Prototype: blend incoming into outgoing via CROSSFADE_BLEND_MODE for
    // the duration of the fade, instead of a plain alpha dissolve. Reset
    // back to "normal" once the fade completes so the resting frame doesn't
    // sit blended against the (by then fully transparent) outgoing layer
    // indefinitely. clearTimeout guards against a leftover reset firing
    // late if this same physical canvas becomes "incoming" again before its
    // previous reset timer had a chance to fire (e.g. Speed dialed very
    // low) — known edge case, same one flagged for the fast-Speed race.
    clearTimeout(incoming._blendResetTimer);
    if (params.crossfadeEnabled) {
      incoming.style.mixBlendMode = CONFIG.CROSSFADE_BLEND_MODE;
      incoming._blendResetTimer = setTimeout(() => {
        incoming.style.mixBlendMode = "normal";
      }, CONFIG.CROSSFADE_MS);
    } else {
      incoming.style.mixBlendMode = "normal";
    }

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

    // Resolved before anything renders, same reasoning as
    // pickRandomEffect()/pickBlendOverlay() below — so that if "Randomize
    // move" is on, even this cycle's very first (seed) frame already
    // reflects the freshly-rolled Pan/Tilt/Zoom values, not last cycle's.
    resolveMoveSpeeds();
    state.currentIndex = pickNextIndex();
    const src = state.sources[state.currentIndex];
    let { key: effectKey, effect, effectParams } = pickRandomEffect();
    // Start on Untouched: overrides whatever pickRandomEffect() rolled, but
    // only for the very first cycle since page load, and only if Untouched
    // is actually in rotation (respects the "In rotation" checkbox above
    // rather than forcing an effect the user explicitly turned off).
    if (!state.hasCycled && params.startUnchanged && params.enabledEffects.none) {
      effectKey = "none";
      effect = EFFECTS.none;
      effectParams = effect.randomParams();
    }
    state.hasCycled = true;
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

    // Resolved once per cycle (see resolveMoveSpeeds(), called at the very
    // top of cycle() before this runs) — reflects what's ACTUALLY driving
    // on-screen motion this cycle, not just wherever the sliders currently
    // sit (those two can differ momentarily: dragging a Move slider mid-hold
    // doesn't retarget the resolved value until the next cycle, and
    // Randomize move always shows a rolled value that never touches the
    // sliders at all).
    setText(
      "diagMove",
      moveIsActive()
        ? `pan ${state.moveResolvedPan} tilt ${state.moveResolvedTilt} zoom ${state.moveResolvedZoom}`
        : "off"
    );

    updateLookDiagnostic();
  }

  // Crossfade/Saturation/Contrast all apply instantly (no cycle boundary
  // needed), so this is called both here (per-cycle baseline) and directly
  // from each of those controls' own change handlers — otherwise the
  // diagnostics text would lag a full cycle behind what's already visibly
  // changed on screen.
  function updateLookDiagnostic() {
    setText(
      "diagLook",
      `crossfade ${params.crossfadeEnabled ? "on" : "off (hard cut)"} · sat ${params.saturation}% · con ${params.contrast}%`
    );
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

  // The stage fills the whole viewport but the 1080x1920 image is letterboxed
  // inside it via object-fit: contain, so the actual photo rarely fills the
  // window (e.g. on a widescreen display it sits centred with black bars
  // left/right). Anchoring the brand lockup to the viewport corner would land
  // it in that black bar rather than on the image itself, so instead we
  // compute the real rendered image rect here and position the lockup
  // relative to that.
  function positionBrandLockup() {
    const lockup = document.getElementById("brandLockup");
    const stage = document.getElementById("stage");
    if (!lockup || !stage) return;

    const stageRect = stage.getBoundingClientRect();
    const contentAspect = 1080 / 1920;
    const boxAspect = stageRect.width / stageRect.height;

    let renderedWidth, renderedHeight, offsetX, offsetY;
    if (boxAspect > contentAspect) {
      // Box is relatively wider than the image -> letterboxed left/right.
      renderedHeight = stageRect.height;
      renderedWidth = renderedHeight * contentAspect;
      offsetX = (stageRect.width - renderedWidth) / 2;
      offsetY = 0;
    } else {
      // Box is relatively taller/narrower than the image -> letterboxed top/bottom.
      renderedWidth = stageRect.width;
      renderedHeight = renderedWidth / contentAspect;
      offsetX = 0;
      offsetY = (stageRect.height - renderedHeight) / 2;
    }

    const margin = 16;
    lockup.style.top = `${stageRect.top + offsetY + margin}px`;
    lockup.style.left = `${stageRect.left + offsetX + margin}px`;
  }

  // Opens a popup window sized as close to the 1080x1920 (9:16) output
  // ratio as the screen allows, so a plain OS screen recording of that
  // whole window has no letterbox bars/background to crop out. Uses
  // window.open() with explicit dimensions rather than window.resizeTo() on
  // the CURRENT tab, since most browsers silently ignore resizeTo() on a
  // tab that wasn't itself opened via script — a fresh popup is the one
  // sizing method that reliably works everywhere.
  //
  // Opens a popup window sized as close to the 1080x1920 (9:16) output
  // ratio as the screen allows, so a plain OS screen recording of that
  // whole window has no letterbox bars/background to crop out.
  //
  // This used to try to LIVE-MIRROR this window's exact canvases into the
  // popup (reading window.opener's canvases + computed style every single
  // frame). That turned out to be genuinely fragile in practice — cross-
  // window canvas reads at 60fps flickered intermittently even after fixing
  // the obvious failure mode (a failed frame clearing the visible canvas),
  // and having two windows both actively rendering effects at once just
  // adds real resource contention on top of that. Rather than keep chasing
  // an exotic timing bug, this instead saves the CURRENT settings (see
  // saveSettingsToStorage()) and opens a completely normal, independent
  // instance of this same page with ?resume=1 — see applyResumeSettings()
  // in boot(). It boots and renders exactly as reliably as this window
  // always has, with the same pool/effects/palette/speed, just running its
  // own fresh random cycle rather than a frame-for-frame copy of this
  // window's exact current image. For an Instagram clip that's the right
  // trade: rock solid over pixel-identical.
  function openRecordingWindow() {
    saveSettingsToStorage();

    const aspect = CONFIG.CANVAS_W / CONFIG.CANVAS_H; // 1080/1920 = 0.5625
    const maxHeight = Math.round((window.screen.availHeight || 900) * 0.85);
    const maxWidth = Math.round((window.screen.availWidth || 1600) * 0.85);
    let targetHeight = Math.min(900, maxHeight);
    let targetWidth = Math.round(targetHeight * aspect);
    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round(targetWidth / aspect);
    }
    const url = new URL(window.location.href);
    url.searchParams.set("resume", "1");
    window.open(
      url.href,
      "photoRemixRecording",
      `width=${targetWidth},height=${targetHeight},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`
    );
  }

  // Applies a saved-settings snapshot at boot time, for a page opened via
  // openRecordingWindow() above (?resume=1). Almost the same as
  // loadSettingsFromStorage(), except the Live/Demo checkbox is special-
  // cased: applying it through its normal dispatch would fire
  // switchSourceMode() immediately, which kicks off its OWN image-source
  // fetch — racing against boot()'s own loadImageSourcesForMode() call
  // right after this runs, and potentially double-scheduling cycle(). So
  // params.sourceMode is set directly here instead, and boot()'s existing
  // fetch is left as the one and only source load for this fresh page.
  function applyResumeSettings() {
    let raw;
    try {
      raw = localStorage.getItem(CONFIG.SETTINGS_STORAGE_KEY);
    } catch (err) {
      return;
    }
    if (!raw) return;
    let snapshot;
    try {
      snapshot = JSON.parse(raw);
    } catch (err) {
      return;
    }
    const values = { ...snapshot.values };

    const liveInfo = values.ctrlLiveMode;
    if (liveInfo) {
      params.sourceMode = liveInfo.checked ? "live" : "demo";
      const liveEl = document.getElementById("ctrlLiveMode");
      if (liveEl) liveEl.checked = liveInfo.checked;
      delete values.ctrlLiveMode;
    }
    applyControlState(values);
  }

  function wireControls() {
    const panel = document.getElementById("controls");

    const speedMin = document.getElementById("ctrlSpeedMin");
    const speedMax = document.getElementById("ctrlSpeedMax");
    const speedRandomize = document.getElementById("ctrlSpeedRandomize");
    const opacity = document.getElementById("ctrlOpacity");
    const crossfadeEnabled = document.getElementById("ctrlCrossfadeEnabled");
    const liveMode = document.getElementById("ctrlLiveMode");
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
    const pixelateRandomCellSize = document.getElementById("ctrlPixelateRandomCellSize");
    const halftoneRandomCellSize = document.getElementById("ctrlHalftoneRandomCellSize");
    const asciiRandomCellSize = document.getElementById("ctrlAsciiRandomCellSize");
    const paletteRandomize = document.getElementById("ctrlPaletteRandomize");
    const paletteSafeMode = document.getElementById("ctrlPaletteSafeMode");
    const animatePaletteColor = document.getElementById("ctrlAnimatePaletteColor");
    const animatePaletteDensityMin = document.getElementById("ctrlAnimatePaletteDensityMin");
    const animatePaletteDensityMax = document.getElementById("ctrlAnimatePaletteDensityMax");
    const animatePaletteDensityRandomize = document.getElementById("ctrlAnimatePaletteDensityRandomize");
    // Four {fg, bg} element pairs, index-matched to params.palettes.
    const paletteColorInputs = [1, 2, 3, 4].map((n) => ({
      fg: document.getElementById(`ctrlPalette${n}Fg`),
      bg: document.getElementById(`ctrlPalette${n}Bg`),
    }));
    // Four "In rotation" checkboxes, index-matched to params.paletteEnabled.
    const paletteEnabledInputs = [1, 2, 3, 4].map((n) =>
      document.getElementById(`ctrlPalette${n}Enabled`)
    );
    const autoCycle = document.getElementById("ctrlAutoCycle");
    const blendOverlay = document.getElementById("ctrlBlendOverlay");
    const blendLayers = document.getElementById("ctrlBlendLayers");
    const randomBlendLayers = document.getElementById("ctrlRandomBlendLayers");
    const movePanSpeed = document.getElementById("ctrlMovePanSpeed");
    const moveTiltSpeed = document.getElementById("ctrlMoveTiltSpeed");
    const moveZoomSpeed = document.getElementById("ctrlMoveZoomSpeed");
    const moveSpeedMin = document.getElementById("ctrlMoveSpeedMin");
    const moveSpeedMax = document.getElementById("ctrlMoveSpeedMax");
    const moveRandomize = document.getElementById("ctrlMoveRandomize");
    const saturation = document.getElementById("ctrlSaturation");
    const contrast = document.getElementById("ctrlContrast");

    // Effect on/off checkboxes -> EFFECTS registry keys. Blend modes isn't
    // here — it's the separate blendOverlay toggle above, not a competing
    // pick. "none" (Untouched) IS here now — see the enabledEffects comment
    // for why.
    const effectToggles = {
      none: document.getElementById("ctrlEffectNone"),
      duotone: document.getElementById("ctrlEffectDuotone"),
      pixelate: document.getElementById("ctrlEffectPixelate"),
      ascii: document.getElementById("ctrlEffectAscii"),
      halftone: document.getElementById("ctrlEffectHalftone"),
    };
    const startUnchanged = document.getElementById("ctrlStartUnchanged");

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

    crossfadeEnabled.addEventListener("change", () => {
      params.crossfadeEnabled = crossfadeEnabled.checked;
      updateLookDiagnostic();
    });

    if (liveMode) {
      liveMode.checked = params.sourceMode === "live";
      liveMode.addEventListener("change", () => {
        switchSourceMode(liveMode.checked ? "live" : "demo");
      });
    }

    saturation.addEventListener("input", () => {
      params.saturation = parseInt(saturation.value, 10);
      valFor(saturation).textContent = `${params.saturation}%`;
      applyLookFilter();
      updateLookDiagnostic();
    });

    contrast.addEventListener("input", () => {
      params.contrast = parseInt(contrast.value, 10);
      valFor(contrast).textContent = `${params.contrast}%`;
      applyLookFilter();
      updateLookDiagnostic();
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

    pixelateRandomCellSize.addEventListener("change", () => {
      params.pixelateRandomCellSize = pixelateRandomCellSize.checked;
    });

    halftoneRandomCellSize.addEventListener("change", () => {
      params.halftoneRandomCellSize = halftoneRandomCellSize.checked;
    });

    asciiRandomCellSize.addEventListener("change", () => {
      params.asciiRandomCellSize = asciiRandomCellSize.checked;
    });

    paletteRandomize.addEventListener("change", () => {
      params.randomizePalette = paletteRandomize.checked;
    });

    paletteSafeMode.addEventListener("change", () => {
      params.paletteSafeMode = paletteSafeMode.checked;
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

    paletteEnabledInputs.forEach((box, i) => {
      if (!box) return;
      box.addEventListener("change", () => {
        params.paletteEnabled[i] = box.checked;
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

    movePanSpeed.addEventListener("input", () => {
      params.movePanSpeed = parseInt(movePanSpeed.value, 10);
      const v = params.movePanSpeed;
      valFor(movePanSpeed).textContent = v === 0 ? "off" : `${Math.abs(v)}% ${v < 0 ? "left" : "right"}`;
    });

    moveTiltSpeed.addEventListener("input", () => {
      params.moveTiltSpeed = parseInt(moveTiltSpeed.value, 10);
      const v = params.moveTiltSpeed;
      valFor(moveTiltSpeed).textContent = v === 0 ? "off" : `${Math.abs(v)}% ${v < 0 ? "down" : "up"}`;
    });

    moveZoomSpeed.addEventListener("input", () => {
      params.moveZoomSpeed = parseInt(moveZoomSpeed.value, 10);
      const v = params.moveZoomSpeed;
      valFor(moveZoomSpeed).textContent = v === 0 ? "off" : `${Math.abs(v)}% ${v < 0 ? "out" : "in"}`;
    });

    moveSpeedMin.addEventListener("input", () => {
      params.moveSpeedMin = parseInt(moveSpeedMin.value, 10);
      valFor(moveSpeedMin).textContent = `${params.moveSpeedMin}%`;
    });

    moveSpeedMax.addEventListener("input", () => {
      params.moveSpeedMax = parseInt(moveSpeedMax.value, 10);
      valFor(moveSpeedMax).textContent = `${params.moveSpeedMax}%`;
    });

    moveRandomize.addEventListener("change", () => {
      params.moveRandomize = moveRandomize.checked;
    });

    for (const [key, box] of Object.entries(effectToggles)) {
      if (!box) continue;
      box.addEventListener("change", () => {
        params.enabledEffects[key] = box.checked;
      });
    }

    startUnchanged.addEventListener("change", () => {
      params.startUnchanged = startUnchanged.checked;
    });

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
      if (e.key === "s" || e.key === "S") {
        const lockup = document.getElementById("brandLockup");
        if (lockup) {
          lockup.classList.toggle("hidden");
          positionBrandLockup(); // re-measure in case the window changed while it was hidden
        }
      }
      if (e.key === "p" || e.key === "P") {
        togglePause();
      }
      if (e.key === "l" || e.key === "L") {
        switchSourceMode(params.sourceMode === "demo" ? "live" : "demo");
      }
      if (e.key === "r" || e.key === "R") {
        openRecordingWindow();
      }
    });

    window.addEventListener("resize", positionBrandLockup);

    const openRecordingWindowLink = document.getElementById("openRecordingWindowLink");
    if (openRecordingWindowLink) {
      openRecordingWindowLink.addEventListener("click", (e) => {
        e.preventDefault(); // it's a styled <a>, not a real navigation
        openRecordingWindow();
      });
    }

    // Deliberately NOT "ctrl"-prefixed — these are one-off actions, not
    // persisted param state, so they're naturally excluded from both
    // gatherControlState()'s snapshot and the remote-page relay.
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveSettingsToStorage);
    const loadSettingsBtn = document.getElementById("loadSettingsBtn");
    if (loadSettingsBtn) loadSettingsBtn.addEventListener("click", loadSettingsFromStorage);
    const clearSettingsBtn = document.getElementById("clearSettingsBtn");
    if (clearSettingsBtn) clearSettingsBtn.addEventListener("click", clearSavedSettings);
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
    if ((params.asciiAnimate || params.animatePaletteColor || params.asciiRandomCellSize) && state.lastEffectKey === "ascii") {
      redrawAsciiAnimationFrame();
    }
    if ((params.pixelateAnimate || params.animatePaletteColor || params.pixelateRandomCellSize) && state.lastEffectKey === "pixelate") {
      redrawPixelateAnimationFrame();
    }
    if ((params.animatePaletteColor || params.halftoneRandomCellSize) && state.lastEffectKey === "halftone") {
      redrawHalftoneAnimationFrame();
    }
  }, EFFECT_ANIMATE_INTERVAL_MS);

  // Move overlay's pan/tilt/zoom loop — runs every animation frame (not on
  // the coarser 180ms ticker above) since camera motion reads as smooth,
  // unlike the deliberately chunky glyph-flicker/cell-bounce animations.
  // Independent of state.lastEffectKey by design: Move applies on top of
  // whichever effect is showing, same as Blend overlay.
  //
  // Redraws via composeFrame rather than transforming the frame directly,
  // so the blend-history layers get re-composited fresh (untransformed,
  // from the frozen state.lastBlendLayers) on every tick instead of
  // dragging along with the effect layer underneath — only one "plane" of
  // the image moves.
  //
  // Known limitation: if Pixelate/ASCII "animate" is also on at the same
  // time as Move, both redraw the front canvas independently and don't know
  // about each other — whichever tick fires last wins that repaint. Fine
  // for now (each still ends up looking right most frames), but if the two
  // visibly fight during rehearsal, the fix is to fold them into composeFrame
  // too instead of leaving them as separate bypass-redraws.
  function moveAnimationLoop() {
    if (state.lastEffectFrame && moveIsActive()) {
      const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
      composeFrame(ctx, {
        pan: computeMovePanProgress(),
        tilt: computeMoveTiltProgress(),
        zoom: computeMoveZoomLevel(),
      });
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

  // Applies a single {value, checked} pair to a control exactly as if it
  // had been set locally: assign, then dispatch real input/change events so
  // every existing wireControls() listener runs unmodified — no separate
  // code path to keep in sync with the 30-odd controls already wired up.
  // Shared by the remote-control relay below AND by loadSettingsFromStorage
  // (see the Presets section further down), so both apply state the same
  // proven way rather than two slightly-different copies of this logic.
  function applyControlValue(el, { value, checked }) {
    if (checked !== undefined) el.checked = checked;
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Applies a whole gatherControlState()-shaped object (id -> {value,
  // checked, display}) — used to restore a saved-settings snapshot. display
  // is ignored; each control's own listener recomputes its .val text.
  function applyControlState(values) {
    for (const [id, info] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) applyControlValue(el, info);
    }
  }

  // ---------------------------------------------------------------------
  // PRESETS — save/load the whole control panel to a single localStorage
  // slot. Manual only (Save/Load/Clear buttons in the Presets section) —
  // nothing here loads automatically on boot, so a saved preset can never
  // silently override the page's normal defaults (e.g. Start on Untouched)
  // in some future session without the facilitator explicitly asking for
  // it. Display-page only, same as the recording-window link — the actual
  // control state lives here, not on the remote page.
  // ---------------------------------------------------------------------
  function setSettingsStatus(text) {
    const el = document.getElementById("settingsStatus");
    if (el) el.textContent = text;
  }

  function saveSettingsToStorage() {
    try {
      const snapshot = { savedAt: Date.now(), values: gatherControlState() };
      localStorage.setItem(CONFIG.SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
      setSettingsStatus(`Saved ${new Date(snapshot.savedAt).toLocaleTimeString()}`);
    } catch (err) {
      // e.g. localStorage disabled/full/blocked (private browsing in some
      // browsers) — surface it rather than fail silently.
      setSettingsStatus(`Couldn't save: ${err.message}`);
    }
  }

  function loadSettingsFromStorage() {
    let raw;
    try {
      raw = localStorage.getItem(CONFIG.SETTINGS_STORAGE_KEY);
    } catch (err) {
      setSettingsStatus(`Couldn't read saved settings: ${err.message}`);
      return;
    }
    if (!raw) {
      setSettingsStatus("No saved settings yet — use Save first.");
      return;
    }
    try {
      const snapshot = JSON.parse(raw);
      applyControlState(snapshot.values);
      setSettingsStatus(`Loaded (saved ${new Date(snapshot.savedAt).toLocaleTimeString()})`);
    } catch (err) {
      setSettingsStatus(`Couldn't load saved settings: ${err.message}`);
    }
  }

  function clearSavedSettings() {
    try {
      localStorage.removeItem(CONFIG.SETTINGS_STORAGE_KEY);
      setSettingsStatus("Saved settings cleared.");
    } catch (err) {
      setSettingsStatus(`Couldn't clear: ${err.message}`);
    }
  }

  if (remoteChannel) {
    remoteChannel.onmessage = (evt) => {
      const msg = evt.data;
      if (msg.type === "requestState") {
        broadcastState();
      } else if (msg.type === "input") {
        const el = document.getElementById(msg.id);
        if (el) applyControlValue(el, msg);
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
  // getImageData (ASCII, Halftone) throws
  // "canvas has been tainted by cross-origin data". Warn up front rather
  // than let that surface as a confusing per-effect error later.
  //
  // Written to its own diagnostics line (not setStatus/diagSource) because
  // those get overwritten every cycle by the normal render loop — this
  // warning needs to stick around, not flash by once and vanish.
  function warnIfFileProtocol() {
    if (location.protocol !== "file:") return;
    const msg =
      "file:// detected — ASCII/Halftone will fail (tainted canvas). Serve this folder instead, e.g. `python3 -m http.server`, or use the GitHub Pages URL.";
    console.warn(`[boot] ${msg}`);
    const el = document.getElementById("diagWarning");
    if (el) {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  async function boot() {
    wireControls();
    positionBrandLockup();
    applyLookFilter(); // sets the initial (default 100/100, no-op) CSS filter
    updateLookDiagnostic(); // so diagLook shows real defaults before the first cycle ever runs
    broadcastState(); // so a remote page opened first sees real values, not just HTML defaults

    // Reflect whether a save already exists rather than always showing the
    // static "No settings saved yet." placeholder — read-only check, never
    // applies anything (see the Presets section's own comment for why
    // loading is manual-only).
    try {
      const raw = localStorage.getItem(CONFIG.SETTINGS_STORAGE_KEY);
      if (raw) {
        const snapshot = JSON.parse(raw);
        setSettingsStatus(`Saved settings available (saved ${new Date(snapshot.savedAt).toLocaleTimeString()})`);
      }
    } catch (err) {
      // Not worth surfacing at boot — Save/Load will report their own
      // errors if localStorage turns out to be unavailable.
    }

    warnIfFileProtocol();

    // Opened via openRecordingWindow()'s ?resume=1 — apply whatever
    // settings were saved right before this popup opened, so the fresh
    // instance below starts with the same pool/effects/palette/speed
    // rather than plain defaults. See applyResumeSettings()'s own comment
    // for why the Live/Demo pool is special-cased there.
    if (new URLSearchParams(location.search).get("resume") === "1") {
      applyResumeSettings();
    }

    try {
      state.sources = await loadImageSourcesForMode(params.sourceMode);

      if (state.sources.length === 0) {
        setStatus("no images available (demo, Drive, and seeds all empty)");
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
