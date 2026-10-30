// Igloo test scenes: name, what it checks, what to look for, and the
// settings that differ from the defaults (ids without "ctrl").
const ONLY = (fx) => {
  const all = { EffectNone: 0, EffectDuotone: 0, EffectPixelate: 0, EffectHalftone: 0, EffectAscii: 0 };
  for (const f of fx) all[`Effect${f}`] = 1;
  return all;
};
module.exports = [
  { name: "T1 Plain photos", checks: "Picture mapping and sharpness",
    look: "Photos fill all six walls with no gaps or doubled strips at the joins. Are the photos sharp enough at this size? Note any that look soft or blocky.",
    diff: { ...ONLY(["None"]), SpeedMin: 6, SpeedMax: 8 } },
  { name: "T2 Duotone, still", checks: "Colour and crossfades",
    look: "Colours look strong and even across all walls. Fades between images are smooth, with no flashes or freezes.",
    diff: { ...ONLY(["Duotone"]), SpeedMin: 4, SpeedMax: 6 } },
  { name: "T3 Pixelate, quick changes", checks: "Speed of image changes",
    look: "A new image every 2–3 seconds. Does each change happen on time, or does the picture pause or stutter just before it changes?",
    diff: { ...ONLY(["Pixelate"]), SpeedMin: 2, SpeedMax: 3 } },
  { name: "T4 Halftone", checks: "Heaviest still effect",
    look: "Dot pattern is crisp. Watch the moment each new image arrives: note any long pause (more than about half a second) or freeze.",
    diff: { ...ONLY(["Halftone"]), SpeedMin: 4, SpeedMax: 6 } },
  { name: "T5 ASCII, flickering", checks: "Animated effect load",
    look: "Characters flicker continuously. Is the flicker smooth everywhere, or does the whole room judder or lag?",
    diff: { ...ONLY(["Ascii"]), SpeedMin: 5, SpeedMax: 7 } },
  { name: "T6 Slow strip around the room", checks: "Smooth movement across the joins",
    look: "Images slide slowly round the walls in a continuous line. Watch the joins between walls: does the movement stay smooth, or jump or tear as it crosses?",
    diff: { ...ONLY(["Duotone"]), MovePanSpeed: 20, MoveEnd: "strip" } },
  { name: "T7 Two strips crossing", checks: "Layered movement",
    look: "Two lines of images move in opposite directions over each other. Note whether movement stays smooth or becomes jerky.",
    diff: { ...ONLY(["Duotone", "Pixelate"]), MovePanSpeed: 30, MoveEnd: "strip", StripLayers: 2, StripRelation: "opposing" } },
  { name: "T8 Strip with echo trail", checks: "Echo trail and gaps",
    look: "Dark gaps between images, with fading echoes trailing into them. Is it smooth? Do the echoes look like a trail, or just a blur?",
    diff: { ...ONLY(["Duotone"]), MovePanSpeed: 30, MoveEnd: "strip", StripGap: 40, EchoOn: 1, EchoMode: "even", EchoBlend: "behind" } },
  { name: "T9 Everything at once", checks: "Stress test",
    look: "All effects, fast strip, two layers, ragged echoes. The hardest test. Let it run for 3 minutes: note any stutter, freeze, black screen or the browser slowing down over time.",
    diff: { MovePanSpeed: 70, MoveEnd: "strip", StripLayers: 2, StripRelation: "crossing", StripGap: 25, EchoOn: 1, EchoMode: "ragged", EchoBlend: "screen", SpeedMin: 2, SpeedMax: 4 } },
  { name: "T10 3D forms round the room", checks: "3D shapes across all walls",
    look: "Eight shapes (cubes to blobs) wearing the photos, spread round all six walls and drifting slowly round the room. Do they look round (not stretched) on every wall? Do they cross the joins cleanly? Is the movement smooth?",
    diff: { ...ONLY(["Duotone", "Halftone"]), FormsOn: 1, FormsCount: 8, FormsSpacing: 45, FormsOrganic: 0, FormsOrganicMax: 65, FormsTravel: 25, FormsSize: 60 } },
  { name: "T11 3D blobs, crowded, over the picture", checks: "3D stress test",
    look: "Sixteen wobbling blobs bunched together and overlapping, over the normal moving picture. The heaviest 3D test: watch for stutter, flicker where shapes overlap, or the picture behind slowing down. Let it run for 3 minutes.",
    diff: { MovePanSpeed: 25, MoveEnd: "strip", FormsOn: 1, FormsCount: 16, FormsSpacing: 14, FormsOrganic: 75, FormsOrganicMax: 100, FormsDepth: 70, FormsTravel: 40, FormsSize: 70, FormsBehind: "picture", SpeedMin: 3, SpeedMax: 5 } },
  { name: "T12 Glass forms over the strip", checks: "Glass lens shapes",
    look: "Six see-through shapes, cubes to blobs, sliding round the room and magnifying and bending the moving strip behind them. Does the picture inside each shape bend smoothly as it moves? Do the shapes stand out from the background? Any stutter?",
    diff: { ...ONLY(["Halftone", "Duotone"]), MovePanSpeed: 50, MoveEnd: "strip", FormsOn: 1, FormsCount: 6, FormsSpacing: 50, FormsOrganic: 20, FormsOrganicMax: 100, FormsSize: 75, FormsTravel: 25,
      FormsSurface: "glass", FormsMagnify: 45, FormsBend: 60, FormsRim: 70, FormsBehind: "picture", SpeedMin: 3, SpeedMax: 5 } },
];
