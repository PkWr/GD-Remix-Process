# Generative Photo-Remix Tool — Build Roadmap
Outreach workshop: Friday 10 July 2026 · 6 build days from today (Sat 4 July)

## Concept, one sentence
A single web page cycles through student photos pulled from a public Google Drive folder, applying one random visual effect and transition per cycle, so the wall display keeps evolving on its own during the session.

## Where it sits in the 2 hours
Almost all the session stays analogue: paste-up composition, phone photography. The tool is a 10–15 minute bookend — projected while students work, then a short "here's how AI helped build this" reveal at the end. It should never be the thing they're waiting on; it runs in the background regardless of how many photos have landed in the folder.

## Architecture (keep this fixed — don't redesign mid-week)
- **Source**: one public "Anyone with the link" Google Drive folder. Fetch the file list client-side with the Drive API v3 `files.list`, using a restricted API key (HTTP-referrer-locked to your GitHub Pages domain) — no OAuth, no login screen.
- **Image pipeline**: every fetched image is normalised to a fixed Instagram Story canvas (1080×1920, 9:16) before it ever reaches an effect — see below. Effects and transitions only ever operate on that fixed size, so nothing has to handle mixed aspect ratios or resolutions downstream.
- **Display**: single HTML page, `<canvas>` driven, hosted on GitHub Pages.
- **Engine**: a plain JS loop (`requestAnimationFrame` + a timer) that: picks the next image, picks a random effect from the palette below, picks a random transition, runs it, waits, repeats.
- **Controls layer**: a small on-screen panel (or keyboard shortcuts, see below) exposing the live parameters — separate from the random engine so you can override/tune in real time without touching code.
- **No backend, no build step.** One HTML file + one JS file + one CSS file. This keeps it debuggable on-site with just a browser and a GitHub Pages URL — important since you won't want to be compiling anything at the venue.

## Image pipeline — fixed export size
- **Target**: 1080×1920 (9:16, Instagram Story). Every image, regardless of what the student shot it as (portrait, landscape, square), gets normalised to this before display.
- **Method**: draw the source image onto an offscreen canvas at 1080×1920 using a "cover" crop (scale to fill, crop the overflow, centred) — same logic as `object-fit: cover`. Do this once per image on load, then cache the resulting canvas/bitmap so it isn't re-cropped every animation frame.
- **Why fix this early**: every effect (pixelation grid, halftone dot size, crossfade math) is easiest to tune against one known canvas size. Doing the crop/resize step first avoids re-tuning every effect later when the size changes.
- **Heads up for the paste-up brief**: if you want students framing shots with this crop in mind (e.g. keeping key content centred, since edges get cropped on square/landscape shots), it's worth a one-line mention when you explain the phone photography part of the brief.

## Effect palette — MVP set (build these, in this order)
Each effect should expose its "random dial" as a named parameter from the start — that's what the controls panel hooks into, rather than bolting parameters on after the fact.
1. **Colour conversion** — duotone/greyscale via canvas pixel manipulation or CSS filter. Easiest, do first, proves the pipeline works. *Parameter: duotone hue / intensity.*
2. **Pixelation** — downscale-then-upscale draw calls on canvas. Second easiest. *Parameter: cell size (px).*
3. **Crossfade transitions** — opacity tween between two canvas layers. This is what makes it feel "sequential" rather than a slideshow. *Parameter: transition speed / duration.*
4. **Blend modes** (multiply, screen) — `globalCompositeOperation` between the incoming and outgoing image. Cheap once crossfade exists. *Parameter: layer opacity.*
5. **Halftone** — hardest of the five (requires per-cell luminance sampling and dot drawing). Do last; cut it first if time runs short. *Parameter: dot/grid scale.*

Treat 1–4 as the demo-day floor. Halftone is the first thing to drop if the week gets squeezed.

## Random event engine
Keep the "randomness" to three dials so it's easy to reason about and tune live:
- which image comes next (random from the fetched list, avoid immediate repeats)
- which effect is applied (random from whichever effects are implemented)
- how long the current cycle holds before the next transition (randomised within a min/max range, e.g. 4–9s)

This is deliberately a shallow state machine, not a generative/AI model — the "AI" story for the students is in how you *used* AI to build the tool fast, not that the tool itself is AI-driven. Worth being upfront about that distinction when you present it.

## Parameter controls
A simple control layer sits alongside the random engine so parameters can be tuned live rather than hardcoded:
- **Speed** — cycle duration (how long each image/effect holds before the next random transition).
- **Opacity** — crossfade/blend layer opacity.
- **Pixelate scale** — cell size for the pixelation effect.
- **Halftone scale** — dot/grid size for halftone (if built).

