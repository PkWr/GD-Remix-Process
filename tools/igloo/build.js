// Builds igloo-tests.html (the staff test page) from tests.js + page.html.
// Usage, from the repo root:  node tools/igloo/build.js           (writes igloo-tests.html)
//                             node tools/igloo/build.js --scenes  (also overwrites scenes.json with the tests)
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
global.window = {}; global.document = { getElementById: () => null };
eval(fs.readFileSync(path.join(ROOT, "settings.js"), "utf8"));
const { SETTINGS, byId } = window.PhotoRemixSettings;
const BOOL = ["switch", "chip", "palette-on", "hidden"];
const tests = require("./tests.js");
const scenes = tests.map((t) => {
  for (const k of Object.keys(t.diff)) if (!byId[`ctrl${k}`]) throw new Error(`${t.name}: unknown setting ${k}`);
  const values = {};
  for (const s of SETTINGS) {
    const k = s.id.replace(/^ctrl/, "");
    const v = k in t.diff ? t.diff[k] : s.default;
    if (BOOL.includes(s.type)) values[s.id] = { checked: !!v };
    else {
      if (s.type === "select" && !s.options.some(([o]) => o === v)) throw new Error(`${t.name}: bad option ${k}=${v}`);
      values[s.id] = { value: String(v) };
    }
  }
  const code = "j" + Buffer.from(JSON.stringify({ n: t.name, v: t.diff })).toString("base64url");
  return { ...t, values, code };
});
const page = fs.readFileSync(path.join(__dirname, "page.html"), "utf8");
const json = JSON.stringify(scenes.map(({ name, checks, look, code }) => ({ name, checks, look, code })));
if (!page.includes("/*__TESTS__*/[]")) throw new Error("page.html is missing the /*__TESTS__*/[] marker");
fs.writeFileSync(path.join(ROOT, "igloo-tests.html"), page.replace("/*__TESTS__*/[]", json));
if (process.argv.includes("--scenes")) {
  fs.writeFileSync(path.join(ROOT, "scenes.json"), JSON.stringify({ version: 1, exportedAt: new Date().toISOString(),
    scenes: scenes.map(({ name, values }) => ({ name, savedAt: Date.now(), values })) }, null, 2));
  console.log("scenes.json updated");
}
console.log(`igloo-tests.html: ${scenes.length} tests`);
