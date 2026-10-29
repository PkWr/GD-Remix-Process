// Showreel looks: title + settings that differ from the defaults (ids
// without "ctrl"). Two colour schemes only: green/blue (palette 1) and
// black & white (palette 2 set to white on black).
const BW = { Palette2Fg: "#ffffff", Palette2Bg: "#000000", Palette1Enabled: 0, Palette2Enabled: 1, Palette3Enabled: 0, Palette4Enabled: 0 };
const GB = { Palette2Fg: "#ffffff", Palette2Bg: "#000000", Palette1Enabled: 1, Palette2Enabled: 0, Palette3Enabled: 0, Palette4Enabled: 0 };
const BOTH = { Palette2Fg: "#ffffff", Palette2Bg: "#000000", Palette1Enabled: 1, Palette2Enabled: 1, Palette3Enabled: 0, Palette4Enabled: 0, PaletteRandomize: 1 };
const ONLY = (...fx) => {
  const o = { EffectNone: 0, EffectDuotone: 0, EffectPixelate: 0, EffectHalftone: 0, EffectAscii: 0 };
  fx.forEach((f) => { o[`Effect${f}`] = 1; });
  return o;
};
const HOLD = (a, b) => ({ SpeedMin: a, SpeedMax: b });
// One hero 3D form, centred and big; picture behind it unless "black".
const FORM = (o) => ({ FormsOn: 1, FormsCount: 1, FormsSize: 100, FormsTravel: 8, FormsSpin: 45, ...o });

module.exports = {
  seconds: 5,
  looks: [
    { title: "Halftone strip, echo trail", settings: { ...ONLY("Halftone"), ...GB, MovePanSpeed: 55, MoveEnd: "strip", StripGap: 35, EchoOn: 1, EchoMode: "even", EchoBlend: "behind", EchoSpacing: 7 } },
    { title: "3D cube over crossing strips", settings: { ...ONLY("Duotone", "Halftone"), ...BW, MovePanSpeed: 45, MoveEnd: "strip", StripLayers: 2, StripRelation: "crossing", StripBlend: "difference", StripOpacity: 1,
      ...FORM({ FormsShape: "form", FormsOrganic: 4, FormsWrap: "box", FormsBehind: "picture", FormsSpin: 60 }), ...HOLD(2, 3) } },
    { title: "Crossing strips, difference", settings: { ...ONLY("Pixelate", "Duotone"), ...GB, PixelateMin: 10, PixelateMax: 28, MovePanSpeed: 50, MoveEnd: "strip", StripLayers: 2, StripRelation: "crossing", StripBlend: "difference", StripOpacity: 1 } },
    { title: "Liquid glass over the halftone strip", settings: { ...ONLY("Halftone"), ...GB, MovePanSpeed: 50, MoveEnd: "strip",
      ...FORM({ FormsShape: "form", FormsOrganic: 95, FormsSurface: "glass", FormsMagnify: 35, FormsBend: 80, FormsRim: 70, FormsBehind: "picture", FormsSpin: 30 }) } },
    { title: "Palette shimmer, mirrored repeat", settings: { ...ONLY("Pixelate"), ...BOTH, AnimatePaletteColor: 1, AnimatePaletteDensityMax: 50, PixelateMin: 14, PixelateMax: 26, MovePanSpeed: 40, MoveTiltSpeed: 30, MoveEnd: "mirror", ...HOLD(2, 3) } },
    { title: "3D knot through a ragged echo", settings: { ...ONLY("Ascii"), ...BW, AsciiMin: 10, AsciiMax: 16, MovePanSpeed: 60, MoveEnd: "strip", StripGap: 25, EchoOn: 1, EchoMode: "ragged", EchoBlend: "screen",
      ...FORM({ FormsShape: "knot", FormsWrap: "tube", FormsBehind: "picture", FormsSize: 90, FormsSpin: 55 }), ...HOLD(2, 3) } },
    { title: "ASCII blocks, three strips", settings: { ...ONLY("Ascii"), ...GB, AsciiRamp: "blocks", AsciiMin: 12, AsciiMax: 22, MovePanSpeed: 45, MoveEnd: "strip", StripLayers: 3, StripRelation: "parallax", StripBlend: "screen", StripOpacity: 0.8 } },
    { title: "3D geometric to organic", settings: { ...ONLY("Duotone", "Halftone"), ...BOTH, ...FORM({ FormsShape: "form", FormsDrift: 1, FormsWrap: "globe", FormsBehind: "black", FormsSpin: 40 }), ...HOLD(1.5, 2.5) } },
    { title: "Blend overlay, sliding halftone", settings: { ...ONLY("Halftone", "Duotone"), ...BW, BlendOverlay: 1, BlendLayers: 3, BlendModeMultiply: 1, BlendModeScreen: 1, BlendModeDifference: 1, MovePanSpeed: 35, MoveEnd: "mirror", ...HOLD(2, 3) } },
    { title: "Glass sphere, magnifying", settings: { ...ONLY("Ascii", "Duotone"), ...BW, AsciiMin: 10, AsciiMax: 16, MovePanSpeed: 40, MoveEnd: "strip", StripLayers: 2, StripRelation: "opposing", StripBlend: "difference", StripOpacity: 1,
      ...FORM({ FormsShape: "form", FormsOrganic: 50, FormsSurface: "glass", FormsMagnify: 70, FormsBend: 25, FormsRim: 60, FormsBehind: "picture", FormsSize: 95 }), ...HOLD(2, 3) } },
    { title: "Zooming smear", settings: { ...ONLY("Halftone"), ...BW, MoveZoomSpeed: 60, MoveTiltSpeed: 20, MoveEnd: "mirror", EchoOn: 1, EchoMode: "smear", EchoLength: 80, EchoBlend: "lighten", ...HOLD(2, 3) } },
    { title: "Glass cube, a window", settings: { ...ONLY("Pixelate", "Halftone"), ...BOTH, AnimatePaletteColor: 1, AnimatePaletteDensityMax: 40, PixelateMin: 10, PixelateMax: 20, MovePanSpeed: 45, MoveEnd: "strip",
      ...FORM({ FormsShape: "form", FormsOrganic: 6, FormsSurface: "glass", FormsMagnify: 20, FormsBend: 45, FormsRim: 80, FormsBehind: "black", FormsSpin: 50 }), ...HOLD(1.5, 2.5) } },
    { title: "All together", settings: { ...ONLY("Duotone", "Pixelate", "Halftone", "Ascii"), ...BOTH, MovePanSpeed: 60, MoveEnd: "strip", StripLayers: 2, StripRelation: "crossing", StripGap: 20, EchoOn: 1, EchoMode: "ragged", EchoBlend: "screen",
      ...FORM({ FormsShape: "form", FormsOrganic: 88, FormsWrap: "globe", FormsBehind: "picture", FormsSize: 80, FormsSpin: 35 }), ...HOLD(2, 3) } },
  ],
};