Simplest build: a handful of `<input type="range">` sliders in a small fixed panel (toggle visible/hidden with a key press, so it's out of the way during the display but reachable when presenting). This is a thin layer over the same parameters the random engine already randomises within — the random engine picks a value inside a min/max range each cycle; the sliders just let you narrow or override that range live. Build this after the effects that need it exist (i.e., after effects 1–4), so there's something for the sliders to control.

## Audio-reactive element — proof of concept first
Per your call: don't commit build time until it's proven feasible.
- **POC (timebox: 1–2 hours, do this Sunday or Monday)**: a standalone throwaway HTML page — a single `<audio>` element feeding a Web Audio `AnalyserNode`, driving one visual parameter (e.g. pixelation cell size, or blend opacity) off the amplitude/frequency data. Nothing else. If you can get amplitude visibly moving a canvas parameter in under 2 hours, it's viable.
- **Go/no-go**: if the POC works cleanly by Monday evening, fold it into the main engine as one more "effect dial" later in the week. If it's fighting you, stop and move to fallback — don't let this eat time from the core visual engine.
- **Fallback**: a single pre-selected music track on loop via `<audio autoplay loop>`. No analysis, no dependency on the visual engine. Decide the track now so it's not a Thursday-night task.

## Build schedule
- **Sat 4 Jul** — repo + GitHub Pages skeleton live (even just "hello world" canvas). Drive API key created and restricted. Confirm `files.list` returns your test images with no auth prompt. Image pipeline (cover-crop to 1080×1920) built and tested against a portrait, landscape, and square test photo.
- **Sun 5 Jul** — effects 1–2 (colour conversion, pixelation) working on the normalised 1080×1920 canvas. Audio POC (timeboxed, see above) same day if energy allows.
- **Mon 6 Jul** — crossfade transitions + blend modes (effects 3–4). Audio go/no-go decision made.
- **Tue 7 Jul** — wire the random event engine end-to-end against the live Drive folder with real test photos. Add the parameter control panel (speed, opacity, pixelate/halftone scale) over the now-working effects. Halftone only if ahead of schedule.
- **Wed 8 Jul** — full dry run at expected venue conditions: same wifi (or hotspot fallback), same projector/aspect ratio, upload a photo mid-run to confirm the app picks it up without a refresh. Sanity-check the crop on a real mixed batch of student-style photos (portrait phone shots, screenshots, etc.).
- **Thu 9 Jul** — buffer day. Fix whatever the dry run exposed. No new features.
- **Fri 10 Jul** — workshop day. Arrive early enough to test the projector + wifi combo once more before students arrive.

## Using AI efficiently while building this
- Write the spec above into your first prompt in full, rather than discovering requirements turn by turn — front-loading context here is what avoids expensive back-and-forth.
- Build and verify one effect at a time; ask for one function/file section per request rather than "regenerate the whole app," so each exchange is small and each result is easy to check against a working baseline.
- Test locally in the browser yourself before the next prompt — cheaper and faster than describing a bug back to the AI blind.
- Keep the three files small and separated (index.html / app.js / style.css) so any single AI edit touches only one concern at a time.

## Risks & fallbacks
- **Venue wifi drops or Drive API is flaky live**: pre-download a folder of "seed" images into the GitHub repo itself as a hardcoded local fallback set, so the demo runs even with zero network — the live-upload feature becomes a bonus layer on top, not a dependency.
- **Live student uploads cause chaos or slow folder growth**: have Patrick (or one designated student) collect and upload photos in short batches rather than 20 phones uploading simultaneously.
- **Drive API key restrictions misconfigured**: test the exact GitHub Pages URL (not localhost) against the live key by Sat/Sun — referrer restrictions behave differently from local testing.
- **Halftone or audio-reactivity not done in time**: both are explicitly cuttable. The floor (colour conversion + pixelation + crossfade + blend modes + static music) is a complete, presentable tool on its own.
- **Cover-crop cuts off important content on some student photos**: cover-crop (fill + crop) is simpler and more reliable under time pressure than "fit" (letterbox/pad), but it will clip edges on non-9:16 shots. Mention the framing note in the photography brief (see Image Pipeline above) rather than trying to build smart/content-aware cropping.

## Definition of done
- **MVP (must have by Wed dry run)**: live Drive fetch, images normalised to 1080×1920, 3–4 effects, crossfade, parameter controls for speed/opacity/pixelate scale, static fallback music, works with zero network via local seed images.
- **Stretch**: halftone effect (+ its scale control), working audio-reactivity in place of the static track.
