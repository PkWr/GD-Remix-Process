/*
 * Generative Photo Remix — app.js
 *
 * Plain JS, no build step, no framework. Sections below map to the spec's
 * build order:
 *   1. CONFIG            — tunables, referrer-restricted API key goes here
 *   2. SEED IMAGES        — bundled offline fallback (assets/seeds/*)
 *   3. DRIVE FETCH        — files.list against the public folder
 *   1b. STAGE PROFILES    — phone (1080x1920) / desktop (window) / igloo (11520x1038)
 *   4. IMAGE PIPELINE     — cover-crop normalize per layout slot size, cached
 *   4b. LAYOUTS           — single image / row of portrait tiles / one per wall
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

  // The one list of every control (settings.js, loaded first).
  const PRS = window.PhotoRemixSettings;
  const SET = PRS.byId;

  // Bump on every push — shown in the info panel (D) and the console, so a
  // cached old copy is easy to spot.
  const APP_VERSION = "2026-10-11 · echo blend";
  console.info(`[photo-remix] version ${APP_VERSION}`);

  // Small on-screen message, top centre, independent of the info panel.
  // kind: "info" | "ok" | "error". Used for camera debugging so pressing V
  // always visibly does *something*.
  let toastTimer = null;
  function showToast(text, kind = "info", ms = 4000) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      Object.assign(el.style, {
        position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
        zIndex: "50", maxWidth: "min(720px, calc(100vw - 32px))", padding: "10px 16px",
        borderRadius: "8px", font: "14px/1.4 system-ui, -apple-system, sans-serif",
        color: "#fff", pointerEvents: "none", transition: "opacity 0.3s",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      });
      document.body.appendChild(el);
    }
    el.style.background = kind === "error" ? "rgba(170, 20, 20, 0.95)" : kind === "ok" ? "rgba(0, 110, 40, 0.95)" : "rgba(20, 20, 20, 0.9)";
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, ms);
    console.info(`[toast] ${text}`);
  }

  // ---------------------------------------------------------------------
  // 1. CONFIG
  // ---------------------------------------------------------------------
  const CONFIG = {
    // Drive API key restricted by HTTP referrer to the GitHub Pages domain.
    // Safe to leave in client-side code as long as the referrer restriction
    // is set in Google Cloud Console — do NOT remove that restriction.
    DRIVE_API_KEY: "YOUR_DRIVE_API_KEY_HERE",
    DRIVE_FOLDER_ID: "YOUR_DRIVE_FOLDER_ID_HERE",

    // Stage size is no longer hard-coded here — it comes from the active
    // stage profile (see 1b. STAGE PROFILES below). REF_HEIGHT is the stage
    // height every px-based effect slider (Pixelate/Halftone/ASCII cell
    // size) is calibrated against: slider values mean "px on a 1920-tall
    // stage" and get scaled by STAGE.h / REF_HEIGHT at draw time. So the
    // phone profile renders exactly as it always has, and taller/shorter
    // stages keep the same proportional look.
    REF_HEIGHT: 1920,
    // Cap on grid cells per frame for each per-cell effect, turned into a
    // minimum cell size by stagePx(). Values are chosen so the phone profile
    // (1080x1920) is never affected at any slider position (halftone's 60k
    // is exactly the old hard 6px floor); they only kick in on big/wide
    // stages, where relative sizing would otherwise multiply the cell count.
    MAX_CELLS: { pixelate: 520000, halftone: 60000, ascii: 60000 },
    // Target aspect for one tile in the "tiles" layout (9:16 portrait, same
    // as the phone stage). Tile count = stage aspect / this, rounded.
    TILE_ASPECT: 9 / 16,
    // Max normalised canvases kept in memory (least-recently-used evicted).
    // Each is one image at one slot size; the tiles layout adds a second
    // size per image, so this bounds memory on big desktop stages.
    NORMALIZED_CACHE_MAX: 60,
    // Resolution-aware layouts: a photo is only used in a layout slot if
    // filling that slot (cover-crop) enlarges it by at most this much.
    // 2 = the photo's pixels can be at most doubled. Stops a small portrait
    // photo being cropped to a landscape strip and stretched across a whole
    // Igloo wall. Lower = sharper but fewer photos qualify for big slots.
    MAX_UPSCALE: 2,

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
    PIXELATE_SLIDER_MIN: SET.ctrlPixelateMin.min, // from settings.js
    PIXELATE_SLIDER_MAX: SET.ctrlPixelateMax.max, // from settings.js
    HALFTONE_SLIDER_MIN: SET.ctrlHalftoneMin.min, // from settings.js
    HALFTONE_SLIDER_MAX: SET.ctrlHalftoneMax.max, // from settings.js
    ASCII_SLIDER_MIN: SET.ctrlAsciiMin.min, // from settings.js
    ASCII_SLIDER_MAX: SET.ctrlAsciiMax.max, // from settings.js

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
    // "At the edge: keep going" (tiled) scroll speed at a Move slider's max:
    // this many stage-heights per second. Height-based so it feels the same
    // on a portrait phone, a desktop window and the 11:1 Igloo strip.
    MOVE_TILE_RATE: 0.15,
  };

  // ---------------------------------------------------------------------
  // 1b. STAGE PROFILES
  // ---------------------------------------------------------------------
  // Picked once per page load from the URL: ?stage=desktop, default phone.
  //   phone   — fixed 1080x1920 (9:16 Instagram Story), letterboxed into the
  //             window by CSS object-fit: contain. Identical to v1.
  //   desktop — sized to the window x devicePixelRatio, capped at maxWidth
  //             (height scaled to keep the window's aspect), rebuilt on
  //             resize / fullscreen / DPR change (see rebuildStage()).
  //   igloo   — fixed 11520x1038, the Immersive Suite's six 1920x1038 wall
  //             panels as one wide page (confirmed by igloo-check.html in
  //             the suite's software). Fixed rather than window-sized, so a
  //             laptop preview shows the true wall framing, letterboxed.
  //             `seams: 6` makes layouts wall-aware: tiles come in whole
  //             numbers per wall so none ever straddles a join. No "single"
  //             layout here — one photo cover-cropped to an 11:1 strip would
  //             be a sliver of the image, upscaled ~10x.
  //             `animateIntervalMs` slows the pixelate/halftone/ascii
  //             animation ticker: at full wall size halftone/ascii redraws
  //             take ~70ms on the suite's RTX 4070, too close to the default
  //             180ms tick.
  // `layouts` lists which layouts the random engine may pick per cycle.
  // Optional ?layout=single|tiles|walls forces one (handy for testing).
  const STAGE_PROFILES = {
    // maxUpscale: Infinity — phone keeps v1 behaviour (every photo in rotation).
    phone: { size: "fixed", width: 1080, height: 1920, layouts: ["single"], maxUpscale: Infinity },
    desktop: { size: "window", maxWidth: 2560, layouts: ["single", "tiles"] },
    igloo: {
      size: "fixed",
      width: 11520,
      height: 1038,
      seams: 6,
      layouts: ["tiles", "walls"],
      animateIntervalMs: 360,
    },
  };

  const pageParams = new URLSearchParams(location.search);
  const requestedProfile = (pageParams.get("stage") || "phone").toLowerCase();
  if (!STAGE_PROFILES[requestedProfile]) {
    console.warn(`[stage] unknown profile "${requestedProfile}", using phone`);
  }
  const STAGE_PROFILE_KEY = STAGE_PROFILES[requestedProfile] ? requestedProfile : "phone";
  const STAGE_PROFILE = STAGE_PROFILES[STAGE_PROFILE_KEY];
  const FORCED_LAYOUT = STAGE_PROFILE.layouts.includes(pageParams.get("layout"))
    ? pageParams.get("layout")
    : null;

  function computeStageSize() {
    if (STAGE_PROFILE.size === "fixed") {
      return { w: STAGE_PROFILE.width, h: STAGE_PROFILE.height, dpr: 1 };
    }
    const dpr = window.devicePixelRatio || 1;
    let w = Math.max(1, Math.round(window.innerWidth * dpr));
    let h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (w > STAGE_PROFILE.maxWidth) {
      h = Math.max(1, Math.round((h * STAGE_PROFILE.maxWidth) / w));
      w = STAGE_PROFILE.maxWidth;
    }
    return { w, h, dpr };
  }

  // ?preview — laptop preview of a stage much wider than the window (the
  // Igloo strip): the stage is shown at full browser height instead of
  // letterboxed, and slowly pans left↔right across it, like walking along
  // the walls. Display-only: rendering, effects and layouts are untouched.
  // Ignored on stages that aren't wider than the window. Any value except
  // "0"/"false" turns it on, e.g. index.html?stage=igloo&preview
  const PREVIEW_PAN =
    pageParams.has("preview") && !["0", "false"].includes(pageParams.get("preview"));

  // Natural pixel size of every image we've seen load (demo/seed probes,
  // and every loadImage() — which covers Drive files once first shown).
  // Used to keep low-res photos out of slots they'd look stretched in.
  const imageSizes = new Map(); // src -> { w, h }
  function rememberSize(src, img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w && h) imageSizes.set(src, { w, h });
  }

  // Live stage size — mutated in place by rebuildStage(), read everywhere
  // that used to read STAGE.w/H.
  const STAGE = { profile: STAGE_PROFILE_KEY, ...computeStageSize() };

  // Converts a slider value ("px on a 1920-tall stage") to real stage px,
  // then applies the per-effect cell budget floor (see CONFIG.MAX_CELLS).
  function stagePx(sliderPx, maxCells) {
    const scaled = sliderPx * (STAGE.h / CONFIG.REF_HEIGHT);
    const budgetFloor = maxCells ? Math.sqrt((STAGE.w * STAGE.h) / maxCells) : 0;
    return Math.max(1, scaled, budgetFloor);
  }

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
    // box in each effect's own "In rotation" toggle turns it on here. v2
    // default: every effect on, Untouched off (v1's workshop opened on
    // Untouched only). Untouched is exclusive — ticking it switches every
    // effect off, see the effect toggle wiring in wireControls(). Blend
    // modes isn't in this list — it's the separate blendOverlayEnabled
    // toggle below, not a competing pick. Move is also off by default
    // (movePanSpeed/TiltSpeed/ZoomSpeed = 0 below).
    enabledEffects: {
      none: false,
      duotone: true,
      pixelate: true,
      ascii: true,
      halftone: true,
    },
    // On = the very first image on page load forces Untouched regardless of
    // what the random engine would otherwise pick, so the show opens on a
    // plain photo before the effects kick in. Every cycle after that first
    // one goes back to fully random (including possibly landing on
    // Untouched again by chance). No-ops if enabledEffects.none is off.
    startUnchanged: false, // v2: off — open straight into effects
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
    // What Move does when the image reaches the edge of its travel:
    // "strip" (images laid end to end and scrolled past, new ones joining
    // the line — like the Igloo preview; see state.strip), "stop" (hold there — the original behaviour), "tile" / "mirror" (keep
    // scrolling forever over repeated copies; mirror flips neighbours so the
    // edges always join), or "next" (hold time = travel time, so each image
    // arrives just as the next one comes in). Set from settings.js.
    moveEndMode: "strip",
    // Strip layers: how many strips run at once (1–3), how the extra ones
    // move relative to the first ("parallax" same way at other speeds,
    // "opposing", "crossing" — one across, one up/down — or "random"), and
    // how they combine with the layer beneath (blend mode + opacity).
    stripLayers: 1,
    stripRelation: "opposing",
    stripBlend: "screen",
    stripOpacity: 0.7,
    // Strip gap: dark space between strip images (% of the screen).
    stripGap: 0,
    // Echo trail: the moving picture leaves fading echoes ("off" | "smear"
    // | "even" | "ragged"), with length and strength 0–100.
    echoMode: "off",
    echoLength: 60,
    echoStrength: 60,
    echoBlend: "lighten",
    // Global look adjustments (CSS filter %, 100 = no change) — applied to
    // the whole #stage element rather than run through the effect pipeline,
    // since they should affect literally everything on screen (every
    // effect, blend combination, and pan position) rather than needing to
    // be threaded through each effect's own pixel math.
    saturation: 100,
    contrast: 100,
  };

  // Starting values come from settings.js's list — the values written in
  // `params` above are only fallbacks / documentation of each field.
  for (const s of PRS.SETTINGS) {
    if (s.param && s.default !== undefined) setPath(params, s.param, s.default);
  }

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
      img.onload = () => {
        rememberSize(path, img);
        resolve(path);
      };
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
  const DEMO_MAX_PROBE = 60; // was 30, which silently skipped demo-31.jpg

  function probeDemoImage(index) {
    return new Promise((resolve) => {
      const path = `assets/demo/demo-${String(index).padStart(2, "0")}.jpg`;
      const img = new Image();
      img.onload = () => {
        rememberSize(path, img);
        resolve(path);
      };
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
  // 4. IMAGE PIPELINE — cover-crop normalize to the layout slot size
  // ---------------------------------------------------------------------
  // Runs once per image per slot size (full stage for "single", one tile
  // for "tiles"); the result is cached so effects never touch the raw
  // source or handle variable aspect ratios. The cache is cleared whenever
  // the stage is rebuilt (resize/fullscreen), since every slot size changes.
  // Stores promises, so two tiles asking for the same image at once share
  // one load.
  const normalizedCache = new Map(); // `${src}|${w}x${h}` -> Promise<HTMLCanvasElement>

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only request CORS mode for actual cross-origin (Drive) URLs. Setting
      // crossOrigin on local/same-origin seed images makes some browsers
      // (notably Chrome on file://) refuse to load them at all.
      if (/^https?:\/\//i.test(src)) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        rememberSize(src, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`failed to load ${src}`));
      img.src = src;
    });
  }

  // Equivalent of CSS object-fit: cover — scale to fill, crop overflow, centred.
  function drawCover(ctx, img, destW, destH) {
    const srcW = img.naturalWidth || img.videoWidth || img.width;
    const srcH = img.naturalHeight || img.videoHeight || img.height;

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

  function normalizeImage(src, w = STAGE.w, h = STAGE.h) {
    const key = `${src}|${w}x${h}`;
    const cached = normalizedCache.get(key);
    if (cached) {
      // Re-insert so Map order doubles as least-recently-used order.
      normalizedCache.delete(key);
      normalizedCache.set(key, cached);
      return cached;
    }

    const promise = loadImage(src).then((img) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      drawCover(canvas.getContext("2d"), img, w, h);
      return canvas;
    });
    // Don't cache failures — a later cycle should get to retry.
    promise.catch(() => {
      if (normalizedCache.get(key) === promise) normalizedCache.delete(key);
    });
    normalizedCache.set(key, promise);
    while (normalizedCache.size > CONFIG.NORMALIZED_CACHE_MAX) {
      normalizedCache.delete(normalizedCache.keys().next().value);
    }
    return promise;
  }

  // ---------------------------------------------------------------------
  // 4b. LAYOUTS — picked randomly per cycle from the profile's list
  // ---------------------------------------------------------------------
  //   single — one image cover-cropped to the whole stage.
  //   tiles  — a row of portrait (~9:16) tiles, one image each, edge to
  //            edge. Only offered when the stage is wide enough for 2+.
  // Either way the result is ONE stage-sized canvas, so every effect,
  // blend and move downstream works on it exactly as before.
  //   walls  — one image per physical wall section (profiles with `seams`).
  // Tile count is worked out per wall section when the profile has seams
  // (Igloo: 1920x1038 per wall -> 3 tiles of 640 -> 18 in all), so every
  // join lands exactly between two tiles. Without seams it's the whole
  // stage as one section, i.e. the original desktop behaviour.
  function tileCount() {
    const seams = STAGE_PROFILE.seams || 1;
    const perSection = Math.max(1, Math.round(STAGE.w / seams / STAGE.h / CONFIG.TILE_ASPECT));
    return perSection * seams;
  }

  function availableLayouts() {
    return STAGE_PROFILE.layouts.filter((k) => {
      if (k === "tiles") return tileCount() >= 2;
      if (k === "walls") return (STAGE_PROFILE.seams || 1) >= 2;
      return true;
    });
  }

  // How much cover-cropping this image into a slotW x slotH slot enlarges it.
  function upscaleFor(src, slotW, slotH) {
    const s = imageSizes.get(src);
    if (!s) return 1; // size not known yet (e.g. Drive file not loaded) — give it the benefit of the doubt
    return Math.max(slotW / s.w, slotH / s.h);
  }

  // Indices of images sharp enough for this slot size (see CONFIG.MAX_UPSCALE).
  function sharpPool(slotW, slotH) {
    return state.sources
      .map((_, i) => i)
      .filter((i) => upscaleFor(state.sources[i], slotW, slotH) <= (STAGE_PROFILE.maxUpscale ?? CONFIG.MAX_UPSCALE));
  }

  // Picks this cycle's layout AND the pool of images it may draw from.
  // A layout is only eligible if enough photos are sharp enough for its
  // slot size: at least 2 (so consecutive cycles don't repeat one photo),
  // and at least 3 for multi-slot layouts (so 6 walls aren't all one or
  // two photos). If no layout qualifies — e.g. every photo is small — it
  // falls back to the old behaviour (any layout, any photo) rather than
  // showing nothing.
  function pickLayout() {
    const avail = availableLayouts();
    let candidates = (FORCED_LAYOUT && avail.includes(FORCED_LAYOUT) ? [FORCED_LAYOUT] : avail)
      .map((kind) => {
        const spec = layoutSpec(kind);
        const pool = sharpPool(spec.slotW, spec.slotH);
        const needed = Math.max(2, Math.min(spec.slots, 3));
        return { ...spec, pool, eligible: pool.length >= Math.min(needed, state.sources.length) };
      });
    const eligible = candidates.filter((c) => c.eligible);
    if (eligible.length > 0) {
      candidates = eligible;
    } else {
      candidates = candidates.map((c) => ({ ...c, pool: state.sources.map((_, i) => i), lowRes: true }));
    }
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || {
      ...layoutSpec("single"),
      pool: state.sources.map((_, i) => i),
    };
    delete chosen.eligible;
    return chosen;
  }

  function layoutSpec(kind) {
    if (kind === "tiles" || kind === "walls") {
      const n = kind === "walls" ? STAGE_PROFILE.seams : tileCount();
      // One shared slot size for every tile (ceil, then positioned by
      // rounding i*w/n) so they all hit the same cache entry size and
      // never leave a 1px gap — worst case they overlap by 1px.
      return { kind, slots: n, slotW: Math.ceil(STAGE.w / n), slotH: STAGE.h };
    }
    return { kind: "single", slots: 1, slotW: STAGE.w, slotH: STAGE.h };
  }

  async function buildLayoutSource(layout, srcs) {
    if (layout.kind === "single") return normalizeImage(srcs[0], STAGE.w, STAGE.h);

    const results = await Promise.allSettled(
      srcs.map((s) => normalizeImage(s, layout.slotW, layout.slotH))
    );
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (ok.length === 0) throw results[0].reason;

    const canvas = document.createElement("canvas");
    canvas.width = STAGE.w;
    canvas.height = STAGE.h;
    const ctx = canvas.getContext("2d");
    results.forEach((r, i) => {
      // A tile whose image failed borrows one that loaded, rather than
      // leaving a black hole in the row.
      const tile = r.status === "fulfilled" ? r.value : ok[i % ok.length];
      ctx.drawImage(tile, Math.round((i * STAGE.w) / layout.slots), 0);
    });
    return canvas;
  }

  function describeStage(layout) {
    const dpr = STAGE.dpr !== 1 ? ` @${+STAGE.dpr.toFixed(2)}x` : "";
    const lay = layout
      ? ` · ${layout.kind}${layout.slots > 1 ? ` ×${layout.slots}` : ""}` +
        (layout.pool ? ` · ${layout.pool.length}/${state.sources.length} photos sharp enough${layout.lowRes ? " (none — using all)" : ""}` : "")
      : "";
    return `${STAGE.profile} ${STAGE.w}×${STAGE.h}${dpr}${lay}`;
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

  // Precomputed Shadows->Highlights gradient: 256 steps of the same
  // mixHexColors() result, plus a ready-made CSS string per step. Effects
  // index it by luminance instead of calling mixHexColors() (which
  // re-parses both hex strings) per pixel/cell — that per-pixel parse is
  // what made Duotone slow at Igloo size (12M pixels per frame). Cached per
  // colour pair, so custom colour picks just add another small entry.
  const monoLutCache = new Map();
  function monoLut(bgHex, fgHex) {
    const key = `${bgHex}|${fgHex}`;
    let lut = monoLutCache.get(key);
    if (lut) return lut;
    const rgb = new Uint8ClampedArray(256 * 3);
    const css = new Array(256);
    for (let k = 0; k < 256; k++) {
      const m = mixHexColors(bgHex, fgHex, k / 255);
      rgb[k * 3] = m.r;
      rgb[k * 3 + 1] = m.g;
      rgb[k * 3 + 2] = m.b;
      css[k] = `rgb(${m.r}, ${m.g}, ${m.b})`;
    }
    lut = { rgb, css };
    if (monoLutCache.size > 64) monoLutCache.clear();
    monoLutCache.set(key, lut);
    return lut;
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
    const { rgb } = monoLut(bgColor, fgColor);
    for (let i = 0; i < d.length; i += 4) {
      // Integer form of the 0.299/0.587/0.114 luminance weights (x256).
      const k = ((77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8) * 3;
      d[i] = rgb[k];
      d[i + 1] = rgb[k + 1];
      d[i + 2] = rgb[k + 2];
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Pixelation (effect 2): downscale the source onto a tiny offscreen
  // canvas, then scale it back up with smoothing off so the browser's own
  // upscale does the blocky enlargement — no manual per-cell loop needed.
  const pixelateTempCanvas = document.createElement("canvas");

  function applyPixelate(ctx, sourceCanvas, { cellSize, fgColor, bgColor }) {
    const w = STAGE.w;
    const h = STAGE.h;
    // cellSize is in slider units (px at REF_HEIGHT) — scale to this stage.
    const px = stagePx(cellSize, CONFIG.MAX_CELLS.pixelate);
    const cols = Math.max(1, Math.round(w / px));
    const rows = Math.max(1, Math.round(h / px));

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
    const { rgb } = monoLut(bgColor || "#000000", fgColor || "#00ff00");
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const rollPalette = animatePalette && Math.random() * 100 < density;
      if (rollPalette) {
        const mixed = randomPaletteMonoColor(lum);
        d[i] = mixed.r;
        d[i + 1] = mixed.g;
        d[i + 2] = mixed.b;
      } else {
        const k = Math.round(lum * 255) * 3;
        d[i] = rgb[k];
        d[i + 1] = rgb[k + 1];
        d[i + 2] = rgb[k + 2];
      }
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
    refreshEffectSnapshot(ctx.canvas);
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
    // Now expressed as a cell budget (CONFIG.MAX_CELLS.halftone) rather
    // than a flat 6px, so it scales with stage area — same result on phone.
    const safeCellSize = stagePx(cellSize, CONFIG.MAX_CELLS.halftone);
    const w = STAGE.w;
    const h = STAGE.h;
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
    refreshEffectSnapshot(ctx.canvas);
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
    const lut = monoLut(bgColor || "#000000", fgColor || "#00ff00");

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
        if (rollPalette) {
          const mixed = randomPaletteMonoColor(lum);
          ctx.fillStyle = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
        } else {
          ctx.fillStyle = lut.css[Math.round(lum * 255)];
        }
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
    const w = STAGE.w;
    const h = STAGE.h;
    const px = stagePx(cellSize, CONFIG.MAX_CELLS.ascii);
    const cols = Math.max(1, Math.floor(w / px));
    const rows = Math.max(1, Math.floor(h / px));
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
    refreshEffectSnapshot(ctx.canvas);
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
  // Setting width/height also clears the canvas — only call on a real
  // size change (boot, rebuildStage()).
  function sizeCanvases() {
    for (const c of [canvasA, canvasB]) {
      c.width = STAGE.w;
      c.height = STAGE.h;
    }
  }
  sizeCanvases();

  // Bumped by every cycle() call. A cycle that finishes loading after a
  // newer one has started (resize rebuild, source switch) sees a stale
  // number and bails, so there's never two cycle chains or a frame drawn
  // at the old stage size.
  let cycleGeneration = 0;

  const state = {
    sources: [],
    currentIndex: -1,
    // All image indices on screen this cycle (1 for single, N for tiles);
    // currentIndex is always currentIndices[0].
    currentIndices: [],
    currentLayout: null,
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
    // Running scroll offset (stage px) for the tiled Move modes. Accumulates
    // frame by frame rather than resetting each cycle, so the drift carries
    // straight on into the next image instead of jumping back.
    tileOffX: 0,
    tileOffY: 0,
    // Move "Strip": rendered images laid end to end and scrolled past, like
    // the Igloo preview. frames = [{ k, canvas }] where k is the frame's
    // place in the line; s = distance scrolled (px). A new image is
    // requested as the line runs short, so cycles are driven by the scroll
    // rather than the hold timer while this is on. Up to 3 lanes (strip
    // layers), each { axis, dir, factor, frames, s, nextK } — see
    // stripLaneSpecs().
    strip: { lanes: [], sig: "", started: false },
    stripPending: false,
    stripTarget: 0, // which lane the image being rendered right now will join
  };

  // Animation ticks (pixelate/halftone/ascii redraws) refresh the cached
  // effect layer several times a second. At Igloo size a fresh snapshot is a
  // ~48MB canvas per tick, so after the first tick of a cycle this redraws
  // into the same spare canvas instead. Never reuses recentFrames[0] — that
  // one is this cycle's entry in the blend history and must stay as-is.
  function refreshEffectSnapshot(sourceCanvas) {
    const cur = state.lastEffectFrame;
    if (cur && cur !== state.recentFrames[0] && cur.width === STAGE.w && cur.height === STAGE.h) {
      const c = cur.getContext("2d");
      c.clearRect(0, 0, STAGE.w, STAGE.h);
      c.drawImage(sourceCanvas, 0, 0);
      return;
    }
    state.lastEffectFrame = snapshotFrame(sourceCanvas);
  }

  function snapshotFrame(sourceCanvas) {
    const snap = document.createElement("canvas");
    snap.width = STAGE.w;
    snap.height = STAGE.h;
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
    panelSync();

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
    state.currentIndices = [];

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

  // Picks `n` image indices for this cycle: images NOT on screen last cycle
  // first (shuffled), then last cycle's, repeating only if the pool is
  // smaller than n. For n=1 this is the old "no immediate repeat" rule.
  function pickIndices(n, pool) {
    const all = (pool && pool.length ? pool : state.sources.map((_, i) => i)).slice();
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const prev = new Set(state.currentIndices);
    const ordered = [...all.filter((i) => !prev.has(i)), ...all.filter((i) => prev.has(i))];
    const out = [];
    for (let k = 0; k < n; k++) out.push(ordered[k % ordered.length]);
    return out;
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
    const scaledW = STAGE.w * zoom;
    const scaledH = STAGE.h * zoom;
    const extraX = scaledW - STAGE.w;
    const extraY = scaledH - STAGE.h;
    const dx = panProgress === null ? -extraX / 2 : -extraX * (1 - Math.max(0, Math.min(1, panProgress)));
    const dy = tiltProgress === null ? -extraY / 2 : -extraY * (1 - Math.max(0, Math.min(1, tiltProgress)));

    ctx.clearRect(0, 0, STAGE.w, STAGE.h);
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
    // Strip with Random move: the direction is rolled once when the strip
    // starts and then kept — re-rolling every image would restart the line
    // (and with several layers, constantly).
    if (params.moveRandomize && params.moveEndMode === "strip" && state.strip.started) return;
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
  // Move "keep going": the effect frame repeated edge to edge and scrolled
  // by the running offset, so it never runs out of image. Mirror flips every
  // other copy (left-right and/or top-bottom) so neighbouring edges are the
  // same pixels and there's no visible seam. Zoom still applies, centred.
  function applyTiledMove(ctx, src, mirror) {
    const W = STAGE.w;
    const H = STAGE.h;
    const zoom = state.moveResolvedZoom === 0 ? 1 : computeMoveZoomLevel();
    const tw = W * zoom;
    const th = H * zoom;
    const offX = state.tileOffX + (W - tw) / 2;
    const offY = state.tileOffY + (H - th) / 2;
    const i0 = Math.floor(-offX / tw);
    const j0 = Math.floor(-offY / th);
    ctx.clearRect(0, 0, W, H);
    for (let j = j0; offY + j * th < H; j++) {
      for (let i = i0; offX + i * tw < W; i++) {
        // Snap to whole pixels and overlap by 1px so no hairline gaps show.
        const x = Math.floor(offX + i * tw);
        const y = Math.floor(offY + j * th);
        const w = Math.ceil(tw) + 1;
        const h = Math.ceil(th) + 1;
        const flipX = mirror && (i & 1) !== 0;
        const flipY = mirror && (j & 1) !== 0;
        if (flipX || flipY) {
          ctx.save();
          ctx.translate(flipX ? x + w : x, flipY ? y + h : y);
          ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
          ctx.drawImage(src, 0, 0, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(src, x, y, w, h);
        }
      }
    }
  }

  // Advances the tiled-scroll offset by this frame's share of the current
  // Pan/Tilt speeds. Same directions as the stop-at-edge sweep: negative
  // Pan moves the picture right (camera pans left), positive Tilt moves it
  // down (camera tilts up).
  let tileLastTick = 0;
  function advanceTileOffsets(now) {
    const dt = tileLastTick ? Math.min(0.1, (now - tileLastTick) / 1000) : 0;
    tileLastTick = now;
    const pxPerSec = CONFIG.MOVE_TILE_RATE * STAGE.h;
    state.tileOffX += -(state.moveResolvedPan / 100) * pxPerSec * dt;
    state.tileOffY += (state.moveResolvedTilt / 100) * pxPerSec * dt;
  }

  // Strip axis/direction from the current Pan/Tilt: the bigger of the two
  // wins. Same directions as the other Move modes (negative Pan = picture
  // travels right, positive Tilt = picture travels down).
  function stripAxis() {
    const pan = state.moveResolvedPan;
    const tilt = state.moveResolvedTilt;
    if (pan === 0 && tilt === 0) return null;
    return Math.abs(pan) >= Math.abs(tilt)
      ? { axis: "x", dir: pan < 0 ? 1 : -1, speed: Math.abs(pan) }
      : { axis: "y", dir: tilt > 0 ? 1 : -1, speed: Math.abs(tilt) };
  }

  // Off with the live camera (one continuous feed, nothing to line up).
  function stripActive() {
    return params.moveEndMode === "strip" && !camera.live && stripAxis() !== null;
  }

  // Strip layers ("lanes"): 1–3 strips at once, each its own line of
  // images with its own axis / direction / speed, drawn over each other.
  // Lane 0 follows Pan/Tilt exactly; the others are set by "Layers move".
  function stripLaneSpecs(base) {
    const n = Math.max(1, Math.min(3, Math.round(params.stripLayers || 1)));
    const other = base.axis === "x" ? "y" : "x";
    const rel = params.stripRelation;
    const specs = [];
    for (let i = 0; i < n; i++) {
      let axis = base.axis;
      let dir = base.dir;
      let factor = 1;
      if (i > 0) {
        if (rel === "parallax") {
          factor = i === 1 ? 0.55 : 1.6; // one slower, one faster — same way
        } else if (rel === "opposing") {
          dir = i === 1 ? -base.dir : base.dir;
          factor = i === 2 ? 0.6 : 1;
        } else if (rel === "crossing") {
          axis = i === 1 ? other : base.axis;
          dir = i === 2 ? -base.dir : base.dir;
          factor = i === 2 ? 1.5 : 0.85;
        } else {
          axis = Math.random() < 0.5 ? base.axis : other;
          dir = Math.random() < 0.5 ? 1 : -1;
          factor = 0.5 + Math.random();
        }
      }
      specs.push({ axis, dir, factor });
    }
    return specs;
  }

  function resetStrip() {
    state.strip.lanes = [];
    state.strip.sig = "";
    state.strip.started = false;
    state.stripTarget = 0;
  }

  function laneLength(lane) {
    return lane.axis === "x" ? STAGE.w : STAGE.h;
  }

  // Distance from one image's start to the next: its length plus the gap.
  function lanePitch(lane) {
    return laneLength(lane) * (1 + (params.stripGap || 0) / 100);
  }

  // (Re)builds the lanes when the strip starts or its direction / layer
  // settings change. The base layer starts filling the screen; extra
  // layers start just off their edge and slide in.
  function ensureStripLanes() {
    const base = stripAxis();
    if (!base) return false;
    const sig = `${base.axis}${base.dir}|${params.stripLayers}|${params.stripRelation}`;
    if (state.strip.sig === sig && state.strip.lanes.length) return true;
    state.strip.sig = sig;
    state.strip.started = true;
    state.strip.lanes = stripLaneSpecs(base).map((spec, i) => ({
      ...spec,
      frames: [],
      s: i === 0 ? 0 : -(spec.axis === "x" ? STAGE.w : STAGE.h),
      nextK: 0,
    }));
    state.stripTarget = 0;
    return true;
  }

  // How urgently a lane needs its next image: > 0 means line one up now
  // (its current last image has less than 60% of its journey left).
  function laneNeed(lane) {
    if (lane.nextK === 0) return 1e9; // empty lane — first in the queue
    const L = laneLength(lane);
    return lane.s - (lane.nextK * lanePitch(lane) - 1.6 * L);
  }

  function pushStripFrame(canvas) {
    if (!ensureStripLanes()) return;
    const lane = state.strip.lanes[state.stripTarget] || state.strip.lanes[0];
    lane.frames.push({ k: lane.nextK++, canvas });
  }

  function stripHasFrames() {
    return state.strip.lanes.some((lane) => lane.frames.length);
  }

  function applyStripMove(ctx) {
    ctx.clearRect(0, 0, STAGE.w, STAGE.h);
    state.strip.lanes.forEach((lane, i) => {
      if (i > 0) {
        ctx.globalCompositeOperation = params.stripBlend === "normal" ? "source-over" : params.stripBlend;
        ctx.globalAlpha = params.stripOpacity;
      }
      const L = laneLength(lane);
      const P = lanePitch(lane);
      for (const f of lane.frames) {
        const pos = Math.round(lane.dir * (lane.s - f.k * P));
        if (pos <= -L || pos >= L) continue;
        ctx.drawImage(f.canvas, lane.axis === "x" ? pos : 0, lane.axis === "y" ? pos : 0);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // Scrolls every lane and asks for the next image for whichever lane is
  // running shortest. One image is rendered at a time; it goes to the lane
  // that asked (state.stripTarget).
  let stripLastTick = 0;
  function advanceStrip(now) {
    const dt = stripLastTick ? Math.min(0.1, (now - stripLastTick) / 1000) : 0;
    stripLastTick = now;
    if (!stripActive()) {
      if (state.strip.started) {
        // Strip just switched off — back to the normal hold timer.
        resetStrip();
        if (!cycleTimeoutId && !state.paused && !state.stripPending && state.hasCycled) {
          cycleTimeoutId = setTimeout(cycle, 0);
        }
      }
      return;
    }
    if (!state.hasCycled || !ensureStripLanes()) return;
    const base = stripAxis();
    const lanes = state.strip.lanes;
    for (const lane of lanes) {
      if (!state.paused && lane.nextK > 0) {
        lane.s += CONFIG.MOVE_TILE_RATE * STAGE.h * (base.speed / 100) * lane.factor * dt;
      }
      const L = laneLength(lane);
      const P = lanePitch(lane);
      lane.frames = lane.frames.filter((f) => lane.s - f.k * P < L); // drop frames fully scrolled past
    }
    if (state.paused || state.stripPending) return;
    let best = -1;
    let bestNeed = 0;
    lanes.forEach((lane, i) => {
      const need = laneNeed(lane) - i * 1e-6; // ties: lower layer first
      if (need > bestNeed) {
        bestNeed = need;
        best = i;
      }
    });
    if (best < 0) return;
    state.stripPending = true;
    state.stripTarget = best;
    if (cycleTimeoutId) {
      clearTimeout(cycleTimeoutId);
      cycleTimeoutId = null;
    }
    cycle();
  }

  function composeFrame(destCtx, moveState) {
    destCtx.clearRect(0, 0, STAGE.w, STAGE.h);
    if (moveState === null) {
      destCtx.drawImage(state.lastEffectFrame, 0, 0);
    } else if (stripActive() && stripHasFrames()) {
      applyStripMove(destCtx);
    } else if (params.moveEndMode === "tile" || params.moveEndMode === "mirror") {
      applyTiledMove(destCtx, state.lastEffectFrame, params.moveEndMode === "mirror");
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
    destCtx.clearRect(0, 0, STAGE.w, STAGE.h);
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
    // Live camera always hard-cuts between effects: a fade would show the
    // outgoing effect frozen on an old frame over the moving video. The
    // Crossfade setting itself is left alone and applies again for photos.
    const fade = params.crossfadeEnabled && !camera.live && !stripActive();
    const transition = fade ? `opacity ${CONFIG.CROSSFADE_MS}ms ease-in-out` : "none";
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
    if (fade) {
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
    if (state.sources.length === 0 && !camera.live) return;

    // Resolved before anything renders, same reasoning as
    // pickRandomEffect()/pickBlendOverlay() below — so that if "Randomize
    // move" is on, even this cycle's very first (seed) frame already
    // reflects the freshly-rolled Pan/Tilt/Zoom values, not last cycle's.
    const gen = ++cycleGeneration;
    resolveMoveSpeeds();
    // Live camera: always one full-stage view of the camera, no photo picking.
    const layout = camera.live ? { ...layoutSpec("single"), kind: "camera" } : pickLayout();
    const indices = camera.live ? [] : pickIndices(layout.slots, layout.pool);
    state.currentIndices = indices;
    state.currentIndex = camera.live ? -1 : indices[0];
    state.currentLayout = layout;
    const src = camera.live ? "live camera" : state.sources[state.currentIndex];
    let { key: effectKey, effect, effectParams } = pickRandomEffect();
    // Start on Untouched: overrides whatever pickRandomEffect() rolled, but
    // only for the very first cycle since page load, and only if Untouched
    // is actually in rotation (respects the "In rotation" checkbox above
    // rather than forcing an effect the user explicitly turned off).
    // Independent of Untouched's own box (which is now the all-effects-off
    // switch): ticked = the first image after page load is always plain.
    if (!state.hasCycled && params.startUnchanged) {
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
      const composed = camera.live
        ? grabCameraFrame()
        : await buildLayoutSource(
            layout,
            indices.map((i) => state.sources[i])
          );
      // Superseded while loading (stage rebuilt / source switched) — the
      // newer cycle owns the screen and the schedule now.
      if (gen !== cycleGeneration) return;
      await crossfadeTo(composed, effect, effectParams, blendOverlay);
      // Only update this on success — a failed render leaves the previous
      // frame on screen, so the animation timer should keep treating
      // whatever's actually still visible as the "current" effect.
      state.lastEffectKey = effectKey;
      // What the live camera loop keeps re-running on every video frame.
      state.liveEffect = { effect, effectParams };
      if (stripActive()) pushStripFrame(state.lastEffectFrame);
    } catch (err) {
      // Previously this only went to console.error, so a mid-render throw
      // (e.g. getImageData on a tainted canvas) would silently freeze the
      // display on whatever last rendered, while diagnostics kept reporting
      // the *intended* effect as if it had succeeded. Surface it instead.
      console.error(`[cycle] effect "${effectKey}" failed, image not updated:`, err);
      renderError = err;
    }

    state.stripPending = false;
    if (gen !== cycleGeneration) return;

    let holdMs = randomHold();
    // Move "Next image": hold exactly as long as the journey takes, so each
    // image reaches its destination just as the next one comes in.
    if (params.moveEndMode === "next" && moveIsActive()) {
      const travelSec = moveSweepCapSec();
      if (Number.isFinite(travelSec)) {
        holdMs = Math.max(travelSec * 1000, params.crossfadeEnabled && !camera.live ? CONFIG.CROSSFADE_MS : 0);
      }
    }
    // Marks the start of this cycle's hold window for the Move overlay's pan
    // progress (elapsed / currentHoldMs, read every rAF tick — see the pan
    // loop below). Reset every cycle regardless of render success/failure,
    // same as the scheduling below; a failed render just means the pan
    // restarts against whatever frame is still on screen.
    state.cycleStartedAt = performance.now();
    state.currentHoldMs = holdMs;
    updateDiagnostics(src, holdMs, effectKey, effectParams, renderError, blendOverlay, layersAvailable);
    if (camera.live) {
      setText("diagImage", `live camera${camera.mirror ? " (mirrored)" : " (back)"}`);
      setText("diagSource", `camera · ${camera.fps} fps`);
    }

    // Only schedule the next cycle if nothing paused us while this one was
    // in flight (e.g. user hit P while an image was still loading).
    cycleTimeoutId = state.paused || stripActive() ? null : setTimeout(cycle, holdMs);
  }

  function updateDiagnostics(src, holdMs, effectKey, effectParams, renderError, blendOverlay, layersAvailable) {
    const shortName = src.length > 40 ? `…${src.slice(-37)}` : src;
    setText("diagSource", state.sourceType);
    const more = state.currentIndices.length > 1 ? ` +${state.currentIndices.length - 1} more` : "";
    setText(
      "diagImage",
      `${shortName} (${state.currentIndex + 1}/${state.sources.length})${more}`
    );
    setText("diagStage", describeStage(state.currentLayout));

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
    setText("diagHold", stripActive() ? "set by the strip" : `${(holdMs / 1000).toFixed(1)}s`);
    const nowBits = [camera.live ? `camera · ${effectKey}` : effectKey];
    if (!renderError && effectParams && effectParams.paletteIndex) nowBits.push(`palette ${effectParams.paletteIndex}`);
    nowBits.push(`${(holdMs / 1000).toFixed(1)} s`);
    setText("cpNow", (renderError ? "render error · " : "") + nowBits.join(" · "));
    panelSync();

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
        ? `pan ${state.moveResolvedPan} tilt ${state.moveResolvedTilt} zoom ${state.moveResolvedZoom} · at edge: ${params.moveEndMode}${params.moveEndMode === "strip" ? ` ×${params.stripLayers} ${params.stripRelation}${params.stripGap ? ` gap ${params.stripGap}%` : ""}` : ""}${params.echoMode !== "off" ? ` · echo ${params.echoMode} ${params.echoLength}/${params.echoStrength} ${params.echoBlend}` : ""}`
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
      `crossfade ${params.crossfadeEnabled ? (camera.live ? "on (hard cuts while camera is on)" : "on") : "off (hard cut)"} · sat ${params.saturation}% · con ${params.contrast}%`
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

    // While preview-panning the stage slides under the window, so just pin
    // the lockup to the window's corner instead of the (moving) image's.
    if (previewPanActive()) {
      lockup.style.top = "16px";
      lockup.style.left = "16px";
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const contentAspect = STAGE.w / STAGE.h;
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

    const aspect = STAGE.w / STAGE.h; // phone: 1080/1920 = 0.5625
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
  function applyResumeSettings(storageKey = CONFIG.SETTINGS_STORAGE_KEY) {
    let raw;
    try {
      raw = localStorage.getItem(storageKey);
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

  // ---------------------------------------------------------------------
  // SETTINGS WIRING — every control comes from settings.js's one list
  // ---------------------------------------------------------------------
  // Each SETTINGS entry says which value in `params` it sets (`param`) and,
  // if it needs to do more than store a value, which named action below to
  // run (`after`). One generic listener per control replaces the old
  // hand-written handler per control.
  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
  }

  // Remembered effect set while Untouched is on, restored when it's off.
  let effectsBeforeUntouched = null;

  const SETTING_ACTIONS = {
    lookFilter() {
      applyLookFilter();
      updateLookDiagnostic();
    },
    lookDiagnostic() {
      updateLookDiagnostic();
    },
    liveMode(on) {
      switchSourceMode(on ? "live" : "demo");
    },
    autoCycle(on) {
      togglePause(!on);
    },
    camera(on) {
      setCamera(on);
    },
    // Untouched is exclusive: on = every effect off (remembering which
    // were on); off = those come back (or all, if none were). Turning any
    // effect on while Untouched is on turns Untouched off. Changes made
    // here in code don't fire events, so broadcastState() keeps the
    // remote page in step.
    effectRotation(on, s) {
      const effects = PRS.SETTINGS.filter((x) => x.after === "effectRotation" && x.id !== "ctrlEffectNone");
      const setFx = (x, val) => {
        setPath(params, x.param, val);
        const el = document.getElementById(x.id);
        if (el) el.checked = val;
      };
      if (s.id === "ctrlEffectNone") {
        if (on) {
          effectsBeforeUntouched = effects.filter((x) => getPath(params, x.param));
          effects.forEach((x) => setFx(x, false));
        } else {
          const restore =
            effectsBeforeUntouched && effectsBeforeUntouched.length ? effectsBeforeUntouched : effects;
          restore.forEach((x) => setFx(x, true));
          effectsBeforeUntouched = null;
        }
      } else if (on && params.enabledEffects.none) {
        setFx(PRS.byId.ctrlEffectNone, false);
        effectsBeforeUntouched = null;
      }
      broadcastState();
    },
  };

  function applySetting(s, el) {
    const v = PRS.readValue(s, el);
    if (s.param) setPath(params, s.param, v);
    if (s.format) {
      const span = document.querySelector(`#controls .val[data-for="${s.id}"]`);
      if (span) span.textContent = PRS.formatValue(s, v);
    }
    if (s.after && SETTING_ACTIONS[s.after]) SETTING_ACTIONS[s.after](v, s);
  }

  function wireSettings() {
    for (const s of PRS.SETTINGS) {
      const el = document.getElementById(s.id);
      if (!el) {
        console.warn(`[settings] no control on the page for ${s.id}`);
        continue;
      }
      // Sliders and colour pickers update live while dragging; the rest on change.
      const evt = s.type === "range" || s.type === "color" ? "input" : "change";
      el.addEventListener(evt, () => applySetting(s, el));
    }
  }

  function wireControls() {
    const panel = document.getElementById("controls");

    wireSettings();

    window.addEventListener("keydown", (e) => {
      // Typing in a text box (e.g. naming a scene) mustn't fire shortcuts.
      const t = e.target;
      if (t && ((t.tagName === "INPUT" && t.type === "text") || t.tagName === "TEXTAREA")) return;
      // 1–9 switch scenes (Show tab lists them in this order).
      if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        applySceneByIndex(parseInt(e.key, 10) - 1);
        return;
      }
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
      if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
      if (e.key === "?") {
        panel.classList.remove("hidden");
        setPanelTab("show");
      }
      if (e.key === "v" || e.key === "V") {
        showToast(camera.live ? "V — switching camera off…" : "V — starting camera…");
        setCamera(!camera.live);
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
  const EFFECT_ANIMATE_INTERVAL_MS = STAGE_PROFILE.animateIntervalMs || 180;
  setInterval(() => {
    // Live camera redraws every video frame anyway, so these per-tick
    // animations would only fight it for the same canvas.
    if (camera.live || stripActive()) return;
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
  // ---------------------------------------------------------------------
  // ECHO TRAIL — the moving picture leaves fading echoes of itself
  // ---------------------------------------------------------------------
  // A stage-sized layer remembers past frames: each frame it fades a
  // little (Trail length), and the newly composed picture is stamped into
  // it — every frame (smooth smear), at a steady beat (even echoes) or in
  // fits and starts with gaps (ragged, like a dry brush). The layer is then
  // laid over the picture with "lighten", so echoes show over darker parts
  // and in the dark gaps between strip images. Strength = how visible.
  const echo = { canvas: document.createElement("canvas"), last: 0, sinceStamp: 0, skip: 0, active: false };

  function resetEcho() {
    echo.canvas.width = 0;
    echo.active = false;
    echo.last = 0;
    echo.sinceStamp = 0;
    echo.skip = 0;
  }

  function applyEcho(ctx, now) {
    if (params.echoMode === "off") {
      if (echo.active) resetEcho();
      return;
    }
    const W = STAGE.w;
    const H = STAGE.h;
    const c = echo.canvas;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
      echo.last = 0;
    }
    echo.active = true;
    const e = c.getContext("2d");
    const dt = echo.last ? Math.min(0.1, (now - echo.last) / 1000) : 0;
    echo.last = now;

    // Fade: per 60fps frame keep 90% (short) … 99.5% (long), frame-rate independent.
    if (dt > 0 && !state.paused) {
      const keep = Math.pow(0.9 + 0.095 * (params.echoLength / 100), dt * 60);
      e.globalCompositeOperation = "destination-out";
      e.fillStyle = `rgba(0, 0, 0, ${1 - keep})`;
      e.fillRect(0, 0, W, H);
      e.globalCompositeOperation = "source-over";
    }

    // Stamp the fresh frame first, so echoes don't feed back into themselves.
    let alpha = 0;
    if (!state.paused) {
      echo.sinceStamp += dt;
      if (params.echoMode === "smear") {
        alpha = 0.3;
      } else if (params.echoMode === "even") {
        if (echo.sinceStamp >= 0.14) {
          echo.sinceStamp = 0;
          alpha = 0.6;
        }
      } else {
        // ragged: mostly paints, with bursts of skipping and uneven strength
        if (echo.skip > 0) echo.skip -= dt;
        else if (Math.random() < 0.03) echo.skip = 0.1 + Math.random() * 0.35;
        else if (Math.random() < 0.6) alpha = 0.15 + Math.random() * 0.5;
      }
    }

    if (alpha > 0) {
      e.globalAlpha = alpha;
      e.drawImage(ctx.canvas, 0, 0);
      e.globalAlpha = 1;
    }

    // Lay the echoes over the picture.
    const strength = params.echoStrength / 100;
    if (strength > 0) {
      ctx.save();
      ctx.globalCompositeOperation = params.echoBlend || "lighten";
      ctx.globalAlpha = strength;
      ctx.drawImage(c, 0, 0);
      ctx.restore();
    }
  }

  function moveAnimationLoop(now) {
    advanceTileOffsets(now || performance.now());
    advanceStrip(now || performance.now());
    if (!camera.live && state.lastEffectFrame && moveIsActive()) {
      const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
      composeFrame(ctx, {
        pan: computeMovePanProgress(),
        tilt: computeMoveTiltProgress(),
        zoom: computeMoveZoomLevel(),
      });
      applyEcho(ctx, now || performance.now());
    } else if (!camera.live && echo.active) {
      resetEcho();
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

  // ---------------------------------------------------------------------
  // STAGE REBUILD — resize / fullscreen / devicePixelRatio change
  // ---------------------------------------------------------------------
  // Recomputes the stage; if the pixel size actually changed, resizes both
  // canvases, drops every size-specific cache (normalised images, blend
  // history, effect animation state) and starts a fresh cycle straight away
  // so the screen isn't left blank. The phone profile's size never changes,
  // so for it this only ever re-positions the brand lockup.
  let stageRebuildTimer = null;
  function scheduleStageRebuild() {
    clearTimeout(stageRebuildTimer);
    stageRebuildTimer = setTimeout(rebuildStage, 150);
  }

  function rebuildStage() {
    const next = computeStageSize();
    STAGE.dpr = next.dpr;
    if (next.w === STAGE.w && next.h === STAGE.h) {
      positionBrandLockup();
      return;
    }
    STAGE.w = next.w;
    STAGE.h = next.h;

    sizeCanvases();
    normalizedCache.clear();
    state.recentFrames = [];
    state.lastEffectFrame = null;
    state.lastBlendLayers = [];
    state.lastBlendMode = null;
    state.lastEffectKey = null; // stops the effect animation ticker until the next render
    resetStrip();
    lastPixelateSource = null;
    lastAsciiFrame = null;
    lastHalftoneFrame = null;

    positionBrandLockup();
    setText("diagStage", describeStage(null));
    console.info(`[stage] rebuilt at ${STAGE.w}x${STAGE.h}`);

    if (state.sources.length === 0) return;
    if (cycleTimeoutId) {
      clearTimeout(cycleTimeoutId);
      cycleTimeoutId = null;
    }
    // Runs even when paused (the resize just blanked both canvases); cycle()
    // itself won't schedule a follow-up while paused.
    cycle();
  }

  // devicePixelRatio changes (dragging the window to another monitor, zoom)
  // don't always fire resize, so watch the current ratio and re-arm after.
  function watchDevicePixelRatio() {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    if (!mq.addEventListener) return;
    mq.addEventListener(
      "change",
      () => {
        scheduleStageRebuild();
        watchDevicePixelRatio();
      },
      { once: true }
    );
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch((err) => {
        console.warn("[stage] fullscreen refused:", err);
      });
    }
  }

  // ---------------------------------------------------------------------
  // PREVIEW PAN (?preview) — see PREVIEW_PAN above
  // ---------------------------------------------------------------------
  // Speed: one wall section (stage height x 1920/1038 on the Igloo, i.e. a
  // 9:16-ish slice's worth) every PREVIEW_PAN_SEC_PER_WALL seconds, eased
  // to a stop at each end before turning back. Measured from the window
  // size every frame, so resizing mid-pan just works.
  const PREVIEW_PAN_SEC_PER_WALL = 8;

  function previewPanActive() {
    return PREVIEW_PAN && STAGE.w / STAGE.h > window.innerWidth / window.innerHeight;
  }

  // Runs as a CSS animation, not a JS rAF loop: the browser's compositor
  // thread animates CSS transforms on its own, so the pan stays smooth even
  // while the main thread is busy redrawing a big halftone/ASCII frame
  // (70ms+ at Igloo size), which used to freeze the pan for a few frames on
  // every animation tick. JS only recomputes the distance/duration when the
  // window size changes, by rewriting one small <style> rule.
  let previewPanKey = "";
  function applyPreviewPan() {
    if (!PREVIEW_PAN) return;
    let styleEl = document.getElementById("previewPanStyle");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "previewPanStyle";
      document.head.appendChild(styleEl);
    }
    if (!previewPanActive()) {
      document.body.classList.remove("preview-pan");
      styleEl.textContent = "";
      previewPanKey = "";
      return;
    }
    const stageCssW = window.innerHeight * (STAGE.w / STAGE.h);
    const travel = Math.round(Math.max(0, stageCssW - window.innerWidth));
    const sections = STAGE_PROFILE.seams || 1;
    const pxPerSec = stageCssW / sections / PREVIEW_PAN_SEC_PER_WALL;
    const legSec = Math.max(1, travel / pxPerSec).toFixed(2);
    const key = `${travel}|${legSec}`;
    if (key === previewPanKey) return; // unchanged — don't restart the animation
    previewPanKey = key;
    document.documentElement.style.setProperty("--stage-aspect", String(STAGE.w / STAGE.h));
    document.body.classList.add("preview-pan");
    // ease-in-out + alternate = glide from wall 1 to the far end, ease to a
    // stop, glide back — same motion as before.
    styleEl.textContent =
      `@keyframes previewPan { from { transform: translate3d(0, 0, 0); } ` +
      `to { transform: translate3d(${-travel}px, 0, 0); } }\n` +
      `body.preview-pan #stage { animation: previewPan ${legSec}s ease-in-out infinite alternate; }`;
  }

  function startPreviewPan() {
    if (!PREVIEW_PAN) return;
    applyPreviewPan();
    let t = null;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(applyPreviewPan, 150);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onResize);
  }

  // Browsers (Chrome especially) restore form-control states on reload, so
  // checkboxes/sliders could come back showing a previous visit's settings
  // while the engine runs from the coded defaults — or vice versa. Reset
  // every control to its HTML default before wiring, so what's ticked is
  // what's running. Saved presets (Load button / ?resume=1) still apply
  // afterwards as before.
  function resetControlsToDefaults() {
    document.querySelectorAll("#controls input, #controls select").forEach((el) => {
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = el.defaultChecked;
      } else if (el.tagName === "SELECT") {
        for (const o of el.options) o.selected = o.defaultSelected;
      } else {
        el.value = el.defaultValue;
      }
    });
  }

  // ---------------------------------------------------------------------
  // LIVE CAMERA (V key / "Live camera" checkbox)
  // ---------------------------------------------------------------------
  // Feeds this computer's camera through the effects in real time instead
  // of photos. The normal cycle keeps running — every hold it still rolls a
  // new effect/palette/blend and crossfades to it — but instead of a photo
  // it grabs the current camera frame, and between cycles a per-video-frame
  // loop re-runs that same effect on each new frame. Mirrored like a
  // selfie view. Nothing is recorded, stored or uploaded: frames only ever
  // exist in on-page canvases. Needs https or localhost (GitHub Pages is
  // fine) and the browser's camera permission.
  //
  // Frame rate depends on effect cost x stage size: pixelate/duotone run
  // near camera rate on a laptop; halftone/ASCII are choppier, and at full
  // Igloo size this would need the GPU (WebGL) rework to be smooth.
  const camera = {
    live: false,
    stream: null,
    video: null,
    canvas: null, // mirrored, cover-cropped camera frame at stage size
    layer: null, // effect output, used as state.lastEffectFrame
    fps: 0,
    frames: 0,
    fpsAt: 0,
    facing: "user", // "user" = front/selfie (laptop webcams report nothing), "environment" = back
    mirror: true, // only the front camera is mirrored — a mirrored back camera reverses text
    loopToken: 0, // bumped whenever a new frame loop starts, so an old one can't keep running alongside
  };

  // One place that opens the camera, so start and flip ask the same way.
  async function openCameraStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { ideal: camera.facing } },
        audio: false,
      });
    } catch (err) {
      // Some cameras reject the size/facing hints — retry with no constraints.
      if (err && err.name === "OverconstrainedError") {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      throw err;
    }
  }

  function applyTrackFacing(stream) {
    const track = stream.getVideoTracks()[0];
    const set = track && track.getSettings ? track.getSettings() : {};
    camera.mirror = set.facingMode ? set.facingMode === "user" : camera.facing === "user";
    return { track, set };
  }

  // Front ↔ back. Stops the old stream first (iPhones won't open a second
  // camera while one is running), then swaps the new one into the same
  // <video>, and restarts the frame loop.
  async function flipCamera() {
    const prev = camera.facing;
    camera.facing = prev === "user" ? "environment" : "user";
    const label = camera.facing === "user" ? "front" : "back";
    if (!camera.live) {
      showToast(`Camera will open on the ${label} camera.`);
      updateTouchBar();
      return;
    }
    showToast(`Switching to the ${label} camera…`);
    try {
      if (camera.stream) camera.stream.getTracks().forEach((t) => t.stop());
      const stream = await openCameraStream();
      camera.stream = stream;
      camera.video.srcObject = stream;
      await camera.video.play();
      const { track } = applyTrackFacing(stream);
      camera.loopToken++;
      scheduleCameraFrame();
      showToast(`Camera on: ${(track && track.label) || label + " camera"}`, "ok");
    } catch (err) {
      camera.facing = prev;
      showToast(`Couldn't switch camera (${(err && err.name) || "Error"}) — turning camera off.`, "error", 8000);
      setCamera(false);
    }
    updateTouchBar();
  }

  function grabCameraFrame() {
    if (!camera.canvas) camera.canvas = document.createElement("canvas");
    const c = camera.canvas;
    if (c.width !== STAGE.w || c.height !== STAGE.h) {
      c.width = STAGE.w;
      c.height = STAGE.h;
    }
    const ctx = c.getContext("2d");
    ctx.save();
    if (camera.mirror) {
      ctx.translate(STAGE.w, 0);
      ctx.scale(-1, 1); // selfie mirror — front/laptop camera only
    }
    drawCover(ctx, camera.video, STAGE.w, STAGE.h);
    ctx.restore();
    return c;
  }

  function cameraLoop() {
    if (!camera.live) return;
    const fx = state.liveEffect;
    if (fx && camera.video.readyState >= 2) {
      const source = grabCameraFrame();
      if (!camera.layer || camera.layer.width !== STAGE.w || camera.layer.height !== STAGE.h) {
        camera.layer = document.createElement("canvas");
        camera.layer.width = STAGE.w;
        camera.layer.height = STAGE.h;
      }
      const lctx = camera.layer.getContext("2d");
      lctx.clearRect(0, 0, STAGE.w, STAGE.h);
      try {
        fx.effect.run(lctx, source, fx.effectParams);
        state.lastEffectFrame = camera.layer;
        const ctx = state.frontCanvas === canvasA ? ctxA : ctxB;
        // Same composite as the photo path: effect layer (Move applies to
        // it), past-frame blend layers frozen on top.
        composeFrame(
          ctx,
          moveIsActive()
            ? { pan: computeMovePanProgress(), tilt: computeMoveTiltProgress(), zoom: computeMoveZoomLevel() }
            : null
        );
        if (moveIsActive()) applyEcho(ctx, performance.now());
        else if (echo.active) resetEcho();
      } catch (err) {
        console.warn("[camera] frame failed:", err);
      }

      camera.frames++;
      const now = performance.now();
      if (now - camera.fpsAt >= 1000) {
        camera.fps = Math.round((camera.frames * 1000) / (now - camera.fpsAt));
        camera.frames = 0;
        camera.fpsAt = now;
        setText("diagSource", `camera · ${camera.fps} fps`);
      }
    }
    scheduleCameraFrame();
  }

  function scheduleCameraFrame() {
    if (!camera.live) return;
    const token = camera.loopToken;
    const next = () => {
      if (token === camera.loopToken) cameraLoop();
    };
    // requestVideoFrameCallback = once per new camera frame (no wasted
    // redraws of an unchanged frame); rAF fallback for older browsers.
    if (camera.video.requestVideoFrameCallback) {
      camera.video.requestVideoFrameCallback(next);
    } else {
      requestAnimationFrame(next);
    }
  }

  function cameraMessage(text) {
    const el = document.getElementById("diagWarning");
    if (el) {
      el.textContent = text;
      el.classList.toggle("hidden", !text);
    }
    if (text) console.warn(`[camera] ${text}`);
  }

  let cameraSwitchToken = 0;
  async function setCamera(on) {
    const box = document.getElementById("ctrlCamera");
    const token = ++cameraSwitchToken;
    if (on === camera.live) {
      if (box) box.checked = on;
      return;
    }

    if (on) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cameraMessage("Camera not available here — needs https (e.g. GitHub Pages) or localhost.");
        showToast("Camera not available here — open the https GitHub Pages link (or localhost).", "error", 10000);
        if (box) box.checked = false;
        return;
      }
      try {
        // Permissions API (where supported) says up front if the site is
        // already blocked, which otherwise fails silently with no prompt.
        try {
          const perm = navigator.permissions && (await navigator.permissions.query({ name: "camera" }));
          if (perm && perm.state === "denied") {
            showToast(
              "Camera is blocked for this site — click the icon at the left of the address bar, set Camera to Allow, then press V again.",
              "error",
              10000
            );
          } else if (perm && perm.state === "prompt") {
            showToast("Asking for camera permission — look for the prompt near the address bar and click Allow.", "info", 8000);
          }
        } catch (e) {
          /* Permissions API can't query camera in this browser — fine */
        }
        const stream = await openCameraStream();
        if (token !== cameraSwitchToken) {
          stream.getTracks().forEach((t) => t.stop()); // switched off again while asking
          return;
        }
        const video = camera.video || document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        if (!video.videoWidth) {
          await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));
        }
        camera.video = video;
        camera.stream = stream;
        camera.live = true;
        camera.frames = 0;
        camera.fpsAt = performance.now();
        cameraMessage("");
        const { track, set } = applyTrackFacing(stream);
        showToast(
          `Camera on: ${(track && track.label) || "camera"} · ${video.videoWidth}×${video.videoHeight}` +
            (set.frameRate ? ` @ ${Math.round(set.frameRate)} fps` : ""),
          "ok"
        );
      } catch (err) {
        const name = (err && err.name) || "Error";
        const hints = {
          NotAllowedError:
            "permission refused — click the icon at the left of the address bar and allow Camera. On a Mac, also check System Settings → Privacy & Security → Camera for this browser.",
          NotFoundError: "no camera found on this computer.",
          NotReadableError: "the camera is busy — close Zoom, Teams, FaceTime or anything else using it, then press V again.",
          SecurityError: "the browser blocked camera access here — use the https GitHub Pages link or localhost.",
          AbortError: "the camera failed to start — try again, or restart the browser.",
        };
        const why = hints[name] || (err && err.message) || String(err);
        cameraMessage(`Camera unavailable (${name}): ${why}`);
        showToast(`Camera didn't start (${name}): ${why}`, "error", 12000);
        if (box) box.checked = false;
        return;
      }
    } else {
      camera.live = false;
      if (camera.stream) camera.stream.getTracks().forEach((t) => t.stop()); // camera light goes off
      camera.stream = null;
      if (camera.video) camera.video.srcObject = null;
      showToast("Camera off — back to photos.");
    }

    if (box) box.checked = camera.live;
    broadcastState();
    // Switch over now rather than at the end of the current hold.
    if (cycleTimeoutId) {
      clearTimeout(cycleTimeoutId);
      cycleTimeoutId = null;
    }
    await cycle();
    if (camera.live) {
      camera.loopToken++;
      scheduleCameraFrame();
    }
    updateTouchBar();
  }

  // ---------------------------------------------------------------------
  // TOUCH CONTROLS (phones/tablets — no keyboard for V/C/D)
  // ---------------------------------------------------------------------
  // A small button bar, bottom-right: Camera on/off, Flip (front/back, only
  // while the camera is on), Controls (= C) and Info (= D). Shown on touch
  // screens, or anywhere with ?touch. Fades away after a few seconds so it
  // doesn't sit on the artwork; tap the screen to bring it back.
  // Icons + iconSvg() live in settings.js, shared with the remote page.
  const { iconSvg } = PRS;

  const TOUCH_UI =
    pageParams.has("touch") || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const TOUCH_BAR_HIDE_MS = 5000;
  let touchBarTimer = null;

  function buildTouchBar() {
    if (!TOUCH_UI || document.getElementById("touchBar")) return;
    const bar = document.createElement("div");
    bar.id = "touchBar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Display controls");
    // Styled in style.css (#touchBar) to match the controls panel's footer
    // tabs — dark full-width bar, icon above a text label — so opening the
    // panel swaps one bar for the other in the same place.
    const mk = (id, label, icon, onTap) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.innerHTML = `${iconSvg(icon, 22)}<span>${label}</span>`;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onTap();
        showTouchBar();
      });
      bar.appendChild(b);
      return b;
    };
    mk("tbCamera", "Camera", "videocam", () => setCamera(!camera.live));
    mk("tbFlip", "Flip", "cameraswitch", flipCamera);
    mk("tbControls", "Controls", "tune", () => {
      const panel = document.getElementById("controls");
      if (panel) panel.classList.toggle("hidden");
    });
    mk("tbInfo", "Info", "info", () => {
      const diag = document.getElementById("diagnostics");
      if (diag) diag.classList.toggle("hidden");
    });
    document.body.appendChild(bar);
    updateTouchBar();
    showTouchBar();
  }

  function updateTouchBar() {
    panelSync();
    const cam = document.getElementById("tbCamera");
    if (!cam) return;
    // Live: crossed-out camera (= tap to turn off), green like an active tab.
    cam.innerHTML = `${iconSvg(camera.live ? "videocam_off" : "videocam", 22)}<span>${camera.live ? "Camera off" : "Camera"}</span>`;
    cam.setAttribute("aria-pressed", String(camera.live));
    const flip = document.getElementById("tbFlip");
    if (flip) flip.style.display = camera.live ? "" : "none";
  }

  function showTouchBar() {
    const bar = document.getElementById("touchBar");
    if (!bar) return;
    bar.style.opacity = "1";
    bar.style.pointerEvents = "auto";
    clearTimeout(touchBarTimer);
    touchBarTimer = setTimeout(() => {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
    }, TOUCH_BAR_HIDE_MS);
  }

  // Phones dim and lock while you just watch — keep the screen on while the
  // page is open (needs a tap first, and re-taken when you come back to the
  // tab). Quietly does nothing where unsupported.
  let wakeLock = null;
  let wakeLockWanted = false;
  async function keepScreenAwake() {
    if (!("wakeLock" in navigator) || wakeLock || document.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch (e) {
      /* refused (low battery etc.) — not important */
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (wakeLockWanted) keepScreenAwake();
  });

  // First tap anywhere: on touch screens bring back the bar, keep the
  // screen awake, and start the background track (iPhones won't autoplay
  // audio until the page has been touched).
  document.addEventListener("pointerdown", (e) => {
    const audio = document.getElementById("bgAudio");
    if (audio && audio.paused) audio.play().catch(() => {});
    if (!TOUCH_UI) return;
    wakeLockWanted = true;
    keepScreenAwake();
    if (!e.target.closest || !e.target.closest("#touchBar")) showTouchBar();
  });

  // ---------------------------------------------------------------------
  // CONTROLS PANEL UI (v2) — tabs, cards, chips, slider fills, profile.
  // ---------------------------------------------------------------------
  // Layout only: every input in the panel is still the original ctrl*
  // element that wireControls() wires up, so presets, ?resume and the
  // remote page keep working. This just arranges and decorates them.
  const PROFILE_CARRY_KEY = "photoRemixProfileCarry";
  const PROFILE_HINTS = {
    phone: "Instagram Story size, letterboxed in the window. The workshop setup.",
    desktop: "Window size × screen sharpness, up to 2560 wide. Rebuilds on resize.",
    igloo: "Six 1920-wide walls as one strip. Tiles never cross a join.",
    "igloo-preview": "The Igloo strip at full window height, gliding wall to wall. For laptops.",
  };

  function currentProfileChoice() {
    return STAGE_PROFILE_KEY === "igloo" && PREVIEW_PAN ? "igloo-preview" : STAGE_PROFILE_KEY;
  }

  // The stage size is fixed when the page loads, so switching profile
  // reloads the page — carrying the current settings across via the same
  // mechanism as the recording window (applyResumeSettings), but in a
  // separate storage slot so it never overwrites the user's saved preset.
  function switchProfile(choice) {
    if (choice === currentProfileChoice()) return;
    const values = gatherControlState();
    delete values.ctrlCamera; // don't reopen the camera (and its permission prompt) on the new page
    try {
      localStorage.setItem(PROFILE_CARRY_KEY, JSON.stringify({ savedAt: Date.now(), values }));
    } catch (e) {
      /* settings just won't carry over */
    }
    const url = new URL(location.href);
    ["stage", "preview", "resume", "layout"].forEach((k) => url.searchParams.delete(k));
    const stage = choice === "igloo-preview" ? "igloo" : choice;
    if (stage !== "phone") url.searchParams.set("stage", stage);
    if (choice === "igloo-preview") url.searchParams.set("preview", "1");
    url.searchParams.set("resume", "profile");
    location.href = url.toString();
  }

  function setPanelTab(tab) {
    PRS.setTab(document.getElementById("controls"), tab);
  }

  // App-side half of the panel's visual state; settings.js's syncPanel()
  // does the generic half (chip highlights, slider fills).
  function panelSync() {
    const panel = document.getElementById("controls");
    if (!panel) return;
    PRS.syncPanel(panel);

    const flip = document.getElementById("cpFlip");
    if (flip) flip.hidden = !camera.live;

    const pause = document.getElementById("cpPause");
    if (pause) {
      const label = state.paused ? "Resume (P)" : "Pause (P)";
      pause.innerHTML = iconSvg(state.paused ? "play_arrow" : "pause", 22);
      pause.setAttribute("aria-label", label);
      pause.title = label;
      pause.setAttribute("aria-pressed", String(state.paused));
    }

    const stageEl = document.getElementById("cpStage");
    if (stageEl) stageEl.textContent = describeStage(state.currentLayout);
  }

  // Display-page extras on top of the generic panel settings.js builds:
  // header buttons, camera flip, profile dropdown, Show-tab buttons.
  function initPanel() {
    const panel = document.getElementById("controls");
    if (!panel) return;

    panel.addEventListener("input", panelSync);
    panel.addEventListener("change", panelSync);

    const hide = () => panel.classList.add("hidden");
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    };
    on("cpPause", () => togglePause());
    on("cpClose", hide);
    on("cpGrab", hide);
    on("cpFlip", () => flipCamera());
    on("cpFullscreen", toggleFullscreen);
    on("cpInfoBtn", () => {
      const diag = document.getElementById("diagnostics");
      if (diag) diag.classList.toggle("hidden");
    });
    on("cpBrandBtn", () => {
      const lockup = document.getElementById("brandLockup");
      if (lockup) {
        lockup.classList.toggle("hidden");
        positionBrandLockup();
      }
    });

    // Stage profile dropdown
    const sel = document.getElementById("cpProfile");
    if (sel) {
      sel.value = currentProfileChoice();
      const hint = document.getElementById("cpProfileHint");
      const showHint = () => {
        if (hint) hint.textContent = PROFILE_HINTS[sel.value] || "";
      };
      showHint();
      sel.addEventListener("change", () => {
        showHint();
        switchProfile(sel.value);
      });
    }

    // body.panel-open mirrors the panel's visibility, so the phone bottom
    // sheet can hide the touch buttons it would otherwise cover.
    const syncOpen = () => document.body.classList.toggle("panel-open", !panel.classList.contains("hidden"));
    new MutationObserver(syncOpen).observe(panel, { attributes: true, attributeFilter: ["class"] });
    syncOpen();

    panelSync();
  }

  // ---------------------------------------------------------------------
  // SCENES — named looks you can switch between in one tap (or keys 1–9)
  // ---------------------------------------------------------------------
  // A scene is a snapshot of every control (gatherControlState()), applied
  // with applyControlState() — the same mechanism as presets and the
  // remote page, so anything in settings.js is automatically included.
  //
  // Two sources, listed together:
  //   shared — scenes.json in the project folder (pushed to GitHub), so
  //            every machine that opens the site has them (e.g. the Igloo).
  //            Read-only here.
  //   local  — saved in this browser (localStorage). Export writes all of
  //            them to a scenes.json file to put in the folder and push.
  const SCENES_STORAGE_KEY = "photoRemixScenes";
  let sharedScenes = [];
  let activeSceneName = null;
  let applyingScene = false;

  function loadLocalScenes() {
    try {
      const raw = localStorage.getItem(SCENES_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((s) => s && s.name && s.values) : [];
    } catch (e) {
      return [];
    }
  }

  function storeLocalScenes(list) {
    try {
      localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      showToast(`Couldn't save scenes in this browser: ${e.message}`, "error", 8000);
      return false;
    }
  }

  // Shared first (they're the planned running order), then this browser's.
  function allScenes() {
    const local = loadLocalScenes();
    const localNames = new Set(local.map((s) => s.name));
    return [
      ...sharedScenes.filter((s) => !localNames.has(s.name)).map((s) => ({ ...s, shared: true })),
      ...local.map((s) => ({ ...s, shared: false })),
    ];
  }

  function applyScene(scene) {
    if (!scene) return;
    applyingScene = true;
    try {
      applyControlState(scene.values);
    } finally {
      applyingScene = false;
    }
    activeSceneName = scene.name;
    broadcastState();
    renderScenes();
    showToast(`Scene: ${scene.name}`, "ok", 2500);
  }

  function applySceneByIndex(i) {
    const scene = allScenes()[i];
    if (scene) applyScene(scene);
  }

  function saveScene(name) {
    name = (name || "").trim().slice(0, 40);
    if (!name) {
      showToast("Give the scene a name first.", "info", 3000);
      return;
    }
    const list = loadLocalScenes();
    const scene = { name, savedAt: Date.now(), values: gatherControlState() };
    const existing = list.findIndex((s) => s.name === name);
    if (existing >= 0) list[existing] = scene;
    else list.push(scene);
    if (!storeLocalScenes(list)) return;
    activeSceneName = name;
    renderScenes();
    showToast(existing >= 0 ? `Updated scene: ${name}` : `Saved scene: ${name}`, "ok", 2500);
  }

  function deleteScene(name) {
    storeLocalScenes(loadLocalScenes().filter((s) => s.name !== name));
    if (activeSceneName === name) activeSceneName = null;
    renderScenes();
    showToast(`Deleted scene: ${name}`, "info", 2500);
  }

  function exportScenes() {
    const scenes = allScenes().map(({ name, savedAt, values }) => ({ name, savedAt, values }));
    if (!scenes.length) {
      showToast("No scenes to export yet.", "info", 3000);
      return;
    }
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), scenes }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scenes.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast("Exported scenes.json — put it in the project folder and push to share it.", "ok", 6000);
  }

  function escapeText(t) {
    return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function renderScenes() {
    const box = document.getElementById("cpScenes");
    if (!box) return;
    const scenes = allScenes();
    if (!scenes.length) {
      box.innerHTML = `<p class="cp-note">No scenes yet — set up a look, name it below and save.</p>`;
      return;
    }
    box.innerHTML = scenes
      .map((s, i) => {
        const key = i < 9 ? `<kbd>${i + 1}</kbd>` : `<kbd aria-hidden="true"> </kbd>`;
        const active = s.name === activeSceneName;
        return (
          `<div class="cp-scene">` +
          `<button type="button" class="cp-scene-go" data-i="${i}" aria-pressed="${active}">${key}` +
          `<span>${escapeText(s.name)}</span>${s.shared ? `<small>shared</small>` : ""}</button>` +
          `<button type="button" class="cp-scene-share" data-i="${i}" aria-label="Share scene ${escapeText(s.name)}" title="Share — link and QR code">${iconSvg("qr_code_2", 20)}</button>` +
          (s.shared
            ? ""
            : `<button type="button" class="cp-scene-del" data-name="${escapeText(s.name)}" aria-label="Delete scene ${escapeText(s.name)}">${iconSvg("close", 18)}</button>`) +
          `</div>`
        );
      })
      .join("");
  }

  function initScenes() {
    const box = document.getElementById("cpScenes");
    if (!box) return;

    // The old single Save/Load slot becomes the first scene, once.
    if (!loadLocalScenes().length) {
      try {
        const raw = localStorage.getItem(CONFIG.SETTINGS_STORAGE_KEY);
        if (raw) {
          const old = JSON.parse(raw);
          if (old && old.values) storeLocalScenes([{ name: "Saved preset", savedAt: old.savedAt || Date.now(), values: old.values }]);
        }
      } catch (e) {
        /* nothing to bring across */
      }
    }

    box.addEventListener("click", (e) => {
      const share = e.target.closest(".cp-scene-share");
      if (share) {
        shareScene(allScenes()[parseInt(share.dataset.i, 10)]);
        return;
      }
      const del = e.target.closest(".cp-scene-del");
      if (del) {
        deleteScene(del.dataset.name);
        return;
      }
      const go = e.target.closest(".cp-scene-go");
      if (go) applySceneByIndex(parseInt(go.dataset.i, 10));
    });

    const nameInput = document.getElementById("cpSceneName");
    const save = () => {
      saveScene(nameInput ? nameInput.value : "");
      if (nameInput) nameInput.value = "";
    };
    const saveBtn = document.getElementById("cpSceneSave");
    if (saveBtn) saveBtn.addEventListener("click", save);
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") save();
      });
    }
    const exportBtn = document.getElementById("cpSceneExport");
    if (exportBtn) exportBtn.addEventListener("click", exportScenes);

    // Changing anything by hand means you're no longer exactly "on" a scene.
    const panel = document.getElementById("controls");
    const unmark = (e) => {
      if (applyingScene || !activeSceneName) return;
      if (e.target && e.target.id && e.target.id.startsWith("ctrl")) {
        activeSceneName = null;
        renderScenes();
      }
    };
    panel.addEventListener("input", unmark);
    panel.addEventListener("change", unmark);

    renderScenes();

    // Shared scenes from the project folder (absent = fine, none shared).
    fetch(`scenes.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = data && Array.isArray(data.scenes) ? data.scenes : [];
        sharedScenes = list.filter((s) => s && s.name && s.values);
        renderScenes();
      })
      .catch(() => {
        /* no shared scenes file (or file://) */
      });
  }

  // ---------------------------------------------------------------------
  // SHARE A SCENE — link + QR code
  // ---------------------------------------------------------------------
  // A link that opens the app in a given scene: …/?scene=<code>. The code
  // holds only the settings that differ from the defaults (usually 10–30),
  // compressed where the browser can, so the link stays short enough for a
  // QR code that scans easily off a screen. Opening the link applies the
  // scene and adds it to that browser's scenes. The link carries no
  // ?stage=, so a phone opens it in the phone layout.
  //
  // QR drawing: qrcode-generator (MIT, vendor/qrcode.min.js), loaded only
  // the first time Share is pressed, so it costs nothing otherwise.
  const BOOL_TYPES = ["switch", "chip", "palette-on", "hidden"];

  function sceneDiff(values) {
    const out = {};
    for (const s of PRS.SETTINGS) {
      const v = values[s.id];
      if (!v) continue;
      const key = s.id.replace(/^ctrl/, "");
      if (BOOL_TYPES.includes(s.type)) {
        const on = !!v.checked;
        if (on !== !!s.default) out[key] = on ? 1 : 0;
      } else {
        const val = s.type === "range" ? Number(v.value) : v.value;
        if (String(val).toLowerCase() !== String(s.default).toLowerCase()) out[key] = val;
      }
    }
    return out;
  }

  // Full control state: every setting at its default, then the scene's
  // differences on top — so the receiver sees exactly the shared look,
  // whatever they had set before.
  function sceneValuesFromDiff(diff) {
    const values = {};
    for (const s of PRS.SETTINGS) {
      values[s.id] = BOOL_TYPES.includes(s.type) ? { checked: !!s.default } : { value: String(s.default) };
    }
    for (const [key, v] of Object.entries(diff || {})) {
      const s = SET[`ctrl${key}`];
      if (!s) continue; // a setting this version doesn't have — skip
      values[s.id] = BOOL_TYPES.includes(s.type) ? { checked: !!v } : { value: String(v) };
    }
    return values;
  }

  const b64urlEncode = (bytes) => {
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64urlDecode = (str) => {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  };

  async function encodeScene(scene) {
    const json = JSON.stringify({ n: scene.name, v: sceneDiff(scene.values) });
    const raw = new TextEncoder().encode(json);
    if (window.CompressionStream) {
      try {
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        const packed = new Uint8Array(await new Response(stream).arrayBuffer());
        if (packed.length < raw.length) return "z" + b64urlEncode(packed);
      } catch (e) {
        /* fall back to uncompressed */
      }
    }
    return "j" + b64urlEncode(raw);
  }

  async function decodeScene(code) {
    const kind = code[0];
    let bytes = b64urlDecode(code.slice(1));
    if (kind === "z") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (kind !== "j") {
      throw new Error("not a scene link");
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || !data.n) throw new Error("scene link is incomplete");
    return { name: String(data.n).slice(0, 40), values: sceneValuesFromDiff(data.v) };
  }

  async function sceneLink(scene) {
    const url = new URL(location.href);
    url.search = ""; // no ?stage= etc. — opens in the receiving device's default layout
    url.hash = "";
    url.pathname = url.pathname.replace(/index\.html$/, "");
    url.searchParams.set("scene", await encodeScene(scene));
    return url.toString();
  }

  let qrLibPromise = null;
  function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLibPromise) {
      qrLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "vendor/qrcode.min.js";
        s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("QR library missing")));
        s.onerror = () => {
          qrLibPromise = null;
          reject(new Error("couldn't load vendor/qrcode.min.js"));
        };
        document.head.appendChild(s);
      });
    }
    return qrLibPromise;
  }

  function shareDialog() {
    let dlg = document.getElementById("shareDialog");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "shareDialog";
    dlg.setAttribute("aria-labelledby", "shareTitle");
    dlg.innerHTML =
      `<div class="sd-head"><h2 id="shareTitle">Share scene</h2>` +
      `<button type="button" class="sd-close" aria-label="Close">${iconSvg("close", 22)}</button></div>` +
      `<div class="sd-qr" id="shareQr" role="img" aria-label="QR code for the scene link"></div>` +
      `<p class="sd-note" id="shareNote">Point a phone camera at the code to open this look.</p>` +
      `<label class="sd-label" for="shareLink">Link</label>` +
      `<div class="sd-row"><input type="text" id="shareLink" readonly>` +
      `<button type="button" class="sd-copy" id="shareCopy">${iconSvg("content_copy", 20)}<span>Copy link</span></button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector(".sd-close").addEventListener("click", () => dlg.close());
    // Click on the dimmed backdrop closes it too.
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
    dlg.querySelector("#shareCopy").addEventListener("click", async () => {
      const input = dlg.querySelector("#shareLink");
      try {
        await navigator.clipboard.writeText(input.value);
        showToast("Link copied.", "ok", 2500);
      } catch (e) {
        input.select();
        showToast("Press Cmd/Ctrl + C to copy the selected link.", "info", 4000);
      }
    });
    return dlg;
  }

  async function shareScene(scene) {
    if (!scene) return;
    const dlg = shareDialog();
    dlg.querySelector("#shareTitle").textContent = `Share: ${scene.name}`;
    const link = await sceneLink(scene);
    dlg.querySelector("#shareLink").value = link;
    const qrBox = dlg.querySelector("#shareQr");
    const note = dlg.querySelector("#shareNote");
    qrBox.innerHTML = "";
    if (!dlg.open) dlg.showModal();
    try {
      const qrcode = await loadQrLib();
      const qr = qrcode(0, "M"); // auto size, medium error correction
      qr.addData(link);
      qr.make();
      qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
      const modules = qr.getModuleCount();
      note.textContent =
        modules > 77
          ? "This scene changes a lot of settings, so the code is dense — if a phone struggles to scan it, send the link instead."
          : "Point a phone camera at the code to open this look.";
    } catch (e) {
      note.textContent = `Couldn't draw the QR code (${e.message}) — the link still works.`;
    }
  }

  // Opening a ?scene= link: apply it, keep it in this browser's scenes,
  // and tidy the address so a reload doesn't re-add it.
  async function openSharedSceneFromUrl() {
    const code = new URLSearchParams(location.search).get("scene");
    if (!code) return;
    try {
      const scene = await decodeScene(code);
      const list = loadLocalScenes();
      if (!list.some((s) => s.name === scene.name)) {
        list.push({ name: scene.name, savedAt: Date.now(), values: scene.values });
        storeLocalScenes(list);
      }
      applyScene(scene);
      showToast(`Scene “${scene.name}” — saved to your scenes`, "ok", 4000);
    } catch (e) {
      showToast(`Couldn't open that scene link (${e.message}).`, "error", 8000);
    }
    const clean = new URL(location.href);
    clean.searchParams.delete("scene");
    history.replaceState(null, "", clean.toString());
  }

  async function boot() {
    // Build the controls panel from settings.js before anything looks for
    // its inputs.
    PRS.buildPanel(document.getElementById("controls"), { mode: "display" });
    buildTouchBar();
    const diagClose = document.getElementById("diagClose");
    if (diagClose) {
      diagClose.innerHTML = iconSvg("close", 20);
      diagClose.addEventListener("click", (e) => {
        e.stopPropagation();
        const diag = document.getElementById("diagnostics");
        if (diag) diag.classList.add("hidden");
      });
    }
    setText("diagVersion", APP_VERSION);
    resetControlsToDefaults();
    wireControls();
    initPanel();
    initScenes();
    startPreviewPan();
    window.addEventListener("resize", scheduleStageRebuild);
    document.addEventListener("fullscreenchange", scheduleStageRebuild);
    watchDevicePixelRatio();
    setText("diagStage", describeStage(null));
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
    const resumeMode = new URLSearchParams(location.search).get("resume");
    if (resumeMode === "1") {
      applyResumeSettings();
    } else if (resumeMode === "profile") {
      // Arrived from the panel's Profile dropdown — carry settings over once.
      applyResumeSettings(PROFILE_CARRY_KEY);
      try {
        localStorage.removeItem(PROFILE_CARRY_KEY);
      } catch (e) {
        /* nothing to clean up */
      }
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("resume");
      history.replaceState(null, "", cleanUrl.toString());
    }

    // Opened from a shared scene link / QR code (?scene=…).
    openSharedSceneFromUrl();

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
