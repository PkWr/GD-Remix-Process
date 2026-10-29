# tools/

Small scripts that generate some of Spot's files. Not loaded by the site; run them on your Mac
from the repo root (`~/Sites/spot`) when you change their inputs, then push as usual.

| Script | Edit | Run | Writes |
|---|---|---|---|
| `reel/build.js` | `reel/looks.js` (titles, settings, seconds per look) | `node tools/reel/build.js` | `showreel.json` |
| `igloo/build.js` | `igloo/tests.js` (tests, checks, settings) and `igloo/page.html` (page text and layout) | `node tools/igloo/build.js` (add `--scenes` to also overwrite `scenes.json` with the tests) | `igloo-tests.html` |
| `fonts/convert-fonts.py` | the font list at the bottom of the script | `python3 tools/fonts/convert-fonts.py` (needs `pip install fonttools skia-pathops`, and the TTFs in `tools/fonts/ttf/`, see the script) | `vendor/fonts/typeface/*.typeface.json` |

Both `build.js` scripts check every setting name and value against `settings.js` first, so a
typo or a renamed setting stops the build rather than producing a broken look.

Needs Node 18+ and Python 3. Checked 29 Oct 2026: all three reproduce the committed files exactly.
