# Claude Context — Generative Photo-Remix Tool

Paste this entire file as the first message in a new session before asking for any code. It's the full spec — treat it as fixed; don't re-derive or renegotiate these decisions mid-build.

## What this is
A single web page that cycles through student photos from a public Google Drive folder, applying one random visual effect and transition per cycle. Built for a 2-hour outreach workshop with technical college students (Fri 10 July 2026) — runs unattended in the background while students do analogue paste-up/photography work, then gets a short "how this was built" reveal at the end.

## Fixed architecture — do not deviate
- No backend, no build step, no login/auth for users.
- Exactly three files: `index.html`, `app.js`, `style.css`. Nothing else unless explicitly agreed.
- Hosted on GitHub Pages.
- Image source: one public "Anyone with the link" Google Drive folder, fetched client-side via Drive API v3 `files.list`, using an API key restricted by HTTP referrer to the Pages domain. No OAuth, no consent screen.
- Local fallback: a small set of seed images bundled in the repo itself, so the app runs fully offline if Drive/wifi is unavailable. This is not optional — build it alongside the live fetch, not after.

## Image pipeline (build first, before any effect)
- Every fetched image is normalised to a fixed 1080×1920 canvas (9:16, Instagram Story size) using a cover-crop (scale to fill, crop overflow, centred — same as CSS `object-fit: cover`).
- Do this once per image on load; cache the resulting canvas/bitmap. Effects never touch the raw source image or handle variable aspect ratios.
- Cropping is not content-aware — accept that off-centre subjects on non-9:16 originals may get clipped. Don't build smart cropping.

## Effect palette — build in this order
Cut from the bottom if time runs short; 1–4 is the acceptable floor.
1. **Colour conversion** (duotone/greyscale) — param: hue / intensity
2. **Pixelation** (downscale-upscale draw) — param: cell size (px)
3. **Crossfade transition** (opacity tween between canvas layers) — param: transition speed/duration
4. **Blend modes** (multiply, screen via `globalCompositeOperation`) — param: layer opacity
5. **Halftone** (stretch goal — per-cell luminance sampling + dot draw) — param: dot/grid scale

## Random event engine
Plain JS state machine — not a generative/ML model. Three dials, each re-rolled per cycle:
- next image (random from fetched list, no immediate repeat)
- which effect (random from whichever effects are implemented)
- hold duration before next transition (randomised within a min/max range, default 4–9s)

## Parameter controls
A live control panel — simple `<input type="range">` sliders, toggle-hidden via a keypress — exposing:
- **Speed** (cycle/hold duration)
- **Opacity** (crossfade/blend layer opacity)
- **Pixelate scale** (cell size)
- **Halftone scale** (dot/grid size, if built)

These sliders narrow or override the random engine's min/max ranges live — they're a thin control layer on top of the same parameters, not a separate system. Build after the effects they control already work.

## Audio
- Default/fallback: a single pre-chosen track via `<audio autoplay loop>`. No analysis, no dependency on the visual engine.
- Stretch (only after a standalone proof of concept succeeds): Web Audio `AnalyserNode` reading amplitude/frequency from the audio element, mapped to one visual parameter (e.g. pixelation scale or blend opacity). If the POC fights you, stop and keep the static track — don't let this delay the core engine.

## Non-goals
- No user accounts, no login, no server-side code
- No generative/ML-based image effects — canvas/CSS techniques only
- No content-aware/smart cropping
- No redesign of the file/architecture structure above mid-build

## MVP bar (what "done" means)
Live Drive fetch + offline seed-image fallback, images normalised to 1080×1920, effects 1–4 working, crossfade, parameter controls for speed/opacity/pixelate scale, static fallback audio track.
Stretch: halftone + its scale control, working audio-reactivity in place of the static track.

## Version control — fixed process, don't renegotiate
- Repo: `https://github.com/PkWr/square-dot-ascii` (already initialised, first commit pushed).
- `.gitignore` excludes `.DS_Store` and `*.mp4` — the Instagram recording exports are large (100–150MB) and GitHub hard-rejects anything over 100MB without Git LFS, so they stay local-only.
- Claude's sandbox cannot run `git` here — the sandbox blocks deleting/renaming any file (even its own temp files), which breaks git's lockfile mechanism for every operation, not just init. This is a fixed platform constraint, not a bug to keep re-diagnosing.
- Division of labour: Claude edits files directly in this folder as usual (Read/Write/Edit tools work fine — only delete/rename is blocked). The user commits and pushes locally, where git is unrestricted.
- Helper script `push-to-github.sh` (in this folder) does `git add -A && git commit -m "<msg>" && git push` in one step. Usage: `./push-to-github.sh "commit message"`.
- After any meaningful code change, Claude should propose a concise, accurate commit message describing what changed and remind the user to run the script — rather than attempting `git` commands itself.

## Reference
Full rationale, schedule, and risk notes: `Generative-Photo-Remix-Roadmap.md` (same folder).
