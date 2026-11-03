/*
 * Spot (generative image processing) — settings.js
 *
 * THE ONE PLACE every control is defined. Shared by index.html (the
 * display) and controls.html (the remote page), loaded before app.js /
 * controls.js.
 *
 *   SETTINGS — one entry per setting: its type, label, help text, range,
 *              default, and which value in app.js's `params` it drives.
 *   LAYOUT   — which tab / section / card each setting sits in, plus the
 *              display-only extras (buttons, notes, links).
 *   buildPanel() turns those two into the panel's HTML; enhancePanel()
 *   adds the generic behaviour (tabs, cards, chips, two-handle sliders).
 *
 * Adding a setting = one SETTINGS entry + its id in LAYOUT (+ a matching
 * key in app.js's params if it's new engine state). Defaults, the value
 * labels, reset-on-load, presets and the remote page all follow from that.
 *
 * Setting ids keep their original "ctrl…" names: saved presets and the
 * remote page key everything by these, so renaming one would orphan
 * existing saves.
 *
 * Fields:
 *   id       element id (also the preset/remote key)
 *   type     switch | range | select | color | chip | palette-on | hidden
 *   label    visible label (also the screen-reader name)
 *   help     hover text, optional
 *   default  starting value (bool for switches, number, string)
 *   min/max/step   ranges
 *   int      range value is an integer (parseInt instead of parseFloat)
 *   format   how the value label reads: seconds | px | percent | fixed2 |
 *            int | moveH | moveV | moveZ
 *   centre   range fills from the middle (0 = off, sign = direction)
 *   param    dotted path in app.js `params` this sets (optional)
 *   after    named action app.js runs after a change (optional)
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------------------
  const SETTINGS = [
    // Source
    { id: "ctrlLiveMode", type: "switch", label: "Live student photos", default: false, after: "liveMode",
      help: "Off = the curated assets/demo/ folder. On = the live pool — Drive if configured, otherwise assets/seeds/ (the Image uploader's folder). Same as L." },
    { id: "ctrlCamera", type: "switch", label: "Live camera", default: false, after: "camera",
      help: "This computer's camera live through the effects. Nothing is recorded or uploaded. Same as V." },

    // Effects in rotation (Untouched is the all-off switch — see app.js)
    { id: "ctrlEffectNone", type: "hidden", label: "Untouched", default: false, param: "enabledEffects.none", after: "effectRotation" },
    { id: "ctrlEffectDuotone", type: "hidden", label: "Duotone", default: true, param: "enabledEffects.duotone", after: "effectRotation" },
    { id: "ctrlEffectPixelate", type: "switch", label: "Pixelate", default: true, param: "enabledEffects.pixelate", after: "effectRotation" },
    { id: "ctrlEffectHalftone", type: "switch", label: "Halftone", default: true, param: "enabledEffects.halftone", after: "effectRotation" },
    { id: "ctrlEffectAscii", type: "switch", label: "ASCII", default: true, param: "enabledEffects.ascii", after: "effectRotation" },

    // Pixelate
    { id: "ctrlPixelateMin", type: "range", label: "Pixelate cell size minimum", min: 2, max: 128, step: 1, default: 7, int: true, format: "px", param: "pixelateMin" },
    { id: "ctrlPixelateMax", type: "range", label: "Pixelate cell size maximum", min: 2, max: 128, step: 1, default: 17, int: true, format: "px", param: "pixelateMax" },
    { id: "ctrlPixelateAnimate", type: "switch", label: "Animate size", default: false, param: "pixelateAnimate",
      help: "Bounces cell size up/down while the frame is on screen" },
    { id: "ctrlPixelateRandomCellSize", type: "switch", label: "Uneven cells", default: false, param: "pixelateRandomCellSize",
      help: "Each block rerolls its own size" },

    // Halftone
    { id: "ctrlHalftoneMin", type: "range", label: "Halftone dot grid minimum", min: 6, max: 32, step: 1, default: 6, int: true, format: "px", param: "halftoneMin" },
    { id: "ctrlHalftoneMax", type: "range", label: "Halftone dot grid maximum", min: 6, max: 32, step: 1, default: 11, int: true, format: "px", param: "halftoneMax" },
    { id: "ctrlHalftoneRandomCellSize", type: "switch", label: "Uneven dots", default: false, param: "halftoneRandomCellSize",
      help: "Dots at the same brightness vary in size" },

    // ASCII
    { id: "ctrlAsciiMin", type: "range", label: "ASCII character size minimum", min: 8, max: 40, step: 1, default: 12, int: true, format: "px", param: "asciiMin" },
    { id: "ctrlAsciiMax", type: "range", label: "ASCII character size maximum", min: 8, max: 40, step: 1, default: 24, int: true, format: "px", param: "asciiMax" },
    { id: "ctrlAsciiRamp", type: "select", label: "Characters", default: "density", param: "asciiRampStyle",
      options: [["density", "Density  .:-=+*#%@"], ["blocks", "Blocks  ░▒▓█"], ["binary", "Binary  space / #"]] },
    { id: "ctrlAsciiRampRandomize", type: "switch", label: "Random characters each image", default: false, param: "randomizeAsciiRamp" },
    { id: "ctrlAsciiAnimate", type: "switch", label: "Flicker characters", default: true, param: "asciiAnimate",
      help: "Swaps glyphs of the same weight in place" },
    { id: "ctrlAsciiRandomCellSize", type: "switch", label: "Uneven characters", default: false, param: "asciiRandomCellSize" },

    // Colour — palettes (highlights / shadows / in rotation)
    { id: "ctrlPalette1Fg", type: "color", label: "Palette 1 highlights", default: "#00ff00", param: "palettes.0.fg" },
    { id: "ctrlPalette1Bg", type: "color", label: "Palette 1 shadows", default: "#002fa7", param: "palettes.0.bg" },
    { id: "ctrlPalette1Enabled", type: "palette-on", label: "1", default: true, param: "paletteEnabled.0" },
    { id: "ctrlPalette2Fg", type: "color", label: "Palette 2 highlights", default: "#00ffff", param: "palettes.1.fg" },
    { id: "ctrlPalette2Bg", type: "color", label: "Palette 2 shadows", default: "#6a0dad", param: "palettes.1.bg" },
    { id: "ctrlPalette2Enabled", type: "palette-on", label: "2", default: true, param: "paletteEnabled.1" },
    { id: "ctrlPalette3Fg", type: "color", label: "Palette 3 highlights", default: "#ffff00", param: "palettes.2.fg" },
    { id: "ctrlPalette3Bg", type: "color", label: "Palette 3 shadows", default: "#99000d", param: "palettes.2.bg" },
    { id: "ctrlPalette3Enabled", type: "palette-on", label: "3", default: true, param: "paletteEnabled.2" },
    { id: "ctrlPalette4Fg", type: "color", label: "Palette 4 highlights", default: "#ff00ff", param: "palettes.3.fg" },
    { id: "ctrlPalette4Bg", type: "color", label: "Palette 4 shadows", default: "#00802b", param: "palettes.3.bg" },
    { id: "ctrlPalette4Enabled", type: "palette-on", label: "4", default: true, param: "paletteEnabled.3" },
    { id: "ctrlPaletteRandomize", type: "switch", label: "Random palette each image", default: false, param: "randomizePalette" },
    { id: "ctrlPaletteSafeMode", type: "switch", label: "Skip low-contrast pairs", default: false, param: "paletteSafeMode",
      help: "Skips palettes whose two colours are too close in brightness to read" },

    // Colour — shimmer
    { id: "ctrlAnimatePaletteColor", type: "switch", label: "Shimmer palettes per cell", default: false, param: "animatePaletteColor",
      help: "Cells in Pixelate, Halftone and ASCII roll their own random palette on every animation tick" },
    { id: "ctrlAnimatePaletteDensityMin", type: "range", label: "Shimmer coverage minimum", min: 0, max: 100, step: 1, default: 0, int: true, format: "percent", param: "animatePaletteDensityMin" },
    { id: "ctrlAnimatePaletteDensityMax", type: "range", label: "Shimmer coverage maximum", min: 0, max: 100, step: 1, default: 20, int: true, format: "percent", param: "animatePaletteDensityMax" },

    // Colour — whole screen
    { id: "ctrlBackground", type: "color", label: "Background colour", default: "#000000", param: "backgroundColor", after: "background",
      help: "Shows in the gaps between images (Strip, Roam, echo trail) and around the picture" },
    { id: "ctrlSaturation", type: "range", label: "Saturation", min: 0, max: 200, step: 1, default: 100, int: true, format: "percent", param: "saturation", after: "lookFilter" },
    { id: "ctrlContrast", type: "range", label: "Contrast", min: 0, max: 200, step: 1, default: 100, int: true, format: "percent", param: "contrast", after: "lookFilter" },

    // Motion — timing & transitions
    { id: "ctrlSpeedMin", type: "range", label: "Hold time minimum", min: 0.1, max: 20, step: 0.1, default: 2.5, format: "seconds", param: "holdMin" },
    { id: "ctrlSpeedMax", type: "range", label: "Hold time maximum", min: 0.1, max: 20, step: 0.1, default: 9, format: "seconds", param: "holdMax" },
    { id: "ctrlAutoCycle", type: "switch", label: "Auto-advance", default: true, after: "autoCycle",
      help: "Same as P / the pause button" },
    { id: "ctrlApplyNow", type: "switch", label: "Apply changes straight away", default: false, param: "applyNow",
      help: "For demoing: each change redraws the picture on screen at once. Off = changes wait for the next image, for smooth sequencing. Same as N." },
    { id: "ctrlCrossfadeEnabled", type: "switch", label: "Crossfade", default: true, param: "crossfadeEnabled", after: "lookDiagnostic",
      help: "Off = hard cut between images" },
    { id: "ctrlOpacity", type: "range", label: "Layer opacity", min: 0.1, max: 1, step: 0.01, default: 1, format: "fixed2", param: "opacity" },

    // Motion — Move
    { id: "ctrlMovePanSpeed", type: "range", label: "Pan", min: -100, max: 100, step: 1, default: 0, int: true, format: "moveH", centre: true, param: "movePanSpeed" },
    { id: "ctrlMoveTiltSpeed", type: "range", label: "Tilt", min: -100, max: 100, step: 1, default: 0, int: true, format: "moveV", centre: true, param: "moveTiltSpeed" },
    { id: "ctrlMoveZoomSpeed", type: "range", label: "Zoom", min: -100, max: 100, step: 1, default: 0, int: true, format: "moveZ", centre: true, param: "moveZoomSpeed" },
    { id: "ctrlMoveRandomize", type: "switch", label: "Random move each image", default: false, param: "moveRandomize",
      help: "Every image rolls its own random direction and speed per axis, leaving the sliders where they are" },
    { id: "ctrlMoveEnd", type: "select", label: "At the edge", default: "strip", param: "moveEndMode",
      help: "What happens when the picture reaches the end of its travel",
      options: [["strip", "Strip — new images follow on"], ["mirror", "Keep going — mirrored repeat"], ["tile", "Keep going — repeat"], ["next", "Next image arrives"], ["stop", "Stop"]] },
    { id: "ctrlStripLayers", type: "range", label: "Strip layers", min: 1, max: 3, step: 1, default: 1, int: true, format: "int", param: "stripLayers",
      help: "How many strips run at once, overlapping" },
    { id: "ctrlStripRelation", type: "select", label: "Layers move", default: "opposing", param: "stripRelation",
      options: [["opposing", "Opposite ways"], ["parallax", "Same way, different speeds"], ["crossing", "Crossing — across and up/down"], ["random", "Random"]] },
    { id: "ctrlStripBlend", type: "select", label: "Layers combine", default: "screen", param: "stripBlend",
      options: [["screen", "Screen — lighten"], ["multiply", "Multiply — darken"], ["difference", "Difference"], ["overlay", "Overlay"], ["exclusion", "Exclusion"], ["normal", "Normal — on top"]] },
    { id: "ctrlStripOpacity", type: "range", label: "Layer opacity", min: 0.1, max: 1, step: 0.05, default: 0.7, format: "fixed2", param: "stripOpacity" },
    { id: "ctrlStripGap", type: "range", label: "Gap between images", min: 0, max: 100, step: 1, default: 0, int: true, format: "percent", param: "stripGap",
      help: "Dark space between images in the strip, as a share of the screen — the echo trail shows in it" },
    { id: "ctrlRoamOn", type: "switch", label: "Roam on", default: false, param: "roamOn" },
    { id: "ctrlRoamCount", type: "range", label: "Images at once", min: 1, max: 24, step: 1, default: 4, int: true, format: "int", param: "roamCount",
      help: "How many images wander at the same time, overlapping" },
    { id: "ctrlRoamSize", type: "range", label: "Size", min: 0.1, max: 1, step: 0.05, default: 0.35, format: "fixed2", param: "roamSize",
      help: "How big each image is, as a share of the screen (each varies a little)" },
    { id: "ctrlRoamSpeed", type: "range", label: "Travel speed", min: 0, max: 100, step: 5, default: 40, int: true, format: "int", param: "roamSpeed",
      help: "How fast each image crosses the screen (about the same scale as Pan / Tilt). 0 holds them still" },
    { id: "ctrlRoamSpin", type: "range", label: "Spin speed", min: -100, max: 100, step: 5, default: 0, int: true, format: "int", centre: true, param: "roamSpin",
      help: "How fast each image turns. Negative = anticlockwise, 0 keeps them from turning" },
    { id: "ctrlRoamAngle", type: "range", label: "Heading", min: 0, max: 359, step: 1, default: 90, int: true, format: "compass", param: "roamAngle",
      help: "Which way they travel: north is up, east is right, south is down, west is left" },
    { id: "ctrlRoamSpread", type: "range", label: "Together ↔ Wandering", min: 0, max: 180, step: 1, default: 180, int: true, format: "roamSpread", param: "roamSpread",
      help: "0: every image heads the same way. Higher: they stray further from the heading. Far end: each image goes its own way and slowly curves" },
    { id: "ctrlRoamBreath", type: "range", label: "Swell", min: 0, max: 100, step: 1, default: 40, int: true, format: "percent", param: "roamBreath",
      help: "How much each image slowly grows and shrinks" },
    { id: "ctrlEchoOn", type: "switch", label: "Echo trail on", default: false, param: "echoOn" },
    { id: "ctrlEchoMode", type: "select", label: "Style", default: "even", param: "echoMode",
      help: "Moving pictures leave fading echoes of themselves, like a brush smear",
      options: [["even", "Even echoes"], ["ragged", "Ragged — dry brush"], ["smear", "Smooth smear"]] },
    { id: "ctrlEchoLength", type: "range", label: "Trail length", min: 0, max: 100, step: 1, default: 60, int: true, format: "percent", param: "echoLength" },
    { id: "ctrlEchoStrength", type: "range", label: "Trail strength", min: 0, max: 100, step: 1, default: 60, int: true, format: "percent", param: "echoStrength" },
    { id: "ctrlEchoSpacing", type: "range", label: "Echo spacing", min: 2, max: 50, step: 1, default: 12, int: true, format: "percent", param: "echoSpacing",
      help: "Even and ragged: how far the picture travels between echoes (share of the screen height)" },
    { id: "ctrlEchoBlend", type: "select", label: "Trail blend", default: "lighten", param: "echoBlend",
      help: "How the echoes sit over the picture",
      options: [["behind", "Behind — gaps only"], ["lighten", "Lighten — gaps and shadows"], ["screen", "Screen — glow over everything"], ["source-over", "Normal — see-through ghost"], ["difference", "Difference — inverted edges"]] },
    // Motion — 3D forms (photos wrapped round 3D shapes, drawn with WebGL)
    { id: "ctrlFormsOn", type: "switch", label: "3D forms on", default: false, param: "formsOn", after: "forms3d" },
    { id: "ctrlFormsShape", type: "select", label: "Shape", default: "form", param: "formsShape", after: "forms3d",
      options: [["form", "Form — geometric to organic"], ["rock", "Rock — built from triangles"]] },
    { id: "ctrlFormsOrganic", type: "range", label: "Geometric ↔ Organic, from", min: 0, max: 100, step: 5, default: 0, int: true, format: "formName", param: "formsOrganic" },
    { id: "ctrlFormsOrganicMax", type: "range", label: "Geometric ↔ Organic, to", min: 0, max: 100, step: 5, default: 55, int: true, format: "formName", param: "formsOrganicMax" },
    { id: "ctrlFormsRock", type: "range", label: "Triangles ↔ Rock, from", min: 0, max: 100, step: 5, default: 0, int: true, format: "rockName", param: "formsRock" },
    { id: "ctrlFormsRockMax", type: "range", label: "Triangles ↔ Rock, to", min: 0, max: 100, step: 5, default: 70, int: true, format: "rockName", param: "formsRockMax" },
    { id: "ctrlFormsDrift", type: "switch", label: "Drift slowly across the range", default: false, param: "formsDrift" },
    { id: "ctrlFormsCount", type: "range", label: "How many", min: 1, max: 24, step: 1, default: 6, int: true, format: "int", param: "formsCount", after: "forms3d" },
    { id: "ctrlFormsSpacing", type: "range", label: "Spacing", min: 4, max: 90, step: 1, default: 45, int: true, format: "degrees", param: "formsSpacing",
      help: "Degrees round the room between neighbours — small values overlap" },
    { id: "ctrlFormsSize", type: "range", label: "Size", min: 15, max: 100, step: 1, default: 55, int: true, format: "percent", param: "formsSize" },
    { id: "ctrlFormsDepth", type: "range", label: "Near / far spread", min: 0, max: 100, step: 1, default: 40, int: true, format: "percent", param: "formsDepth",
      help: "Pushes some forms closer, so overlaps stack instead of merging" },
    { id: "ctrlFormsTravel", type: "range", label: "Travel round the room", min: 0, max: 100, step: 1, default: 20, int: true, format: "percent", param: "formsTravel" },
    { id: "ctrlFormsSpin", type: "range", label: "Spin", min: 0, max: 100, step: 1, default: 30, int: true, format: "percent", param: "formsSpin" },
    { id: "ctrlFormsWrap", type: "select", label: "Wrap", default: "globe", param: "formsWrap",
      options: [["globe", "Globe — from the centre"], ["tube", "Tube — like a label"], ["box", "Box — front, side, top"]] },
    { id: "ctrlFormsShade", type: "range", label: "Shading", min: 0, max: 100, step: 1, default: 55, int: true, format: "percent", param: "formsShade" },
    { id: "ctrlFormsSurface", type: "select", label: "Surface", default: "photo", param: "formsSurface", after: "forms3d",
      help: "Photo: the shapes wear the images. Glass lens: they magnify and bend the picture behind them",
      options: [["photo", "Photo — wears the images"], ["glass", "Glass lens — bends the picture behind"]] },
    { id: "ctrlFormsLiquid", type: "range", label: "Lens ↔ Liquid", min: 0, max: 100, step: 5, default: 50, int: true, format: "glassName", param: "formsLiquid",
      help: "Lens: the shape magnifies the picture behind it. Liquid: it bends the picture at its edges" },
    { id: "ctrlFormsRim", type: "range", label: "Edge glow", min: 0, max: 100, step: 1, default: 60, int: true, format: "percent", param: "formsRim",
      help: "Bright glassy edge that lifts the shape off the background" },
    { id: "ctrlFormsFringe", type: "switch", label: "Colour fringes", default: false, param: "formsFringe",
      help: "Rainbow split at the edges, like a real lens — adds colours outside the palette" },
    { id: "ctrlFormsBehind", type: "select", label: "Behind the forms", default: "black", param: "formsBehind", after: "forms3d",
      options: [["black", "Black"], ["picture", "The normal picture"]] },
    { id: "ctrlMoveSpeedMin", type: "range", label: "Random move strength minimum", min: 0, max: 100, step: 1, default: 20, int: true, format: "percent", param: "moveSpeedMin" },
    { id: "ctrlMoveSpeedMax", type: "range", label: "Random move strength maximum", min: 0, max: 100, step: 1, default: 80, int: true, format: "percent", param: "moveSpeedMax" },

    // Colour — Blend overlay
    { id: "ctrlBlendOverlay", type: "switch", label: "Blend overlay on", default: false, param: "blendOverlayEnabled" },
    { id: "ctrlBlendModeMultiply", type: "chip", label: "Multiply", default: true, param: "enabledBlendModes.multiply" },
    { id: "ctrlBlendModeScreen", type: "chip", label: "Screen", default: true, param: "enabledBlendModes.screen" },
    { id: "ctrlBlendModeOverlay", type: "chip", label: "Overlay", default: false, param: "enabledBlendModes.overlay" },
    { id: "ctrlBlendModeDarken", type: "chip", label: "Darken", default: false, param: "enabledBlendModes.darken" },
    { id: "ctrlBlendModeLighten", type: "chip", label: "Lighten", default: false, param: "enabledBlendModes.lighten" },
    { id: "ctrlBlendModeDifference", type: "chip", label: "Difference", default: false, param: "enabledBlendModes.difference" },
    { id: "ctrlBlendModeExclusion", type: "chip", label: "Exclusion", default: false, param: "enabledBlendModes.exclusion" },
    { id: "ctrlBlendModeHardLight", type: "chip", label: "Hard light", default: false, param: "enabledBlendModes.hard-light" },
    { id: "ctrlBlendLayers", type: "range", label: "Layers", min: 1, max: 4, step: 1, default: 1, int: true, format: "int", param: "blendLayers" },
    { id: "ctrlRandomBlendLayers", type: "switch", label: "Random layer count", default: false, param: "randomizeBlendLayers",
      help: "Re-rolls 1 to the slider's value each image" },

    // Show
    { id: "ctrlStartUnchanged", type: "switch", label: "First image plain", default: false, param: "startUnchanged",
      help: "The first image after the page loads is always a plain photo" },
  ];

  const byId = {};
  for (const s of SETTINGS) byId[s.id] = s;

  // ---------------------------------------------------------------------
  // LAYOUT — tabs > sections / cards > items
  // ---------------------------------------------------------------------
  // Items: a setting id, or { dual: [minId, maxId], label }, { chips:
  // [ids] } (chips holding their own checkbox), { proxyChips: [ids] }
  // (chips that flip a checkbox elsewhere), { palettes: true }, { note },
  // { widget } (display-page-only extras built in widgetHtml below).
  const LAYOUT = [
    { tab: "effects", label: "Effects", icon: "blur_on", blocks: [
      { section: "In rotation", items: [
        { proxyChips: ["ctrlEffectNone", "ctrlEffectDuotone", "ctrlEffectPixelate", "ctrlEffectHalftone", "ctrlEffectAscii"] },
        "ctrlEffectNone", "ctrlEffectDuotone",
        { note: "Untouched = plain photos only: switches every effect off. Duotone maps brightness onto the palette and has no settings of its own; its colours come from the Colour tab." },
      ] },
      { card: "Pixelate", summary: "cell size · animation", switch: "ctrlEffectPixelate", items: [
        { dual: ["ctrlPixelateMin", "ctrlPixelateMax"], label: "Cell size" },
        { note: "Handles apart: a random size each image. Handles together: one fixed size." },
        "ctrlPixelateAnimate", "ctrlPixelateRandomCellSize",
      ] },
      { card: "Halftone", summary: "dot grid", switch: "ctrlEffectHalftone", items: [
        { dual: ["ctrlHalftoneMin", "ctrlHalftoneMax"], label: "Dot grid" },
        "ctrlHalftoneRandomCellSize",
      ] },
      { card: "ASCII", summary: "characters · flicker", switch: "ctrlEffectAscii", items: [
        { dual: ["ctrlAsciiMin", "ctrlAsciiMax"], label: "Character size" },
        "ctrlAsciiRamp", "ctrlAsciiRampRandomize", "ctrlAsciiAnimate", "ctrlAsciiRandomCellSize",
      ] },
    ] },
    { tab: "colour", label: "Colour", icon: "palette", blocks: [
      { section: "Palettes", items: [
        { palettes: true },
        { note: "Tap a colour to change it; tap the number to take that palette in or out of rotation. Top = highlights, bottom = shadows." },
        "ctrlPaletteRandomize", "ctrlPaletteSafeMode",
      ] },
      { section: "Shimmer", items: [
        "ctrlAnimatePaletteColor",
        { dual: ["ctrlAnimatePaletteDensityMin", "ctrlAnimatePaletteDensityMax"], label: "Coverage" },
      ] },
      { section: "Whole screen", items: ["ctrlSaturation", "ctrlContrast", "ctrlBackground"] },
      { card: "Blend overlay", summary: "past frames on top", switch: "ctrlBlendOverlay", items: [
        { chips: ["ctrlBlendModeMultiply", "ctrlBlendModeScreen", "ctrlBlendModeOverlay", "ctrlBlendModeDarken",
          "ctrlBlendModeLighten", "ctrlBlendModeDifference", "ctrlBlendModeExclusion", "ctrlBlendModeHardLight"], label: "Modes" },
        "ctrlBlendLayers", "ctrlRandomBlendLayers",
        { note: "With Roam on, these modes also blend the roaming images where they overlap." },
      ] },
    ] },
    { tab: "motion", label: "Motion", icon: "animation", blocks: [
      { section: "Timing", items: [
        { dual: ["ctrlSpeedMin", "ctrlSpeedMax"], label: "Hold each image" },
      ] },
      { section: "Transitions", items: ["ctrlCrossfadeEnabled", "ctrlOpacity", { note: "The camera always hard-cuts." }] },
      { card: "Move", summary: "pan · tilt · zoom", summarize: "move", items: [
        { when: { id: "ctrlRoamOn", is: ["off"] }, items: ["ctrlMovePanSpeed", "ctrlMoveTiltSpeed", "ctrlMoveZoomSpeed"] },
        "ctrlMoveEnd",
        { when: { id: "ctrlRoamOn", is: ["off"] }, items: [
          "ctrlMoveRandomize",
          { when: { id: "ctrlMoveRandomize", is: ["on"] }, items: [
            { dual: ["ctrlMoveSpeedMin", "ctrlMoveSpeedMax"], label: "Random strength" },
          ] },
        ] },
      ] },
      // Only while Move "At the edge" is Strip.
      { card: "Strip", summary: "images follow on", summarize: "strip", when: { id: "ctrlMoveEnd", is: ["strip"] }, items: [
        "ctrlStripGap", "ctrlStripLayers",
        { when: { id: "ctrlStripLayers", not: ["1"] }, items: [
          "ctrlStripRelation", "ctrlStripBlend", "ctrlStripOpacity",
        ] },
      ] },
      { card: "Roam", summary: "off", summarize: "roam", switch: "ctrlRoamOn", items: [
        { when: { id: "ctrlRoamOn", is: ["off"] }, items: [
          { note: "Switch on: images wander freely and overlap, ignoring Pan / Tilt / Zoom. Set Move's \"At the edge\" to a repeat to make them wrap round the screen." },
        ] },
        { when: { id: "ctrlRoamOn", is: ["on"] }, items: [
          "ctrlRoamCount", "ctrlRoamSize",
          { pair: ["ctrlRoamSpeed", "ctrlRoamSpin"], label: "Travel & spin", xLabel: "travel speed", yKey: "spin (middle = none)", yTop: "↻ clockwise", yBottom: "↺ anticlockwise" },
          "ctrlRoamSpread",
          { when: { id: "ctrlRoamSpread", not: ["180"] }, items: ["ctrlRoamAngle"] },
          "ctrlRoamBreath",
          { note: "Move's \"At the edge\": a repeat option wraps images round the screen; the others let them leave and be replaced." },
        ] },
      ] },
      // Echo trail card hidden 30 Oct 2026 — open for review (see OPEN.md). Settings and engine kept.
    ] },
    { tab: "forms", label: "3D forms", icon: "view_in_ar", blocks: [
      { card: "3D forms", open: true, summary: "off", summarize: "forms", switch: "ctrlFormsOn", items: [
        { when: { id: "ctrlFormsOn", is: ["off"] }, items: [
          { note: "Switch on: each new image is wrapped round a 3D shape. On the Igloo they sit round all six walls." },
        ] },
        { when: { id: "ctrlFormsOn", is: ["on"] }, items: [
          "ctrlFormsShape",
          { when: { id: "ctrlFormsShape", is: ["form"] }, items: [{ dual: ["ctrlFormsOrganic", "ctrlFormsOrganicMax"], label: "Geometric ↔ Organic" }, { note: "Handles apart: each form lands somewhere between them. Together: all alike. 0 cube · 50 sphere · 100 blob." }] },
          { when: { id: "ctrlFormsShape", is: ["rock"] }, items: [{ dual: ["ctrlFormsRock", "ctrlFormsRockMax"], label: "Triangles ↔ Rock" }, { note: "Built from flat triangles. 0 is a three-sided pyramid; more triangles as it rises, then a rougher surface, up to a faceted rock. Handles apart: each rock lands somewhere between them. Together: all alike." }] },
          "ctrlFormsDrift",
          "ctrlFormsCount",
          { when: { id: "ctrlFormsCount", not: ["1"] }, items: ["ctrlFormsSpacing", "ctrlFormsDepth"] },
          "ctrlFormsSize", "ctrlFormsTravel", "ctrlFormsSpin",
          "ctrlFormsSurface",
          { when: { id: "ctrlFormsSurface", is: ["photo"] }, items: ["ctrlFormsWrap", "ctrlFormsShade"] },
          { when: { id: "ctrlFormsSurface", is: ["glass"] }, items: ["ctrlFormsLiquid", "ctrlFormsRim", "ctrlFormsFringe",
            { note: "With Behind: black, the glass becomes a window — the picture only shows through the shapes." }] },
          "ctrlFormsBehind",
        ] },
      ] },
    ] },
    { tab: "source", label: "Source", icon: "photo_library", group: "setup", blocks: [
      { section: "Image source", items: [
        { widget: "mine" },
        "ctrlLiveMode", "ctrlCamera",
        { note: "Off = the curated demo set. The front camera is mirrored; effects hard-cut while the camera is on." },
      ] },
    ] },
    { tab: "show", label: "Show", icon: "slideshow", group: "setup", blocks: [
      { section: "Scenes", displayOnly: true, items: [{ widget: "scenes" }] },
      { section: "Playback", items: ["ctrlAutoCycle", "ctrlApplyNow", "ctrlStartUnchanged"] },
      { section: "Stage", displayOnly: true, items: [{ widget: "profile" }] },
      { section: "Output", displayOnly: true, items: [{ widget: "output" }] },
      { section: "Phone remote", displayOnly: true, items: [{ widget: "remote" }] },
      { section: "Keyboard", displayOnly: true, className: "cp-keys-sec", items: [{ widget: "keys" }] },
      { card: "Tools & links", summary: "showreel · uploader · about", displayOnly: true, items: [{ widget: "tools" }] },
    ] },
  ];

  // ---------------------------------------------------------------------
  // ICONS — Google Material Symbols (Outlined, weight 300), Apache-2.0,
  // from @material-symbols/svg-300. Inlined so everything works offline.
  // ---------------------------------------------------------------------
  const ICONS = {
    qr_code_2: "M520-139.23v-76.16h76.15v76.16H520Zm-76.15-76.16v-188.46H520v188.46h-76.15Zm300.76-127.69V-480h76.16v136.92h-76.16ZM668.46-480v-76.15h76.15V-480h-76.15Zm-453.07 76.15V-480h76.15v76.15h-76.15ZM139.23-480v-76.15h76.16V-480h-76.16ZM480-744.61v-76.16h76.15v76.16H480ZM179.62-632.69h147.69v-147.69H179.62v147.69Zm-40.39 40.38v-228.46h228.46v228.46H139.23Zm40.39 412.69h150.77v-147.69H179.62v147.69Zm-40.39 40.39v-228.46h231.54v228.46H139.23Zm493.46-493.46h147.69v-147.69H632.69v147.69Zm-40.38 40.38v-228.46h228.46v228.46H592.31Zm76.15 453.08v-127.7h-76.15v-76.15h152.3v127.69h76.16v76.16H668.46ZM520-403.85V-480h148.46v76.15H520Zm-152.31 0V-480h-76.15v-76.15H520V-480h-76.15v76.15h-76.16Zm36.16-188.46v-152.3H480v76.15h76.15v76.15h-152.3Zm-178.08-86.54v-55.38h55.38v55.38h-55.38Zm2.69 450.39v-55.39h55.39v55.39h-55.39Zm450.39-450.39v-55.38h55.38v55.38h-55.38Z",
    content_copy: "M318.46-230.77q-23.53 0-40.61-17.08t-17.08-40.61v-513.85q0-23.53 17.08-40.61T318.46-860h393.85q23.52 0 40.61 17.08Q770-825.84 770-802.31v513.85q0 23.53-17.08 40.61-17.09 17.08-40.61 17.08H318.46Zm0-45.39h393.85q4.61 0 8.46-3.84 3.84-3.85 3.84-8.46v-513.85q0-4.61-3.84-8.46-3.85-3.84-8.46-3.84H318.46q-4.61 0-8.46 3.84-3.85 3.85-3.85 8.46v513.85q0 4.61 3.85 8.46 3.85 3.84 8.46 3.84ZM207.69-120q-23.52 0-40.61-17.08Q150-154.17 150-177.7v-559.22h45.39v559.22q0 4.62 3.84 8.47 3.85 3.84 8.46 3.84h439.23V-120H207.69Zm98.46-156.16v-538.45 538.45Z",
    photo_library: "M352.31-389.31h367.15L603.23-545.69l-103 132.31L433-496.15l-80.69 106.84Zm-73.85 158.54q-23.53 0-40.61-17.08t-17.08-40.61v-513.85q0-23.53 17.08-40.61T278.46-860h513.85q23.52 0 40.61 17.08Q850-825.84 850-802.31v513.85q0 23.53-17.08 40.61-17.09 17.08-40.61 17.08H278.46Zm0-45.39h513.85q4.61 0 8.46-3.84 3.84-3.85 3.84-8.46v-513.85q0-4.61-3.84-8.46-3.85-3.84-8.46-3.84H278.46q-4.61 0-8.46 3.84-3.85 3.85-3.85 8.46v513.85q0 4.61 3.85 8.46 3.85 3.84 8.46 3.84ZM167.69-120q-23.52 0-40.61-17.08Q110-154.17 110-177.7v-559.22h45.39v559.22q0 4.62 3.84 8.47 3.85 3.84 8.46 3.84h559.23V-120H167.69Zm98.46-694.61v538.45-538.45Z",
    blur_on: "M120.62-380.62q-8.62 0-14.62-5.94t-6-14.86q0-8.93 6-14.87 6-5.94 14.62-5.94 9 0 15 5.94t6 14.87q0 8.92-6 14.86-6 5.94-15 5.94Zm0-157.15q-8.62 0-14.62-5.94t-6-14.87q0-8.92 6-14.86 6-5.94 14.62-5.94 9 0 15 5.94t6 14.86q0 8.93-6 14.87-6 5.94-15 5.94Zm119.49 333.08q-14.97 0-25.19-10.12-10.23-10.12-10.23-25.08 0-14.97 10.12-25.19 10.12-10.23 25.08-10.23 14.97 0 25.19 10.12 10.23 10.12 10.23 25.08 0 14.97-10.12 25.19-10.12 10.23-25.08 10.23Zm0-161.23q-14.97 0-25.19-10.23-10.23-10.24-10.23-25.36 0-14.96 10.12-25.19 10.12-10.22 25.08-10.22 14.97 0 25.19 10.16 10.23 10.17 10.23 25.19 0 15.03-10.12 25.34t-25.08 10.31Zm0-157.16q-14.97 0-25.19-10.16-10.23-10.17-10.23-25.19 0-15.03 10.12-25.34t25.08-10.31q14.97 0 25.19 10.23 10.23 10.24 10.23 25.36 0 14.96-10.12 25.19-10.12 10.22-25.08 10.22Zm0-161.61q-14.97 0-25.19-10.12-10.23-10.12-10.23-25.08 0-14.97 10.12-25.19 10.12-10.23 25.08-10.23 14.97 0 25.19 10.12 10.23 10.12 10.23 25.08 0 14.97-10.12 25.19-10.12 10.23-25.08 10.23Zm161.4 332.84q-20.47 0-35.07-14.49-14.59-14.49-14.59-35.18 0-20.29 14.49-34.88 14.49-14.6 35.18-14.6 20.29 0 34.88 14.51 14.6 14.5 14.6 34.98 0 20.47-14.51 35.07-14.5 14.59-34.98 14.59Zm0-157.15q-20.47 0-35.07-14.51-14.59-14.5-14.59-34.98 0-20.47 14.49-35.07 14.49-14.59 35.18-14.59 20.29 0 34.88 14.49 14.6 14.49 14.6 35.18 0 20.29-14.51 34.88-14.5 14.6-34.98 14.6Zm.06 304.31q-15.03 0-25.34-10.12t-10.31-25.08q0-14.97 10.23-25.19 10.24-10.23 25.36-10.23 14.96 0 25.19 10.12 10.22 10.12 10.22 25.08 0 14.97-10.16 25.19-10.17 10.23-25.19 10.23Zm0-480q-15.03 0-25.34-10.12t-10.31-25.08q0-14.97 10.23-25.19 10.24-10.23 25.36-10.23 14.96 0 25.19 10.12 10.22 10.12 10.22 25.08 0 14.97-10.16 25.19-10.17 10.23-25.19 10.23Zm.05 584.69q-9 0-15-5.94t-6-14.87q0-8.92 6-14.86 6-5.95 15-5.95 8.61 0 14.61 5.95 6 5.94 6 14.86 0 8.93-6 14.87-6 5.94-14.61 5.94Zm0-718.38q-9 0-15-5.95-6-5.94-6-14.86 0-8.93 6-14.87 6-5.94 15-5.94 8.61 0 14.61 5.94t6 14.87q0 8.92-6 14.86-6 5.95-14.61 5.95Zm156.86 466.53q-20.29 0-34.88-14.49-14.6-14.49-14.6-35.18 0-20.29 14.51-34.88 14.5-14.6 34.98-14.6 20.47 0 35.07 14.51 14.59 14.5 14.59 34.98 0 20.47-14.49 35.07-14.49 14.59-35.18 14.59Zm0-157.15q-20.29 0-34.88-14.51-14.6-14.5-14.6-34.98 0-20.47 14.51-35.07 14.5-14.59 34.98-14.59 20.47 0 35.07 14.49 14.59 14.49 14.59 35.18 0 20.29-14.49 34.88-14.49 14.6-35.18 14.6Zm.01 304.31q-14.96 0-25.19-10.12-10.22-10.12-10.22-25.08 0-14.97 10.16-25.19 10.17-10.23 25.19-10.23 15.03 0 25.34 10.12t10.31 25.08q0 14.97-10.23 25.19-10.24 10.23-25.36 10.23Zm0-480q-14.96 0-25.19-10.12-10.22-10.12-10.22-25.08 0-14.97 10.16-25.19 10.17-10.23 25.19-10.23 15.03 0 25.34 10.12t10.31 25.08q0 14.97-10.23 25.19-10.24 10.23-25.36 10.23ZM562.85-100q-8.62 0-14.62-5.94t-6-14.87q0-8.92 6-14.86 6-5.95 14.62-5.95 9 0 15 5.95 6 5.94 6 14.86 0 8.93-6 14.87-6 5.94-15 5.94Zm-4.47-718.38q-8.61 0-14.61-5.95-6-5.94-6-14.86 0-8.93 6-14.87 6-5.94 14.61-5.94 9 0 15 5.94t6 14.87q0 8.92-6 14.86-6 5.95-15 5.95Zm161.73 613.69q-14.97 0-25.19-10.12-10.23-10.12-10.23-25.08 0-14.97 10.12-25.19 10.12-10.23 25.08-10.23 14.97 0 25.19 10.12 10.23 10.12 10.23 25.08 0 14.97-10.12 25.19-10.12 10.23-25.08 10.23Zm0-161.23q-14.97 0-25.19-10.23-10.23-10.24-10.23-25.36 0-14.96 10.12-25.19 10.12-10.22 25.08-10.22 14.97 0 25.19 10.16 10.23 10.17 10.23 25.19 0 15.03-10.12 25.34t-25.08 10.31Zm0-157.16q-14.97 0-25.19-10.16-10.23-10.17-10.23-25.19 0-15.03 10.12-25.34t25.08-10.31q14.97 0 25.19 10.23 10.23 10.24 10.23 25.36 0 14.96-10.12 25.19-10.12 10.22-25.08 10.22Zm0-161.61q-14.97 0-25.19-10.12-10.23-10.12-10.23-25.08 0-14.97 10.12-25.19 10.12-10.23 25.08-10.23 14.97 0 25.19 10.12 10.23 10.12 10.23 25.08 0 14.97-10.12 25.19-10.12 10.23-25.08 10.23Zm119.27 304.07q-9 0-15-5.94t-6-14.86q0-8.93 6-14.87 6-5.94 15-5.94 8.62 0 14.62 5.94t6 14.87q0 8.92-6 14.86-6 5.94-14.62 5.94Zm0-157.15q-9 0-15-5.94t-6-14.87q0-8.92 6-14.86 6-5.94 15-5.94 8.62 0 14.62 5.94t6 14.86q0 8.93-6 14.87-6 5.94-14.62 5.94Z",
    palette: "M479.23-100q-77.77 0-146.92-29.96-69.16-29.96-120.77-81.58-51.62-51.61-81.58-120.96T100-480q0-80.38 30.46-149.73t83.27-120.65q52.81-51.31 123.85-80.46Q408.62-860 489.38-860q74.39 0 141.54 24.77 67.16 24.77 117.96 69.08 50.81 44.3 80.96 105.15Q860-600.15 860-527.77q0 98.77-56.65 158.19-56.66 59.42-156.04 59.42h-73.08q-23.77 0-41 17.66Q516-274.85 516-251.69q0 29.69 14.69 47.15 14.69 17.46 14.69 40.54 0 30.69-17.15 47.34-17.15 16.66-49 16.66Zm.77-380Zm-229.54 19.85q16.92 0 29.81-12.89 12.88-12.88 12.88-29.81 0-16.92-12.88-29.8-12.89-12.89-29.81-12.89-16.92 0-29.81 12.89-12.88 12.88-12.88 29.8 0 16.93 12.88 29.81 12.89 12.89 29.81 12.89Zm124.46-167.31q16.93 0 29.81-12.89 12.88-12.88 12.88-29.8 0-16.93-12.88-29.81-12.88-12.89-29.81-12.89-16.92 0-29.8 12.89-12.89 12.88-12.89 29.81 0 16.92 12.89 29.8 12.88 12.89 29.8 12.89Zm210.16 0q16.92 0 29.8-12.89 12.89-12.88 12.89-29.8 0-16.93-12.89-29.81-12.88-12.89-29.8-12.89-16.93 0-29.81 12.89-12.88 12.88-12.88 29.81 0 16.92 12.88 29.8 12.88 12.89 29.81 12.89ZM713-460.15q16.92 0 29.81-12.89 12.88-12.88 12.88-29.81 0-16.92-12.88-29.8-12.89-12.89-29.81-12.89-16.92 0-29.81 12.89-12.88 12.88-12.88 29.8 0 16.93 12.88 29.81 12.89 12.89 29.81 12.89ZM479.23-145.39q11 0 15.89-4.5Q500-154.39 500-164q0-14-14.69-26.39-14.69-12.38-14.69-51.84 0-45.62 29.8-79.46 29.81-33.85 74.66-33.85h72.23q77.92 0 122.61-45.84 44.69-45.85 44.69-126.39 0-129.31-98.46-208.08-98.46-78.76-226.77-78.76-144.46 0-244.23 96.96-99.76 96.96-99.76 237.65 0 138.69 97.76 236.65 97.77 97.96 236.08 97.96Z",
    animation: "M355.54-100q-52.54 0-99.08-19.35-46.54-19.34-82.46-55.27-35.31-35.3-54.65-81.53Q100-302.39 100-355.54q0-75.38 39.58-137.92 39.58-62.54 107.04-92.23 19.23-42.39 51.65-75 32.42-32.62 76.04-52.69 30.08-68.31 91.15-107.46Q526.54-860 605.08-860q52.53 0 98.77 19.35 46.23 19.34 81.53 55.27 34.93 36.3 54.77 82.03Q860-657.61 860-605.08q0 79-37.16 138.23-37.15 59.23-109.46 92.54-19.23 44-51.15 75.73-31.92 31.73-76.54 51.96-29.69 68.31-90.96 107.46Q433.46-100 355.54-100Zm.77-45.39q47.69 0 93.42-22.57 45.73-22.58 71.35-62.27-63 10.07-120.5-8.66t-100.73-60.57Q257-342.08 238.58-399.69q-18.42-57.62-8.35-120.62-39.92 26.39-62.38 71.35-22.46 44.96-22.46 93.42 0 44.23 16 82.46t45.23 66.85q29.61 28.61 67.53 44.73 37.93 16.11 82.16 16.11ZM480-270.46q53.85 0 97.54-24.58 43.69-24.58 68.61-60.27-63 10.08-120.19-9.27-57.19-19.34-99.42-62.19-43.23-43.85-62.27-101.15-19.04-57.31-7.96-120.31-42.31 33.38-63.69 73.11-21.39 39.73-21.39 95.12 0 43.23 15.81 81.46t45.04 67.46q28.61 29 66.65 44.81 38.04 15.81 81.27 15.81Zm128.69-126.69q17.39 0 34.69-3.31 17.31-3.31 36.54-10.92 21-59.39 6.81-116.12-14.19-56.73-57.65-100.19-40.85-40.85-102.23-55.85-61.39-15-116.93 4.39-5.38 17-8.07 34.61-2.7 17.62-2.7 39.46 0 42 16 80.23 16 38.23 45.23 68.08 29.24 30.85 67.47 45.23 38.23 14.39 80.84 14.39ZM734-438.46q39.38-27.85 60-67.96 20.61-40.12 20.61-98.66 0-42.61-15.8-80.54-15.81-37.92-45.43-67.15-29.84-30.23-67.76-46.04-37.93-15.8-80.54-15.8-53.23 0-95.73 21.11-42.5 21.12-74.12 61.5 63-10.08 121.81 9.27t103.27 62.81q44.46 43.84 64.3 101.15 19.85 57.31 9.39 120.31Z",
    slideshow: "M392.77-326.39 630.31-480 392.77-633.61v307.22ZM197.69-140q-23.53 0-40.61-17.08T140-197.69v-564.62q0-23.53 17.08-40.61T197.69-820h564.62q23.53 0 40.61 17.08T820-762.31v564.62q0 23.53-17.08 40.61T762.31-140H197.69Zm0-45.39h564.62q4.61 0 8.46-3.84 3.84-3.85 3.84-8.46v-564.62q0-4.61-3.84-8.46-3.85-3.84-8.46-3.84H197.69q-4.61 0-8.46 3.84-3.84 3.85-3.84 8.46v564.62q0 4.61 3.84 8.46 3.85 3.84 8.46 3.84Zm-12.3-589.22v589.22-589.22Z",
    pause: "M533.85-220v-520H740v520H533.85ZM220-220v-520h206.54v520H220Zm359.23-45.39h115.38v-429.22H579.23v429.22Zm-313.84 0h115.76v-429.22H265.39v429.22Zm0-429.22v429.22-429.22Zm313.84 0v429.22-429.22Z",
    play_arrow: "M340-238.39v-487.68l383.07 243.84L340-238.39Zm45.39-243.84Zm0 161 253.99-161-253.99-161v322Z",
    keyboard_arrow_down: "M480-357.85 253.85-584l32.61-32.61L480-423.08l193.54-193.53L706.15-584 480-357.85Z",
    fullscreen: "M140-140v-183.39h45.39v138h138V-140H140Zm497 0v-45.39h138v-138h45.38V-140H637ZM140-636.61V-820h183.39v45.39h-138v138H140Zm635 0v-138H637V-820h183.38v183.39H775Z",
    videocam: "M167.31-180q-23.53 0-40.61-17.08t-17.08-40.61v-484.62q0-23.53 17.08-40.61T167.31-780h484.61q23.53 0 40.61 17.08t17.08 40.61v208.46l140.77-140.76v348.84L709.61-446.54v208.85q0 23.53-17.08 40.61T651.92-180H167.31Zm0-45.39h484.61q5.39 0 8.85-3.46t3.46-8.84v-484.62q0-5.38-3.46-8.84t-8.85-3.46H167.31q-5.39 0-8.85 3.46t-3.46 8.84v484.62q0 5.38 3.46 8.84t8.85 3.46Zm-12.31 0v-509.22 509.22Z",
    videocam_off: "M851.54-305.77 710.77-446.54v108.31l-45.38-45.39v-338.69q0-5.38-3.47-8.84-3.46-3.46-8.84-3.46H314.39L269-780h384.08q23.53 0 40.61 17.08t17.08 40.61v208.46l140.77-140.76v348.84ZM818-74.31 70.93-821.38l31.99-32L850-106.31l-32 32Zm-325.92-483Zm-80.85 75.46ZM177.08-779.23l44.61 44.62h-53.23q-5.38 0-8.84 3.46t-3.46 8.84v484.62q0 5.38 3.46 8.84t8.84 3.46h484.62q5.38 0 8.84-3.46 3.47-3.46 3.47-8.84v-53.23L710-246.31v14q-1.92 21.22-18.43 36.77Q675.07-180 653.08-180H168.46q-23.53 0-40.61-17.08t-17.08-40.61v-484.62q0-21.99 15.31-38.49 15.31-16.51 37-18.43h14Z",
    cameraswitch: "M327.23-310.16q-23.98 0-40.83-17.04-16.86-17.05-16.86-40.65v-224.3q0-23.6 16.86-40.65 16.85-17.04 40.83-17.04h38.85l32.69-32.7h164.69l32.69 32.7H635q23.59 0 40.64 17.04 17.05 17.05 17.05 40.65v224.3q0 23.6-17.05 40.65-17.05 17.04-40.64 17.04H327.23Zm0-45.38H635q5.38 0 8.85-3.65 3.46-3.66 3.46-8.66v-224.3q0-5-3.46-8.66-3.47-3.65-8.85-3.65H327.23q-5.38 0-8.84 3.65-3.47 3.66-3.47 8.66v224.3q0 5 3.47 8.66 3.46 3.65 8.84 3.65Zm153.56-70q22.52 0 38.09-15.75 15.58-15.76 15.58-38.27 0-22.13-15.75-37.9-15.76-15.77-38.27-15.77-22.13 0-37.9 15.95-15.77 15.94-15.77 38.07 0 22.52 15.95 38.09 15.94 15.58 38.07 15.58ZM390-931.23q22.35-5.23 44.91-7 22.55-1.77 44.94-1.77 89.15 0 169.5 31.96 80.34 31.96 142.34 88.45t101.46 133.1q39.46 76.6 47.46 164.87h-45.38q-6.38-78-40.96-145.5t-89.04-117.42q-54.46-49.92-125.04-79.27-70.58-29.34-148.96-31.8l79.85 79.84-32.62 32.62L390-931.23ZM570.61-28.77q-22.1 5.23-44.4 7Q503.9-20 481.38-20q-89.76 0-169.8-31.96t-142.15-88.35q-62.12-56.38-101.77-132.84Q28-349.62 19.39-438.38h45.9q6.86 78 41.44 145.5t88.85 117.42q54.27 49.92 124.84 79.27Q391-66.85 469.77-64.39l-80.23-79.84 32.61-32.62L570.61-28.77ZM481.62-480Z",
    tune: "M440.46-130v-209.23h45.39V-257H830v45.38H485.85V-130h-45.39ZM130-211.62V-257h225.08v45.38H130Zm179.69-164.07v-81.62H130v-45.38h179.69v-82.85h45.39v209.85h-45.39Zm130.77-81.62v-45.38H830v45.38H440.46Zm164.46-163.84V-830h45.39v81.62H830V-703H650.31v81.85h-45.39ZM130-703v-45.38h389.54V-703H130Z",
    spot: "M480-200q-117 0-198.5-81.5T200-480q0-117 81.5-198.5T480-760q117 0 198.5 81.5T760-480q0 117-81.5 198.5T480-200Z",
    info: "M459.54-290h45.38v-230h-45.38v230Zm20.44-294q11.52 0 19.39-7.56 7.86-7.57 7.86-19.05 0-11.95-7.85-19.9-7.85-7.95-19.36-7.95-11.9 0-19.58 7.95-7.67 7.95-7.67 19.9 0 11.48 7.85 19.05 7.85 7.56 19.36 7.56Zm.35 484q-78.95 0-147.89-29.92-68.95-29.92-120.76-81.71-51.81-51.79-81.75-120.78Q100-401.39 100-480.43q0-78.66 29.92-147.87 29.92-69.21 81.71-120.52 51.79-51.31 120.78-81.25Q401.39-860 480.43-860q78.66 0 147.87 29.92 69.21 29.92 120.52 81.21 51.31 51.29 81.25 120.63Q860-558.9 860-480.33q0 78.95-29.92 147.89-29.92 68.95-81.21 120.57-51.29 51.63-120.63 81.75Q558.9-100 480.33-100Zm.17-45.39q139.19 0 236.65-97.76 97.46-97.77 97.46-237.35 0-139.19-97.27-236.65-97.27-97.46-237.34-97.46-139.08 0-236.85 97.27-97.76 97.27-97.76 237.34 0 139.08 97.76 236.85 97.77 97.76 237.35 97.76ZM480-480Z",
    skip_previous: "M220-240v-480h60v480h-60Zm520 0L360-480l380-240v480Zm-60-109v-262L474-480l206 131Z",
    skip_next: "M680-240v-480h60v480h-60Zm-460 0v-480l380 240-380 240Zm60-109 206-131-206-131v262Z",
    title: "M240-760h480v45H502.3V-200h-44.6v-515H240v-45Z",
    remove: "M200-450v-60h560v60H200Z",
    add: "M450-200v-250H200v-60h250v-250h60v250h250v60H510v250h-60Z",
    restart_alt: "M447.92-142.77q-113.77-11.15-190.84-96Q180-323.62 180-439.38q0-68.93 31.08-130.2 31.07-61.26 86.23-102.34l32.23 32.61q-49.85 33-77 86.46-27.15 53.47-27.15 113.47 0 96.92 63.49 167.99 63.5 71.08 159.04 83.24v45.38Zm65.39.77v-45.39q96.15-14.3 159.04-84.88 62.88-70.58 62.88-167.11 0-106.7-73.96-180.66T480.62-694h-26.54l65.77 65.77-32.62 32.61-121.07-121.07 121.07-121.08 32.62 32.62-65.77 65.77h26.54q125.53 0 212.76 87.73 87.23 87.73 87.23 212.27 0 115.76-76.76 200.42-76.77 84.65-190.54 96.96Z",
    view_in_ar: "M449.54-177.77 237.23-302.15q-13-8.43-20.42-21.64-7.42-13.21-7.42-28.44v-248.15q0-15.23 7.42-28.45 7.42-13.21 20.42-21.63l213.31-126q13.61-7.62 29.46-7.62 15.85 0 29.46 7.62l213.31 126q13 8.42 20.42 21.63 7.42 13.22 7.42 28.45v248.15q0 15.23-7.49 28.44t-21.35 21.64L507.23-177.77q-13.94 8-29.01 8-15.07 0-28.68-8Zm7.77-48.61v-237.85L255.38-579.39v225.54q0 3.47 1.54 6.16t4.62 4.23l195.77 117.08Zm45.38 0 196.39-117.08q3.07-1.54 4.61-4.23 1.54-2.69 1.54-6.16v-225.54L502.69-464.23v237.85ZM100-687.92v-114.39q0-23.59 17.05-40.64T157.69-860h114.39v45.39H157.69q-5.38 0-8.84 3.46t-3.46 8.84v114.39H100ZM272.08-100H157.69q-23.59 0-40.64-17.05T100-157.69v-114.39h45.39v114.39q0 5.38 3.46 8.84t8.84 3.46h114.39V-100Zm415.84 0v-45.39h114.39q5.38 0 8.84-3.46t3.46-8.84v-114.39H860v114.39q0 23.59-17.05 40.64T802.31-100H687.92Zm126.69-587.92v-114.39q0-5.38-3.46-8.84t-8.84-3.46H687.92V-860h114.39q23.59 0 40.64 17.05T860-802.31v114.39h-45.39ZM480-504.77l202.31-116.92-196.16-112.46q-3.07-1.54-6.15-1.54-3.08 0-6.15 1.54L277.69-621.69 480-504.77Zm0 18.46Zm0-18.46Zm22.69 40.54Zm-45.38 0Z",
    timer: "M367.69-864.62V-910h224.62v45.38H367.69Zm89.62 447.39h45.38v-217.31h-45.38v217.31ZM348-127.58q-61.85-26.96-108.15-73.07-46.31-46.12-73.08-108.16-26.77-62.04-26.77-132 0-69.96 26.77-131.8 26.77-61.85 73.08-108.16 46.3-46.31 108.15-73.07 61.85-26.77 132-26.77 63.92 0 121 22.11 57.08 22.12 101.92 61.73l46-46.38 32 32-46.38 46.38q36.77 40 61.11 95.66Q820-513.46 820-440.62q0 69.77-26.77 131.81-26.77 62.04-73.08 108.16-46.3 46.11-108.15 73.07-61.85 26.96-132 26.96t-132-26.96Zm340.65-104.38q85.96-85.96 85.96-208.66 0-122.69-85.96-208.65-85.96-85.96-208.65-85.96-122.69 0-208.65 85.96-85.96 85.96-85.96 208.65 0 122.7 85.96 208.66T480-146q122.69 0 208.65-85.96ZM480-440Z",
    gradient: "M437.77-438.38v-84.47h83.85v84.47h-83.85Zm-84.46 84.07v-84.07h84.46v84.07h-84.46Zm168.31 0v-84.07h84.07v84.07h-84.07Zm84.07-84.07v-84.47h84.46v84.47h-84.46Zm-335.84 0v-84.47h83.46v84.47h-83.46ZM197.69-140q-23.59 0-40.64-17.05T140-197.69v-564.62q0-23.59 17.05-40.64T197.69-820h564.62q23.59 0 40.64 17.05T820-762.31v564.62q0 23.59-17.05 40.64T762.31-140H197.69Zm72.16-45.39h83.46v-84.46h-83.46v84.46Zm167.92 0h83.85v-84.46h-83.85v84.46Zm336.84 0v-84.46 84.46Zm-589.22-84.46h84.46v-84.46h83.79v84.46h83.8v-84.46h84.18v84.46h84.26v-84.46h84.27v84.46h84.46v-84.33h-84.46v-84.33h84.46v-323.8q0-4.61-3.84-8.46-3.85-3.84-8.46-3.84H197.69q-4.61 0-8.46 3.84-3.84 3.85-3.84 8.46v323.93h84.46v84.26h-84.46v84.27Zm12.3 84.46h-12.3v-589.22h12.3q-4.61 0-8.46 3.84-3.84 3.85-3.84 8.46v564.62q0 4.61 3.84 8.46 3.85 3.84 8.46 3.84Zm576.92-252.99v84.07-84.07ZM605.69-269.85v84.46h84.46v-84.46h-84.46Z",
    colors: "M348.38-157.62 117.62-388.38q-8.62-8.78-13.12-19.7T100-430.2q0-11.97 4.5-22.5t13.12-19.53L358.39-713 242.08-828.15l32.61-32.23 387.58 388.56q9.43 8.97 13.7 19.53 4.26 10.55 4.26 22.54 0 11.23-4.26 22.11-4.27 10.89-13.74 19.64l-230 230.38q-9 8.62-19.53 13.12-10.53 4.5-22.5 4.5-11.2 0-22.12-4.5-10.92-4.5-19.7-13.12Zm41.85-523.53L147.92-438.46q-2.3 2.31-3.07 4.61-.77 2.31-.77 4.62h492.69q0-2.31-.77-4.62-.77-2.3-3.08-4.61L390.23-681.15ZM787.73-140q-29.88 0-50.54-21.05-20.65-21.06-20.65-51.26 0-23.97 8.84-45.41 8.85-21.43 24.08-39.51l38.62-49.31 39.38 49.31q14.62 18.08 23.77 39.51 9.15 21.44 9.15 45.41 0 30.59-21.19 51.45Q818-140 787.73-140Z",
    layers: "M480-173.08 152.31-427.69l37.31-28.16L480-230.62l290.38-225.23 37.31 28.16L480-173.08Zm0-140.85L152.31-568.54 480-823.15l327.69 254.61L480-313.93Zm0-269.84Zm0 212.31 253.54-197.08L480-765.23 226.46-568.54 480-371.46Z",
    contrast: "M331.86-129.92q-69.37-29.92-120.68-81.21-51.31-51.29-81.25-120.63Q100-401.1 100-479.93q0-78.84 29.92-148.21t81.21-120.68q51.29-51.31 120.63-81.25Q401.1-860 479.93-860q78.84 0 148.21 29.92t120.68 81.21q51.31 51.29 81.25 120.63Q860-558.9 860-480.07q0 78.84-29.92 148.21t-81.21 120.68q-51.29 51.31-120.63 81.25Q558.9-100 480.07-100q-78.84 0-148.21-29.92ZM495.38-145q134.31-8.08 226.77-102.73 92.46-94.65 92.46-232.27t-92.07-232.08Q630.46-806.54 495.38-815v670Z",
    grid_view: "M140-512.69V-820h307.31v307.31H140ZM140-140v-307.31h307.31V-140H140Zm372.69-372.69V-820H820v307.31H512.69Zm0 372.69v-307.31H820V-140H512.69Zm-327.3-418.08h216.53v-216.53H185.39v216.53Zm372.69 0h216.53v-216.53H558.08v216.53Zm0 372.69h216.53v-216.53H558.08v216.53Zm-372.69 0h216.53v-216.53H185.39v216.53Zm372.69-372.69Zm0 156.16Zm-156.16 0Zm0-156.16Z",
    scatter_plot: "M591.04-182.54q-38.19-37.91-38.19-93.07t38.19-93.35q38.19-38.19 93.35-38.19t93.07 38.19q37.92 38.19 37.92 93.35t-37.92 93.07q-37.91 37.92-93.07 37.92t-93.35-37.92Zm154.34-32.08Q770-239.23 770-275.89q0-36.65-24.62-61.26-24.61-24.62-61.27-24.62-36.65 0-61.26 24.62-24.62 24.61-24.62 61.26 0 36.66 24.62 61.27Q647.46-190 684.11-190q36.66 0 61.27-24.62Zm-562.84-95.22q-37.92-37.92-37.92-93.08t37.92-93.35q37.91-38.19 93.07-38.19t93.35 38.19q38.19 38.19 38.19 93.35t-38.19 93.08q-38.19 37.92-93.35 37.92t-93.07-37.92Zm154.31-32.33q24.92-24.86 24.92-60.96t-24.86-61.02q-24.86-24.93-60.96-24.93t-61.03 24.86Q190-439.36 190-403.26q0 36.11 24.86 61.03t60.96 24.92q36.1 0 61.03-24.86Zm7.76-285.79q-37.92-38.19-37.92-93.35t37.92-93.08q37.92-37.92 93.08-37.92t93.35 37.92q38.19 37.92 38.19 93.08t-38.19 93.35q-38.19 38.19-93.35 38.19t-93.08-38.19Zm154.62-31.81q24.62-24.61 24.62-61.27 0-36.65-24.62-61.27-24.61-24.61-61.27-24.61-36.65 0-61.27 24.61-24.61 24.62-24.61 61.27 0 36.66 24.61 61.27 24.62 24.62 61.27 24.62 36.66 0 61.27-24.62Zm185.08 384.08ZM275.69-403Zm162.08-318.23Z",
    abc: "M671.23-366.15q-13.81 0-22.36-8.75-8.56-8.75-8.56-22.18v-165.84q0-13.43 8.56-22.18 8.55-8.75 22.36-8.75h130.92q13.43 0 22.18 8.75t8.75 22.18V-520h-38.77v-35.08H679.08v150.16h115.23V-440h38.77v42.92q0 13.43-8.75 22.18t-22.18 8.75H671.23Zm-285.08 0v-227.7H548q13.81 0 22.36 8.75 8.56 8.75 8.56 22.18v53.54q0 12.69-7 20.46-7 7.77-20.07 8.92 13.07 1.15 20.07 8.92t7 20.46v53.54q0 13.43-8.56 22.18-8.55 8.75-22.36 8.75H386.15Zm38.77-133.23h115.23v-55.7H424.92v55.7Zm0 94.46h115.23v-55.7H424.92v55.7Zm-298 38.77v-196.77q0-13.43 8.75-22.18t22.18-8.75h130.92q13.81 0 22.36 8.75 8.56 8.75 8.56 22.18v196.77h-38.77v-76.24H165.69v76.24h-38.77Zm38.77-115.39h115.23v-73.54H165.69v73.54Z",
    image: "M197.69-140q-23.53 0-40.61-17.08T140-197.69v-564.62q0-23.53 17.08-40.61T197.69-820h564.62q23.53 0 40.61 17.08T820-762.31v564.62q0 23.53-17.08 40.61T762.31-140H197.69Zm0-45.39h564.62q4.61 0 8.46-3.84 3.84-3.85 3.84-8.46v-564.62q0-4.61-3.84-8.46-3.85-3.84-8.46-3.84H197.69q-4.61 0-8.46 3.84-3.84 3.85-3.84 8.46v564.62q0 4.61 3.84 8.46 3.85 3.84 8.46 3.84Zm69.47-102.38h429.76L567.23-460.31 446.38-306.23l-82.23-107.38-96.99 125.84Zm-81.77 102.38v-589.22 589.22Z",
    close: "m250.92-218.92-32-32L448-480 218.92-709.08l32-32L480-512l229.08-229.08 32 32L512-480l229.08 229.08-32 32L480-448 250.92-218.92Z",
  };
  function iconSvg(name, size = 24) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 -960 960 960" ` +
      `fill="currentColor" aria-hidden="true" focusable="false"><path d="${ICONS[name]}"/></svg>`
    );
  }

  // ---------------------------------------------------------------------
  // FORMATTING — the value labels next to sliders
  // ---------------------------------------------------------------------
  const FORMATS = {
    seconds: (v) => `${v}s`,
    px: (v) => `${v}px`,
    percent: (v) => `${v}%`,
    fixed2: (v) => Number(v).toFixed(2),
    int: (v) => String(v),
    degrees: (v) => `${v}°`,
    textForm: (v) => (v < 12 ? "flat" : v < 40 ? "extruded" : "inflated"),
    compass: (v) => {
      const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
      return `${v}° ${names[Math.round(((v % 360) + 360) % 360 / 45) % 8]}`;
    },
    roamSpread: (v, angle) => (v >= 180 ? "wandering" : v === 0 ? (angle != null ? `together, ${FORMATS.compass(+angle)}` : "together") : v < 45 ? "loose flock" : "scattered"),
    glassName: (v) => (v < 20 ? "lens" : v < 45 ? "glass lens" : v < 70 ? "glass" : v < 90 ? "soft liquid" : "liquid"),
    rockName: (v) => (v < 14 ? "pyramid" : v < 43 ? "few triangles" : v < 70 ? "faceted" : "rock"),
    formName: (v) => (v < 12 ? "cube" : v < 40 ? "rounded box" : v < 60 ? "sphere" : v < 85 ? "soft blob" : "globular"),
    moveH: (v) => (v === 0 ? "off" : `${Math.abs(v)}% ${v < 0 ? "left" : "right"}`),
    moveV: (v) => (v === 0 ? "off" : `${Math.abs(v)}% ${v < 0 ? "down" : "up"}`),
    moveZ: (v) => (v === 0 ? "off" : `${Math.abs(v)}% ${v < 0 ? "out" : "in"}`),
  };

  function formatValue(s, v) {
    const f = FORMATS[s.format];
    return f ? f(v) : String(v);
  }

  // Reads an element's current value as the setting's type (bool / number / string).
  function readValue(s, el) {
    if (s.type === "switch" || s.type === "chip" || s.type === "palette-on" || s.type === "hidden") return el.checked;
    if (s.type === "range") return s.int ? parseInt(el.value, 10) : parseFloat(el.value);
    return el.value;
  }

  // ---------------------------------------------------------------------
  // BUILD — LAYOUT + SETTINGS -> panel HTML
  // ---------------------------------------------------------------------
  const esc = (t) =>
    String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const titleAttr = (s) => (s.help ? ` title="${esc(s.help)}"` : "");
  const checkedAttr = (s) => (s.default ? " checked" : "");

  function valSpan(s) {
    return `<span class="val" data-for="${s.id}">${esc(formatValue(s, s.default))}</span>`;
  }

  function rangeInput(s, extraClass) {
    return (
      `<input type="range"${extraClass ? ` class="${extraClass}"` : ""}${s.centre ? " data-centre" : ""} id="${s.id}" ` +
      `min="${s.min}" max="${s.max}" step="${s.step}" value="${s.default}" aria-label="${esc(s.label)}">`
    );
  }

  function settingHtml(id) {
    const s = byId[id];
    if (!s) return `<!-- unknown setting ${esc(id)} -->`;
    switch (s.type) {
      case "switch":
        return `<label class="cp-row"${titleAttr(s)}><span>${esc(s.label)}</span><input type="checkbox" class="cp-switch" id="${s.id}"${checkedAttr(s)}></label>`;
      case "range":
        return (
          `<div class="cp-range-head"${titleAttr(s)}><label for="${s.id}">${esc(s.label)}</label>${valSpan(s)}</div>` +
          rangeInput(s, "cp-range")
        );
      case "select":
        return (
          `<label class="cp-field" for="${s.id}">${esc(s.label)}</label><div class="cp-select"><select id="${s.id}">` +
          s.options.map(([v, l]) => `<option value="${esc(v)}"${v === s.default ? " selected" : ""}>${esc(l)}</option>`).join("") +
          `</select><span data-icon="keyboard_arrow_down"></span></div>`
        );
      case "color":
        // Palette colours are placed by the palette block; a loose one gets a row with a swatch.
        if (/^ctrlPalette/.test(s.id)) return `<!-- ${esc(s.id)} is placed by its block -->`;
        return `<div class="cp-row"${titleAttr(s)}><span>${esc(s.label)}</span><label class="cp-colour-swatch"><input type="color" id="${s.id}" value="${s.default}" aria-label="${esc(s.label)}"></label></div>`;
      case "text":
        return `<label class="cp-field" for="${s.id}">${esc(s.label)}</label><input type="text" class="cp-text" id="${s.id}" value="${esc(s.default)}" maxlength="${s.maxlength || 40}" autocomplete="off" spellcheck="false">`;
      case "hidden":
        return `<input type="checkbox" class="cp-hidden-input" id="${s.id}" tabindex="-1" aria-hidden="true"${checkedAttr(s)}>`;
      case "chip":
        return `<label class="cp-chip"${titleAttr(s)}><input type="checkbox" id="${s.id}"${checkedAttr(s)}>${esc(s.label)}</label>`;
      default:
        return `<!-- ${esc(s.type)} ${esc(s.id)} is placed by its block -->`;
    }
  }

  function itemHtml(item, opts) {
    if (typeof item === "string") return settingHtml(item);
    if (item.note) return `<p class="cp-note">${esc(item.note)}</p>`;
    if (item.dual) {
      const [a, b] = item.dual.map((id) => byId[id]);
      return (
        `<div class="cp-range-head"><span>${esc(item.label)}</span><span>${valSpan(a)}–${valSpan(b)}</span></div>` +
        `<div class="cp-dual">${rangeInput(a)}${rangeInput(b)}</div>`
      );
    }
    if (item.pair) {
      // Two independent settings in one control. On the panel: two handles on
      // one track (cp-twin). On the remote (phone): a square pad, x and y.
      const [a, b] = item.pair.map((id) => byId[id]);
      const head = `<div class="cp-range-head"><span>${esc(item.label)}</span><span>${valSpan(a)} · ${valSpan(b)}</span></div>`;
      if (!(opts && opts.mode === "remote")) {
        return (
          head +
          `<div class="cp-twin">${rangeInput(a)}${rangeInput(b)}</div>` +
          `<p class="cp-twin-key"><i class="k1"></i>${esc(item.xLabel || a.label)} <i class="k2"></i>${esc(item.yKey || b.label)}</p>`
        );
      }
      return (
        head +
        `<div class="cp-pad" tabindex="0" role="group" aria-label="${esc(a.label)} (left to right) and ${esc(b.label)} (down to up)" data-x="${a.id}" data-y="${b.id}">` +
        `<span class="cp-pad-dot"></span><span class="cp-pad-tag cp-pad-r">${esc(item.xLabel || a.label)} →</span>` +
        `<span class="cp-pad-tag cp-pad-t">${esc(item.yTop || "")}</span><span class="cp-pad-tag cp-pad-b">${esc(item.yBottom || "")}</span></div>` +
        rangeInput(a, "cp-pad-input") + rangeInput(b, "cp-pad-input")
      );
    }
    if (item.chips) {
      return (
        (item.label ? `<p class="cp-field">${esc(item.label)}</p>` : "") +
        `<div class="cp-chips">${item.chips.map(settingHtml).join("")}</div>`
      );
    }
    if (item.proxyChips) {
      return (
        `<div class="cp-chips">` +
        item.proxyChips.map((id) => `<button type="button" class="cp-chip" data-for="${id}">${EFFECT_ICONS[id] ? `<span data-icon="${EFFECT_ICONS[id]}"></span>` : ""}${esc(byId[id].label)}</button>`).join("") +
        `</div>`
      );
    }
    if (item.palettes) {
      let html = `<div class="cp-palettes">`;
      for (let n = 1; n <= 4; n++) {
        const fg = byId[`ctrlPalette${n}Fg`];
        const bg = byId[`ctrlPalette${n}Bg`];
        const on = byId[`ctrlPalette${n}Enabled`];
        html +=
          `<div class="cp-pal">` +
          `<label class="cp-pal-swatch" title="Highlights"><input type="color" id="${fg.id}" value="${fg.default}" aria-label="${esc(fg.label)}"></label>` +
          `<label class="cp-pal-swatch" title="Shadows"><input type="color" id="${bg.id}" value="${bg.default}" aria-label="${esc(bg.label)}"></label>` +
          `<label class="cp-pal-on" title="Palette ${n} in rotation"><input type="checkbox" id="${on.id}"${checkedAttr(on)}>${esc(on.label)}</label>` +
          `</div>`;
      }
      return html + `</div>`;
    }
    if (item.when) {
      return `<div class="cp-when"${whenAttrs(item.when)}>${item.items.map((it) => itemHtml(it, opts)).join("")}</div>`;
    }
    if (item.widget) return opts.mode === "display" ? widgetHtml(item.widget) : "";
    return "";
  }

  // Display-page extras: buttons and info that act on the display itself,
  // so they're not settings and don't appear on the remote page.
  function widgetHtml(name) {
    switch (name) {
      case "mine":
        return (
          `<p class="cp-field">Your images</p>` +
          `<div class="cp-btns">` +
          `<button type="button" class="cp-btn" id="cpMineFolder" title="Pick a folder on this computer — every image inside it (and its subfolders) joins the rotation">Choose a folder…</button>` +
          `<button type="button" class="cp-btn" id="cpMineFiles" title="Pick one or more images">Choose images…</button>` +
          `<button type="button" class="cp-btn" id="cpMineAgain" hidden>Use your folder again</button>` +
          `<button type="button" class="cp-btn" id="cpMineOff" hidden>Back to demo</button>` +
          `</div><p class="cp-note" id="cpMineStatus">Use images from this device instead of the demo set. Nothing is uploaded. You can also drop a folder onto the picture.</p>` +
          `<p class="cp-note" id="cpMineMemory" hidden></p>` +
          `<div class="cp-btns"><button type="button" class="cp-btn" id="cpMineForget" hidden title="Stops this browser remembering the folder — nothing is deleted">Forget this folder</button></div>`
        );
      case "flip":
        return `<button type="button" class="cp-btn" id="cpFlip" hidden>Switch front / back camera</button>`;
      case "profile":
        return (
          `<label class="cp-field" for="cpProfile">Profile</label><div class="cp-select"><select id="cpProfile">` +
          `<option value="phone">Phone — 1080 × 1920 portrait</option>` +
          `<option value="desktop">Desktop — fits this window</option>` +
          `<option value="igloo">Igloo walls — 11520 × 1038</option>` +
          `<option value="igloo-preview">Igloo preview — panning</option>` +
          `</select><span data-icon="keyboard_arrow_down"></span></div>` +
          `<p class="cp-note" id="cpProfileHint"></p>` +
          `<p class="cp-note">Changing profile reloads the page at the new size; your current settings carry over.</p>` +
          `<p class="cp-stat"><span>Now</span><span id="cpStage">—</span></p>`
        );
      case "tools":
        return (
          `<p class="cp-links">` +
          `<a href="showreel.html" target="_blank" title="Plays a loop of looks, 5 seconds each, with captions and its own play bar">Showreel ↗</a>` +
          `<a href="seed-loader.html" target="_blank" title="Drag new photos in, auto-named and saved automatically">Image uploader ↗</a>` +
          `<a href="controls.html" target="_blank" title="Opens in a new tab on this same device — won't reach a phone or another computer">Remote controls ↗</a>` +
          `<a href="igloo-check.html" target="_blank">Igloo check ↗</a>` +
          `<a href="about.html" target="_blank">About & credits ↗</a>` +
          `<a href="changelog.html" target="_blank">Changelog ↗</a>` +
          `</p><div class="cp-btns"><button type="button" class="cp-btn" id="cpResetAll" title="Puts every control back to its starting value. Your saved settings and scenes are not touched">Reset all controls</button></div>` +
          `<p class="cp-note" id="statusLine">loading…</p>`
        );
      case "scenes":
        return (
          `<div class="cp-scenes" id="cpScenes"></div>` +
          `<div class="cp-scene-save">` +
          `<input type="text" id="cpSceneName" maxlength="40" placeholder="Name this look…" aria-label="Scene name" autocomplete="off">` +
          `<button type="button" class="cp-btn" id="cpSceneSave">Save scene</button></div>` +
          `<p class="cp-note">Keys 1–9 switch scenes. Saving with an existing name updates it. Scenes are kept in this browser — Export to take them to another computer.</p>` +
          `<div class="cp-btns"><button type="button" class="cp-btn" id="cpSceneExport" title="Downloads scenes.json — put it in the project folder and push, and every machine that opens the site gets these scenes">Export scenes.json</button></div>`
        );
      case "presets":
        return (
          `<div class="cp-btns">` +
          `<button type="button" class="cp-btn" id="saveSettingsBtn" title="Saves every control to this browser, replacing the previous save">Save</button>` +
          `<button type="button" class="cp-btn" id="loadSettingsBtn" title="Restores the last save">Load</button>` +
          `<button type="button" class="cp-btn" id="clearSettingsBtn" title="Deletes the save — doesn't change what's on screen">Clear</button>` +
          `</div><p class="cp-note" id="settingsStatus">No settings saved yet.</p>`
        );
      case "output":
        return (
          `<div class="cp-btns">` +
          `<button type="button" class="cp-btn" id="cpFullscreen">Fullscreen</button>` +
          `<button type="button" class="cp-btn" id="openRecordingWindowLink" title="Opens a separate window at the output shape with your current settings, for screen recording. Same as R.">Recording window</button>` +
          `<button type="button" class="cp-btn" id="cpBrandBtn">SHU lockup</button>` +
          `</div>`
        );
      case "remote":
        return (
          `<div class="cp-remote">` +
          `<p class="cp-note" id="remoteNote"></p>` +
          `<div class="cp-btns" id="remoteBtns"><button type="button" class="cp-btn" id="remoteNewCode" title="Makes a new QR code and disconnects any phone">New code</button>` +
          `<button type="button" class="cp-btn" id="remoteCopy">Copy link</button></div></div>`
        );
      case "keys":
        return (
          `<dl class="cp-keys">` +
          [["C", "Controls"], ["P", "Pause / resume"], ["V", "Camera on / off"], ["L", "Live student photos"],
            ["F", "Fullscreen"], ["D", "Info panel"], ["Q", "Remote code"], ["S", "SHU lockup"], ["R", "Recording window"], ["1–9", "Scenes"], ["?", "This list"]]
            .map(([k, l]) => `<dt><kbd>${k}</kbd></dt><dd>${l}</dd>`)
            .join("") +
          `</dl>`
        );
      default:
        return "";
    }
  }

  // Conditional show/hide: { id, is: [...] } or { id, not: [...] }, matched
  // against a select's value, a range's value, or "on"/"off" for a switch.
  function whenAttrs(w) {
    return (
      ` data-when-id="${esc(w.id)}"` +
      (w.is ? ` data-when-is="${esc(w.is.join("|"))}"` : "") +
      (w.not ? ` data-when-not="${esc(w.not.join("|"))}"` : "")
    );
  }

  function inputState(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    return el.type === "checkbox" ? (el.checked ? "on" : "off") : String(el.value);
  }

  // Live one-line summaries in card headers, so the tab reads at a glance.
  const SUMMARIES = {
    move() {
      if (inputState("ctrlRoamOn") === "on") return "roam · images wander";
      const p = +inputState("ctrlMovePanSpeed"), t = +inputState("ctrlMoveTiltSpeed"), z = +inputState("ctrlMoveZoomSpeed");
      const parts = [];
      if (p) parts.push(`pan ${formatValue(byId.ctrlMovePanSpeed, p)}`);
      if (t) parts.push(`tilt ${formatValue(byId.ctrlMoveTiltSpeed, t)}`);
      if (z) parts.push(`zoom ${formatValue(byId.ctrlMoveZoomSpeed, z)}`);
      if (inputState("ctrlMoveRandomize") === "on") parts.push("random");
      if (!parts.length) return "still";
      const end = byId.ctrlMoveEnd.options.find(([v]) => v === inputState("ctrlMoveEnd"));
      return `${parts.join(" · ")} · ${end ? end[0] : ""}`;
    },
    roam() {
      if (inputState("ctrlRoamOn") !== "on") return "off";
      const dir = FORMATS.roamSpread(+inputState("ctrlRoamSpread"), inputState("ctrlRoamAngle"));
      return `${inputState("ctrlRoamCount")} images · speed ${inputState("ctrlRoamSpeed")} · ${dir}`;
    },
    strip() {
      const n = +inputState("ctrlStripLayers"), gap = +inputState("ctrlStripGap");
      const parts = [n > 1 ? `${n} layers · ${inputState("ctrlStripRelation")}` : "1 layer"];
      if (gap) parts.push(`gap ${gap}%`);
      return parts.join(" · ");
    },
    forms() {
      if (inputState("ctrlFormsOn") !== "on") return "off";
      const n = +inputState("ctrlFormsCount");
      const shape = inputState("ctrlFormsShape");
      const rng = (lo, hi, name) => (inputState(lo) === inputState(hi) ? FORMATS[name](+inputState(lo)) : `${FORMATS[name](+inputState(lo))} to ${FORMATS[name](+inputState(hi))}`);
      const what = shape === "form" ? rng("ctrlFormsOrganic", "ctrlFormsOrganicMax", "formName") : rng("ctrlFormsRock", "ctrlFormsRockMax", "rockName");
      const glass = inputState("ctrlFormsSurface") === "glass" ? " · glass" : "";
      return `${n} × ${what}${glass}${inputState("ctrlFormsBehind") === "picture" ? " · over picture" : ""}`;
    },
    echo() {
      if (inputState("ctrlEchoOn") !== "on") return "off";
      const blend = byId.ctrlEchoBlend.options.find(([v]) => v === inputState("ctrlEchoBlend"));
      return `${inputState("ctrlEchoMode")} · ${blend ? blend[1].split(" ")[0].toLowerCase() : ""}`;
    },
  };

  // Same icons as the phone remote's effect switches.
  const EFFECT_ICONS = {
    ctrlEffectNone: "image", ctrlEffectDuotone: "contrast", ctrlEffectPixelate: "grid_view",
    ctrlEffectHalftone: "scatter_plot", ctrlEffectAscii: "abc",
  };
  // Cards on these tabs get a reset-to-defaults button.
  const RESET_TABS = ["effects", "colour", "motion", "forms"];

  function blockHtml(block, opts) {
    if (block.displayOnly && opts.mode !== "display") return "";
    const items = block.items.map((it) => itemHtml(it, opts)).join("");
    if (block.card) {
      const sw = block.switch ? byId[block.switch] : null;
      return (
        `<section class="cp-card${block.open ? " is-open" : ""}"${block.when ? whenAttrs(block.when) : ""}${block.summarize ? ` data-summary="${block.summarize}"` : ""}><div class="cp-card-head">` +
        `<button type="button" class="cp-card-toggle" aria-expanded="${block.open ? "true" : "false"}"><span data-icon="keyboard_arrow_down"></span>` +
        `<b>${esc(block.card)}</b><small>${esc(block.summary || "")}</small></button>` +
        (RESET_TABS.includes(opts.tab) ? `<button type="button" class="cp-icon cp-reset" aria-label="Reset ${esc(block.card)} to defaults" title="Reset to defaults" data-icon="restart_alt"></button>` : "") +
        (sw ? `<input type="checkbox" class="cp-switch" id="${sw.id}"${checkedAttr(sw)} aria-label="${esc(block.card)} on">` : "") +
        `</div><div class="cp-card-body">${items}</div></section>`
      );
    }
    return `<section class="cp-sec${block.className ? " " + block.className : ""}"><h3>${esc(block.section)}</h3>${items}</section>`;
  }

  function buildPanel(root, opts = {}) {
    const mode = opts.mode || "display";
    const display = mode === "display";
    root.innerHTML =
      (display ? `<button type="button" class="cp-grab" id="cpGrab" aria-label="Close controls"><span></span></button>` : "") +
      `<div class="cp-head"><div class="cp-title"><h2>${display ? "Controls" : "Remote controls"}</h2>` +
      `<div class="cp-now" id="cpNow">${display ? "starting…" : "mirrors the display page"}</div></div>` +
      (display
        ? `<button type="button" class="cp-icon" id="cpInfoHead" aria-label="Info (D)" title="Info (D)" aria-pressed="false" data-icon="info"></button>` +
          `<button type="button" class="cp-icon" id="cpNext" aria-label="Next image" title="Next image" data-icon="skip_next"></button>` +
          `<button type="button" class="cp-icon" id="cpPause" aria-label="Pause (P)" title="Pause (P)" data-icon="pause"></button>` +
          `<button type="button" class="cp-icon cp-close" id="cpClose" aria-label="Close controls (C)" title="Close (C)" data-icon="close"></button>`
        : "") +
      `</div>` +
      `<nav class="cp-tabs" aria-label="Control groups">` +
      (() => {
        const btn = (t) => `<button type="button" data-tab="${t.tab}"><span data-icon="${t.icon}"></span>${esc(t.label)}</button>`;
        return `<div class="cp-tabrow">${LAYOUT.filter((t) => !t.group).map(btn).join("")}</div>` +
          `<div class="cp-tabrow cp-tabrow-setup">${LAYOUT.filter((t) => t.group).map(btn).join("")}` +
          (display
            ? `<span class="cp-tabtools">` +
              `<button type="button" class="cp-icon" id="cpCamera" aria-label="Camera" title="Live camera (V)" aria-pressed="false" data-icon="videocam"></button>` +
              `<button type="button" class="cp-icon" id="cpFlip" aria-label="Switch front / back camera" title="Switch front / back camera" data-icon="cameraswitch" hidden></button>` +
              `<button type="button" class="cp-icon" id="cpQr" aria-label="Phone remote code" title="Phone remote: show / hide the QR code (Q)" aria-pressed="false" data-icon="qr_code_2"></button>` +
              `</span>`
            : "") +
          `</div>`;
      })() +
      `</nav><div class="cp-body">` +
      LAYOUT.map((t) => `<div class="cp-tab" data-tab="${t.tab}">${t.blocks.map((b) => blockHtml(b, { mode, tab: t.tab })).join("")}</div>`).join("") +
      `</div>`;
    enhancePanel(root);
  }

  // ---------------------------------------------------------------------
  // BEHAVIOUR — generic panel interactions (both pages)
  // ---------------------------------------------------------------------
  const TAB_KEY = "photoRemixPanelTab";

  function setTab(root, tab) {
    if (!root || !root.querySelector(`.cp-tab[data-tab="${tab}"]`)) tab = "effects";
    root.querySelectorAll(".cp-tabs [data-tab]").forEach((b) => {
      b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
    });
    root.querySelectorAll(".cp-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === tab));
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch (e) {
      /* remembering the tab is only a convenience */
    }
  }

  function rangePct(el) {
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    return ((parseFloat(el.value) - min) / (max - min)) * 100;
  }

  // Re-derives the visual state (chip highlights, slider fills) from the
  // real inputs. Cheap; call after anything changes values.
  function syncPanel(root) {
    if (!root) return;
    root.querySelectorAll("[data-when-id]").forEach((el) => {
      const v = inputState(el.dataset.whenId);
      let show = true;
      if (el.dataset.whenIs) show = el.dataset.whenIs.split("|").includes(v);
      if (el.dataset.whenNot) show = show && !el.dataset.whenNot.split("|").includes(v);
      el.hidden = !show;
    });
    root.querySelectorAll(".cp-card[data-summary]").forEach((card) => {
      const fn = SUMMARIES[card.dataset.summary];
      const small = card.querySelector(".cp-card-toggle small");
      if (fn && small) small.textContent = fn();
    });
    root.querySelectorAll(".cp-chip[data-for]").forEach((chip) => {
      const input = document.getElementById(chip.dataset.for);
      chip.setAttribute("aria-pressed", String(!!(input && input.checked)));
    });
    root.querySelectorAll('input[type="range"]').forEach((r) => {
      if (r.closest(".cp-dual")) return;
      const p = rangePct(r);
      const centre = r.hasAttribute("data-centre");
      r.style.setProperty("--from", `${centre ? Math.min(50, p) : 0}%`);
      r.style.setProperty("--to", `${centre ? Math.max(50, p) : p}%`);
    });
    root.querySelectorAll(".cp-dual").forEach((box) => {
      const [lo, hi] = box.querySelectorAll('input[type="range"]');
      const a = rangePct(lo);
      const b = rangePct(hi);
      box.style.setProperty("--from", `${Math.min(a, b)}%`);
      box.style.setProperty("--to", `${Math.max(a, b)}%`);
      lo.style.zIndex = a > 90 ? "2" : ""; // both handles at the top end: keep the lower one draggable
    });
    root.querySelectorAll(".cp-pad").forEach((pad) => {
      const xi = document.getElementById(pad.dataset.x);
      const yi = document.getElementById(pad.dataset.y);
      if (!xi || !yi) return;
      pad.style.setProperty("--px", `${rangePct(xi)}%`);
      pad.style.setProperty("--py", `${100 - rangePct(yi)}%`);
    });
  }

  function enhancePanel(root) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = iconSvg(el.dataset.icon, el.closest(".cp-tabs") ? 22 : 20);
    });

    root.querySelectorAll(".cp-tabs [data-tab]").forEach((b) => {
      b.addEventListener("click", () => setTab(root, b.dataset.tab));
    });
    let tab = "effects";
    try {
      tab = localStorage.getItem(TAB_KEY) || tab;
    } catch (e) {
      /* default tab */
    }
    setTab(root, tab);

    root.querySelectorAll(".cp-card").forEach((card) => {
      const toggle = card.querySelector(".cp-card-toggle");
      toggle.addEventListener("click", () => {
        const open = !card.classList.contains("is-open");
        card.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
      });
    });

    // Reset button on a card: every control in the card (and its on/off switch) back to its default.
    root.querySelectorAll(".cp-reset").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".cp-card");
        card.querySelectorAll("input, select").forEach((el) => {
          if (el.type === "text" || el.type === "file" || el.type === "button") return;
          if (el.type === "checkbox" || el.type === "radio") el.checked = el.defaultChecked;
          else if (el.tagName === "SELECT") for (const o of el.options) o.selected = o.defaultSelected;
          else el.value = el.defaultValue;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    });

    // Chips that flip a checkbox elsewhere (e.g. "In rotation" row ->
    // each effect card's switch), so both always agree.
    root.querySelectorAll(".cp-chip[data-for]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const input = document.getElementById(chip.dataset.for);
        if (!input) return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Two-handle sliders: handles can't cross — pushing one past the other
    // drags the other along.
    root.querySelectorAll(".cp-dual").forEach((box) => {
      const [lo, hi] = box.querySelectorAll('input[type="range"]');
      lo.addEventListener("input", () => {
        if (parseFloat(lo.value) > parseFloat(hi.value)) {
          hi.value = lo.value;
          hi.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      hi.addEventListener("input", () => {
        if (parseFloat(hi.value) < parseFloat(lo.value)) {
          lo.value = hi.value;
          lo.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    });

    // Pads: one square, two drags (x and y each drive a hidden range input).
    root.querySelectorAll(".cp-pad").forEach((pad) => {
      const xi = document.getElementById(pad.dataset.x);
      const yi = document.getElementById(pad.dataset.y);
      if (!xi || !yi) return;
      const snap = (el, f) => {
        const st = +el.step || 1;
        const v = Math.round((+el.min + f * (+el.max - +el.min)) / st) * st;
        return String(Math.min(+el.max, Math.max(+el.min, v)));
      };
      const push = (el, v) => {
        if (el.value === v) return;
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const done = () => [xi, yi].forEach((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
      const fromPointer = (e) => {
        const r = pad.getBoundingClientRect();
        const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        push(xi, snap(xi, fx));
        push(yi, snap(yi, 1 - fy));
      };
      pad.addEventListener("pointerdown", (e) => {
        pad.setPointerCapture(e.pointerId);
        fromPointer(e);
        e.preventDefault();
      });
      pad.addEventListener("pointermove", (e) => {
        if (pad.hasPointerCapture(e.pointerId)) fromPointer(e);
      });
      pad.addEventListener("pointerup", done);
      pad.addEventListener("dblclick", () => {
        push(xi, xi.defaultValue);
        push(yi, yi.defaultValue);
        done();
      });
      pad.addEventListener("keydown", (e) => {
        const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
        if (!k) return;
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        const clamp = (el, v) => String(Math.min(+el.max, Math.max(+el.min, v)));
        push(xi, clamp(xi, +xi.value + k[0] * n));
        push(yi, clamp(yi, +yi.value + k[1] * n));
        done();
      });
    });

    root.addEventListener("input", () => syncPanel(root));
    root.addEventListener("change", () => syncPanel(root));
    syncPanel(root);
  }

  window.PhotoRemixSettings = {
    SETTINGS, LAYOUT, byId, ICONS, iconSvg,
    formatValue, readValue, buildPanel, syncPanel, setTab,
  };
})();
