// Builds showreel.json (the looks for index.html?reel) from looks.js, checking every
// setting against settings.js first. Usage, from the repo root:  node tools/reel/build.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
global.window = {}; global.document = { getElementById: () => null };
eval(fs.readFileSync(path.join(ROOT, "settings.js"), "utf8"));
const { byId } = window.PhotoRemixSettings;
const reel = require("./looks.js");
for (const l of reel.looks) for (const [k, v] of Object.entries(l.settings)) {
  const s = byId[`ctrl${k}`];
  if (!s) throw new Error(`${l.title}: unknown setting ${k}`);
  if (s.type === "select" && !s.options.some(([o]) => o === v)) throw new Error(`${l.title}: bad ${k}=${v}`);
  if (s.type === "range" && (v < s.min || v > s.max)) throw new Error(`${l.title}: ${k}=${v} out of range`);
}
fs.writeFileSync(path.join(ROOT, "showreel.json"), JSON.stringify({ about: "Showreel for index.html?reel — each look applies these settings (differences from the defaults) for 'seconds'.", ...reel }, null, 2));
console.log(`showreel.json: ${reel.looks.length} looks, ${reel.looks.length * reel.seconds}s per loop`);
