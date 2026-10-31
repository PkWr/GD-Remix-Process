# tools/

Small scripts that generate some of Spot's files. Not loaded by the site; run them on your Mac
from the repo root (`~/Sites/spot`) when you change their inputs, then push as usual.

| Script | Edit | Run | Writes |
|---|---|---|---|
| `reel/build.js` | `reel/looks.js` (titles, settings, seconds per look) | `node tools/reel/build.js` | `showreel.json` |
| `igloo/build.js` | `igloo/tests.js` (tests, checks, settings) and `igloo/page.html` (page text and layout) | `node tools/igloo/build.js` (add `--scenes` to also overwrite `scenes.json` with the tests) | `igloo-tests.html` |

Both `build.js` scripts check every setting name and value against `settings.js` first, so a
typo or a renamed setting stops the build rather than producing a broken look.

Needs Node 18+ and Python 3. Checked 29 Oct 2026: all three reproduce the committed files exactly.

## Version number

The start-screen version (index.html, `#spotVersion`) is set from the newest `<h2>vX.Y` at the top of `changelog.html` by `stamp-version.sh` on every commit. To release a new version, add its section to the changelog; do not edit index.html by hand. The hook lives in `.git/hooks/pre-commit` (not in the repo) and runs `tools/stamp-version.sh`, then `git add version.js index.html`.
